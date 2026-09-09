import type { HandGestureFrame } from './HandGestureLibrary';
import { createHandGestureFrame } from './HandGestureLibrary';

export class HandPoseController {
  private readonly frame = createHandGestureFrame();
  update(target: HandGestureFrame, deltaSeconds: number): HandGestureFrame {
    const blend = 1 - Math.exp(-5.2 * Math.max(0, deltaSeconds));
    this.frame.poseId = target.poseId; this.frame.sequenceIndex = target.sequenceIndex;
    for (let i = 0; i < 5; i += 1) { this.frame.curlsA[i] += (target.curlsA[i]-this.frame.curlsA[i])*blend; this.frame.curlsB[i] += (target.curlsB[i]-this.frame.curlsB[i])*blend; }
    for (let i = 0; i < 5; i += 1) {
      this.frame.fingerLiftA[i] += (target.fingerLiftA[i]-this.frame.fingerLiftA[i])*blend;
      this.frame.fingerLiftB[i] += (target.fingerLiftB[i]-this.frame.fingerLiftB[i])*blend;
      this.frame.fingerDepthA[i] += (target.fingerDepthA[i]-this.frame.fingerDepthA[i])*blend;
      this.frame.fingerDepthB[i] += (target.fingerDepthB[i]-this.frame.fingerDepthB[i])*blend;
    }
    const keys = ['palmTurnA','palmTurnB','wristBendA','wristBendB','handRollA','handRollB','spreadA','spreadB','depthA','depthB','liftA','liftB'] as const;
    keys.forEach(k => { this.frame[k] += (target[k]-this.frame[k])*blend; });
    return this.frame;
  }
}
