import type { ResultId, StateSnapshot } from '../core/types';
import {
  AUDIO_CONFIG,
  audioCueForSnapshot,
  type AudioCueId,
  type AudioTrackConfig,
} from './AudioConfig';

export type AudioPlaybackState =
  | 'LOCKED'
  | 'FADING OUT'
  | 'LOADING'
  | 'FADING IN'
  | 'PLAYING'
  | 'PAUSED'
  | 'ERROR';

export interface AudioDiagnostics {
  readonly cue: AudioCueId;
  readonly file: string;
  readonly state: AudioPlaybackState;
  readonly unlocked: boolean;
}

type ResultEndedListener = (result: ResultId) => void;

export class AudioController {
  private readonly audio = new Audio();
  private currentCue: AudioCueId = 'idle';
  private targetCue: AudioCueId = 'idle';
  private state: AudioPlaybackState = 'LOCKED';
  private unlocked = false;
  private fadeElapsedMs = 0;
  private started = false;

  constructor(private readonly onResultEnded: ResultEndedListener) {
    this.audio.preload = 'auto';
    this.audio.addEventListener('ended', this.handleEnded);
    this.audio.addEventListener('error', this.handleError);
  }

  start(): void {
    if (this.started) return;
    window.addEventListener('pointerdown', this.handleFirstGesture, { capture: true });
    window.addEventListener('keydown', this.handleFirstGesture, { capture: true });
    this.started = true;
  }

  sync(snapshot: StateSnapshot): void {
    this.request(audioCueForSnapshot(snapshot));
  }

  update(deltaSeconds: number): void {
    if (!this.unlocked) return;
    const deltaMs = Math.max(0, Math.min(deltaSeconds, 0.1)) * 1000;
    if (this.state === 'FADING OUT') {
      this.fadeElapsedMs += deltaMs;
      const progress = Math.min(1, this.fadeElapsedMs / AUDIO_CONFIG.fadeOutMs);
      const volume = AUDIO_CONFIG.tracks[this.currentCue].volume;
      this.audio.volume = volume * (1 - smooth(progress));
      if (progress >= 1) this.beginTarget();
    } else if (this.state === 'FADING IN') {
      this.fadeElapsedMs += deltaMs;
      const progress = Math.min(1, this.fadeElapsedMs / AUDIO_CONFIG.fadeInMs);
      this.audio.volume = AUDIO_CONFIG.tracks[this.currentCue].volume * smooth(progress);
      if (progress >= 1) this.state = 'PLAYING';
    }
  }

  getDiagnostics(): AudioDiagnostics {
    const displayedCue = this.state === 'LOCKED' ? this.targetCue : this.currentCue;
    return {
      cue: displayedCue,
      file: AUDIO_CONFIG.tracks[displayedCue].file,
      state: this.state,
      unlocked: this.unlocked,
    };
  }

  dispose(): void {
    window.removeEventListener('pointerdown', this.handleFirstGesture, { capture: true });
    window.removeEventListener('keydown', this.handleFirstGesture, { capture: true });
    this.audio.pause();
    this.audio.removeAttribute('src');
    this.audio.load();
    this.audio.removeEventListener('ended', this.handleEnded);
    this.audio.removeEventListener('error', this.handleError);
  }

  private request(cue: AudioCueId): void {
    this.targetCue = cue;
    if (!this.unlocked) return;
    if (cue === this.currentCue && this.audio.src) return;
    if (!this.audio.paused && this.audio.volume > 0.001) {
      if (this.state !== 'FADING OUT') {
        this.state = 'FADING OUT';
        this.fadeElapsedMs = 0;
      }
      return;
    }
    this.beginTarget();
  }

  private beginTarget(): void {
    this.audio.pause();
    this.currentCue = this.targetCue;
    const track: AudioTrackConfig = AUDIO_CONFIG.tracks[this.currentCue];
    this.audio.src = track.path;
    this.audio.loop = track.loop;
    this.audio.currentTime = 0;
    this.audio.volume = 0;
    this.fadeElapsedMs = 0;
    this.state = 'LOADING';
    void this.audio.play().then(() => {
      if (this.audio.src.endsWith(track.file)) this.state = 'FADING IN';
    }).catch(() => {
      this.state = 'LOCKED';
      this.unlocked = false;
    });
  }

  private readonly handleFirstGesture = (): void => {
    if (this.unlocked) return;
    this.unlocked = true;
    this.beginTarget();
  };

  private readonly handleEnded = (): void => {
    const endedCue = this.currentCue;
    if (endedCue === 'idle' || endedCue === 'left-touch' || endedCue === 'right-touch') return;
    this.state = 'PAUSED';
    this.onResultEnded(endedCue);
  };

  private readonly handleError = (): void => { this.state = 'ERROR'; };
}

function smooth(value: number): number { return value * value * (3 - 2 * value); }
