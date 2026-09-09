import type { ResultId } from '../../core/types';

export interface HandGestureFrame {
  poseId: ResultId | null;
  sequenceIndex: number;
  readonly curlsA: Float32Array;
  readonly curlsB: Float32Array;
  readonly fingerLiftA: Float32Array;
  readonly fingerLiftB: Float32Array;
  readonly fingerDepthA: Float32Array;
  readonly fingerDepthB: Float32Array;
  palmTurnA: number;
  palmTurnB: number;
  wristBendA: number;
  wristBendB: number;
  handRollA: number;
  handRollB: number;
  spreadA: number;
  spreadB: number;
  depthA: number;
  depthB: number;
  liftA: number;
  liftB: number;
}

export const HAND_GESTURE_SEQUENCES: Readonly<Record<ResultId, readonly string[]>> = Object.freeze({
  collision: ['index-contact', 'gathered-chord', 'palm-edge-impact', 'opposed-rebound', 'aftershock'],
  'soft-merge': ['index-contact', 'receiving-palm', 'covering-hand', 'loose-interlace', 'four-hand-coda'],
  desire: ['index-contact', 'first-index-near-miss', 'return', 'second-index-near-miss', 'heated-gap'],
  misreading: ['index-contact', 'reach-for-old-wrist', 'missed-grasp', 'roles-exchange', 'late-correction'],
  refusal: ['index-contact', 'held-pause', 'gather-and-turn', 'withdraw-boundary', 'owned-space'],
  unreadable: ['index-contact', 'merge-attempt', 'pinky-attempt', 'ghost-grasp', 'unclosed-cuffs', 'open-suspension'],
});

export function createHandGestureFrame(): HandGestureFrame {
  return {
    poseId: null,
    sequenceIndex: 0,
    curlsA: new Float32Array(5), curlsB: new Float32Array(5),
    fingerLiftA: new Float32Array(5), fingerLiftB: new Float32Array(5),
    fingerDepthA: new Float32Array(5), fingerDepthB: new Float32Array(5),
    palmTurnA: 0, palmTurnB: 0, wristBendA: 0, wristBendB: 0, handRollA: 0, handRollB: 0,
    spreadA: 0, spreadB: 0, depthA: 0, depthB: 0, liftA: 0, liftB: 0,
  };
}

export class HandGestureLibrary {
  static sample(id: ResultId, time: number, seed: number, frame: HandGestureFrame): void {
    reset(frame);
    frame.poseId = id;
    const preludeSeconds = 0.72;
    if (time < preludeSeconds) {
      prelude(time / preludeSeconds, frame);
      return;
    }
    const performanceTime = time - preludeSeconds;
    if (id === 'collision') collision(performanceTime, frame);
    else if (id === 'soft-merge') softMerge(performanceTime, frame);
    else if (id === 'desire') desire(performanceTime, frame);
    else if (id === 'misreading') misreading(performanceTime, seed, frame);
    else if (id === 'refusal') refusal(performanceTime, seed, frame);
    else unreadable(performanceTime, frame);
  }

  static samplePrelude(progress: number, frame: HandGestureFrame): void {
    reset(frame);
    prelude(progress, frame);
  }
}

function prelude(progress: number, f: HandGestureFrame): void {
  f.sequenceIndex = 0;
  const contact = smooth(progress);
  set(f.curlsA, [0.5, 0.04, 0.46, 0.58, 0.68]);
  set(f.curlsB, [0.48, 0.04, 0.44, 0.56, 0.66]);
  f.fingerLiftA[1] = -0.02 * contact;
  f.fingerLiftB[1] = 0.02 * contact;
  f.fingerDepthA[1] = 0.028 * contact;
  f.fingerDepthB[1] = -0.028 * contact;
  f.spreadA = 0.08; f.spreadB = 0.08;
  f.wristBendA = -0.035; f.wristBendB = 0.035;
  f.handRollA = -0.035; f.handRollB = 0.035;
}

