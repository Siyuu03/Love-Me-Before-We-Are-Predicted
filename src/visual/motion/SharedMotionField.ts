import * as THREE from 'three';
import type { InstallationState, StateSnapshot } from '../../core/types';
import type { ChoreographyFrame } from '../choreography/ChoreographyController';
import { VISUAL_THEME } from '../theme';

const TWO_PI = Math.PI * 2;
// Both visual participants use right hands: thumb uppermost, then index,
// middle, ring and the clearly shorter pinky below.
const FINGER_SIDE = [0.345, 0.045, -0.075, -0.215, -0.325] as const;
const FINGER_LENGTH = [0.315, 0.72, 0.82, 0.72, 0.54] as const;
const FINGER_Z = [0.105, 0.15, 0.165, 0.19, 0.17] as const;

export interface SharedMotionFrame {
  globalTime: number;
  slowBreath: number;
  secondaryBreath: number;
  travelingWave: number;
  turbulence: number;
  contactPulse: number;
  contactRippleRadius: number;
  resetProgress: number;
  readonly coreA: THREE.Vector3;
  readonly coreB: THREE.Vector3;
  readonly sharedCenter: THREE.Vector3;
  readonly contactPoint: THREE.Vector3;
  readonly handCenterA: THREE.Vector3;
  readonly handCenterB: THREE.Vector3;
  readonly wristA: THREE.Vector3;
  readonly wristB: THREE.Vector3;
  readonly fingertipsA: readonly THREE.Vector3[];
  readonly fingertipsB: readonly THREE.Vector3[];
  readonly perchPointsA: readonly THREE.Vector3[];
  readonly perchPointsB: readonly THREE.Vector3[];
}

export class SharedMotionField {
  private readonly fingertipsA = createVectorArray(5);
  private readonly fingertipsB = createVectorArray(5);
  private readonly perchPointsA = createVectorArray(4);
  private readonly perchPointsB = createVectorArray(4);
  private readonly frame: SharedMotionFrame = {
    globalTime: 0,
    slowBreath: 0,
    secondaryBreath: 0,
    travelingWave: 0,
    turbulence: 0,
    contactPulse: 0,
    contactRippleRadius: 0,
    resetProgress: 0,
    coreA: new THREE.Vector3(-0.64, -0.46, 0.18),
    coreB: new THREE.Vector3(0.64, -0.46, -0.04),
    sharedCenter: new THREE.Vector3(),
    contactPoint: new THREE.Vector3(),
    handCenterA: new THREE.Vector3(),
    handCenterB: new THREE.Vector3(),
    wristA: new THREE.Vector3(),
    wristB: new THREE.Vector3(),
    fingertipsA: this.fingertipsA,
    fingertipsB: this.fingertipsB,
    perchPointsA: this.perchPointsA,
    perchPointsB: this.perchPointsB,
  };
  private previousState: InstallationState = 'IDLE';
  private contactPulseAge = Number.POSITIVE_INFINITY;

  update(
    deltaSeconds: number,
    snapshot: StateSnapshot,
    choreography: ChoreographyFrame,
  ): SharedMotionFrame {
    const safeDelta = Math.min(Math.max(deltaSeconds, 0), 0.1);
    this.frame.globalTime += safeDelta;
    const time = this.frame.globalTime;

    this.frame.slowBreath = Math.sin(
      (time / VISUAL_THEME.motion.slowBreathPeriod) * TWO_PI - 0.72,
    );
    this.frame.secondaryBreath = Math.sin(
      (time / VISUAL_THEME.motion.secondaryBreathPeriod) * TWO_PI + 1.37,
    );
    this.frame.travelingWave = Math.sin(
      (time / VISUAL_THEME.motion.travelingWavePeriod) * TWO_PI + 0.28,
    );
    this.frame.turbulence =
      Math.sin((time / VISUAL_THEME.motion.environmentalDriftPeriod) * TWO_PI + 2.1) * 0.62 +
      Math.sin((time / 7.9) * TWO_PI + 0.44) * 0.38;

    if (snapshot.state === 'CONTACT' && this.previousState !== 'CONTACT') {
      this.contactPulseAge = 0;
    } else {
      this.contactPulseAge += safeDelta;
    }
    const pulseEnvelope = Math.exp(-this.contactPulseAge * 1.55);
    this.frame.contactPulse = Number.isFinite(pulseEnvelope)
      ? pulseEnvelope * (0.72 + Math.sin(this.contactPulseAge * TWO_PI * 1.18) * 0.28)
      : 0;
    this.frame.contactRippleRadius = Number.isFinite(this.contactPulseAge)
      ? this.contactPulseAge * 1.42
      : 0;
    this.frame.resetProgress = snapshot.resetProgress;
    this.previousState = snapshot.state;

    const response = 0.86 + choreography.tension * 0.14;
    this.frame.slowBreath *= response;
    return this.frame;
  }

