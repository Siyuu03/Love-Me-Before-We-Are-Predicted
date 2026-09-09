import assert from 'node:assert/strict';
import test from 'node:test';
import {
  APPEARANCE_PREDICTION_INTERVAL_MS,
  APPEARANCE_SMOOTHING_SAMPLES,
  DualAppearanceSmoother,
  FEMININE_APPEARANCE_LABEL,
  MASCULINE_APPEARANCE_LABEL,
  routeAppearancePair,
  type AppearancePrediction,
  type FrozenAppearancePair,
  type SmoothedAppearance,
} from '../src/vision/TeachableMachineInference';
import { ResultResolver } from '../src/visual/results/ResultResolver';

function predictions(feminine: number, masculine: number): readonly AppearancePrediction[] {
  return [
    { className: FEMININE_APPEARANCE_LABEL, probability: feminine },
    { className: MASCULINE_APPEARANCE_LABEL, probability: masculine },
  ];
}

function appearance(s: number, ready = true): SmoothedAppearance {
  return Object.freeze({
    avgFeminine: (1 + s) / 2,
    avgMasculine: (1 - s) / 2,
    s,
    q: Math.abs(s),
    sampleCount: ready ? APPEARANCE_SMOOTHING_SAMPLES : APPEARANCE_SMOOTHING_SAMPLES - 1,
    ready,
  });
}

function pair(left: number, right: number, ready = true): FrozenAppearancePair {
  return Object.freeze({
    left: appearance(left, ready),
    right: appearance(right, ready),
    frozenAtMs: 1000,
  });
}

test('inference cadence and model labels match the installation contract exactly', () => {
  assert.equal(APPEARANCE_PREDICTION_INTERVAL_MS, 200);
  assert.equal(APPEARANCE_SMOOTHING_SAMPLES, 10);
  assert.equal(FEMININE_APPEARANCE_LABEL, 'feminine-coded appearance');
  assert.equal(MASCULINE_APPEARANCE_LABEL, 'masculine-coded appearance');
});

test('each camera averages only its most recent ten exact-label predictions', () => {
  const smoother = new DualAppearanceSmoother();
  smoother.push('left', predictions(0.99, 0.01));
  smoother.push('left', predictions(0.95, 0.05));
  for (let index = 0; index < APPEARANCE_SMOOTHING_SAMPLES; index += 1) {
    smoother.push('left', predictions(0.7, 0.3));
    smoother.push('right', predictions(0.2, 0.8));
  }
  const [left, right] = smoother.getLive();
  assert.equal(left.sampleCount, 10);
  assert.equal(right.sampleCount, 10);
  assert.ok(Math.abs(left.avgFeminine - 0.7) < 1e-6);
  assert.ok(Math.abs(left.s - 0.4) < 1e-6);
  assert.ok(Math.abs(right.s + 0.6) < 1e-6);
});

test('CONTACT freeze is immutable until reset, then both buffers reaccumulate', () => {
  const smoother = new DualAppearanceSmoother();
  for (let index = 0; index < APPEARANCE_SMOOTHING_SAMPLES; index += 1) {
    smoother.push('left', predictions(0.9, 0.1));
    smoother.push('right', predictions(0.25, 0.75));
  }
  const frozen = smoother.freeze(1234);
  assert.equal(smoother.push('left', predictions(0.1, 0.9)), false);
  assert.equal(smoother.freeze(9999), frozen);
  assert.equal(smoother.getFrozen()?.frozenAtMs, 1234);
  assert.ok(Math.abs(smoother.getFrozen()!.left.s - 0.8) < 1e-6);

  smoother.reset();
  assert.equal(smoother.getFrozen(), null);
  assert.equal(smoother.getLive()[0].sampleCount, 0);
  assert.equal(smoother.push('left', predictions(0.1, 0.9)), true);
  assert.equal(smoother.getLive()[0].sampleCount, 1);
});

test('ML debug snapshot reports collecting, live and frozen without new predictions', () => {
  const smoother = new DualAppearanceSmoother();
  assert.equal(smoother.getDebugSnapshot().status, 'COLLECTING');
  for (let index = 0; index < APPEARANCE_SMOOTHING_SAMPLES; index += 1) {
    smoother.push('left', predictions(0.8, 0.2));
    smoother.push('right', predictions(0.3, 0.7));
  }
  const live = smoother.getDebugSnapshot();
  assert.equal(live.status, 'LIVE');
  assert.equal(live.camA.sampleCount, 10);
  assert.equal(live.camB.sampleCount, 10);
  assert.ok(Math.abs(live.pair.d - 0.5) < 1e-6);

  smoother.freeze(2048);
  const frozen = smoother.getDebugSnapshot();
  assert.equal(frozen.status, 'FROZEN');
  assert.equal(frozen.camA.s, live.camA.s);
  assert.equal(frozen.camB.s, live.camB.s);

  smoother.reset();
  const reset = smoother.getDebugSnapshot();
  assert.equal(reset.status, 'COLLECTING');
  assert.equal(reset.camA.sampleCount, 0);
  assert.equal(reset.camB.sampleCount, 0);
});

test('appearance routing follows clarity and distance thresholds in required order', () => {
  assert.equal(routeAppearancePair(pair(0.8, -0.8, false)), 'unreadable');
  assert.equal(routeAppearancePair(pair(0.1, -0.1)), 'unreadable');
  assert.equal(routeAppearancePair(pair(0.1, 0.6)), 'refusal');
  assert.equal(routeAppearancePair(pair(0.1, 0.3)), 'unreadable');
  assert.equal(routeAppearancePair(pair(0.7, 0.5)), 'soft-merge');
  assert.equal(routeAppearancePair(pair(0.7, 0.25)), 'desire');
  assert.equal(routeAppearancePair(pair(0.7, -0.3)), 'misreading');
  assert.equal(routeAppearancePair(pair(0.8, -0.8)), 'collision');
});

test('ResultResolver consumes the frozen camera pair before development fallbacks', () => {
  assert.deepEqual(
    new ResultResolver('safe-unreadable').resolve({ contact: null, appearancePair: pair(0.7, 0.5) }),
    { id: 'soft-merge', source: 'external' },
  );
});
