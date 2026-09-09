import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { RESULT_IDS, type ResultId, type StateSnapshot } from '../src/core/types';
import { StateMachine } from '../src/core/StateMachine';
import { RESULT_CONFIG } from '../src/visual/results/ResultConfig';
import { ResultDirector } from '../src/visual/results/ResultDirector';
import { ResultLayer } from '../src/visual/results/ResultLayer';
import { ResultRegistry } from '../src/visual/results/ResultRegistry';
import { ResultResolver } from '../src/visual/results/ResultResolver';
import type { ResultSnapshot } from '../src/visual/results/ResultSnapshot';
import { HAND_GESTURE_SEQUENCES, HandGestureLibrary, createHandGestureFrame } from '../src/visual/hands/HandGestureLibrary';
import { VISUAL_THEME } from '../src/visual/theme';

const contact = Object.freeze({ sequenceId: 3, order: 'A_FIRST' as const, sharedTouchMs: 350,
  aHeldMs: 520, bHeldMs: 350, leadMs: 170 });

function resultSnapshot(canonical: boolean): ResultSnapshot {
  const vector = () => new THREE.Vector3();
  return Object.freeze({
    canonical, seed: 47, capturedAt: 1, contact: canonical ? null : contact,
    coreA: vector(), coreB: vector(), coreVelocityA: vector(), coreVelocityB: vector(),
    handCenterA: vector(), handCenterB: vector(),
    wristA: vector(), wristB: vector(), fingertipsA: [], fingertipsB: [], sharedTime: 1,
    slowBreath: 0, secondaryBreath: 0, staffPhase: 0, orbitPhase: 0,
    butterflies: [], cameraPosition: vector(), cameraTarget: vector(),
    handParticleCounts: [5401, 5515],
    handFormation: [1, 1], particleBaseline: 'shared-buffer-geometry',
    staffAmplitude: [0.12, 0.105, 0.08], orbitAlignment: 0.86,
    bridgeBaseline: 0, filamentBaseline: 0,
  });
}

function state(id: ResultId, contactSnapshot = contact): StateSnapshot {
  return { state: 'RESULT', aPressed: true, bPressed: true, sharedTouchMs: 350,
    contactElapsedMs: 720, resultElapsedMs: 0, contactSnapshot, currentResult: id,
    resultSource: 'preview', resetProgress: 0 };
}

test('ResultRegistry registers exactly six unique modules with the full lifecycle', () => {
  const registry = new ResultRegistry(new ResultLayer());
  assert.deepEqual(registry.ids(), RESULT_IDS);
  assert.equal(new Set(registry.values().map((module) => module.id)).size, 6);
  registry.values().forEach((module) => {
    assert.equal(typeof module.enter, 'function'); assert.equal(typeof module.update, 'function');
    assert.equal(typeof module.exit, 'function'); assert.equal(typeof module.dispose, 'function');
  });
  registry.dispose();
});

test('all six modules enter from real and canonical contact snapshots', () => {
  RESULT_IDS.forEach((id) => {
    for (const canonical of [false, true]) {
      const director = new ResultDirector();
      let capturedCanonical: boolean | null = null;
      director.update(1 / 60, state(id, canonical ? null : contact), (requested) => {
        capturedCanonical = requested; return resultSnapshot(requested);
      });
      assert.equal(director.layer.resultId, id);
      assert.equal(capturedCanonical, canonical);
      director.dispose();
    }
  });
});

test('result resolver never fabricates a classification without reliable data', () => {
  assert.deepEqual(new ResultResolver('safe-unreadable').resolve({ contact }),
    { id: 'unreadable', source: 'safe-unreadable' });
  assert.deepEqual(new ResultResolver('external').resolve({ contact, resultHint: 'desire', confidence: 0.8 }),
    { id: 'desire', source: 'external' });
  assert.deepEqual(new ResultResolver('fixed', 'refusal').resolve({ contact }),
    { id: 'refusal', source: 'fixed' });
  const cycle = new ResultResolver('cycle');
  assert.deepEqual(RESULT_IDS.map(() => cycle.resolve({ contact }).id), RESULT_IDS);
});

test('every result duration enters RESET and R interrupts safely', () => {
  RESULT_IDS.forEach((id) => {
    const machine = new StateMachine({ contactThresholdMs: 350, contactTransitionMs: 720,
      resultDurationsMs: RESULT_CONFIG.durationsMs, resetDurationMs: 2400,
      resolveResult: () => ({ id: 'unreadable', source: 'safe-unreadable' }) });
    machine.dispatch({ type: 'FORCE_RESULT', result: id });
    machine.update(RESULT_CONFIG.durationsMs[id] - 1);
    assert.equal(machine.getSnapshot().state, 'RESULT');
    machine.update(1); assert.equal(machine.getSnapshot().state, 'RESET');
    machine.dispatch({ type: 'RESET' }); assert.equal(machine.getSnapshot().state, 'RESET');
  });
});

