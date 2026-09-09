import type { ResultId, ResultSource, StateSnapshot } from '../../core/types';
import { RESULT_CONFIG } from './ResultConfig';
import { ResultLayer } from './ResultLayer';
import { ResultRegistry } from './ResultRegistry';
import type { ResultSnapshot } from './ResultSnapshot';
import type { ResultModule } from './ResultTypes';

export interface ResultDiagnostics {
  readonly id: ResultId | null;
  readonly source: ResultSource | null;
  readonly elapsedMs: number;
  readonly progress: number;
}

export class ResultDirector {
  readonly layer = new ResultLayer();
  readonly registry = new ResultRegistry(this.layer);
  private active: ResultModule | null = null;
  private activeId: ResultId | null = null;
  private source: ResultSource | null = null;
  private switchElapsed = 0;
  private pendingId: ResultId | null = null;
  private previousState = 'IDLE';

  update(
    deltaSeconds: number,
    state: StateSnapshot,
    capture: (canonical: boolean) => ResultSnapshot,
  ): ResultLayer {
    const requested = state.state === 'RESULT' ? state.currentResult : null;
    if (requested && requested !== this.activeId && requested !== this.pendingId) {
      if (this.active) {
        this.active.exit(); this.pendingId = requested; this.switchElapsed = 0;
      } else {
        this.enter(requested, state.resultSource, capture(state.contactSnapshot === null));
      }
    }

    if (this.pendingId) {
      this.switchElapsed += deltaSeconds;
      this.layer.release(this.switchElapsed * 1000 / RESULT_CONFIG.previewSwitchBlendMs);
      if (this.switchElapsed * 1000 >= RESULT_CONFIG.previewSwitchBlendMs) {
        const next = this.pendingId; this.pendingId = null;
        this.enter(next, state.resultSource, capture(state.contactSnapshot === null));
      }
    } else if (this.active && state.state === 'RESULT') {
      this.active.update(deltaSeconds);
    }

    if (this.active && state.state === 'RESET') {
      if (this.previousState !== 'RESET') this.active.exit();
      this.layer.release(state.resetProgress);
      if (state.resetProgress >= 1) this.clearActive();
    } else if (this.active && state.state !== 'RESULT' && state.state !== 'RESET') {
      this.active.exit();
      this.layer.release(Math.min(1, this.layer.releaseProgress + deltaSeconds / 0.35));
      if (this.layer.resultId === null) this.clearActive();
    }
    this.previousState = state.state;
    return this.layer;
  }

  getDiagnostics(): ResultDiagnostics {
    return { id: this.activeId, source: this.source, elapsedMs: this.layer.elapsed * 1000, progress: this.layer.progress };
  }
  dispose(): void { this.registry.dispose(); this.layer.clear(); }

  private enter(id: ResultId, source: ResultSource | null, snapshot: ResultSnapshot): void {
    this.active = this.registry.get(id); this.activeId = id; this.source = source;
    this.active.enter(snapshot);
  }
  private clearActive(): void {
    this.active = null; this.activeId = null; this.source = null; this.pendingId = null;
  }
}
