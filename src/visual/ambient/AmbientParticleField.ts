import * as THREE from 'three';
import type { ChoreographyFrame } from '../choreography/ChoreographyController';
import type { SharedMotionFrame } from '../motion/SharedMotionField';
import { VISUAL_THEME } from '../theme';
import type { ResultLayer } from '../results/ResultLayer';
import type { RhythmFrame } from '../../audio/RhythmDirector';

const KIND_DUST = 0;
const KIND_CLOUD_A = 1;
const KIND_CLOUD_B = 2;
const KIND_RELATION = 3;

const vertexShader = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uViewportHeight;
  uniform float uIdleAmount;
  uniform float uGatherAmount;
  uniform float uTension;
  uniform float uScenePresence;
  uniform float uSlowBreath;
  uniform float uSecondaryBreath;
  uniform float uTravelingWave;
  uniform float uTurbulence;
  uniform float uContactPulse;
  uniform float uDriftSpeed;
  uniform float uRelationReach;
  uniform vec3 uAnchorA;
  uniform vec3 uAnchorB;
  uniform float uResultGather;
  uniform float uResultVoid;
  uniform float uRhythmPulse;
  uniform float uRhythmFlow;

  attribute vec3 aCoreColor;
  attribute vec3 aEdgeColor;
  attribute float aKind;
  attribute float aSeed;
  attribute float aPathT;
  attribute float aStretch;
  attribute float aGroup;
  attribute float aSize;
  attribute float aOpacity;

  varying vec3 vCoreColor;
  varying vec3 vEdgeColor;
  varying float vOpacity;
  varying float vStyle;

  void main() {
    float isDust = 1.0 - step(0.5, aKind);
    float isCloudA = step(0.5, aKind) * (1.0 - step(1.5, aKind));
    float isCloudB = step(1.5, aKind) * (1.0 - step(2.5, aKind));
    float isRelation = step(2.5, aKind);

    vec3 worldPosition = position;
    float slowTime = uTime * uDriftSpeed * (1.0 + uRhythmFlow * 0.32);

    if (isDust > 0.5) {
      float foreground = step(0.5, aGroup);
      float farLayer = 1.0 - step(-0.5, aGroup);
      float depthResponse = 1.0 / (1.0 + abs(position.z) * 0.34);
      worldPosition.x += sin(slowTime * (0.72 + aSeed * 0.006) + aSeed * 2.1)
        * 0.14 * depthResponse;
      worldPosition.y += sin(slowTime * (0.51 + aSeed * 0.004) + aSeed * 1.37)
        * 0.085;
      worldPosition.z += cos(slowTime * 0.43 + aSeed * 2.83) * 0.09;
      worldPosition.x += uTravelingWave * 0.045 / (1.0 + abs(position.z));
      worldPosition.y += uSlowBreath * (0.018 + fract(aSeed) * 0.018);
      worldPosition.z += uTurbulence * 0.018;
      worldPosition.x += foreground * sin(slowTime * 0.29 + aSeed) * 0.42;
      worldPosition.y += foreground * cos(slowTime * 0.23 + aSeed * 0.7) * 0.12;
      worldPosition.y += farLayer * uSlowBreath * 0.008;
      vec3 dustFocus = mix(uAnchorA, uAnchorB, 0.5) + vec3(
        sin(aSeed * 1.37 + slowTime * 0.4) * 0.5,
        cos(aSeed * 0.91 + slowTime * 0.31) * 0.34,
        sin(aSeed * 2.03 + slowTime * 0.23) * 0.42
      );
      worldPosition = mix(worldPosition, dustFocus, uGatherAmount * aStretch * 0.74);
    }

    if (isCloudA + isCloudB > 0.5) {
      float handMix = isCloudB;
      vec3 anchor = mix(uAnchorA, uAnchorB, handMix);
      vec3 otherAnchor = mix(uAnchorB, uAnchorA, handMix);
      float direction = mix(1.0, -1.0, handMix);
      float angle = direction * slowTime * (0.32 + aSeed * 0.0018)
        + sin(slowTime * 0.29 + aSeed) * 0.08;
      mat2 rotation = mat2(cos(angle), -sin(angle), sin(angle), cos(angle));
      vec3 localOffset = position;
      localOffset.xy = rotation * localOffset.xy;
      float breath = 0.96 + uSlowBreath * 0.045
        + sin(slowTime * 0.61 + aSeed * 1.7) * 0.032;
      localOffset *= breath;
      localOffset.z += sin(slowTime * 0.47 + aSeed * 2.4) * 0.035;

      float awarenessSignal = 0.5
        + sin(uTime * 0.031 + aSeed * 0.73) * 0.29
        + sin(uTime * 0.013 + aSeed * 1.91) * 0.21;
      float awareness = smoothstep(0.68, 0.92, awarenessSignal) * aStretch;
      awareness = min(1.0, awareness + uGatherAmount * aStretch * 0.72);
      localOffset += (otherAnchor - anchor) * awareness * uRelationReach;
      worldPosition = anchor + localOffset;
    }

    float relationLife = 0.0;
    if (isRelation > 0.5) {
      float groupPhase = aGroup * 1.73;
      float irregularSignal = 0.54
        + sin(uTime * (0.023 + aGroup * 0.0017) + groupPhase) * 0.3
        + sin(uTime * 0.0097 + groupPhase * 2.37) * 0.17;
      float idleLife = smoothstep(0.57, 0.83, irregularSignal) * uIdleAmount;
      float gatheringLife = uGatherAmount
        * (0.46 + sin(uTime * 0.071 + groupPhase * 1.91) * 0.18);
      relationLife = max(idleLife, gatheringLife);

      vec3 midpoint = mix(uAnchorA, uAnchorB, 0.5);
      vec3 control = midpoint + vec3(
        sin(groupPhase * 1.3 + uTime * 0.006) * 0.14 + uTravelingWave * 0.05,
        (0.24 + aGroup * 0.055) * sin(groupPhase + 0.9) + uSlowBreath * 0.04,
        cos(groupPhase * 1.61 + uTime * 0.004) * 0.31 + uSecondaryBreath * 0.035
      );
      float inverseT = 1.0 - aPathT;
      vec3 curvePoint = inverseT * inverseT * uAnchorA
        + 2.0 * inverseT * aPathT * control
        + aPathT * aPathT * uAnchorB;
      float segmentMask = step(0.34, fract(aPathT * 4.2 + aGroup * 0.27));
      relationLife *= segmentMask;

      vec3 dispersed = midpoint + position;
      dispersed.x += sin(slowTime * 0.27 + aSeed) * 0.11;
      dispersed.y += cos(slowTime * 0.31 + aSeed * 1.7) * 0.09;
      worldPosition = mix(dispersed, curvePoint, relationLife);
      vec3 pulseDirection = normalize(worldPosition - midpoint + vec3(0.0001));
      worldPosition += pulseDirection * uContactPulse * (0.035 + aPathT * 0.06);
    }

    vec3 resultCenter = mix(uAnchorA, uAnchorB, 0.5);
    worldPosition = mix(worldPosition, resultCenter, uResultGather * (0.08 + aStretch * 0.16));
    vec4 viewPosition = modelViewMatrix * vec4(worldPosition, 1.0);
    float stateOpacity = isDust * min(1.0, mix(0.48, 1.0, uIdleAmount) + uGatherAmount * 0.18)
      + (isCloudA + isCloudB) * min(1.0, mix(0.22, 1.0, uIdleAmount) + uGatherAmount * 0.42)
      + isRelation * relationLife;
    float depthFade = 1.0 - smoothstep(7.5, 11.5, -viewPosition.z);
    float dustDepthOpacity = mix(1.0, 0.34, step(0.5, aGroup))
      * mix(1.0, 0.48, 1.0 - step(-0.5, aGroup));
    float stylePick = fract(sin(aSeed * 12.9898) * 43758.5453);
    vStyle = step(0.88, stylePick) + step(0.985, stylePick);
    float twinkle = 0.84
      + sin(uTime * (0.055 + fract(aSeed) * 0.025) + aSeed) * 0.035
      + uSecondaryBreath * 0.018;
    float voidMask = 1.0 - uResultVoid * exp(-length(worldPosition.xy - resultCenter.xy) * 2.3) * 0.86;
    vOpacity = aOpacity * stateOpacity * depthFade * uScenePresence * twinkle * voidMask
      * mix(1.0, dustDepthOpacity, isDust)
      * (1.0 + isRelation * uTension * 0.24 + uRhythmPulse * (0.025 + isRelation * 0.09));
    vCoreColor = aCoreColor;
    vEdgeColor = aEdgeColor;

    gl_PointSize = min(
      4.0,
      aSize * (0.62 + isRelation * uTension * 0.12 + vStyle * 0.28)
        * uViewportHeight / max(1.0, -viewPosition.z)
    );
    gl_Position = projectionMatrix * viewPosition;
  }
