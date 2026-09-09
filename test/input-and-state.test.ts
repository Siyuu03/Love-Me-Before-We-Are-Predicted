import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { StateMachine } from '../src/core/StateMachine';
import { StateHistory } from '../src/core/StateHistory';
import { RESULT_IDS, type InstallationState } from '../src/core/types';
import type { InputEvent } from '../src/input/InputAdapter';
import { KeyboardInputAdapter } from '../src/input/KeyboardInputAdapter';
import { AmbientParticleField } from '../src/visual/ambient/AmbientParticleField';
import { ButterflySwarm } from '../src/visual/butterflies/ButterflySwarm';
import { ChoreographyController } from '../src/visual/choreography/ChoreographyController';
import { CoreLights } from '../src/visual/cores/CoreLights';
import { CoreMotion } from '../src/visual/cores/CoreMotion';
import { HandFormationController } from '../src/visual/hands/HandFormationController';
import { ParticleHands } from '../src/visual/hands/ParticleHands';
import { ProceduralHandPointSource } from '../src/visual/hands/ProceduralHandPointSource';
import { SharedMotionField } from '../src/visual/motion/SharedMotionField';
import { RelationshipOrbitField } from '../src/visual/orbits/RelationshipOrbitField';
import { BridgeParticleField } from '../src/visual/staves/BridgeParticleField';
import { StaffField } from '../src/visual/staves/StaffField';
import { fitLogicalViewport } from '../src/visual/viewport';
import { ResultLayer } from '../src/visual/results/ResultLayer';
import { VISUAL_THEME } from '../src/visual/theme';
import { RhythmDirector } from '../src/audio/RhythmDirector';
import { RHYTHM_PROFILES } from '../src/visual/results/ResultConfig';

const CONTACT_THRESHOLD_MS = 800;
const CONTACT_TRANSITION_MS = 950;
const RESULT_PLACEHOLDER_MS = 4000;
const RESET_DURATION_MS = 2100;

function createKeyboardHarness() {
  const testWindow = new EventTarget();
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: testWindow,
  });

  const adapter = new KeyboardInputAdapter();
  const events: InputEvent[] = [];
  adapter.subscribe((event) => events.push(event));
  adapter.start();

  const key = (type: 'keydown' | 'keyup', code: string, repeat = false, shiftKey = false): void => {
    const event = new Event(type, { cancelable: true });
    Object.defineProperties(event, {
      code: { value: code },
      repeat: { value: repeat },
      shiftKey: { value: shiftKey },
    });
    testWindow.dispatchEvent(event);
  };

  return { adapter, events, key };
}

function createIntegratedHarness() {
  const keyboard = createKeyboardHarness();
  const machine = new StateMachine({
    contactThresholdMs: CONTACT_THRESHOLD_MS,
    contactTransitionMs: CONTACT_TRANSITION_MS,
    resultPlaceholderMs: RESULT_PLACEHOLDER_MS,
    resetDurationMs: RESET_DURATION_MS,
  });
  keyboard.adapter.subscribe((event) => machine.dispatch(event));
  return { ...keyboard, machine };
}

test('A and B use keydown/keyup, and repeated keydown is ignored', () => {
  const { adapter, events, key } = createKeyboardHarness();

  key('keydown', 'KeyA');
  key('keydown', 'KeyA', true);
  key('keydown', 'KeyA');
  key('keyup', 'KeyA');
  key('keydown', 'KeyB');
  key('keyup', 'KeyB');

  assert.deepEqual(
    events.map((event) => event.type),
    ['A_TOUCH', 'A_RELEASE', 'B_TOUCH', 'B_RELEASE'],
  );
  adapter.dispose();
});