function collision(t: number, f: HandGestureFrame): void {
  f.sequenceIndex = 1 + segment(t, [0.75, 1.25, 2.45, 5.4]);
  const fist = window(t, 0.0, 2.35, 0.42);
  set(f.curlsA, [0.46, 0.48, 0.53, 0.58, 0.64]);
  set(f.curlsB, [0.44, 0.5, 0.55, 0.56, 0.62]);
  const impact = window(t, 0.62, 1.48, 0.2);
  f.spreadA = impact * 0.34 - fist * 0.12;
  f.spreadB = -impact * 0.31 + fist * 0.1;
  f.wristBendA = -impact * 0.18 + window(t, 1.1, 3.2, 0.45) * 0.14;
  f.wristBendB = impact * 0.15 - window(t, 1.1, 3.2, 0.45) * 0.11;
  f.palmTurnA = impact * -0.13; f.palmTurnB = impact * 0.15;
  f.handRollA = -0.16 * fist; f.handRollB = 0.19 * fist;
  f.depthA = impact * 0.07; f.depthB = -impact * 0.085;
}

function softMerge(t: number, f: HandGestureFrame): void {
  f.sequenceIndex = 1 + segment(t, [1.2, 3.4, 6.8, 9.2]);
  set(f.curlsA, [0.38, 0.3, 0.26, 0.32, 0.42]);
  set(f.curlsB, [0.34, 0.26, 0.3, 0.38, 0.46]);
  const receive = window(t, 0.1, 8.9, 0.8);
  const interlace = window(t, 2.0, 8.5, 0.85);
  f.palmTurnA = -0.42 * receive;
  f.palmTurnB = 0.31 * receive;
  f.liftA = -0.035 * receive; f.liftB = 0.045 * receive;
  f.depthA = -0.06 * receive; f.depthB = 0.08 * receive;
  f.handRollA = -0.07 * receive; f.handRollB = -0.02 * receive;
  f.spreadA = -0.12 * interlace; f.spreadB = 0.11 * interlace;
  set(f.fingerDepthA, [0.01, 0.055, -0.04, 0.05, -0.025].map(v => v * interlace));
  set(f.fingerDepthB, [-0.02, -0.05, 0.045, -0.045, 0.03].map(v => v * interlace));
  set(f.fingerLiftA, [0, 0.03, -0.02, 0.02, -0.01].map(v => v * interlace));
  set(f.fingerLiftB, [0, -0.025, 0.025, -0.02, 0.015].map(v => v * interlace));
}

function desire(t: number, f: HandGestureFrame): void {
  f.sequenceIndex = 1 + segment(t, [2.0, 4.35, 7.4, 9.8]);
  set(f.curlsA, [0.52, 0.06, 0.34, 0.48, 0.58]);
  set(f.curlsB, [0.56, 0.07, 0.32, 0.46, 0.6]);
  const near = window(t, 0.15, 3.15, 0.55);
  const secondNear = window(t, 4.1, 9.9, 0.8);
  f.fingerLiftA[1] = near * 0.035 - secondNear * 0.018;
  f.fingerLiftB[1] = -near * 0.032 + secondNear * 0.022;
  f.fingerDepthA[1] = near * 0.06 - secondNear * 0.075;
  f.fingerDepthB[1] = -near * 0.055 + secondNear * 0.07;
  f.depthA = near * 0.075 - secondNear * 0.052;
  f.depthB = -near * 0.07 + secondNear * 0.058;
  f.wristBendA = Math.sin(t * 0.48) * 0.065;
  f.wristBendB = -Math.sin(t * 0.48 + 0.7) * 0.06;
  f.spreadA = -0.035; f.spreadB = 0.04;
  f.handRollA = 0.08 * secondNear; f.handRollB = -0.07 * secondNear;
}

function misreading(t: number, seed: number, f: HandGestureFrame): void {
  f.sequenceIndex = 1 + segment(t, [1.2, 3.6, 6.4, 8.7]);
  const swap = t > 4.35;
  const reachA = swap ? 0.2 : 1;
  const reachB = swap ? 1 : 0.25;
  set(f.curlsA, [0.24, 0.1, 0.18, 0.38, 0.5]);
  set(f.curlsB, [0.26, 0.12, 0.2, 0.4, 0.52]);
  f.curlsA[0] *= reachA; f.curlsA[1] *= reachA;
  f.curlsB[0] *= reachB; f.curlsB[1] *= reachB;
  const sign = (seed & 1) ? 1 : -1;
  f.palmTurnA = (swap ? -0.18 : 0.08) * sign;
  f.palmTurnB = (swap ? 0.08 : -0.2) * sign;
  f.depthA = (swap ? -0.16 : 0.06) * sign;
  f.depthB = (swap ? 0.06 : -0.17) * sign;
  f.liftA = swap ? -0.04 : 0.055; f.liftB = -f.liftA;
  f.handRollA = (swap ? -0.2 : 0.08) * sign;
  f.handRollB = (swap ? -0.08 : 0.22) * sign;
  f.fingerLiftA[0] = swap ? 0.02 : 0.08;
  f.fingerLiftB[0] = swap ? -0.08 : -0.02;
  f.fingerDepthA[1] = sign * (swap ? -0.1 : 0.06);
  f.fingerDepthB[1] = sign * (swap ? -0.06 : 0.1);
}

