import * as THREE from 'three';
import type { InstallationState, ResultId } from '../../core/types';
import type { ChoreographyFrame } from '../choreography/ChoreographyController';
import type { SharedMotionFrame } from '../motion/SharedMotionField';
import type { ResultLayer } from '../results/ResultLayer';
import { VISUAL_THEME } from '../theme';

const lineVertexShader = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform float uSlowBreath;
  uniform float uSecondaryBreath;
  uniform float uContactPulse;
  uniform float uMachineStrength;
  uniform float uFiberStrength;
  uniform vec4 uResultA;
  uniform vec2 uResultB;
  uniform vec3 uCoreA;
  uniform vec3 uCoreB;
  attribute vec3 aOrigin;
  attribute float aKind;
  attribute float aSide;
  attribute float aSeed;
  attribute float aAlong;
  attribute float aVisibility;
  varying vec3 vColor;
  varying float vOpacity;

  float hash(float value) { return fract(sin(value * 91.417) * 43758.5453); }

  void main() {
    float machine = 1.0 - step(0.5, aKind);
    float fiber = 1.0 - machine;
    float echo = step(1.5, aKind);
    float collision = uResultA.x;
    float softMerge = uResultA.y;
    float desire = uResultA.z;
    float misreading = uResultA.w;
    float refusal = uResultB.x;
    float unreadable = uResultB.y;
    float sideSign = abs(aSide) > 0.25 ? sign(aSide) : sign(position.x + 0.0001);
    float reveal = smoothstep(
      0.035 + hash(aSeed * 1.71) * 0.16,
      0.24 + hash(aSeed * 1.71) * 0.22,
      uFiberStrength
    );
    vec3 transformed = mix(aOrigin, position, machine + fiber * reveal);
    float nearCenter = 1.0 - smoothstep(0.08, 0.82, abs(transformed.x));
    float shapeCycle = 0.5 + 0.5 * sin(uTime * 0.53 + floor(aSeed * 0.37));

    if (machine > 0.5) {
      transformed.x += sin(transformed.y * 2.1 + uTime * 0.11 + aSeed)
        * (0.004 + uSlowBreath * 0.002);
      transformed.y += sin(transformed.x * 5.2 - uTime * 0.085 + aSeed)
        * 0.004;
      transformed.x *= 1.0 - collision * 0.11
        * (1.0 - smoothstep(0.05, 1.18, abs(transformed.y + 0.46)));
      transformed.x += sin(transformed.y * 3.4 + uTime * 0.38)
        * desire * 0.035;
      transformed.x += sin(transformed.y * 4.6 - uTime * 0.55 + aSeed)
        * misreading * 0.018;
    } else {
      // The weave is authored around the same stable hand/core anchors. Keep
      // it in that shared frame: interpolating against transient core uniforms
      // can momentarily inject an invalid vertex during result hand-off.
      transformed.y += sin(uTime * 0.17 + aSeed + aAlong * 5.3)
        * (0.012 + uSlowBreath * 0.004);
      transformed.z += cos(uTime * 0.13 + aSeed * 1.7 + aAlong * 4.1) * 0.018;
      transformed.x += sin(aAlong * 6.28318 + uTime * 0.12 + aSeed)
        * softMerge * 0.028;

      float desireTarget = sideSign * max(0.075, abs(transformed.x) * 0.58);
      transformed.x = mix(transformed.x, desireTarget, desire * nearCenter * 0.5);
      transformed.y += desire * nearCenter * sin(aSeed * 2.1 + uTime * 0.23) * 0.04;

      float gapInfluence = 1.0 - smoothstep(0.08, 0.74, abs(transformed.x));
      transformed.x += sideSign * refusal * gapInfluence * 0.38;
      transformed.z += refusal * gapInfluence * (0.08 + hash(aSeed) * 0.08);

      transformed.xy += vec2(
        sin(uTime * 0.72 - 0.23 + aSeed),
        cos(uTime * 0.57 - 0.18 + aSeed * 1.3)
      ) * misreading * echo * 0.055;

      transformed.xy += vec2(
        sin(aAlong * 8.0 + aSeed),
        cos(aAlong * 6.0 + aSeed * 1.9)
      ) * unreadable * shapeCycle * 0.045;
      transformed.x *= 1.0 - collision * nearCenter * 0.07;
      transformed.y += uContactPulse * sin(aAlong * 13.0 - uTime * 2.0 + aSeed) * 0.025;

      // Re-resolve the fiber from its immutable authored point. Some result
      // channels are intentionally dormant during preview hand-off; branching
      // keeps an inactive channel from contaminating the whole vertex while
      // preserving the same material motion once that channel becomes active.
      transformed = position;
      transformed.y += sin(uTime * 0.17 + aSeed + aAlong * 5.3)
        * (0.012 + uSlowBreath * 0.004);
      transformed.z += cos(uTime * 0.13 + aSeed * 1.7 + aAlong * 4.1) * 0.018;
      if (softMerge > 0.001) {
        transformed.x += sin(aAlong * 6.28318 + uTime * 0.12 + aSeed)
          * softMerge * 0.028;
      }
      if (desire > 0.001) {
        float safeCenter = 1.0 - smoothstep(0.08, 0.82, abs(transformed.x));
        float desireTargetSafe = sideSign * max(0.075, abs(transformed.x) * 0.58);
        transformed.x = mix(transformed.x, desireTargetSafe, desire * safeCenter * 0.5);
        transformed.y += desire * safeCenter * sin(aSeed * 2.1 + uTime * 0.23) * 0.04;
      }
      if (refusal > 0.001) {
        float safeGap = 1.0 - smoothstep(0.08, 0.74, abs(transformed.x));
        transformed.x += sideSign * refusal * safeGap * 0.38;
        transformed.z += refusal * safeGap * (0.08 + hash(aSeed) * 0.08);
      }
      if (misreading > 0.001 && echo > 0.5) {
        transformed.xy += vec2(
          sin(uTime * 0.72 - 0.23 + aSeed),
          cos(uTime * 0.57 - 0.18 + aSeed * 1.3)
        ) * misreading * 0.055;
      }
      if (unreadable > 0.001) {
        transformed.xy += vec2(
          sin(aAlong * 8.0 + aSeed),
          cos(aAlong * 6.0 + aSeed * 1.9)
        ) * unreadable * shapeCycle * 0.045;
      }
      if (collision > 0.001) {
        float collisionCenter = 1.0 - smoothstep(0.08, 0.82, abs(transformed.x));
        transformed.x *= 1.0 - collision * collisionCenter * 0.07;
      }
      if (uContactPulse > 0.001) {
        transformed.y += uContactPulse
          * sin(aAlong * 13.0 - uTime * 2.0 + aSeed) * 0.025;
      }
    }

    vec3 machineColor = mix(
      vec3(0.055, 0.095, 0.15),
      vec3(0.34, 0.54, 0.68),
      0.26 + hash(aSeed) * 0.24
    );
    vec3 fiberColor = aSide < -0.25
      ? mix(vec3(0.32, 0.4, 0.52), vec3(0.76, 0.46, 0.59), hash(aSeed))
      : mix(vec3(0.67, 0.45, 0.56), vec3(0.91, 0.72, 0.8), hash(aSeed));
    fiberColor = mix(fiberColor, vec3(0.7, 0.75, 0.78), 0.15 * (1.0 - abs(aSide)));
    fiberColor = mix(fiberColor, vec3(0.33, 0.43, 0.61), misreading * echo * 0.56);
    fiberColor = mix(fiberColor, vec3(0.52, 0.4, 0.68), misreading * (1.0 - echo) * 0.16);
    fiberColor = mix(fiberColor, vec3(0.57, 0.18, 0.27), desire * nearCenter * 0.22);
    fiberColor = mix(fiberColor, mix(vec3(0.55, 0.38, 0.2), vec3(0.2, 0.29, 0.48), step(0.0, sideSign)), refusal * 0.42);
    fiberColor = mix(fiberColor, vec3(0.47, 0.66, 0.73), unreadable * 0.32);
    machineColor = mix(machineColor, vec3(0.46, 0.64, 0.78), collision * 0.32);
    vColor = mix(fiberColor, machineColor, machine);

    float ghostPresence = mix(1.0, misreading, echo);
    float refusalGap = 1.0 - refusal
      * (1.0 - smoothstep(0.08, 0.48, abs(transformed.x))) * 0.96;
    float unreadableGate = mix(1.0, 0.28 + shapeCycle * 0.72, unreadable * fiber);
    vOpacity = aVisibility * ghostPresence * refusalGap * unreadableGate
      * mix(reveal, uMachineStrength, machine)
      * mix(1.35, 0.4, machine)
      * (0.72 + uContactPulse * 0.18 + softMerge * fiber * 0.22);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
  }
