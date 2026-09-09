export interface WebSerialPortInfo {
  readonly usbVendorId?: number;
  readonly usbProductId?: number;
}

export interface WebSerialPort extends EventTarget {
  readonly readable: ReadableStream<Uint8Array> | null;
  open(options: { readonly baudRate: number }): Promise<void>;
  close(): Promise<void>;
  getInfo?(): WebSerialPortInfo;
}

export interface WebSerial extends EventTarget {
  requestPort(): Promise<WebSerialPort>;
  getPorts(): Promise<readonly WebSerialPort[]>;
}

export interface NavigatorWithSerial extends Navigator {
  readonly serial?: WebSerial;
}