test('solo, join, one-shot contact and placeholder result follow held durations', () => {
  const { adapter, key, machine } = createIntegratedHarness();

  assert.equal(machine.getSnapshot().state, 'IDLE');
  key('keydown', 'KeyA');
  assert.equal(machine.getSnapshot().state, 'SOLO_A');
  key('keydown', 'KeyB');
  assert.equal(machine.getSnapshot().state, 'JOIN');

  machine.update(799);
  assert.equal(machine.getSnapshot().state, 'JOIN');
  machine.update(1);
  assert.equal(machine.getSnapshot().state, 'CONTACT');
  assert.equal(machine.getSnapshot().sharedTouchMs, 800);
  assert.equal(machine.getSnapshot().contactSnapshot?.sequenceId, 1);

  key('keyup', 'KeyA');
  assert.equal(machine.getSnapshot().state, 'CONTACT');
  key('keyup', 'KeyB');
  assert.equal(machine.getSnapshot().state, 'CONTACT');
  machine.update(CONTACT_TRANSITION_MS - 1);
  assert.equal(machine.getSnapshot().state, 'CONTACT');
  machine.update(1);
  assert.equal(machine.getSnapshot().state, 'RESULT');
  assert.equal(machine.getSnapshot().currentResult, 'unreadable');
  adapter.dispose();
});

test('B can independently enter and leave SOLO_B', () => {
  const { adapter, key, machine } = createIntegratedHarness();

  key('keydown', 'KeyB');
  assert.equal(machine.getSnapshot().state, 'SOLO_B');
  assert.equal(machine.getSnapshot().bPressed, true);
  key('keyup', 'KeyB');
  assert.equal(machine.getSnapshot().state, 'IDLE');
  assert.equal(machine.getSnapshot().bPressed, false);
  adapter.dispose();
});

test('A can independently enter and leave SOLO_A', () => {
  const { adapter, key, machine } = createIntegratedHarness();

  key('keydown', 'KeyA');
  assert.equal(machine.getSnapshot().state, 'SOLO_A');
  assert.equal(machine.getSnapshot().aPressed, true);
  key('keyup', 'KeyA');
  assert.equal(machine.getSnapshot().state, 'IDLE');
  assert.equal(machine.getSnapshot().aPressed, false);
  adapter.dispose();
});

test('A then B freezes an A-first contact snapshot exactly once', () => {
  const { adapter, key, machine } = createIntegratedHarness();

  key('keydown', 'KeyA');
  machine.update(120);
  key('keydown', 'KeyB');
  machine.update(CONTACT_THRESHOLD_MS);

  const captured = machine.getSnapshot().contactSnapshot;
  assert.equal(machine.getSnapshot().state, 'CONTACT');
  assert.equal(captured?.order, 'A_FIRST');
  assert.equal(captured?.leadMs, 120);
  assert.equal(captured?.aHeldMs, 920);
  assert.equal(captured?.bHeldMs, 800);

  machine.dispatch({ type: 'A_TOUCH' });
  machine.dispatch({ type: 'B_TOUCH' });
  machine.update(100);
  assert.equal(machine.getSnapshot().contactSnapshot, captured);
  assert.equal(machine.getSnapshot().contactSnapshot?.sequenceId, 1);
  adapter.dispose();
});

test('B then A freezes a B-first contact snapshot', () => {
  const { adapter, key, machine } = createIntegratedHarness();

  key('keydown', 'KeyB');
  machine.update(75);
  key('keydown', 'KeyA');
  machine.update(CONTACT_THRESHOLD_MS);

  const captured = machine.getSnapshot().contactSnapshot;
  assert.equal(captured?.order, 'B_FIRST');
  assert.equal(captured?.leadMs, 75);
  assert.equal(captured?.aHeldMs, 800);
  assert.equal(captured?.bHeldMs, 875);
  adapter.dispose();
});