`;

const lineFragmentShader = /* glsl */ `
  precision highp float;
  uniform float uLineOpacity;
  varying vec3 vColor;
  varying float vOpacity;
  void main() {
    gl_FragColor = vec4(vColor, min(1.0, uLineOpacity * vOpacity * 1.15));
  }
`;

const pointVertexShader = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform float uViewportHeight;
  uniform float uSlowBreath;
  uniform float uMachineStrength;
  uniform float uFiberStrength;
  uniform vec4 uResultA;
  uniform vec2 uResultB;
  attribute vec3 aOrigin;
  attribute float aKind;
  attribute float aSide;
  attribute float aSeed;
  attribute float aAlong;
  attribute float aNode;
  attribute float aVisibility;
  varying vec3 vColor;
  varying float vOpacity;
  varying float vNode;

  float hash(float value) { return fract(sin(value * 91.417) * 43758.5453); }

  void main() {
    float machine = 1.0 - step(0.5, aKind);
    float echo = step(1.5, aKind);
    float collision = uResultA.x;
    float softMerge = uResultA.y;
    float desire = uResultA.z;
    float misreading = uResultA.w;
    float refusal = uResultB.x;
    float unreadable = uResultB.y;
    float sideSign = abs(aSide) > 0.25 ? sign(aSide) : sign(position.x + 0.0001);
    float reveal = smoothstep(
      0.035 + hash(aSeed * 1.71) * 0.16,
      0.24 + hash(aSeed * 1.71) * 0.22,
      uFiberStrength
    );
    vec3 transformed = mix(aOrigin, position, machine + (1.0 - machine) * reveal);
    transformed.y += sin(uTime * 0.17 + aSeed + aAlong * 5.3) * 0.014;
    transformed.z += cos(uTime * 0.13 + aSeed * 1.7) * 0.018;
    float nearCenter = 1.0 - smoothstep(0.08, 0.82, abs(transformed.x));
    float desireTarget = sideSign * max(0.075, abs(transformed.x) * 0.58);
    transformed.x = mix(transformed.x, desireTarget, desire * nearCenter * 0.5);
    transformed.x += sideSign * refusal
      * (1.0 - smoothstep(0.08, 0.74, abs(transformed.x))) * 0.38;
    transformed.xy += vec2(sin(uTime * 0.72 - 0.23 + aSeed), cos(uTime * 0.57 + aSeed))
      * misreading * echo * 0.055;
    float shapeCycle = 0.5 + 0.5 * sin(uTime * 0.53 + floor(aSeed * 0.37));
    transformed.xy += vec2(sin(aAlong * 8.0 + aSeed), cos(aAlong * 6.0 + aSeed * 1.9))
      * unreadable * shapeCycle * 0.045;
    transformed.x *= 1.0 - collision * nearCenter * 0.07;

    transformed = mix(aOrigin, position, reveal);
    transformed.y += sin(uTime * 0.17 + aSeed + aAlong * 5.3) * 0.014;
    transformed.z += cos(uTime * 0.13 + aSeed * 1.7) * 0.018;
    if (desire > 0.001) {
      float safeCenter = 1.0 - smoothstep(0.08, 0.82, abs(transformed.x));
      float desireTargetSafe = sideSign * max(0.075, abs(transformed.x) * 0.58);
      transformed.x = mix(transformed.x, desireTargetSafe, desire * safeCenter * 0.5);
    }
    if (refusal > 0.001) {
      float safeGap = 1.0 - smoothstep(0.08, 0.74, abs(transformed.x));
      transformed.x += sideSign * refusal * safeGap * 0.38;
    }
    if (misreading > 0.001 && echo > 0.5) {
      transformed.xy += vec2(sin(uTime * 0.72 - 0.23 + aSeed), cos(uTime * 0.57 + aSeed))
        * misreading * 0.055;
    }
    if (unreadable > 0.001) {
      transformed.xy += vec2(sin(aAlong * 8.0 + aSeed), cos(aAlong * 6.0 + aSeed * 1.9))
        * unreadable * shapeCycle * 0.045;
    }

    vec3 fiberColor = aSide < -0.25
      ? mix(vec3(0.32, 0.4, 0.52), vec3(0.76, 0.46, 0.59), hash(aSeed))
      : mix(vec3(0.67, 0.45, 0.56), vec3(0.91, 0.72, 0.8), hash(aSeed));
    fiberColor = mix(fiberColor, vec3(0.33, 0.43, 0.61), misreading * echo * 0.56);
    fiberColor = mix(fiberColor, vec3(0.67, 0.16, 0.23), desire * nearCenter * aNode * 0.35);
    fiberColor = mix(fiberColor, vec3(0.47, 0.66, 0.73), unreadable * 0.32);
    fiberColor = mix(fiberColor, mix(vec3(0.54, 0.39, 0.2), vec3(0.2, 0.29, 0.48), step(0.0, sideSign)), refusal * 0.4);
    vColor = fiberColor;
    vNode = aNode;
    float ghostPresence = mix(1.0, misreading, echo);
    float refusalGap = 1.0 - refusal * nearCenter * 0.94;
    vOpacity = aVisibility * reveal * ghostPresence * refusalGap
      * mix(1.0, 0.32 + shapeCycle * 0.68, unreadable)
      * (0.72 + softMerge * 0.28 + aNode * 0.24);
    vec4 viewPosition = modelViewMatrix * vec4(transformed, 1.0);
    float pointScale = mix(1.0, 1.45, aNode)
      * (1.0 + desire * nearCenter * aNode * 0.14);
    gl_PointSize = min(2.15, max(0.72, pointScale * uViewportHeight / max(1.0, -viewPosition.z) * 0.006));
    gl_Position = projectionMatrix * viewPosition;
  }
`;

