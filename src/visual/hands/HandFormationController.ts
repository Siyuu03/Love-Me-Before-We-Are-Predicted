import type { ChoreographyFrame } from '../choreography/ChoreographyController';
import { VISUAL_THEME } from '../theme';

export interface HandFormationState {
  readonly formationA: number;
  readonly formationB: number;
  readonly opacityA: number;
  readonly opacityB: number;
}

export class HandFormationController {
  private formationA = VISUAL_THEME.hands.idleFormation;
  private formationB = VISUAL_THEME.hands.idleFormation;
  private opacityA = VISUAL_THEME.hands.idleOpacity;
  private opacityB = VISUAL_THEME.hands.idleOpacity;

  update(
    deltaSeconds: number,
    choreography: ChoreographyFrame,
  ): HandFormationState {
    this.formationA = this.dampFormation(
      this.formationA,
      choreography.handPresenceA,
      deltaSeconds,
    );
    this.formationB = this.dampFormation(
      this.formationB,
      choreography.handPresenceB,
      deltaSeconds,
    );
    this.opacityA = damp(
      this.opacityA,
      choreography.handOpacityA,
      VISUAL_THEME.hands.formationSpeed,
      deltaSeconds,
    );
    this.opacityB = damp(
      this.opacityB,
      choreography.handOpacityB,
      VISUAL_THEME.hands.formationSpeed,
      deltaSeconds,
    );

    return {
      formationA: this.formationA,
      formationB: this.formationB,
      opacityA: this.opacityA,
      opacityB: this.opacityB,
    };
  }

  private dampFormation(current: number, target: number, deltaSeconds: number): number {
    const speed =
      target > current
        ? VISUAL_THEME.hands.formationSpeed
        : VISUAL_THEME.hands.disintegrationSpeed;
    return damp(current, target, speed, deltaSeconds);
  }

}

function damp(current: number, target: number, speed: number, deltaSeconds: number): number {
  const blend = 1 - Math.exp(-speed * Math.max(0, deltaSeconds));
  return current + (target - current) * blend;
}
