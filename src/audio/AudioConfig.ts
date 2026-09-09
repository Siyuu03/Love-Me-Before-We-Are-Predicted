import type { ResultId, StateSnapshot } from '../core/types';

export type AudioCueId = 'idle' | 'left-touch' | 'right-touch' | ResultId;

export interface AudioTrackConfig {
  readonly file: string;
  readonly path: string;
  readonly loop: boolean;
  readonly volume: number;
}

export const AUDIO_CONFIG = Object.freeze({
  fadeOutMs: 420,
  fadeInMs: 620,
  tracks: {
    idle: track('00_idle_loop.mp3', true, 0.18),
    'left-touch': track('01_left_touch.mp3', true, 0.42),
    'right-touch': track('02_right_touch.mp3', true, 0.42),
    collision: track('03_collision.mp3', false, 0.7),
    'soft-merge': track('04_soft_merge.mp3', false, 0.66),
    desire: track('05_desire.mp3', false, 0.68),
    misreading: track('06_misreading.mp3', false, 0.67),
    refusal: track('07_refusal.mp3', false, 0.69),
    unreadable: track('08_unreadable.mp3', false, 0.62),
  } satisfies Readonly<Record<AudioCueId, AudioTrackConfig>>,
});

export function audioCueForSnapshot(snapshot: StateSnapshot): AudioCueId {
  if (snapshot.state === 'SOLO_A') return 'left-touch';
  if (snapshot.state === 'SOLO_B') return 'right-touch';
  if (snapshot.state === 'RESULT' && snapshot.currentResult) return snapshot.currentResult;
  return 'idle';
}

function track(file: string, loop: boolean, volume: number): AudioTrackConfig {
  return { file, path: `./audio/${file}`, loop, volume };
}
