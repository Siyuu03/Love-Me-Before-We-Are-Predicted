import * as THREE from 'three';
import { VISUAL_THEME } from '../theme';
import type {
  HandId,
  HandParticleSample,
  HandPointSource,
  HandSampleSet,
} from './HandPointSource';
import type { HandSemanticZone } from './HandSemanticZones';

type FingerPath = readonly THREE.Vector3[];

const FINGER_PATHS: readonly FingerPath[] = [
  [
    // Two visible thumb phalanges: carpometacarpal root, IP bend and tip.
    // The 0.38 path length is 59% of the middle-finger path and leaves the
    // palm obliquely instead of imitating a fifth long, parallel finger.
    new THREE.Vector3(-0.025, -0.205, -0.012),
    new THREE.Vector3(0.125, -0.31, 0.038),
    new THREE.Vector3(0.315, -0.345, 0.105),
  ],
  [
    new THREE.Vector3(0.18, -0.14, 0),
    new THREE.Vector3(0.39, -0.165, 0.035),
    new THREE.Vector3(0.59, -0.12, 0.09),
    new THREE.Vector3(0.72, -0.045, 0.15),
  ],
  [
    new THREE.Vector3(0.22, -0.025, 0),
    new THREE.Vector3(0.46, -0.055, 0.04),
    new THREE.Vector3(0.69, 0.005, 0.1),
    new THREE.Vector3(0.82, 0.075, 0.165),
  ],
  [
    new THREE.Vector3(0.2, 0.09, 0),
    new THREE.Vector3(0.43, 0.08, 0.05),
    new THREE.Vector3(0.62, 0.14, 0.12),
    new THREE.Vector3(0.72, 0.215, 0.19),
  ],
  [
    new THREE.Vector3(0.14, 0.215, 0),
    new THREE.Vector3(0.31, 0.215, 0.045),
    new THREE.Vector3(0.46, 0.275, 0.105),
    new THREE.Vector3(0.54, 0.355, 0.17),
  ],
];

export class ProceduralHandPointSource implements HandPointSource {
  createSamples(hand: HandId, density: number): HandSampleSet {
    const random = createSeededRandom(hand === 'A' ? 0xa713 : 0xb947);
    const particles: HandParticleSample[] = [];
    const direction = hand === 'A' ? 1 : -1;

    this.samplePalm(particles, random, density, direction, hand);
    this.sampleWrist(particles, random, density, direction, hand);
    this.sampleFingers(particles, random, density, direction, hand);

    return { hand, particles };
  }

  private samplePalm(
    particles: HandParticleSample[],
    random: () => number,
    density: number,
    direction: number,
    hand: HandId,
  ): void {
    const count = Math.round(VISUAL_THEME.hands.palmParticles * density);
    for (let index = 0; index < count; index += 1) {
      const radius = Math.sqrt(random());
      const angle = random() * Math.PI * 2;
      // A tapered oval gives the palm a clear trapezoidal volume without a
      // circular particle clump.
      const longitudinal = Math.cos(angle) * radius;
      const taper = 0.82 + (longitudinal + 1) * 0.09;
      const x = longitudinal * 0.305;
      const y = Math.sin(angle) * radius * 0.225 * taper;
      const surfaceBias = random() < 0.72 ? (random() < 0.5 ? -1 : 1) : random() * 2 - 1;
      const thickness = (1 - radius * radius * 0.58) * 0.072;
      const position = new THREE.Vector3(
        x * direction,
        y,
        surfaceBias * thickness * (hand === 'A' ? 1 : -1),
      );
      // Both participants contribute a real right hand. A small thenar-biased
      // subset joins the palm to the upward thumb root without changing the
      // overall particle budget or mirroring an already-finished hand object.
      if (random() < 0.17) {
        position.y = THREE.MathUtils.lerp(position.y, 0.145, 0.34);
        position.x = THREE.MathUtils.lerp(position.x, direction * 0.015, 0.16);
      }
      particles.push({
        position,
        emphasis: 0.28 + random() * 0.22,
        sizeVariation: 0.78 + random() * 0.34,
        traceBias: radius > 0.76 ? 0.55 + random() * 0.45 : random() * 0.13,
        zone: radius > 0.72 ? 'palmEdge' : 'palm',
      });
    }
  }

