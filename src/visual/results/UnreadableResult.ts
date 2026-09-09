import { BaseResultModule } from './BaseResultModule';
import type { ResultLayer } from './ResultLayer';

export class UnreadableResult extends BaseResultModule {
  readonly id = 'unreadable' as const;
  constructor(layer: ResultLayer, durationMs: number) { super(layer, durationMs); }
  protected compose(t: number): void {
    const mergeAttempt = this.window(t, 0.9, 3.6, 0.65);
    const desireAttempt = this.window(t, 3.0, 6.0, 0.7);
    const readingAttempt = this.window(t, 5.2, 8.6, 0.8);
    const settle = this.window(t, 7.8, 11.8, 0.8);
    this.layer.handExchange = mergeAttempt * 0.11;
    this.layer.handOffsetA.set(desireAttempt * 0.065, readingAttempt * 0.015, readingAttempt * 0.035);
    this.layer.handOffsetB.set(-desireAttempt * 0.055, -readingAttempt * 0.012, -readingAttempt * 0.04);
    this.layer.handGhost = readingAttempt * 0.18;
    this.layer.handGhostDepth = readingAttempt * 0.12;
    this.layer.handOpacity = 1 - settle * 0.08;
    this.layer.coreSync = mergeAttempt * 0.38 + settle * 0.12;
    this.layer.staffPhase = mergeAttempt * 0.23 - desireAttempt * 0.14;
    this.layer.staffSplit = readingAttempt * 0.16;
    this.layer.orbitTighten = mergeAttempt * 0.16;
    this.layer.orbitBreak = readingAttempt * 0.17;
    this.layer.bridgeStrength = mergeAttempt * 0.36 + desireAttempt * 0.22;
    this.layer.bridgeMisroute = readingAttempt * 0.24;
    this.layer.filamentTension = desireAttempt * 0.38;
    this.layer.filamentGap = settle * 0.2;
    this.layer.wristCuff = this.window(t, 6.4, 10.8, 0.85) * 0.92;
    this.layer.ambientGather = (mergeAttempt + desireAttempt) * 0.05;
    this.layer.ambientVoid = settle * 0.08;
    this.layer.butterflyPerchBias = mergeAttempt * 0.12;
    this.layer.butterflyForce.set(0, settle * 0.012, readingAttempt * 0.018);
  }
}