test('releasing both before threshold cancels JOIN without stale shared time', () => {
  const { adapter, key, machine } = createIntegratedHarness();

  key('keydown', 'KeyA');
  key('keydown', 'KeyB');
  machine.update(410);
  key('keyup', 'KeyA');
  assert.equal(machine.getSnapshot().state, 'SOLO_B');
  key('keyup', 'KeyB');
  assert.equal(machine.getSnapshot().state, 'IDLE');
  assert.equal(machine.getSnapshot().sharedTouchMs, 0);
  assert.equal(machine.getSnapshot().contactSnapshot, null);
  adapter.dispose();
});

test('rapid touch jitter never sticks and the eventual contact triggers once', () => {
  const { adapter, key, machine } = createIntegratedHarness();

  for (let cycle = 0; cycle < 32; cycle += 1) {
    key('keydown', cycle % 2 === 0 ? 'KeyA' : 'KeyB');
    key('keydown', cycle % 2 === 0 ? 'KeyB' : 'KeyA');
    machine.update(18 + (cycle % 5));
    key('keyup', cycle % 2 === 0 ? 'KeyA' : 'KeyB');
    key('keyup', cycle % 2 === 0 ? 'KeyB' : 'KeyA');
    assert.equal(machine.getSnapshot().state, 'IDLE');
  }

  key('keydown', 'KeyA');
  key('keydown', 'KeyB');
  machine.update(CONTACT_THRESHOLD_MS);
  assert.equal(machine.getSnapshot().state, 'CONTACT');
  assert.equal(machine.getSnapshot().contactSnapshot?.sequenceId, 1);
  machine.dispatch({ type: 'A_TOUCH' });
  machine.dispatch({ type: 'B_TOUCH' });
  assert.equal(machine.getSnapshot().contactSnapshot?.sequenceId, 1);
  adapter.dispose();
});

test('number keys 1–6 preview the six result states and 0 returns to idle', () => {
  const { adapter, key, machine } = createIntegratedHarness();

  key('keydown', 'Digit0');
  assert.equal(machine.getSnapshot().state, 'IDLE');
  key('keyup', 'Digit0');
  for (let result = 1; result <= 6; result += 1) {
    key('keydown', `Digit${result}`);
    const snapshot = machine.getSnapshot();
    assert.equal(snapshot.state, 'RESULT');
    assert.equal(snapshot.currentResult, RESULT_IDS[result - 1]);
    key('keyup', `Digit${result}`);
  }
  adapter.dispose();
});

test('R enters RESET and returns to IDLE using delta time', () => {
  const { adapter, key, machine } = createIntegratedHarness();

  key('keydown', 'Digit4');
  key('keyup', 'Digit4');
  key('keydown', 'KeyR');
  assert.equal(machine.getSnapshot().state, 'RESET');
  assert.equal(machine.getSnapshot().currentResult, null);

  machine.update(RESET_DURATION_MS - 1);
  assert.equal(machine.getSnapshot().state, 'RESET');
  machine.update(1);
  assert.equal(machine.getSnapshot().state, 'IDLE');
  adapter.dispose();
});

test('RESULT placeholder waits four seconds, then RESET completes back at IDLE', () => {
  const { adapter, key, machine } = createIntegratedHarness();

  key('keydown', 'KeyA');
  key('keydown', 'KeyB');
  machine.update(CONTACT_THRESHOLD_MS);
  assert.equal(machine.getSnapshot().state, 'CONTACT');
  machine.update(CONTACT_TRANSITION_MS);
  assert.equal(machine.getSnapshot().state, 'RESULT');

  machine.update(RESULT_PLACEHOLDER_MS - 1);
  assert.equal(machine.getSnapshot().state, 'RESULT');
  machine.update(1);
  assert.equal(machine.getSnapshot().state, 'RESET');
  assert.equal(machine.getSnapshot().aPressed, false);
  assert.equal(machine.getSnapshot().bPressed, false);

  machine.dispatch({ type: 'A_TOUCH' });
  machine.dispatch({ type: 'B_TOUCH' });
  assert.equal(machine.getSnapshot().state, 'RESET');
  assert.equal(machine.getSnapshot().aPressed, false);
  assert.equal(machine.getSnapshot().bPressed, false);
  machine.update(RESET_DURATION_MS - 1);
  assert.equal(machine.getSnapshot().state, 'RESET');
  machine.update(1);
  assert.equal(machine.getSnapshot().state, 'IDLE');
  adapter.dispose();
});