const pointFragmentShader = /* glsl */ `
  precision highp float;
  uniform float uPointOpacity;
  varying vec3 vColor;
  varying float vOpacity;
  varying float vNode;
  void main() {
    float radius = length(gl_PointCoord - vec2(0.5)) * 2.0;
    if (radius > 1.0) discard;
    float core = 1.0 - smoothstep(0.04, 0.34, radius);
    float edge = 1.0 - smoothstep(0.18, 0.92, radius);
    gl_FragColor = vec4(vColor * (0.78 + core * 0.26), uPointOpacity * vOpacity * edge);
  }
`;

interface WeaveChannels {
  machine: number;
  fiber: number;
  collision: number;
  softMerge: number;
  desire: number;
  misreading: number;
  refusal: number;
  unreadable: number;
}

export class RelationshipWeaveField {
  readonly object3d = new THREE.Group();
  readonly segmentCount: number;
  readonly particleCount: number;
  private readonly lineGeometry: THREE.BufferGeometry;
  private readonly pointGeometry: THREE.BufferGeometry;
  private readonly lineMaterial: THREE.ShaderMaterial;
  private readonly pointMaterial: THREE.ShaderMaterial;
  private readonly channels: WeaveChannels = {
    machine: 0.92, fiber: 0.025, collision: 0, softMerge: 0,
    desire: 0, misreading: 0, refusal: 0, unreadable: 0,
  };
  private readonly targets: WeaveChannels = { ...this.channels };

