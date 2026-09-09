import { RESULT_LABELS, type InstallationState, type StateSnapshot } from '../core/types';
import type { TouchStabilizerSnapshot } from '../input/TouchStabilizer';
import type { CameraRuntimeDiagnostics } from '../ui/GazeLayout';
import type { SceneDiagnostics } from '../visual/SceneManager';
import type { ResultDiagnostics } from '../visual/results/ResultDirector';
import type { AudioDiagnostics } from '../audio/AudioController';
import type { SerialTouchDiagnostics } from '../input/SerialTouchInputSource';
import type { TouchInputSnapshot } from '../input/TouchInputSource';

export class DebugHud {
  private readonly element = document.createElement('aside');
  private readonly interaction = document.createElement('pre');
  private readonly system = document.createElement('pre');
  private readonly deep = document.createElement('pre');
  private visible: boolean;
  private deepVisible = false;

  constructor(container: HTMLElement, initiallyVisible: boolean) {
    this.visible = initiallyVisible;
    this.element.className = 'debug-hud';
    this.element.setAttribute('aria-live', 'polite');
    this.interaction.className = 'debug-hud-panel debug-hud-interaction';
    this.system.className = 'debug-hud-panel debug-hud-system';
    this.deep.className = 'debug-hud-panel debug-hud-deep';
    this.element.append(this.interaction, this.system, this.deep);
    container.append(this.element);
    this.syncVisibility();
  }

  toggle(): void {
    this.visible = !this.visible;
    if (!this.visible) this.deepVisible = false;
    this.syncVisibility();
  }

  toggleDeep(): void {
    this.visible = true;
    this.deepVisible = !this.deepVisible;
    this.syncVisibility();
  }

  update(
    snapshot: StateSnapshot,
    fps: number,
    averageFps: number,
    uptimeSeconds: number,
    diagnostics: SceneDiagnostics,
    resultDiagnostics: ResultDiagnostics,
    stateHistory: readonly InstallationState[],
    touch: TouchStabilizerSnapshot,
    cameras: CameraRuntimeDiagnostics,
    audio: AudioDiagnostics,
    input: TouchInputSnapshot,
    serial: SerialTouchDiagnostics,
  ): void {
    const result = resultDiagnostics.id ? RESULT_LABELS[resultDiagnostics.id].toUpperCase() : '—';
    const resultSource = resultDiagnostics.source ? ` / ${resultDiagnostics.source}` : '';
    this.interaction.textContent = [
      `STATE        ${snapshot.state}`,
      `RAW A/B      ${Number(touch.a.rawTouch)} / ${Number(touch.b.rawTouch)}`,
      `CONFIRMED    ${Number(touch.a.confirmedTouch)} / ${Number(touch.b.confirmedTouch)}`,
      `LATCHED      ${Number(touch.a.latched)} / ${Number(touch.b.latched)}`,
      `WAIT         ${(touch.latchRemainingMs / 1000).toFixed(1)}s`,
      `RESULT       ${result}${resultSource}`,
      `INPUT SOURCE ${input.source.toUpperCase()}`,
    ].join('\n');

    this.system.textContent = [
      `FPS          ${fps.toFixed(1)} / AVG ${averageFps.toFixed(1)}`,
      `CAM A        ${cameras.cameraA}`,
      `CAM B        ${cameras.cameraB}`,
      `SERIAL       ${serial.connection.toUpperCase()} / ${serial.baudRate}`,
      `LAST SERIAL  ${truncate(serial.lastMessage, 58)}`,
    ].join('\n');

    this.deep.textContent = [
      `DEEP DEVELOPMENT / SHIFT+D`,
      `UPTIME ${uptimeSeconds.toFixed(1)}s  PARTICLES ${diagnostics.particleCount}  OBJECTS ${diagnostics.sceneObjects}`,
      `GPU calls ${diagnostics.gpuCalls}  geo ${diagnostics.geometries}  tex ${diagnostics.textures}  prog ${diagnostics.programs}`,
      `AMBIENT ${diagnostics.ambientParticles}  ORBITS ${diagnostics.orbitParticles}  BRIDGES ${diagnostics.bridgeParticles}`,
      `BUTTERFLIES ${diagnostics.butterflyInstances}  FILAMENTS ${diagnostics.filamentSegments}`,
      `CONTACT ${Math.round(snapshot.contactElapsedMs)}ms  RESULT ${Math.round(resultDiagnostics.elapsedMs)}ms`,
      `HISTORY ${stateHistory.join(' > ')}`,
      `CAMERAS inputs ${cameras.enumeratedVideoInputs} / permission ${cameras.permission}`,
      `AUDIO cue ${audio.cue} / ${audio.file} / ${audio.state}`,
      `SERIAL ${serial.errorName ?? 'OK'} / ${serial.errorMessage ?? 'NO ERROR'}`,
      `RAW SOURCE ${input.source} / A=${Number(input.rawA)} B=${Number(input.rawB)}`,
    ].join('\n');
  }

  dispose(): void { this.element.remove(); }

  private syncVisibility(): void {
    this.element.hidden = !this.visible;
    this.deep.hidden = !this.deepVisible;
  }
}

function truncate(value: string, maximum: number): string {
  return value.length <= maximum ? value : `${value.slice(0, maximum - 1)}…`;
}
