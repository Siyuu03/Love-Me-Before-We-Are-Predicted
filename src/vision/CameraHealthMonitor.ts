import type { CameraChannel } from './CameraSignal';

export interface CameraChannelHealth {
  readonly channel: CameraChannel;
  readonly desiredState: 'running' | 'stopped';
  readonly actualState: 'idle' | 'starting' | 'healthy' | 'muted' | 'stale' | 'ended' | 'error';
  readonly retryCount: number;
  readonly lastFrameAt: number;
  readonly lastHealthyAt: number;
  readonly lastError: string | null;
  readonly width: number;
  readonly height: number;
  readonly frameRate: number;
}

interface MutableHealth {
  channel: CameraChannel;
  desiredState: 'running' | 'stopped';
  actualState: CameraChannelHealth['actualState'];
  retryCount: number;
  lastFrameAt: number;
  lastHealthyAt: number;
  lastError: string | null;
  lastVideoTime: number;
  width: number;
  height: number;
  frameRate: number;
}

export class CameraHealthMonitor {
  private readonly channels: [MutableHealth, MutableHealth] = [createHealth('A'), createHealth('B')];

  get(channel: CameraChannel): CameraChannelHealth { return this.channels[channel === 'A' ? 0 : 1]; }

  setDesired(channel: CameraChannel, desired: boolean): void {
    const health = this.mutable(channel);
    health.desiredState = desired ? 'running' : 'stopped';
    if (!desired) health.actualState = 'idle';
  }

  markStarting(channel: CameraChannel): void {
    const health = this.mutable(channel);
    health.actualState = 'starting'; health.lastError = null;
  }

  markHealthy(channel: CameraChannel, track: MediaStreamTrack, video: HTMLVideoElement, now = performance.now()): void {
    const health = this.mutable(channel);
    const settings = track.getSettings();
    health.actualState = 'healthy'; health.lastError = null;
    health.lastFrameAt = now; health.lastHealthyAt = now; health.lastVideoTime = video.currentTime;
    health.width = settings.width ?? video.videoWidth ?? 0;
    health.height = settings.height ?? video.videoHeight ?? 0;
    health.frameRate = settings.frameRate ?? 0;
  }

  mark(channel: CameraChannel, state: CameraChannelHealth['actualState'], error?: string): void {
    const health = this.mutable(channel);
    health.actualState = state;
    if (error) health.lastError = error;
  }

  setRetryCount(channel: CameraChannel, retryCount: number): void { this.mutable(channel).retryCount = retryCount; }

  sample(
    channel: CameraChannel,
    track: MediaStreamTrack | null,
    video: HTMLVideoElement,
    staleFrameMs: number,
    now = performance.now(),
  ): boolean {
    const health = this.mutable(channel);
    if (health.desiredState !== 'running') return true;
    if (!track || track.readyState === 'ended') { health.actualState = 'ended'; return false; }
    if (track.muted) { health.actualState = 'muted'; return false; }
    if (video.currentTime > health.lastVideoTime + 0.001) {
      health.lastVideoTime = video.currentTime;
      health.lastFrameAt = now; health.lastHealthyAt = now; health.actualState = 'healthy';
      return true;
    }
    if (now - health.lastFrameAt > staleFrameMs) { health.actualState = 'stale'; return false; }
    return true;
  }

  private mutable(channel: CameraChannel): MutableHealth { return this.channels[channel === 'A' ? 0 : 1]; }
}

function createHealth(channel: CameraChannel): MutableHealth {
  return { channel, desiredState: 'stopped', actualState: 'idle', retryCount: 0,
    lastFrameAt: 0, lastHealthyAt: 0, lastError: null, lastVideoTime: 0,
    width: 0, height: 0, frameRate: 0 };
}
