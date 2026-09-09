import type { InputEvent } from '../input/InputAdapter';
import type {
  ContactInputSnapshot,
  InstallationState,
  ResultId,
  ResultSource,
  StateSnapshot,
  TouchOrder,
} from './types';

export interface StateMachineOptions {
  readonly contactThresholdMs: number;
  readonly contactTransitionMs: number;
  readonly resultDurationsMs?: Readonly<Record<ResultId, number>>;
  /** Compatibility for embedding/tests that still provide one duration. */
  readonly resultPlaceholderMs?: number;
  readonly resetDurationMs: number;
  readonly resolveResult?: (contact: ContactInputSnapshot | null) => {
    readonly id: ResultId;
    readonly source: ResultSource;
  };
}

export class StateMachine {
  private state: InstallationState = 'IDLE';
  private aPressed = false;
  private bPressed = false;
  private sharedTouchMs = 0;
  private contactElapsedMs = 0;
  private resultElapsedMs = 0;
  private contactSnapshot: ContactInputSnapshot | null = null;
  private elapsedMs = 0;
  private aTouchStartedMs: number | null = null;
  private bTouchStartedMs: number | null = null;
  private contactSequenceId = 0;
  private currentResult: ResultId | null = null;
  private resultSource: ResultSource | null = null;
  private resetElapsedMs = 0;

  constructor(private readonly options: StateMachineOptions) {}

  dispatch(event: InputEvent): void {
    if (
      event.type === 'TOGGLE_DEBUG'
      || event.type === 'TOGGLE_DEEP_DEBUG'
      || event.type === 'TOGGLE_HAND_CHECK'
      || event.type === 'TOGGLE_CAMERA_SETUP'
    ) return;

    if (event.type === 'RESET') {
      this.enterReset();
      return;
    }

    if (event.type === 'FORCE_IDLE') {
      this.clearInteraction();
      this.state = 'IDLE';
      return;
    }

    if (event.type === 'FORCE_SOLO') {
      this.clearInteraction();
      this.state = event.participant === 'A' ? 'SOLO_A' : 'SOLO_B';
      this.aPressed = event.participant === 'A';
      this.bPressed = event.participant === 'B';
      if (this.aPressed) this.aTouchStartedMs = this.elapsedMs;
      if (this.bPressed) this.bTouchStartedMs = this.elapsedMs;
      return;
    }

    if (event.type === 'FORCE_RESULT') {
      const previewContact = this.state === 'CONTACT' || this.state === 'RESULT'
        ? this.contactSnapshot
        : null;
      this.state = 'RESULT';
      this.currentResult = event.result;
      this.resultSource = 'preview';
      this.contactSnapshot = previewContact;
      this.contactElapsedMs = 0;
      this.resultElapsedMs = 0;
      return;
    }

    if (this.state === 'RESET') return;

    switch (event.type) {
      case 'A_TOUCH':
        if (!this.aPressed) {
          this.aPressed = true;
          this.aTouchStartedMs = this.elapsedMs;
        }
        break;
      case 'A_RELEASE':
        if (this.aPressed) {
          this.aPressed = false;
          this.aTouchStartedMs = null;
        }
        break;
      case 'B_TOUCH':
        if (!this.bPressed) {
          this.bPressed = true;
          this.bTouchStartedMs = this.elapsedMs;
        }
        break;
      case 'B_RELEASE':
        if (this.bPressed) {
          this.bPressed = false;
          this.bTouchStartedMs = null;
        }
        break;
    }

    if (this.state !== 'CONTACT' && this.state !== 'RESULT') {
      this.reconcileTouchState();
    }
  }

  update(deltaMs: number): void {
    const safeDeltaMs = Math.max(0, deltaMs);
    this.elapsedMs += safeDeltaMs;

    if (this.state === 'RESET') {
      this.resetElapsedMs += safeDeltaMs;
      if (this.resetElapsedMs >= this.options.resetDurationMs) {
        this.state = 'IDLE';
        this.resetElapsedMs = this.options.resetDurationMs;
      }
      return;
    }

    if (this.state === 'RESULT') {
      this.resultElapsedMs += safeDeltaMs;
      const result = this.currentResult ?? 'unreadable';
      const duration = this.options.resultDurationsMs?.[result]
        ?? this.options.resultPlaceholderMs
        ?? 11800;
      if (this.resultElapsedMs >= duration) {
        this.enterReset();
      }
      return;
    }

    if (this.state === 'CONTACT') {
      this.contactElapsedMs += safeDeltaMs;
      if (this.aPressed && this.bPressed) {
        this.sharedTouchMs += safeDeltaMs;
      }
      if (this.contactElapsedMs >= this.options.contactTransitionMs) {
        this.enterResultPlaceholder(
          this.contactElapsedMs - this.options.contactTransitionMs,
        );
      }
      return;
    }

    if (this.state !== 'JOIN' || !this.aPressed || !this.bPressed) return;

    this.sharedTouchMs += safeDeltaMs;
    if (this.sharedTouchMs < this.options.contactThresholdMs) return;

    const thresholdOvershootMs = this.sharedTouchMs - this.options.contactThresholdMs;
    this.enterContact(thresholdOvershootMs);
    if (this.contactElapsedMs >= this.options.contactTransitionMs) {
      this.enterResultPlaceholder(
        this.contactElapsedMs - this.options.contactTransitionMs,
      );
    }
  }

