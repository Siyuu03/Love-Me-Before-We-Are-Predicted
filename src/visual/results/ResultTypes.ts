import type * as THREE from 'three';
import type { ContactInputSnapshot, ResultId, ResultSource } from '../../core/types';
import type { ResultLayer } from './ResultLayer';
import type { ResultSnapshot } from './ResultSnapshot';
import type { FrozenAppearancePair } from '../../vision/TeachableMachineInference';

export interface ResultModule {
  readonly id: ResultId;
  enter(snapshot: ResultSnapshot): void;
  update(dt: number): void;
  exit(): void;
  dispose(): void;
}

export interface ResultSelectionInput {
  readonly contact: ContactInputSnapshot | null;
  readonly resultHint?: ResultId;
  readonly confidence?: number;
  readonly appearancePair?: FrozenAppearancePair;
}

export interface ResolvedResult {
  readonly id: ResultId;
  readonly source: ResultSource;
}

export interface ResultContext {
  readonly layer: ResultLayer;
}

export interface ButterflyCapture {
  readonly position: THREE.Vector3;
  readonly velocity: THREE.Vector3;
  readonly state: 'FLYING' | 'APPROACHING' | 'PERCHED' | 'TAKING_OFF';
  readonly perchIndex: number;
}
