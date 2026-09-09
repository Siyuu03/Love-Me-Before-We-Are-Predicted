import type {
  TouchInputListener,
  TouchInputSnapshot,
  TouchInputSource,
} from './TouchInputSource';

export class KeyboardTouchInputSource implements TouchInputSource {
  private readonly listeners = new Set<TouchInputListener>();
  private snapshot: TouchInputSnapshot = {
    rawA: false,
    rawB: false,
    source: 'keyboard',
    lastMessage: 'KEYBOARD READY',
  };
  private started = false;

  start(): void {
    if (this.started) return;
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.handleBlur);
    this.started = true;
  }

  getSnapshot(): TouchInputSnapshot { return this.snapshot; }

  subscribe(listener: TouchInputListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  dispose(): void {
    if (!this.started) return;
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('blur', this.handleBlur);
    this.listeners.clear();
    this.started = false;
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (event.code !== 'KeyA' && event.code !== 'KeyB') return;
    event.preventDefault();
    if (event.repeat) return;
    if (event.code === 'KeyA') this.setRaw(true, this.snapshot.rawB, 'A_TOUCH');
    else this.setRaw(this.snapshot.rawA, true, 'B_TOUCH');
  };

  private readonly handleKeyUp = (event: KeyboardEvent): void => {
    if (event.code !== 'KeyA' && event.code !== 'KeyB') return;
    event.preventDefault();
    if (event.code === 'KeyA') this.setRaw(false, this.snapshot.rawB, 'A_RELEASE');
    else this.setRaw(this.snapshot.rawA, false, 'B_RELEASE');
  };

  private readonly handleBlur = (): void => {
    if (!this.snapshot.rawA && !this.snapshot.rawB) return;
    this.setRaw(false, false, 'KEYBOARD RELEASE ON BLUR');
  };

  private setRaw(rawA: boolean, rawB: boolean, lastMessage: string): void {
    if (rawA === this.snapshot.rawA && rawB === this.snapshot.rawB) return;
    this.snapshot = { rawA, rawB, source: 'keyboard', lastMessage };
    this.listeners.forEach((listener) => listener(this.snapshot));
  }
}