`;

const fragmentShader = /* glsl */ `
  precision highp float;

  varying vec3 vCoreColor;
  varying vec3 vEdgeColor;
  varying float vOpacity;
  varying float vStyle;

  void main() {
    float radius = length(gl_PointCoord - vec2(0.5)) * 2.0;
    if (radius > 1.0) discard;

    float brightCore = 1.0 - smoothstep(0.0, 0.1, radius);
    float softBody = 1.0 - smoothstep(0.08, 0.68, radius);
    vec2 centered = gl_PointCoord - vec2(0.5);
    float horizontalRay = exp(-abs(centered.y) * 86.0)
      * (1.0 - smoothstep(0.12, 0.5, abs(centered.x)));
    float verticalRay = exp(-abs(centered.x) * 86.0)
      * (1.0 - smoothstep(0.12, 0.5, abs(centered.y)));
    float rays = (horizontalRay + verticalRay) * step(1.5, vStyle);
    float alpha = (brightCore * 0.54 + softBody * 0.18 + rays * 0.12) * vOpacity;
    vec3 color = mix(vEdgeColor, vCoreColor, 0.22 + brightCore * 0.78)
      * (0.78 + brightCore * 0.18 + rays * 0.2);
    gl_FragColor = vec4(color, alpha);
  }
