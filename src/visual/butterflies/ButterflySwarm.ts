import * as THREE from 'three';
import { ImprovedNoise } from 'three/examples/jsm/math/ImprovedNoise.js';
import type { ChoreographyFrame } from '../choreography/ChoreographyController';
import type { SharedMotionFrame } from '../motion/SharedMotionField';
import { VISUAL_THEME } from '../theme';
import type { ResultLayer } from '../results/ResultLayer';
import type { ButterflyCapture } from '../results/ResultTypes';

export type ButterflyBehaviorState =
  | 'FLYING'
  | 'APPROACHING'
  | 'PERCHED'
  | 'TAKING_OFF';

type TargetHand = 'A' | 'B';

interface ButterflyAgent {
  readonly position: THREE.Vector3;
  readonly velocity: THREE.Vector3;
  readonly acceleration: THREE.Vector3;
  readonly idleHome: THREE.Vector3;
  readonly target: THREE.Vector3;
  readonly takeOffTarget: THREE.Vector3;
  readonly seed: number;
  readonly scale: number;
  state: ButterflyBehaviorState;
  stateElapsed: number;
  stateDuration: number;
  targetHand: TargetHand;
  perchIndex: number;
  visibility: number;
}

const vertexShader = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uFlapAmplitude;
  uniform float uSlowBreath;
  uniform float uContactPulse;

  attribute float aWingSide;
  attribute float aWingKind;
  attribute float aEdgeFactor;
  attribute float aWingPhase;
  attribute float aWingSpeed;
  attribute float aInstanceOpacity;
  attribute float aVisibility;
  attribute vec3 aEdgeColor;

  varying float vOpacity;
  varying float vEdge;
  varying float vWing;
  varying float vFragility;
  varying vec3 vEdgeColor;

  void main() {
    vec3 transformed = position;
    float isWing = step(0.5, abs(aWingSide));
    float isLowerWing = step(1.5, aWingKind);
    float flap = sin(uTime * aWingSpeed + aWingPhase + isLowerWing * 0.47)
      * uFlapAmplitude * mix(1.0, 0.72, isLowerWing);
    float originalX = transformed.x;
    transformed.x = mix(originalX, originalX * cos(flap), isWing);
    transformed.z += isWing * abs(originalX) * sin(flap);
    vec4 worldPosition = instanceMatrix * vec4(transformed, 1.0);
    gl_Position = projectionMatrix * modelViewMatrix * worldPosition;
    vOpacity = aInstanceOpacity * aVisibility;
    vEdge = aEdgeFactor;
    vWing = isWing;
    vFragility = mix(1.0, 0.12 + abs(cos(flap)) * 0.88, isWing);
    vEdgeColor = aEdgeColor;
  }
`;

const fragmentShader = /* glsl */ `
  precision highp float;

  uniform vec3 uCoreColor;
  uniform float uGlobalOpacity;

  varying float vOpacity;
  varying float vEdge;
  varying float vWing;
  varying float vFragility;
  varying vec3 vEdgeColor;

  void main() {
    float wingInterior = mix(0.82, 0.16, vWing);
    float edgeTransmission = mix(wingInterior, 0.72, vEdge);
    float alpha = vOpacity * (0.5 + uGlobalOpacity) * edgeTransmission * vFragility;
    vec3 filmColor = mix(vEdgeColor, uCoreColor, 0.18 + vEdge * 0.56);
    filmColor = mix(filmColor, vec3(0.72, 0.76, 0.78), vWing * 0.16);
    gl_FragColor = vec4(filmColor * (0.62 + vEdge * 0.2), min(0.58, alpha));
  }
