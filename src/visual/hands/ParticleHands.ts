import * as THREE from 'three';
import type { ChoreographyFrame } from '../choreography/ChoreographyController';
import type { SharedMotionFrame } from '../motion/SharedMotionField';
import { COLOR_PALETTE, VISUAL_THEME } from '../theme';
import { HandFormationController } from './HandFormationController';
import type { HandId, HandPointSource } from './HandPointSource';
import { ProceduralHandPointSource } from './ProceduralHandPointSource';
import type { ResultLayer } from '../results/ResultLayer';
import { HAND_ZONE_INDEX, type HandSemanticZone } from './HandSemanticZones';
import { HandPoseController } from './HandPoseController';
import { createHandGestureFrame, HandGestureLibrary } from './HandGestureLibrary';
import type { RhythmFrame } from '../../audio/RhythmDirector';

const vertexShader = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uViewportHeight;
  uniform vec3 uAnchorA;
  uniform vec3 uAnchorB;
  uniform vec2 uFormation;
  uniform vec2 uOpacity;
  uniform float uIdleTraceStrength;
  uniform float uApproach;
  uniform float uTension;
  uniform float uContactProgress;
  uniform float uSlowBreath;
  uniform float uSecondaryBreath;
  uniform float uTravelingWave;
  uniform float uContactPulse;
  uniform vec3 uHighlight;
  uniform vec3 uResultOffsetA;
  uniform vec3 uResultOffsetB;
  uniform vec2 uResultScale;
  uniform float uResultCompression;
  uniform float uResultExchange;
  uniform float uResultGhost;
  uniform float uResultGhostDepth;
  uniform float uResultTwist;
  uniform float uResultOpacity;
  uniform vec4 uCurlsA;
  uniform vec4 uCurlsB;
  uniform vec2 uPinkyCurl;
  uniform vec4 uFingerLiftA;
  uniform vec4 uFingerLiftB;
  uniform vec2 uPinkyLift;
  uniform vec4 uFingerDepthA;
  uniform vec4 uFingerDepthB;
  uniform vec2 uPinkyDepth;
  uniform vec2 uPalmTurn;
  uniform vec2 uWristBend;
  uniform vec2 uHandRoll;
  uniform vec2 uGestureSpread;
  uniform vec2 uGestureDepth;
  uniform vec2 uGestureLift;
  uniform float uBasePointScale;
  uniform float uClosePointScale;
  uniform float uFarPointScale;
  uniform float uMinPointPixels;
  uniform float uBaseAlpha;
  uniform float uCoreAlpha;
  uniform float uEmissiveIntensity;
  uniform float uMinLuminance;
  uniform float uResultVisibility;
  uniform float uContourAlpha;
  uniform float uContourPointScale;
  uniform float uFingertipBoost;
  uniform float uReadabilityCheck;
  uniform float uReadabilityOpacity;
  uniform vec4 uPianoPressA;
  uniform vec4 uPianoPressB;
  uniform vec2 uPinkyPress;
  uniform float uRhythmPulse;
  uniform float uRhythmRelation;
  uniform float uWristTear;
  uniform float uResultKind;

  attribute vec3 aScatter;
  attribute vec3 aColor;
  attribute vec3 aEdgeColor;
  attribute float aHand;
  attribute float aSeed;
  attribute float aEmphasis;
  attribute float aSize;
  attribute float aTrace;
  attribute float aZone;
  attribute float aContour;
  attribute float aShed;
  attribute float aFinger;
  attribute float aFingerT;

  varying vec3 vColor;
  varying vec3 vEdgeColor;
  varying float vOpacity;
  varying float vStyle;
  varying float vMinLuminance;
  varying float vEmissiveIntensity;
  varying float vContour;

  float selectFinger(vec4 firstFour, float pinky, float finger) {
    if (finger < 0.5) return firstFour.x;
    if (finger < 1.5) return firstFour.y;
    if (finger < 2.5) return firstFour.z;
    if (finger < 3.5) return firstFour.w;
    return pinky;
  }

  void main() {
    float handMix = step(0.5, aHand);
    float formation = mix(uFormation.x, uFormation.y, handMix);
    float opacity = mix(uOpacity.x, uOpacity.y, handMix);
    formation = mix(formation, 1.0, uReadabilityCheck);
    opacity = mix(opacity, uReadabilityOpacity, uReadabilityCheck);
    vec3 anchor = mix(uAnchorA, uAnchorB, handMix);
    float formationDelay = aFinger >= 0.0 ? 0.34 + fract(aSeed * 0.73) * 0.09
      : aZone > 0.5 ? 0.16 + fract(aSeed * 0.41) * 0.05 : 0.0;
    float stagedFormation = clamp((formation - formationDelay) / max(0.01, 1.0 - formationDelay), 0.0, 1.0);
    float easedFormation = stagedFormation * stagedFormation * (3.0 - 2.0 * stagedFormation);
    float idleMode = 1.0 - smoothstep(0.18, 0.42, formation);
    float traceSignal = 0.5
      + sin(uTime * 0.071 + aSeed * 1.41) * 0.31
      + sin(uTime * 0.029 + aSeed * 2.13) * 0.19;
    float tracePulse = smoothstep(0.48, 0.88, traceSignal);
    float traceFormation = aTrace * tracePulse * uIdleTraceStrength * idleMode;
    float particleFormation = max(easedFormation, traceFormation);

    // Source anatomy is already mirrored on X: A enters from the left, B from
    // the right, wrists outside and fingertips facing the shared keyboard.
    // Keeping these axes intact is essential: the score is vertical, not the
    // bodies performing around it.
    float inwardX = mix(1.0, -1.0, handMix);
    vec3 target = position;
    float digitMask = smoothstep(0.4, 0.94, aEmphasis);
    float palmMask = 1.0 - smoothstep(0.58, 0.86, aEmphasis);
    float anatomyRootTether = aFinger >= 0.0
      ? smoothstep(0.015, 0.3, aFingerT)
      : 1.0;
    float connectedDigitMask = digitMask * anatomyRootTether;
    float reachScale = mix(0.74, 0.91, uApproach);
    target.x *= mix(0.92, reachScale, connectedDigitMask);
    target.xy *= 0.93;
    target.x *= 1.0 + uSlowBreath * (0.006 + palmMask * 0.004);
    target.x += inwardX * uApproach * connectedDigitMask * 0.018;
    target.y += sin(aSeed * 1.17 + uTime * 0.19) * uTension * connectedDigitMask * 0.013;
    target.y += inwardX * (
      uSlowBreath * (0.006 + palmMask * 0.006)
      + uSecondaryBreath * connectedDigitMask * sin(aSeed * 0.71) * 0.01
    );
    target.z += uTravelingWave * (0.004 + connectedDigitMask * 0.004);
    target.z += mix(1.0, -1.0, handMix) * uTension * connectedDigitMask * 0.018;
    float motionPhase = mix(0.31, 1.73, handMix);
    float hesitation = sin(uTime * (0.31 + aSeed * 0.002) + motionPhase + aSeed) * 0.014;
    float secondary = sin(uTime * 0.17 + aSeed * 1.91) * 0.009;
    float angle = hesitation * (0.7 + aEmphasis * 0.55);
    mat2 rotation = mat2(cos(angle), -sin(angle), sin(angle), cos(angle));
    target.xy = rotation * target.xy;
    target.z += secondary * (0.35 + aEmphasis);
    target.z += sin(aSeed * 0.83 + uContactProgress * 2.1)
      * uContactProgress * digitMask * 0.008;
    float resultScale = mix(uResultScale.x, uResultScale.y, handMix);
    target *= resultScale;
    target.x *= 1.0 - uResultCompression * (0.35 + connectedDigitMask * 0.4);
    float contactSide = smoothstep(0.42, 0.96, connectedDigitMask);
    vec3 otherAnchor = mix(uAnchorB, uAnchorA, handMix);
    float exchangeMask = step(0.76, fract(aSeed * 3.71)) * contactSide;
    target += (otherAnchor - anchor) * uResultExchange * exchangeMask * 0.42;
    float twistAngle = uResultTwist * mix(1.0, -1.0, handMix)
      * (0.35 + connectedDigitMask * 0.65);
    mat2 resultRotation = mat2(cos(twistAngle), -sin(twistAngle), sin(twistAngle), cos(twistAngle));
    target.xy = resultRotation * target.xy;

    float thumbMask = 1.0 - smoothstep(0.2, 0.48, abs(aZone - 2.0));
    float indexMask = 1.0 - smoothstep(0.2, 0.48, abs(aZone - 3.0));
    float middleMask = 1.0 - smoothstep(0.2, 0.48, abs(aZone - 4.0));
    float ringMask = 1.0 - smoothstep(0.2, 0.48, abs(aZone - 5.0));
    float pinkyMask = 1.0 - smoothstep(0.2, 0.48, abs(aZone - 6.0));
    float tipMask = 1.0 - smoothstep(0.2, 0.48, abs(aZone - 7.0));
    float wristMask = 1.0 - smoothstep(0.2, 0.48, abs(aZone));
    float palmZoneMask = max(
      1.0 - smoothstep(0.2, 0.48, abs(aZone - 1.0)),
      1.0 - smoothstep(0.2, 0.48, abs(aZone - 8.0))
    );
    vec4 curls = mix(uCurlsA, uCurlsB, handMix);
    float pinkyCurl = mix(uPinkyCurl.x, uPinkyCurl.y, handMix);
    float curl = aFinger >= 0.0 ? selectFinger(curls, pinkyCurl, aFinger)
      : curls.x * thumbMask + curls.y * indexMask + curls.z * middleMask
        + curls.w * ringMask + pinkyCurl * pinkyMask;
    float articulatedMask = max(
      clamp(thumbMask + indexMask + middleMask + ringMask + pinkyMask + tipMask, 0.0, 1.0),
      step(0.0, aFinger)
    );
    float palmTurn = mix(uPalmTurn.x, uPalmTurn.y, handMix);
    float wristBend = mix(uWristBend.x, uWristBend.y, handMix);
    float handRoll = mix(uHandRoll.x, uHandRoll.y, handMix);
    float gestureSpread = mix(uGestureSpread.x, uGestureSpread.y, handMix);
    vec4 fingerLiftFour = mix(uFingerLiftA, uFingerLiftB, handMix);
    vec4 fingerDepthFour = mix(uFingerDepthA, uFingerDepthB, handMix);
    float fingerLift = selectFinger(fingerLiftFour, mix(uPinkyLift.x, uPinkyLift.y, handMix), max(0.0, aFinger));
    float fingerDepth = selectFinger(fingerDepthFour, mix(uPinkyDepth.x, uPinkyDepth.y, handMix), max(0.0, aFinger));
    float jointArc = sin(clamp(aFingerT, 0.0, 1.0) * 3.14159265);
    float fingerLengthMask = smoothstep(0.0, 0.96, aFingerT);
    // Finger roots share the palm's transform before progressively receiving
    // phalange articulation. This tether prevents a result pose from pulling a
    // joint cluster away from its metacarpal connection.
    float rootTether = anatomyRootTether;
    float pianoPress = selectFinger(
      mix(uPianoPressA, uPianoPressB, handMix),
      mix(uPinkyPress.x, uPinkyPress.y, handMix),
      max(0.0, aFinger)
    );
    // Rhythm profiles intentionally use small physical amplitudes. Convert
    // that shared event into a screen-readable key travel without changing
    // the audio cue, its timing, or the rhythm source itself.
    pianoPress = clamp(pianoPress * 9.0, 0.0, 1.0);
    // Three long-finger phalanges do not hinge as one rigid claw.  Their
    // proximal, middle and distal arcs overlap with deliberately offset peaks;
    // the thumb naturally receives only the first two because its sampled path
    // contains root, IP and tip.
    float proximalArc = sin(clamp(aFingerT * 1.45, 0.0, 1.0) * 1.5707963);
    float middleArc = sin(clamp((aFingerT - 0.18) / 0.64, 0.0, 1.0) * 3.14159265);
    float distalArc = smoothstep(0.56, 1.0, aFingerT);
    float bendEnvelope = proximalArc * 0.34 + middleArc * 0.42 + distalArc * 0.24;
    vec3 articulationOrigin = target;
    target.x *= 1.0 - curl * articulatedMask * rootTether
      * (0.035 + fingerLengthMask * 0.145);
    target.y -= curl * articulatedMask * rootTether * bendEnvelope
      * (0.024 + fingerLengthMask * 0.04);
    target.y += articulatedMask
      * (gestureSpread * (aFinger - 2.0) * fingerLengthMask * 0.034);
    target.z += articulatedMask * rootTether * curl * (0.026 + jointArc * 0.075);
    // Screen-down travel plus depth depression produces a readable
    // press–contact–rebound cycle over the horizontal keyboard. Finger phases
    // come from the shared rhythm frame, so they never descend as one block.
    target.y -= pianoPress * fingerLengthMask * (0.042 + distalArc * 0.065);
    target.z -= pianoPress * rootTether * (0.018 + jointArc * 0.085);
    target.x += inwardX * uRhythmRelation * articulatedMask * fingerLengthMask * 0.038;
    target.y += fingerLift * fingerLengthMask;
    target.z += fingerDepth * fingerLengthMask;
    // Cap each particle's articulation distance. The limit expands down the
    // finger, so tips remain expressive while roots cannot detach during pose
    // blending, refusal withdrawal or reset.
    vec3 articulationDelta = target - articulationOrigin;
    float articulationDistance = length(articulationDelta);
    float maxArticulation = mix(0.014, 0.19, rootTether)
      + distalArc * 0.025;
    target = articulationOrigin + articulationDelta
      * min(1.0, maxArticulation / max(0.0001, articulationDistance));
    float rootContinuity = articulatedMask * (1.0 - rootTether);
    float palmTurnMask = clamp(
      palmZoneMask + articulatedMask * mix(1.0, 0.7, rootTether),
      0.0,
      1.0
    );
    float palmAngle = palmTurn * palmTurnMask;
    mat2 palmRotation = mat2(cos(palmAngle), -sin(palmAngle), sin(palmAngle), cos(palmAngle));
    target.xz = palmRotation * target.xz;
    target.y += wristBend * (
      wristMask * 0.07 + palmZoneMask * 0.025 + rootContinuity * 0.025
    );
    target.z += mix(uGestureDepth.x, uGestureDepth.y, handMix)
      * (0.35 + max(palmTurnMask, rootContinuity) * 0.65);
    target.y += mix(uGestureLift.x, uGestureLift.y, handMix)
      * (0.3 + max(palmZoneMask, rootContinuity) * 0.7);
    mat2 handRollRotation = mat2(cos(handRoll), -sin(handRoll), sin(handRoll), cos(handRoll));
    target.xy = handRollRotation * target.xy;

    vec3 driftingScatter = aScatter;
    driftingScatter.x += sin(uTime * 0.13 + aSeed * 2.3) * 0.055;
    driftingScatter.y += sin(uTime * 0.11 + aSeed * 1.7) * 0.048;
    driftingScatter.z += cos(uTime * 0.09 + aSeed * 2.9) * 0.06;

    vec3 localPosition = mix(driftingScatter, target, particleFormation);
    // Wrist particles reuse aFingerT for their palm-ward progress, avoiding an
    // extra vertex attribute on GPUs limited to sixteen attributes.
    float wristProgress = aFinger < -0.5 ? aFingerT : 1.0;
    float wristFade = smoothstep(0.015, 0.34, wristProgress);
    float wristFragment = smoothstep(
      0.18 + uWristTear * 0.42,
      0.78,
      fract(aSeed * 2.73 + sin(uTime * 0.17 + aSeed) * 0.12)
    );
    float wristDust = wristMask * (1.0 - wristFade)
      * (0.36 + uWristTear * 0.64) * particleFormation;
    localPosition.x -= inwardX * wristDust * (0.035 + fract(aSeed * 1.19) * 0.085);
    localPosition.y += wristDust * sin(aSeed * 1.61 + uTime * 0.13) * 0.055;
    localPosition.z += wristDust * cos(aSeed * 1.37 + uTime * 0.11) * 0.07;
    float shedCycle = smoothstep(0.38, 0.94, 0.5 + 0.5 * sin(uTime * 0.31 + aSeed * 2.17));
    float shedAmount = aShed * shedCycle * particleFormation;
    localPosition += vec3(
      -inwardX * (0.018 + 0.026 * sin(aSeed * 0.73 + uTime * 0.12)),
      0.018 + 0.022 * sin(aSeed * 1.13),
      0.02 * cos(aSeed * 1.91)
    ) * shedAmount;
    vec3 sourceResultOffset = mix(uResultOffsetA, uResultOffsetB, handMix);
    vec3 resultOffset = sourceResultOffset;
    float ghostZone = clamp(wristMask + palmZoneMask + tipMask, 0.0, 1.0);
    float ghostMask = step(0.82, fract(aSeed * 5.13 + handMix * 0.37)) * ghostZone;
    localPosition += resultOffset;
    localPosition.z += ghostMask * uResultGhost * uResultGhostDepth;
    localPosition.x += ghostMask * uResultGhost * sin(aSeed * 1.71) * 0.07;
    float stylePick = fract(sin(aSeed * 12.9898) * 43758.5453);
    vStyle = step(0.65, stylePick) + step(0.88, stylePick) + step(0.98, stylePick);
    vec4 viewPosition = modelViewMatrix * vec4(anchor + localPosition, 1.0);
    float viewDepth = max(1.0, -viewPosition.z);
    float depthMix = clamp((viewDepth - 3.2) / 4.6, 0.0, 1.0);
    float depthScale = mix(uClosePointScale, uFarPointScale, depthMix);
    float styleScale = vStyle < 0.5 ? 0.82 : (vStyle < 1.5 ? 0.58 : (vStyle < 2.5 ? 1.04 : 1.28));
    float contourScale = mix(1.0, uContourPointScale, aContour);
    float tipScale = mix(1.0, uFingertipBoost, tipMask * aContour);
    float pointSize = aSize * uBasePointScale * depthScale * styleScale * contourScale * tipScale
      * (0.76 + aEmphasis * 0.34) * uViewportHeight / viewDepth
      * mix(1.0, 0.54 + wristFade * 0.46, wristMask)
      * (1.0 + uRhythmPulse * 0.025 * aEmphasis);
    gl_PointSize = min(3.35, max(uMinPointPixels, pointSize));
    gl_Position = projectionMatrix * viewPosition;

    vColor = aColor;
    vEdgeColor = aEdgeColor;
    float traceVisibility = smoothstep(0.52, 0.82, aTrace) * (0.24 + tracePulse * 0.76);
    float visibilityMask = mix(1.0, traceVisibility, idleMode);
    float porosity = mix(0.12, 1.0, step(0.16, fract(stylePick * 7.13 + aSeed * 0.19)));
    float styleOpacity = vStyle < 0.5 ? 0.82 : (vStyle < 1.5 ? 0.42 : (vStyle < 2.5 ? 0.94 : 1.0));
    vOpacity = opacity * uBaseAlpha * styleOpacity * uResultVisibility
      * mix(1.0, uContourAlpha, aContour)
      * mix(1.0, 0.54, shedAmount)
      * (1.0 + uTension * 0.08 + uContactPulse * 0.05)
      * visibilityMask
      * (0.36 + aEmphasis * 0.64)
      * (0.34 + particleFormation * 0.66)
      * mix(porosity, 1.0, smoothstep(0.78, 1.0, aEmphasis))
      * uResultOpacity
      * mix(1.0, wristFade, wristMask)
      * mix(1.0, 0.28 + wristFragment * 0.72, wristMask * uWristTear)
      * mix(1.0, 0.52 + uResultGhost * 0.34, ghostMask * uResultGhost);
    vMinLuminance = uMinLuminance;
    vEmissiveIntensity = uEmissiveIntensity * mix(0.88, uCoreAlpha, smoothstep(0.72, 1.0, aEmphasis));
    vContour = aContour;
  }