test('R safely starts RESET from every installation state', () => {
  const scenarios: readonly [InstallationState, (machine: StateMachine) => void][] = [
    ['IDLE', () => {}],
    ['SOLO_A', (machine) => machine.dispatch({ type: 'A_TOUCH' })],
    ['JOIN', (machine) => {
      machine.dispatch({ type: 'A_TOUCH' });
      machine.dispatch({ type: 'B_TOUCH' });
    }],
    ['CONTACT', (machine) => {
      machine.dispatch({ type: 'A_TOUCH' });
      machine.dispatch({ type: 'B_TOUCH' });
      machine.update(CONTACT_THRESHOLD_MS);
    }],
    ['RESULT', (machine) => machine.dispatch({ type: 'FORCE_RESULT', result: 'desire' })],
    ['RESET', (machine) => machine.dispatch({ type: 'RESET' })],
  ];

  scenarios.forEach(([expectedState, setup]) => {
    const machine = new StateMachine({
      contactThresholdMs: CONTACT_THRESHOLD_MS,
      contactTransitionMs: CONTACT_TRANSITION_MS,
      resultPlaceholderMs: RESULT_PLACEHOLDER_MS,
      resetDurationMs: RESET_DURATION_MS,
    });
    setup(machine);
    assert.equal(machine.getSnapshot().state, expectedState);
    machine.dispatch({ type: 'RESET' });
    assert.equal(machine.getSnapshot().state, 'RESET');
    assert.equal(machine.getSnapshot().aPressed, false);
    assert.equal(machine.getSnapshot().bPressed, false);
    machine.update(RESET_DURATION_MS);
    assert.equal(machine.getSnapshot().state, 'IDLE');
  });
});

test('D emits one debug toggle event per physical press', () => {
  const { adapter, events, key } = createKeyboardHarness();

  key('keydown', 'KeyD');
  key('keydown', 'KeyD', true);
  key('keyup', 'KeyD');
  assert.equal(events.filter((event) => event.type === 'TOGGLE_DEBUG').length, 1);
  adapter.dispose();
});

test('H and C each emit one isolated development control event', () => {
  const { adapter, events, key } = createKeyboardHarness();
  key('keydown', 'KeyH'); key('keydown', 'KeyH', true); key('keyup', 'KeyH');
  key('keydown', 'KeyC'); key('keydown', 'KeyC', true); key('keyup', 'KeyC');
  assert.equal(events.filter((event) => event.type === 'TOGGLE_HAND_CHECK').length, 1);
  assert.equal(events.filter((event) => event.type === 'TOGGLE_CAMERA_SETUP').length, 1);
  adapter.dispose();
});

test('Shift+D opens the isolated deep development HUD event', () => {
  const { adapter, events, key } = createKeyboardHarness();
  key('keydown', 'KeyD', false, true); key('keyup', 'KeyD', false, true);
  assert.equal(events.filter((event) => event.type === 'TOGGLE_DEEP_DEBUG').length, 1);
  assert.equal(events.filter((event) => event.type === 'TOGGLE_DEBUG').length, 0);
  adapter.dispose();
});

test('logical 16:9 viewport remains centered for 0, 90 and -90 degrees', () => {
  const landscape = fitLogicalViewport(1920, 1080, 0, 16 / 9);
  assert.equal(landscape.renderWidth, 1920);
  assert.equal(landscape.renderHeight, 1080);

  const clockwisePortrait = fitLogicalViewport(1080, 1920, 90, 16 / 9);
  assert.equal(clockwisePortrait.renderWidth, 1920);
  assert.equal(clockwisePortrait.renderHeight, 1080);

  const counterClockwisePortrait = fitLogicalViewport(1080, 1920, -90, 16 / 9);
  assert.equal(counterClockwisePortrait.renderWidth, 1920);
  assert.equal(counterClockwisePortrait.renderHeight, 1080);
});

