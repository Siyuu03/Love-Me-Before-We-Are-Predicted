import assert from 'node:assert/strict';
import test from 'node:test';
import { SerialTouchInputSource } from '../src/input/SerialTouchInputSource';
import { parseSerialTouchLine, type SerialRawTouchState } from '../src/input/SerialProtocol';
import type { NavigatorWithSerial, WebSerial, WebSerialPort } from '../src/input/WebSerialTypes';

test('AT42/Pico edge log resolves none, A-only, both, B-only and none', () => {
  let state: SerialRawTouchState = { rawA: false, rawB: false };
  const apply = (line: string) => {
    const parsed = parseSerialTouchLine(line, state);
    state = parsed.state;
    return parsed;
  };

  assert.deepEqual(apply('AT42_READY').state, { rawA: false, rawB: false });
  assert.deepEqual(apply('STATE A=0 B=0').state, { rawA: false, rawB: false });
  assert.deepEqual(apply('A_TOUCH').state, { rawA: true, rawB: false });
  assert.deepEqual(apply('B_TOUCH').state, { rawA: true, rawB: true });
  assert.deepEqual(apply('BOTH_TOUCH').state, { rawA: true, rawB: true });
  assert.deepEqual(apply('A_RELEASE').state, { rawA: false, rawB: true });
  assert.deepEqual(apply('BOTH_RELEASE').state, { rawA: false, rawB: true });
  assert.deepEqual(apply('B_RELEASE').state, { rawA: false, rawB: false });
});

test('STATE heartbeat is authoritative for all four raw combinations', () => {
  const previous = { rawA: false, rawB: false };
  assert.deepEqual(parseSerialTouchLine('STATE A=0 B=0', previous).state, { rawA: false, rawB: false });
  assert.deepEqual(parseSerialTouchLine('STATE A=1 B=0', previous).state, { rawA: true, rawB: false });
  assert.deepEqual(parseSerialTouchLine('state a=0 b=1', previous).state, { rawA: false, rawB: true });
  assert.deepEqual(parseSerialTouchLine('STATE   A = 1   B = 1', previous).state, { rawA: true, rawB: true });
});

test('unknown diagnostics preserve the raw state and original line', () => {
  const previous = { rawA: true, rawB: false };
  const parsed = parseSerialTouchLine('baseline key11=428 unknown-field', previous);
  assert.equal(parsed.recognized, false);
  assert.equal(parsed.kind, 'unknown');
  assert.equal(parsed.rawLine, 'baseline key11=428 unknown-field');
  assert.deepEqual(parsed.state, previous);
});

test('Web Serial chooser is called only by explicit connect and lines update one source', async () => {
  const port = new FakeSerialPort();
  const serial = new FakeSerial(port);
  const restore = installSerial(serial);
  const source = new SerialTouchInputSource(115200);
  const snapshots: { rawA: boolean; rawB: boolean; lastMessage: string }[] = [];
  source.subscribe((snapshot) => snapshots.push({
    rawA: snapshot.rawA,
    rawB: snapshot.rawB,
    lastMessage: snapshot.lastMessage,
  }));
  try {
    source.start();
    await flush();
    assert.equal(serial.requestCount, 0);
    await source.connect();
    assert.equal(serial.requestCount, 1);
    assert.equal(port.openOptions?.baudRate, 115200);
    assert.equal(source.getDiagnostics().connection, 'online');

    port.write('A_TOUCH\nSTATE A=1 B=1\nunknown diagnostic value\n');
    await flush();
    assert.deepEqual(source.getSnapshot(), {
      rawA: true,
      rawB: true,
      source: 'serial',
      lastMessage: 'unknown diagnostic value',
    });
    assert.equal(source.getDiagnostics().recognized, false);
    assert.ok(snapshots.some((snapshot) => snapshot.rawA && !snapshot.rawB));
    assert.ok(snapshots.some((snapshot) => snapshot.rawA && snapshot.rawB));
  } finally {
    await source.disconnect();
    source.dispose();
    restore();
  }
});

class FakeSerial extends EventTarget implements WebSerial {
  requestCount = 0;
  constructor(private readonly port: WebSerialPort) { super(); }
  async requestPort(): Promise<WebSerialPort> { this.requestCount += 1; return this.port; }
  async getPorts(): Promise<readonly WebSerialPort[]> { return []; }
}

class FakeSerialPort extends EventTarget implements WebSerialPort {
  readable: ReadableStream<Uint8Array> | null = null;
  openOptions: { readonly baudRate: number } | null = null;
  private controller: ReadableStreamDefaultController<Uint8Array> | null = null;

  async open(options: { readonly baudRate: number }): Promise<void> {
    this.openOptions = options;
    this.readable = new ReadableStream<Uint8Array>({
      start: (controller) => { this.controller = controller; },
      cancel: () => { this.controller = null; },
    });
  }

  async close(): Promise<void> { this.controller = null; this.readable = null; }

  write(value: string): void { this.controller?.enqueue(new TextEncoder().encode(value)); }
}

function installSerial(serial: WebSerial): () => void {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { serial } satisfies Partial<NavigatorWithSerial>,
  });
  return () => {
    if (descriptor) Object.defineProperty(globalThis, 'navigator', descriptor);
    else Reflect.deleteProperty(globalThis, 'navigator');
  };
}

async function flush(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}
