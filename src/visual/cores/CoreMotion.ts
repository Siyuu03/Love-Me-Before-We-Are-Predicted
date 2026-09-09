import * as THREE from 'three';
import { ImprovedNoise } from 'three/examples/jsm/math/ImprovedNoise.js';
import type { ChoreographyFrame } from '../choreography/ChoreographyController';
import type { SharedMotionFrame } from '../motion/SharedMotionField';

interface MovingCore {
  readonly position: THREE.Vector3;
  readonly velocity: THREE.Vector3;
  readonly target: THREE.Vector3;
  readonly seed: number;
  readonly horizontalBias: number;
}

export class CoreMotion {
  private readonly noise = new ImprovedNoise();
  private readonly cores: readonly [MovingCore, MovingCore] = [
    {
      position: new THREE.Vector3(-0.64, -0.46, 0.18),
      velocity: new THREE.Vector3(),
      target: new THREE.Vector3(),
      seed: 13.71,
      horizontalBias: -0.43,
    },
    {
      position: new THREE.Vector3(0.64, -0.46, -0.04),
      velocity: new THREE.Vector3(),
      target: new THREE.Vector3(),
      seed: 47.29,
      horizontalBias: -0.46,
    },
  ];
  update(
    deltaSeconds: number,
    choreography: ChoreographyFrame,
    sharedMotion: SharedMotionFrame,
  ): readonly [THREE.Vector3, THREE.Vector3] {
    const safeDelta = Math.min(Math.max(deltaSeconds, 0), 0.1);
    let remaining = safeDelta;

    while (remaining > 0) {
      const step = Math.min(remaining, 1 / 60);
      this.integrateStep(step, choreography, sharedMotion);
      remaining -= step;
    }

    return [this.cores[0].position, this.cores[1].position];
  }

  captureVelocities(): readonly [THREE.Vector3, THREE.Vector3] {
    return [this.cores[0].velocity.clone(), this.cores[1].velocity.clone()];
  }

  private integrateStep(
    deltaSeconds: number,
    choreography: ChoreographyFrame,
    sharedMotion: SharedMotionFrame,
  ): void {
    const idleApproach = this.getIdleApproach(sharedMotion.globalTime)
      * choreography.idleAmbient;
    const distance = 0.64 - choreography.approach * 0.11 - idleApproach * 0.025;
    const rhythm = Math.max(choreography.soloRhythmA, choreography.soloRhythmB);
    const motionRange = 1 - choreography.tension * 0.58;

    this.cores.forEach((core, index) => {
      const direction = index === 0 ? -1 : 1;
      const participantRhythm = index === 0
        ? choreography.soloRhythmA
        : choreography.soloRhythmB;
      const target = core.target.set(
        direction * distance + this.fractalNoise(
          sharedMotion.globalTime,
          core.seed,
          0.041,
          0.055,
        ) * motionRange,
        core.horizontalBias +
          this.fractalNoise(sharedMotion.globalTime, core.seed + 8.3, 0.033, 0.12)
            * motionRange,
        this.fractalNoise(sharedMotion.globalTime, core.seed + 17.9, 0.027, 0.34)
          * motionRange,
      );

      const rhythmicAccent = Math.sin(
        sharedMotion.globalTime * (0.58 + index * 0.047) + core.seed,
      );
      target.y += (sharedMotion.slowBreath * 0.018
        + rhythmicAccent * participantRhythm * 0.022);
      target.z += sharedMotion.secondaryBreath * 0.025
        + sharedMotion.turbulence * 0.013;

      const stiffness = 1.18 + rhythm * 0.72 + choreography.approach * 0.84;
      const damping = 1.82 + rhythm * 0.34 + choreography.tension * 0.52;
      const acceleration = target
        .sub(core.position)
        .multiplyScalar(stiffness)
        .addScaledVector(core.velocity, -damping);

      core.velocity.addScaledVector(acceleration, deltaSeconds);
      core.position.addScaledVector(core.velocity, deltaSeconds);
    });
  }

  private fractalNoise(
    time: number,
    seed: number,
    frequency: number,
    amplitude: number,
  ): number {
    const primary = this.noise.noise(seed, time * frequency, 0.37);
    const secondary = this.noise.noise(seed * 0.41, time * frequency * 2.17, 4.83);
    return (primary + secondary * 0.34) * amplitude;
  }

  private getIdleApproach(time: number): number {
    const rawNoise = this.noise.noise(92.3, time * 0.009, 11.7);
    return THREE.MathUtils.smoothstep((rawNoise + 1) * 0.5, 0.63, 0.88);
  }

}
