import { BaseResultModule, smoothstep } from './BaseResultModule';
import type { ResultLayer } from './ResultLayer';

export class CollisionResult extends BaseResultModule {
  readonly id = 'collision' as const;
  constructor(layer: ResultLayer, durationMs: number) { super(layer, durationMs); }
  protected compose(t: number): void {
    const compression = smoothstep(0, 1.5, t) * (1 - smoothstep(2.4, 4.1, t));
    const impact = this.pulse(t, 1.72, 0.78);
    const rebound = this.window(t, 2.2, 6.0, 0.8);
    const aftershock = this.window(t, 4.8, 8.8, 1.1);
    this.layer.handCompression = compression * 0.34;
    this.layer.handScaleA = 1 - compression * 0.1 + rebound * 0.035;
    this.layer.handScaleB = 1 - compression * 0.08 + rebound * 0.02;
    this.layer.handOffsetA.set(-rebound * 0.16, rebound * 0.025, rebound * 0.08);
    this.layer.handOffsetB.set(rebound * 0.21, -rebound * 0.045, -rebound * 0.12);
    this.layer.coreOffsetA.copy(this.layer.handOffsetA).multiplyScalar(0.72);
    this.layer.coreOffsetB.copy(this.layer.handOffsetB).multiplyScalar(0.72);
    this.layer.coreBrightness = 1 - compression * 0.13 + impact * 0.12;
    this.layer.staffImpulse = impact + aftershock * 0.38;
    this.layer.staffSplit = rebound * 0.22;
    this.layer.orbitTighten = compression * 0.48;
    this.layer.orbitBreak = impact * 0.76 + aftershock * 0.28;
    this.layer.bridgeStrength = compression * 0.45 - rebound * 0.25;
    this.layer.filamentTension = compression * 0.85 + impact * 0.42;
    this.layer.filamentVibration = impact + aftershock * 0.34;
    this.layer.butterflyScatter = impact * 0.9 + rebound * 0.34;
    this.layer.ambientGather = compression * 0.45;
  }
}
