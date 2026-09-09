export type TouchInputSourceId = 'keyboard' | 'serial';

export interface TouchInputSnapshot {
  readonly rawA: boolean;
  readonly rawB: boolean;
  readonly source: TouchInputSourceId;
  readonly lastMessage: string;
}

export type TouchInputListener = (snapshot: TouchInputSnapshot) => void;

/** Raw input boundary shared by keyboard simulation and the physical board. */
export interface TouchInputSource {
  start(): void | Promise<void>;
  getSnapshot(): TouchInputSnapshot;
  subscribe(listener: TouchInputListener): () => void;
  dispose(): void;
}
