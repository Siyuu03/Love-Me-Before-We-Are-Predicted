import type { InputEvent } from './InputAdapter';

export interface TouchStabilizerOptions {
  readonly touchConfirmMs: number;
  readonly releaseDebounceMs: number;
  readonly latchGraceMs: number;
  readonly secondParticipantWindowMs: number;
  readonly quietResetMs: number;
}

export interface TouchChannelSnapshot {
  readonly rawTouch: boolean;
  readonly confirmedTouch: boolean;
  readonly latched: boolean;
  readonly lastRawChangeAt: number;
  readonly lastTouchAt: number;
  readonly releaseCandidateAt: number | null;
}

export interface TouchStabilizerSnapshot {
  readonly a: TouchChannelSnapshot;
  readonly b: TouchChannelSnapshot;
  readonly sessionStartedAt: number | null;
  readonly latchRemainingMs: number;
  readonly quietRemainingMs: number;
}

interface MutableTouchChannel {
  rawTouch: boolean;
  confirmedTouch: boolean;
  latched: boolean;
  lastRawChangeAt: number;
  lastTouchAt: number;
  releaseCandidateAt: number | null;
}

/** Converts noisy raw touch edges into one stable, narratively latched session. */
export class TouchStabilizer {
  private readonly a = createChannel();
  private readonly b = createChannel();
  private readonly pendingEvents: InputEvent[] = [];
  private elapsedMs = 0;
  private sessionStartedAt: number | null = null;
  private resetQueued = false;

  constructor(private readonly options: TouchStabilizerOptions) {}

  handleRawEvent(event: InputEvent): void {
    if (event.type === 'A_TOUCH') this.setRaw(this.a, true);
    else if (event.type === 'A_RELEASE') this.setRaw(this.a, false);
    else if (event.type === 'B_TOUCH') this.setRaw(this.b, true);
    else if (event.type === 'B_RELEASE') this.setRaw(this.b, false);
  }

  update(deltaMs: number): readonly InputEvent[] {
    this.elapsedMs += Math.max(0, deltaMs);
    this.updateChannel(this.a, 'A_TOUCH');
    this.updateChannel(this.b, 'B_TOUCH');

    const bothQuiet = !this.a.confirmedTouch && !this.b.confirmedTouch;
    const anyLatched = this.a.latched || this.b.latched;
    const bothLatched = this.a.latched && this.b.latched;
    const sessionAge = this.sessionStartedAt === null
      ? 0
      : this.elapsedMs - this.sessionStartedAt;
    const quietAge = this.elapsedMs - Math.max(this.a.lastTouchAt, this.b.lastTouchAt);
    const minimumQuiet = Math.max(this.options.latchGraceMs, this.options.quietResetMs);

    if (
      anyLatched
      && !bothLatched
      && bothQuiet
      && sessionAge >= this.options.secondParticipantWindowMs
      && quietAge >= minimumQuiet
      && !this.resetQueued
    ) {
      this.pendingEvents.push({ type: 'RESET' });
      this.resetQueued = true;
    }

    return this.drainEvents();
  }

  reset(): void {
    resetChannel(this.a, this.elapsedMs);
    resetChannel(this.b, this.elapsedMs);
    this.sessionStartedAt = null;
    this.resetQueued = false;
    this.pendingEvents.length = 0;
  }

  getSnapshot(): TouchStabilizerSnapshot {
    const sessionAge = this.sessionStartedAt === null
      ? 0
      : this.elapsedMs - this.sessionStartedAt;
    const quietAge = this.elapsedMs - Math.max(this.a.lastTouchAt, this.b.lastTouchAt);
    return {
      a: { ...this.a },
      b: { ...this.b },
      sessionStartedAt: this.sessionStartedAt,
      latchRemainingMs: this.sessionStartedAt === null || (this.a.latched && this.b.latched)
        ? 0
        : Math.max(0, this.options.secondParticipantWindowMs - sessionAge),
      quietRemainingMs: this.a.confirmedTouch || this.b.confirmedTouch
        ? this.options.quietResetMs
        : Math.max(0, this.options.quietResetMs - quietAge),
    };
  }

  private setRaw(channel: MutableTouchChannel, touched: boolean): void {
    if (channel.rawTouch === touched) return;
    channel.rawTouch = touched;
    channel.lastRawChangeAt = this.elapsedMs;
    if (touched) {
      channel.lastTouchAt = this.elapsedMs;
      channel.releaseCandidateAt = null;
    } else {
      channel.releaseCandidateAt = this.elapsedMs;
    }
  }

  private updateChannel(
    channel: MutableTouchChannel,
    touchEvent: 'A_TOUCH' | 'B_TOUCH',
  ): void {
    if (channel.rawTouch) {
      channel.lastTouchAt = this.elapsedMs;
      if (
        !channel.confirmedTouch
        && this.elapsedMs - channel.lastRawChangeAt >= this.options.touchConfirmMs
      ) {
        channel.confirmedTouch = true;
        channel.latched = true;
        channel.releaseCandidateAt = null;
        if (this.sessionStartedAt === null) this.sessionStartedAt = this.elapsedMs;
        this.pendingEvents.push({ type: touchEvent });
      }
      return;
    }

    if (
      channel.confirmedTouch
      && channel.releaseCandidateAt !== null
      && this.elapsedMs - channel.releaseCandidateAt >= this.options.releaseDebounceMs
    ) {
      channel.confirmedTouch = false;
      channel.releaseCandidateAt = null;
    }
  }

  private drainEvents(): readonly InputEvent[] {
    if (this.pendingEvents.length === 0) return EMPTY_EVENTS;
    const events = this.pendingEvents.slice();
    this.pendingEvents.length = 0;
    return events;
  }
}

const EMPTY_EVENTS: readonly InputEvent[] = Object.freeze([]);

function createChannel(): MutableTouchChannel {
  return {
    rawTouch: false,
    confirmedTouch: false,
    latched: false,
    lastRawChangeAt: 0,
    lastTouchAt: 0,
    releaseCandidateAt: null,
  };
}

function resetChannel(channel: MutableTouchChannel, elapsedMs: number): void {
  channel.rawTouch = false;
  channel.confirmedTouch = false;
  channel.latched = false;
  channel.lastRawChangeAt = elapsedMs;
  channel.lastTouchAt = elapsedMs;
  channel.releaseCandidateAt = null;
}
