import { BaseResultModule, smoothstep } from './BaseResultModule';
import type { ResultLayer } from './ResultLayer';

export class RefusalResult extends BaseResultModule {
  readonly id = 'refusal' as const;
  constructor(layer: ResultLayer, durationMs: number) { super(layer, durationMs); }
  protected compose(t: number): void {
    const pause = this.window(t, 0, 1.55, 0.35);
    const withdraw = smoothstep(1.05, 4.1, t) * (1 - smoothstep(8.7, 9.8, t));
    const boundary = this.window(t, 3.1, 9.2, 0.9);
    const asymmetric = (this.layer.seed & 1) === 0;
    const aAmount = withdraw * (asymmetric ? 0.19 : 0.13);
    const bAmount = withdraw * (asymmetric ? 0.09 : 0.17);
    // Both offsets remain whole-hand transforms. Rejection is expressed by a
    // gathered palm withdrawing toward its own wrist, never by detached digits.
    this.layer.handOffsetA.set(-aAmount, aAmount * 0.055, aAmount * 0.12);
    this.layer.handOffsetB.set(bAmount, -bAmount * 0.045, -bAmount * 0.11);
    this.layer.handScaleA = 1 - withdraw * (asymmetric ? 0.035 : 0.025);
    this.layer.handScaleB = 1 - withdraw * (asymmetric ? 0.022 : 0.04);
    this.layer.handTwist = withdraw * (asymmetric ? -0.075 : 0.065);
    this.layer.coreOffsetA.copy(this.layer.handOffsetA).multiplyScalar(0.7);
    this.layer.coreOffsetB.copy(this.layer.handOffsetB).multiplyScalar(0.7);
    this.layer.coreSync = -withdraw * 0.7;
    this.layer.ambientVoid = boundary * 0.85;
    this.layer.staffSplit = boundary * 0.72;
    this.layer.orbitBreak = boundary * 0.58;
    this.layer.bridgeStrength = pause * 0.14 - boundary * 0.52;
    this.layer.filamentGap = boundary * 0.9;
    this.layer.butterflyScatter = boundary * 0.42;
    this.layer.butterflyForce.set(0, boundary * 0.03, boundary * 0.04);
  }
}
