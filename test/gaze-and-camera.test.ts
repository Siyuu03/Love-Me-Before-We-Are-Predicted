import assert from 'node:assert/strict';
import test from 'node:test';
import type { StateSnapshot } from '../src/core/types';
import { formatCameraDeviceLabel, resolveCameraAssignments, validateCameraMapping } from '../src/vision/CameraDeviceConfig';
import { CAMERA_DEVICE_CONFIG } from '../src/vision/CameraDeviceConfig';
import { createCameraSignal } from '../src/vision/CameraSignal';
import { DualCameraManager } from '../src/vision/DualCameraManager';
import { RESULT_TYPOGRAPHY, resultStatus } from '../src/ui/ResultTypography';
import { deriveSubjectPresence } from '../src/ui/SubjectPresenceState';
import { CameraHealthMonitor } from '../src/vision/CameraHealthMonitor';

function snapshot(state: StateSnapshot['state']): StateSnapshot {
  return {
    state,
    aPressed: state === 'SOLO_A' || state === 'JOIN' || state === 'CONTACT' || state === 'RESULT',
    bPressed: state === 'SOLO_B' || state === 'JOIN' || state === 'CONTACT' || state === 'RESULT',
    sharedTouchMs: 0,
    contactElapsedMs: 0,
    resultElapsedMs: 0,
    contactSnapshot: null,
    currentResult: null,
    resultSource: null,
    resetProgress: 0,
  };
}

test('result judgement uses the six exact public labels without fabricated confidence', () => {
  assert.deepEqual(Object.values(RESULT_TYPOGRAPHY).map((entry) => entry.title), [
    'COLLISION', 'SOFT MERGE', 'DESIRE', 'MISREADING', 'REFUSAL', 'UNREADABLE',
  ]);
  assert.equal(resultStatus('preview', 'collision'), 'PROVISIONAL');
  assert.equal(resultStatus('safe-unreadable', 'unreadable'), 'OBSERVATION INCOMPLETE');
  assert.equal(resultStatus('external', 'desire'), 'MODEL INFERENCE');
});

test('SOLO_A and SOLO_B mark the opposite observation aperture as absent', () => {
  const a = createCameraSignal('A');
  const b = createCameraSignal('B');
  a.connection = 'online'; b.connection = 'online';
  assert.equal(deriveSubjectPresence('B', snapshot('SOLO_A'), b).missingCounterpart, true);
  assert.equal(deriveSubjectPresence('A', snapshot('SOLO_B'), a).missingCounterpart, true);
  assert.equal(deriveSubjectPresence('A', snapshot('SOLO_A'), a).engaged, true);
});

test('camera assignment requires stable configured ids and never guesses list order', () => {
  const devices = [
    { kind: 'videoinput', deviceId: 'first', label: 'Camera One', groupId: '', toJSON() {} },
    { kind: 'videoinput', deviceId: 'second', label: 'Camera Two', groupId: '', toJSON() {} },
  ] as MediaDeviceInfo[];
  const unassigned = resolveCameraAssignments(devices, { A: '', B: '' });
  assert.equal(unassigned[0].available, false);
  assert.equal(unassigned[1].available, false);
  const assigned = resolveCameraAssignments(devices, { A: 'second', B: 'first' });
  assert.deepEqual(assigned.map((value) => value.deviceId), ['second', 'first']);
  assert.deepEqual(assigned.map((value) => value.available), [true, true]);
});

test('camera mapping requires two distinct selected devices', () => {
  assert.equal(validateCameraMapping({ A: '', B: '' }), 'SELECT CAMERA A AND CAMERA B');
  assert.equal(validateCameraMapping({ A: 'same', B: 'same' }), 'SELECT TWO DIFFERENT CAMERAS');
  assert.equal(validateCameraMapping({ A: 'logitech-a', B: 'logitech-b' }), null);
});

test('camera-offline fallback is explicit and does not pretend a subject was observed', () => {
  const signal = createCameraSignal('A');
  signal.connection = 'offline';
  signal.message = 'CAMERA OFFLINE';
  const view = deriveSubjectPresence('A', snapshot('SOLO_A'), signal);
  assert.equal(view.primary, 'CAMERA OFFLINE');
  assert.equal(signal.observation.present, false);
  assert.match(view.secondary, /VISUAL UNAVAILABLE/);
});

test('staggered visual observation stays within the non-blocking 8–12 FPS budget', () => {
  assert.ok(CAMERA_DEVICE_CONFIG.detectionFps >= 8);
  assert.ok(CAMERA_DEVICE_CONFIG.detectionFps <= 12);
});

test('dual C270 constraints and per-channel reconnect policy protect the main renderer', () => {
  assert.deepEqual(CAMERA_DEVICE_CONFIG.constraints, {
    width: 640,
    height: 480,
    frameRate: 15,
    maxFrameRate: 20,
  });
  assert.deepEqual(CAMERA_DEVICE_CONFIG.reconnectDelaysMs, [1000, 2000, 4000, 8000]);
});

test('same-name cameras keep distinct stable labels and device-id suffixes', () => {
  const first = { deviceId: 'logitech-camera-000825', label: 'Logi C270 HD WebCam' };
  const second = { deviceId: 'logitech-camera-914402', label: 'Logi C270 HD WebCam' };
  assert.equal(formatCameraDeviceLabel(first, 0, 'A'), 'Logi C270 / CAM A / …000825');
  assert.equal(formatCameraDeviceLabel(second, 1, 'B'), 'Logi C270 / CAM B / …914402');
});

