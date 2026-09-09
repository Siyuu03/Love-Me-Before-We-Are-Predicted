import { APP_CONFIG } from '../config';
import { DebugHud } from '../debug/DebugHud';
import type { InputAdapter, InputEvent } from '../input/InputAdapter';
import { KeyboardInputAdapter } from '../input/KeyboardInputAdapter';
import { PreviewInputAdapter } from '../input/PreviewInputAdapter';
import { TouchStabilizer } from '../input/TouchStabilizer';
import { SceneManager } from '../visual/SceneManager';
import { StateHistory } from './StateHistory';
import { StateMachine } from './StateMachine';
import type { ContactInputSnapshot, InstallationState } from './types';
import { RESULT_CONFIG } from '../visual/results/ResultConfig';
import { ResultResolver } from '../visual/results/ResultResolver';
import { GazeLayout } from '../ui/GazeLayout';
import { AudioController } from '../audio/AudioController';
import { RhythmDirector } from '../audio/RhythmDirector';
import type { ResultId } from './types';
import { KeyboardTouchInputSource } from '../input/KeyboardTouchInputSource';
import { SerialTouchInputSource } from '../input/SerialTouchInputSource';
import type { TouchInputSnapshot, TouchInputSource } from '../input/TouchInputSource';
import type { FrozenAppearancePair } from '../vision/TeachableMachineInference';
import { MLDebugOverlay } from '../debug/MLDebugOverlay';

export class App {
  private readonly audio = new AudioController((result) => this.handleAudioEnded(result));
  private readonly rhythm = new RhythmDirector();
  private readonly resultResolver = new ResultResolver();
  private readonly stateMachine = new StateMachine({
    contactThresholdMs: APP_CONFIG.contactThresholdMs,
    contactTransitionMs: APP_CONFIG.contactTransitionMs,
    resultDurationsMs: RESULT_CONFIG.durationsMs,
    resetDurationMs: APP_CONFIG.resetDurationMs,
    resolveResult: (contact) => this.resultResolver.resolve({
      contact,
      appearancePair: this.freezeAppearanceForContact(contact) ?? undefined,
    }),
  });
  private readonly stateHistory = new StateHistory();
  private readonly touchStabilizer = new TouchStabilizer(APP_CONFIG.touchStabilizer);
  private readonly keyboardTouch = new KeyboardTouchInputSource();
  private readonly serialTouch = new SerialTouchInputSource(APP_CONFIG.serial.baudRate);
  private readonly touchSources: readonly TouchInputSource[] = [this.keyboardTouch, this.serialTouch];
  private readonly inputs: readonly InputAdapter[] = [
    new KeyboardInputAdapter(false),
    ...(import.meta.env.DEV ? [new PreviewInputAdapter(window.location.search)] : []),
  ];
  private readonly scene: SceneManager;
  private readonly hud: DebugHud;
  private readonly gaze: GazeLayout;
  private readonly mlDebug: MLDebugOverlay;
  private unsubscribeInputs: (() => void)[] = [];
  private unsubscribeTouchSources: (() => void)[] = [];
  private readonly rawBySource = {
    keyboard: this.keyboardTouch.getSnapshot(),
    serial: this.serialTouch.getSnapshot(),
  };
  private touchInput: TouchInputSnapshot = this.keyboardTouch.getSnapshot();
  private animationFrameId = 0;
  private lastFrameTimeMs = 0;
  private fps = 0;
  private fpsFrames = 0;
  private fpsElapsedSeconds = 0;
  private totalFrames = 0;
  private totalElapsedSeconds = 0;
  private previousState: InstallationState = 'IDLE';
  private frozenAppearance: FrozenAppearancePair | null = null;
  private frozenContactSequenceId: number | null = null;
  private handReadabilityCheck = false;

  constructor(private readonly container: HTMLElement) {
    this.scene = new SceneManager(
      container,
      APP_CONFIG.displayRotationDeg,
      APP_CONFIG.logicalAspectRatio,
    );
    this.hud = new DebugHud(container, APP_CONFIG.debug);
    this.gaze = new GazeLayout(container, this.serialTouch);
    this.mlDebug = new MLDebugOverlay(container, () => this.gaze.getMLDebugSnapshot());
  }

