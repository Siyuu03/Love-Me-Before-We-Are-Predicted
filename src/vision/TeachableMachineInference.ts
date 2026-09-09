import * as tmImage from '@teachablemachine/image';
import type { ResultId } from '../core/types';

export const TEACHABLE_MACHINE_MODEL_URL =
  './models/teachable-machine/';
export const FEMININE_APPEARANCE_LABEL = 'feminine-coded appearance';
export const MASCULINE_APPEARANCE_LABEL = 'masculine-coded appearance';
export const APPEARANCE_PREDICTION_INTERVAL_MS = 200;
export const APPEARANCE_SMOOTHING_SAMPLES = 10;

export interface AppearancePrediction {
  readonly className: string;
  readonly probability: number;
}

export interface SmoothedAppearance {
  readonly avgFeminine: number;
  readonly avgMasculine: number;
  readonly s: number;
  readonly q: number;
  readonly sampleCount: number;
  readonly ready: boolean;
}

export interface FrozenAppearancePair {
  readonly left: SmoothedAppearance;
  readonly right: SmoothedAppearance;
  readonly frozenAtMs: number;
}

export type MLDebugStatus = 'COLLECTING' | 'LIVE' | 'FROZEN';

export interface MLDebugSnapshot {
  readonly camA: SmoothedAppearance;
  readonly camB: SmoothedAppearance;
  readonly pair: Readonly<{
    d: number;
    candidateResult: ResultId;
  }>;
  readonly status: MLDebugStatus;
}

export type AppearanceCamera = 'left' | 'right';

const emptyAppearance = (): SmoothedAppearance => Object.freeze({
  avgFeminine: 0,
  avgMasculine: 0,
  s: 0,
  q: 0,
  sampleCount: 0,
  ready: false,
});

export class AppearanceSmoothingWindow {
  private readonly feminine = new Float32Array(APPEARANCE_SMOOTHING_SAMPLES);
  private readonly masculine = new Float32Array(APPEARANCE_SMOOTHING_SAMPLES);
  private cursor = 0;
  private size = 0;
  private feminineSum = 0;
  private masculineSum = 0;

  push(predictions: readonly AppearancePrediction[]): boolean {
    const feminine = predictions.find(
      (prediction) => prediction.className === FEMININE_APPEARANCE_LABEL,
    )?.probability;
    const masculine = predictions.find(
      (prediction) => prediction.className === MASCULINE_APPEARANCE_LABEL,
    )?.probability;
    if (
      feminine === undefined
      || masculine === undefined
      || !Number.isFinite(feminine)
      || !Number.isFinite(masculine)
    ) return false;

    if (this.size === APPEARANCE_SMOOTHING_SAMPLES) {
      this.feminineSum -= this.feminine[this.cursor];
      this.masculineSum -= this.masculine[this.cursor];
    } else {
      this.size += 1;
    }

    this.feminine[this.cursor] = feminine;
    this.masculine[this.cursor] = masculine;
    this.feminineSum += feminine;
    this.masculineSum += masculine;
    this.cursor = (this.cursor + 1) % APPEARANCE_SMOOTHING_SAMPLES;
    return true;
  }

  snapshot(): SmoothedAppearance {
    if (this.size === 0) return emptyAppearance();
    const avgFeminine = this.feminineSum / this.size;
    const avgMasculine = this.masculineSum / this.size;
    const s = avgFeminine - avgMasculine;
    return Object.freeze({
      avgFeminine,
      avgMasculine,
      s,
      q: Math.abs(s),
      sampleCount: this.size,
      ready: this.size === APPEARANCE_SMOOTHING_SAMPLES,
    });
  }

  clear(): void {
    this.feminine.fill(0);
    this.masculine.fill(0);
    this.cursor = 0;
    this.size = 0;
    this.feminineSum = 0;
    this.masculineSum = 0;
  }
}

export class DualAppearanceSmoother {
  private readonly left = new AppearanceSmoothingWindow();
  private readonly right = new AppearanceSmoothingWindow();
  private frozen: FrozenAppearancePair | null = null;

  push(camera: AppearanceCamera, predictions: readonly AppearancePrediction[]): boolean {
    if (this.frozen) return false;
    return (camera === 'left' ? this.left : this.right).push(predictions);
  }

  getLive(): readonly [SmoothedAppearance, SmoothedAppearance] {
    return [this.left.snapshot(), this.right.snapshot()];
  }

  freeze(nowMs = performance.now()): FrozenAppearancePair {
    if (this.frozen) return this.frozen;
    const [left, right] = this.getLive();
    this.frozen = Object.freeze({ left, right, frozenAtMs: nowMs });
    return this.frozen;
  }

