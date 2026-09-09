import type { InstallationState } from './types';

export class StateHistory {
  private readonly entries: InstallationState[] = ['IDLE'];

  constructor(private readonly capacity = 7) {}

  record(state: InstallationState): void {
    if (this.entries[this.entries.length - 1] === state) return;

    this.entries.push(state);
    if (this.entries.length > this.capacity) {
      this.entries.splice(0, this.entries.length - this.capacity);
    }
  }

  getEntries(): readonly InstallationState[] {
    return this.entries;
  }
}