  constructor() {
    const data = createWeaveGeometryData();
    this.segmentCount = data.linePositions.length / 6;
    this.particleCount = data.pointPositions.length / 3;
    this.lineGeometry = createGeometry(data.linePositions, data.lineOrigins, data.lineKinds,
      data.lineSides, data.lineSeeds, data.lineAlong, data.lineVisibility);
    this.pointGeometry = createGeometry(data.pointPositions, data.pointOrigins, data.pointKinds,
      data.pointSides, data.pointSeeds, data.pointAlong, data.pointVisibility, data.pointNodes);
    const sharedUniforms = createUniforms();
    this.lineMaterial = new THREE.ShaderMaterial({
      uniforms: { ...sharedUniforms, uLineOpacity: { value: VISUAL_THEME.weave.lineOpacity } },
      vertexShader: lineVertexShader,
      fragmentShader: lineFragmentShader,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.NormalBlending,
      toneMapped: false,
    });
    this.pointMaterial = new THREE.ShaderMaterial({
      uniforms: {
        ...createUniforms(),
        uViewportHeight: { value: 1080 },
        uPointOpacity: { value: VISUAL_THEME.weave.pointOpacity },
      },
      vertexShader: pointVertexShader,
      fragmentShader: pointFragmentShader,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.NormalBlending,
      toneMapped: false,
    });
    const lines = new THREE.LineSegments(this.lineGeometry, this.lineMaterial);
    lines.name = 'RelationshipWeaveLines';
    lines.frustumCulled = false;
    lines.renderOrder = 0;
    const points = new THREE.Points(this.pointGeometry, this.pointMaterial);
    points.name = 'RelationshipWeaveNodes';
    points.frustumCulled = false;
    points.renderOrder = 0;
    this.object3d.name = 'RelationshipWeaveField';
    this.object3d.add(lines, points);
  }

