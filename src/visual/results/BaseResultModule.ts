import * as THREE from 'three';
import type { ResultId } from '../../core/types';
import type { ResultLayer } from './ResultLayer';
import type { ResultSnapshot } from './ResultSnapshot';
import type { ResultModule } from './ResultTypes';
import { HandGestureLibrary } from '../hands/HandGestureLibrary';

export abstract class BaseResultModule implements ResultModule {
  abstract readonly id: ResultId;
  protected snapshot: ResultSnapshot | null = null;
  protected elapsed = 0;
  protected exiting = false;

  constructor(protected readonly layer: ResultLayer, protected readonly durationMs: number) {}

  enter(snapshot: ResultSnapshot): void {
    this.snapshot = snapshot; this.elapsed = 0; this.exiting = false;
    this.layer.clear(); this.layer.resultId = this.id; this.layer.seed = snapshot.seed;
    this.layer.durationMs = this.durationMs;
  }

  update(dt: number): void {
    if (!this.snapshot || this.exiting) return;
    this.elapsed += Math.max(0, dt);
    this.layer.elapsed = this.elapsed;
    this.layer.progress = THREE.MathUtils.clamp(this.elapsed * 1000 / this.durationMs, 0, 1);
    this.layer.enterProgress = ease(THREE.MathUtils.clamp(this.elapsed / 0.7, 0, 1));
    this.compose(this.elapsed, this.layer.progress);
    HandGestureLibrary.sample(this.id, this.elapsed, this.layer.seed, this.layer.gesture);
    this.composeGaze(this.elapsed);
  }

  exit(): void { this.exiting = true; }
  dispose(): void { this.snapshot = null; }
  protected abstract compose(seconds: number, progress: number): void;
  private composeGaze(seconds: number): void {
    if (this.id === 'collision') this.layer.gazeCompression = this.pulse(seconds, 1.1, 0.55);
    else if (this.id === 'soft-merge') this.layer.gazeSync = this.window(seconds, 1.2, 9.2, 0.9);
    else if (this.id === 'desire') this.layer.gazeGap = this.window(seconds, 0.8, 10.2, 0.8);
    else if (this.id === 'misreading') this.layer.gazeLag = this.window(seconds, 0.8, 9.4, 0.7);
    else if (this.id === 'refusal') this.layer.gazeGap = this.window(seconds, 1.0, 8.8, 0.8);
    else this.layer.gazeUncertainty = this.window(seconds, 0.8, 11.2, 0.8);
  }
  protected window(seconds: number, start: number, end: number, feather = 0.45): number {
    return smoothstep(start, start + feather, seconds) * (1 - smoothstep(end - feather, end, seconds));
  }
  protected pulse(seconds: number, center: number, width: number): number {
    const distance = Math.abs(seconds - center) / Math.max(0.001, width);
    return ease(THREE.MathUtils.clamp(1 - distance, 0, 1));
  }
}

export function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = THREE.MathUtils.clamp((value - edge0) / Math.max(0.0001, edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}
export function ease(value: number): number { return value * value * (3 - 2 * value); }
