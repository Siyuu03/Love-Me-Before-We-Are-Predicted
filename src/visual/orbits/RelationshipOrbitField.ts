import * as THREE from 'three';
import type { ChoreographyFrame } from '../choreography/ChoreographyController';
import type { SharedMotionFrame } from '../motion/SharedMotionField';
import { VISUAL_THEME } from '../theme';
import type { ResultLayer } from '../results/ResultLayer';

const vertexShader = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uViewportHeight;
  uniform float uSlowBreath;
  uniform float uSecondaryBreath;
  uniform float uTravelingWave;
  uniform float uContactPulse;
  uniform float uGather;
  uniform float uAlignment;
  uniform float uTension;
  uniform float uScenePresence;
  uniform vec2 uSoloRhythm;
  uniform vec3 uCoreA;
  uniform vec3 uCoreB;
  uniform vec3 uSharedCenter;
  uniform float uResultTighten;
  uniform float uResultBreak;
  uniform float uResultTilt;

  attribute float aGroup;
  attribute float aAngle;
  attribute vec2 aTilt;
  attribute float aSpeed;
  attribute float aSeed;
  attribute float aSize;
  attribute float aOpacity;
  attribute float aStyle;
  attribute vec3 aCoreColor;
  attribute vec3 aEdgeColor;

  varying vec3 vCoreColor;
  varying vec3 vEdgeColor;
  varying float vOpacity;
  varying float vStyle;

  void main() {
    float isA = 1.0 - step(1.5, aGroup);
    float isB = step(1.5, aGroup) * (1.0 - step(3.5, aGroup));
    float isShared = step(3.5, aGroup);
    vec3 center = uCoreA * isA + uCoreB * isB + uSharedCenter * isShared;
    float angle = aAngle + uTime * aSpeed + uTravelingWave * 0.08;
    vec3 local = vec3(
      cos(angle) * position.x,
      sin(angle) * position.y,
      sin(angle * 1.37 + aSeed * 0.1) * position.z
    );
    local *= 1.0 - uResultTighten * (0.12 + isShared * 0.18);
    float tiltX = aTilt.x + uResultTilt * sin(aSeed);
    float tiltZ = aTilt.y + uResultTilt * cos(aSeed * 0.7);
    mat2 rotateYZ = mat2(cos(tiltX), -sin(tiltX), sin(tiltX), cos(tiltX));
    mat2 rotateXY = mat2(cos(tiltZ), -sin(tiltZ), sin(tiltZ), cos(tiltZ));
    local.yz = rotateYZ * local.yz;
    local.xy = rotateXY * local.xy;
    local.y += uSlowBreath * 0.03;
    local.x += sin(angle * 2.31 + aSeed) * 0.018;
    local.y += cos(angle * 1.73 - aSeed) * 0.012;
    local.z += sin(angle * 0.91 + aSeed * 0.7) * 0.028;
    float arcSignal = 0.5 + sin(angle * 1.7 + aSeed) * 0.34
      + sin(angle * 0.63 - uTime * 0.031 + aSeed * 1.7) * 0.16;
    float arcVisible = step(0.56, arcSignal);
    arcVisible *= step(uResultBreak * 0.72, fract(aSeed * 1.731 + angle * 0.17));
    float sharedVisible = mix(1.0, smoothstep(0.08, 0.32, uGather), isShared);
    local.z += (1.0 - arcVisible * sharedVisible) * 80.0;
    vec4 viewPosition = modelViewMatrix * vec4(center + local, 1.0);
    float participantActivity = isA * (0.42 + uSoloRhythm.x * 0.38)
      + isB * (0.42 + uSoloRhythm.y * 0.38);
    float sharedActivity = isShared * mix(0.03, 0.72, uGather);
    float depthAttenuation = mix(1.0, 0.42, step(0.5, mod(aGroup, 2.0)));
    vOpacity = aOpacity * (participantActivity + sharedActivity)
      * depthAttenuation * uScenePresence;
    vCoreColor = aCoreColor;
    vEdgeColor = aEdgeColor;
    vStyle = aStyle;
    gl_PointSize = min(
      3.2,
      aSize * (0.62 + aStyle * 0.22) * uViewportHeight
        / max(1.0, -viewPosition.z)
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
    vec2 centered = gl_PointCoord - vec2(0.5);
    float radius = length(centered) * 2.0;
    if (radius > 1.0) discard;
    float core = 1.0 - smoothstep(0.0, 0.1, radius);
    float body = 1.0 - smoothstep(0.08, 0.68, radius);
    float horizontalRay = exp(-abs(centered.y) * 82.0)
      * (1.0 - smoothstep(0.12, 0.5, abs(centered.x)));
    float verticalRay = exp(-abs(centered.x) * 82.0)
      * (1.0 - smoothstep(0.12, 0.5, abs(centered.y)));
    float rays = (horizontalRay + verticalRay) * step(1.5, vStyle);
    float alpha = (core * 0.48 + body * 0.2 + rays * 0.14) * vOpacity;
    vec3 color = mix(vEdgeColor, vCoreColor, 0.28 + core * 0.72)
      * (0.72 + core * 0.18 + rays * 0.2);
    gl_FragColor = vec4(color, alpha);
  }
`;

const ORBIT_SHAPES = [
  [0.62, 0.34, 0.22, 0.48, -0.14, 0.055],
  [0.94, 0.46, 0.38, -0.31, 0.42, -0.038],
  [0.66, 0.32, 0.25, -0.52, 0.18, -0.052],
  [0.98, 0.5, 0.42, 0.34, -0.38, 0.035],
  [1.38, 0.58, 0.52, 0.22, 0.16, 0.028],
  [1.72, 0.78, 0.82, -0.28, -0.11, -0.021],
] as const;

export class RelationshipOrbitField {
  readonly particleCount = VISUAL_THEME.orbits.particleCount;
  readonly object3d: THREE.Points;
  private readonly geometry = new THREE.BufferGeometry();
  private readonly material: THREE.ShaderMaterial;

  constructor() {
    const count = this.particleCount;
    const positions = new Float32Array(count * 3);
    const groups = new Float32Array(count);
    const angles = new Float32Array(count);
    const tilts = new Float32Array(count * 2);
    const speeds = new Float32Array(count);
    const seeds = new Float32Array(count);
    const sizes = new Float32Array(count);
    const opacities = new Float32Array(count);
    const styles = new Float32Array(count);
    const coreColors = new Float32Array(count * 3);
    const edgeColors = new Float32Array(count * 3);
    const random = createSeededRandom(0x0a8b17);
    const perGroup = Math.ceil(count / VISUAL_THEME.orbits.groupCount);

    for (let index = 0; index < count; index += 1) {
      const group = Math.min(
        VISUAL_THEME.orbits.groupCount - 1,
        Math.floor(index / perGroup),
      );
      const shape = ORBIT_SHAPES[group];
      const jitter = 0.9 + random() * 0.2;
      positions[index * 3] = shape[0] * jitter;
      positions[index * 3 + 1] = shape[1] * (0.9 + random() * 0.2);
      positions[index * 3 + 2] = shape[2] * (0.84 + random() * 0.3);
      groups[index] = group;
      angles[index] = ((index % perGroup) / perGroup) * Math.PI * 2 + random() * 0.045;
      tilts[index * 2] = shape[3];
      tilts[index * 2 + 1] = shape[4];
      speeds[index] = shape[5] * (0.84 + random() * 0.32);
      seeds[index] = group * 13.7 + random() * 7.4 + index * 0.011;
      sizes[index] = VISUAL_THEME.orbits.particleSize * (0.58 + random() * 1.08);
      opacities[index] = (group >= 4
        ? VISUAL_THEME.orbits.sharedOpacity
        : VISUAL_THEME.orbits.baseOpacity) * (0.45 + random() * 0.55);
      const styleChoice = random();
      styles[index] = styleChoice < 0.88 ? 0 : styleChoice < 0.985 ? 1 : 2;
      pushPaletteColor(coreColors, index, VISUAL_THEME.orbits.colors, random);
      pushPaletteColor(edgeColors, index, VISUAL_THEME.orbits.edgeColors, random);
    }

    this.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.geometry.setAttribute('aGroup', new THREE.BufferAttribute(groups, 1));
    this.geometry.setAttribute('aAngle', new THREE.BufferAttribute(angles, 1));
    this.geometry.setAttribute('aTilt', new THREE.BufferAttribute(tilts, 2));
    this.geometry.setAttribute('aSpeed', new THREE.BufferAttribute(speeds, 1));
    this.geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
    this.geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    this.geometry.setAttribute('aOpacity', new THREE.BufferAttribute(opacities, 1));
    this.geometry.setAttribute('aStyle', new THREE.BufferAttribute(styles, 1));
    this.geometry.setAttribute('aCoreColor', new THREE.BufferAttribute(coreColors, 3));
    this.geometry.setAttribute('aEdgeColor', new THREE.BufferAttribute(edgeColors, 3));

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uViewportHeight: { value: 1080 },
        uSlowBreath: { value: 0 },
        uSecondaryBreath: { value: 0 },
        uTravelingWave: { value: 0 },
        uContactPulse: { value: 0 },
        uGather: { value: 0 },
        uAlignment: { value: 0 },
        uTension: { value: 0 },
        uScenePresence: { value: 1 },
        uSoloRhythm: { value: new THREE.Vector2() },
        uCoreA: { value: new THREE.Vector3() },
        uCoreB: { value: new THREE.Vector3() },
        uSharedCenter: { value: new THREE.Vector3() },
        uResultTighten: { value: 0 }, uResultBreak: { value: 0 }, uResultTilt: { value: 0 },
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
    this.object3d.name = 'RelationshipOrbitField';
    this.object3d.frustumCulled = false;
    this.object3d.renderOrder = 1;
  }

  update(sharedMotion: SharedMotionFrame, choreography: ChoreographyFrame, result: ResultLayer): void {
    const uniforms = this.material.uniforms;
    uniforms.uTime.value = sharedMotion.globalTime;
    uniforms.uSlowBreath.value = sharedMotion.slowBreath;
    uniforms.uSecondaryBreath.value = sharedMotion.secondaryBreath;
    uniforms.uTravelingWave.value = sharedMotion.travelingWave;
    uniforms.uContactPulse.value = sharedMotion.contactPulse;
    uniforms.uGather.value = choreography.interstitialGather;
    uniforms.uAlignment.value = choreography.staffAlignment;
    uniforms.uTension.value = choreography.tension;
    uniforms.uScenePresence.value = choreography.scenePresence;
    uniforms.uSoloRhythm.value.set(
      choreography.soloRhythmA,
      choreography.soloRhythmB,
    );
    uniforms.uCoreA.value.copy(sharedMotion.coreA);
    uniforms.uCoreB.value.copy(sharedMotion.coreB);
    uniforms.uSharedCenter.value.copy(sharedMotion.sharedCenter);
    uniforms.uResultTighten.value = result.orbitTighten;
    uniforms.uResultBreak.value = result.orbitBreak;
    uniforms.uResultTilt.value = result.orbitTilt;
  }

  setViewportHeight(viewportHeight: number): void {
    this.material.uniforms.uViewportHeight.value = viewportHeight;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}

function pushPaletteColor(
  target: Float32Array,
  index: number,
  palette: readonly number[],
  random: () => number,
): void {
  const color = new THREE.Color(palette[Math.floor(random() * palette.length)]);
  color.toArray(target, index * 3);
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
