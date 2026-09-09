import * as THREE from 'three';
import type { RhythmFrame } from '../../audio/RhythmDirector';
import type { ChoreographyFrame } from '../choreography/ChoreographyController';
import type { SharedMotionFrame } from '../motion/SharedMotionField';
import type { ResultLayer } from '../results/ResultLayer';
import { VISUAL_THEME, type StaffTheme } from '../theme';

const STAFF_LINE_COUNT = 5;
const PIANO_KEY_COUNT = 24;
const NOTATION_COUNT = 260;
const DESIRE_METEOR_COUNT = 420;
const EMPTY_PRESS = new Float32Array(5);

interface KeyResonanceBinding {
  readonly keyIndices: readonly number[];
  readonly values: Float32Array;
  readonly attribute: THREE.InstancedBufferAttribute;
}

const keyVertexShader = /* glsl */ `
  precision highp float;
  uniform vec4 uPressA;
  uniform vec4 uPressB;
  uniform vec2 uPinkyPress;
  attribute float aKey;
  attribute float aResonance;
  varying vec2 vUv;
  varying float vKey;
  varying float vActivation;
  varying float vResonance;

  float fingerPress(vec4 presses, float pinky, float finger) {
    if (finger < 0.5) return presses.x;
    if (finger < 1.5) return presses.y;
    if (finger < 2.5) return presses.z;
    if (finger < 3.5) return presses.w;
    return pinky;
  }

  void main() {
    vUv = uv;
    vKey = aKey;
    float finger = mod(aKey + floor(aKey / 4.0), 5.0);
    float press = max(
      fingerPress(uPressA, uPinkyPress.x, finger),
      fingerPress(uPressB, uPinkyPress.y, mod(finger + 2.0, 5.0))
    );
    press = clamp(press * 9.0, 0.0, 1.0);
    vActivation = max(press, clamp(aResonance * 7.0, 0.0, 1.0));
    vResonance = clamp(aResonance * 7.0, 0.0, 1.0);
    vec4 local = instanceMatrix * vec4(position, 1.0);
    // One visual event now drives all three layers: the fingertip descends in
    // ParticleHands, this key depresses, and its matching notation is born.
    local.y -= press * 0.028;
    local.z -= press * 0.04;
    gl_Position = projectionMatrix * modelViewMatrix * local;
  }
`;

const keyFragmentShader = /* glsl */ `
  precision highp float;
  uniform vec4 uPressA;
  uniform vec4 uPressB;
  uniform vec2 uPinkyPress;
  uniform float uPulse;
  uniform float uResultKind;
  uniform float uScenePresence;
  uniform float uStateVisibility;
  uniform float uDebugVisibility;
  uniform float uBlackKey;
  varying vec2 vUv;
  varying float vKey;
  varying float vActivation;
  varying float vResonance;

  float fingerPress(vec4 presses, float pinky, float finger) {
    if (finger < 0.5) return presses.x;
    if (finger < 1.5) return presses.y;
    if (finger < 2.5) return presses.z;
    if (finger < 3.5) return presses.w;
    return pinky;
  }

  void main() {
    float finger = mod(vKey + floor(vKey / 4.0), 5.0);
    float keyPress = vActivation;
    if (uResultKind > 2.5 && uResultKind < 3.5) {
      keyPress = max(keyPress, uPulse * step(0.46, fract(vKey * 0.37 + uPulse * 0.31)) * 0.32);
    }
    if (uResultKind > 5.5) keyPress *= 0.45 + uPulse * 0.4;
    vec2 edgeDistance = min(vUv, 1.0 - vUv);
    float horizontalEdge = 1.0 - smoothstep(0.012, 0.034, edgeDistance.y);
    float verticalEdge = (1.0 - smoothstep(0.012, 0.032, edgeDistance.x)) * 0.52;
    float border = max(horizontalEdge, verticalEdge);
    float interior = (1.0 - border) * (0.003 + keyPress * 0.014);
    vec3 color = mix(vec3(0.42, 0.55, 0.65), vec3(0.56, 0.65, 0.74), uBlackKey);
    if (uResultKind > 0.5 && uResultKind < 1.5) color = mix(vec3(0.68, 0.83, 1.0), vec3(0.72, 0.16, 0.35), uBlackKey);
    else if (uResultKind > 1.5 && uResultKind < 2.5) color = mix(vec3(0.83, 0.74, 0.66), vec3(0.55, 0.71, 0.78), uBlackKey);
    else if (uResultKind > 2.5 && uResultKind < 3.5) color = mix(vec3(0.48, 0.52, 0.57), vec3(0.72, 0.12, 0.08), keyPress * 0.72);
    else if (uResultKind > 3.5 && uResultKind < 4.5) color = mix(vec3(0.34, 0.48, 0.73), vec3(0.48, 0.37, 0.62), uBlackKey);
    else if (uResultKind > 4.5 && uResultKind < 5.5) color = mix(vec3(0.62, 0.39, 0.17), vec3(0.39, 0.09, 0.1), uBlackKey);
    else if (uResultKind > 5.5) color = mix(vec3(0.64, 0.65, 0.76), vec3(0.36, 0.63, 0.69), uBlackKey);
    float alpha = border * (0.13 + keyPress * 0.64 + vResonance * 0.18) + interior;
    gl_FragColor = vec4(
      color * (0.7 + keyPress * 0.4),
      alpha * uScenePresence * uStateVisibility * uDebugVisibility
    );
  }
`;

