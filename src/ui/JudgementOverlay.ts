import { APP_CONFIG } from '../config';
import type { StateSnapshot } from '../core/types';
import type { ResultDiagnostics } from '../visual/results/ResultDirector';
import type { ResultLayer } from '../visual/results/ResultLayer';
import { RESULT_TYPOGRAPHY, resultStatus } from './ResultTypography';

export class JudgementOverlay {
  readonly element = document.createElement('section');
  private readonly index = document.createElement('span');
  private readonly prelude = document.createElement('p');
  private readonly title = document.createElement('h1');
  private readonly status = document.createElement('p');
  private lastTitle = '';

  constructor(container: HTMLElement) {
    this.element.className = 'judgement-overlay';
    this.element.setAttribute('aria-live', 'polite');
    this.index.className = 'judgement-index';
    this.prelude.className = 'judgement-prelude';
    this.prelude.append(
      'THE MODEL SCORES THIS RELATION AS',
      Object.assign(document.createElement('span'), {
        className: 'judgement-translation',
        textContent: '该模型将这种关系评为：',
      }),
    );
    this.title.className = 'judgement-title';
    this.title.dataset.echo = '';
    this.status.className = 'judgement-status';
    this.element.append(this.index, this.prelude, this.title, this.status);
    container.append(this.element);
  }

  update(snapshot: StateSnapshot, diagnostics: ResultDiagnostics, layer: ResultLayer): void {
    const id = diagnostics.id;
    const relevant = Boolean(id) && (snapshot.state === 'RESULT' || snapshot.state === 'RESET');
    this.element.classList.toggle('is-active', relevant);
    this.element.classList.toggle('is-resetting', snapshot.state === 'RESET');
    if (!id) return;
    const typography = RESULT_TYPOGRAPHY[id];
    if (this.lastTitle !== typography.title) {
      this.lastTitle = typography.title;
      this.title.textContent = typography.title;
      this.title.dataset.echo = typography.title;
    }
    this.element.dataset.result = id;
    this.element.style.setProperty('--gaze-compression', layer.gazeCompression.toFixed(3));
    this.element.style.setProperty('--gaze-sync', layer.gazeSync.toFixed(3));
    this.element.style.setProperty('--gaze-gap', layer.gazeGap.toFixed(3));
    this.element.style.setProperty('--gaze-lag', layer.gazeLag.toFixed(3));
    this.element.style.setProperty('--gaze-uncertainty', layer.gazeUncertainty.toFixed(3));
    this.element.style.setProperty('--title-scale', (1 - layer.gazeCompression * 0.045).toFixed(3));
    this.element.style.setProperty('--title-echo-x', `${2 + layer.gazeLag * 3}px`);
    this.index.textContent = `RESULT / ${typography.index}`;
    this.status.textContent = `OBSERVATION STATUS / ${resultStatus(diagnostics.source, id)}`;
    const elapsed = diagnostics.elapsedMs;
    this.element.classList.toggle('has-prelude', elapsed >= APP_CONFIG.gaze.scorePreludeDelayMs);
    this.element.classList.toggle('has-title', elapsed >= APP_CONFIG.gaze.resultNameDelayMs);
  }

  dispose(): void { this.element.remove(); }
}
