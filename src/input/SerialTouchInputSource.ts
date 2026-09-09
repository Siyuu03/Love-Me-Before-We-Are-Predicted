import { parseSerialTouchLine } from './SerialProtocol';
import type {
  TouchInputListener,
  TouchInputSnapshot,
  TouchInputSource,
} from './TouchInputSource';
import type { NavigatorWithSerial, WebSerialPort } from './WebSerialTypes';

export type SerialConnectionState =
  | 'unsupported'
  | 'offline'
  | 'connecting'
  | 'online'
  | 'disconnecting'
  | 'error';

export interface SerialTouchDiagnostics extends TouchInputSnapshot {
  readonly connection: SerialConnectionState;
  readonly baudRate: number;
  readonly errorName: string | null;
  readonly errorMessage: string | null;
  readonly recognized: boolean;
}

const INITIAL_TOUCH: TouchInputSnapshot = Object.freeze({
  rawA: false,
  rawB: false,
  source: 'serial',
  lastMessage: 'NO SERIAL DATA',
});

/** One Web Serial owner: request, open, read and close are serialized here. */
export class SerialTouchInputSource implements TouchInputSource {
  private readonly listeners = new Set<TouchInputListener>();
  private snapshot: TouchInputSnapshot = INITIAL_TOUCH;
  private connection: SerialConnectionState = 'offline';
  private errorName: string | null = null;
  private errorMessage: string | null = null;
  private recognized = false;
  private port: WebSerialPort | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private readGeneration = 0;
  private operationQueue: Promise<unknown> = Promise.resolve();
  private requestInProgress = false;
  private started = false;

  constructor(private readonly baudRate = 115200) {}

  start(): void {
    if (this.started) return;
    this.started = true;
    const serial = this.serial;
    if (!serial) {
      this.connection = 'unsupported';
      this.errorName = 'NotSupportedError';
      this.errorMessage = 'Web Serial is unavailable; keyboard A/B remains active';
      this.emit();
      return;
    }
    serial.addEventListener('disconnect', this.handlePhysicalDisconnect);
    void this.enqueue(async () => {
      const authorized = await serial.getPorts();
      if (authorized.length === 0) {
        this.connection = 'offline';
        this.emit();
        return;
      }
      await this.openPort(authorized[0]);
    });
  }

  getSnapshot(): TouchInputSnapshot { return this.snapshot; }

  getDiagnostics(): SerialTouchDiagnostics {
    return {
      ...this.snapshot,
      connection: this.connection,
      baudRate: this.baudRate,
      errorName: this.errorName,
      errorMessage: this.errorMessage,
      recognized: this.recognized,
    };
  }

