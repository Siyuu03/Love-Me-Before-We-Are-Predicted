import type { CameraDeviceMapping } from '../vision/CameraDeviceConfig';
import { formatCameraDeviceLabel } from '../vision/CameraDeviceConfig';
import type { DualCameraManager } from '../vision/DualCameraManager';
import type { SerialTouchInputSource } from '../input/SerialTouchInputSource';
import { TouchBoardSetupSection } from './TouchBoardSetupSection';

export class CameraSetupPanel {
  readonly element = document.createElement('section');
  readonly launcher = document.createElement('button');
  readonly previewA = createPreview('A');
  readonly previewB = createPreview('B');
  private readonly permission = document.createElement('strong');
  private readonly deviceCount = document.createElement('span');
  private readonly selectA = document.createElement('select');
  private readonly selectB = document.createElement('select');
  private readonly error = document.createElement('p');
  private readonly statusA = document.createElement('span');
  private readonly statusB = document.createElement('span');
  private readonly retryA = actionButton('RETRY CAMERA A');
  private readonly retryB = actionButton('RETRY CAMERA B');
  private readonly unsubscribe: () => void;
  private readonly touchBoard: TouchBoardSetupSection;
  private draft: CameraDeviceMapping;
  private open = false;
  private isSelecting = false;
  private deviceSignature = '';

  constructor(
    container: HTMLElement,
    private readonly cameras: DualCameraManager,
    serial: SerialTouchInputSource,
  ) {
    this.touchBoard = new TouchBoardSetupSection(serial);
    this.draft = { ...cameras.getSetupSnapshot().mapping };
    this.element.className = 'camera-setup';
    this.element.setAttribute('aria-label', 'Camera setup');
    this.element.hidden = true;
    this.launcher.className = 'camera-setup-launcher';
    this.launcher.type = 'button';
    this.launcher.textContent = 'SET UP CAMERAS';

    const heading = document.createElement('header');
    const title = document.createElement('h2'); title.textContent = 'CAMERA SETUP';
    const close = actionButton('CLOSE'); close.className += ' camera-setup-close';
    close.addEventListener('click', () => this.setOpen(false));
    heading.append(title, close);

    const permissionRow = document.createElement('p');
    permissionRow.className = 'camera-permission';
    permissionRow.append('PERMISSION: ', this.permission, ' / VIDEO INPUTS: ', this.deviceCount);
    const request = actionButton('REQUEST CAMERA ACCESS');
    request.className += ' camera-request-access';
    request.addEventListener('click', () => { void this.cameras.requestPermission(); });

    const assignments = document.createElement('div');
    assignments.className = 'camera-assignments';
    assignments.append(
      this.createAssignment('A', this.selectA, this.previewA, this.statusA, this.retryA),
      this.createAssignment('B', this.selectB, this.previewB, this.statusB, this.retryB),
    );

    this.error.className = 'camera-setup-error';
    const actions = document.createElement('div'); actions.className = 'camera-setup-actions';
    const save = actionButton('SAVE & START OBSERVATION');
    const stop = actionButton('STOP CAMERAS');
    const refresh = actionButton('REFRESH DEVICE LIST');
    save.addEventListener('click', () => { void this.saveAndStart(); });
    stop.addEventListener('click', () => this.cameras.stop());
    refresh.addEventListener('click', () => { void this.cameras.refreshDevices(); });
    actions.append(save, stop, refresh);

    const privacy = document.createElement('p');
    privacy.className = 'camera-privacy';
    privacy.textContent = 'LOCAL OBSERVATION ONLY / NO UPLOAD / NO RECORDING';
    this.element.append(
      heading,
      permissionRow,
      request,
      assignments,
      this.error,
      actions,
      privacy,
      this.touchBoard.element,
    );
    container.append(this.launcher, this.element);
    this.launcher.addEventListener('click', () => this.setOpen(true));
    this.installSelectListeners('A', this.selectA);
    this.installSelectListeners('B', this.selectB);
    this.retryA.addEventListener('click', () => { void this.cameras.retryChannel('A'); });
    this.retryB.addEventListener('click', () => { void this.cameras.retryChannel('B'); });
    this.unsubscribe = this.cameras.subscribe(this.render);
    this.render();
  }

  toggle(): void { this.setOpen(!this.open); }

  setOpen(open: boolean): void {
    this.open = open;
    this.cameras.setSetupOpen(open);
    if (!open) this.endSelecting();
    if (open) this.cameras.setPreviewVideos([this.previewA, this.previewB]);
    else this.cameras.clearPreviewVideos();
    this.element.hidden = !open;
    this.element.classList.toggle('is-open', open);
  }

  setHiddenForHandCheck(hidden: boolean): void {
    this.launcher.hidden = hidden;
    if (hidden) this.element.hidden = true;
    else this.element.hidden = !this.open;
  }

  dispose(): void {
    this.unsubscribe();
    this.touchBoard.dispose();
    this.previewA.srcObject = null; this.previewB.srcObject = null;
    this.launcher.remove(); this.element.remove();
  }

  private createAssignment(
    channel: 'A' | 'B',
    select: HTMLSelectElement,
    preview: HTMLVideoElement,
    status: HTMLElement,
    retry: HTMLButtonElement,
  ): HTMLElement {
    const field = document.createElement('label');
    field.className = `camera-assignment camera-assignment--${channel.toLowerCase()}`;
    const name = document.createElement('span'); name.textContent = `CAMERA ${channel}`;
    select.setAttribute('aria-label', `Camera ${channel} device`);
    const viewport = document.createElement('div'); viewport.className = 'camera-setup-preview';
    viewport.append(preview);
    status.className = 'camera-setup-channel-status';
    retry.className += ' camera-channel-retry';
    field.append(name, select, viewport, status, retry);
    return field;
  }