const staffVertexShader = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform float uAmplitude;
  uniform float uDepthAmplitude;
  uniform float uSlowBreath;
  uniform float uSecondaryBreath;
  uniform float uContactY;
  uniform float uResultPhase;
  uniform float uResultAmplitude;
  uniform float uResultSplit;
  uniform float uResultImpulse;
  uniform vec4 uPressA;
  uniform vec4 uPressB;
  uniform vec2 uPinkyPress;
  uniform float uRhythmPulse;
  uniform float uResultKind;
  attribute float aPhase;
  attribute float aAlong;
  attribute float aPiano;
  attribute float aKey;
  varying float vPiano;
  varying float vActivation;
  varying float vLineModulation;

  float fingerPress(vec4 presses, float pinky, float finger) {
    if (finger < 0.5) return presses.x;
    if (finger < 1.5) return presses.y;
    if (finger < 2.5) return presses.z;
    if (finger < 3.5) return presses.w;
    return pinky;
  }

  void main() {
    vec3 transformed = position;
    float broad = sin(position.y * 0.82 - uTime * 0.075 + aPhase);
    float fine = sin(position.y * 1.92 + uTime * 0.043 - aPhase * 0.73);
    transformed.x += broad * uAmplitude + fine * uAmplitude * 0.22;
    transformed.x += uSlowBreath * uAmplitude * (0.12 + aAlong * 0.1);
    transformed.z += sin(position.y * 0.51 - uTime * 0.04 + aPhase) * uDepthAmplitude;
    transformed.x += sin(position.y * 0.94 - uTime * 0.13 + aPhase + uResultPhase)
      * uResultAmplitude * 0.16;
    transformed.x += sin(aPhase * 1.7) * uResultSplit * 0.11;
    float impulseDistance = abs(position.y - uContactY);
    transformed.x += sin(impulseDistance * 10.0 - uTime * 2.15)
      * exp(-impulseDistance * 1.15) * uResultImpulse * 0.075;
    transformed.z += sin(position.y * 1.13 + aPhase) * uResultAmplitude * 0.055;
    float finger = mod(max(0.0, aKey) + floor(max(0.0, aKey) / 4.0), 5.0);
    float keyPress = max(
      fingerPress(uPressA, uPinkyPress.x, finger),
      fingerPress(uPressB, uPinkyPress.y, mod(finger + 2.0, 5.0))
    );
    keyPress = clamp(keyPress * 9.0, 0.0, 1.0);
    if (uResultKind > 0.5 && uResultKind < 1.5) {
      keyPress = max(keyPress, max(0.0, 1.0 - abs(aKey - 10.5) / 4.0) * uResultImpulse);
      transformed.x += aPiano * sign(position.x) * keyPress * 0.026;
    } else if (uResultKind > 2.5 && uResultKind < 3.5) {
      keyPress = max(keyPress, 0.18 + uRhythmPulse * 0.62);
    } else if (uResultKind > 5.5) {
      keyPress *= 0.45 + uRhythmPulse * 0.42;
    }
    transformed.z -= aPiano * keyPress * 0.04;
    transformed.x = mix(transformed.x, position.x, aPiano * 0.88);
    vPiano = aPiano;
    vActivation = keyPress;
    vLineModulation = 0.66 + 0.34 * smoothstep(
      -0.58,
      0.38,
      sin(aAlong * 18.0 + aPhase * 2.4 + uTime * 0.045)
    );
    gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
  }
