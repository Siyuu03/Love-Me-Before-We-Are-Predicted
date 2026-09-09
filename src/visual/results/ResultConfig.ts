import type { ResultId } from '../../core/types';
import type { AudioCueId } from '../../audio/AudioConfig';

export type ResultSelectionMode = 'external' | 'fixed' | 'cycle' | 'safe-unreadable';

export interface RhythmProfile {
  readonly bpm: number;
  readonly noteDensity: number;
  readonly fingerAmplitude: number;
  readonly sync: number;
  readonly syncGrowth: number;
  readonly tension: number;
  readonly particleFlow: number;
  /** Positive attracts, negative separates. */
  readonly relationBias: number;
  /** 0 is continuous; 1 is torn and particulate. */
  readonly wristTear: number;
}

export const RHYTHM_PROFILES = Object.freeze({
  idle: rhythm(54, 0.28, 0, 0.2, 0, 0.12, 0.28, 0, 0.08),
  'left-touch': rhythm(62, 0.48, 0.038, 0.12, 0, 0.2, 0.42, 0, 0.18),
  'right-touch': rhythm(59, 0.44, 0.036, 0.14, 0, 0.18, 0.4, 0, 0.16),
  collision: rhythm(112, 0.92, 0.076, 0.12, 0, 0.94, 1.08, -0.5, 0.92),
  'soft-merge': rhythm(68, 0.62, 0.052, 0.42, 0.5, 0.28, 0.68, 0.34, 0.12),
  desire: rhythm(76, 0.88, 0.066, 0.38, 0.58, 0.46, 0.82, 0.42, 0.1),
  misreading: rhythm(83, 0.7, 0.058, 0.56, 0, 0.64, 0.76, 0.08, 0.48),
  refusal: rhythm(98, 0.78, 0.069, 0.08, 0, 0.88, 0.9, -0.44, 0.86),
  unreadable: rhythm(64, 0.46, 0.046, 0.2, 0, 0.5, 0.48, 0.02, 0.72),
} satisfies Readonly<Record<AudioCueId, RhythmProfile>>);

export const RESULT_CONFIG = Object.freeze({
  showResultLabels: false,
  selectionMode: 'safe-unreadable' as ResultSelectionMode,
  fixedResult: 'unreadable' as ResultId,
  presentation: {
    collision: { publicLabel: 'COLLISION' },
    'soft-merge': { publicLabel: 'SOFT MERGE' },
    desire: { publicLabel: 'DESIRE' },
    misreading: { publicLabel: 'MISREADING' },
    refusal: { publicLabel: 'REFUSAL' },
    unreadable: { publicLabel: 'UNREADABLE' },
  } satisfies Readonly<Record<ResultId, { readonly publicLabel: string }>>,
  contactHoldMs: 720,
  exitBlendMs: 900,
  previewSwitchBlendMs: 350,
  resetDurationMs: 2400,
  durationsMs: {
    // Audio `ended` normally initiates RESET. These slightly longer values are
    // safety fallbacks for muted, blocked, or unavailable playback.
    collision: 12100,
    'soft-merge': 12000,
    desire: 11900,
    misreading: 12000,
    refusal: 12400,
    unreadable: 12000,
  } satisfies Readonly<Record<ResultId, number>>,
  staffVisibility: {
    IDLE: 1,
    SOLO_A: 0.82,
    SOLO_B: 0.82,
    JOIN: 0.51,
    CONTACT: 0.43,
    RESULT: 0.26,
    RESET: 0.72,
  },
  resultLabel: { enabled: false, delayMs: 1200, fadeMs: 500, opacity: 0.42 },
});

function rhythm(
  bpm: number,
  noteDensity: number,
  fingerAmplitude: number,
  sync: number,
  syncGrowth: number,
  tension: number,
  particleFlow: number,
  relationBias: number,
  wristTear: number,
): RhythmProfile {
  return {
    bpm, noteDensity, fingerAmplitude, sync, syncGrowth, tension,
    particleFlow, relationBias, wristTear,
  };
}
