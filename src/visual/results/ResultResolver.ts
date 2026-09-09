import { RESULT_IDS, type ResultId } from '../../core/types';
import { RESULT_CONFIG, type ResultSelectionMode } from './ResultConfig';
import type { ResolvedResult, ResultSelectionInput } from './ResultTypes';
import { routeAppearancePair } from '../../vision/TeachableMachineInference';

export class ResultResolver {
  private cycleIndex = 0;

  constructor(
    private readonly mode: ResultSelectionMode = RESULT_CONFIG.selectionMode,
    private readonly fixedResult: ResultId = RESULT_CONFIG.fixedResult,
  ) {}

  resolve(input: ResultSelectionInput): ResolvedResult {
    if (input.appearancePair) {
      return { id: routeAppearancePair(input.appearancePair), source: 'external' };
    }
    if (input.resultHint && (input.confidence ?? 1) >= 0.5) {
      return { id: input.resultHint, source: 'external' };
    }
    if (this.mode === 'fixed') return { id: this.fixedResult, source: 'fixed' };
    if (this.mode === 'cycle') {
      const id = RESULT_IDS[this.cycleIndex % RESULT_IDS.length];
      this.cycleIndex += 1;
      return { id, source: 'cycle' };
    }
    return { id: 'unreadable', source: 'safe-unreadable' };
  }
}
