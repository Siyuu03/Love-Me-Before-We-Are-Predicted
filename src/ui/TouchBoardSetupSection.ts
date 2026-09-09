import type { SerialTouchInputSource } from '../input/SerialTouchInputSource';

export class TouchBoardSetupSection {
  readonly element = document.createElement('section');
  private readonly status = document.createElement('strong');
  private readonly detail = document.createElement('span');
  private readonly lastMessage = document.createElement('code');
  private readonly connect = actionButton('CONNECT TOUCH BOARD');
  private readonly disconnect = actionButton('DISCONNECT');
  private readonly reconnect = actionButton('RECONNECT');
  private readonly unsubscribe: () => void;

  constructor(private readonly serial: SerialTouchInputSource) {
    this.element.className = 'touch-board-setup';
    const title = document.createElement('h3'); title.textContent = 'TOUCH BOARD / AT42QT2120 + PICO';
    const statusRow = document.createElement('p');
    statusRow.append('STATUS: ', this.status, ' / ', this.detail);
    const actions = document.createElement('div'); actions.className = 'camera-setup-actions';
    actions.append(this.connect, this.disconnect, this.reconnect);
    const raw = document.createElement('p'); raw.className = 'touch-board-raw';
    raw.append('LAST SERIAL LINE: ', this.lastMessage);
    const note = document.createElement('p'); note.className = 'camera-privacy';
    note.textContent = '115200 BAUD / LOCAL SERIAL ONLY / KEYBOARD A+B REMAINS AVAILABLE';
    this.element.append(title, statusRow, actions, raw, note);

    this.connect.addEventListener('click', () => { void this.serial.connect(); });
    this.disconnect.addEventListener('click', () => { void this.serial.disconnect(); });
    this.reconnect.addEventListener('click', () => { void this.serial.reconnect(); });
    this.unsubscribe = this.serial.subscribe(this.render);
    this.render();
  }

  dispose(): void { this.unsubscribe(); }

  private readonly render = (): void => {
    const diagnostics = this.serial.getDiagnostics();
    this.status.textContent = diagnostics.connection.toUpperCase();
    this.detail.textContent = diagnostics.errorName
      ? `${diagnostics.errorName}: ${diagnostics.errorMessage ?? 'serial unavailable'}`
      : diagnostics.connection === 'online'
        ? `${diagnostics.baudRate} BAUD / A=${Number(diagnostics.rawA)} B=${Number(diagnostics.rawB)}`
        : diagnostics.connection === 'unsupported'
          ? 'WEB SERIAL UNAVAILABLE / USE CHROME OR KEYBOARD A+B'
          : 'AUTHORIZED PORT MAY RECONNECT WITHOUT A SYSTEM PICKER';
    this.lastMessage.textContent = diagnostics.lastMessage || '—';
    this.connect.hidden = diagnostics.connection === 'online'
      || diagnostics.connection === 'connecting'
      || diagnostics.connection === 'unsupported';
    this.disconnect.hidden = diagnostics.connection !== 'online';
    this.reconnect.hidden = diagnostics.connection === 'online' || diagnostics.connection === 'unsupported';
  };
}

function actionButton(label: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button'; button.textContent = label;
  return button;
}
