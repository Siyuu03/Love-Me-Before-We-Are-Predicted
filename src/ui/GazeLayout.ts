import type { StateSnapshot } from '../core/types';
import { DualCameraManager } from '../vision/DualCameraManager';
import type { ResultDiagnostics } from '../visual/results/ResultDirector';
import type { ResultLayer } from '../visual/results/ResultLayer';
import { JudgementOverlay } from './JudgementOverlay';
import { ObservationLayer } from './ObservationLayer';
import { CameraSetupPanel } from './CameraSetupPanel';
import type { SerialTouchInputSource } from '../input/SerialTouchInputSource';
import {
  DualTeachableMachineInference,
  type FrozenAppearancePair,
  type MLDebugSnapshot,
} from '../vision/TeachableMachineInference';

export interface CameraRuntimeDiagnostics {
  readonly enumeratedVideoInputs: number;
  readonly permission: string;
  readonly cameraA: string;
  readonly cameraB: string;
  readonly healthyCount: number;
}

export class GazeLayout {
  private readonly observation: ObservationLayer;
  private readonly judgement: JudgementOverlay;
  private readonly cameras: DualCameraManager;
  private readonly cameraSetup: CameraSetupPanel;
  private readonly appearanceInference: DualTeachableMachineInference;

  constructor(container: HTMLElement, serial: SerialTouchInputSource) {
    this.observation = new ObservationLayer(container);
    this.judgement = new JudgementOverlay(container);
    const videos = [
      this.observation.frameA.video,
      this.observation.frameB.video,
    ] as const;
    this.cameras = new DualCameraManager(videos);
    this.appearanceInference = new DualTeachableMachineInference(videos);
    this.cameraSetup = new CameraSetupPanel(container, this.cameras, serial);
  }

  start(): void {
    void this.cameras.start();
    void this.appearanceInference.start();
  }

  freezeAppearanceInference(): FrozenAppearancePair {
    return this.appearanceInference.freeze();
  }

  resetAppearanceInference(): void {
    this.appearanceInference.reset();
  }

  getMLDebugSnapshot(): MLDebugSnapshot {
    return this.appearanceInference.getDebugSnapshot();
  }

  toggleCameraSetup(): void { this.cameraSetup.toggle(); }

  setHandReadabilityCheck(active: boolean): void {
    this.observation.element.hidden = active;
    this.judgement.element.hidden = active;
    this.cameraSetup.setHiddenForHandCheck(active);
  }

  update(snapshot: StateSnapshot, diagnostics: ResultDiagnostics, result: ResultLayer): void {
    this.observation.update(snapshot, this.cameras.getSignals(), result);
    this.judgement.update(snapshot, diagnostics, result);
  }

  getCameraDiagnostics(): CameraRuntimeDiagnostics {
    const setup = this.cameras.getSetupSnapshot();
    const signals = this.cameras.getSignals();
    const format = (channel: 'A' | 'B', connection: string): string => {
      const health = this.cameras.getHealth(channel);
      if (connection !== 'online') return `${connection.toUpperCase()} / ${health.actualState.toUpperCase()}`;
      return `ONLINE / ${health.width || 640}×${health.height || 480} / ${Math.round(health.frameRate || 15)}fps`;
    };
    return {
      enumeratedVideoInputs: setup.enumeratedVideoInputs,
      permission: setup.permission,
      cameraA: format('A', signals[0].connection),
      cameraB: format('B', signals[1].connection),
      healthyCount: signals.filter((signal) => signal.connection === 'online').length,
    };
  }

  dispose(): void {
    this.appearanceInference.dispose();
    this.cameras.dispose();
    this.cameraSetup.dispose();
    this.observation.dispose();
    this.judgement.dispose();
  }
}
