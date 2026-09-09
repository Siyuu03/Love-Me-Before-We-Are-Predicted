export const INSTALLATION_STATES = [
  'IDLE',
  'SOLO_A',
  'SOLO_B',
  'JOIN',
  'CONTACT',
  'RESULT',
  'RESET',
] as const;

export type InstallationState = (typeof INSTALLATION_STATES)[number];

export const RESULT_IDS = [
  'collision',
  'soft-merge',
  'desire',
  'misreading',
  'refusal',
  'unreadable',
] as const;

export type ResultId = (typeof RESULT_IDS)[number];

export const RESULT_LABELS: Readonly<Record<ResultId, string>> = {
  collision: 'Collision',
  'soft-merge': 'Soft Merge',
  desire: 'Desire',
  misreading: 'Misreading',
  refusal: 'Refusal',
  unreadable: 'Unreadable',
};

export type ResultSource = 'preview' | 'fixed' | 'cycle' | 'external' | 'safe-unreadable';

export type TouchOrder = 'A_FIRST' | 'B_FIRST' | 'SIMULTANEOUS';

export interface ContactInputSnapshot {
  readonly sequenceId: number;
  readonly order: TouchOrder;
  readonly sharedTouchMs: number;
  readonly aHeldMs: number;
  readonly bHeldMs: number;
  readonly leadMs: number;
}

export interface StateSnapshot {
  readonly state: InstallationState;
  readonly aPressed: boolean;
  readonly bPressed: boolean;
  readonly sharedTouchMs: number;
  readonly contactElapsedMs: number;
  readonly resultElapsedMs: number;
  readonly contactSnapshot: ContactInputSnapshot | null;
  readonly currentResult: ResultId | null;
  readonly resultSource: ResultSource | null;
  readonly resetProgress: number;
}