test('opening and closing Camera Setup twenty times does not enumerate or start streams', async () => {
  const devices = createFakeMediaDevices([]);
  const restore = installFakeMediaDevices(devices.api);
  const manager = new DualCameraManager([createFakeVideo(), createFakeVideo()]);
  try {
    await manager.start({ A: '', B: '' });
    const baselineEnumerations = devices.enumerations;
    for (let index = 0; index < 20; index += 1) {
      manager.setSetupOpen(true);
      manager.setSelecting(index % 2 === 0 ? 'A' : 'B');
      manager.setSelecting(null);
      manager.setSetupOpen(false);
    }
    assert.equal(devices.enumerations, baselineEnumerations);
    assert.equal(devices.requests, 0);
  } finally {
    manager.dispose();
    restore();
  }
});

test('dual camera starts are serialized and use stable low-bandwidth constraints', async () => {
  const listed = [
    fakeDevice('c270-a', 'Logi C270 HD WebCam'),
    fakeDevice('c270-b', 'Logi C270 HD WebCam'),
  ];
  const devices = createFakeMediaDevices(listed);
  const restore = installFakeMediaDevices(devices.api);
  const manager = new DualCameraManager([createFakeVideo(), createFakeVideo()]);
  try {
    await manager.start({ A: 'c270-a', B: 'c270-b' });
    assert.equal(devices.requests, 2);
    assert.equal(devices.maxConcurrentRequests, 1);
    for (const constraints of devices.constraints) {
      assert.deepEqual(constraints, {
        audio: false,
        video: {
          deviceId: { exact: constraints.video.deviceId.exact },
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 15, max: 20 },
        },
      });
    }
    assert.deepEqual(devices.constraints.map((entry) => entry.video.deviceId.exact), ['c270-a', 'c270-b']);
  } finally {
    manager.dispose();
    restore();
  }
});

test('camera health is independent per channel and detects an ended track', () => {
  const monitor = new CameraHealthMonitor();
  const video = { currentTime: 1, videoWidth: 640, videoHeight: 480 } as HTMLVideoElement;
  const track = {
    muted: false,
    readyState: 'live',
    getSettings: () => ({ width: 640, height: 480, frameRate: 15 }),
  } as unknown as MediaStreamTrack;
  monitor.setDesired('A', true);
  monitor.markHealthy('A', track, video, 1000);
  video.currentTime = 1.1;
  assert.equal(monitor.sample('A', track, video, 3500, 1100), true);
  Object.defineProperty(track, 'readyState', { value: 'ended' });
  assert.equal(monitor.sample('A', track, video, 3500, 1200), false);
  assert.equal(monitor.get('A').actualState, 'ended');
  assert.equal(monitor.get('B').actualState, 'idle');
});

type FakeConstraints = {
  audio: false;
  video: {
    deviceId: { exact: string };
    width: { ideal: number };
    height: { ideal: number };
    frameRate: { ideal: number; max: number };
  };
};

function fakeDevice(deviceId: string, label: string): MediaDeviceInfo {
  return { kind: 'videoinput', deviceId, label, groupId: '', toJSON() {} } as MediaDeviceInfo;
}

function createFakeVideo(): HTMLVideoElement {
  return {
    currentTime: 0,
    videoWidth: 640,
    videoHeight: 480,
    srcObject: null,
    play: async () => undefined,
    pause: () => undefined,
  } as unknown as HTMLVideoElement;
}

function createFakeMediaDevices(listed: readonly MediaDeviceInfo[]) {
  let enumerations = 0;
  let requests = 0;
  let concurrentRequests = 0;
  let maxConcurrentRequests = 0;
  const constraints: FakeConstraints[] = [];
  const listeners = new Map<string, EventListener>();
  const api = {
    async enumerateDevices(): Promise<MediaDeviceInfo[]> {
      enumerations += 1;
      return [...listed];
    },
    async getUserMedia(value: MediaStreamConstraints): Promise<MediaStream> {
      requests += 1;
      concurrentRequests += 1;
      maxConcurrentRequests = Math.max(maxConcurrentRequests, concurrentRequests);
      constraints.push(value as FakeConstraints);
      await Promise.resolve();
      concurrentRequests -= 1;
      const exact = (value.video as MediaTrackConstraints).deviceId as { exact: string };
      const track = {
        muted: false,
        readyState: 'live',
        onended: null,
        onmute: null,
        onunmute: null,
        stop() {},
        getSettings: () => ({ deviceId: exact.exact, width: 640, height: 480, frameRate: 15 }),
      } as unknown as MediaStreamTrack;
      return {
        active: true,
        getTracks: () => [track],
        getVideoTracks: () => [track],
      } as unknown as MediaStream;
    },
    addEventListener(type: string, listener: EventListener) { listeners.set(type, listener); },
    removeEventListener(type: string) { listeners.delete(type); },
  } as unknown as MediaDevices;
  return {
    api,
    get enumerations() { return enumerations; },
    get requests() { return requests; },
    get maxConcurrentRequests() { return maxConcurrentRequests; },
    constraints,
  };
}

function installFakeMediaDevices(mediaDevices: MediaDevices): () => void {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { mediaDevices },
  });
  return () => {
    if (descriptor) Object.defineProperty(globalThis, 'navigator', descriptor);
    else Reflect.deleteProperty(globalThis, 'navigator');
  };
}
