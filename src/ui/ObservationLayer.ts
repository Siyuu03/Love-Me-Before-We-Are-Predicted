import type { StateSnapshot } from '../core/types';
import type { CameraSignal } from '../vision/CameraSignal';
import type { ResultLayer } from '../visual/results/ResultLayer';
import { ObservationFrame } from './ObservationFrame';

export class ObservationLayer {
  readonly element = document.createElement('div');
  readonly frameA = new ObservationFrame('A');
  readonly frameB = new ObservationFrame('B');
  private readonly relationStatus = document.createElement('p');
  private readonly filaments = document.createElement('div');

  constructor(container: HTMLElement) {
    this.element.className = 'observation-layer';
    this.element.setAttribute('aria-label', 'Machine observation layer');
    this.filaments.className = 'gaze-filaments';
    for (let index = 0; index < 18; index += 1) {
      const filament = document.createElement('i');
      filament.className = `gaze-filament gaze-filament--${index % 2 === 0 ? 'a' : 'b'}`;
      filament.style.setProperty('--fiber-y', `${9 + ((index * 17) % 78)}%`);
      filament.style.setProperty('--fiber-length', `${10 + ((index * 13) % 18)}vw`);
      filament.style.setProperty('--fiber-tilt', `${-7 + ((index * 11) % 15)}deg`);
      filament.style.setProperty('--fiber-delay', `${-(index * 0.73).toFixed(2)}s`);
      this.filaments.append(filament);
    }
    this.relationStatus.className = 'relation-observation-status';
    this.element.append(this.filaments, this.frameA.element, this.frameB.element, this.relationStatus);
    container.append(this.element);
  }

  update(
    snapshot: StateSnapshot,
    signals: readonly [CameraSignal, CameraSignal],
    result: ResultLayer,
  ): void {
    this.frameA.update(snapshot, signals[0]);
    this.frameB.update(snapshot, signals[1]);
    this.element.dataset.state = snapshot.state;
    this.element.dataset.result = result.resultId ?? '';
    this.element.style.setProperty('--gaze-compression', result.gazeCompression.toFixed(3));
    this.element.style.setProperty('--gaze-sync', result.gazeSync.toFixed(3));
    this.element.style.setProperty('--gaze-gap', result.gazeGap.toFixed(3));
    this.element.style.setProperty('--gaze-lag', result.gazeLag.toFixed(3));
    this.element.style.setProperty('--gaze-uncertainty', result.gazeUncertainty.toFixed(3));
    const inward = result.gazeCompression * 26;
    const outward = result.gazeGap * 34;
    this.element.style.setProperty('--frame-a-shift', `${inward - outward}px`);
    this.element.style.setProperty('--frame-b-shift', `${outward - inward}px`);
    this.element.style.setProperty('--tracking-lag', `${260 + result.gazeLag * 320}ms`);
    this.element.style.setProperty('--frame-uncertainty', (1 - result.gazeUncertainty * 0.14).toFixed(3));
    this.element.style.setProperty('--scan-phase-b', `${-3.2 + result.gazeSync * 3.2}s`);
    this.relationStatus.textContent = relationStatus(snapshot);
  }

  dispose(): void {
    this.frameA.dispose();
    this.frameB.dispose();
    this.element.remove();
  }
}

function relationStatus(snapshot: StateSnapshot): string {
  if (snapshot.state === 'JOIN') return 'RELATION MODEL / AWAITING CONTACT\n关系模型 / 等待接触';
  if (snapshot.state === 'CONTACT') return 'RELATION MODEL / OBSERVING CONTACT\n关系模型 / 正在观察接触';
  if (snapshot.state === 'RESULT') return 'RELATION MODEL / SCORING\n关系模型 / 正在形成判词';
  if (snapshot.state === 'SOLO_A' || snapshot.state === 'SOLO_B') {
    return 'RELATION MODEL / WAITING FOR A SECOND SUBJECT\n关系模型 / 等待第二位主体';
  }
  if (snapshot.state === 'RESET') return 'RELATION MODEL / RELEASING\n关系模型 / 解除本次观察';
  return 'RELATION MODEL / WAITING\n关系模型 / 等待主体';
}