`;

export class AmbientParticleField {
  readonly object3d: THREE.Points;
  readonly particleCount =
    VISUAL_THEME.ambient.dustCount +
    VISUAL_THEME.ambient.coreParticlesPerParticipant * 2 +
    VISUAL_THEME.ambient.relationPathCount;
  private readonly geometry = new THREE.BufferGeometry();
  private readonly material: THREE.ShaderMaterial;
  private readonly laggedAnchorA = new THREE.Vector3();
  private readonly laggedAnchorB = new THREE.Vector3();
  private anchorsInitialized = false;

  constructor() {
    const positions: number[] = [];
    const coreColors: number[] = [];
    const edgeColors: number[] = [];
    const kinds: number[] = [];
    const seeds: number[] = [];
    const pathValues: number[] = [];
    const stretchValues: number[] = [];
    const groups: number[] = [];
    const sizes: number[] = [];
    const opacities: number[] = [];
    const random = createSeededRandom(0xa8f17);

    this.appendDust(
      random,
      positions,
      coreColors,
      edgeColors,
      kinds,
      seeds,
      pathValues,
      stretchValues,
      groups,
      sizes,
      opacities,
    );
    this.appendCoreCloud(
      KIND_CLOUD_A,
      random,
      positions,
      coreColors,
      edgeColors,
      kinds,
      seeds,
      pathValues,
      stretchValues,
      groups,
      sizes,
      opacities,
    );
    this.appendCoreCloud(
      KIND_CLOUD_B,
      random,
      positions,
      coreColors,
      edgeColors,
      kinds,
      seeds,
      pathValues,
      stretchValues,
      groups,
      sizes,
      opacities,
    );
    this.appendRelations(
      random,
      positions,
      coreColors,
      edgeColors,
      kinds,
      seeds,
      pathValues,
      stretchValues,
      groups,
      sizes,
      opacities,
    );

    this.geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    this.geometry.setAttribute('aCoreColor', new THREE.Float32BufferAttribute(coreColors, 3));
    this.geometry.setAttribute('aEdgeColor', new THREE.Float32BufferAttribute(edgeColors, 3));
    this.geometry.setAttribute('aKind', new THREE.Float32BufferAttribute(kinds, 1));
    this.geometry.setAttribute('aSeed', new THREE.Float32BufferAttribute(seeds, 1));
    this.geometry.setAttribute('aPathT', new THREE.Float32BufferAttribute(pathValues, 1));
    this.geometry.setAttribute('aStretch', new THREE.Float32BufferAttribute(stretchValues, 1));
    this.geometry.setAttribute('aGroup', new THREE.Float32BufferAttribute(groups, 1));
    this.geometry.setAttribute('aSize', new THREE.Float32BufferAttribute(sizes, 1));
    this.geometry.setAttribute('aOpacity', new THREE.Float32BufferAttribute(opacities, 1));

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uViewportHeight: { value: 1080 },
        uIdleAmount: { value: 1 },
        uGatherAmount: { value: 0 },
        uTension: { value: 0 },
        uScenePresence: { value: 1 },
        uSlowBreath: { value: 0 },
        uSecondaryBreath: { value: 0 },
        uTravelingWave: { value: 0 },
        uTurbulence: { value: 0 },
        uContactPulse: { value: 0 },
        uDriftSpeed: { value: VISUAL_THEME.ambient.driftSpeed },
        uRelationReach: { value: VISUAL_THEME.ambient.relationReach },
        uAnchorA: { value: this.laggedAnchorA },
        uAnchorB: { value: this.laggedAnchorB },
        uResultGather: { value: 0 }, uResultVoid: { value: 0 },
        uRhythmPulse: { value: 0 }, uRhythmFlow: { value: 0 },
      },
      vertexShader,
      fragmentShader,
      transparent: true,
      depthTest: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });

    this.object3d = new THREE.Points(this.geometry, this.material);
    this.object3d.name = 'AmbientParticleField';
    this.object3d.frustumCulled = false;
    this.object3d.renderOrder = 1;
  }

  update(
    deltaSeconds: number,
    sharedMotion: SharedMotionFrame,
    choreography: ChoreographyFrame,
    result: ResultLayer,
    rhythm: RhythmFrame,
  ): void {
    if (!this.anchorsInitialized) {
      this.laggedAnchorA.copy(sharedMotion.coreA);
      this.laggedAnchorB.copy(sharedMotion.coreB);
      this.anchorsInitialized = true;
    }

    const anchorBlend = 1 - Math.exp(-VISUAL_THEME.ambient.anchorLagSpeed * deltaSeconds);
    this.laggedAnchorA.lerp(sharedMotion.coreA, anchorBlend);
    this.laggedAnchorB.lerp(sharedMotion.coreB, anchorBlend);
    this.material.uniforms.uTime.value = sharedMotion.globalTime;
    this.material.uniforms.uIdleAmount.value = choreography.idleAmbient;
    this.material.uniforms.uGatherAmount.value = choreography.interstitialGather;
    this.material.uniforms.uTension.value = choreography.tension;
    this.material.uniforms.uScenePresence.value = choreography.scenePresence;
    this.material.uniforms.uSlowBreath.value = sharedMotion.slowBreath;
    this.material.uniforms.uSecondaryBreath.value = sharedMotion.secondaryBreath;
    this.material.uniforms.uTravelingWave.value = sharedMotion.travelingWave;
    this.material.uniforms.uTurbulence.value = sharedMotion.turbulence;
    this.material.uniforms.uContactPulse.value = sharedMotion.contactPulse;
    this.material.uniforms.uResultGather.value = result.ambientGather;
    this.material.uniforms.uResultVoid.value = result.ambientVoid;
    this.material.uniforms.uRhythmPulse.value = rhythm.pulse;
    this.material.uniforms.uRhythmFlow.value = rhythm.particleFlow;
  }

  setViewportHeight(viewportHeight: number): void {
    this.material.uniforms.uViewportHeight.value = viewportHeight;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }

  private appendDust(
    random: () => number,
    positions: number[],
    coreColors: number[],
    edgeColors: number[],
    kinds: number[],
    seeds: number[],
    pathValues: number[],
    stretchValues: number[],
    groups: number[],
    sizes: number[],
    opacities: number[],
  ): void {
    for (let index = 0; index < VISUAL_THEME.ambient.dustCount; index += 1) {
      const upperBand = index % 5 === 0;
      const edgeBias = index % 4 === 0;
      const xSign = random() < 0.5 ? -1 : 1;
      const x = edgeBias
        ? xSign * THREE.MathUtils.lerp(1.45, 3.35, random())
        : (random() * 2 - 1) * 3.15;
      const y = upperBand
        ? THREE.MathUtils.lerp(0.55, 1.82, random())
        : THREE.MathUtils.lerp(-1.42, 1.16, Math.pow(random(), 0.82));
      const layerRoll = random();
      const foreground = layerRoll < 0.025;
      const farLayer = !foreground && layerRoll < 0.62;
      const z = foreground
        ? THREE.MathUtils.lerp(2.35, 4.15, random())
        : farLayer
          ? THREE.MathUtils.lerp(-5.2, -1.8, random())
          : THREE.MathUtils.lerp(-1.8, 0.45, random());
      positions.push(x, y, z);
      pushPaletteColor(coreColors, VISUAL_THEME.ambient.dustCoreColors, random);
      pushPaletteColor(edgeColors, VISUAL_THEME.ambient.dustEdgeColors, random);
      kinds.push(KIND_DUST);
      seeds.push(index * 0.071 + random() * 13);
      pathValues.push(0);
      stretchValues.push(random() < 0.24 ? 0.35 + random() * 0.65 : 0);
      groups.push(foreground ? 1 : farLayer ? -1 : 0);
      sizes.push(VISUAL_THEME.ambient.particleSize * (
        foreground ? 1.1 + random() * 0.5 : farLayer ? 0.34 + random() * 0.38 : 0.52 + random() * 0.58
      ));
      opacities.push(VISUAL_THEME.ambient.dustOpacity * (
        foreground ? 0.12 + random() * 0.18 : farLayer ? 0.18 + random() * 0.34 : 0.32 + random() * 0.52
      ));
    }
  }

  private appendCoreCloud(
    kind: typeof KIND_CLOUD_A | typeof KIND_CLOUD_B,
    random: () => number,
    positions: number[],
    coreColors: number[],
    edgeColors: number[],
    kinds: number[],
    seeds: number[],
    pathValues: number[],
    stretchValues: number[],
    groups: number[],
    sizes: number[],
    opacities: number[],
  ): void {
    const isA = kind === KIND_CLOUD_A;
    const corePalette = isA
      ? VISUAL_THEME.ambient.aCoreColors
      : VISUAL_THEME.ambient.bCoreColors;
    const edgePalette = isA
      ? VISUAL_THEME.ambient.aEdgeColors
      : VISUAL_THEME.ambient.bEdgeColors;

    for (
      let index = 0;
      index < VISUAL_THEME.ambient.coreParticlesPerParticipant;
      index += 1
    ) {
      const radius = VISUAL_THEME.ambient.coreRadius * Math.pow(random(), 0.72);
      const theta = random() * Math.PI * 2;
      const phi = Math.acos(2 * random() - 1);
      positions.push(
        Math.sin(phi) * Math.cos(theta) * radius,
        Math.sin(phi) * Math.sin(theta) * radius * 0.72,
        Math.cos(phi) * radius * 0.88,
      );
      pushPaletteColor(coreColors, corePalette, random);
      pushPaletteColor(edgeColors, edgePalette, random);
      kinds.push(kind);
      seeds.push(index * 0.093 + random() * 17 + (isA ? 0 : 31));
      pathValues.push(0);
      stretchValues.push(random() < 0.09 ? 0.45 + random() * 0.55 : 0);
      groups.push(0);
      sizes.push(VISUAL_THEME.ambient.particleSize * (0.82 + random() * 0.86));
      opacities.push(VISUAL_THEME.ambient.coreCloudOpacity * (0.36 + random() * 0.64));
    }
  }

  private appendRelations(
    random: () => number,
    positions: number[],
    coreColors: number[],
    edgeColors: number[],
    kinds: number[],
    seeds: number[],
    pathValues: number[],
    stretchValues: number[],
    groups: number[],
    sizes: number[],
    opacities: number[],
  ): void {
    const groupCount = 4;
    for (let index = 0; index < VISUAL_THEME.ambient.relationPathCount; index += 1) {
      const group = index % groupCount;
      const withinGroup = Math.floor(index / groupCount);
      const groupLength = Math.ceil(VISUAL_THEME.ambient.relationPathCount / groupCount);
      positions.push(
        (random() * 2 - 1) * 0.52,
        (random() * 2 - 1) * 0.38,
        (random() * 2 - 1) * 0.46,
      );
      const corePalette = group % 2 === 0
        ? VISUAL_THEME.ambient.aCoreColors
        : VISUAL_THEME.ambient.bCoreColors;
      const edgePalette = group % 2 === 0
        ? VISUAL_THEME.ambient.bEdgeColors
        : VISUAL_THEME.ambient.aEdgeColors;
      pushPaletteColor(coreColors, corePalette, random);
      pushPaletteColor(edgeColors, edgePalette, random);
      kinds.push(KIND_RELATION);
      seeds.push(group * 9.7 + random() * 0.6);
      pathValues.push((withinGroup + random() * 0.42) / groupLength);
      stretchValues.push(0);
      groups.push(group);
      sizes.push(VISUAL_THEME.ambient.particleSize * (0.92 + random() * 0.72));
      opacities.push(VISUAL_THEME.ambient.relationOpacity * (0.5 + random() * 0.5));
    }
  }
}

function pushPaletteColor(
  target: number[],
  palette: readonly number[],
  random: () => number,
): void {
  const color = new THREE.Color(palette[Math.floor(random() * palette.length)]);
  target.push(color.r, color.g, color.b);
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
