import type { StateSnapshot } from '../core/types';
import type { CameraChannel, CameraSignal } from '../vision/CameraSignal';

export interface SubjectPresenceView {
  readonly engaged: boolean;
  readonly missingCounterpart: boolean;
  readonly primary: string;
  readonly secondary: string;
}

export function deriveSubjectPresence(
  channel: CameraChannel,
  snapshot: StateSnapshot,
  signal: CameraSignal,
): SubjectPresenceView {
  const engaged = channel === 'A'
    ? snapshot.state === 'SOLO_A' || snapshot.aPressed || snapshot.state === 'CONTACT' || snapshot.state === 'RESULT'
    : snapshot.state === 'SOLO_B' || snapshot.bPressed || snapshot.state === 'CONTACT' || snapshot.state === 'RESULT';
  const missingCounterpart = channel === 'A'
    ? snapshot.state === 'SOLO_B'
    : snapshot.state === 'SOLO_A';

  if (signal.connection !== 'online') {
    return {
      engaged,
      missingCounterpart,
      primary: signal.message ?? connectionLabel(signal.connection),
      secondary: engaged ? 'INPUT REGISTERED / VISUAL UNAVAILABLE' : 'OBSERVATION STANDBY',
    };
  }
  if (missingCounterpart) {
    return { engaged: false, missingCounterpart: true, primary: `SUBJECT ${channel} / NOT DETECTED`, secondary: 'SECOND SUBJECT PENDING' };
  }
  if (signal.observation.present) {
    return { engaged, missingCounterpart: false, primary: `SUBJECT ${channel} / TRACKING`, secondary: 'VISIBILITY: PARTIAL' };
  }
  if (engaged) {
    return { engaged, missingCounterpart: false, primary: `SUBJECT ${channel} / INPUT LATCHED`, secondary: 'VISUAL SEARCHING' };
  }
  return { engaged: false, missingCounterpart: false, primary: `SUBJECT ${channel} / SEARCHING`, secondary: 'OBSERVATION STANDBY' };
}

function connectionLabel(connection: CameraSignal['connection']): string {
  if (connection === 'denied') return 'CAMERA PERMISSION DENIED';
  if (connection === 'disabled') return 'CAMERA DISABLED';
  if (connection === 'unassigned') return 'DEVICE NOT ASSIGNED';
  if (connection === 'requesting') return 'CAMERA REQUESTING';
  return 'CAMERA OFFLINE';
}