function refusal(t: number, seed: number, f: HandGestureFrame): void {
  f.sequenceIndex = 1 + segment(t, [0.9, 2.3, 5.2, 7.9]);
  const action = smooth((t - 0.72) / 3.2);
  const settle = 1 - smooth((t - 8.1) / 1.7);
  const withdrawal = action * settle;
  const aLeads = (seed & 2) === 0;
  const leadA = aLeads ? 1 : 0.35;
  const leadB = aLeads ? 0.35 : 1;
  // Refusal is a whole-hand withdrawal: fingers gather in sequence while the
  // palm turns and the wrist retreats. No digit is translated independently.
  set(f.curlsA, [0.28, 0.34, 0.42, 0.51, 0.6]);
  set(f.curlsB, [0.3, 0.36, 0.44, 0.53, 0.62]);
  for (let index = 0; index < 5; index += 1) {
    f.curlsA[index] *= withdrawal * leadA;
    f.curlsB[index] *= withdrawal * leadB;
  }
  f.palmTurnA = -0.34 * withdrawal * leadA;
  f.palmTurnB = 0.34 * withdrawal * leadB;
  f.wristBendA = -0.095 * withdrawal * leadA;
  f.wristBendB = 0.085 * withdrawal * leadB;
  f.depthA = 0.075 * withdrawal * leadA;
  f.depthB = -0.07 * withdrawal * leadB;
  f.liftA = 0.018 * withdrawal * leadA;
  f.liftB = -0.014 * withdrawal * leadB;
  f.handRollA = -0.14 * withdrawal * leadA;
  f.handRollB = 0.13 * withdrawal * leadB;
}

function unreadable(t: number, f: HandGestureFrame): void {
  f.sequenceIndex = 1 + segment(t, [2.0, 3.4, 5.5, 7.1, 9.4]);
  if (t < 3.4) {
    fill(f.curlsA, 0.28); fill(f.curlsB, 0.3);
    f.palmTurnA = -0.22; f.palmTurnB = 0.2; f.depthA = 0.05; f.depthB = -0.05;
  } else if (t < 7.1) {
    set(f.curlsA, [0.5, 0.12, 0.2, 0.48, 0.66]);
    set(f.curlsB, [0.54, 0.14, 0.18, 0.5, 0.64]);
    f.fingerLiftA[4] = 0.07; f.fingerLiftB[4] = -0.07;
    f.palmTurnB = 0.2 * smooth((t - 5.2) / 1.7);
  } else {
    fill(f.curlsA, 0.2); fill(f.curlsB, 0.22);
    f.palmTurnA = -0.09; f.palmTurnB = 0.11;
    f.depthA = 0.075; f.depthB = -0.09;
    f.wristBendA = Math.sin(t * 0.55) * 0.04;
    f.wristBendB = -Math.sin(t * 0.47 + 0.6) * 0.04;
    f.handRollA = -0.06; f.handRollB = 0.08;
  }
}

function reset(f: HandGestureFrame): void {
  f.sequenceIndex = 0;
  f.curlsA.fill(0); f.curlsB.fill(0);
  f.fingerLiftA.fill(0); f.fingerLiftB.fill(0);
  f.fingerDepthA.fill(0); f.fingerDepthB.fill(0);
  f.palmTurnA = f.palmTurnB = f.wristBendA = f.wristBendB = f.handRollA = f.handRollB = 0;
  f.spreadA = f.spreadB = f.depthA = f.depthB = f.liftA = f.liftB = 0;
}
function fill(a: Float32Array, v: number): void { a.fill(v); }
function set(a: Float32Array, v: readonly number[]): void { for (let i = 0; i < 5; i += 1) a[i] = v[i] ?? 0; }
function segment(t: number, cuts: readonly number[]): number { const index = cuts.findIndex(c => t < c); return index < 0 ? cuts.length : index; }
function smooth(v: number): number { const x = Math.max(0, Math.min(1, v)); return x * x * (3 - 2 * x); }
function window(t: number, a: number, b: number, feather: number): number { return smooth((t-a)/feather) * (1-smooth((t-(b-feather))/feather)); }
