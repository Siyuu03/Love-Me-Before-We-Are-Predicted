export type CameraChannel = 'A' | 'B';
export type CameraConnectionState =
  | 'disabled'
  | 'unassigned'
  | 'requesting'
  | 'online'
  | 'offline'
  | 'denied';

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface Landmark {
  readonly x: number;
  readonly y: number;
  readonly z?: number;
}

export type TrackingState = 'searching' | 'acquired' | 'uncertain' | 'lost';

export interface SubjectObservation {
  readonly present: boolean;
  readonly confidence?: number;
  readonly faceBox?: Rect;
  readonly handLandmarks?: readonly Landmark[];
  readonly lastSeenAt: number;
  readonly trackingState: TrackingState;
}

export interface CameraSignal {
  readonly channel: CameraChannel;
  readonly connection: CameraConnectionState;
  readonly deviceId: string;
  readonly deviceLabel: string;
  readonly frameNumber: number;
  readonly observation: SubjectObservation;
  readonly message?: string;
}

export interface MutableCameraSignal {
  channel: CameraChannel;
  connection: CameraConnectionState;
  deviceId: string;
  deviceLabel: string;
  frameNumber: number;
  observation: SubjectObservation;
  message?: string;
}

export function createCameraSignal(channel: CameraChannel): MutableCameraSignal {
  return {
    channel,
    connection: 'unassigned',
    deviceId: '',
    deviceLabel: '',
    frameNumber: 0,
    observation: {
      present: false,
      lastSeenAt: 0,
      trackingState: 'searching',
    },
  };
}