`;

const staffFragmentShader = /* glsl */ `
  precision highp float;
  uniform vec3 uColor;
  uniform vec3 uEdgeColor;
  uniform float uOpacity;
  uniform float uScenePresence;
  uniform float uStateVisibility;
  uniform float uDebugVisibility;
  uniform float uResultKind;
  varying float vPiano;
  varying float vActivation;
  varying float vLineModulation;

  void main() {
    vec3 color = mix(uColor, uEdgeColor, 0.2);
    if (uResultKind > 2.5 && uResultKind < 3.5) color = mix(color, vec3(0.5, 0.58, 0.68), 0.12);
    if (uResultKind > 3.5 && uResultKind < 4.5) color = mix(color, vec3(0.33, 0.43, 0.67), 0.36);
    if (uResultKind > 4.5 && uResultKind < 5.5) color = mix(color, vec3(0.48, 0.24, 0.09), 0.34);
    if (uResultKind > 5.5) color = mix(color, vec3(0.48, 0.55, 0.68), 0.3);
    if (vPiano > 0.5) {
      vec3 keyColor = vec3(0.54, 0.67, 0.76);
      if (uResultKind > 0.5 && uResultKind < 1.5) keyColor = mix(vec3(0.66, 0.82, 1.0), vec3(0.72, 0.16, 0.35), step(0.5, fract(gl_FragCoord.y * 0.13)));
      else if (uResultKind > 1.5 && uResultKind < 2.5) keyColor = vec3(0.82, 0.72, 0.68);
      else if (uResultKind > 2.5 && uResultKind < 3.5) keyColor = mix(vec3(0.72, 0.75, 0.77), vec3(0.78, 0.12, 0.08), vActivation * 0.58);
      else if (uResultKind > 3.5 && uResultKind < 4.5) keyColor = vec3(0.43, 0.55, 0.82);
      else if (uResultKind > 4.5 && uResultKind < 5.5) keyColor = vec3(0.64, 0.39, 0.16);
      else if (uResultKind > 5.5) keyColor = vec3(0.6, 0.63, 0.78);
      color = mix(color, keyColor, 0.42 + vActivation * 0.48);
    }
    gl_FragColor = vec4(
      color * 0.86,
      uOpacity * vLineModulation * mix(1.0, 2.2 + vActivation * 0.58, vPiano)
        * uScenePresence * uStateVisibility * uDebugVisibility
    );
  }
`;

const notationVertexShader = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform float uViewportHeight;
  uniform float uPulse;
  uniform float uFlow;
  uniform float uResultKind;
  uniform float uScenePresence;
  uniform vec4 uPressA;
  uniform vec4 uPressB;
  uniform vec4 uResidueA;
  uniform vec4 uResidueB;
  uniform vec2 uPinkyPress;
  uniform vec2 uPinkyResidue;
  attribute float aSeed;
  attribute float aStyle;
  attribute float aHand;
  attribute float aFinger;
  varying float vOpacity;
  varying float vStyle;
  varying vec3 vColor;

  float fingerValue(vec4 firstFour, float pinky, float finger) {
    if (finger < 0.5) return firstFour.x;
    if (finger < 1.5) return firstFour.y;
    if (finger < 2.5) return firstFour.z;
    if (finger < 3.5) return firstFour.w;
    return pinky;
  }

  void main() {
    vec3 transformed = position;
    float handSide = mix(-1.0, 1.0, aHand);
    float press = mix(
      fingerValue(uPressA, uPinkyPress.x, aFinger),
      fingerValue(uPressB, uPinkyPress.y, aFinger),
      aHand
    );
    float residue = mix(
      fingerValue(uResidueA, uPinkyResidue.x, aFinger),
      fingerValue(uResidueB, uPinkyResidue.y, aFinger),
      aHand
    );
    float activation = clamp(max(press, residue * 0.78) * 9.0, 0.0, 1.0);
    float life = fract(aSeed + uTime * (0.055 + uFlow * 0.085));
    transformed.y += life * (1.52 + uFlow * 0.86);
    transformed.x += sin(uTime * 0.17 + aSeed * 31.0) * 0.018;
    transformed.z += sin(uTime * 0.13 + aSeed * 17.0) * 0.055;
    float gate = smoothstep(0.015, 0.11, life) * (1.0 - smoothstep(0.62, 0.98, life));
    float idleWhisper = step(uResultKind, 0.5) * (0.035 + uPulse * 0.09);
    float resultBeat = step(0.5, uResultKind) * (0.055 + uPulse * 0.44);
    float eventStrength = max(max(activation, idleWhisper), resultBeat);
    float noteDensity = clamp(0.025 + activation * 0.22 + uPulse * 0.14, 0.0, 0.4);
    gate *= 1.0 - step(noteDensity, fract(aSeed * 29.17));
    vColor = mix(vec3(0.72, 0.82, 0.88), vec3(0.9, 0.79, 0.76), aHand * 0.22);
    if (uResultKind > 0.5 && uResultKind < 1.5) {
      transformed.x *= mix(1.0, 0.34, life);
      transformed.x += handSide * life * 0.075;
      gate *= 1.0 + uPulse * 0.62;
      vColor = mix(vec3(0.73, 0.86, 0.94), vec3(0.82, 0.61, 0.69), fract(aSeed * 9.0));
    } else if (uResultKind > 1.5 && uResultKind < 2.5) {
      transformed.x *= 1.0 - life * 0.42;
      transformed.x += handSide * sin(life * 3.14159265) * 0.055;
      vColor = mix(vec3(0.84, 0.75, 0.65), vec3(0.54, 0.72, 0.8), fract(aSeed * 5.0));
    } else if (uResultKind > 2.5 && uResultKind < 3.5) {
      transformed.x += handSide * (0.12 + sin(life * 6.28318 + aSeed * 8.0) * 0.12);
      transformed.x *= 1.0 - sin(life * 3.14159265) * 0.38;
      vColor = mix(vec3(0.53, 0.045, 0.08), vec3(0.96, 0.2, 0.16), fract(aSeed * 11.0));
      gate *= 0.86 + uPulse * 0.36;
    } else if (uResultKind > 3.5 && uResultKind < 4.5) {
      float ghost = step(0.56, fract(aSeed * 13.0));
      transformed.x += ghost * (0.07 + sin(aSeed * 23.0) * 0.05);
      transformed.y -= ghost * 0.12;
      transformed.z += ghost * 0.1;
      vColor = mix(vec3(0.33, 0.49, 0.73), vec3(0.49, 0.37, 0.61), fract(aSeed * 4.0));
    } else if (uResultKind > 4.5 && uResultKind < 5.5) {
      transformed.y -= life * 0.22;
      transformed.x += handSide * life * 0.24;
      gate *= 0.52;
      vColor = vec3(0.63, 0.39, 0.16);
    } else if (uResultKind > 5.5) {
      gate *= 0.16 + 0.84 * smoothstep(-0.05, 0.42, sin(uTime * 0.57 + aSeed * 19.0));
      transformed.x += sin(life * 5.0 + aSeed * 7.0) * 0.055;
      vColor = mix(vec3(0.67, 0.66, 0.76), vec3(0.36, 0.65, 0.69), fract(aSeed * 8.0));
    }
    vec4 viewPosition = modelViewMatrix * vec4(transformed, 1.0);
    gl_Position = projectionMatrix * viewPosition;
    gl_PointSize = clamp(
      (8.6 + aStyle * 1.8 + uPulse * 1.1) * uViewportHeight / 1920.0,
      7.0,
      14.0
    );
    vOpacity = gate * clamp(eventStrength * 1.55, 0.0, 1.0)
      * (0.74 + uPulse * 0.28) * uScenePresence;
    vStyle = aStyle;
  }
`;