test('IDLE core motion stays continuous and separated over five simulated minutes', () => {
  const motion = new CoreMotion();
  const machine = new StateMachine({
    contactThresholdMs: CONTACT_THRESHOLD_MS,
    contactTransitionMs: CONTACT_TRANSITION_MS,
    resultPlaceholderMs: RESULT_PLACEHOLDER_MS,
    resetDurationMs: RESET_DURATION_MS,
  });
  const choreography = new ChoreographyController(
    CONTACT_THRESHOLD_MS,
    CONTACT_TRANSITION_MS,
  );
  const sharedMotion = new SharedMotionField();
  const initialFrame = choreography.update(0, machine.getSnapshot());
  const initialSharedFrame = sharedMotion.update(0, machine.getSnapshot(), initialFrame);
  const initial = motion.update(0, initialFrame, initialSharedFrame)
    .map((point) => point.clone());
  let previous = initial.map((point) => point.clone());
  let maximumStep = 0;
  let minimumSeparation = Number.POSITIVE_INFINITY;

  for (let frame = 0; frame < 5 * 60 * 60; frame += 1) {
    machine.update(1000 / 60);
    const choreographyFrame = choreography.update(1 / 60, machine.getSnapshot());
    const sharedFrame = sharedMotion.update(
      1 / 60,
      machine.getSnapshot(),
      choreographyFrame,
    );
    const current = motion.update(1 / 60, choreographyFrame, sharedFrame);
    maximumStep = Math.max(
      maximumStep,
      current[0].distanceTo(previous[0]),
      current[1].distanceTo(previous[1]),
    );
    minimumSeparation = Math.min(minimumSeparation, current[0].distanceTo(current[1]));
    previous = current.map((point) => point.clone());
  }

  assert.ok(maximumStep < 0.01, `maximum step was ${maximumStep}`);
  assert.ok(minimumSeparation > 0.6, `minimum separation was ${minimumSeparation}`);
  assert.ok(previous[0].distanceTo(initial[0]) > 0.01);
  assert.ok(previous[1].distanceTo(initial[1]) > 0.01);
});

test('IDLE, SOLO_A and SOLO_B hand formation states remain asymmetric', () => {
  const idleMachine = new StateMachine({
    contactThresholdMs: CONTACT_THRESHOLD_MS,
    contactTransitionMs: CONTACT_TRANSITION_MS,
    resultPlaceholderMs: RESULT_PLACEHOLDER_MS,
    resetDurationMs: RESET_DURATION_MS,
  });
  const idleChoreography = new ChoreographyController(
    CONTACT_THRESHOLD_MS,
    CONTACT_TRANSITION_MS,
  );
  const idleController = new HandFormationController();
  const idle = idleController.update(1, idleChoreography.update(1, idleMachine.getSnapshot()));
  assert.equal(idle.formationA, idle.formationB);
  assert.equal(idle.opacityA, idle.opacityB);

  const soloAMachine = new StateMachine({
    contactThresholdMs: CONTACT_THRESHOLD_MS,
    contactTransitionMs: CONTACT_TRANSITION_MS,
    resultPlaceholderMs: RESULT_PLACEHOLDER_MS,
    resetDurationMs: RESET_DURATION_MS,
  });
  soloAMachine.dispatch({ type: 'A_TOUCH' });
  const soloAChoreography = new ChoreographyController(
    CONTACT_THRESHOLD_MS,
    CONTACT_TRANSITION_MS,
  );
  const soloAController = new HandFormationController();
  const soloA = soloAController.update(
    1,
    soloAChoreography.update(1, soloAMachine.getSnapshot()),
  );
  assert.ok(soloA.formationA > soloA.formationB);
  assert.ok(soloA.opacityA > soloA.opacityB);

  const soloBMachine = new StateMachine({
    contactThresholdMs: CONTACT_THRESHOLD_MS,
    contactTransitionMs: CONTACT_TRANSITION_MS,
    resultPlaceholderMs: RESULT_PLACEHOLDER_MS,
    resetDurationMs: RESET_DURATION_MS,
  });
  soloBMachine.dispatch({ type: 'B_TOUCH' });
  const soloBChoreography = new ChoreographyController(
    CONTACT_THRESHOLD_MS,
    CONTACT_TRANSITION_MS,
  );
  const soloBController = new HandFormationController();
  const soloB = soloBController.update(
    1,
    soloBChoreography.update(1, soloBMachine.getSnapshot()),
  );
  assert.ok(soloB.formationB > soloB.formationA);
  assert.ok(soloB.opacityB > soloB.opacityA);
});