`;

const fragmentShader = /* glsl */ `
  precision highp float;

  uniform vec3 uHighlight;
  uniform float uResultKind;

  varying vec3 vColor;
  varying vec3 vEdgeColor;
  varying float vOpacity;
  varying float vStyle;
  varying float vMinLuminance;
  varying float vEmissiveIntensity;
  varying float vContour;

  void main() {
    float radius = length(gl_PointCoord - vec2(0.5)) * 2.0;
    if (radius > 1.0) discard;
    vec2 centered = gl_PointCoord - vec2(0.5);
    float horizontalRay = exp(-abs(centered.y) * 88.0)
      * (1.0 - smoothstep(0.11, 0.5, abs(centered.x)));
    float verticalRay = exp(-abs(centered.x) * 88.0)
      * (1.0 - smoothstep(0.11, 0.5, abs(centered.y)));
    float rays = (horizontalRay + verticalRay) * step(2.5, vStyle);
    float alpha = ((1.0 - smoothstep(0.055, 0.60, radius)) * 0.82 + rays * 0.12)
      * vOpacity;
    float center = 1.0 - smoothstep(0.0, 0.085, radius);
    vec3 metallic = mix(vEdgeColor, vColor, 0.25 + center * 0.75);
    if (uResultKind > 0.5 && uResultKind < 1.5) {
      metallic = mix(metallic, mix(vec3(0.64, 0.76, 0.88), vec3(0.78, 0.64, 0.7), vContour), 0.11);
    } else if (uResultKind < 2.5 && uResultKind > 1.5) {
      metallic = mix(metallic, mix(vec3(0.82, 0.78, 0.7), vec3(0.57, 0.72, 0.8), vContour), 0.08);
    } else if (uResultKind < 3.5 && uResultKind > 2.5) {
      // Desire's heat belongs to the distant meteor field and key reflections,
      // never to the bodies being classified.
      metallic = mix(metallic, mix(vec3(0.77, 0.8, 0.82), vec3(0.62, 0.7, 0.76), vContour), 0.035);
    } else if (uResultKind < 4.5 && uResultKind > 3.5) {
      metallic = mix(metallic, mix(vec3(0.48, 0.61, 0.75), vec3(0.58, 0.5, 0.66), vContour), 0.12);
    } else if (uResultKind < 5.5 && uResultKind > 4.5) {
      metallic = mix(metallic, mix(vec3(0.68, 0.58, 0.42), vec3(0.48, 0.56, 0.67), vContour), 0.09);
    } else if (uResultKind > 5.5) {
      metallic = mix(metallic, mix(vec3(0.72, 0.74, 0.82), vec3(0.46, 0.65, 0.7), vContour), 0.1);
    }
    metallic = mix(metallic, vEdgeColor, vContour * 0.28);
    vec3 color = mix(metallic, uHighlight, center * 0.2)
      * (0.9 + center * 0.18 + rays * 0.16) * vEmissiveIntensity
      * mix(1.0, 1.12, vContour);
    float luminance = dot(color, vec3(0.2126, 0.7152, 0.0722));
    color *= max(1.0, vMinLuminance / max(0.001, luminance));
    gl_FragColor = vec4(color, min(1.0, alpha));
  }
