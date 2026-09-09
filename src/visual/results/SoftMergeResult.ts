import { BaseResultModule, smoothstep } from './BaseResultModule';
import type { ResultLayer } from './ResultLayer';

export class SoftMergeResult extends BaseResultModule {
  readonly id = 'soft-merge' as const;
  constructor(layer: ResultLayer, durationMs: number) { super(layer, durationMs); }
  protected compose(t: number): void {
    const exchange = this.window(t, 1.15, 9.9, 1.2);
    const resonance = this.window(t, 3.8, 10.6, 1.2);
    const release = smoothstep(7.6, 11.2, t);
    this.layer.handExchange = exchange * (0.22 - release * 0.08);
    this.layer.handScaleA = 1 + resonance * 0.035;
    this.layer.handScaleB = 1 + resonance * 0.03;
    this.layer.handOffsetA.set(exchange * 0.07, -resonance * 0.075, -resonance * 0.065);
    this.layer.handOffsetB.set(-exchange * 0.07, resonance * 0.085, resonance * 0.085);
    this.layer.coreOffsetA.set(exchange * 0.045, resonance * 0.018, 0);
    this.layer.coreOffsetB.set(-exchange * 0.045, -resonance * 0.014, 0);
    this.layer.coreSync = resonance * 0.9;
    this.layer.staffPhase = resonance * 0.78;
    this.layer.staffAmplitude = resonance * 0.14;
    this.layer.orbitTighten = resonance * 0.26;
    this.layer.bridgeStrength = exchange * 0.92;
    this.layer.filamentTension = resonance * 0.32;
    this.layer.ambientGather = exchange * 0.25;
    this.layer.butterflyPerchBias = resonance * 0.46;
    this.layer.butterflyForce.set(0, resonance * 0.018, 0);
  }
}
