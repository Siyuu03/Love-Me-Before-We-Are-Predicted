import type { ResultId, ResultSource } from '../core/types';
import { RESULT_CONFIG } from '../visual/results/ResultConfig';

export const RESULT_TYPOGRAPHY: Readonly<Record<ResultId, {
  readonly index: string;
  readonly title: string;
}>> = {
  collision: { index: '01', title: RESULT_CONFIG.presentation.collision.publicLabel },
  'soft-merge': { index: '02', title: RESULT_CONFIG.presentation['soft-merge'].publicLabel },
  desire: { index: '03', title: RESULT_CONFIG.presentation.desire.publicLabel },
  misreading: { index: '04', title: RESULT_CONFIG.presentation.misreading.publicLabel },
  refusal: { index: '05', title: RESULT_CONFIG.presentation.refusal.publicLabel },
  unreadable: { index: '06', title: RESULT_CONFIG.presentation.unreadable.publicLabel },
};

export function resultStatus(source: ResultSource | null, result: ResultId): string {
  if (source === 'external') return 'MODEL INFERENCE';
  if (source === 'safe-unreadable' || result === 'unreadable') {
    return 'OBSERVATION INCOMPLETE';
  }
  return 'PROVISIONAL';
}
