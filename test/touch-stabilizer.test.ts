import assert from 'node:assert/strict';
import test from 'node:test';
import { StateMachine } from '../src/core/StateMachine';
import type { InputEvent } from '../src/input/InputAdapter';
import { parseSerialInputLine } from '../src/input/SerialProtocol';
import { TouchStabilizer } from '../src/input/TouchStabilizer';
import { StructuralFilamentField } from '../src/visual/filaments/StructuralFilamentField';

const OPTIONS = {
  touchConfirmMs: 70,
  releaseDebounceMs: 220,
  latchGraceMs: 1800,
  secondParticipantWindowMs: 10000,
  quietResetMs: 2200,
};

const INSTALLATION_OPTIONS = {
  touchConfirmMs: 100,
  releaseDebounceMs: 220,
  latchGraceMs: 900,
  secondParticipantWindowMs: 5000,
  quietResetMs: 900,
};

test('a sub-confirmation electrical pulse never starts a session', () => {
  const stabilizer = new TouchStabilizer(OPTIONS);
  stabilizer.handleRawEvent({ type: 'A_TOUCH' });
  assert.deepEqual(stabilizer.update(45), []);
  stabilizer.handleRawEvent({ type: 'A_RELEASE' });
  assert.deepEqual(stabilizer.update(300), []);
  assert.equal(stabilizer.getSnapshot().a.latched, false);
});

test('a confirmed touch stays latched through release chatter', () => {
  const stabilizer = new TouchStabilizer(OPTIONS);
  stabilizer.handleRawEvent({ type: 'A_TOUCH' });
  assert.deepEqual(stabilizer.update(70), [{ type: 'A_TOUCH' }]);
  stabilizer.handleRawEvent({ type: 'A_RELEASE' });
  stabilizer.update(100);
  stabilizer.handleRawEvent({ type: 'A_TOUCH' });
  assert.deepEqual(stabilizer.update(500), []);
  const snapshot = stabilizer.getSnapshot();
  assert.equal(snapshot.a.confirmedTouch, true);
  assert.equal(snapshot.a.latched, true);
});

test('the second participant can join after the first participant releases', () => {
  const stabilizer = new TouchStabilizer(OPTIONS);
  const machine = new StateMachine({
    contactThresholdMs: 350,
    contactTransitionMs: 950,
    resultPlaceholderMs: 4000,
    resetDurationMs: 2100,
  });
  const dispatch = (events: readonly InputEvent[]) => events.forEach((event) => machine.dispatch(event));

  stabilizer.handleRawEvent({ type: 'A_TOUCH' });
  dispatch(stabilizer.update(70));
  assert.equal(machine.getSnapshot().state, 'SOLO_A');
  stabilizer.handleRawEvent({ type: 'A_RELEASE' });
  dispatch(stabilizer.update(2500));
  assert.equal(machine.getSnapshot().state, 'SOLO_A');

  stabilizer.handleRawEvent({ type: 'B_TOUCH' });
  dispatch(stabilizer.update(70));
  assert.equal(machine.getSnapshot().state, 'JOIN');
  machine.update(350);
  assert.equal(machine.getSnapshot().state, 'CONTACT');
});

test('a single participant resets only after the pairing window and sustained quiet', () => {
  const stabilizer = new TouchStabilizer(OPTIONS);
  stabilizer.handleRawEvent({ type: 'A_TOUCH' });
  stabilizer.update(70);
  stabilizer.handleRawEvent({ type: 'A_RELEASE' });
  assert.deepEqual(stabilizer.update(9800), []);
  assert.deepEqual(stabilizer.update(300), [{ type: 'RESET' }]);
});

test('reset clears raw, confirmed, latch and session timers', () => {
  const stabilizer = new TouchStabilizer(OPTIONS);
  stabilizer.handleRawEvent({ type: 'B_TOUCH' });
  stabilizer.update(70);
  stabilizer.reset();
  const snapshot = stabilizer.getSnapshot();
  assert.equal(snapshot.a.rawTouch, false);
  assert.equal(snapshot.b.confirmedTouch, false);
  assert.equal(snapshot.b.latched, false);
  assert.equal(snapshot.sessionStartedAt, null);
});

test('serial protocol accepts old and debounced event vocabularies', () => {
  assert.deepEqual(parseSerialInputLine('A_DOWN'), { type: 'A_TOUCH' });
  assert.deepEqual(parseSerialInputLine('A_TOUCH'), { type: 'A_TOUCH' });
  assert.deepEqual(parseSerialInputLine('B_UP'), { type: 'B_RELEASE' });
  assert.deepEqual(parseSerialInputLine('B_RELEASE'), { type: 'B_RELEASE' });
  assert.equal(parseSerialInputLine('DEBUG raw=1'), null);
});

test('installation buffer confirms at 100ms, pairs within 5s, and resets after 900ms quiet', () => {
  const stabilizer = new TouchStabilizer(INSTALLATION_OPTIONS);
  stabilizer.handleRawEvent({ type: 'A_TOUCH' });
  assert.deepEqual(stabilizer.update(99), []);
  assert.deepEqual(stabilizer.update(1), [{ type: 'A_TOUCH' }]);
  stabilizer.handleRawEvent({ type: 'A_RELEASE' });
  stabilizer.update(250);
  assert.equal(stabilizer.getSnapshot().a.latched, true);
  stabilizer.handleRawEvent({ type: 'B_TOUCH' });
  assert.deepEqual(stabilizer.update(100), [{ type: 'B_TOUCH' }]);
  assert.equal(stabilizer.getSnapshot().latchRemainingMs, 0);
});

test('structural filaments remain one batched object with a stable segment budget', () => {
  const field = new StructuralFilamentField();
  assert.equal(field.object3d.type, 'LineSegments');
  assert.equal(field.filamentCount, 32);
  assert.equal(field.segmentCount, 704);
  assert.equal(field.object3d.geometry.getAttribute('position').count, 1408);
  field.dispose();
});
