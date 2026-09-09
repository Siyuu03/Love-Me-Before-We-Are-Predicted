import type { ResultId } from '../core/types';
import type { InputAdapter, InputEvent, InputListener } from './InputAdapter';

const RESULT_KEYS: Readonly<Record<string, ResultId>> = {
  Digit1: 'collision',
  Digit2: 'soft-merge',
  Digit3: 'desire',
  Digit4: 'misreading',
  Digit5: 'refusal',
  Digit6: 'unreadable',
  Numpad1: 'collision',
  Numpad2: 'soft-merge',
  Numpad3: 'desire',
  Numpad4: 'misreading',
  Numpad5: 'refusal',
  Numpad6: 'unreadable',
};

const HANDLED_CODES = new Set([
  'KeyA',
  'KeyB',
  'KeyD',
  'KeyH',
  'KeyC',
  'KeyR',
  'Digit0',
  'Numpad0',
  ...Object.keys(RESULT_KEYS),
]);

export class KeyboardInputAdapter implements InputAdapter {
  private readonly listeners = new Set<InputListener>();
  private readonly pressedCodes = new Set<string>();
  private started = false;

  constructor(private readonly emitTouchEvents = true) {}

  start(): void {
    if (this.started) return;

    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.handleWindowBlur);
    this.started = true;
  }

  subscribe(listener: InputListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  dispose(): void {
    if (!this.started) return;

    this.releaseHeldTouches();
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('blur', this.handleWindowBlur);
    this.listeners.clear();
    this.started = false;
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (!HANDLED_CODES.has(event.code)) return;

    event.preventDefault();
    if (event.repeat || this.pressedCodes.has(event.code)) return;

    this.pressedCodes.add(event.code);

    if (event.code === 'KeyA') {
      if (this.emitTouchEvents) this.emit({ type: 'A_TOUCH' });
      return;
    }

    if (event.code === 'KeyB') {
      if (this.emitTouchEvents) this.emit({ type: 'B_TOUCH' });
      return;
    }

    if (event.code === 'KeyR') {
      this.emit({ type: 'RESET' });
      return;
    }

    if (event.code === 'KeyD') {
      this.emit({ type: event.shiftKey ? 'TOGGLE_DEEP_DEBUG' : 'TOGGLE_DEBUG' });
      return;
    }

    if (event.code === 'KeyH') {
      this.emit({ type: 'TOGGLE_HAND_CHECK' });
      return;
    }

    if (event.code === 'KeyC') {
      this.emit({ type: 'TOGGLE_CAMERA_SETUP' });
      return;
    }

    if (event.code === 'Digit0' || event.code === 'Numpad0') {
      this.emit({ type: 'FORCE_IDLE' });
      return;
    }

    const result = RESULT_KEYS[event.code];
    if (result !== undefined) {
      this.emit({ type: 'FORCE_RESULT', result });
    }
  };

  private readonly handleKeyUp = (event: KeyboardEvent): void => {
    if (!HANDLED_CODES.has(event.code)) return;

    event.preventDefault();
    const wasPressed = this.pressedCodes.delete(event.code);
    if (!wasPressed) return;

    if (event.code === 'KeyA') {
      if (this.emitTouchEvents) this.emit({ type: 'A_RELEASE' });
    } else if (event.code === 'KeyB') {
      if (this.emitTouchEvents) this.emit({ type: 'B_RELEASE' });
    }
  };

  private readonly handleWindowBlur = (): void => {
    this.releaseHeldTouches();
  };

  private releaseHeldTouches(): void {
    if (this.pressedCodes.delete('KeyA')) {
      if (this.emitTouchEvents) this.emit({ type: 'A_RELEASE' });
    }
    if (this.pressedCodes.delete('KeyB')) {
      if (this.emitTouchEvents) this.emit({ type: 'B_RELEASE' });
    }
    this.pressedCodes.clear();
  }

  private emit(event: InputEvent): void {
    this.listeners.forEach((listener) => listener(event));
  }
}
