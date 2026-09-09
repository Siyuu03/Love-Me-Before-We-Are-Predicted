import { RESULT_LABELS } from '../core/types';
import type {
  MLDebugSnapshot,
  SmoothedAppearance,
} from '../vision/TeachableMachineInference';

declare global {
  interface Window {
    readonly ML_DEBUG?: MLDebugSnapshot;
  }
}

export class MLDebugOverlay {
  private readonly element = document.createElement('pre');
  private readonly previousGlobalDescriptor = Object.getOwnPropertyDescriptor(window, 'ML_DEBUG');
  private visible: boolean;
  private snapshot: MLDebugSnapshot;

  constructor(
    container: HTMLElement,
    private readonly readSnapshot: () => MLDebugSnapshot,
  ) {
    this.visible = new URLSearchParams(window.location.search).get('debug') === '1';
    this.snapshot = this.readSnapshot();
    this.element.className = 'ml-debug-overlay';
    this.element.setAttribute('aria-label', 'Machine learning debug values');
    container.append(this.element);
    Object.defineProperty(window, 'ML_DEBUG', {
      configurable: true,
      enumerable: true,
      get: () => this.snapshot,
    });
    this.syncVisibility();
    this.render();
  }

  toggle(): void {
    this.visible = !this.visible;
    this.syncVisibility();
    if (this.visible) this.render();
  }

  update(): void {
    this.snapshot = this.readSnapshot();
    if (this.visible) this.render();
  }

  dispose(): void {
    this.element.remove();
    if (this.previousGlobalDescriptor) {
      Object.defineProperty(window, 'ML_DEBUG', this.previousGlobalDescriptor);
    } else {
      Reflect.deleteProperty(window, 'ML_DEBUG');
    }
  }

  private render(): void {
    const { camA, camB, pair, status } = this.snapshot;
    this.element.dataset.status = status;
    this.element.textContent = [
      `ML / ${status}`,
      '',
      ...formatCamera('CAM A', camA),
      '',
      ...formatCamera('CAM B', camB),
      '',
      `PAIR`,
      `D             ${formatNumber(pair.d)}`,
      `CANDIDATE     ${RESULT_LABELS[pair.candidateResult]}`,
      `STATUS        ${status}`,
    ].join('\n');
  }

  private syncVisibility(): void {
    this.element.hidden = !this.visible;
  }
}

function formatCamera(label: string, camera: SmoothedAppearance): readonly string[] {
  return [
    label,
    `avg feminine  ${formatNumber(camera.avgFeminine)}`,
    `avg masculine ${formatNumber(camera.avgMasculine)}`,
    `s             ${formatSigned(camera.s)}`,
    `q             ${formatNumber(camera.q)}`,
    `samples       ${camera.sampleCount} / 10`,
  ];
}

function formatNumber(value: number): string {
  return Number.isFinite(value) ? value.toFixed(3) : '—';
}

function formatSigned(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return `${value >= 0 ? '+' : ''}${value.toFixed(3)}`;
}
