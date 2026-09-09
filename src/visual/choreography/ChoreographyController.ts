import type { StateSnapshot } from '../../core/types';
import { VISUAL_THEME } from '../theme';
import { CHOREOGRAPHY_CONFIG } from './choreographyConfig';
import { RESULT_CONFIG } from '../results/ResultConfig';

export interface ChoreographyFrame {
  handPresenceA: number;
  handPresenceB: number;
  handOpacityA: number;
  handOpacityB: number;
  soloRhythmA: number;
  soloRhythmB: number;
  approach: number;
  staffAlignment: number;
  interstitialGather: number;
  tension: number;
  contactProgress: number;
  idleAmbient: number;
  scenePresence: number;
  staffVisibility: number;
}

interface SpringSettings {
  readonly stiffness: number;
  readonly damping: number;
}

class SpringChannel {
  value: number;
  private velocity = 0;

  constructor(initialValue: number) {
    this.value = initialValue;
  }

  update(target: number, deltaSeconds: number, settings: SpringSettings): number {
    let remaining = Math.min(Math.max(deltaSeconds, 0), 0.1);
    while (remaining > 0) {
      const step = Math.min(remaining, CHOREOGRAPHY_CONFIG.spring.maxStepSeconds);
      const acceleration =
        (target - this.value) * settings.stiffness - this.velocity * settings.damping;
      this.velocity += acceleration * step;
      this.value += this.velocity * step;
      remaining -= step;
    }

    if (this.value < 0 || this.value > 1) {
      this.value = Math.min(1, Math.max(0, this.value));
      this.velocity = 0;
    }
    return this.value;
  }
}

export class ChoreographyController {
  private readonly presenceA = new SpringChannel(VISUAL_THEME.hands.idleFormation);
  private readonly presenceB = new SpringChannel(VISUAL_THEME.hands.idleFormation);
  private readonly opacityA = new SpringChannel(VISUAL_THEME.hands.idleOpacity);
  private readonly opacityB = new SpringChannel(VISUAL_THEME.hands.idleOpacity);
  private readonly rhythmA = new SpringChannel(0);
  private readonly rhythmB = new SpringChannel(0);
  private readonly approach = new SpringChannel(0);
  private readonly alignment = new SpringChannel(0);
  private readonly gather = new SpringChannel(0);
  private readonly tension = new SpringChannel(0);
  private readonly scenePresence = new SpringChannel(1);
  private readonly staffVisibility = new SpringChannel(1);
  private readonly frame: ChoreographyFrame = {
    handPresenceA: VISUAL_THEME.hands.idleFormation,
    handPresenceB: VISUAL_THEME.hands.idleFormation,
    handOpacityA: VISUAL_THEME.hands.idleOpacity,
    handOpacityB: VISUAL_THEME.hands.idleOpacity,
    soloRhythmA: 0,
    soloRhythmB: 0,
    approach: 0,
    staffAlignment: 0,
    interstitialGather: 0,
    tension: 0,
    contactProgress: 0,
    idleAmbient: 1,
    scenePresence: 1,
    staffVisibility: 1,
  };

  constructor(
    private readonly contactThresholdMs: number,
    private readonly contactTransitionMs: number,
  ) {}

