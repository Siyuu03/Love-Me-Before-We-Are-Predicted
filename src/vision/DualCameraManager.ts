import {
  CAMERA_DEVICE_CONFIG,
  resolveCameraAssignments,
  saveCameraMapping,
  validateCameraMapping,
  type CameraDeviceMapping,
} from './CameraDeviceConfig';
import { createCameraSignal, type CameraChannel, type CameraSignal, type MutableCameraSignal } from './CameraSignal';
import { VisionObservationAdapter } from './VisionObservationAdapter';
import { CameraHealthMonitor, type CameraChannelHealth } from './CameraHealthMonitor';
import { CameraReconnectController } from './CameraReconnectController';

export type CameraPermissionState = 'unknown' | 'requesting' | 'granted' | 'denied';
export type CameraUiState = 'idle' | 'selecting' | 'detected' | 'starting' | 'online' | 'retrying' | 'error';

export interface CameraChannelSetupState {
  readonly state: CameraUiState;
  readonly retryDelayMs: number;
  readonly errorName: string | null;
  readonly errorMessage: string | null;
}

export interface CameraSetupSnapshot {
  readonly permission: CameraPermissionState;
  readonly devices: readonly MediaDeviceInfo[];
  readonly enumeratedVideoInputs: number;
  readonly mapping: CameraDeviceMapping;
  readonly error: string | null;
  readonly setupOpen: boolean;
  readonly selecting: CameraChannel | null;
  readonly channels: readonly [CameraChannelSetupState, CameraChannelSetupState];
}

interface MutableChannelSetupState {
  state: CameraUiState;
  retryDelayMs: number;
  errorName: string | null;
  errorMessage: string | null;
}

interface CameraFailure {
  readonly name: string;
  readonly message: string;
}

type StatusListener = () => void;

/**
 * The installation owns exactly one manager. Every getUserMedia/stop/refresh
 * mutation passes through one promise queue, so two UI actions can never race
 * for the same C270.
 */
export class DualCameraManager {
  private readonly signals: [MutableCameraSignal, MutableCameraSignal] = [createCameraSignal('A'), createCameraSignal('B')];
  private readonly streams: [MediaStream | null, MediaStream | null] = [null, null];
  private readonly channelStates: [MutableChannelSetupState, MutableChannelSetupState] = [createChannelState(), createChannelState()];
  private readonly listeners = new Set<StatusListener>();
  private readonly health = new CameraHealthMonitor();
  private readonly reconnect = new CameraReconnectController(
    CAMERA_DEVICE_CONFIG.reconnectDelaysMs,
    (channel) => {
      const state = this.channelState(channel);
      state.state = 'error'; state.retryDelayMs = 0;
      state.errorName = 'RetryExhaustedError';
      state.errorMessage = 'automatic retry limit reached; use RETRY CAMERA';
      this.signal(channel).connection = 'offline';
      this.signal(channel).message = `RETRY CAMERA ${channel}`;
      this.emit();
    },
  );
  private readonly recoveryAuthorized = new Set<CameraChannel>();
  private previewVideos: readonly [HTMLVideoElement, HTMLVideoElement] | null = null;
  private observationAdapter: VisionObservationAdapter | null = null;
  private devices: readonly MediaDeviceInfo[] = [];
  private mapping: CameraDeviceMapping = CAMERA_DEVICE_CONFIG.mapping;
  private permission: CameraPermissionState = 'unknown';
  private setupError: string | null = null;
  private setupOpen = false;
  private selecting: CameraChannel | null = null;
  private disposed = false;
  private listenersInstalled = false;
  private operationQueue: Promise<unknown> = Promise.resolve();

  constructor(private readonly videos: readonly [HTMLVideoElement, HTMLVideoElement]) {}

  getSignals(): readonly [CameraSignal, CameraSignal] { return this.signals; }
  getHealth(channel: CameraChannel): CameraChannelHealth { return this.health.get(channel); }