  updateReferences(
    anchors: readonly [THREE.Vector3, THREE.Vector3],
    choreography: ChoreographyFrame,
  ): SharedMotionFrame {
    const breathY = this.frame.slowBreath * 0.012;
    this.frame.coreA.copy(anchors[0]);
    this.frame.coreB.copy(anchors[1]);
    this.frame.handCenterA.copy(anchors[0]).addScaledVector(UP, breathY);
    this.frame.handCenterB.copy(anchors[1]).addScaledVector(UP, -breathY * 0.72);
    this.frame.sharedCenter.copy(anchors[0]).lerp(anchors[1], 0.5);

    const handScale = 0.82;
    const reachScale = THREE.MathUtils.lerp(0.74, 0.91, choreography.approach);
    this.frame.wristA.copy(anchors[0]).addScaledVector(RIGHT, -0.43 * handScale);
    this.frame.wristB.copy(anchors[1]).addScaledVector(RIGHT, 0.43 * handScale);
    this.frame.wristA.y += breathY;
    this.frame.wristB.y -= breathY * 0.72;

    for (let index = 0; index < 5; index += 1) {
      const side = FINGER_SIDE[index] * handScale * (index === 0 ? 0.86 : 1);
      const length = FINGER_LENGTH[index] * reachScale * handScale;
      const z = FINGER_Z[index] * handScale;
      this.fingertipsA[index].set(
        anchors[0].x + length,
        anchors[0].y + side + breathY,
        anchors[0].z + z,
      );
      this.fingertipsB[index].set(
        anchors[1].x - length,
        anchors[1].y + side - breathY * 0.72,
        anchors[1].z - z,
      );
    }
    this.frame.contactPoint.copy(this.fingertipsA[1]).lerp(this.fingertipsB[1], 0.5);

    this.setPerchPoints('A', this.frame.handCenterA, this.frame.wristA, this.perchPointsA);
    this.setPerchPoints('B', this.frame.handCenterB, this.frame.wristB, this.perchPointsB);
    return this.frame;
  }

  getFrame(): SharedMotionFrame {
    return this.frame;
  }

  private setPerchPoints(
    hand: 'A' | 'B',
    center: THREE.Vector3,
    wrist: THREE.Vector3,
    target: readonly THREE.Vector3[],
  ): void {
    const direction = hand === 'A' ? -1 : 1;
    const depth = hand === 'A' ? 1 : -1;
    target[0].copy(wrist).addScaledVector(UP, 0.08).addScaledVector(FORWARD, depth * 0.1);
    target[1].copy(center).addScaledVector(UP, 0.15).addScaledVector(FORWARD, depth * 0.12);
    target[2].copy(center).setX(center.x - direction * 0.38).setY(center.y - 0.08)
      .addScaledVector(FORWARD, depth * 0.13);
    target[3].copy(center).setX(center.x - direction * 0.12).setY(center.y + 0.25)
      .addScaledVector(FORWARD, depth * 0.12);
  }
}

const UP = new THREE.Vector3(0, 1, 0);
const RIGHT = new THREE.Vector3(1, 0, 0);
const FORWARD = new THREE.Vector3(0, 0, 1);

function createVectorArray(length: number): THREE.Vector3[] {
  return Array.from({ length }, () => new THREE.Vector3());
}