  update(deltaSeconds: number, snapshot: StateSnapshot): ChoreographyFrame {
    let presenceA = VISUAL_THEME.hands.idleFormation;
    let presenceB = VISUAL_THEME.hands.idleFormation;
    let opacityA = VISUAL_THEME.hands.idleOpacity;
    let opacityB = VISUAL_THEME.hands.idleOpacity;
    let rhythmA = 0;
    let rhythmB = 0;
    let approach = 0;
    let alignment = 0;
    let gather = 0;
    let tension = 0;

    if (snapshot.state === 'SOLO_A' || snapshot.state === 'SOLO_B') {
      const isA = snapshot.state === 'SOLO_A';
      presenceA = isA
        ? CHOREOGRAPHY_CONFIG.solo.activePresence
        : CHOREOGRAPHY_CONFIG.solo.inactivePresence;
      presenceB = isA
        ? CHOREOGRAPHY_CONFIG.solo.inactivePresence
        : CHOREOGRAPHY_CONFIG.solo.activePresence;
      opacityA = isA
        ? CHOREOGRAPHY_CONFIG.solo.activeOpacity
        : CHOREOGRAPHY_CONFIG.solo.inactiveOpacity;
      opacityB = isA
        ? CHOREOGRAPHY_CONFIG.solo.inactiveOpacity
        : CHOREOGRAPHY_CONFIG.solo.activeOpacity;
      rhythmA = isA ? CHOREOGRAPHY_CONFIG.solo.rhythm : 0;
      rhythmB = isA ? 0 : CHOREOGRAPHY_CONFIG.solo.rhythm;
    } else if (snapshot.state === 'JOIN') {
      const joinProgress = Math.min(
        1,
        snapshot.sharedTouchMs / Math.max(1, this.contactThresholdMs),
      );
      presenceA = 1;
      presenceB = 1;
      opacityA = VISUAL_THEME.hands.activeOpacity;
      opacityB = VISUAL_THEME.hands.activeOpacity;
      rhythmA = 0.72;
      rhythmB = 0.72;
      approach = lerp(
        CHOREOGRAPHY_CONFIG.join.approachStart,
        CHOREOGRAPHY_CONFIG.join.approachEnd,
        joinProgress,
      );
      alignment = lerp(
        CHOREOGRAPHY_CONFIG.join.alignmentStart,
        CHOREOGRAPHY_CONFIG.join.alignmentEnd,
        joinProgress,
      );
      gather = lerp(
        CHOREOGRAPHY_CONFIG.join.gatherStart,
        CHOREOGRAPHY_CONFIG.join.gatherEnd,
        joinProgress,
      );
      tension = lerp(
        CHOREOGRAPHY_CONFIG.join.tensionStart,
        CHOREOGRAPHY_CONFIG.join.tensionEnd,
        joinProgress,
      );
    } else if (snapshot.state === 'CONTACT') {
      presenceA = 1;
      presenceB = 1;
      opacityA = VISUAL_THEME.hands.activeOpacity;
      opacityB = VISUAL_THEME.hands.activeOpacity;
      rhythmA = 0.84;
      rhythmB = 0.84;
      approach = CHOREOGRAPHY_CONFIG.contact.approach;
      alignment = CHOREOGRAPHY_CONFIG.contact.alignment;
      gather = CHOREOGRAPHY_CONFIG.contact.gather;
      tension = CHOREOGRAPHY_CONFIG.contact.tension;
    } else if (snapshot.state === 'RESULT') {
      presenceA = 1;
      presenceB = 1;
      opacityA = VISUAL_THEME.hands.activeOpacity;
      opacityB = VISUAL_THEME.hands.activeOpacity;
      approach = CHOREOGRAPHY_CONFIG.resultPlaceholder.approach;
      alignment = CHOREOGRAPHY_CONFIG.resultPlaceholder.alignment;
      gather = CHOREOGRAPHY_CONFIG.resultPlaceholder.gather;
      tension = CHOREOGRAPHY_CONFIG.resultPlaceholder.tension;
    } else if (snapshot.state === 'RESET') {
      presenceA = 0;
      presenceB = 0;
      opacityA = 0;
      opacityB = 0;
    }

    const soloSpring = CHOREOGRAPHY_CONFIG.spring.solo;
    this.frame.handPresenceA = this.presenceA.update(presenceA, deltaSeconds, soloSpring);
    this.frame.handPresenceB = this.presenceB.update(presenceB, deltaSeconds, soloSpring);
    this.frame.handOpacityA = this.opacityA.update(opacityA, deltaSeconds, soloSpring);
    this.frame.handOpacityB = this.opacityB.update(opacityB, deltaSeconds, soloSpring);
    this.frame.soloRhythmA = this.rhythmA.update(rhythmA, deltaSeconds, soloSpring);
    this.frame.soloRhythmB = this.rhythmB.update(rhythmB, deltaSeconds, soloSpring);
    this.frame.approach = this.approach.update(
      approach,
      deltaSeconds,
      CHOREOGRAPHY_CONFIG.spring.approach,
    );
    this.frame.staffAlignment = this.alignment.update(
      alignment,
      deltaSeconds,
      CHOREOGRAPHY_CONFIG.spring.alignment,
    );
    this.frame.interstitialGather = this.gather.update(
      gather,
      deltaSeconds,
      CHOREOGRAPHY_CONFIG.spring.gather,
    );
    this.frame.tension = this.tension.update(
      tension,
      deltaSeconds,
      CHOREOGRAPHY_CONFIG.spring.tension,
    );
    this.frame.scenePresence = this.scenePresence.update(
      snapshot.state === 'RESET' ? 0.62 : 1,
      deltaSeconds,
      CHOREOGRAPHY_CONFIG.spring.gather,
    );
    this.frame.staffVisibility = this.staffVisibility.update(
      RESULT_CONFIG.staffVisibility[snapshot.state],
      deltaSeconds,
      CHOREOGRAPHY_CONFIG.spring.gather,
    );
    this.frame.contactProgress =
      snapshot.state === 'CONTACT'
        ? Math.min(1, snapshot.contactElapsedMs / Math.max(1, this.contactTransitionMs))
        : snapshot.state === 'RESULT' && snapshot.contactSnapshot !== null
          ? 1
          : 0;
    this.frame.idleAmbient = 1 - Math.max(
      this.frame.soloRhythmA * 0.48,
      this.frame.soloRhythmB * 0.48,
      this.frame.interstitialGather * 0.72,
    );
    return this.frame;
  }
}

function lerp(start: number, end: number, amount: number): number {
  return start + (end - start) * amount;
}