  getSetupSnapshot(): CameraSetupSnapshot {
    return {
      permission: this.permission,
      devices: this.devices,
      enumeratedVideoInputs: this.devices.length,
      mapping: this.mapping,
      error: this.setupError,
      setupOpen: this.setupOpen,
      selecting: this.selecting,
      channels: this.channelStates,
    };
  }

  subscribe(listener: StatusListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  setSetupOpen(open: boolean): void {
    this.setupOpen = open;
    if (open) {
      this.recoveryAuthorized.clear();
      this.reconnect.cancel('A');
      this.reconnect.cancel('B');
    }
    if (!open) this.selecting = null;
  }

  setSelecting(channel: CameraChannel | null): void {
    if (this.selecting === channel) return;
    this.selecting = channel;
    if (channel) this.channelState(channel).state = 'selecting';
    else this.syncDetectedStates();
    this.emit();
  }

  setPreviewVideos(videos: readonly [HTMLVideoElement, HTMLVideoElement]): void {
    this.previewVideos = videos;
    videos.forEach((video, index) => {
      video.srcObject = this.streams[index];
      if (this.streams[index]) void video.play().catch(() => undefined);
    });
  }

  clearPreviewVideos(): void {
    this.previewVideos?.forEach((video) => { video.pause(); video.srcObject = null; });
    this.previewVideos = null;
  }

  start(mapping: CameraDeviceMapping = this.mapping): Promise<void> {
    return this.enqueue(async () => {
      this.mapping = mapping;
      if (!CAMERA_DEVICE_CONFIG.enabled) {
        this.signals.forEach((signal) => { signal.connection = 'disabled'; signal.message = 'CAMERA DISABLED'; });
        this.emit(); return;
      }
      if (!navigator.mediaDevices?.enumerateDevices || !navigator.mediaDevices.getUserMedia) {
        this.setGlobalFailure({ name: 'NotSupportedError', message: 'camera API unavailable' });
        return;
      }
      this.installListeners();
      await this.enumerateDevicesNow();
      if (!mapping.A || !mapping.B) {
        this.syncDetectedStates(); this.emit(); return;
      }
      await this.startSelectedNow(mapping, false, false);
    });
  }

  requestPermission(): Promise<void> {
    return this.enqueue(async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        this.setGlobalFailure({ name: 'NotSupportedError', message: 'camera API unavailable' });
        return;
      }
      this.permission = 'requesting'; this.setupError = null; this.emit();
      try {
        const temporary = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        temporary.getTracks().forEach((track) => track.stop());
        this.permission = 'granted';
        await this.enumerateDevicesNow();
      } catch (error) {
        const failure = cameraFailure(error);
        this.permission = isPermissionError(error) ? 'denied' : 'unknown';
        this.setGlobalFailure(failure);
      }
    });
  }

  /** Full enumeration is only called by the explicit Refresh button. */
  refreshDevices(): Promise<void> {
    return this.enqueue(() => this.enumerateDevicesNow());
  }

  startSelected(mapping: CameraDeviceMapping, persist = true): Promise<void> {
    return this.enqueue(() => this.startSelectedNow(mapping, persist, true));
  }

  retryChannel(channel: CameraChannel): Promise<void> {
    this.recoveryAuthorized.add(channel);
    this.reconnect.reset(channel);
    return this.enqueue(async () => {
      const healthy = await this.restartChannelNow(channel);
      if (!healthy && this.channelState(channel).errorName === 'NotReadableError') {
        this.scheduleReconnect(channel, true);
      }
    });
  }

  stop(): void {
    void this.enqueue(async () => {
      this.recoveryAuthorized.clear();
      this.stopAllChannels(true);
      this.observationAdapter?.dispose(); this.observationAdapter = null;
      this.signals.forEach((signal, index) => {
        signal.connection = signal.deviceId ? 'offline' : 'unassigned';
        signal.message = signal.deviceId ? 'CAMERA STOPPED' : 'DEVICE NOT ASSIGNED';
        this.channelStates[index].state = signal.deviceId ? 'detected' : 'idle';
      });
      this.emit();
    });
  }

  dispose(): void {
    this.disposed = true;
    this.removeListeners(); this.reconnect.dispose();
    this.observationAdapter?.dispose(); this.stopAllChannels(true); this.listeners.clear();
  }

  private async startSelectedNow(
    mapping: CameraDeviceMapping,
    persist: boolean,
    userInitiated: boolean,
  ): Promise<void> {
    const validationError = validateCameraMapping(mapping);
    if (validationError) {
      this.setupError = `ConfigurationError: ${validationError}`;
      this.emit(); return;
    }
    this.mapping = { ...mapping };
    this.setupError = null;
    if (persist) saveCameraMapping(mapping);
    if (userInitiated) {
      this.recoveryAuthorized.add('A');
      this.recoveryAuthorized.add('B');
    }
    this.stopAllChannels(false);
    this.reconnect.reset('A'); this.reconnect.reset('B');
    this.observationAdapter?.dispose(); this.observationAdapter = null;
    const assignments = resolveCameraAssignments(this.devices, mapping);
    for (let index = 0; index < assignments.length; index += 1) {
      const channel = index === 0 ? 'A' : 'B';
      const healthy = await this.startChannelNow(assignments[index], index);
      if (!healthy && this.channelStates[index].errorName === 'NotReadableError') {
        this.scheduleReconnect(channel, userInitiated);
      }
    }
    if (this.signals.some((signal) => signal.connection === 'online')) this.permission = 'granted';
    if (!this.disposed && CAMERA_DEVICE_CONFIG.detectionEnabled) {
      this.observationAdapter = new VisionObservationAdapter(
        CAMERA_DEVICE_CONFIG.detectionFps,
        this.videos,
        this.signals,
      );
    }
    this.emit();
  }

  private async restartChannelNow(channel: CameraChannel): Promise<boolean> {
    const index = channel === 'A' ? 0 : 1;
    const assignment = resolveCameraAssignments(this.devices, this.mapping)[index];
    return this.startChannelNow(assignment, index);
  }

  private async startChannelNow(
    assignment: ReturnType<typeof resolveCameraAssignments>[number],
    index: number,
  ): Promise<boolean> {
    const channel: CameraChannel = index === 0 ? 'A' : 'B';
    const signal = this.signals[index];
    this.stopChannel(index, false);
    signal.deviceId = assignment.deviceId;
    signal.deviceLabel = assignment.label;
    this.health.setDesired(channel, true);
    if (!assignment.available) {
      signal.connection = 'offline';
      signal.message = 'DEVICE DETECTED / STREAM NOT STARTED';
      this.setChannelFailure(channel, {
        name: 'NotFoundError',
        message: 'saved device is not present in the current device list',
      });
      return false;
    }

    signal.connection = 'requesting'; signal.message = undefined;
    const state = this.channelStates[index];
    state.state = 'starting'; state.retryDelayMs = 0;
    state.errorName = null; state.errorMessage = null;
    this.health.markStarting(channel); this.emit();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          deviceId: { exact: assignment.deviceId },
          width: { ideal: CAMERA_DEVICE_CONFIG.constraints.width },
          height: { ideal: CAMERA_DEVICE_CONFIG.constraints.height },
          frameRate: {
            ideal: CAMERA_DEVICE_CONFIG.constraints.frameRate,
            max: CAMERA_DEVICE_CONFIG.constraints.maxFrameRate,
          },
        },
      });
      if (this.disposed) {
        stream.getTracks().forEach((track) => track.stop());
        return false;
      }
      const track = stream.getVideoTracks()[0];
      if (!track) throw new DOMException('stream contains no video track', 'NotReadableError');
      this.streams[index] = stream;
      this.attachTrackEvents(channel, track);
      this.videos[index].srcObject = stream;
      if (this.previewVideos) this.previewVideos[index].srcObject = stream;
      await this.videos[index].play().catch(() => undefined);
      if (this.previewVideos) await this.previewVideos[index].play().catch(() => undefined);
      signal.connection = 'online'; signal.message = undefined;
      state.state = 'online'; state.retryDelayMs = 0;
      state.errorName = null; state.errorMessage = null;
      this.health.markHealthy(channel, track, this.videos[index]);
      this.reconnect.reset(channel); this.recoveryAuthorized.delete(channel);
      this.setupError = null; this.emit(); return true;
    } catch (error) {
      const failure = cameraFailure(error);
      signal.connection = isPermissionError(error) ? 'denied' : 'offline';
      signal.message = `${failure.name}: ${failure.message}`;
      if (signal.connection === 'denied') this.permission = 'denied';
      this.setChannelFailure(channel, failure);
      return false;
    }
  }

  private attachTrackEvents(channel: CameraChannel, track: MediaStreamTrack): void {
    track.onended = () => {
      this.setChannelFailure(channel, { name: 'TrackEndedError', message: 'video track ended' });
      this.scheduleReconnect(channel, false);
    };
    track.onmute = () => {
      this.health.mark(channel, 'muted', 'TRACK MUTED');
      this.signal(channel).message = 'TRACK MUTED';
      this.emit();
    };
    track.onunmute = () => {
      const index = channel === 'A' ? 0 : 1;
      this.health.markHealthy(channel, track, this.videos[index]);
      this.signal(channel).connection = 'online';
      this.signal(channel).message = undefined;
      this.channelState(channel).state = 'online';
      this.emit();
    };
  }

  private scheduleReconnect(channel: CameraChannel, userInitiated: boolean): void {
    const allowedInSetup = userInitiated || this.recoveryAuthorized.has(channel);
    if (
      this.disposed
      || this.health.get(channel).desiredState !== 'running'
      || this.signal(channel).connection === 'denied'
      || (this.setupOpen && !allowedInSetup)
    ) return;
    const delayMs = this.reconnect.getNextDelayMs(channel);
    if (delayMs === null) return;
    const state = this.channelState(channel);
    state.state = 'retrying'; state.retryDelayMs = delayMs;
    this.emit();
    this.reconnect.schedule(channel, async () => {
      if (this.setupOpen && !userInitiated && !this.recoveryAuthorized.has(channel)) return true;
      const healthy = await this.enqueue(() => this.restartChannelNow(channel));
      if (!healthy) {
        const next = this.reconnect.getFollowingDelayMs(channel);
        state.state = 'retrying'; state.retryDelayMs = next ?? 0;
        this.health.setRetryCount(channel, this.reconnect.getRetryCount(channel) + 1);
        this.emit();
      }
      return healthy;
    });
  }

  private installListeners(): void {
    if (this.listenersInstalled) return;
    navigator.mediaDevices?.addEventListener?.('devicechange', this.handleDeviceChange);
    this.listenersInstalled = true;
  }

  private removeListeners(): void {
    if (!this.listenersInstalled) return;
    navigator.mediaDevices?.removeEventListener?.('devicechange', this.handleDeviceChange);
    this.listenersInstalled = false;
  }

  private readonly handleDeviceChange = (): void => {
    void this.enqueue(async () => {
      await this.enumerateDevicesNow();
      const ids = new Set(this.devices.map((device) => device.deviceId));
      (['A', 'B'] as const).forEach((channel, index) => {
        const id = this.mapping[channel];
        if (!id) return;
        if (!ids.has(id)) {
          this.stopChannel(index, false);
          this.health.setDesired(channel, true);
          this.setChannelFailure(channel, {
            name: 'NotFoundError',
            message: 'selected camera was disconnected',
          });
        } else if (this.signals[index].connection !== 'online') {
          this.channelStates[index].state = 'detected';
          this.signals[index].message = 'DEVICE DETECTED / STREAM NOT STARTED';
          if (!this.setupOpen) this.scheduleReconnect(channel, false);
        }
      });
      this.emit();
    });
  };

  private async enumerateDevicesNow(): Promise<void> {
    try {
      this.devices = (await navigator.mediaDevices.enumerateDevices())
        .filter((device) => device.kind === 'videoinput');
      if (this.devices.length === 0) {
        this.setupError = 'NotFoundError: no video input found';
      } else if (this.setupError?.startsWith('NotFoundError: no video input')) {
        this.setupError = null;
      }
      this.syncDetectedStates();
      this.emit();
    } catch (error) {
      this.setGlobalFailure(cameraFailure(error));
    }
  }

  private syncDetectedStates(): void {
    const ids = new Set(this.devices.map((device) => device.deviceId));
    (['A', 'B'] as const).forEach((channel, index) => {
      if (this.signals[index].connection === 'online' || this.channelStates[index].state === 'starting') return;
      const id = this.mapping[channel];
      this.signals[index].deviceId = id;
      if (id && ids.has(id)) {
        this.channelStates[index].state = 'detected';
        this.signals[index].connection = 'offline';
        this.signals[index].message = 'DEVICE DETECTED / STREAM NOT STARTED';
      } else {
        this.channelStates[index].state = 'idle';
        this.signals[index].connection = id ? 'offline' : 'unassigned';
        this.signals[index].message = id ? 'SELECTED CAMERA NOT DETECTED' : 'DEVICE NOT ASSIGNED';
      }
    });
  }

  private setChannelFailure(channel: CameraChannel, failure: CameraFailure): void {
    const state = this.channelState(channel);
    state.state = 'error'; state.retryDelayMs = 0;
    state.errorName = failure.name; state.errorMessage = failure.message;
    this.health.mark(channel, 'error', `${failure.name}: ${failure.message}`);
    this.setupError = `${failure.name}: ${failure.message}`;
    this.emit();
  }

  private setGlobalFailure(failure: CameraFailure): void {
    this.setupError = `${failure.name}: ${failure.message}`;
    this.emit();
  }

  private stopAllChannels(clearDesired: boolean): void {
    (['A', 'B'] as const).forEach((channel, index) => {
      this.reconnect.cancel(channel);
      this.stopChannel(index, clearDesired);
    });
  }

  private stopChannel(index: number, clearDesired: boolean): void {
    const channel: CameraChannel = index === 0 ? 'A' : 'B';
    const stream = this.streams[index];
    stream?.getTracks().forEach((track) => {
      track.onended = null; track.onmute = null; track.onunmute = null; track.stop();
    });
    this.streams[index] = null;
    this.videos[index].srcObject = null;
    if (this.previewVideos) this.previewVideos[index].srcObject = null;
    if (clearDesired) this.health.setDesired(channel, false);
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const queued = this.operationQueue.then(operation, operation);
    this.operationQueue = queued.then(() => undefined, () => undefined);
    return queued;
  }

  private signal(channel: CameraChannel): MutableCameraSignal {
    return this.signals[channel === 'A' ? 0 : 1];
  }

  private channelState(channel: CameraChannel): MutableChannelSetupState {
    return this.channelStates[channel === 'A' ? 0 : 1];
  }

  private emit(): void { this.listeners.forEach((listener) => listener()); }
}

function createChannelState(): MutableChannelSetupState {
  return { state: 'idle', retryDelayMs: 0, errorName: null, errorMessage: null };
}

function isPermissionError(error: unknown): boolean {
  return error instanceof DOMException
    && (error.name === 'NotAllowedError' || error.name === 'SecurityError');
}

function cameraFailure(error: unknown): CameraFailure {
  const name = error instanceof DOMException
    ? error.name || 'CameraError'
    : error instanceof Error
      ? error.name || 'CameraError'
      : 'CameraError';
  const explanations: Readonly<Record<string, string>> = {
    NotAllowedError: 'camera permission was denied',
    SecurityError: 'camera access is blocked by browser security settings',
    NotFoundError: 'selected video input was not found',
    DevicesNotFoundError: 'no video input was found',
    NotReadableError: 'device is busy, unavailable, or could not start',
    TrackStartError: 'device is busy or could not start',
    OverconstrainedError: 'selected camera cannot satisfy the requested constraints',
    AbortError: 'camera start was aborted by the browser or operating system',
  };
  return { name, message: explanations[name] ?? 'camera start failed' };
}
