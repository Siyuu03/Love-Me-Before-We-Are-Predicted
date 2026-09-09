import type { InputAdapter, InputEvent, InputListener } from './InputAdapter';

/** Development-only adapter for deterministic visual QA of held-touch states. */
export class PreviewInputAdapter implements InputAdapter {
  private readonly listeners = new Set<InputListener>();
  private readonly timers: number[] = [];

  constructor(private readonly search: string) {}

  start(): void {
    const preview = new URLSearchParams(this.search).get('preview');
    const resultPreview = preview?.match(/^RESULT_([1-6])$/)?.[1];
    if (resultPreview) {
      const results = ['collision', 'soft-merge', 'desire', 'misreading', 'refusal', 'unreadable'] as const;
      this.emit({ type: 'FORCE_RESULT', result: results[Number(resultPreview) - 1] });
      return;
    }
    if (preview === 'RESULT_STRESS') {
      const results = ['collision', 'soft-merge', 'desire', 'misreading', 'refusal', 'unreadable'] as const;
      for (let index = 0; index < 36; index += 1) {
        this.schedule({ type: 'FORCE_RESULT', result: results[index % results.length] }, index * 520);
      }
      return;
    }
    if (preview === 'SOLO_A') {
      this.emit({ type: 'A_TOUCH' });
    } else if (preview === 'SOLO_B') {
      this.emit({ type: 'B_TOUCH' });
    } else if (preview === 'CONTACT') {
      this.emit({ type: 'A_TOUCH' });
      this.emit({ type: 'B_TOUCH' });
    } else if (preview === 'CONTACT_A_FIRST') {
      this.emit({ type: 'A_TOUCH' });
      this.schedule({ type: 'B_TOUCH' }, 900);
    } else if (preview === 'JOIN_CANCEL_A') {
      this.emit({ type: 'A_TOUCH' });
      this.schedule({ type: 'B_TOUCH' }, 700);
      this.schedule({ type: 'B_RELEASE' }, 1120);
    } else if (preview === 'NOISE_A') {
      this.emit({ type: 'A_TOUCH' });
      this.schedule({ type: 'A_RELEASE' }, 40);
    } else if (preview === 'LATCH_WAIT_B') {
      this.emit({ type: 'A_TOUCH' });
      this.schedule({ type: 'A_RELEASE' }, 500);
      this.schedule({ type: 'B_TOUCH' }, 2500);
    } else if (preview === 'SINGLE_A_RELEASE') {
      this.emit({ type: 'A_TOUCH' });
      this.schedule({ type: 'A_RELEASE' }, 500);
    }
  }

  subscribe(listener: InputListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  dispose(): void {
    this.timers.forEach((timer) => window.clearTimeout(timer));
    this.timers.length = 0;
    this.listeners.clear();
  }

  private schedule(event: InputEvent, delayMs: number): void {
    this.timers.push(window.setTimeout(() => this.emit(event), delayMs));
  }

  private emit(event: InputEvent): void {
    this.listeners.forEach((listener) => listener(event));
  }
}