  update(
    deltaSeconds: number,
    shared: SharedMotionFrame,
    choreography: ChoreographyFrame,
    result: ResultLayer,
    state: InstallationState,
    resultHint: ResultId | null,
  ): void {
    this.setTargets(state, choreography, result, resultHint);
    const responseSeconds = state === 'RESET'
      ? VISUAL_THEME.weave.resetTransitionSeconds
      : VISUAL_THEME.weave.transitionSeconds;
    const blend = 1 - Math.exp(-Math.max(0, deltaSeconds) / responseSeconds);
    (Object.keys(this.channels) as (keyof WeaveChannels)[]).forEach((key) => {
      this.channels[key] += (this.targets[key] - this.channels[key]) * blend;
    });
    this.updateUniforms(this.lineMaterial.uniforms, shared);
    this.updateUniforms(this.pointMaterial.uniforms, shared);
  }

  setViewportHeight(viewportHeight: number): void {
    this.pointMaterial.uniforms.uViewportHeight.value = viewportHeight;
  }

  dispose(): void {
    this.lineGeometry.dispose();
    this.pointGeometry.dispose();
    this.lineMaterial.dispose();
    this.pointMaterial.dispose();
    this.object3d.clear();
  }

  private setTargets(
    state: InstallationState,
    choreography: ChoreographyFrame,
    result: ResultLayer,
    resultHint: ResultId | null,
  ): void {
    this.targets.collision = 0;
    this.targets.softMerge = 0;
    this.targets.desire = 0;
    this.targets.misreading = 0;
    this.targets.refusal = 0;
    this.targets.unreadable = 0;
    if (state === 'RESET') {
      this.targets.machine = 0.96;
      this.targets.fiber = 0.02;
      return;
    }
    const visualResultId = result.resultId ?? resultHint;
    if (!visualResultId) {
      this.targets.machine = state === 'IDLE' ? 0.92 : 0.86;
      this.targets.fiber = state === 'IDLE'
        ? 0.025
        : state === 'SOLO_A' || state === 'SOLO_B'
          ? 0.065
          : 0.12 + choreography.interstitialGather * 0.16;
      return;
    }
    if (visualResultId === 'collision') {
      this.targets.machine = 1;
      this.targets.fiber = 0.24;
      this.targets.collision = 1;
    } else if (visualResultId === 'soft-merge') {
      this.targets.machine = 0.66;
      this.targets.fiber = 0.84;
      this.targets.softMerge = 1;
    } else if (visualResultId === 'desire') {
      this.targets.machine = 0.62;
      this.targets.fiber = 0.78;
      this.targets.desire = 1;
    } else if (visualResultId === 'misreading') {
      this.targets.machine = 0.9;
      this.targets.fiber = 0.5;
      this.targets.misreading = 1;
    } else if (visualResultId === 'refusal') {
      this.targets.machine = 0.98;
      this.targets.fiber = 0.2;
      this.targets.refusal = 1;
    } else {
      this.targets.machine = 0.72;
      this.targets.fiber = 0.72;
      this.targets.unreadable = 1;
    }
  }

