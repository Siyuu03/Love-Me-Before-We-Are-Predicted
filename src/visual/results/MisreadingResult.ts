import { BaseResultModule } from './BaseResultModule';
import type { ResultLayer } from './ResultLayer';

export class MisreadingResult extends BaseResultModule {
  readonly id = 'misreading' as const;
  constructor(layer: ResultLayer, durationMs: number) { super(layer, durationMs); }
  protected compose(t: number): void {
    const ghostOne = this.window(t, 0.7, 5.3, 0.85);
    const ghostTwo = this.window(t, 4.4, 9.8, 0.9);
    const almost = this.window(t, 7.0, 10.1, 0.7);
    const sign = (this.layer.seed & 1) === 0 ? 1 : -1;
    this.layer.handGhost = Math.max(ghostOne * 0.48, ghostTwo * 0.36);
    this.layer.handGhostDepth = sign * (ghostOne * 0.28 - ghostTwo * 0.19);
    this.layer.handOffsetA.set(almost * 0.055, ghostTwo * 0.085, sign * ghostOne * 0.16);
    this.layer.handOffsetB.set(-almost * 0.035, -ghostOne * 0.09, -sign * ghostTwo * 0.18);
    this.layer.coreOffsetA.set(ghostOne * 0.04, 0, sign * ghostOne * 0.08);
    this.layer.coreOffsetB.set(-ghostTwo * 0.05, 0, -sign * ghostTwo * 0.1);
    this.layer.coreSync = -0.48 * Math.max(ghostOne, ghostTwo);
    this.layer.staffPhase = sign * (ghostOne * 0.48 - ghostTwo * 0.36);
    this.layer.staffSplit = Math.max(ghostOne, ghostTwo) * 0.36;
    this.layer.orbitTilt = sign * 0.46 * ghostTwo;
    this.layer.bridgeMisroute = Math.max(ghostOne, ghostTwo) * 0.82;
    this.layer.filamentGap = Math.max(ghostOne, ghostTwo) * 0.6;
    this.layer.ambientGather = Math.max(ghostOne, ghostTwo) * 0.06;
    this.layer.butterflyForce.set(sign * ghostTwo * 0.07, ghostOne * 0.025, sign * 0.08);
  }
}