test('JOIN choreography is interruptible and withdraws smoothly', () => {
  const machine = new StateMachine({
    contactThresholdMs: CONTACT_THRESHOLD_MS,
    contactTransitionMs: CONTACT_TRANSITION_MS,
    resultPlaceholderMs: RESULT_PLACEHOLDER_MS,
    resetDurationMs: RESET_DURATION_MS,
  });
  const choreography = new ChoreographyController(
    CONTACT_THRESHOLD_MS,
    CONTACT_TRANSITION_MS,
  );
  machine.dispatch({ type: 'A_TOUCH' });
  machine.dispatch({ type: 'B_TOUCH' });

  let frame = choreography.update(0, machine.getSnapshot());
  for (let index = 0; index < 24; index += 1) {
    machine.update(1000 / 60);
    frame = choreography.update(1 / 60, machine.getSnapshot());
  }
  const gatherBeforeRelease = frame.interstitialGather;
  assert.ok(gatherBeforeRelease > 0);

  machine.dispatch({ type: 'B_RELEASE' });
  const firstWithdrawalFrame = choreography.update(1 / 60, machine.getSnapshot());
  const gatherAtWithdrawal = firstWithdrawalFrame.interstitialGather;
  assert.ok(gatherAtWithdrawal > 0);
  assert.ok(gatherAtWithdrawal <= gatherBeforeRelease + 0.02);

  for (let index = 0; index < 120; index += 1) {
    frame = choreography.update(1 / 60, machine.getSnapshot());
  }
  assert.ok(frame.interstitialGather < gatherAtWithdrawal);
  assert.equal(machine.getSnapshot().state, 'SOLO_A');
});

test('state history keeps only real transitions', () => {
  const history = new StateHistory(4);
  history.record('SOLO_A');
  history.record('SOLO_A');
  history.record('JOIN');
  history.record('SOLO_B');
  history.record('IDLE');
  assert.deepEqual(history.getEntries(), ['SOLO_A', 'JOIN', 'SOLO_B', 'IDLE']);
});

test('procedural hand source includes dense palm, wrist, finger and joint samples', () => {
  const source = new ProceduralHandPointSource();
  const handA = source.createSamples('A', 0.92);
  const handB = source.createSamples('B', 1);
  assert.ok(handA.particles.length > 1800);
  assert.ok(handB.particles.length > 2000);
  assert.ok(handB.particles.length > handA.particles.length);
  const zones = new Set(handB.particles.map((particle) => particle.zone));
  ['wrist', 'palm', 'thumb', 'index', 'middle', 'ring', 'pinky', 'fingertips', 'palmEdge']
    .forEach((zone) => assert.ok(zones.has(zone as never)));

  const boundsA = handA.particles.reduce(
    (bounds, particle) => {
      bounds.minX = Math.min(bounds.minX, particle.position.x);
      bounds.maxX = Math.max(bounds.maxX, particle.position.x);
      bounds.minY = Math.min(bounds.minY, particle.position.y);
      bounds.maxY = Math.max(bounds.maxY, particle.position.y);
      return bounds;
    },
    { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity },
  );
  assert.ok(boundsA.minX < -0.45);
  assert.ok(boundsA.maxX > 0.8);
  assert.ok(boundsA.minY < -0.35);
  assert.ok(boundsA.maxY > 0.3);
});