`;

export class ButterflySwarm {
  readonly object3d: THREE.InstancedMesh;
  readonly instanceCount = VISUAL_THEME.butterflies.count;
  private readonly geometry = createButterflyGeometry();
  private readonly material: THREE.ShaderMaterial;
  private readonly agents: ButterflyAgent[] = [];
  private readonly dummy = new THREE.Object3D();
  private readonly noise = new ImprovedNoise();
  private readonly visibilityValues = new Float32Array(this.instanceCount);
  private readonly visibilityAttribute: THREE.InstancedBufferAttribute;
  private globalOpacity = VISUAL_THEME.butterflies.idleOpacity;

  constructor() {
    const random = createSeededRandom(0xb17f);
    const phases = new Float32Array(this.instanceCount);
    const speeds = new Float32Array(this.instanceCount);
    const opacities = new Float32Array(this.instanceCount);
    const edgeColors = new Float32Array(this.instanceCount * 3);

    for (let index = 0; index < this.instanceCount; index += 1) {
      phases[index] = random() * Math.PI * 2;
      speeds[index] = THREE.MathUtils.lerp(
        VISUAL_THEME.butterflies.speedMin,
        VISUAL_THEME.butterflies.speedMax,
        random(),
      );
      opacities[index] = 0.34 + random() * 0.12;
      this.visibilityValues[index] = index < VISUAL_THEME.butterflies.idleVisibleCount ? 1 : 0;
      const edgeColor = new THREE.Color(
        VISUAL_THEME.butterflies.edgeColors[
          Math.floor(random() * VISUAL_THEME.butterflies.edgeColors.length)
        ],
      );
      edgeColor.toArray(edgeColors, index * 3);
    }

    this.geometry.setAttribute('aWingPhase', new THREE.InstancedBufferAttribute(phases, 1));
    this.geometry.setAttribute('aWingSpeed', new THREE.InstancedBufferAttribute(speeds, 1));
    this.geometry.setAttribute(
      'aInstanceOpacity',
      new THREE.InstancedBufferAttribute(opacities, 1),
    );
    this.visibilityAttribute = new THREE.InstancedBufferAttribute(
      this.visibilityValues,
      1,
    );
    this.visibilityAttribute.setUsage(THREE.DynamicDrawUsage);
    this.geometry.setAttribute('aVisibility', this.visibilityAttribute);
    this.geometry.setAttribute(
      'aEdgeColor',
      new THREE.InstancedBufferAttribute(edgeColors, 3),
    );

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uFlapAmplitude: { value: VISUAL_THEME.butterflies.flapAmplitude },
        uSlowBreath: { value: 0 },
        uContactPulse: { value: 0 },
        uCoreColor: { value: new THREE.Color(VISUAL_THEME.butterflies.coreColor) },
        uGlobalOpacity: { value: VISUAL_THEME.butterflies.idleOpacity },
      },
      vertexShader,
      fragmentShader,
      transparent: true,
      depthTest: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.NormalBlending,
      toneMapped: false,
    });

    this.object3d = new THREE.InstancedMesh(
      this.geometry,
      this.material,
      this.instanceCount,
    );
    this.object3d.name = 'MirrorButterflySwarm';
    this.object3d.frustumCulled = false;
    this.object3d.renderOrder = 3;
    this.createAgents(random);
    this.updateInstanceMatrices(0);
  }

  update(
    deltaSeconds: number,
    choreography: ChoreographyFrame,
    sharedMotion: SharedMotionFrame,
    result: ResultLayer,
  ): void {
    const safeDelta = Math.min(Math.max(deltaSeconds, 0), 0.1);
    const targetOpacity = this.getTargetOpacity(choreography) * result.butterflyOpacity;
    const opacityBlend = 1 - Math.exp(-VISUAL_THEME.butterflies.opacitySpeed * safeDelta);
    this.globalOpacity = THREE.MathUtils.lerp(
      this.globalOpacity,
      targetOpacity,
      opacityBlend,
    );

    this.agents.forEach((agent, index) => {
      agent.stateElapsed += safeDelta;
      const activeVisibility = index < VISUAL_THEME.butterflies.idleVisibleCount
        ? 1
        : Math.min(
            1,
            Math.max(
              choreography.soloRhythmA,
              choreography.soloRhythmB,
              choreography.interstitialGather,
            ) * 1.8,
          );
      agent.visibility = damp(agent.visibility, activeVisibility, 1.4, safeDelta);
      this.visibilityValues[index] = agent.visibility;
      this.updateBehavior(agent, index, safeDelta, choreography, sharedMotion);
      agent.target.add(result.butterflyForce);
      if (result.butterflyScatter > 0) {
        agent.target.x += Math.sign(agent.idleHome.x || 1) * result.butterflyScatter * 0.34;
        agent.target.z += Math.sin(agent.seed) * result.butterflyScatter * 0.22;
      }
    });

    this.material.uniforms.uTime.value = sharedMotion.globalTime;
    this.material.uniforms.uSlowBreath.value = sharedMotion.slowBreath;
    this.material.uniforms.uContactPulse.value = sharedMotion.contactPulse;
    this.material.uniforms.uGlobalOpacity.value = this.globalOpacity;
    this.visibilityAttribute.needsUpdate = true;
    this.updateInstanceMatrices(sharedMotion.globalTime);
  }

  getBehaviorCounts(): Readonly<Record<ButterflyBehaviorState, number>> {
    const counts: Record<ButterflyBehaviorState, number> = {
      FLYING: 0,
      APPROACHING: 0,
      PERCHED: 0,
      TAKING_OFF: 0,
    };
    this.agents.forEach((agent) => {
      counts[agent.state] += 1;
    });
    return counts;
  }

  captureState(): readonly ButterflyCapture[] {
    return this.agents.map((agent) => Object.freeze({
      position: agent.position.clone(), velocity: agent.velocity.clone(), state: agent.state,
      perchIndex: agent.perchIndex,
    }));
  }

  positionsAreFinite(): boolean {
    return this.agents.every((agent) =>
      Number.isFinite(agent.position.x)
      && Number.isFinite(agent.position.y)
      && Number.isFinite(agent.position.z));
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }

  private createAgents(random: () => number): void {
    const spread = VISUAL_THEME.butterflies.idleSpread;
    for (let index = 0; index < this.instanceCount; index += 1) {
      const side = index % 2 === 0 ? -1 : 1;
      const staffBands = [-0.45, 0.24, 1.02] as const;
      const idleHome = new THREE.Vector3(
        side * THREE.MathUtils.lerp(1.4, spread[0], random()),
        staffBands[index % staffBands.length] + (random() * 2 - 1) * 0.34,
        THREE.MathUtils.lerp(-spread[2] - 0.4, 0.12, random()),
      );
      this.agents.push({
        position: idleHome.clone(),
        velocity: new THREE.Vector3(),
        acceleration: new THREE.Vector3(),
        idleHome,
        target: idleHome.clone(),
        takeOffTarget: idleHome.clone(),
        seed: random() * 83 + index * 7.31,
        scale: 0.82 + random() * 0.38,
        state: 'FLYING',
        stateElapsed: random() * 5,
        stateDuration: 3 + random() * 4,
        targetHand: index % 2 === 0 ? 'A' : 'B',
        perchIndex: index % 4,
        visibility: this.visibilityValues[index],
      });
    }
  }

  private updateBehavior(
    agent: ButterflyAgent,
    index: number,
    deltaSeconds: number,
    choreography: ChoreographyFrame,
    sharedMotion: SharedMotionFrame,
  ): void {
    if (sharedMotion.resetProgress > 0 && agent.state !== 'FLYING') {
      this.beginTakeOff(agent, sharedMotion);
    }

    if (agent.state === 'FLYING') {
      this.setFlyingTarget(agent, index, choreography, sharedMotion);
      const interestA = choreography.soloRhythmA * 0.72
        + choreography.interstitialGather * 0.58;
      const interestB = choreography.soloRhythmB * 0.72
        + choreography.interstitialGather * 0.58;
      const threshold = 0.28 + fract(agent.seed * 0.137) * 0.42;
      if (agent.stateElapsed > agent.stateDuration && Math.max(interestA, interestB) > threshold) {
        agent.targetHand = interestA > interestB ? 'A' : interestB > interestA ? 'B' : agent.targetHand;
        if (this.countPerched(agent.targetHand) < VISUAL_THEME.butterflies.maxPerchedPerHand) {
          agent.perchIndex = (index + Math.floor(agent.seed)) % 4;
          agent.state = 'APPROACHING';
          agent.stateElapsed = 0;
          agent.stateDuration = rangeFromSeed(
            agent.seed,
            VISUAL_THEME.butterflies.approachSeconds,
          );
        }
      }
    } else if (agent.state === 'APPROACHING') {
      this.setApproachTarget(agent, sharedMotion);
      if (agent.stateElapsed >= agent.stateDuration) {
        if (this.countPerched(agent.targetHand) < VISUAL_THEME.butterflies.maxPerchedPerHand) {
          agent.state = 'PERCHED';
          agent.stateElapsed = 0;
          agent.stateDuration = rangeFromSeed(
            agent.seed * 1.73,
            VISUAL_THEME.butterflies.perchSeconds,
          );
        } else {
          agent.state = 'FLYING';
          agent.stateElapsed = 0;
          agent.stateDuration = 2.5;
        }
      }
    } else if (agent.state === 'PERCHED') {
      const perch = this.getPerchPoint(agent, sharedMotion);
      agent.target.copy(perch);
      if (
        agent.stateElapsed >= agent.stateDuration
        || (sharedMotion.contactPulse > 0.55 && index % 3 !== 0)
      ) {
        this.beginTakeOff(agent, sharedMotion);
      }
    } else {
      agent.target.copy(agent.takeOffTarget);
      agent.target.y += sharedMotion.slowBreath * 0.08;
      if (agent.stateElapsed >= agent.stateDuration) {
        agent.state = 'FLYING';
        agent.stateElapsed = 0;
        agent.stateDuration = 2.8 + fract(agent.seed * 0.43) * 4.2;
      }
    }

    const stiffness = agent.state === 'PERCHED'
      ? 7.2
      : agent.state === 'APPROACHING'
        ? 2.2
        : VISUAL_THEME.butterflies.motionStiffness;
    const damping = agent.state === 'PERCHED'
      ? 4.8
      : agent.state === 'APPROACHING'
        ? 2.3
        : VISUAL_THEME.butterflies.motionDamping;
    agent.acceleration.copy(agent.target)
      .sub(agent.position)
      .multiplyScalar(stiffness)
      .addScaledVector(agent.velocity, -damping);
    agent.velocity.addScaledVector(agent.acceleration, deltaSeconds);
    agent.position.addScaledVector(agent.velocity, deltaSeconds);
  }

  private setFlyingTarget(
    agent: ButterflyAgent,
    index: number,
    choreography: ChoreographyFrame,
    sharedMotion: SharedMotionFrame,
  ): void {
    const time = sharedMotion.globalTime;
    const speedOffset = 0.018 + (index % 5) * 0.0031;
    agent.target.copy(agent.idleHome);
    agent.target.x += this.noise.noise(agent.seed, time * speedOffset, 0.7) * 0.46;
    agent.target.y += this.noise.noise(agent.seed + 17.3, time * speedOffset * 1.17, 4.1)
      * 0.34 + sharedMotion.slowBreath * 0.07;
    agent.target.z += this.noise.noise(agent.seed + 31.9, time * speedOffset * 0.83, 8.7)
      * 0.42;
    const sharedInfluence = choreography.interstitialGather * 0.42;
    agent.target.lerp(sharedMotion.sharedCenter, sharedInfluence);
    agent.target.z += Math.sin(agent.seed + time * 0.09) * 0.18;
  }

  private setApproachTarget(
    agent: ButterflyAgent,
    sharedMotion: SharedMotionFrame,
  ): void {
    const perch = this.getPerchPoint(agent, sharedMotion);
    const progress = Math.min(1, agent.stateElapsed / Math.max(0.01, agent.stateDuration));
    agent.target.copy(perch);
    const direction = agent.targetHand === 'A' ? -1 : 1;
    agent.target.x += direction * Math.sin(progress * Math.PI) * 0.22;
    agent.target.y += Math.sin(progress * Math.PI) * 0.18;
    agent.target.z += Math.sin(progress * Math.PI) * 0.28;
  }

  private getPerchPoint(
    agent: ButterflyAgent,
    sharedMotion: SharedMotionFrame,
  ): THREE.Vector3 {
    return agent.targetHand === 'A'
      ? sharedMotion.perchPointsA[agent.perchIndex]
      : sharedMotion.perchPointsB[agent.perchIndex];
  }

  private beginTakeOff(agent: ButterflyAgent, sharedMotion: SharedMotionFrame): void {
    const direction = agent.targetHand === 'A' ? -1 : 1;
    agent.state = 'TAKING_OFF';
    agent.stateElapsed = 0;
    agent.stateDuration = rangeFromSeed(
      agent.seed * 2.11,
      VISUAL_THEME.butterflies.takeOffSeconds,
    );
    agent.takeOffTarget.copy(agent.idleHome);
    agent.takeOffTarget.x += direction * 0.42;
    agent.takeOffTarget.y += 0.34 + sharedMotion.secondaryBreath * 0.08;
    agent.takeOffTarget.z -= 0.28;
  }

  private countPerched(hand: TargetHand): number {
    let count = 0;
    this.agents.forEach((agent) => {
      if (agent.state === 'PERCHED' && agent.targetHand === hand) count += 1;
    });
    return count;
  }

  private updateInstanceMatrices(globalTime: number): void {
    this.agents.forEach((agent, index) => {
      this.dummy.position.copy(agent.position);
      const perched = agent.state === 'PERCHED';
      this.dummy.rotation.set(
        perched ? -0.18 : Math.sin(globalTime * 0.17 + agent.seed) * 0.16,
        Math.cos(globalTime * 0.13 + agent.seed * 0.4) * (perched ? 0.08 : 0.2),
        perched ? (agent.targetHand === 'A' ? -0.12 : 0.12)
          : Math.atan2(agent.velocity.y, agent.velocity.x) * 0.25,
      );
      const scale = VISUAL_THEME.butterflies.size * agent.scale * agent.visibility;
      this.dummy.scale.setScalar(scale);
      this.dummy.updateMatrix();
      this.object3d.setMatrixAt(index, this.dummy.matrix);
    });
    this.object3d.instanceMatrix.needsUpdate = true;
  }

  private getTargetOpacity(choreography: ChoreographyFrame): number {
    const solo = Math.max(choreography.soloRhythmA, choreography.soloRhythmB);
    const soloOpacity = THREE.MathUtils.lerp(
      VISUAL_THEME.butterflies.idleOpacity,
      VISUAL_THEME.butterflies.soloOpacity,
      solo,
    );
    return THREE.MathUtils.lerp(
      soloOpacity,
      VISUAL_THEME.butterflies.joinOpacity,
      choreography.interstitialGather,
    ) * choreography.scenePresence;
  }
}

function createButterflyGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  const positions: number[] = [];
  const sides: number[] = [];
  const kinds: number[] = [];
  const edges: number[] = [];

  appendWing(positions, sides, kinds, edges, 1, 1, [
    [0.04, 0.05], [0.18, 0.13], [0.43, 0.38], [0.72, 0.31],
    [0.82, 0.08], [0.63, -0.08], [0.29, -0.03],
  ]);
  appendWing(positions, sides, kinds, edges, -1, 1, [
    [-0.04, 0.05], [-0.2, 0.12], [-0.46, 0.35], [-0.75, 0.27],
    [-0.8, 0.02], [-0.59, -0.1], [-0.27, -0.04],
  ]);
  appendWing(positions, sides, kinds, edges, 1, 2, [
    [0.03, -0.03], [0.16, -0.05], [0.43, -0.14], [0.52, -0.37],
    [0.31, -0.52], [0.11, -0.28],
  ]);
  appendWing(positions, sides, kinds, edges, -1, 2, [
    [-0.03, -0.03], [-0.15, -0.06], [-0.4, -0.16], [-0.48, -0.4],
    [-0.27, -0.5], [-0.1, -0.26],
  ]);
  appendBody(positions, sides, kinds, edges);

  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('aWingSide', new THREE.Float32BufferAttribute(sides, 1));
  geometry.setAttribute('aWingKind', new THREE.Float32BufferAttribute(kinds, 1));
  geometry.setAttribute('aEdgeFactor', new THREE.Float32BufferAttribute(edges, 1));
  return geometry;
}

function appendWing(
  positions: number[],
  sides: number[],
  kinds: number[],
  edges: number[],
  side: -1 | 1,
  kind: 1 | 2,
  outline: readonly (readonly [number, number])[],
): void {
  for (let index = 1; index < outline.length - 1; index += 1) {
    pushButterflyVertex(positions, sides, kinds, edges, outline[0], side, kind, 0.12);
    pushButterflyVertex(positions, sides, kinds, edges, outline[index], side, kind, 1);
    pushButterflyVertex(positions, sides, kinds, edges, outline[index + 1], side, kind, 1);
  }
}

function appendBody(
  positions: number[],
  sides: number[],
  kinds: number[],
  edges: number[],
): void {
  const body = [
    [-0.035, 0.36], [0.035, 0.36], [0.045, -0.25],
    [-0.045, 0.36], [0.045, -0.25], [0, -0.42],
    [-0.07, 0.37], [0, 0.47], [0.07, 0.37],
  ] as const;
  body.forEach((point) => pushButterflyVertex(positions, sides, kinds, edges, point, 0, 0, 1));
}

function pushButterflyVertex(
  positions: number[],
  sides: number[],
  kinds: number[],
  edges: number[],
  point: readonly [number, number],
  side: number,
  kind: number,
  edge: number,
): void {
  positions.push(point[0], point[1], kind === 0 ? 0.025 : 0);
  sides.push(side);
  kinds.push(kind);
  edges.push(edge);
}

function damp(current: number, target: number, speed: number, deltaSeconds: number): number {
  return current + (target - current) * (1 - Math.exp(-speed * deltaSeconds));
}

function fract(value: number): number {
  return value - Math.floor(value);
}

function rangeFromSeed(seed: number, range: readonly [number, number]): number {
  return THREE.MathUtils.lerp(range[0], range[1], fract(Math.sin(seed) * 43758.5453));
}

function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