  private updateUniforms(
    uniforms: Record<string, THREE.IUniform>,
    shared: SharedMotionFrame,
  ): void {
    uniforms.uTime.value = shared.globalTime;
    uniforms.uSlowBreath.value = shared.slowBreath;
    uniforms.uSecondaryBreath.value = shared.secondaryBreath;
    uniforms.uContactPulse.value = shared.contactPulse;
    uniforms.uMachineStrength.value = this.channels.machine;
    uniforms.uFiberStrength.value = this.channels.fiber;
    uniforms.uResultA.value.set(
      this.channels.collision,
      this.channels.softMerge,
      this.channels.desire,
      this.channels.misreading,
    );
    uniforms.uResultB.value.set(this.channels.refusal, this.channels.unreadable);
    uniforms.uCoreA.value.copy(shared.coreA);
    uniforms.uCoreB.value.copy(shared.coreB);
  }
}

function createUniforms(): Record<string, THREE.IUniform> {
  return {
    uTime: { value: 0 },
    uSlowBreath: { value: 0 },
    uSecondaryBreath: { value: 0 },
    uContactPulse: { value: 0 },
    uMachineStrength: { value: 0.92 },
    uFiberStrength: { value: 0.025 },
    uResultA: { value: new THREE.Vector4() },
    uResultB: { value: new THREE.Vector2() },
    uCoreA: { value: new THREE.Vector3() },
    uCoreB: { value: new THREE.Vector3() },
  };
}

function createGeometry(
  positions: number[],
  origins: number[],
  kinds: number[],
  sides: number[],
  seeds: number[],
  along: number[],
  visibility: number[],
  nodes?: number[],
): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('aOrigin', new THREE.Float32BufferAttribute(origins, 3));
  geometry.setAttribute('aKind', new THREE.Float32BufferAttribute(kinds, 1));
  geometry.setAttribute('aSide', new THREE.Float32BufferAttribute(sides, 1));
  geometry.setAttribute('aSeed', new THREE.Float32BufferAttribute(seeds, 1));
  geometry.setAttribute('aAlong', new THREE.Float32BufferAttribute(along, 1));
  geometry.setAttribute('aVisibility', new THREE.Float32BufferAttribute(visibility, 1));
  if (nodes) geometry.setAttribute('aNode', new THREE.Float32BufferAttribute(nodes, 1));
  return geometry;
}