  getSnapshot(): StateSnapshot {
    const resetProgress =
      this.state === 'RESET'
        ? Math.min(1, this.resetElapsedMs / this.options.resetDurationMs)
        : 0;

    return {
      state: this.state,
      aPressed: this.aPressed,
      bPressed: this.bPressed,
      sharedTouchMs: this.sharedTouchMs,
      contactElapsedMs: this.contactElapsedMs,
      resultElapsedMs: this.resultElapsedMs,
      contactSnapshot: this.contactSnapshot,
      currentResult: this.currentResult,
      resultSource: this.resultSource,
      resetProgress,
    };
  }

  private reconcileTouchState(): void {
    this.currentResult = null;
    this.resultSource = null;

    if (this.aPressed && this.bPressed) {
      if (this.state !== 'JOIN' && this.state !== 'CONTACT') {
        this.state = 'JOIN';
        this.sharedTouchMs = 0;
        this.contactElapsedMs = 0;
        this.resultElapsedMs = 0;
        this.contactSnapshot = null;
      }
      return;
    }

    this.sharedTouchMs = 0;
    this.contactElapsedMs = 0;
    this.resultElapsedMs = 0;
    this.contactSnapshot = null;
    if (this.aPressed) {
      this.state = 'SOLO_A';
    } else if (this.bPressed) {
      this.state = 'SOLO_B';
    } else {
      this.state = 'IDLE';
    }
  }

  private enterContact(thresholdOvershootMs: number): void {
    const contactAtMs = this.elapsedMs - thresholdOvershootMs;
    const aStartedAt = this.aTouchStartedMs ?? contactAtMs;
    const bStartedAt = this.bTouchStartedMs ?? contactAtMs;
    const leadMs = Math.abs(aStartedAt - bStartedAt);
    let order: TouchOrder = 'SIMULTANEOUS';
    if (leadMs > 0.5) {
      order = aStartedAt < bStartedAt ? 'A_FIRST' : 'B_FIRST';
    }

    this.contactSequenceId += 1;
    this.contactSnapshot = Object.freeze({
      sequenceId: this.contactSequenceId,
      order,
      sharedTouchMs: this.options.contactThresholdMs,
      aHeldMs: Math.max(0, contactAtMs - aStartedAt),
      bHeldMs: Math.max(0, contactAtMs - bStartedAt),
      leadMs,
    });
    this.state = 'CONTACT';
    this.currentResult = null;
    this.contactElapsedMs = thresholdOvershootMs;
    this.resultElapsedMs = 0;
  }

  private enterResultPlaceholder(elapsedMs = 0): void {
    this.state = 'RESULT';
    const resolved = this.options.resolveResult?.(this.contactSnapshot)
      ?? { id: 'unreadable' as const, source: 'safe-unreadable' as const };
    this.currentResult = resolved.id;
    this.resultSource = resolved.source;
    this.resultElapsedMs = Math.max(0, elapsedMs);
  }

  private enterReset(): void {
    this.state = 'RESET';
    this.aPressed = false;
    this.bPressed = false;
    this.sharedTouchMs = 0;
    this.contactElapsedMs = 0;
    this.resultElapsedMs = 0;
    this.contactSnapshot = null;
    this.aTouchStartedMs = null;
    this.bTouchStartedMs = null;
    this.currentResult = null;
    this.resultSource = null;
    this.resetElapsedMs = 0;
  }

  private clearInteraction(): void {
    this.aPressed = false;
    this.bPressed = false;
    this.sharedTouchMs = 0;
    this.contactElapsedMs = 0;
    this.resultElapsedMs = 0;
    this.contactSnapshot = null;
    this.aTouchStartedMs = null;
    this.bTouchStartedMs = null;
    this.currentResult = null;
    this.resultSource = null;
    this.resetElapsedMs = 0;
  }
}
