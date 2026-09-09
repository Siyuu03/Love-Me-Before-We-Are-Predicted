function readNumber(name: string, fallback: number): number {
  const rawValue = import.meta.env?.[name];
  if (typeof rawValue !== 'string' || rawValue.trim() === '') {
    return fallback;
  }

  const parsedValue = Number(rawValue);
  return Number.isFinite(parsedValue) ? parsedValue : fallback;
}

function readBoolean(name: string, fallback: boolean): boolean {
  const rawValue = import.meta.env?.[name];
  if (typeof rawValue !== 'string') {
    return fallback;
  }

  return rawValue === 'true' || rawValue === '1';
}

function readString(name: string, fallback = ''): string {
  const rawValue = import.meta.env?.[name];
  return typeof rawValue === 'string' ? rawValue.trim() : fallback;
}

export type DisplayRotationDeg = 0 | 90 | -90;

function readDisplayRotation(): DisplayRotationDeg {
  const value = readNumber('VITE_DISPLAY_ROTATION_DEG', 0);
  return value === 90 || value === -90 ? value : 0;
}

export const DISPLAY_ROTATION_DEG = readDisplayRotation();
export const DEBUG = readBoolean('VITE_DEBUG', false);
export const TOUCH_CONFIRM_MS = readNumber('VITE_TOUCH_CONFIRM_MS', 100);
export const RELEASE_DEBOUNCE_MS = readNumber('VITE_RELEASE_DEBOUNCE_MS', 220);
export const LATCH_GRACE_MS = readNumber('VITE_LATCH_GRACE_MS', 900);
export const SECOND_PARTICIPANT_WINDOW_MS = readNumber(
  'VITE_SECOND_PARTICIPANT_WINDOW_MS',
  5000,
);
export const QUIET_RESET_MS = readNumber('VITE_QUIET_RESET_MS', 900);
export const CONTACT_CONFIRM_MS = readNumber('VITE_CONTACT_CONFIRM_MS', 350);
// Backward-compatible name for the state machine's shared-participation threshold.
export const CONTACT_THRESHOLD_MS = CONTACT_CONFIRM_MS;
export const CONTACT_TRANSITION_MS = readNumber('VITE_CONTACT_HOLD_MS', 720);
export const RESET_DURATION_MS = readNumber('VITE_RESET_DURATION_MS', 2400);
export const LOGICAL_ASPECT_RATIO = 16 / 9;
export const CAMERA_A_DEVICE_ID = readString('VITE_CAMERA_A_DEVICE_ID');
export const CAMERA_B_DEVICE_ID = readString('VITE_CAMERA_B_DEVICE_ID');
export const CAMERA_ENABLED = readBoolean('VITE_CAMERA_ENABLED', true);
export const VISION_DETECTION_FPS = Math.min(
  12,
  Math.max(8, readNumber('VITE_VISION_DETECTION_FPS', 10)),
);
export const VISION_DETECTION_ENABLED = readBoolean('VITE_VISION_DETECTION_ENABLED', false);

export const APP_CONFIG = Object.freeze({
  displayRotationDeg: DISPLAY_ROTATION_DEG,
  debug: DEBUG,
  contactThresholdMs: CONTACT_THRESHOLD_MS,
  touchStabilizer: {
    touchConfirmMs: TOUCH_CONFIRM_MS,
    releaseDebounceMs: RELEASE_DEBOUNCE_MS,
    latchGraceMs: LATCH_GRACE_MS,
    secondParticipantWindowMs: SECOND_PARTICIPANT_WINDOW_MS,
    quietResetMs: QUIET_RESET_MS,
  },
  serial: {
    baudRate: 115200,
  },
  contactTransitionMs: CONTACT_TRANSITION_MS,
  resetDurationMs: RESET_DURATION_MS,
  logicalAspectRatio: LOGICAL_ASPECT_RATIO,
  cameras: {
    enabled: CAMERA_ENABLED,
    deviceIdA: CAMERA_A_DEVICE_ID,
    deviceIdB: CAMERA_B_DEVICE_ID,
    width: 640,
    height: 480,
    frameRate: 15,
    maxFrameRate: 20,
    reconnectDelaysMs: [1000, 2000, 4000, 8000] as const,
    detectionFps: VISION_DETECTION_FPS,
    detectionEnabled: VISION_DETECTION_ENABLED,
  },
  gaze: {
    scorePreludeDelayMs: 1350,
    resultNameDelayMs: 1900,
    observationResultOpacity: 0.36,
  },
});
