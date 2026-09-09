import type { InputEvent } from './InputAdapter';

export interface SerialRawTouchState {
  readonly rawA: boolean;
  readonly rawB: boolean;
}

export type SerialLineKind = 'edge' | 'state' | 'ready' | 'unknown';

export interface ParsedSerialTouchLine {
  readonly rawLine: string;
  readonly state: SerialRawTouchState;
  readonly kind: SerialLineKind;
  readonly recognized: boolean;
}

const SERIAL_EVENT_MAP: Readonly<Record<string, InputEvent>> = Object.freeze({
  A_TOUCH: { type: 'A_TOUCH' },
  A_DOWN: { type: 'A_TOUCH' },
  A_RELEASE: { type: 'A_RELEASE' },
  A_UP: { type: 'A_RELEASE' },
  B_TOUCH: { type: 'B_TOUCH' },
  B_DOWN: { type: 'B_TOUCH' },
  B_RELEASE: { type: 'B_RELEASE' },
  B_UP: { type: 'B_RELEASE' },
});

/** Parses both the original Pico W vocabulary and the debounced MPR121 vocabulary. */
export function parseSerialInputLine(line: string): InputEvent | null {
  const token = line.trim().toUpperCase().split(/\s+/)[0];
  return SERIAL_EVENT_MAP[token] ?? null;
}

/**
 * Parses the AT42QT2120/Pico line protocol into an absolute raw state.
 * BOTH_RELEASE means the shared condition ended; it does not imply both
 * electrodes released (the firmware log may emit A_RELEASE, BOTH_RELEASE,
 * then B_RELEASE). Individual edges or STATE heartbeats remain authoritative.
 */
export function parseSerialTouchLine(
  line: string,
  previous: SerialRawTouchState,
): ParsedSerialTouchLine {
  const rawLine = line.trim();
  const upper = rawLine.toUpperCase();
  const heartbeat = upper.match(/^STATE\s+A\s*=\s*([01])\s+B\s*=\s*([01])(?:\s|$)/);
  if (heartbeat) {
    return parsed(rawLine, heartbeat[1] === '1', heartbeat[2] === '1', 'state');
  }

  switch (upper.split(/\s+/)[0]) {
    case 'A_TOUCH':
    case 'A_DOWN':
      return parsed(rawLine, true, previous.rawB, 'edge');
    case 'A_RELEASE':
    case 'A_UP':
      return parsed(rawLine, false, previous.rawB, 'edge');
    case 'B_TOUCH':
    case 'B_DOWN':
      return parsed(rawLine, previous.rawA, true, 'edge');
    case 'B_RELEASE':
    case 'B_UP':
      return parsed(rawLine, previous.rawA, false, 'edge');
    case 'BOTH_TOUCH':
      return parsed(rawLine, true, true, 'edge');
    case 'BOTH_RELEASE':
      return { rawLine, state: { ...previous }, kind: 'edge', recognized: true };
    case 'AT42_READY':
      return { rawLine, state: { ...previous }, kind: 'ready', recognized: true };
    default:
      return { rawLine, state: { ...previous }, kind: 'unknown', recognized: false };
  }
}

function parsed(
  rawLine: string,
  rawA: boolean,
  rawB: boolean,
  kind: SerialLineKind,
): ParsedSerialTouchLine {
  return { rawLine, state: { rawA, rawB }, kind, recognized: true };
}