test('particle hands keep form, contour constellations and shed dust in one Points draw', () => {
  const hands = new ParticleHands();
  const geometry = hands.object3d.geometry;
  const contour = geometry.getAttribute('aContour');
  const shed = geometry.getAttribute('aShed');
  assert.equal(hands.particleCountA, VISUAL_THEME.hands.visibility.particleCountPerHand);
  assert.equal(hands.particleCountB, VISUAL_THEME.hands.visibility.particleCountPerHand);
  assert.equal(hands.object3d.children.length, 0);
  assert.equal(Array.from(contour.array).filter((value) => value === 1).length, 900);
  assert.ok(Array.from(shed.array).filter((value) => value === 1).length > 300);
  hands.setReadabilityCheck(true);
  hands.setReadabilityCheck(false);
  hands.dispose();
});

test('ambient field combines all three particle layers into one Points object', () => {
  const field = new AmbientParticleField();
  assert.equal(
    field.particleCount,
    VISUAL_THEME.ambient.dustCount
      + VISUAL_THEME.ambient.coreParticlesPerParticipant * 2
      + VISUAL_THEME.ambient.relationPathCount,
  );
  assert.equal(field.object3d.isPoints, true);
  assert.equal(field.object3d.children.length, 0);
  field.dispose();
});

test('butterflies use one instanced four-wing geometry and remain finite', () => {
  const swarm = new ButterflySwarm();
  assert.ok(swarm.instanceCount >= 12);
  assert.ok(swarm.instanceCount <= 18);
  assert.equal(swarm.object3d.isInstancedMesh, true);
  assert.ok(swarm.object3d.geometry.getAttribute('aWingKind').count > 24);
  assert.equal(swarm.positionsAreFinite(), true);
  swarm.dispose();
});

test('relationship orbits and staff bridges each remain a single Points draw object', () => {
  const orbits = new RelationshipOrbitField();
  const bridges = new BridgeParticleField();
  assert.equal(orbits.particleCount, VISUAL_THEME.orbits.particleCount);
  assert.equal(bridges.particleCount, VISUAL_THEME.bridges.particleCount);
  assert.equal(orbits.object3d.isPoints, true);
  assert.equal(bridges.object3d.isPoints, true);
  assert.equal(orbits.object3d.children.length, 0);
  assert.equal(bridges.object3d.children.length, 0);
  orbits.dispose();
  bridges.dispose();
});

