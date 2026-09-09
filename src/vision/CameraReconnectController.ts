import type { CameraChannel } from './CameraSignal';

type ReconnectTask = () => Promise<boolean>;

export class CameraReconnectController {
  private readonly retryCounts = new Map<CameraChannel, number>();
  private readonly timers = new Map<CameraChannel, number>();
  private readonly running = new Set<CameraChannel>();
  private readonly generations = new Map<CameraChannel, number>();

  constructor(
    private readonly delaysMs: readonly number[],
    private readonly onExhausted: (channel: CameraChannel) => void,
  ) {}

  schedule(channel: CameraChannel, task: ReconnectTask): void {
    if (this.timers.has(channel) || this.running.has(channel)) return;
    const retryCount = this.retryCounts.get(channel) ?? 0;
    const generation = this.generations.get(channel) ?? 0;
    if (retryCount >= this.delaysMs.length) {
      this.onExhausted(channel);
      return;
    }
    const timer = window.setTimeout(async () => {
      this.timers.delete(channel);
      this.running.add(channel);
      let healthy = false;
      try { healthy = await task(); } finally { this.running.delete(channel); }
      if ((this.generations.get(channel) ?? 0) !== generation) return;
      if (healthy) this.reset(channel);
      else {
        this.retryCounts.set(channel, retryCount + 1);
        this.schedule(channel, task);
      }
    }, this.delaysMs[retryCount]);
    this.timers.set(channel, timer);
  }

  getNextDelayMs(channel: CameraChannel): number | null {
    const retryCount = this.retryCounts.get(channel) ?? 0;
    return this.delaysMs[retryCount] ?? null;
  }

  getFollowingDelayMs(channel: CameraChannel): number | null {
    const retryCount = (this.retryCounts.get(channel) ?? 0) + 1;
    return this.delaysMs[retryCount] ?? null;
  }

  getRetryCount(channel: CameraChannel): number { return this.retryCounts.get(channel) ?? 0; }

  reset(channel: CameraChannel): void {
    const timer = this.timers.get(channel);
    if (timer !== undefined) window.clearTimeout(timer);
    this.timers.delete(channel);
    this.retryCounts.set(channel, 0);
    this.generations.set(channel, (this.generations.get(channel) ?? 0) + 1);
  }

  cancel(channel: CameraChannel): void {
    const timer = this.timers.get(channel);
    if (timer !== undefined) window.clearTimeout(timer);
    this.timers.delete(channel);
    this.generations.set(channel, (this.generations.get(channel) ?? 0) + 1);
  }

  dispose(): void {
    (['A', 'B'] as const).forEach((channel) => this.cancel(channel));
    this.retryCounts.clear();
  }
}
