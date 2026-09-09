import type { StateSnapshot } from '../core/types';
import type { CameraChannel, CameraSignal } from '../vision/CameraSignal';
import { deriveSubjectPresence } from './SubjectPresenceState';

export class ObservationFrame {
  readonly element: HTMLElement;
  readonly video: HTMLVideoElement;
  private readonly primary: HTMLElement;
  private readonly secondary: HTMLElement;
  private readonly frameNumber: HTMLElement;
  private readonly trackingBox: HTMLElement;

  constructor(readonly channel: CameraChannel) {
    this.element = document.createElement('section');
    this.element.className = `observation-frame observation-frame--${channel.toLowerCase()}`;
    this.element.dataset.channel = channel;
    this.element.setAttribute('aria-label', `Camera ${channel} observation`);

    this.video = document.createElement('video');
    this.video.className = 'observation-video';
    this.video.autoplay = true;
    this.video.muted = true;
    this.video.playsInline = true;
    this.video.setAttribute('aria-hidden', 'true');

    const material = document.createElement('div');
    material.className = 'observation-material';
    this.trackingBox = document.createElement('div');
    this.trackingBox.className = 'tracking-box';
    this.trackingBox.append(...Array.from({ length: 4 }, () => {
      const corner = document.createElement('i');
      corner.className = 'tracking-corner';
      return corner;
    }));

    const label = document.createElement('div');
    label.className = 'observation-label';
    this.primary = document.createElement('span');
    this.primary.className = 'observation-primary';
    this.secondary = document.createElement('span');
    this.secondary.className = 'observation-secondary';
    this.frameNumber = document.createElement('span');
    this.frameNumber.className = 'observation-frame-number';
    const fieldLabel = document.createElement('span');
    fieldLabel.className = 'observation-field-label';
    fieldLabel.textContent = `CAM ${channel} / SUBJECT FIELD`;
    label.append(fieldLabel, this.primary, this.secondary, this.frameNumber);
    this.element.append(this.video, material, this.trackingBox, label);
  }

  update(snapshot: StateSnapshot, signal: CameraSignal): void {
    const view = deriveSubjectPresence(this.channel, snapshot, signal);
    this.element.dataset.connection = signal.connection;
    this.element.dataset.tracking = signal.observation.trackingState;
    this.element.classList.toggle('is-engaged', view.engaged);
    this.element.classList.toggle('is-missing', view.missingCounterpart);
    this.primary.textContent = view.primary;
    this.secondary.textContent = view.secondary;
    this.frameNumber.textContent = `FRAME ${signal.frameNumber.toString().padStart(5, '0')}`;
    const box = signal.observation.faceBox;
    if (box) {
      this.trackingBox.style.setProperty('--track-x', `${box.x * 100}%`);
      this.trackingBox.style.setProperty('--track-y', `${box.y * 100}%`);
      this.trackingBox.style.setProperty('--track-w', `${box.width * 100}%`);
      this.trackingBox.style.setProperty('--track-h', `${box.height * 100}%`);
    }
    this.trackingBox.classList.toggle('has-target', Boolean(box && signal.observation.present));
  }

  dispose(): void {
    this.video.srcObject = null;
    this.element.remove();
  }
}