  getFrozen(): FrozenAppearancePair | null {
    return this.frozen;
  }

  getDebugSnapshot(): MLDebugSnapshot {
    const frozen = this.frozen;
    const [camA, camB] = frozen
      ? [frozen.left, frozen.right]
      : this.getLive();
    const pair = Object.freeze({
      d: Math.abs(camA.s - camB.s) / 2,
      candidateResult: routeAppearancePair(Object.freeze({
        left: camA,
        right: camB,
        frozenAtMs: frozen?.frozenAtMs ?? 0,
      })),
    });
    const status: MLDebugStatus = frozen
      ? 'FROZEN'
      : camA.ready && camB.ready
        ? 'LIVE'
        : 'COLLECTING';
    return Object.freeze({ camA, camB, pair, status });
  }

  reset(): void {
    this.frozen = null;
    this.left.clear();
    this.right.clear();
  }
}

export function routeAppearancePair(pair: FrozenAppearancePair): ResultId {
  const { left, right } = pair;
  if (!left.ready || !right.ready) return 'unreadable';

  const leftLow = left.q < 0.24;
  const rightLow = right.q < 0.24;
  if (leftLow && rightLow) return 'unreadable';
  if (leftLow !== rightLow) {
    const clearSide = leftLow ? right : left;
    return clearSide.q >= 0.42 ? 'refusal' : 'unreadable';
  }
  if (leftLow || rightLow) return 'unreadable';

  const difference = Math.abs(left.s - right.s) / 2;
  if (difference < 0.18) return 'soft-merge';
  if (difference < 0.40) return 'desire';
  if (difference < 0.65) return 'misreading';
  return 'collision';
}

export class DualTeachableMachineInference {
  private readonly smoother = new DualAppearanceSmoother();
  private model: tmImage.CustomMobileNet | null = null;
  private startPromise: Promise<void> | null = null;
  private readonly timers: Array<number | null> = [null, null];
  private readonly predicting = [false, false];
  private disposed = false;

  constructor(private readonly videos: readonly [HTMLVideoElement, HTMLVideoElement]) {}

  start(): Promise<void> {
    if (!this.startPromise) this.startPromise = this.loadAndSchedule();
    return this.startPromise;
  }

  freeze(): FrozenAppearancePair {
    return this.smoother.freeze();
  }

  reset(): void {
    this.smoother.reset();
  }

  getLive(): readonly [SmoothedAppearance, SmoothedAppearance] {
    return this.smoother.getLive();
  }

  getFrozen(): FrozenAppearancePair | null {
    return this.smoother.getFrozen();
  }

  getDebugSnapshot(): MLDebugSnapshot {
    return this.smoother.getDebugSnapshot();
  }

  dispose(): void {
    this.disposed = true;
    this.timers.forEach((timer) => {
      if (timer !== null) window.clearInterval(timer);
    });
    this.timers[0] = null;
    this.timers[1] = null;
    this.model?.dispose();
    this.model = null;
  }

  private async loadAndSchedule(): Promise<void> {
    try {
      const model = await tmImage.load(
        `${TEACHABLE_MACHINE_MODEL_URL}model.json`,
        `${TEACHABLE_MACHINE_MODEL_URL}metadata.json`,
      );
      if (this.disposed) {
        model.dispose();
        return;
      }
      const labels = model.getClassLabels();
      if (
        !labels.includes(FEMININE_APPEARANCE_LABEL)
        || !labels.includes(MASCULINE_APPEARANCE_LABEL)
      ) {
        model.dispose();
        throw new Error('Teachable Machine class labels do not match the configured appearance labels');
      }
      this.model = model;
      this.scheduleCamera(0, 'left');
      this.scheduleCamera(1, 'right');
    } catch (error) {
      console.warn('Teachable Machine inference unavailable:', error);
    }
  }

  private scheduleCamera(index: 0 | 1, camera: AppearanceCamera): void {
    void this.predictCamera(index, camera);
    this.timers[index] = window.setInterval(() => {
      void this.predictCamera(index, camera);
    }, APPEARANCE_PREDICTION_INTERVAL_MS);
  }

  private async predictCamera(index: 0 | 1, camera: AppearanceCamera): Promise<void> {
    if (
      this.disposed
      || !this.model
      || this.predicting[index]
      || this.smoother.getFrozen()
    ) return;
    const video = this.videos[index];
    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;

    this.predicting[index] = true;
    try {
      const predictions = await this.model.predict(video, false);
      this.smoother.push(camera, predictions);
    } catch (error) {
      console.warn(`Teachable Machine ${camera} prediction failed:`, error);
    } finally {
      this.predicting[index] = false;
    }
  }
}
