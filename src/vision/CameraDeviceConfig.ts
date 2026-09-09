import { APP_CONFIG } from '../config';
import type { CameraChannel } from './CameraSignal';

export interface CameraDeviceMapping {
  readonly A: string;
  readonly B: string;
}

export interface CameraAssignment {
  readonly channel: CameraChannel;
  readonly deviceId: string;
  readonly label: string;
  readonly available: boolean;
}

export const CAMERA_STORAGE_KEYS = Object.freeze({
  A: 'love-me-camera-a-device-id',
  B: 'love-me-camera-b-device-id',
});

export const CAMERA_DEVICE_CONFIG = Object.freeze({
  enabled: APP_CONFIG.cameras.enabled,
  mapping: readMapping(),
  constraints: {
    width: APP_CONFIG.cameras.width,
    height: APP_CONFIG.cameras.height,
    frameRate: APP_CONFIG.cameras.frameRate,
    maxFrameRate: APP_CONFIG.cameras.maxFrameRate,
  },
  detectionFps: APP_CONFIG.cameras.detectionFps,
  detectionEnabled: APP_CONFIG.cameras.detectionEnabled,
  reconnectDelaysMs: APP_CONFIG.cameras.reconnectDelaysMs,
});

export function formatCameraDeviceLabel(
  device: Pick<MediaDeviceInfo, 'deviceId' | 'label'>,
  duplicateIndex: number,
  assignedChannel?: CameraChannel,
): string {
  const raw = device.label || `VIDEO INPUT ${duplicateIndex + 1}`;
  const compact = raw
    .replace(/\s*\([^)]*\)\s*$/, '')
    .replace(/\s+HD WebCam$/i, '')
    .trim();
  const role = assignedChannel ? `CAM ${assignedChannel}` : `DEVICE ${duplicateIndex + 1}`;
  return `${compact} / ${role} / …${shortDeviceId(device.deviceId)}`;
}

export function shortDeviceId(deviceId: string): string {
  const compact = deviceId.replace(/[^a-z0-9]/gi, '');
  return (compact || deviceId).slice(-6) || 'unknown';
}

export function resolveCameraAssignments(
  devices: readonly MediaDeviceInfo[],
  mapping: CameraDeviceMapping,
): readonly CameraAssignment[] {
  const cameras = devices.filter((device) => device.kind === 'videoinput');
  return (['A', 'B'] as const).map((channel) => {
    const deviceId = mapping[channel];
    const match = deviceId ? cameras.find((device) => device.deviceId === deviceId) : undefined;
    return {
      channel,
      deviceId,
      label: match?.label ?? '',
      available: Boolean(match),
    };
  });
}

export function validateCameraMapping(mapping: CameraDeviceMapping): string | null {
  if (!mapping.A || !mapping.B) return 'SELECT CAMERA A AND CAMERA B';
  if (mapping.A === mapping.B) return 'SELECT TWO DIFFERENT CAMERAS';
  return null;
}

function readMapping(): CameraDeviceMapping {
  const query = new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search);
  return {
    A: query.get('camA')?.trim() || readStoredDeviceId('A') || APP_CONFIG.cameras.deviceIdA,
    B: query.get('camB')?.trim() || readStoredDeviceId('B') || APP_CONFIG.cameras.deviceIdB,
  };
}

export function saveCameraMapping(mapping: CameraDeviceMapping): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(CAMERA_STORAGE_KEYS.A, mapping.A);
  localStorage.setItem(CAMERA_STORAGE_KEYS.B, mapping.B);
}

function readStoredDeviceId(channel: CameraChannel): string {
  if (typeof localStorage === 'undefined') return '';
  try { return localStorage.getItem(CAMERA_STORAGE_KEYS[channel])?.trim() ?? ''; }
  catch { return ''; }
}