interface GeometryData {
  linePositions: number[]; lineOrigins: number[]; lineKinds: number[]; lineSides: number[];
  lineSeeds: number[]; lineAlong: number[]; lineVisibility: number[];
  pointPositions: number[]; pointOrigins: number[]; pointKinds: number[]; pointSides: number[];
  pointSeeds: number[]; pointAlong: number[]; pointVisibility: number[]; pointNodes: number[];
}

function createWeaveGeometryData(): GeometryData {
  const data: GeometryData = {
    linePositions: [], lineOrigins: [], lineKinds: [], lineSides: [], lineSeeds: [],
    lineAlong: [], lineVisibility: [], pointPositions: [], pointOrigins: [], pointKinds: [],
    pointSides: [], pointSeeds: [], pointAlong: [], pointVisibility: [], pointNodes: [],
  };
  const random = createSeededRandom(0x7ea9b1);
  const machineColumns = 8;
  const columnSegments = 18;
  for (let column = 0; column < machineColumns; column += 1) {
    const x = THREE.MathUtils.lerp(-1.06, 1.06, column / (machineColumns - 1));
    const z = -2.15 - (column % 3) * 0.24;
    for (let segment = 0; segment < columnSegments; segment += 1) {
      if ((segment + column * 2) % 11 === 0) continue;
      const y0 = THREE.MathUtils.lerp(-2.12, 2.12, segment / columnSegments);
      const y1 = THREE.MathUtils.lerp(-2.12, 2.12, (segment + 1) / columnSegments);
      pushLineSegment(data, new THREE.Vector3(x, y0, z), new THREE.Vector3(x, y1, z),
        new THREE.Vector3(x, y0, z), new THREE.Vector3(x, y1, z), 0, x < 0 ? -1 : 1,
        column * 2.7 + segment * 0.31, segment / columnSegments, 0.54 + random() * 0.3);
    }
  }
  const machineRows = 8;
  const rowSegments = 11;
  for (let row = 0; row < machineRows; row += 1) {
    const y = THREE.MathUtils.lerp(-1.9, 1.82, row / (machineRows - 1));
    const z = -2.5 - (row % 2) * 0.18;
    for (let segment = 0; segment < rowSegments; segment += 1) {
      if ((segment * 3 + row) % 9 < 2) continue;
      const x0 = THREE.MathUtils.lerp(-1.28, 1.28, segment / rowSegments);
      const x1 = THREE.MathUtils.lerp(-1.28, 1.28, (segment + 1) / rowSegments);
      pushLineSegment(data, new THREE.Vector3(x0, y, z), new THREE.Vector3(x1, y, z),
        new THREE.Vector3(x0, y, z), new THREE.Vector3(x1, y, z), 0, x0 < 0 ? -1 : 1,
        row * 3.1 + segment * 0.37, segment / rowSegments, 0.42 + random() * 0.32);
    }
  }

  const paths: THREE.Vector3[][] = [];
  const origins: THREE.Vector3[] = [];
  const sides: number[] = [];
  for (let pathIndex = 0; pathIndex < 12; pathIndex += 1) {
    const side = pathIndex < 5 ? -1 : pathIndex < 10 ? 1 : 0;
    const centerX = side === 0
      ? (random() - 0.5) * 0.4
      : side * (0.52 + random() * 0.38);
    const centerY = -0.95 + random() * 2.35;
    const centerZ = -1.08 - random() * 1.08;
    const pointCount = 5 + (pathIndex % 3);
    const radiusX = 0.22 + random() * 0.28;
    const radiusY = 0.18 + random() * 0.32;
    const path: THREE.Vector3[] = [];
    for (let pointIndex = 0; pointIndex < pointCount; pointIndex += 1) {
      const angle = pointIndex / pointCount * Math.PI * 2 + random() * 0.28;
      const radial = 0.74 + random() * 0.48;
      path.push(new THREE.Vector3(
        centerX + Math.cos(angle) * radiusX * radial,
        centerY + Math.sin(angle) * radiusY * radial,
        centerZ + (random() - 0.5) * 0.24,
      ));
    }
    paths.push(path);
    origins.push(new THREE.Vector3(side * 0.55, -0.46 + (random() - 0.5) * 0.18, -1.45));
    sides.push(side);
  }

  paths.forEach((path, pathIndex) => {
    const side = sides[pathIndex];
    const origin = origins[pathIndex];
    const closePath = pathIndex % 3 !== 0;
    const edgeCount = closePath ? path.length : path.length - 1;
    for (let edgeIndex = 0; edgeIndex < edgeCount; edgeIndex += 1) {
      if ((edgeIndex + pathIndex * 2) % 8 === 0) continue;
      const start = path[edgeIndex];
      const end = path[(edgeIndex + 1) % path.length];
      const seed = pathIndex * 3.17 + edgeIndex * 0.43 + random();
      const visibility = 0.48 + random() * 0.42;
      pushLineSegment(data, start, end, origin, origin, 1, side, seed,
        edgeIndex / Math.max(1, edgeCount - 1), visibility);
      if (pathIndex < 6) {
        pushLineSegment(data, start, end, origin, origin, 2, side, seed + 19.7,
          edgeIndex / Math.max(1, edgeCount - 1), visibility * 0.62);
      }
      for (let dust = 0; dust < 2; dust += 1) {
        const amount = (dust + 0.35 + random() * 0.3) / 2.3;
        const point = start.clone().lerp(end, amount);
        point.x += (random() - 0.5) * 0.025;
        point.y += (random() - 0.5) * 0.025;
        point.z += (random() - 0.5) * 0.035;
        pushPoint(data, point, origin, 1, side, seed + dust * 0.19, amount,
          visibility * (0.5 + random() * 0.38), 0);
      }
    }
    path.forEach((point, pointIndex) => {
      pushPoint(data, point, origin, 1, side, pathIndex * 2.37 + pointIndex * 0.61,
        pointIndex / Math.max(1, path.length - 1), 0.68 + random() * 0.28, 1);
      if (pathIndex < 6) {
        pushPoint(data, point, origin, 2, side, pathIndex * 2.37 + pointIndex * 0.61 + 11.2,
          pointIndex / Math.max(1, path.length - 1), 0.36 + random() * 0.2, 0.35);
      }
    });
  });
  return data;
}