`;

export class ParticleHands {
  readonly object3d: THREE.Points;
  readonly particleCount: number;
  readonly particleCountA: number;
  readonly particleCountB: number;
  private readonly geometry = new THREE.BufferGeometry();
  private readonly material: THREE.ShaderMaterial;
  private readonly formation = new HandFormationController();
  private readonly pose = new HandPoseController();
  private readonly preludeGesture = createHandGestureFrame();

  constructor(source: HandPointSource = new ProceduralHandPointSource()) {
    const sampleA = source.createSamples('A', VISUAL_THEME.hands.a.density);
    const sampleB = source.createSamples('B', VISUAL_THEME.hands.b.density);
    this.particleCountA = sampleA.particles.length;
    this.particleCountB = sampleB.particles.length;
    this.particleCount = this.particleCountA + this.particleCountB;

    const positions: number[] = [];
    const scatter: number[] = [];
    const colors: number[] = [];
    const edgeColors: number[] = [];
    const hands: number[] = [];
    const seeds: number[] = [];
    const emphasis: number[] = [];
    const sizes: number[] = [];
    const traces: number[] = [];
    const zones: number[] = [];
    const contours: number[] = [];
    const shed: number[] = [];
    const fingers: number[] = [];
    const fingerProgress: number[] = [];

    this.appendSamples(
      sampleA.particles,
      'A',
      positions,
      scatter,
      colors,
      edgeColors,
      hands,
      seeds,
      emphasis,
      sizes,
      traces,
      zones,
      contours,
      shed,
      fingers,
      fingerProgress,
    );
    this.appendSamples(
      sampleB.particles,
      'B',
      positions,
      scatter,
      colors,
      edgeColors,
      hands,
      seeds,
      emphasis,
      sizes,
      traces,
      zones,
      contours,
      shed,
      fingers,
      fingerProgress,
    );

    this.geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    this.geometry.setAttribute('aScatter', new THREE.Float32BufferAttribute(scatter, 3));
    this.geometry.setAttribute('aColor', new THREE.Float32BufferAttribute(colors, 3));
    this.geometry.setAttribute('aEdgeColor', new THREE.Float32BufferAttribute(edgeColors, 3));
    this.geometry.setAttribute('aHand', new THREE.Float32BufferAttribute(hands, 1));
    this.geometry.setAttribute('aSeed', new THREE.Float32BufferAttribute(seeds, 1));
    this.geometry.setAttribute('aEmphasis', new THREE.Float32BufferAttribute(emphasis, 1));
    this.geometry.setAttribute('aSize', new THREE.Float32BufferAttribute(sizes, 1));
    this.geometry.setAttribute('aTrace', new THREE.Float32BufferAttribute(traces, 1));
    this.geometry.setAttribute('aZone', new THREE.Float32BufferAttribute(zones, 1));
    this.geometry.setAttribute('aContour', new THREE.Float32BufferAttribute(contours, 1));
    this.geometry.setAttribute('aShed', new THREE.Float32BufferAttribute(shed, 1));
    this.geometry.setAttribute('aFinger', new THREE.Float32BufferAttribute(fingers, 1));
    this.geometry.setAttribute('aFingerT', new THREE.Float32BufferAttribute(fingerProgress, 1));

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uViewportHeight: { value: 1080 },
        uAnchorA: { value: new THREE.Vector3() },
        uAnchorB: { value: new THREE.Vector3() },
        uFormation: {
          value: new THREE.Vector2(
            VISUAL_THEME.hands.idleFormation,
            VISUAL_THEME.hands.idleFormation,
          ),
        },
        uOpacity: {
          value: new THREE.Vector2(
            VISUAL_THEME.hands.idleOpacity,
            VISUAL_THEME.hands.idleOpacity,
          ),
        },
        uIdleTraceStrength: { value: VISUAL_THEME.hands.idleTraceStrength },
        uApproach: { value: 0 },
        uTension: { value: 0 },
        uContactProgress: { value: 0 },
        uSlowBreath: { value: 0 },
        uSecondaryBreath: { value: 0 },
        uTravelingWave: { value: 0 },
        uContactPulse: { value: 0 },
        uHighlight: { value: new THREE.Color(COLOR_PALETTE.highlight) },
        uResultOffsetA: { value: new THREE.Vector3() },
        uResultOffsetB: { value: new THREE.Vector3() },
        uResultScale: { value: new THREE.Vector2(1, 1) },
        uResultCompression: { value: 0 }, uResultExchange: { value: 0 },
        uResultGhost: { value: 0 }, uResultGhostDepth: { value: 0 },
        uResultTwist: { value: 0 }, uResultOpacity: { value: 1 },
        uCurlsA: { value: new THREE.Vector4() },
        uCurlsB: { value: new THREE.Vector4() },
        uPinkyCurl: { value: new THREE.Vector2() },
        uFingerLiftA: { value: new THREE.Vector4() },
        uFingerLiftB: { value: new THREE.Vector4() },
        uPinkyLift: { value: new THREE.Vector2() },
        uFingerDepthA: { value: new THREE.Vector4() },
        uFingerDepthB: { value: new THREE.Vector4() },
        uPinkyDepth: { value: new THREE.Vector2() },
        uPalmTurn: { value: new THREE.Vector2() },
        uWristBend: { value: new THREE.Vector2() },
        uHandRoll: { value: new THREE.Vector2() },
        uGestureSpread: { value: new THREE.Vector2() },
        uGestureDepth: { value: new THREE.Vector2() },
        uGestureLift: { value: new THREE.Vector2() },
        uBasePointScale: { value: VISUAL_THEME.hands.visibility.basePointScale },
        uClosePointScale: { value: VISUAL_THEME.hands.visibility.closePointScale },
        uFarPointScale: { value: VISUAL_THEME.hands.visibility.farPointScale },
        uMinPointPixels: { value: VISUAL_THEME.hands.visibility.minScreenPixels },
        uBaseAlpha: { value: VISUAL_THEME.hands.visibility.baseAlpha },
        uCoreAlpha: { value: VISUAL_THEME.hands.visibility.coreAlpha },
        uEmissiveIntensity: { value: VISUAL_THEME.hands.visibility.emissiveIntensity },
        uMinLuminance: { value: VISUAL_THEME.hands.visibility.minLuminance },
        uResultVisibility: { value: 1 },
        uContourAlpha: { value: VISUAL_THEME.hands.visibility.contourAlpha },
        uContourPointScale: { value: VISUAL_THEME.hands.visibility.contourPointScale },
        uFingertipBoost: { value: VISUAL_THEME.hands.visibility.fingertipBoost },
        uReadabilityCheck: { value: 0 },
        uReadabilityOpacity: { value: VISUAL_THEME.hands.visibility.readabilityOpacity },
        uPianoPressA: { value: new THREE.Vector4() },
        uPianoPressB: { value: new THREE.Vector4() },
        uPinkyPress: { value: new THREE.Vector2() },
        uRhythmPulse: { value: 0 },
        uRhythmRelation: { value: 0 },
        uWristTear: { value: 0 },
        uResultKind: { value: 0 },
      },
      vertexShader,
      fragmentShader,
      transparent: true,
      depthTest: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
      toneMapped: false,
    });

    this.object3d = new THREE.Points(this.geometry, this.material);
    this.object3d.name = 'ParticleHands';
    this.object3d.frustumCulled = false;
    this.object3d.renderOrder = 2;
  }

  update(
    deltaSeconds: number,
    sharedMotion: SharedMotionFrame,
    choreography: ChoreographyFrame,
    result: ResultLayer,
    rhythm: RhythmFrame,
  ): void {
    const formation = this.formation.update(deltaSeconds, choreography);
    if (!result.resultId) {
      HandGestureLibrary.samplePrelude(
        choreography.approach > 0.15
          ? Math.max(choreography.approach, choreography.contactProgress)
          : 0,
        this.preludeGesture,
      );
    }
    const poseTarget = result.resultId ? result.gesture : this.preludeGesture;
    const pose = this.pose.update(poseTarget, deltaSeconds);
    this.material.uniforms.uTime.value = sharedMotion.globalTime;
    this.material.uniforms.uAnchorA.value.copy(sharedMotion.handCenterA);
    this.material.uniforms.uAnchorB.value.copy(sharedMotion.handCenterB);
    this.material.uniforms.uFormation.value.set(
      formation.formationA,
      formation.formationB,
    );
    this.material.uniforms.uOpacity.value.set(formation.opacityA, formation.opacityB);
    this.material.uniforms.uApproach.value = choreography.approach;
    this.material.uniforms.uTension.value = choreography.tension;
    this.material.uniforms.uContactProgress.value = choreography.contactProgress;
    this.material.uniforms.uSlowBreath.value = sharedMotion.slowBreath;
    this.material.uniforms.uSecondaryBreath.value = sharedMotion.secondaryBreath;
    this.material.uniforms.uTravelingWave.value = sharedMotion.travelingWave;
    this.material.uniforms.uContactPulse.value = sharedMotion.contactPulse;
    this.material.uniforms.uResultOffsetA.value.copy(result.handOffsetA);
    this.material.uniforms.uResultOffsetB.value.copy(result.handOffsetB);
    this.material.uniforms.uResultScale.value.set(result.handScaleA, result.handScaleB);
    this.material.uniforms.uResultCompression.value = result.handCompression;
    this.material.uniforms.uResultExchange.value = result.handExchange;
    this.material.uniforms.uResultGhost.value = result.handGhost;
    this.material.uniforms.uResultGhostDepth.value = result.handGhostDepth;
    this.material.uniforms.uResultTwist.value = result.handTwist;
    this.material.uniforms.uResultOpacity.value = result.handOpacity;
    this.material.uniforms.uCurlsA.value.set(
      pose.curlsA[0], pose.curlsA[1], pose.curlsA[2], pose.curlsA[3],
    );
    this.material.uniforms.uCurlsB.value.set(
      pose.curlsB[0], pose.curlsB[1], pose.curlsB[2], pose.curlsB[3],
    );
    this.material.uniforms.uPinkyCurl.value.set(pose.curlsA[4], pose.curlsB[4]);
    this.material.uniforms.uFingerLiftA.value.set(pose.fingerLiftA[0], pose.fingerLiftA[1], pose.fingerLiftA[2], pose.fingerLiftA[3]);
    this.material.uniforms.uFingerLiftB.value.set(pose.fingerLiftB[0], pose.fingerLiftB[1], pose.fingerLiftB[2], pose.fingerLiftB[3]);
    this.material.uniforms.uPinkyLift.value.set(pose.fingerLiftA[4], pose.fingerLiftB[4]);
    this.material.uniforms.uFingerDepthA.value.set(pose.fingerDepthA[0], pose.fingerDepthA[1], pose.fingerDepthA[2], pose.fingerDepthA[3]);
    this.material.uniforms.uFingerDepthB.value.set(pose.fingerDepthB[0], pose.fingerDepthB[1], pose.fingerDepthB[2], pose.fingerDepthB[3]);
    this.material.uniforms.uPinkyDepth.value.set(pose.fingerDepthA[4], pose.fingerDepthB[4]);
    this.material.uniforms.uPalmTurn.value.set(pose.palmTurnA, pose.palmTurnB);
    this.material.uniforms.uWristBend.value.set(pose.wristBendA, pose.wristBendB);
    this.material.uniforms.uHandRoll.value.set(pose.handRollA, pose.handRollB);
    this.material.uniforms.uGestureSpread.value.set(pose.spreadA, pose.spreadB);
    this.material.uniforms.uGestureDepth.value.set(pose.depthA, pose.depthB);
    this.material.uniforms.uGestureLift.value.set(pose.liftA, pose.liftB);
    this.material.uniforms.uResultVisibility.value = result.resultId
      ? VISUAL_THEME.hands.visibility.resultBoost
      : 1;
    this.material.uniforms.uPianoPressA.value.set(
      rhythm.fingerPressA[0], rhythm.fingerPressA[1], rhythm.fingerPressA[2], rhythm.fingerPressA[3],
    );
    this.material.uniforms.uPianoPressB.value.set(
      rhythm.fingerPressB[0], rhythm.fingerPressB[1], rhythm.fingerPressB[2], rhythm.fingerPressB[3],
    );
    this.material.uniforms.uPinkyPress.value.set(rhythm.fingerPressA[4], rhythm.fingerPressB[4]);
    this.material.uniforms.uRhythmPulse.value = rhythm.pulse;
    this.material.uniforms.uRhythmRelation.value = rhythm.relationForce;
    this.material.uniforms.uWristTear.value = rhythm.wristTear;
    this.material.uniforms.uResultKind.value = resultVisualIndex(result.resultId);
  }

  setViewportHeight(viewportHeight: number): void {
    this.material.uniforms.uViewportHeight.value = viewportHeight;
  }

  setReadabilityCheck(active: boolean): void {
    this.material.uniforms.uReadabilityCheck.value = active ? 1 : 0;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }

  private appendSamples(
    particles: readonly {
      readonly position: THREE.Vector3;
      readonly emphasis: number;
      readonly sizeVariation: number;
      readonly traceBias: number;
      readonly zone: HandSemanticZone;
      readonly fingerIndex?: number;
      readonly fingerT?: number;
      readonly wristT?: number;
    }[],
    hand: HandId,
    positions: number[],
    scatter: number[],
    colors: number[],
    edgeColors: number[],
    hands: number[],
    seeds: number[],
    emphasis: number[],
    sizes: number[],
    traces: number[],
    zones: number[],
    contours: number[],
    shed: number[],
    fingers: number[],
    fingerProgress: number[],
  ): void {
    const handTheme = hand === 'A' ? VISUAL_THEME.hands.a : VISUAL_THEME.hands.b;
    const random = createSeededRandom(hand === 'A' ? 0x53a9 : 0x79bd);
    const contourIndices = selectContourIndices(
      particles,
      VISUAL_THEME.hands.visibility.contourCountPerHand,
    );

    particles.forEach((particle, index) => {
      particle.position.toArray(positions, positions.length);
      const radius = VISUAL_THEME.hands.scatterRadius * (0.28 + Math.pow(random(), 0.62));
      const theta = random() * Math.PI * 2;
      const phi = Math.acos(2 * random() - 1);
      scatter.push(
        Math.sin(phi) * Math.cos(theta) * radius,
        Math.sin(phi) * Math.sin(theta) * radius,
        Math.cos(phi) * radius * 0.72,
      );
      const coreColor = new THREE.Color(
        handTheme.coreColors[Math.floor(random() * handTheme.coreColors.length)],
      ).multiplyScalar(handTheme.brightness);
      const edgeColor = new THREE.Color(
        handTheme.edgeColors[Math.floor(random() * handTheme.edgeColors.length)],
      ).multiplyScalar(handTheme.brightness * 0.94);
      colors.push(coreColor.r, coreColor.g, coreColor.b);
      edgeColors.push(edgeColor.r, edgeColor.g, edgeColor.b);
      hands.push(hand === 'A' ? 0 : 1);
      seeds.push(index * 0.013 + random() * 7.1);
      emphasis.push(particle.emphasis);
      sizes.push(VISUAL_THEME.hands.particleSize * particle.sizeVariation);
      traces.push(particle.traceBias);
      zones.push(HAND_ZONE_INDEX[particle.zone]);
      fingers.push(particle.fingerIndex ?? -1);
      fingerProgress.push(particle.fingerT ?? particle.wristT ?? 0);
      contours.push(contourIndices.has(index) ? 1 : 0);
      const shedEligible = particle.zone === 'palmEdge'
        || particle.zone === 'wrist'
        || particle.zone === 'fingertips';
      shed.push(
        shedEligible && seededUnit(index + (hand === 'A' ? 311 : 719))
          < VISUAL_THEME.hands.visibility.shedFraction * 2.4
          ? 1
          : 0,
      );
    });
  }
}

function selectContourIndices(
  particles: readonly { readonly zone: HandSemanticZone }[],
  count: number,
): ReadonlySet<number> {
  const candidates: number[] = [];
  particles.forEach((particle, index) => {
    if (
      particle.zone === 'fingertips'
      || particle.zone === 'palmEdge'
      || particle.zone === 'wrist'
      || particle.zone === 'thumb'
      || particle.zone === 'index'
      || particle.zone === 'middle'
      || particle.zone === 'ring'
      || particle.zone === 'pinky'
      || particle.zone === 'knuckles'
    ) candidates.push(index);
  });
  const selected = new Set<number>();
  const safeCount = Math.min(count, candidates.length);
  for (let index = 0; index < safeCount; index += 1) {
    selected.add(candidates[Math.floor((index + 0.5) * candidates.length / safeCount)]);
  }
  return selected;
}

function seededUnit(seed: number): number {
  const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return value - Math.floor(value);
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
