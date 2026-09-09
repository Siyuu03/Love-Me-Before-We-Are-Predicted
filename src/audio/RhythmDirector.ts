import type { StateSnapshot } from '../core/types';
import { RHYTHM_PROFILES, type RhythmProfile } from '../visual/results/ResultConfig';
import { audioCueForSnapshot, type AudioCueId } from './AudioConfig';

const TWO_PI = Math.PI * 2;
const FINGER_PHASES = [0.13, 0, 0.27, 0.55, 0.82] as const;

export interface RhythmFrame {
  cue: AudioCueId;
  elapsed: number;
  pulse: number;
  particleFlow: number;
  relationForce: number;
  wristTear: number;
  readonly fingerPressA: Float32Array;
  readonly fingerPressB: Float32Array;
}

export class RhythmDirector {
  private readonly frame: RhythmFrame = {
    cue: 'idle', elapsed: 0, pulse: 0, particleFlow: 0.1, relationForce: 0,
    wristTear: 0, fingerPressA: new Float32Array(5), fingerPressB: new Float32Array(5),
  };

  update(deltaSeconds: number, snapshot: StateSnapshot): RhythmFrame {
    const cue = audioCueForSnapshot(snapshot);
    if (cue !== this.frame.cue) {
      this.frame.cue = cue;
      this.frame.elapsed = 0;
    } else {
      this.frame.elapsed += Math.max(0, Math.min(deltaSeconds, 0.1));
    }
    const profile = RHYTHM_PROFILES[cue];
    const resultProgress = snapshot.state === 'RESULT'
      ? Math.min(1, snapshot.resultElapsedMs / 9000)
      : 0;
    this.compose(profile, resultProgress);
    return this.frame;
  }

  private compose(profile: RhythmProfile, resultProgress: number): void {
    const beat = this.frame.elapsed * profile.bpm / 60;
    const synchronization = Math.min(1, profile.sync + resultProgress * profile.syncGrowth);
    const irregular = Math.sin(beat * 0.73 + 1.7) * profile.tension * 0.13;
    let phaseError = (1 - synchronization) * (0.23 + irregular);
    if (this.frame.cue === 'misreading' && Math.floor(beat) % 7 === 5) phaseError += 0.34;
    const dropout = this.frame.cue === 'unreadable'
      ? smoothstep(-0.32, 0.22, Math.sin(beat * 1.37 + 0.6))
      : 1;
    const activeA = this.frame.cue !== 'idle' && this.frame.cue !== 'right-touch';
    const activeB = this.frame.cue !== 'idle' && this.frame.cue !== 'left-touch';

    for (let finger = 0; finger < 5; finger += 1) {
      const thumbScale = finger === 0 ? 0.18 : 1;
      const densityPhase = finger * (0.37 + profile.noteDensity * 0.11);
      this.frame.fingerPressA[finger] = activeA
        ? press(beat + FINGER_PHASES[finger] + densityPhase, profile.noteDensity)
          * profile.fingerAmplitude * thumbScale * dropout
        : 0;
      this.frame.fingerPressB[finger] = activeB
        ? press(beat + FINGER_PHASES[finger] + densityPhase + phaseError, profile.noteDensity)
          * profile.fingerAmplitude * thumbScale * dropout
        : 0;
    }

    this.frame.pulse = press(beat, Math.max(0.2, profile.noteDensity * 0.72)) * dropout;
    this.frame.particleFlow = profile.particleFlow * (0.7 + this.frame.pulse * 0.3);
    this.frame.relationForce = profile.relationBias
      * (0.35 + this.frame.pulse * 0.65)
      * (0.72 + Math.sin(beat * TWO_PI * 0.25) * profile.tension * 0.28);
    this.frame.wristTear = profile.wristTear * (0.55 + this.frame.pulse * 0.45);
  }
}

function press(beat: number, density: number): number {
  const wave = Math.max(0, Math.sin((beat * Math.max(0.35, density) + 0.06) * TWO_PI));
  return Math.pow(wave, 3.2);
}

function smoothstep(a: number, b: number, value: number): number {
  const x = Math.max(0, Math.min(1, (value - a) / Math.max(0.0001, b - a)));
  return x * x * (3 - 2 * x);
}