  start(): void {
    this.unsubscribeInputs = this.inputs.map((input) => input.subscribe(this.handleInput));
    this.unsubscribeTouchSources = this.touchSources.map((source) => source.subscribe(this.handleTouchInput));
    this.inputs.forEach((input) => input.start());
    this.touchSources.forEach((source) => { void source.start(); });
    this.gaze.start();
    this.audio.start();
    window.addEventListener('resize', this.handleResize);
    this.animationFrameId = requestAnimationFrame(this.tick);
  }

  dispose(): void {
    cancelAnimationFrame(this.animationFrameId);
    window.removeEventListener('resize', this.handleResize);
    this.unsubscribeInputs.forEach((unsubscribe) => unsubscribe());
    this.unsubscribeTouchSources.forEach((unsubscribe) => unsubscribe());
    this.inputs.forEach((input) => input.dispose());
    this.touchSources.forEach((source) => source.dispose());
    this.scene.dispose();
    this.audio.dispose();
    this.hud.dispose();
    this.mlDebug.dispose();
    this.gaze.dispose();
    this.container.replaceChildren();
  }

  private readonly handleInput = (event: InputEvent): void => {
    if (event.type === 'TOGGLE_DEBUG') {
      this.hud.toggle();
      this.mlDebug.toggle();
      return;
    }

    if (event.type === 'TOGGLE_DEEP_DEBUG') {
      this.hud.toggleDeep();
      return;
    }

    if (event.type === 'TOGGLE_HAND_CHECK') {
      this.handReadabilityCheck = !this.handReadabilityCheck;
      this.scene.setHandReadabilityCheck(this.handReadabilityCheck);
      this.gaze.setHandReadabilityCheck(this.handReadabilityCheck);
      return;
    }

    if (event.type === 'TOGGLE_CAMERA_SETUP') {
      this.gaze.toggleCameraSetup();
      return;
    }

    if (event.type === 'RESET') {
      this.touchStabilizer.reset();
      this.stateMachine.dispatch(event);
      this.stateHistory.record(this.stateMachine.getSnapshot().state);
      return;
    }

    if (
      event.type === 'FORCE_IDLE'
      || event.type === 'FORCE_SOLO'
      || event.type === 'FORCE_RESULT'
    ) {
      this.touchStabilizer.reset();
      if (event.type === 'FORCE_IDLE') this.resetAppearanceInference();
    }

    if (
      event.type === 'A_TOUCH'
      || event.type === 'A_RELEASE'
      || event.type === 'B_TOUCH'
      || event.type === 'B_RELEASE'
    ) {
      this.touchStabilizer.handleRawEvent(event);
      return;
    }

    this.stateMachine.dispatch(event);
    this.stateHistory.record(this.stateMachine.getSnapshot().state);
  };

  private readonly handleTouchInput = (next: TouchInputSnapshot): void => {
    this.rawBySource[next.source] = next;
    const rawA = this.rawBySource.keyboard.rawA || this.rawBySource.serial.rawA;
    const rawB = this.rawBySource.keyboard.rawB || this.rawBySource.serial.rawB;
    const previousA = this.touchInput.rawA;
    const previousB = this.touchInput.rawB;
    const source = this.rawBySource.keyboard.rawA || this.rawBySource.keyboard.rawB
      ? 'keyboard'
      : this.serialTouch.getDiagnostics().connection === 'online'
        ? 'serial'
        : 'keyboard';
    this.touchInput = { rawA, rawB, source, lastMessage: next.lastMessage };
    if (rawA !== previousA) {
      this.touchStabilizer.handleRawEvent({ type: rawA ? 'A_TOUCH' : 'A_RELEASE' });
    }
    if (rawB !== previousB) {
      this.touchStabilizer.handleRawEvent({ type: rawB ? 'B_TOUCH' : 'B_RELEASE' });
    }
  };