const notationFragmentShader = /* glsl */ `
  precision highp float;
  varying float vOpacity;
  varying float vStyle;
  varying vec3 vColor;

  void main() {
    vec2 p = gl_PointCoord - vec2(0.5);
    float head = 1.0 - smoothstep(0.15, 0.27, length(vec2(p.x * 0.78, p.y * 1.5)));
    float stem = (1.0 - smoothstep(0.028, 0.065, abs(p.x - 0.17)))
      * smoothstep(-0.34, -0.24, p.y) * (1.0 - smoothstep(0.12, 0.25, p.y));
    float flag = (1.0 - smoothstep(0.035, 0.095, abs(p.y - p.x * 0.45 - 0.08)))
      * smoothstep(0.04, 0.15, p.x);
    float secondHead = 1.0 - smoothstep(0.15, 0.27, length(vec2((p.x + 0.23) * 0.78, (p.y + 0.08) * 1.5)));
    float secondStem = (1.0 - smoothstep(0.028, 0.065, abs(p.x + 0.08)))
      * smoothstep(-0.34, -0.24, p.y) * (1.0 - smoothstep(0.04, 0.16, p.y));
    float beam = (1.0 - smoothstep(0.025, 0.06, abs(p.y - p.x * 0.12 - 0.15)))
      * (1.0 - smoothstep(0.12, 0.36, abs(p.x + 0.01)));
    float single = max(head, max(stem, flag * step(0.5, vStyle)));
    float paired = max(single, max(secondHead, max(secondStem, beam)));
    float symbol = vStyle < 1.5 ? single : paired;
    if (symbol < 0.02) discard;
    gl_FragColor = vec4(vColor, min(1.0, symbol * vOpacity));
  }
`;

const desireMeteorVertexShader = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform float uFlow;
  uniform float uPulse;
  uniform float uResultKind;
  attribute float aSeed;
  varying float vAlpha;
  varying float vHeat;

  void main() {
    float desire = 1.0 - smoothstep(0.18, 0.5, abs(uResultKind - 3.0));
    float direction = step(0.5, fract(aSeed * 8.17)) * 2.0 - 1.0;
    float speed = 0.035 + fract(aSeed * 5.71) * 0.055 + uFlow * 0.022;
    float life = fract(aSeed + uTime * speed);
    vec3 transformed = position;
    transformed.x += direction * (life - 0.5) * (1.65 + fract(aSeed * 3.1) * 0.75);
    transformed.y += direction * (life - 0.5) * (0.72 + fract(aSeed * 4.9) * 0.46);
    transformed.z += sin(aSeed * 31.0 + uTime * 0.08) * 0.16;
    vec4 viewPosition = modelViewMatrix * vec4(transformed, 1.0);
    gl_Position = projectionMatrix * viewPosition;
    gl_PointSize = 6.4 + fract(aSeed * 11.3) * 6.2 + uPulse * 1.1;
    float envelope = smoothstep(0.03, 0.2, life) * (1.0 - smoothstep(0.68, 0.98, life));
    vAlpha = desire * envelope * (0.62 + fract(aSeed * 17.0) * 0.38);
    vHeat = fract(aSeed * 7.9);
  }
