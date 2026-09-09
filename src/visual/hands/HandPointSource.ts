import type * as THREE from 'three';
import type { HandSemanticZone } from './HandSemanticZones';

export type HandId = 'A' | 'B';

export interface HandParticleSample {
  readonly position: THREE.Vector3;
  readonly emphasis: number;
  readonly sizeVariation: number;
  readonly traceBias: number;
  readonly zone: HandSemanticZone;
  readonly fingerIndex?: number;
  readonly fingerT?: number;
  /** 0 at the open background end, 1 where the wrist meets the palm. */
  readonly wristT?: number;
}

export interface HandSampleSet {
  readonly hand: HandId;
  readonly particles: readonly HandParticleSample[];
}

/**
 * A GLTF-backed source can implement this contract later by sampling a mesh
 * surface and mapping its sampled vertices into the same palm-local space.
 */
export interface HandPointSource {
  createSamples(hand: HandId, density: number): HandSampleSet;
}