  private async saveAndStart(): Promise<void> {
    this.draft = { A: this.selectA.value, B: this.selectB.value };
    await this.cameras.startSelected(this.draft);
  }

  private readonly render = (): void => {
    const setup = this.cameras.getSetupSnapshot();
    const signals = this.cameras.getSignals();
    if (!this.draft.A && setup.mapping.A) this.draft = { ...this.draft, A: setup.mapping.A };
    if (!this.draft.B && setup.mapping.B) this.draft = { ...this.draft, B: setup.mapping.B };
    this.permission.textContent = setup.permission.toUpperCase();
    this.deviceCount.textContent = String(setup.enumeratedVideoInputs);
    const signature = setup.devices.map((device) => `${device.deviceId}:${device.label}`).join('|');
    if (!this.isSelecting && signature !== this.deviceSignature) {
      this.deviceSignature = signature;
      this.populateSelect(this.selectA, this.draft.A, setup.devices);
      this.populateSelect(this.selectB, this.draft.B, setup.devices);
    }
    this.error.textContent = setup.error ?? '';
    this.error.hidden = !setup.error;
    this.statusA.textContent = formatChannelStatus('A', setup.channels[0], signals[0].deviceId !== '');
    this.statusB.textContent = formatChannelStatus('B', setup.channels[1], signals[1].deviceId !== '');
    const healthA = this.cameras.getHealth('A');
    const healthB = this.cameras.getHealth('B');
    if (healthA.actualState === 'healthy') this.statusA.textContent += ` / ${formatHealth(healthA)}`;
    if (healthB.actualState === 'healthy') this.statusB.textContent += ` / ${formatHealth(healthB)}`;
    this.retryA.hidden = signals[0].connection === 'online' || !signals[0].deviceId;
    this.retryB.hidden = signals[1].connection === 'online' || !signals[1].deviceId;
    const unconfigured = !setup.mapping.A || !setup.mapping.B;
    this.launcher.hidden = this.open || !unconfigured;
  };

  private populateSelect(
    select: HTMLSelectElement,
    selected: string,
    devices: readonly MediaDeviceInfo[],
  ): void {
    const previous = selected || select.value;
    select.replaceChildren(new Option('SELECT CAMERA', ''));
    if (previous && !devices.some((device) => device.deviceId === previous)) {
      select.append(new Option(`SAVED DEVICE / …${previous.slice(-6)} / NOT DETECTED`, previous));
    }
    const labelCounts = new Map<string, number>();
    devices.forEach((device) => labelCounts.set(device.label, (labelCounts.get(device.label) ?? 0) + 1));
    const labelIndices = new Map<string, number>();
    devices.forEach((device) => {
      const duplicateIndex = labelIndices.get(device.label) ?? 0;
      labelIndices.set(device.label, duplicateIndex + 1);
      const assigned = device.deviceId === this.draft.A
        ? 'A'
        : device.deviceId === this.draft.B
          ? 'B'
          : undefined;
      const label = labelCounts.get(device.label)! > 1
        ? formatCameraDeviceLabel(device, duplicateIndex, assigned)
        : `${device.label || `VIDEO INPUT ${duplicateIndex + 1}`} / …${device.deviceId.slice(-6)}`;
      select.append(new Option(label, device.deviceId));
    });
    select.value = previous;
  }

  private installSelectListeners(channel: 'A' | 'B', select: HTMLSelectElement): void {
    const begin = (): void => {
      this.isSelecting = true;
      this.cameras.setSelecting(channel);
    };
    select.addEventListener('pointerdown', begin);
    select.addEventListener('focus', begin);
    select.addEventListener('change', () => {
      this.draft = channel === 'A'
        ? { ...this.draft, A: select.value }
        : { ...this.draft, B: select.value };
      this.deviceSignature = '';
      this.endSelecting();
    });
    select.addEventListener('blur', () => this.endSelecting());
  }

  private endSelecting(): void {
    if (!this.isSelecting) return;
    this.isSelecting = false;
    this.cameras.setSelecting(null);
  }
}

function formatChannelStatus(
  channel: 'A' | 'B',
  state: ReturnType<DualCameraManager['getSetupSnapshot']>['channels'][number],
  hasDevice: boolean,
): string {
  if (state.state === 'selecting') return `CAM ${channel} / SELECTING`;
  if (state.state === 'starting') return `CAM ${channel} / STARTING`;
  if (state.state === 'online') return `CAM ${channel} / ONLINE`;
  if (state.state === 'retrying') return `CAM ${channel} / RETRYING IN ${(state.retryDelayMs / 1000).toFixed(0)}s`;
  if (state.state === 'error') {
    return `CAM ${channel} / ERROR: ${state.errorName ?? 'CameraError'} / ${state.errorMessage ?? 'camera unavailable'}`;
  }
  if (state.state === 'detected' || hasDevice) {
    return `CAM ${channel} / DEVICE DETECTED / STREAM NOT STARTED`;
  }
  return `CAM ${channel} / IDLE`;
}

function formatHealth(health: ReturnType<DualCameraManager['getHealth']>): string {
  return `${health.width || 640}×${health.height || 480} / ${Math.round(health.frameRate || 15)}FPS`;
}

function createPreview(channel: 'A' | 'B'): HTMLVideoElement {
  const video = document.createElement('video');
  video.className = `camera-preview-video camera-preview-video--${channel.toLowerCase()}`;
  video.autoplay = true; video.muted = true; video.playsInline = true;
  return video;
}

function actionButton(label: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button'; button.textContent = label;
  return button;
}