  private sampleWrist(
    particles: HandParticleSample[],
    random: () => number,
    density: number,
    direction: number,
    hand: HandId,
  ): void {
    const count = Math.round(VISUAL_THEME.hands.wristParticles * density);
    for (let index = 0; index < count; index += 1) {
      const along = random();
      const angle = random() * Math.PI * 2;
      // The wrist diameter remains 57–62% of the palm width near the palm and
      // only dissolves at its far end; it must never read as a thin wire.
      const radius = (0.105 + along * 0.032) * Math.sqrt(random());
      const position = new THREE.Vector3(
        THREE.MathUtils.lerp(-0.5, -0.19, along) * direction,
        Math.cos(angle) * radius,
        Math.sin(angle) * radius * 0.48 * (hand === 'A' ? 1 : -1),
      );
      particles.push({
        position,
        emphasis: 0.16 + along * 0.2,
        sizeVariation: 0.72 + random() * 0.3,
        traceBias: along < 0.34 ? 0.5 + random() * 0.45 : random() * 0.16,
        zone: 'wrist',
        wristT: along,
      });
    }
  }

  private sampleFingers(
    particles: HandParticleSample[],
    random: () => number,
    density: number,
    direction: number,
    hand: HandId,
  ): void {
    FINGER_PATHS.forEach((path, fingerIndex) => {
      const fingerZones: readonly HandSemanticZone[] = ['thumb', 'index', 'middle', 'ring', 'pinky'];
      const count = Math.round(VISUAL_THEME.hands.fingerParticles[fingerIndex] * density);
      for (let particleIndex = 0; particleIndex < count; particleIndex += 1) {
        const segmentCount = path.length - 1;
        const pathPosition = ((particleIndex + random()) / count) * segmentCount;
        const segment = Math.min(segmentCount - 1, Math.floor(pathPosition));
        const segmentT = pathPosition - segment;
        const center = path[segment].clone().lerp(path[segment + 1], segmentT);
        const tangent = path[segment + 1].clone().sub(path[segment]).normalize();
        const normalA = new THREE.Vector3(-tangent.y, tangent.x, 0).normalize();
        const normalB = new THREE.Vector3().crossVectors(tangent, normalA).normalize();
        const overallT = pathPosition / segmentCount;
        const tubeRadius = THREE.MathUtils.lerp(
          fingerIndex === 0 ? 0.048 : 0.037,
          fingerIndex === 0 ? 0.025 : 0.0155,
          overallT,
        );
        const ringAngle = random() * Math.PI * 2;
        const ringRadius = tubeRadius * Math.sqrt(random());
        center
          .addScaledVector(normalA, Math.cos(ringAngle) * ringRadius)
          .addScaledVector(normalB, Math.sin(ringAngle) * ringRadius * 0.72);
        this.orientRightHandForParticipant(center, direction, hand);

        particles.push({
          position: center,
          emphasis: 0.48 + overallT * 0.34 + random() * 0.08,
          sizeVariation: 0.78 + random() * 0.42,
          traceBias: overallT > 0.74 ? 0.58 + random() * 0.42 : random() * 0.12,
          zone: overallT > 0.82 ? 'fingertips' : fingerZones[fingerIndex],
          fingerIndex,
          fingerT: overallT,
        });
      }

      path.forEach((joint, jointIndex) => {
        const jointCount = Math.max(
          4,
          Math.round(VISUAL_THEME.hands.jointParticlesPerJoint * density),
        );
        for (let index = 0; index < jointCount; index += 1) {
          const point = joint.clone();
          const isTip = jointIndex === path.length - 1;
          const radius = (isTip ? 0.031 : fingerIndex === 0 ? 0.047 : 0.04)
            * Math.cbrt(random());
          const theta = random() * Math.PI * 2;
          const phi = Math.acos(2 * random() - 1);
          point.add(
            new THREE.Vector3(
              Math.sin(phi) * Math.cos(theta),
              Math.sin(phi) * Math.sin(theta),
              Math.cos(phi),
            ).multiplyScalar(radius),
          );
          this.orientRightHandForParticipant(point, direction, hand);
          particles.push({
            position: point,
            emphasis: isTip ? 1 : 0.72,
            sizeVariation: 0.9 + random() * 0.38,
            traceBias: isTip ? 0.82 + random() * 0.18 : random() * 0.2,
            zone: isTip ? 'fingertips' : jointIndex > 0 ? 'knuckles' : fingerZones[fingerIndex],
            fingerIndex,
            fingerT: jointIndex / (path.length - 1),
          });
        }
      });
    });
  }

  private orientRightHandForParticipant(
    position: THREE.Vector3,
    direction: number,
    hand: HandId,
  ): void {
    // This is not an object-level X mirror. Both sources use the right-hand
    // finger ordering (thumb above index, pinky below), then receive their own
    // inward and palm-depth basis. The left participant therefore supplies a
    // right hand seen from its opposite palm plane, rather than a false left
    // hand produced with scale.x = -1.
    position.x *= direction;
    position.y *= -1;
    if (hand === 'B') {
      position.z *= -1;
    }
  }
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