`;

const desireMeteorFragmentShader = /* glsl */ `
  precision highp float;
  varying float vAlpha;
  varying float vHeat;

  void main() {
    vec2 p = gl_PointCoord - vec2(0.5);
    mat2 turn = mat2(0.84, -0.54, 0.54, 0.84);
    p = turn * p;
    float filament = exp(-abs(p.y) * 23.0) * (1.0 - smoothstep(0.04, 0.5, abs(p.x)));
    float ember = 1.0 - smoothstep(0.02, 0.12, length(p - vec2(0.16, 0.0)));
    float alpha = max(filament * 0.58, ember) * vAlpha;
    if (alpha < 0.008) discard;
    vec3 color = mix(vec3(0.42, 0.012, 0.025), vec3(0.96, 0.13, 0.075), vHeat);
    gl_FragColor = vec4(color, alpha);
  }
`;

export class StaffField {
  readonly object3d = new THREE.Group();
  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly materials: THREE.Material[] = [];
  private readonly staffMaterials: THREE.ShaderMaterial[] = [];
  private readonly staffs: THREE.LineSegments[] = [];
  private readonly keyMaterials: THREE.ShaderMaterial[] = [];
  private readonly notationMaterial: THREE.ShaderMaterial;
  private readonly desireMeteorMaterial: THREE.ShaderMaterial;
  private readonly keyResonance = new Float32Array(PIANO_KEY_COUNT);
  private readonly fingerResidueA = new Float32Array(5);
  private readonly fingerResidueB = new Float32Array(5);
  private readonly keyResonanceBindings: KeyResonanceBinding[] = [];
  private lastVisualTime = 0;

  constructor() {
    this.object3d.name = 'VerticalScorePianoField';
    VISUAL_THEME.staves.forEach((theme, index) => this.object3d.add(this.createStaff(theme, index)));
    const keyMeshes = this.createPianoKeys();
    const notation = this.createNotationField();
    const desireMeteors = this.createDesireMeteorField();
    this.notationMaterial = notation.material as THREE.ShaderMaterial;
    this.desireMeteorMaterial = desireMeteors.material as THREE.ShaderMaterial;
    this.object3d.add(...keyMeshes, notation, desireMeteors);
  }

  update(
    sharedMotion: SharedMotionFrame,
    choreography: ChoreographyFrame,
    result: ResultLayer,
    rhythm?: RhythmFrame,
  ): void {
    const resultKind = resultVisualIndex(result.resultId);
    const pressA = rhythm?.fingerPressA ?? EMPTY_PRESS;
    const pressB = rhythm?.fingerPressB ?? EMPTY_PRESS;
    const deltaSeconds = this.lastVisualTime > 0
      ? Math.min(0.1, Math.max(0, sharedMotion.globalTime - this.lastVisualTime))
      : 1 / 60;
    this.lastVisualTime = sharedMotion.globalTime;
    this.updateRhythmAfterglow(deltaSeconds, pressA, pressB);
    this.staffMaterials.forEach((material, index) => {
      material.uniforms.uTime.value = sharedMotion.globalTime;
      material.uniforms.uSlowBreath.value = sharedMotion.slowBreath;
      material.uniforms.uSecondaryBreath.value = sharedMotion.secondaryBreath;
      material.uniforms.uScenePresence.value = choreography.scenePresence;
      material.uniforms.uStateVisibility.value = choreography.staffVisibility;
      material.uniforms.uResultPhase.value = result.staffPhase;
      material.uniforms.uResultAmplitude.value = result.staffAmplitude;
      material.uniforms.uResultSplit.value = result.staffSplit;
      material.uniforms.uResultImpulse.value = result.staffImpulse;
      material.uniforms.uResultKind.value = resultKind;
      material.uniforms.uPressA.value.set(pressA[0], pressA[1], pressA[2], pressA[3]);
      material.uniforms.uPressB.value.set(pressB[0], pressB[1], pressB[2], pressB[3]);
      material.uniforms.uPinkyPress.value.set(pressA[4], pressB[4]);
      material.uniforms.uRhythmPulse.value = rhythm?.pulse ?? 0;

      const staff = this.staffs[index];
      const theme = VISUAL_THEME.staves[index];
      const alignedX = [0, -0.62, 0.7][index];
      staff.position.x = THREE.MathUtils.lerp(theme.position[0], alignedX, choreography.staffAlignment * 0.42);
      staff.rotation.x = theme.rotation[0] * (1 - choreography.staffAlignment * 0.32);
      staff.rotation.y = theme.rotation[1] * (1 - choreography.staffAlignment * 0.44);
      staff.rotation.z = theme.rotation[2] * (1 - choreography.staffAlignment * 0.76);
      material.uniforms.uContactY.value = sharedMotion.contactPoint.y - staff.position.y;
    });

    this.keyMaterials.forEach((material) => {
      material.uniforms.uPressA.value.set(pressA[0], pressA[1], pressA[2], pressA[3]);
      material.uniforms.uPressB.value.set(pressB[0], pressB[1], pressB[2], pressB[3]);
      material.uniforms.uPinkyPress.value.set(pressA[4], pressB[4]);
      material.uniforms.uPulse.value = rhythm?.pulse ?? 0;
      material.uniforms.uResultKind.value = resultKind;
      material.uniforms.uScenePresence.value = choreography.scenePresence;
      material.uniforms.uStateVisibility.value = Math.min(1, 0.44 + choreography.staffVisibility * 0.62);
    });

    this.notationMaterial.uniforms.uTime.value = sharedMotion.globalTime;
    this.notationMaterial.uniforms.uPulse.value = rhythm?.pulse ?? 0;
    this.notationMaterial.uniforms.uFlow.value = rhythm?.particleFlow ?? 0.1;
    this.notationMaterial.uniforms.uResultKind.value = resultKind;
    this.notationMaterial.uniforms.uScenePresence.value = choreography.scenePresence;
    this.notationMaterial.uniforms.uPressA.value.set(pressA[0], pressA[1], pressA[2], pressA[3]);
    this.notationMaterial.uniforms.uPressB.value.set(pressB[0], pressB[1], pressB[2], pressB[3]);
    this.notationMaterial.uniforms.uResidueA.value.set(
      this.fingerResidueA[0], this.fingerResidueA[1], this.fingerResidueA[2], this.fingerResidueA[3],
    );
    this.notationMaterial.uniforms.uResidueB.value.set(
      this.fingerResidueB[0], this.fingerResidueB[1], this.fingerResidueB[2], this.fingerResidueB[3],
    );
    this.notationMaterial.uniforms.uPinkyPress.value.set(pressA[4], pressB[4]);
    this.notationMaterial.uniforms.uPinkyResidue.value.set(
      this.fingerResidueA[4], this.fingerResidueB[4],
    );
    this.desireMeteorMaterial.uniforms.uTime.value = sharedMotion.globalTime;
    this.desireMeteorMaterial.uniforms.uFlow.value = rhythm?.particleFlow ?? 0.1;
    this.desireMeteorMaterial.uniforms.uPulse.value = rhythm?.pulse ?? 0;
    this.desireMeteorMaterial.uniforms.uResultKind.value = resultKind;
  }

  private createPianoKeys(): readonly THREE.InstancedMesh[] {
    const whiteGeometry = new THREE.PlaneGeometry(1, 1);
    const blackGeometry = new THREE.PlaneGeometry(1, 1);
    const whiteKeyIndices = Array.from({ length: PIANO_KEY_COUNT }, (_, key) => key);
    const blackKeys = Array.from({ length: PIANO_KEY_COUNT - 1 }, (_, key) => key)
      .filter((key) => [0, 1, 3, 4, 5].includes(key % 7));
    const whiteKeys = this.createKeyMesh(whiteGeometry, whiteKeyIndices, false);
    const blackKeyMesh = this.createKeyMesh(blackGeometry, blackKeys, true);
    const keyWidth = 1.78 / PIANO_KEY_COUNT;
    const matrix = new THREE.Matrix4();
    for (let key = 0; key < PIANO_KEY_COUNT; key += 1) {
      matrix.makeScale(keyWidth * 0.9, 0.42, 1);
      matrix.setPosition(-0.89 + key * keyWidth + keyWidth * 0.5, -0.55, 0.54);
      whiteKeys.setMatrixAt(key, matrix);
    }
    blackKeys.forEach((key, instance) => {
      matrix.makeScale(keyWidth * 0.56, 0.235, 1);
      matrix.setPosition(-0.89 + (key + 1) * keyWidth, -0.455, 0.57);
      blackKeyMesh.setMatrixAt(instance, matrix);
    });
    whiteKeys.instanceMatrix.needsUpdate = true;
    blackKeyMesh.instanceMatrix.needsUpdate = true;
    return [whiteKeys, blackKeyMesh];
  }

  private createKeyMesh(
    geometry: THREE.PlaneGeometry,
    keyIndices: readonly number[],
    black: boolean,
  ): THREE.InstancedMesh {
    const count = keyIndices.length;
    const keys = Float32Array.from(keyIndices);
    const resonanceValues = new Float32Array(count);
    const resonanceAttribute = new THREE.InstancedBufferAttribute(resonanceValues, 1);
    geometry.setAttribute('aKey', new THREE.InstancedBufferAttribute(keys, 1));
    geometry.setAttribute('aResonance', resonanceAttribute);
    this.keyResonanceBindings.push({ keyIndices, values: resonanceValues, attribute: resonanceAttribute });
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uPressA: { value: new THREE.Vector4() }, uPressB: { value: new THREE.Vector4() },
        uPinkyPress: { value: new THREE.Vector2() }, uPulse: { value: 0 },
        uResultKind: { value: 0 }, uScenePresence: { value: 1 },
        uStateVisibility: { value: 1 }, uDebugVisibility: { value: 1 },
        uBlackKey: { value: black ? 1 : 0 },
      },
      vertexShader: keyVertexShader,
      fragmentShader: keyFragmentShader,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.NormalBlending,
      toneMapped: false,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.InstancedMesh(geometry, material, count);
    mesh.name = black ? 'HorizontalPianoBlackKeys' : 'HorizontalPianoWhiteKeys';
    mesh.frustumCulled = false;
    mesh.renderOrder = black ? 6 : 5;
    this.geometries.push(geometry);
    this.materials.push(material);
    this.keyMaterials.push(material);
    return mesh;
  }

  dispose(): void {
    this.geometries.forEach((geometry) => geometry.dispose());
    this.materials.forEach((material) => material.dispose());
  }

  setDebugVisibility(value: number): void {
    const visibility = THREE.MathUtils.clamp(value, 0, 1);
    this.materials.forEach((material) => {
      if (material instanceof THREE.ShaderMaterial && material.uniforms.uDebugVisibility) {
        material.uniforms.uDebugVisibility.value = visibility;
      }
    });
  }

  setViewportHeight(viewportHeight: number): void {
    this.notationMaterial.uniforms.uViewportHeight.value = Math.max(1, viewportHeight);
  }

  private updateRhythmAfterglow(
    deltaSeconds: number,
    pressA: Float32Array,
    pressB: Float32Array,
  ): void {
    const fingerDecay = Math.exp(-deltaSeconds / 0.58);
    for (let finger = 0; finger < 5; finger += 1) {
      this.fingerResidueA[finger] = Math.max(pressA[finger], this.fingerResidueA[finger] * fingerDecay);
      this.fingerResidueB[finger] = Math.max(pressB[finger], this.fingerResidueB[finger] * fingerDecay);
    }
    const keyDecay = Math.exp(-deltaSeconds / 0.46);
    for (let key = 0; key < PIANO_KEY_COUNT; key += 1) {
      const fingerA = (key + Math.floor(key / 4)) % 5;
      const fingerB = (fingerA + 2) % 5;
      const eventStrength = Math.max(pressA[fingerA], pressB[fingerB]);
      this.keyResonance[key] = Math.max(eventStrength, this.keyResonance[key] * keyDecay);
    }
    this.keyResonanceBindings.forEach((binding) => {
      binding.keyIndices.forEach((key, instance) => {
        binding.values[instance] = this.keyResonance[key];
      });
      binding.attribute.needsUpdate = true;
    });
  }

  private createStaff(theme: StaffTheme, index: number): THREE.LineSegments {
    const geometry = new THREE.BufferGeometry();
    const positions: number[] = [];
    const phases: number[] = [];
    const alongValues: number[] = [];
    const pianoValues: number[] = [];
    const keyValues: number[] = [];
    const layerPhase = 0.73 + index * 1.91;

    for (let lineIndex = 0; lineIndex < STAFF_LINE_COUNT; lineIndex += 1) {
      const lineX = (lineIndex - 2) * theme.spacing;
      const linePhase = layerPhase + lineIndex * 0.37;
      for (let segment = 0; segment < theme.segments; segment += 1) {
        const alongA = segment / theme.segments;
        const alongB = (segment + 1) / theme.segments;
        this.pushStaffVertex(positions, phases, alongValues, theme, alongA, lineX, linePhase);
        pianoValues.push(0); keyValues.push(-1);
        this.pushStaffVertex(positions, phases, alongValues, theme, alongB, lineX, linePhase);
        pianoValues.push(0); keyValues.push(-1);
      }
    }

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('aPhase', new THREE.Float32BufferAttribute(phases, 1));
    geometry.setAttribute('aAlong', new THREE.Float32BufferAttribute(alongValues, 1));
    geometry.setAttribute('aPiano', new THREE.Float32BufferAttribute(pianoValues, 1));
    geometry.setAttribute('aKey', new THREE.Float32BufferAttribute(keyValues, 1));
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 }, uAmplitude: { value: theme.driftAmplitude },
        uDepthAmplitude: { value: theme.depthAmplitude }, uSlowBreath: { value: 0 },
        uSecondaryBreath: { value: 0 }, uContactY: { value: 0 },
        uResultPhase: { value: 0 }, uResultAmplitude: { value: 0 },
        uResultSplit: { value: 0 }, uResultImpulse: { value: 0 },
        uResultKind: { value: 0 }, uColor: { value: new THREE.Color(theme.color) },
        uPressA: { value: new THREE.Vector4() }, uPressB: { value: new THREE.Vector4() },
        uPinkyPress: { value: new THREE.Vector2() }, uRhythmPulse: { value: 0 },
        uEdgeColor: { value: new THREE.Color(index === 1 ? VISUAL_THEME.cores.a.edgeColor : VISUAL_THEME.cores.b.edgeColor) },
        uOpacity: { value: theme.opacity }, uScenePresence: { value: 1 },
        uStateVisibility: { value: 1 }, uDebugVisibility: { value: 1 },
      },
      vertexShader: staffVertexShader, fragmentShader: staffFragmentShader,
      transparent: true, depthTest: index !== 0, depthWrite: false,
      blending: THREE.NormalBlending, toneMapped: false,
    });
    const staff = new THREE.LineSegments(geometry, material);
    staff.name = `VerticalStaff_${theme.name}`;
    staff.position.set(theme.position[0], theme.position[1], theme.position[2]);
    staff.rotation.set(theme.rotation[0], theme.rotation[1], theme.rotation[2]);
    staff.frustumCulled = false;
    staff.renderOrder = index === 0 ? 4 : 0;
    this.geometries.push(geometry); this.materials.push(material);
    this.staffMaterials.push(material); this.staffs.push(staff);
    return staff;
  }


  private createNotationField(): THREE.Points {
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(NOTATION_COUNT * 3);
    const seeds = new Float32Array(NOTATION_COUNT);
    const styles = new Float32Array(NOTATION_COUNT);
    const hands = new Float32Array(NOTATION_COUNT);
    const fingers = new Float32Array(NOTATION_COUNT);
    for (let index = 0; index < NOTATION_COUNT; index += 1) {
      const seed = seededUnit(index + 701);
      const hand = index % 2;
      const finger = Math.floor(index / 2) % 5;
      const fingerLane = (finger - 2) * 0.105;
      positions[index * 3] = (hand === 0 ? -0.34 : 0.34)
        + (hand === 0 ? fingerLane : -fingerLane)
        + (seededUnit(index + 191) - 0.5) * 0.035;
      positions[index * 3 + 1] = -0.59 + (seededUnit(index + 337) - 0.5) * 0.075;
      positions[index * 3 + 2] = 0.49 + (seededUnit(index + 541) - 0.5) * 0.055;
      seeds[index] = seed;
      styles[index] = index % 7 === 0 ? 2 : index % 3 === 0 ? 1 : 0;
      hands[index] = hand;
      fingers[index] = finger;
    }
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
    geometry.setAttribute('aStyle', new THREE.BufferAttribute(styles, 1));
    geometry.setAttribute('aHand', new THREE.BufferAttribute(hands, 1));
    geometry.setAttribute('aFinger', new THREE.BufferAttribute(fingers, 1));
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 }, uViewportHeight: { value: 1920 },
        uPulse: { value: 0 }, uFlow: { value: 0.1 },
        uResultKind: { value: 0 }, uScenePresence: { value: 1 }, uDebugVisibility: { value: 1 },
        uPressA: { value: new THREE.Vector4() }, uPressB: { value: new THREE.Vector4() },
        uResidueA: { value: new THREE.Vector4() }, uResidueB: { value: new THREE.Vector4() },
        uPinkyPress: { value: new THREE.Vector2() }, uPinkyResidue: { value: new THREE.Vector2() },
      },
      vertexShader: notationVertexShader, fragmentShader: notationFragmentShader,
      transparent: true, depthTest: false, depthWrite: false,
      blending: THREE.NormalBlending, toneMapped: false,
    });
    const notation = new THREE.Points(geometry, material);
    notation.name = 'SparseScoreNotation'; notation.frustumCulled = false; notation.renderOrder = 12;
    this.geometries.push(geometry); this.materials.push(material);
    return notation;
  }

  private createDesireMeteorField(): THREE.Points {
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(DESIRE_METEOR_COUNT * 3);
    const seeds = new Float32Array(DESIRE_METEOR_COUNT);
    for (let index = 0; index < DESIRE_METEOR_COUNT; index += 1) {
      const seed = seededUnit(index + 1201);
      positions[index * 3] = (seededUnit(index + 1307) - 0.5) * 1.52;
      positions[index * 3 + 1] = (seededUnit(index + 1451) - 0.5) * 3.8;
      positions[index * 3 + 2] = -1.4 - seededUnit(index + 1613) * 1.8;
      seeds[index] = seed;
    }
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 }, uFlow: { value: 0.1 }, uPulse: { value: 0 },
        uResultKind: { value: 0 },
      },
      vertexShader: desireMeteorVertexShader,
      fragmentShader: desireMeteorFragmentShader,
      transparent: true,
      depthTest: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    const points = new THREE.Points(geometry, material);
    points.name = 'DesireBackgroundMeteors';
    points.frustumCulled = false;
    points.renderOrder = -1;
    this.geometries.push(geometry);
    this.materials.push(material);
    return points;
  }

  private pushStaffVertex(
    positions: number[], phases: number[], alongValues: number[],
    theme: StaffTheme, along: number, lineX: number, phase: number,
  ): void {
    const y = (along - 0.5) * theme.width;
    const broadCurve = Math.sin(y * 0.34 + phase) * theme.curvature;
    const fineCurve = Math.sin(y * 0.15 - phase * 0.63) * theme.curvature * 0.32;
    positions.push(lineX + (broadCurve + fineCurve) * 0.09, y, broadCurve + fineCurve);
    phases.push(phase); alongValues.push(along);
  }
}

function resultVisualIndex(resultId: ResultLayer['resultId']): number {
  switch (resultId) {
    case 'collision': return 1;
    case 'soft-merge': return 2;
    case 'desire': return 3;
    case 'misreading': return 4;
    case 'refusal': return 5;
    case 'unreadable': return 6;
    default: return 0;
  }
}

function seededUnit(seed: number): number {
  const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return value - Math.floor(value);
}
