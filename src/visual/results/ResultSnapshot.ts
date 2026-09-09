import * as THREE from 'three';
import type { ContactInputSnapshot, ResultId } from '../../core/types';
import type { SharedMotionFrame } from '../motion/SharedMotionField';
import type { ButterflyCapture } from './ResultTypes';

export interface ResultSnapshot {
  readonly canonical: boolean;
  readonly seed: number;
  readonly capturedAt: number;
  readonly contact: ContactInputSnapshot | null;
  readonly resultHint?: ResultId;
  readonly confidence?: number;
  readonly coreA: THREE.Vector3;
  readonly coreB: THREE.Vector3;
  readonly coreVelocityA: THREE.Vector3;
  readonly coreVelocityB: THREE.Vector3;
  readonly handCenterA: THREE.Vector3;
  readonly handCenterB: THREE.Vector3;
  readonly wristA: THREE.Vector3;
  readonly wristB: THREE.Vector3;
  readonly fingertipsA: readonly THREE.Vector3[];
  readonly fingertipsB: readonly THREE.Vector3[];
  readonly sharedTime: number;
  readonly slowBreath: number;
  readonly secondaryBreath: number;
  readonly staffPhase: number;
  readonly orbitPhase: number;
  readonly butterflies: readonly ButterflyCapture[];
  readonly cameraPosition: THREE.Vector3;
  readonly cameraTarget: THREE.Vector3;
  readonly handParticleCounts: readonly [number, number];
  readonly handFormation: readonly [number, number];
  readonly particleBaseline: 'shared-buffer-geometry';
  readonly staffAmplitude: readonly [number, number, number];
  readonly orbitAlignment: number;
  readonly bridgeBaseline: number;
  readonly filamentBaseline: number;
}

export function captureResultSnapshot(args: {
  readonly shared: SharedMotionFrame;
  readonly contact: ContactInputSnapshot | null;
  readonly butterflies: readonly ButterflyCapture[];
  readonly cameraPosition: THREE.Vector3;
  readonly cameraTarget: THREE.Vector3;
  readonly handParticleCounts: readonly [number, number];
  readonly canonical: boolean;
  readonly handFormation: readonly [number, number];
  readonly orbitAlignment: number;
  readonly coreVelocities: readonly [THREE.Vector3, THREE.Vector3];
}): ResultSnapshot {
  const sequence = args.contact?.sequenceId ?? 47;
  const seed = (sequence * 2654435761 + Math.round(args.shared.globalTime * 1000)) >>> 0;
  return Object.freeze({
    canonical: args.canonical,
    seed,
    capturedAt: args.shared.globalTime,
    contact: args.contact,
    coreA: args.shared.coreA.clone(), coreB: args.shared.coreB.clone(),
    coreVelocityA: args.coreVelocities[0].clone(), coreVelocityB: args.coreVelocities[1].clone(),
    handCenterA: args.shared.handCenterA.clone(), handCenterB: args.shared.handCenterB.clone(),
    wristA: args.shared.wristA.clone(), wristB: args.shared.wristB.clone(),
    fingertipsA: Object.freeze(args.shared.fingertipsA.map((point) => point.clone())),
    fingertipsB: Object.freeze(args.shared.fingertipsB.map((point) => point.clone())),
    sharedTime: args.shared.globalTime,
    slowBreath: args.shared.slowBreath,
    secondaryBreath: args.shared.secondaryBreath,
    staffPhase: args.shared.travelingWave,
    orbitPhase: args.shared.turbulence,
    butterflies: Object.freeze(args.butterflies),
    cameraPosition: args.cameraPosition.clone(), cameraTarget: args.cameraTarget.clone(),
    handParticleCounts: args.handParticleCounts,
    handFormation: args.handFormation,
    particleBaseline: 'shared-buffer-geometry' as const,
    staffAmplitude: Object.freeze([0.12, 0.105, 0.08] as const),
    orbitAlignment: args.orbitAlignment,
    bridgeBaseline: 0,
    filamentBaseline: 0,
  });
}
