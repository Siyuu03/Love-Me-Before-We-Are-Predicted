import type { MutableCameraSignal, Rect } from './CameraSignal';

interface FaceDetection {
  readonly boundingBox: DOMRectReadOnly;
}

interface FaceDetectorLike {
  detect(source: CanvasImageSource): Promise<readonly FaceDetection[]>;
}

type FaceDetectorConstructor = new (options?: {
  readonly fastMode?: boolean;
  readonly maxDetectedFaces?: number;
}) => FaceDetectorLike;

export class VisionObservationAdapter {
  private readonly detector: FaceDetectorLike | null;
  private timer = 0;
  private channelIndex = 0;
  private busy = false;

  constructor(
    detectionFps: number,
    private readonly videos: readonly [HTMLVideoElement, HTMLVideoElement],
    private readonly signals: readonly [MutableCameraSignal, MutableCameraSignal],
  ) {
    const Detector = (window as Window & { FaceDetector?: FaceDetectorConstructor }).FaceDetector;
    this.detector = Detector ? new Detector({ fastMode: true, maxDetectedFaces: 1 }) : null;
    // Channels alternate, so a 10 FPS per-camera target needs a 20 Hz scheduler.
    const intervalMs = 1000 / (Math.max(1, detectionFps) * 2);
    this.timer = window.setInterval(this.scheduleDetection, intervalMs);
  }

  dispose(): void {
    window.clearInterval(this.timer);
    this.timer = 0;
  }

  private readonly scheduleDetection = (): void => {
    if (this.busy) return;
    const index = this.channelIndex;
    this.channelIndex = (this.channelIndex + 1) % 2;
    const signal = this.signals[index];
    const video = this.videos[index];
    if (signal.connection !== 'online' || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      return;
    }
    signal.frameNumber += 1;
    if (!this.detector) {
      signal.observation = {
        present: false,
        lastSeenAt: signal.observation.lastSeenAt,
        trackingState: 'searching',
      };
      return;
    }
    this.busy = true;
    void this.detect(index, video).finally(() => { this.busy = false; });
  };

  private async detect(index: number, video: HTMLVideoElement): Promise<void> {
    const signal = this.signals[index];
    try {
      const detections = await this.detector?.detect(video) ?? [];
      const now = performance.now();
      const detection = detections[0];
      if (detection) {
        const box: Rect = {
          x: detection.boundingBox.x / Math.max(1, video.videoWidth),
          y: detection.boundingBox.y / Math.max(1, video.videoHeight),
          width: detection.boundingBox.width / Math.max(1, video.videoWidth),
          height: detection.boundingBox.height / Math.max(1, video.videoHeight),
        };
        signal.observation = {
          present: true,
          faceBox: box,
          lastSeenAt: now,
          trackingState: 'acquired',
        };
      } else {
        const age = now - signal.observation.lastSeenAt;
        signal.observation = {
          present: false,
          lastSeenAt: signal.observation.lastSeenAt,
          trackingState: age < 900 ? 'uncertain' : age < 2400 ? 'searching' : 'lost',
        };
      }
    } catch {
      signal.observation = {
        present: false,
        lastSeenAt: signal.observation.lastSeenAt,
        trackingState: 'uncertain',
      };
    }
  }
}