function pushLineSegment(
  data: GeometryData,
  start: THREE.Vector3,
  end: THREE.Vector3,
  startOrigin: THREE.Vector3,
  endOrigin: THREE.Vector3,
  kind: number,
  side: number,
  seed: number,
  along: number,
  visibility: number,
): void {
  pushLineVertex(data, start, startOrigin, kind, side, seed, along, visibility);
  pushLineVertex(data, end, endOrigin, kind, side, seed, along + 0.08, visibility);
}

function pushLineVertex(
  data: GeometryData,
  point: THREE.Vector3,
  origin: THREE.Vector3,
  kind: number,
  side: number,
  seed: number,
  along: number,
  visibility: number,
): void {
  data.linePositions.push(point.x, point.y, point.z);
  data.lineOrigins.push(origin.x, origin.y, origin.z);
  data.lineKinds.push(kind);
  data.lineSides.push(side);
  data.lineSeeds.push(seed);
  data.lineAlong.push(along);
  data.lineVisibility.push(visibility);
}

function pushPoint(
  data: GeometryData,
  point: THREE.Vector3,
  origin: THREE.Vector3,
  kind: number,
  side: number,
  seed: number,
  along: number,
  visibility: number,
  node: number,
): void {
  data.pointPositions.push(point.x, point.y, point.z);
  data.pointOrigins.push(origin.x, origin.y, origin.z);
  data.pointKinds.push(kind);
  data.pointSides.push(side);
  data.pointSeeds.push(seed);
  data.pointAlong.push(along);
  data.pointVisibility.push(visibility);
  data.pointNodes.push(node);
}

function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