  subscribe(listener: TouchInputListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Must be called directly from the CONNECT TOUCH BOARD click handler. */
  async connect(): Promise<void> {
    const serial = this.serial;
    if (!serial) {
      this.setFailure(new DOMException('Web Serial unavailable', 'NotSupportedError'));
      return;
    }
    if (this.requestInProgress) return;
    this.requestInProgress = true;
    this.connection = 'connecting'; this.clearFailure(); this.emit();
    try {
      const selectedPort = await serial.requestPort();
      await this.enqueue(() => this.openPort(selectedPort));
    } catch (error) {
      if (isUserCancellation(error)) {
        this.connection = 'offline';
        this.errorName = null; this.errorMessage = null; this.emit();
      } else {
        this.setFailure(error);
      }
    } finally {
      this.requestInProgress = false;
    }
  }

  reconnect(): Promise<void> {
    return this.enqueue(async () => {
      const serial = this.serial;
      if (!serial) {
        this.setFailure(new DOMException('Web Serial unavailable', 'NotSupportedError'));
        return;
      }
      const authorized = await serial.getPorts();
      const target = this.port ?? authorized[0];
      if (!target) {
        this.connection = 'offline';
        this.errorName = 'NotFoundError';
        this.errorMessage = 'no authorized touch board; use CONNECT TOUCH BOARD';
        this.emit();
        return;
      }
      await this.openPort(target);
    });
  }

  disconnect(): Promise<void> {
    return this.enqueue(async () => {
      this.connection = 'disconnecting'; this.emit();
      await this.closePort();
      this.connection = 'offline'; this.clearFailure();
      this.setRaw(false, false, 'SERIAL DISCONNECTED', false);
    });
  }

  dispose(): void {
    this.started = false;
    this.serial?.removeEventListener('disconnect', this.handlePhysicalDisconnect);
    void this.enqueue(() => this.closePort());
    this.listeners.clear();
  }

  private get serial() {
    return (navigator as NavigatorWithSerial).serial;
  }

  private async openPort(port: WebSerialPort): Promise<void> {
    await this.closePort();
    this.connection = 'connecting'; this.clearFailure(); this.emit();
    try {
      await port.open({ baudRate: this.baudRate });
      this.port = port;
      this.connection = 'online';
      this.snapshot = { ...this.snapshot, source: 'serial' };
      this.emit();
      const generation = ++this.readGeneration;
      void this.readLoop(port, generation);
    } catch (error) {
      this.port = port;
      this.setFailure(error);
    }
  }

  private async readLoop(port: WebSerialPort, generation: number): Promise<void> {
    const readable = port.readable;
    if (!readable) {
      this.setFailure(new DOMException('serial port has no readable stream', 'NotReadableError'));
      return;
    }
    const decoder = new TextDecoder();
    let pending = '';
    try {
      this.reader = readable.getReader();
      while (generation === this.readGeneration) {
        const { value, done } = await this.reader.read();
        if (done) break;
        pending += decoder.decode(value, { stream: true });
        const lines = pending.split(/\r?\n/);
        pending = lines.pop() ?? '';
        lines.forEach((line) => this.consumeLine(line));
      }
      const tail = `${pending}${decoder.decode()}`.trim();
      if (tail) this.consumeLine(tail);
      if (generation === this.readGeneration && this.connection === 'online') {
        this.setFailure(new DOMException('serial readable stream ended', 'NetworkError'));
      }
    } catch (error) {
      if (generation === this.readGeneration && this.connection !== 'disconnecting') {
        this.setFailure(error);
      }
    } finally {
      try { this.reader?.releaseLock(); } catch { /* already released */ }
      if (generation === this.readGeneration) this.reader = null;
    }
  }

  private consumeLine(line: string): void {
    if (!line.trim()) return;
    const parsed = parseSerialTouchLine(line, this.snapshot);
    this.setRaw(parsed.state.rawA, parsed.state.rawB, parsed.rawLine, parsed.recognized);
  }

  private setRaw(rawA: boolean, rawB: boolean, lastMessage: string, recognized: boolean): void {
    this.snapshot = { rawA, rawB, source: 'serial', lastMessage };
    this.recognized = recognized;
    this.emit();
  }

  private async closePort(): Promise<void> {
    this.readGeneration += 1;
    const reader = this.reader;
    this.reader = null;
    if (reader) {
      try { await reader.cancel(); } catch { /* disconnected reader */ }
      try { reader.releaseLock(); } catch { /* already released */ }
    }
    if (this.port) {
      try { await this.port.close(); } catch { /* already closed/disconnected */ }
    }
    this.port = null;
  }

  private readonly handlePhysicalDisconnect = (event: Event): void => {
    const disconnectedPort = (event as Event & { readonly port?: WebSerialPort }).port;
    if (disconnectedPort && this.port && disconnectedPort !== this.port) return;
    this.readGeneration += 1;
    this.port = null; this.reader = null;
    this.connection = 'offline';
    this.errorName = 'NetworkError';
    this.errorMessage = 'touch board disconnected';
    this.setRaw(false, false, 'SERIAL DEVICE DISCONNECTED', false);
  };

  private setFailure(error: unknown): void {
    const failure = serialFailure(error);
    this.connection = failure.name === 'NotSupportedError' ? 'unsupported' : 'error';
    this.errorName = failure.name;
    this.errorMessage = failure.message;
    this.setRaw(false, false, this.snapshot.lastMessage, this.recognized);
  }

  private clearFailure(): void {
    this.errorName = null; this.errorMessage = null;
  }

  private emit(): void {
    this.listeners.forEach((listener) => listener(this.snapshot));
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const queued = this.operationQueue.then(operation, operation);
    this.operationQueue = queued.then(() => undefined, () => undefined);
    return queued;
  }
}

function isUserCancellation(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'NotFoundError';
}

function serialFailure(error: unknown): { name: string; message: string } {
  const name = error instanceof DOMException || error instanceof Error
    ? error.name || 'SerialError'
    : 'SerialError';
  const explanations: Readonly<Record<string, string>> = {
    NotSupportedError: 'Web Serial is unavailable; use Chrome and keep keyboard A/B fallback',
    NotAllowedError: 'serial port permission was denied',
    SecurityError: 'serial access is blocked by browser security settings',
    NetworkError: 'serial port was disconnected or could not be opened',
    InvalidStateError: 'serial port is already open or busy',
    NotReadableError: 'serial stream is unavailable',
  };
  return { name, message: explanations[name] ?? (error instanceof Error ? error.message : 'serial operation failed') };
}
