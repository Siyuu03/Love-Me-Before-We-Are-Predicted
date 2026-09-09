import * as THREE from 'three';
import type { ChoreographyFrame } from '../choreography/ChoreographyController';
import type { SharedMotionFrame } from '../motion/SharedMotionField';
import { VISUAL_THEME } from '../theme';
import type { ResultLayer } from '../results/ResultLayer';

const vertexShader = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform float uSlowBreath;
  uniform float uContactPulse;
  uniform float uResetProgress;
  uniform float uGather;
  uniform vec3 uCoreA;
  uniform vec3 uCoreB;
  uniform vec3 uWristA;
  uniform vec3 uWristB;
  uniform vec3 uSharedCenter;
  uniform float uResultTension;
  uniform float uResultGap;
  uniform float uResultVibration;
  uniform float uWristCuff;
  attribute float aSide;
  attribute float aSeed;
  attribute float aNode;
  attribute float aVisibility;
  attribute vec3 aColor;
  varying vec3 vColor;
  varying float vOpacity;

  void main() {
    float t = position.x;
    float isA = 1.0 - step(0.5, aSide);
    float isB = step(0.5, aSide) * (1.0 - step(1.5, aSide));
    float isShared = step(1.5, aSide);
    float outward = step(0.5, fract(aSeed * 0.371));
    vec3 startA = mix(uWristA, uCoreA, 0.28 + fract(aSeed * 0.13) * 0.28);
    vec3 startB = mix(uWristB, uCoreB, 0.28 + fract(aSeed * 0.17) * 0.28);
    vec3 endA = mix(uSharedCenter + vec3(-0.18, 0.0, -0.08),
      uCoreA + vec3(-1.35, sin(aSeed) * 0.48, -0.42), outward);
    vec3 endB = mix(uSharedCenter + vec3(0.18, 0.0, 0.08),
      uCoreB + vec3(1.35, cos(aSeed) * 0.48, -0.38), outward);
    vec3 start = startA * isA + startB * isB + uWristA * isShared;
    vec3 end = endA * isA + endB * isB + uWristB * isShared;
    float sag = sin(t * 3.14159265) * (0.045 + fract(aSeed * 0.73) * 0.13)
      * (1.0 - uResultTension * 0.72);
    vec3 curve = mix(start, end, t);
    curve.y -= sag;
    curve.y += uSlowBreath * (0.008 + fract(aSeed) * 0.008)
      + sin(t * 6.28318 + uTime * 0.17 + aSeed) * 0.012;
    curve.z += sin(t * 3.14159 + aSeed) * (0.04 + fract(aSeed * 0.41) * 0.12);
    curve.z += uContactPulse * sin(t * 12.0 - uTime * 2.1 + aSeed) * 0.035;
    curve.y += sin(t * 18.0 - uTime * 2.4 + aSeed) * uResultVibration * 0.035;
    curve.x += sin(t * 3.14159) * uResultTension * mix(0.04, -0.04, isB);
    float cuffSide = step(0.5, fract(aSeed * 0.371));
    vec3 cuffCenter = mix(uWristA, uWristB, cuffSide);
    float cuffAngle = mix(-2.58, 2.58, t) + sin(aSeed) * 0.11;
    vec3 cuffCurve = cuffCenter + vec3(
      cos(cuffAngle) * 0.105,
      sin(cuffAngle) * 0.074,
      sin(cuffAngle * 0.5 + aSeed) * 0.022
    );
    curve = mix(curve, cuffCurve, isShared * uWristCuff);
    float sharedPresence = mix(0.22, 1.0, uGather);
    float sidePresence = isShared * sharedPresence + isA + isB;
    float gapMask = 1.0 - uResultGap * isShared * smoothstep(0.25, 0.5, t) * (1.0 - smoothstep(0.5, 0.75, t));
    float materialVisibility = max(aVisibility, uWristCuff * isShared * 0.7);
    vOpacity = materialVisibility * sidePresence * gapMask * (1.0 - uResetProgress * 0.82)
      * (0.55 + aNode * 0.45 + uContactPulse * 0.28 + uWristCuff * isShared * 0.34);
    vColor = aColor;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(curve, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  precision highp float;
  uniform float uBaseOpacity;
  uniform float uContactOpacity;
  uniform float uContactPulse;
  varying vec3 vColor;
  varying float vOpacity;
  void main() {
    float alpha = mix(uBaseOpacity, uContactOpacity, uContactPulse) * vOpacity;
    gl_FragColor = vec4(vColor * (0.52 + uContactPulse * 0.12), alpha);
  }
`;

export class StructuralFilamentField {
  readonly object3d: THREE.LineSegments;
  readonly filamentCount = VISUAL_THEME.filaments.count;
  readonly segmentCount = this.filamentCount * VISUAL_THEME.filaments.segmentsPerFilament;
  private readonly geometry = new THREE.BufferGeometry();
  private readonly material: THREE.ShaderMaterial;

  constructor() {
    const vertexCount = this.segmentCount * 2;
    const positions = new Float32Array(vertexCount * 3);
    const sides = new Float32Array(vertexCount);
    const seeds = new Float32Array(vertexCount);
    const nodes = new Float32Array(vertexCount);
    const visibility = new Float32Array(vertexCount);
    const colors = new Float32Array(vertexCount * 3);
    const random = createSeededRandom(0xf11a46);
    let vertex = 0;
    for (let filament = 0; filament < this.filamentCount; filament += 1) {
      const side = filament < 13 ? 0 : filament < 26 ? 1 : 2;
      const seed = random() * 47 + filament * 1.731;
      const palette = side === 0 ? VISUAL_THEME.filaments.colorsA
        : side === 1 ? VISUAL_THEME.filaments.colorsB : VISUAL_THEME.filaments.sharedColors;
      const color = new THREE.Color(palette[Math.floor(random() * palette.length)]);
      const nodeAt = 0.2 + random() * 0.6;
      for (let segment = 0; segment < VISUAL_THEME.filaments.segmentsPerFilament; segment += 1) {
        const t0 = segment / VISUAL_THEME.filaments.segmentsPerFilament;
        const t1 = (segment + 1) / VISUAL_THEME.filaments.segmentsPerFilament;
        const visible = random() < (side === 2 ? 0.3 : 0.2) ? 0 : 0.48 + random() * 0.52;
        vertex = pushVertex(positions, sides, seeds, nodes, visibility, colors, vertex,
          t0, side, seed, Math.abs(t0 - nodeAt) < 0.045 ? 1 : 0, visible, color);
        vertex = pushVertex(positions, sides, seeds, nodes, visibility, colors, vertex,
          t1, side, seed, Math.abs(t1 - nodeAt) < 0.045 ? 1 : 0, visible, color);
      }
    }
    this.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.geometry.setAttribute('aSide', new THREE.BufferAttribute(sides, 1));
    this.geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
    this.geometry.setAttribute('aNode', new THREE.BufferAttribute(nodes, 1));
    this.geometry.setAttribute('aVisibility', new THREE.BufferAttribute(visibility, 1));
    this.geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 }, uSlowBreath: { value: 0 }, uContactPulse: { value: 0 },
        uResetProgress: { value: 0 }, uGather: { value: 0 },
        uCoreA: { value: new THREE.Vector3() }, uCoreB: { value: new THREE.Vector3() },
        uWristA: { value: new THREE.Vector3() }, uWristB: { value: new THREE.Vector3() },
        uSharedCenter: { value: new THREE.Vector3() },
        uResultTension: { value: 0 }, uResultGap: { value: 0 }, uResultVibration: { value: 0 },
        uWristCuff: { value: 0 },
        uBaseOpacity: { value: VISUAL_THEME.filaments.baseOpacity },
        uContactOpacity: { value: VISUAL_THEME.filaments.contactOpacity },
      },
      vertexShader, fragmentShader, transparent: true, depthTest: true, depthWrite: false,
      blending: THREE.NormalBlending, toneMapped: false,
    });
    this.object3d = new THREE.LineSegments(this.geometry, this.material);
    this.object3d.name = 'StructuralFilamentField';
    this.object3d.frustumCulled = false;
    this.object3d.renderOrder = 1;
  }

  update(shared: SharedMotionFrame, choreography: ChoreographyFrame, result: ResultLayer): void {
    const uniforms = this.material.uniforms;
    uniforms.uTime.value = shared.globalTime;
    uniforms.uSlowBreath.value = shared.slowBreath;
    uniforms.uContactPulse.value = shared.contactPulse;
    uniforms.uResetProgress.value = shared.resetProgress;
    uniforms.uGather.value = choreography.interstitialGather;
    uniforms.uCoreA.value.copy(shared.coreA); uniforms.uCoreB.value.copy(shared.coreB);
    uniforms.uWristA.value.copy(shared.wristA); uniforms.uWristB.value.copy(shared.wristB);
    uniforms.uSharedCenter.value.copy(shared.sharedCenter);
    uniforms.uResultTension.value = result.filamentTension;
    uniforms.uResultGap.value = result.filamentGap;
    uniforms.uResultVibration.value = result.filamentVibration;
    uniforms.uWristCuff.value = result.wristCuff;
  }

  dispose(): void { this.geometry.dispose(); this.material.dispose(); }
}

function pushVertex(
  positions: Float32Array, sides: Float32Array, seeds: Float32Array,
  nodes: Float32Array, visibility: Float32Array, colors: Float32Array,
  vertex: number, t: number, side: number, seed: number, node: number,
  visible: number, color: THREE.Color,
): number {
  positions[vertex * 3] = t; sides[vertex] = side; seeds[vertex] = seed;
  nodes[vertex] = node; visibility[vertex] = visible; color.toArray(colors, vertex * 3);
  return vertex + 1;
}

function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5; let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
