import * as THREE from 'three';
import type { ResultId } from '../../core/types';
import { createHandGestureFrame } from '../hands/HandGestureLibrary';

export class ResultLayer {
  resultId: ResultId | null = null;
  elapsed = 0;
  progress = 0;
  enterProgress = 0;
  releaseProgress = 0;
  seed = 1;
  durationMs = 1;
  handOffsetA = new THREE.Vector3();
  handOffsetB = new THREE.Vector3();
  coreOffsetA = new THREE.Vector3();
  coreOffsetB = new THREE.Vector3();
  butterflyForce = new THREE.Vector3();
  handScaleA = 1;
  handScaleB = 1;
  handCompression = 0;
  handExchange = 0;
  handGhost = 0;
  handGhostDepth = 0;
  handTwist = 0;
  handOpacity = 1;
  coreSync = 0;
  coreBrightness = 1;
  staffPhase = 0;
  staffAmplitude = 0;
  staffSplit = 0;
  staffImpulse = 0;
  orbitTighten = 0;
  orbitBreak = 0;
  orbitTilt = 0;
  bridgeStrength = 0;
  bridgeMisroute = 0;
  filamentTension = 0;
  filamentGap = 0;
  filamentVibration = 0;
  wristCuff = 0;
  ambientGather = 0;
  ambientVoid = 0;
  butterflyScatter = 0;
  butterflyOpacity = 1;
  butterflyPerchBias = 0;
  readonly gesture = createHandGestureFrame();
  gazeCompression = 0;
  gazeSync = 0;
  gazeGap = 0;
  gazeLag = 0;
  gazeUncertainty = 0;

  clear(): void {
    this.resultId = null; this.elapsed = 0; this.progress = 0; this.enterProgress = 0;
    this.releaseProgress = 0; this.seed = 1; this.durationMs = 1;
    this.handOffsetA.set(0, 0, 0); this.handOffsetB.set(0, 0, 0);
    this.coreOffsetA.set(0, 0, 0); this.coreOffsetB.set(0, 0, 0);
    this.butterflyForce.set(0, 0, 0);
    this.handScaleA = 1; this.handScaleB = 1; this.handCompression = 0;
    this.handExchange = 0; this.handGhost = 0; this.handGhostDepth = 0;
    this.handTwist = 0; this.handOpacity = 1; this.coreSync = 0;
    this.coreBrightness = 1; this.staffPhase = 0; this.staffAmplitude = 0;
    this.staffSplit = 0; this.staffImpulse = 0; this.orbitTighten = 0;
    this.orbitBreak = 0; this.orbitTilt = 0; this.bridgeStrength = 0;
    this.bridgeMisroute = 0; this.filamentTension = 0; this.filamentGap = 0;
    this.filamentVibration = 0; this.wristCuff = 0; this.ambientGather = 0; this.ambientVoid = 0;
    this.butterflyScatter = 0; this.butterflyOpacity = 1; this.butterflyPerchBias = 0;
    this.gesture.poseId = null; this.gesture.sequenceIndex = 0; this.gesture.curlsA.fill(0); this.gesture.curlsB.fill(0);
    this.gesture.fingerLiftA.fill(0); this.gesture.fingerLiftB.fill(0);
    this.gesture.fingerDepthA.fill(0); this.gesture.fingerDepthB.fill(0);
    this.gesture.palmTurnA = this.gesture.palmTurnB = this.gesture.wristBendA = this.gesture.wristBendB = 0;
    this.gesture.handRollA = this.gesture.handRollB = 0;
    this.gesture.spreadA = this.gesture.spreadB = this.gesture.depthA = this.gesture.depthB = 0;
    this.gesture.liftA = this.gesture.liftB = 0;
    this.gazeCompression = this.gazeSync = this.gazeGap = this.gazeLag = this.gazeUncertainty = 0;
  }

  release(amount: number): void {
    this.releaseProgress = THREE.MathUtils.clamp(amount, 0, 1);
    const keep = 1 - smooth(this.releaseProgress);
    this.handOffsetA.multiplyScalar(keep); this.handOffsetB.multiplyScalar(keep);
    this.coreOffsetA.multiplyScalar(keep); this.coreOffsetB.multiplyScalar(keep);
    this.butterflyForce.multiplyScalar(keep);
    this.handScaleA = 1 + (this.handScaleA - 1) * keep;
    this.handScaleB = 1 + (this.handScaleB - 1) * keep;
    this.handCompression *= keep; this.handExchange *= keep; this.handGhost *= keep;
    this.handTwist *= keep; this.handOpacity = 1 + (this.handOpacity - 1) * keep;
    this.coreSync *= keep; this.coreBrightness = 1 + (this.coreBrightness - 1) * keep;
    this.staffPhase *= keep; this.staffAmplitude *= keep; this.staffSplit *= keep;
    this.staffImpulse *= keep; this.orbitTighten *= keep; this.orbitBreak *= keep;
    this.orbitTilt *= keep; this.bridgeStrength *= keep; this.bridgeMisroute *= keep;
    this.filamentTension *= keep; this.filamentGap *= keep; this.filamentVibration *= keep;
    this.wristCuff *= keep;
    this.ambientGather *= keep; this.ambientVoid *= keep; this.butterflyScatter *= keep;
    this.butterflyOpacity = 1 + (this.butterflyOpacity - 1) * keep;
    this.butterflyPerchBias *= keep;
    this.gesture.curlsA.forEach((v,i)=>{this.gesture.curlsA[i]=v*keep;}); this.gesture.curlsB.forEach((v,i)=>{this.gesture.curlsB[i]=v*keep;});
    this.gesture.fingerLiftA.forEach((v,i)=>{this.gesture.fingerLiftA[i]=v*keep;}); this.gesture.fingerLiftB.forEach((v,i)=>{this.gesture.fingerLiftB[i]=v*keep;});
    this.gesture.fingerDepthA.forEach((v,i)=>{this.gesture.fingerDepthA[i]=v*keep;}); this.gesture.fingerDepthB.forEach((v,i)=>{this.gesture.fingerDepthB[i]=v*keep;});
    this.gesture.palmTurnA*=keep; this.gesture.palmTurnB*=keep; this.gesture.wristBendA*=keep; this.gesture.wristBendB*=keep;
    this.gesture.handRollA*=keep; this.gesture.handRollB*=keep;
    this.gesture.spreadA*=keep; this.gesture.spreadB*=keep; this.gesture.depthA*=keep; this.gesture.depthB*=keep; this.gesture.liftA*=keep; this.gesture.liftB*=keep;
    this.gazeCompression*=keep; this.gazeSync*=keep; this.gazeGap*=keep; this.gazeLag*=keep; this.gazeUncertainty*=keep;
    if (this.releaseProgress >= 1) this.clear();
  }
}

function smooth(value: number): number { return value * value * (3 - 2 * value); }