test('four automatic interaction cycles keep draw objects, objects and particles stable', () => {
  const machine = new StateMachine({
    contactThresholdMs: CONTACT_THRESHOLD_MS,
    contactTransitionMs: CONTACT_TRANSITION_MS,
    resultPlaceholderMs: RESULT_PLACEHOLDER_MS,
    resetDurationMs: RESET_DURATION_MS,
  });
  const choreography = new ChoreographyController(
    CONTACT_THRESHOLD_MS,
    CONTACT_TRANSITION_MS,
  );
  const sharedMotion = new SharedMotionField();
  const coreLights = new CoreLights();
  const ambient = new AmbientParticleField();
  const orbits = new RelationshipOrbitField();
  const bridges = new BridgeParticleField();
  const hands = new ParticleHands();
  const butterflies = new ButterflySwarm();
  const staves = new StaffField();
  const result = new ResultLayer();
  const rhythm = new RhythmDirector();
  const scene = new THREE.Scene();
  scene.add(
    staves.object3d,
    ambient.object3d,
    orbits.object3d,
    bridges.object3d,
    hands.object3d,
    butterflies.object3d,
    coreLights.object3d,
  );

  const initialObjects = countSceneObjects(scene);
  const initialDrawObjects = countDrawObjects(scene);
  const initialParticles = coreLights.particleCount
    + ambient.particleCount
    + orbits.particleCount
    + bridges.particleCount
    + hands.particleCount;
  assert.ok(hands.particleCountA >= 7200 - 10);
  assert.ok(hands.particleCountB >= 7200 - 10);
  assert.ok(initialParticles >= 18000 && initialParticles <= 22000);
  assert.ok(initialDrawObjects <= 15);

  for (let cycle = 0; cycle < 4; cycle += 1) {
    machine.dispatch({ type: 'A_TOUCH' });
    machine.dispatch({ type: 'B_TOUCH' });
    for (let frameIndex = 0; frameIndex < 1050; frameIndex += 1) {
      const deltaSeconds = 1 / 60;
      machine.update(1000 / 60);
      const snapshot = machine.getSnapshot();
      const frame = choreography.update(deltaSeconds, snapshot);
      const sharedFrame = sharedMotion.update(deltaSeconds, snapshot, frame);
      const rhythmFrame = rhythm.update(deltaSeconds, snapshot);
      const anchors = coreLights.update(deltaSeconds, snapshot, frame, sharedFrame, result);
      sharedMotion.updateReferences(anchors, frame);
      staves.update(sharedFrame, frame, result);
      ambient.update(deltaSeconds, sharedFrame, frame, result, rhythmFrame);
      orbits.update(sharedFrame, frame, result);
      bridges.update(sharedFrame, frame, result);
      hands.update(deltaSeconds, sharedFrame, frame, result, rhythmFrame);
      butterflies.update(deltaSeconds, frame, sharedFrame, result);
    }
    assert.equal(machine.getSnapshot().state, 'IDLE');
  }

  assert.equal(countSceneObjects(scene), initialObjects);
  assert.equal(countDrawObjects(scene), initialDrawObjects);
  assert.equal(
    coreLights.particleCount
      + ambient.particleCount
      + orbits.particleCount
      + bridges.particleCount
      + hands.particleCount,
    initialParticles,
  );
  assert.equal(butterflies.positionsAreFinite(), true);

  staves.dispose();
  ambient.dispose();
  orbits.dispose();
  bridges.dispose();
  hands.dispose();
  butterflies.dispose();
  coreLights.dispose();
});

test('rhythm profiles drive staggered piano fingers without synchronized blocks', () => {
  const director = new RhythmDirector();
  const snapshot = new StateMachine({
    contactThresholdMs: CONTACT_THRESHOLD_MS,
    contactTransitionMs: CONTACT_TRANSITION_MS,
    resultPlaceholderMs: RESULT_PLACEHOLDER_MS,
    resetDurationMs: RESET_DURATION_MS,
  });
  snapshot.dispatch({ type: 'FORCE_RESULT', result: 'desire' });
  let frame = director.update(0, snapshot.getSnapshot());
  for (let index = 0; index < 20; index += 1) frame = director.update(1 / 60, snapshot.getSnapshot());
  assert.equal(frame.cue, 'desire');
  assert.ok(frame.fingerPressA[0] < RHYTHM_PROFILES.desire.fingerAmplitude * 0.25);
  assert.ok(new Set(Array.from(frame.fingerPressA, value => value.toFixed(5))).size > 2);
  assert.notDeepEqual(Array.from(frame.fingerPressA), Array.from(frame.fingerPressB));
});

function countSceneObjects(root: THREE.Object3D): number {
  let count = 0;
  root.traverse(() => {
    count += 1;
  });
  return count;
}

function countDrawObjects(root: THREE.Object3D): number {
  let count = 0;
  root.traverse((object) => {
    if (
      object instanceof THREE.Points
      || object instanceof THREE.LineSegments
      || object instanceof THREE.Mesh
    ) {
      count += 1;
    }
  });
  return count;
}