  private readonly handleResize = (): void => {
    this.scene.resize();
  };

  private readonly tick = (timestampMs: number): void => {
    const deltaSeconds =
      this.lastFrameTimeMs === 0 ? 0 : (timestampMs - this.lastFrameTimeMs) / 1000;
    const safeDeltaSeconds = Math.max(deltaSeconds, 0);
    const visualDeltaSeconds = Math.min(safeDeltaSeconds, 0.1);
    this.lastFrameTimeMs = timestampMs;

    const deltaMs = safeDeltaSeconds * 1000;
    this.touchStabilizer.update(deltaMs).forEach((event) => {
      if (event.type === 'RESET') this.touchStabilizer.reset();
      this.stateMachine.dispatch(event);
    });
    this.stateMachine.update(deltaMs);
    const snapshot = this.stateMachine.getSnapshot();
    if (snapshot.state === 'CONTACT' && snapshot.contactSnapshot) {
      this.freezeAppearanceForContact(snapshot.contactSnapshot);
    }
    if (snapshot.state === 'RESET' && this.previousState !== 'RESET') {
      this.touchStabilizer.reset();
    }
    if (snapshot.state === 'IDLE' && this.previousState === 'RESET') {
      this.resetAppearanceInference();
    }
    this.previousState = snapshot.state;
    this.stateHistory.record(snapshot.state);
    const rhythm = this.rhythm.update(visualDeltaSeconds, snapshot);
    this.audio.sync(snapshot);
    this.audio.update(visualDeltaSeconds);
    this.scene.update(visualDeltaSeconds, snapshot, rhythm);
    this.scene.render();
    this.gaze.update(
      snapshot,
      this.scene.getResultDiagnostics(),
      this.scene.getResultLayer(),
    );
    this.mlDebug.update();
    this.updateFps(safeDeltaSeconds);
    this.hud.update(
      snapshot,
      this.fps,
      this.getAverageFps(),
      this.totalElapsedSeconds,
      this.scene.getDiagnostics(),
      this.scene.getResultDiagnostics(),
      this.stateHistory.getEntries(),
      this.touchStabilizer.getSnapshot(),
      this.gaze.getCameraDiagnostics(),
      this.audio.getDiagnostics(),
      this.touchInput,
      this.serialTouch.getDiagnostics(),
    );

    this.animationFrameId = requestAnimationFrame(this.tick);
  };

  private handleAudioEnded(result: ResultId): void {
    const snapshot = this.stateMachine.getSnapshot();
    if (snapshot.state !== 'RESULT' || snapshot.currentResult !== result) return;
    this.touchStabilizer.reset();
    this.stateMachine.dispatch({ type: 'RESET' });
  }

  private freezeAppearanceForContact(
    contact: ContactInputSnapshot | null,
  ): FrozenAppearancePair | null {
    if (!contact) return this.frozenAppearance;
    if (this.frozenContactSequenceId !== contact.sequenceId) {
      this.frozenAppearance = this.gaze.freezeAppearanceInference();
      this.frozenContactSequenceId = contact.sequenceId;
    }
    return this.frozenAppearance;
  }

  private resetAppearanceInference(): void {
    this.gaze.resetAppearanceInference();
    this.frozenAppearance = null;
    this.frozenContactSequenceId = null;
  }

  private updateFps(deltaSeconds: number): void {
    if (deltaSeconds > 0) {
      this.totalFrames += 1;
      this.totalElapsedSeconds += deltaSeconds;
    }
    this.fpsFrames += 1;
    this.fpsElapsedSeconds += deltaSeconds;

    if (this.fpsElapsedSeconds >= 0.25) {
      this.fps = this.fpsFrames / this.fpsElapsedSeconds;
      this.fpsFrames = 0;
      this.fpsElapsedSeconds = 0;
    }
  }

  private getAverageFps(): number {
    return this.totalElapsedSeconds > 0 ? this.totalFrames / this.totalElapsedSeconds : 0;
  }
}
