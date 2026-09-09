import { BaseResultModule, smoothstep } from './BaseResultModule';
import type { ResultLayer } from './ResultLayer';

export class DesireResult extends BaseResultModule {
  readonly id = 'desire' as const;
  constructor(layer: ResultLayer, durationMs: number) { super(layer, durationMs); }
  protected compose(t: number): void {
    const first = this.window(t, 0.7, 4.25, 0.8);
    const second = this.window(t, 3.7, 7.5, 0.9);
    const suspension = smoothstep(6.8, 9.4, t) * (1 - smoothstep(10.5, 11.6, t));
    const approach = first * 0.055 + second * 0.072 + suspension * 0.085;
    this.layer.handOffsetA.set(approach, first * 0.075 - second * 0.052, second * 0.135);
    this.layer.handOffsetB.set(-approach, -first * 0.065 + second * 0.072, -second * 0.115);
    this.layer.handTwist = Math.sin(t * 1.34) * (first + second) * 0.08;
    this.layer.coreOffsetA.set(approach * 0.62, first * 0.02, second * 0.03);
    this.layer.coreOffsetB.set(-approach * 0.62, -first * 0.018, -second * 0.025);
    this.layer.coreSync = suspension * 0.72;
    this.layer.staffPhase = (0.2 + Math.sin(t * 0.82) * 0.15) * (first + second + suspension);
    this.layer.orbitTighten = second * 0.4 + suspension * 0.3;
    this.layer.bridgeStrength = (first + second) * 0.38 + suspension * 0.52;
    this.layer.filamentTension = (first + second) * 0.44 + suspension * 0.82;
    this.layer.ambientGather = (first + second + suspension) * 0.08;
    this.layer.butterflyForce.set(Math.sin(t * 0.43) * 0.045, Math.cos(t * 0.51) * 0.025, 0.02);
    this.layer.butterflyPerchBias = suspension * 0.22;
  }
}