test('preview keys are safe from every state and preserve a real contact capture', () => {
  const setups: readonly ((machine: StateMachine) => void)[] = [
    () => {},
    (machine) => machine.dispatch({ type: 'A_TOUCH' }),
    (machine) => { machine.dispatch({ type: 'A_TOUCH' }); machine.dispatch({ type: 'B_TOUCH' }); },
    (machine) => { machine.dispatch({ type: 'A_TOUCH' }); machine.dispatch({ type: 'B_TOUCH' }); machine.update(350); },
    (machine) => machine.dispatch({ type: 'FORCE_RESULT', result: 'collision' }),
    (machine) => machine.dispatch({ type: 'RESET' }),
  ];
  setups.forEach((setup) => RESULT_IDS.forEach((id) => {
    const machine = new StateMachine({ contactThresholdMs: 350, contactTransitionMs: 720,
      resultDurationsMs: RESULT_CONFIG.durationsMs, resetDurationMs: 2400,
      resolveResult: () => ({ id: 'unreadable', source: 'safe-unreadable' }) });
    setup(machine);
    const captureBefore = machine.getSnapshot().contactSnapshot;
    machine.dispatch({ type: 'FORCE_RESULT', result: id });
    assert.equal(machine.getSnapshot().state, 'RESULT');
    assert.equal(machine.getSnapshot().currentResult, id);
    if (captureBefore) assert.equal(machine.getSnapshot().contactSnapshot, captureBefore);
  }));
});

test('touch chatter cannot interrupt RESULT and RESET clears virtual touches', () => {
  const machine = new StateMachine({ contactThresholdMs: 350, contactTransitionMs: 720,
    resultDurationsMs: RESULT_CONFIG.durationsMs, resetDurationMs: 2400,
    resolveResult: () => ({ id: 'unreadable', source: 'safe-unreadable' }) });
  machine.dispatch({ type: 'FORCE_RESULT', result: 'soft-merge' });
  for (let index = 0; index < 32; index += 1) {
    machine.dispatch({ type: index % 2 ? 'A_TOUCH' : 'A_RELEASE' });
    machine.dispatch({ type: index % 2 ? 'B_RELEASE' : 'B_TOUCH' });
    machine.update(17);
    assert.equal(machine.getSnapshot().state, 'RESULT');
  }
  machine.dispatch({ type: 'RESET' });
  assert.equal(machine.getSnapshot().aPressed, false);
  assert.equal(machine.getSnapshot().bPressed, false);
});

test('36 result switches reuse one registry and clear the layer through RESET', () => {
  const director = new ResultDirector();
  const modules = director.registry.values();
  for (let index = 0; index < 36; index += 1) {
    const id = RESULT_IDS[index % 6];
    director.update(0.36, state(id), (canonical) => resultSnapshot(canonical));
    director.update(0.36, state(id), (canonical) => resultSnapshot(canonical));
    assert.ok(Number.isFinite(director.layer.handOffsetA.x));
  }
  assert.deepEqual(director.registry.values(), modules);
  director.update(0.1, { ...state('unreadable'), state: 'RESET', currentResult: null,
    resultSource: null, resetProgress: 1 }, (canonical) => resultSnapshot(canonical));
  assert.equal(director.layer.resultId, null);
  assert.equal(director.layer.handGhost, 0);
  assert.equal(director.layer.butterflyScatter, 0);
  director.dispose();
});

test('all six results expose unique semantic hand gesture sequences and keyframes', () => {
  const names = RESULT_IDS.map((id) => HAND_GESTURE_SEQUENCES[id].join('|'));
  assert.equal(new Set(names).size, RESULT_IDS.length);
  const signatures = RESULT_IDS.map((id) => {
    const frame = createHandGestureFrame();
    HandGestureLibrary.sample(id, 3.1, 47, frame);
    return [
      ...frame.curlsA, ...frame.curlsB,
      frame.palmTurnA, frame.palmTurnB,
      frame.depthA, frame.depthB,
      frame.spreadA, frame.spreadB,
    ].map((value) => value.toFixed(3)).join(',');
  });
  assert.equal(new Set(signatures).size, RESULT_IDS.length);
});

test('all six results share one index-finger contact key before their gestures diverge', () => {
  const preludeSignatures = RESULT_IDS.map((id) => {
    const frame = createHandGestureFrame();
    HandGestureLibrary.sample(id, 0.42, 47, frame);
    return [...frame.curlsA, ...frame.curlsB, ...frame.fingerLiftA, ...frame.fingerLiftB]
      .map((value) => value.toFixed(4)).join(',');
  });
  assert.equal(new Set(preludeSignatures).size, 1);
  assert.ok(preludeSignatures[0].includes('0.0400'));
});

test('unreadable grows an open wrist restraint without erasing either hand', () => {
  const director = new ResultDirector();
  director.update(7.8, state('unreadable'), (canonical) => resultSnapshot(canonical));
  assert.ok(director.layer.wristCuff > 0.4);
  assert.ok(director.layer.handOpacity > 0.85);
  director.dispose();
});

test('result hand visibility exceeds idle while staff remains subordinate', () => {
  assert.ok(VISUAL_THEME.hands.visibility.resultBoost >= 1.25);
  assert.ok(VISUAL_THEME.hands.visibility.resultBoost <= 1.45);
  assert.ok(RESULT_CONFIG.staffVisibility.RESULT < RESULT_CONFIG.staffVisibility.IDLE * 0.5);
  assert.ok(RESULT_CONFIG.staffVisibility.CONTACT < RESULT_CONFIG.staffVisibility.SOLO_A);
});
