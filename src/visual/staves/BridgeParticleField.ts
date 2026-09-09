import * as THREE from 'three';
import type { ChoreographyFrame } from '../choreography/ChoreographyController';
import type { SharedMotionFrame } from '../motion/SharedMotionField';
import { COLOR_PALETTE, VISUAL_THEME } from '../theme';
import type { ResultLayer } from '../results/ResultLayer';

const vertexShader = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uViewportHeight;
  uniform float uSlowBreath;
  uniform float uContactPulse;
  uniform vec2 uPresence;
  uniform vec3 uWristA;
  uniform vec3 uWristB;
  uniform vec3 uHandA;
  uniform vec3 uHandB;
  uniform float uResultStrength;
  uniform float uResultMisroute;

  attribute float aHand;
  attribute float aPathT;
  attribute float aSeed;
  attribute float aDirection;
  attribute float aSize;
  attribute vec3 aCoreColor;
  attribute vec3 aEdgeColor;

  varying vec3 vCoreColor;
  varying vec3 vEdgeColor;
  varying float vOpacity;

  void main() {
    float handMix = step(0.5, aHand);
    vec3 wrist = mix(uWristA, uWristB, handMix);
    vec3 handCenter = mix(uHandA, uHandB, handMix);
    float direction = mix(-1.0, 1.0, handMix);
    float flow = fract(aPathT + uTime * (0.018 + aSeed * 0.00017) * aDirection);
    float pathT = aDirection > 0.0 ? flow : 1.0 - flow;
    vec3 start = wrist + vec3(
      direction * (0.32 + sin(aSeed * 1.3) * 0.12),
      uSlowBreath * 0.055 + sin(uTime * 0.12 + aSeed) * 0.04,
      -0.08 + cos(aSeed * 0.7) * 0.11
    );
    vec3 end = mix(wrist, handCenter, 0.72) + vec3(
      -direction * 0.04,
      sin(aSeed * 1.91) * 0.08,
      cos(aSeed * 1.17) * 0.075
    );
    vec3 control = mix(start, end, 0.48) + vec3(
      -direction * 0.06,
      0.13 + sin(aSeed) * 0.05,
      sin(aSeed * 0.43) * 0.13
    );
    float inverseT = 1.0 - pathT;
    vec3 worldPosition = inverseT * inverseT * start
      + 2.0 * inverseT * pathT * control
      + pathT * pathT * end;
    worldPosition += position * (0.35 + sin(pathT * 3.14159) * 0.65);
    float misrouteMask = step(0.72, fract(aSeed * 2.17));
    worldPosition.z += misrouteMask * uResultMisroute * sin(aSeed) * 0.32;
    worldPosition.y += misrouteMask * uResultMisroute * cos(aSeed * 0.7) * 0.12;

    vec4 viewPosition = modelViewMatrix * vec4(worldPosition, 1.0);
    float presence = mix(uPresence.x, uPresence.y, handMix);
    float endpointGlow = smoothstep(0.68, 1.0, pathT);
    vOpacity = (0.025 + presence * 0.34 + max(0.0, uResultStrength) * 0.18)
      * (0.28 + endpointGlow * 0.5)
      * max(0.18, 1.0 + min(0.0, uResultStrength))
      * (1.0 + uContactPulse * 0.16);
    vCoreColor = aCoreColor;
    vEdgeColor = aEdgeColor;
    gl_PointSize = min(
      3.4,
      aSize * (0.48 + endpointGlow * 0.28) * uViewportHeight
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

  void main() {
    float radius = length(gl_PointCoord - vec2(0.5)) * 2.0;
    if (radius > 1.0) discard;
    float core = 1.0 - smoothstep(0.0, 0.1, radius);
    float body = 1.0 - smoothstep(0.08, 0.7, radius);
    float alpha = (core * 0.48 + body * 0.18) * vOpacity;
    vec3 color = mix(vEdgeColor, vCoreColor, 0.26 + core * 0.74)
      * (0.76 + core * 0.18);
    gl_FragColor = vec4(color, alpha);
  }
`;

export class BridgeParticleField {
  readonly particleCount = VISUAL_THEME.bridges.particleCount;
  readonly object3d: THREE.Points;
  private readonly geometry = new THREE.BufferGeometry();
  private readonly material: THREE.ShaderMaterial;

  constructor() {
    const count = this.particleCount;
    const positions = new Float32Array(count * 3);
    const hands = new Float32Array(count);
    const pathValues = new Float32Array(count);
    const seeds = new Float32Array(count);
    const directions = new Float32Array(count);
    const sizes = new Float32Array(count);
    const coreColors = new Float32Array(count * 3);
    const edgeColors = new Float32Array(count * 3);
    const random = createSeededRandom(0x48bd21);
    const silver = new THREE.Color(COLOR_PALETTE.moonSilver);
    const gold = new THREE.Color(COLOR_PALETTE.champagneGold);
    const rose = new THREE.Color(COLOR_PALETTE.pearlRose);
    const blue = new THREE.Color(COLOR_PALETTE.mistBlue);

    for (let index = 0; index < count; index += 1) {
      const hand = index % 2;
      positions[index * 3] = (random() * 2 - 1) * 0.035;
      positions[index * 3 + 1] = (random() * 2 - 1) * 0.045;
      positions[index * 3 + 2] = (random() * 2 - 1) * 0.055;
      hands[index] = hand;
      pathValues[index] = random();
      seeds[index] = random() * 29 + index * 0.071;
      directions[index] = random() < 0.72 ? 1 : -1;
      sizes[index] = VISUAL_THEME.bridges.particleSize * (0.62 + random() * 0.92);
      const colorChoice = random();
      const coreColor = colorChoice < 0.62
        ? silver
        : colorChoice < 0.84
          ? gold
          : colorChoice < 0.92
            ? rose
            : blue;
      const edgeColor = random() < 0.52 ? blue : rose;
      coreColor.toArray(coreColors, index * 3);
      edgeColor.toArray(edgeColors, index * 3);
    }

    this.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.geometry.setAttribute('aHand', new THREE.BufferAttribute(hands, 1));
    this.geometry.setAttribute('aPathT', new THREE.BufferAttribute(pathValues, 1));
    this.geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
    this.geometry.setAttribute('aDirection', new THREE.BufferAttribute(directions, 1));
    this.geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    this.geometry.setAttribute('aCoreColor', new THREE.BufferAttribute(coreColors, 3));
    this.geometry.setAttribute('aEdgeColor', new THREE.BufferAttribute(edgeColors, 3));

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uViewportHeight: { value: 1080 },
        uSlowBreath: { value: 0 },
        uContactPulse: { value: 0 },
        uPresence: { value: new THREE.Vector2() },
        uWristA: { value: new THREE.Vector3() },
        uWristB: { value: new THREE.Vector3() },
        uHandA: { value: new THREE.Vector3() },
        uHandB: { value: new THREE.Vector3() },
        uResultStrength: { value: 0 }, uResultMisroute: { value: 0 },
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
    this.object3d.name = 'StaffHandBridgeParticles';
    this.object3d.frustumCulled = false;
    this.object3d.renderOrder = 2;
  }

  update(sharedMotion: SharedMotionFrame, choreography: ChoreographyFrame, result: ResultLayer): void {
    this.material.uniforms.uTime.value = sharedMotion.globalTime;
    this.material.uniforms.uSlowBreath.value = sharedMotion.slowBreath;
    this.material.uniforms.uContactPulse.value = sharedMotion.contactPulse;
    this.material.uniforms.uPresence.value.set(
      choreography.handPresenceA * choreography.scenePresence,
      choreography.handPresenceB * choreography.scenePresence,
    );
    this.material.uniforms.uWristA.value.copy(sharedMotion.wristA);
    this.material.uniforms.uWristB.value.copy(sharedMotion.wristB);
    this.material.uniforms.uHandA.value.copy(sharedMotion.handCenterA);
    this.material.uniforms.uHandB.value.copy(sharedMotion.handCenterB);
    this.material.uniforms.uResultStrength.value = result.bridgeStrength;
    this.material.uniforms.uResultMisroute.value = result.bridgeMisroute;
  }

  setViewportHeight(viewportHeight: number): void {
    this.material.uniforms.uViewportHeight.value = viewportHeight;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
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
