import { RESULT_IDS, type ResultId } from '../../core/types';
import { CollisionResult } from './CollisionResult';
import { DesireResult } from './DesireResult';
import { MisreadingResult } from './MisreadingResult';
import { RefusalResult } from './RefusalResult';
import { RESULT_CONFIG } from './ResultConfig';
import type { ResultLayer } from './ResultLayer';
import { SoftMergeResult } from './SoftMergeResult';
import { UnreadableResult } from './UnreadableResult';
import type { ResultModule } from './ResultTypes';

export class ResultRegistry {
  private readonly modules: ReadonlyMap<ResultId, ResultModule>;

  constructor(layer: ResultLayer) {
    const durations = RESULT_CONFIG.durationsMs;
    const entries: readonly ResultModule[] = [
      new CollisionResult(layer, durations.collision),
      new SoftMergeResult(layer, durations['soft-merge']),
      new DesireResult(layer, durations.desire),
      new MisreadingResult(layer, durations.misreading),
      new RefusalResult(layer, durations.refusal),
      new UnreadableResult(layer, durations.unreadable),
    ];
    this.modules = new Map(entries.map((module) => [module.id, module]));
    if (this.modules.size !== RESULT_IDS.length) throw new Error('Result registry must contain six unique results.');
  }

  get(id: ResultId): ResultModule {
    const module = this.modules.get(id);
    if (!module) throw new Error(`Unknown result: ${id}`);
    return module;
  }
  ids(): readonly ResultId[] { return RESULT_IDS; }
  values(): readonly ResultModule[] { return [...this.modules.values()]; }
  dispose(): void { this.modules.forEach((module) => module.dispose()); }
}
