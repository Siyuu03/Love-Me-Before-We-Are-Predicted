import * as THREE from 'three';
import type { InstallationState, ResultId } from '../../core/types';
import type { ChoreographyFrame } from '../choreography/ChoreographyController';
import type { SharedMotionFrame } from '../motion/SharedMotionField';
import type { ResultLayer } from '../results/ResultLayer';
import { VISUAL_THEME } from '../theme';

const NODE_STRIDE = 3;
const EDGE_STRIDE = 2;
const LEFT = -1;
const CENTER = 0;
const RIGHT = 1;

const lineVertexShader = /* glsl */ `
  precision highp float;
  attribute vec3 aColor;
  attribute float aAlpha;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vColor = aColor;
    vAlpha = aAlpha;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const lineFragmentShader = /* glsl */ `
  precision highp float;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    gl_FragColor = vec4(vColor, vAlpha);
  }
`;

const fiberPointVertexShader = /* glsl */ `
  precision highp float;
  uniform float uViewportHeight;
  attribute vec3 aColor;
  attribute float aAlpha;
  attribute float aNode;
  varying vec3 vColor;
  varying float vAlpha;
  varying float vNode;
  void main() {
    vColor = aColor;
    vAlpha = aAlpha;
    vNode = aNode;
    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = clamp(
      (0.68 + aNode * 0.82) * uViewportHeight / max(1.0, -viewPosition.z) * 0.0055,
      0.72,
      2.15
    );
    gl_Position = projectionMatrix * viewPosition;
  }
`;

const fiberPointFragmentShader = /* glsl */ `
  precision highp float;
  varying vec3 vColor;
  varying float vAlpha;
  varying float vNode;
  void main() {
    vec2 p = gl_PointCoord - vec2(0.5);
    float core = 1.0 - smoothstep(0.035, 0.18, length(p));
    float horizontalFiber = exp(-abs(p.y) * 32.0) * (1.0 - smoothstep(0.08, 0.5, abs(p.x)));
    float verticalFiber = exp(-abs(p.x) * 46.0) * (1.0 - smoothstep(0.05, 0.34, abs(p.y)));
    float shape = max(core, horizontalFiber * 0.42 + verticalFiber * vNode * 0.22);
    if (shape < 0.015) discard;
    gl_FragColor = vec4(vColor, shape * vAlpha);
  }
`;

const mirrorVertexShader = /* glsl */ `
  precision highp float;
  uniform float uTime;
  attribute float aMirrorSeed;
  attribute float aMirrorSide;
  varying vec2 vUv;
  varying float vSeed;
  varying float vSide;
  varying float vMotion;
  void main() {
    vUv = uv;
    vSeed = aMirrorSeed;
    vSide = aMirrorSide;
    vec4 local = instanceMatrix * vec4(position, 1.0);
    float sway = sin(uTime * (0.09 + fract(aMirrorSeed) * 0.035) + aMirrorSeed * 5.7);
    local.x += sway * 0.008;
    local.y += cos(uTime * 0.07 + aMirrorSeed * 3.9) * 0.006;
    local.z += sway * 0.022;
    vMotion = 0.5 + 0.5 * sway;
    gl_Position = projectionMatrix * modelViewMatrix * local;
  }
`;

const mirrorFragmentShader = /* glsl */ `
  precision highp float;
  uniform float uPresence;
  varying vec2 vUv;
  varying float vSeed;
  varying float vSide;
  varying float vMotion;
  void main() {
    vec2 p = vUv - vec2(0.5);
    p.x += p.y * (0.18 + fract(vSeed * 7.0) * 0.14);
    float shard = max(abs(p.y) * 1.28, abs(p.x) * 0.72 + abs(p.y) * 0.34);
    if (shard > 0.39) discard;
    float reflection = exp(-abs(p.x + p.y * 0.31 - sin(vSeed * 8.0) * 0.12) * 24.0);
    float brokenEdge = smoothstep(0.29, 0.39, shard)
      * smoothstep(0.22, 0.72, fract(vSeed * 9.0 + p.y * 1.7));
    vec3 cold = vec3(0.31, 0.46, 0.58);
    vec3 warm = vec3(0.58, 0.39, 0.48);
    vec3 color = mix(cold, warm, step(0.0, vSide));
    color = mix(color, vec3(0.72, 0.76, 0.77), reflection * 0.38);
    float alpha = (brokenEdge * 0.045 + reflection * 0.075 + 0.008)
      * uPresence * (0.62 + vMotion * 0.38);
    gl_FragColor = vec4(color, alpha);
  }
`;

const enum EdgeKind {
  Machine = 0,
  Fibre = 1,
  Bridge = 2,
  MisreadEcho = 3,
  UnreadableAttempt = 4,
  MachineArc = 5,
}

interface WeaveGraph {
  readonly nodes: Float32Array;
  readonly nodeSides: Int8Array;
  readonly nodeSeeds: Float32Array;
  readonly edges: Uint16Array;
  readonly edgeKinds: Uint8Array;
  readonly edgeWeights: Float32Array;
  readonly degrees: Uint8Array;
}

interface WeaveChannels {
  machine: number;
  fibre: number;
  bridge: number;
  collision: number;
  softMerge: number;
  desire: number;
  misreading: number;
  refusal: number;
  unreadable: number;
}

interface PointBinding {
  readonly edge: number;
  readonly amount: number;
  readonly seed: number;
  readonly node: number;
}

export class InstallationWeaveField {
  readonly object3d = new THREE.Group();
  readonly segmentCount: number;
  readonly particleCount: number;
  readonly minimumNodeDegree: number;

  private readonly graph = createInstallationGraph();
  private readonly nodeCurrent = new Float32Array(this.graph.nodes.length);
  private readonly lineGeometry = new THREE.BufferGeometry();
  private readonly linePositions: Float32Array;
  private readonly lineColors: Float32Array;
  private readonly lineAlpha: Float32Array;
  private readonly lineMaterial: THREE.ShaderMaterial;
  private readonly pointGeometry = new THREE.BufferGeometry();
  private readonly pointPositions: Float32Array;
  private readonly pointColors: Float32Array;
  private readonly pointAlpha: Float32Array;
  private readonly pointBindings: readonly PointBinding[];
  private readonly pointMaterial: THREE.ShaderMaterial;
  private readonly mirrorGeometry: THREE.PlaneGeometry;
  private readonly mirrorMaterial: THREE.ShaderMaterial;
  private readonly channels: WeaveChannels = {
    machine: 0.72,
    fibre: 0.06,
    bridge: 0.17,
    collision: 0,
    softMerge: 0,
    desire: 0,
    misreading: 0,
    refusal: 0,
    unreadable: 0,
  };
  private readonly targets: WeaveChannels = { ...this.channels };

  constructor() {
    this.segmentCount = this.graph.edges.length / EDGE_STRIDE;
    this.minimumNodeDegree = Math.min(...this.graph.degrees);
    if (this.minimumNodeDegree < 2) {
      throw new Error('Installation weave contains an isolated anchor');
    }

    this.linePositions = new Float32Array(this.segmentCount * 6);
    this.lineColors = new Float32Array(this.segmentCount * 6);
    this.lineAlpha = new Float32Array(this.segmentCount * 2);
    this.lineGeometry.setAttribute('position', new THREE.BufferAttribute(this.linePositions, 3));
    this.lineGeometry.setAttribute('aColor', new THREE.BufferAttribute(this.lineColors, 3));
    this.lineGeometry.setAttribute('aAlpha', new THREE.BufferAttribute(this.lineAlpha, 1));
    this.lineMaterial = new THREE.ShaderMaterial({
      vertexShader: lineVertexShader,
      fragmentShader: lineFragmentShader,
      transparent: true,
      depthTest: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
      toneMapped: false,
    });
    const lines = new THREE.LineSegments(this.lineGeometry, this.lineMaterial);
    lines.name = 'InstallationWeaveLines';
    lines.frustumCulled = false;
    lines.renderOrder = -4;

    this.pointBindings = createPointBindings(this.graph);
    this.particleCount = this.pointBindings.length;
    this.pointPositions = new Float32Array(this.particleCount * 3);
    this.pointColors = new Float32Array(this.particleCount * 3);
    this.pointAlpha = new Float32Array(this.particleCount);
    const nodeFlags = new Float32Array(this.particleCount);
    this.pointBindings.forEach((binding, index) => { nodeFlags[index] = binding.node; });
    this.pointGeometry.setAttribute('position', new THREE.BufferAttribute(this.pointPositions, 3));
    this.pointGeometry.setAttribute('aColor', new THREE.BufferAttribute(this.pointColors, 3));
    this.pointGeometry.setAttribute('aAlpha', new THREE.BufferAttribute(this.pointAlpha, 1));
    this.pointGeometry.setAttribute('aNode', new THREE.BufferAttribute(nodeFlags, 1));
    this.pointMaterial = new THREE.ShaderMaterial({
      uniforms: { uViewportHeight: { value: 1080 } },
      vertexShader: fiberPointVertexShader,
      fragmentShader: fiberPointFragmentShader,
      transparent: true,
      depthTest: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
      toneMapped: false,
    });
    const points = new THREE.Points(this.pointGeometry, this.pointMaterial);
    points.name = 'InstallationWeaveKnotsAndFibres';
    points.frustumCulled = false;
    points.renderOrder = -3;

    this.mirrorGeometry = new THREE.PlaneGeometry(1, 1);
    const mirrorSeeds = new Float32Array(VISUAL_THEME.installationWeave.mirrorCount);
    const mirrorSides = new Float32Array(VISUAL_THEME.installationWeave.mirrorCount);
    this.mirrorGeometry.setAttribute('aMirrorSeed', new THREE.InstancedBufferAttribute(mirrorSeeds, 1));
    this.mirrorGeometry.setAttribute('aMirrorSide', new THREE.InstancedBufferAttribute(mirrorSides, 1));
    this.mirrorMaterial = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uPresence: { value: 0.35 } },
      vertexShader: mirrorVertexShader,
      fragmentShader: mirrorFragmentShader,
      transparent: true,
      depthTest: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
      toneMapped: false,
      side: THREE.DoubleSide,
    });
    const mirrors = new THREE.InstancedMesh(
      this.mirrorGeometry,
      this.mirrorMaterial,
      VISUAL_THEME.installationWeave.mirrorCount,
    );
    mirrors.name = 'SuspendedMirrorAcrylicFragments';
    mirrors.frustumCulled = false;
    mirrors.renderOrder = -2;
    this.populateMirrorMatrices(mirrors, mirrorSeeds, mirrorSides);

    this.object3d.name = 'InstallationWeaveField';
    this.object3d.add(lines, points, mirrors);
  }

  update(
    deltaSeconds: number,
    shared: SharedMotionFrame,
    choreography: ChoreographyFrame,
    result: ResultLayer,
    state: InstallationState,
    resultHint: ResultId | null,
  ): void {
    this.setTargets(state, choreography, result.resultId ?? resultHint);
    const transitionSeconds = state === 'RESET'
      ? VISUAL_THEME.installationWeave.resetTransitionSeconds
      : VISUAL_THEME.installationWeave.transitionSeconds;
    const blend = 1 - Math.exp(-Math.max(0, deltaSeconds) / transitionSeconds);
    (Object.keys(this.channels) as (keyof WeaveChannels)[]).forEach((key) => {
      this.channels[key] += (this.targets[key] - this.channels[key]) * blend;
    });
    this.updateNodes(shared);
    this.updateLines(shared);
    this.updateParticles(shared);
    this.mirrorMaterial.uniforms.uTime.value = shared.globalTime;
    this.mirrorMaterial.uniforms.uPresence.value = 0.2
      + this.channels.fibre * 0.38
      + this.channels.softMerge * 0.12;
  }

  setViewportHeight(viewportHeight: number): void {
    this.pointMaterial.uniforms.uViewportHeight.value = viewportHeight;
  }

  dispose(): void {
    this.lineGeometry.dispose();
    this.lineMaterial.dispose();
    this.pointGeometry.dispose();
    this.pointMaterial.dispose();
    this.mirrorGeometry.dispose();
    this.mirrorMaterial.dispose();
    this.object3d.clear();
  }

  private setTargets(
    state: InstallationState,
    choreography: ChoreographyFrame,
    visualResult: ResultId | null,
  ): void {
    this.targets.collision = 0;
    this.targets.softMerge = 0;
    this.targets.desire = 0;
    this.targets.misreading = 0;
    this.targets.refusal = 0;
    this.targets.unreadable = 0;
    if (state === 'RESET') {
      this.targets.machine = 0.74;
      this.targets.fibre = 0.055;
      this.targets.bridge = 0.16;
      return;
    }
    if (!visualResult) {
      const participating = state !== 'IDLE';
      this.targets.machine = participating ? 0.68 : 0.72;
      this.targets.fibre = participating ? 0.11 : 0.055;
      this.targets.bridge = participating
        ? 0.2 + choreography.interstitialGather * 0.12
        : 0.16;
      return;
    }
    if (visualResult === 'collision') {
      this.targets.machine = 0.94; this.targets.fibre = 0.12; this.targets.bridge = 0.28;
      this.targets.collision = 1;
    } else if (visualResult === 'soft-merge') {
      this.targets.machine = 0.48; this.targets.fibre = 0.96; this.targets.bridge = 0.82;
      this.targets.softMerge = 1;
    } else if (visualResult === 'desire') {
      this.targets.machine = 0.51; this.targets.fibre = 0.82; this.targets.bridge = 0.56;
      this.targets.desire = 1;
    } else if (visualResult === 'misreading') {
      this.targets.machine = 0.71; this.targets.fibre = 0.58; this.targets.bridge = 0.39;
      this.targets.misreading = 1;
    } else if (visualResult === 'refusal') {
      this.targets.machine = 0.84; this.targets.fibre = 0.38; this.targets.bridge = 0.015;
      this.targets.refusal = 1;
    } else {
      this.targets.machine = 0.58; this.targets.fibre = 0.74; this.targets.bridge = 0.47;
      this.targets.unreadable = 1;
    }
  }

  private updateNodes(shared: SharedMotionFrame): void {
    const time = shared.globalTime;
    for (let node = 0; node < this.graph.nodeSides.length; node += 1) {
      const offset = node * NODE_STRIDE;
      const baseX = this.graph.nodes[offset];
      const baseY = this.graph.nodes[offset + 1];
      const baseZ = this.graph.nodes[offset + 2];
      const side = this.graph.nodeSides[node];
      const seed = this.graph.nodeSeeds[node];
      const centerInfluence = 1 - smoothstep(0.04, 0.9, Math.abs(baseX));
      const fibreSide = side === RIGHT ? 1 : side === CENTER ? 0.58 : 0;
      const machineSide = side === LEFT ? 1 : side === CENTER ? 0.42 : 0;
      let x = baseX;
      let y = baseY;
      let z = baseZ;

      x += Math.sin(time * 0.075 + seed * 4.3) * 0.0045;
      y += Math.sin(time * 0.09 + seed * 5.7) * (0.004 + fibreSide * 0.006);
      z += Math.cos(time * 0.065 + seed * 7.1) * (0.012 + fibreSide * 0.014);

      const softPull = this.channels.softMerge * (0.025 + centerInfluence * 0.09);
      x -= Math.sign(baseX || side) * softPull;
      y += Math.sin(seed * 13.0 + time * 0.12) * this.channels.softMerge * fibreSide * 0.018;

      if (this.channels.desire > 0.001) {
        x -= Math.sign(baseX || side) * centerInfluence * this.channels.desire * 0.14;
        y += Math.sign(baseY + 0.1) * centerInfluence * this.channels.desire * 0.045;
      }
      if (this.channels.refusal > 0.001) {
        x += Math.sign(baseX || side) * centerInfluence * this.channels.refusal * 0.24;
      }
      if (this.channels.collision > 0.001 && machineSide > 0) {
        x *= 1 - this.channels.collision * (0.055 + shared.contactPulse * 0.045);
        y += Math.sin(baseY * 4.2 + time * 0.7) * this.channels.collision * 0.018;
      }
      if (this.channels.unreadable > 0.001 && fibreSide > 0) {
        const attempt = Math.sin(time * 0.52 + Math.floor(seed * 7.0));
        x += Math.sin(seed * 17.0) * attempt * this.channels.unreadable * 0.026;
        y += Math.cos(seed * 11.0) * attempt * this.channels.unreadable * 0.022;
      }
      this.nodeCurrent[offset] = x;
      this.nodeCurrent[offset + 1] = y;
      this.nodeCurrent[offset + 2] = z;
    }
  }

  private updateLines(shared: SharedMotionFrame): void {
    for (let edge = 0; edge < this.segmentCount; edge += 1) {
      const nodeA = this.graph.edges[edge * EDGE_STRIDE];
      const nodeB = this.graph.edges[edge * EDGE_STRIDE + 1];
      const kind = this.graph.edgeKinds[edge] as EdgeKind;
      const baseWeight = this.graph.edgeWeights[edge];
      const lineOffset = edge * 6;
      const alphaOffset = edge * 2;
      const aOffset = nodeA * NODE_STRIDE;
      const bOffset = nodeB * NODE_STRIDE;
      const misreadEcho = kind === EdgeKind.MisreadEcho ? this.channels.misreading : 0;
      const echoX = misreadEcho * 0.038;
      const echoY = misreadEcho * Math.sin(shared.globalTime * 0.42 + edge) * 0.025;
      this.linePositions[lineOffset] = this.nodeCurrent[aOffset] + echoX;
      this.linePositions[lineOffset + 1] = this.nodeCurrent[aOffset + 1] + echoY;
      this.linePositions[lineOffset + 2] = this.nodeCurrent[aOffset + 2] - misreadEcho * 0.08;
      this.linePositions[lineOffset + 3] = this.nodeCurrent[bOffset] + echoX;
      this.linePositions[lineOffset + 4] = this.nodeCurrent[bOffset + 1] + echoY;
      this.linePositions[lineOffset + 5] = this.nodeCurrent[bOffset + 2] - misreadEcho * 0.08;

      const [r, g, b, alpha] = this.edgeAppearance(edge, kind, baseWeight, shared);
      this.lineColors[lineOffset] = r; this.lineColors[lineOffset + 1] = g; this.lineColors[lineOffset + 2] = b;
      this.lineColors[lineOffset + 3] = r; this.lineColors[lineOffset + 4] = g; this.lineColors[lineOffset + 5] = b;
      this.lineAlpha[alphaOffset] = alpha;
      this.lineAlpha[alphaOffset + 1] = alpha;
    }
    (this.lineGeometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.lineGeometry.getAttribute('aColor') as THREE.BufferAttribute).needsUpdate = true;
    (this.lineGeometry.getAttribute('aAlpha') as THREE.BufferAttribute).needsUpdate = true;
  }

  private edgeAppearance(
    edge: number,
    kind: EdgeKind,
    weight: number,
    shared: SharedMotionFrame,
  ): readonly [number, number, number, number] {
    const seed = fract(Math.sin((edge + 3.7) * 91.17) * 43758.54);
    if (kind === EdgeKind.Machine || kind === EdgeKind.MachineArc) {
      const brightness = 0.68 + seed * 0.3 + this.channels.collision * shared.contactPulse * 0.24;
      return [
        (0.045 + seed * 0.035) * brightness,
        (0.105 + seed * 0.065) * brightness,
        (0.15 + seed * 0.09) * brightness,
        (0.05 + this.channels.machine * 0.14) * (kind === EdgeKind.MachineArc ? 1.22 : 1),
      ];
    }
    if (kind === EdgeKind.MisreadEcho) {
      return [0.25, 0.31, 0.45, this.channels.misreading * 0.2 * (0.64 + seed * 0.36)];
    }
    if (kind === EdgeKind.UnreadableAttempt) {
      const attempt = 0.5 + 0.5 * Math.sin(shared.globalTime * 0.55 + edge * 0.73);
      return [0.36, 0.49, 0.57, this.channels.unreadable * attempt * 0.19];
    }
    const density = kind === EdgeKind.Bridge ? this.channels.bridge : this.channels.fibre;
    const reveal = smoothstep(weight - 0.2, weight + 0.14, density);
    const warmMix = 0.38 + seed * 0.62;
    let r = lerp(0.28, 0.67, warmMix);
    let g = lerp(0.3, 0.42, warmMix);
    let b = lerp(0.38, 0.51, warmMix);
    if (this.channels.desire > 0.001) {
      const reflection = this.channels.desire * (0.08 + seed * 0.16);
      r = lerp(r, 0.68, reflection); g = lerp(g, 0.12, reflection); b = lerp(b, 0.19, reflection);
    }
    if (this.channels.refusal > 0.001) {
      const sideTint = this.graph.nodeSides[this.graph.edges[edge * 2]] < 0;
      r = lerp(r, sideTint ? 0.34 : 0.5, this.channels.refusal * 0.42);
      g = lerp(g, sideTint ? 0.39 : 0.31, this.channels.refusal * 0.42);
      b = lerp(b, sideTint ? 0.54 : 0.18, this.channels.refusal * 0.42);
    }
    const alphaBase = kind === EdgeKind.Bridge ? 0.15 : 0.135;
    const densityGain = kind === EdgeKind.Bridge ? 0.22 : 0.29;
    return [r, g, b, reveal * (alphaBase + density * densityGain) * (0.66 + seed * 0.34)];
  }

  private updateParticles(shared: SharedMotionFrame): void {
    for (let index = 0; index < this.pointBindings.length; index += 1) {
      const binding = this.pointBindings[index];
      const nodeA = this.graph.edges[binding.edge * 2];
      const nodeB = this.graph.edges[binding.edge * 2 + 1];
      const aOffset = nodeA * 3;
      const bOffset = nodeB * 3;
      const target = index * 3;
      const amount = binding.amount;
      this.pointPositions[target] = lerp(this.nodeCurrent[aOffset], this.nodeCurrent[bOffset], amount);
      this.pointPositions[target + 1] = lerp(this.nodeCurrent[aOffset + 1], this.nodeCurrent[bOffset + 1], amount)
        + Math.sin(shared.globalTime * 0.12 + binding.seed * 9.0) * 0.006;
      this.pointPositions[target + 2] = lerp(this.nodeCurrent[aOffset + 2], this.nodeCurrent[bOffset + 2], amount)
        + Math.cos(shared.globalTime * 0.09 + binding.seed * 11.0) * 0.012;
      const kind = this.graph.edgeKinds[binding.edge] as EdgeKind;
      const [r, g, b, edgeAlpha] = this.edgeAppearance(
        binding.edge,
        kind,
        this.graph.edgeWeights[binding.edge],
        shared,
      );
      this.pointColors[target] = r; this.pointColors[target + 1] = g; this.pointColors[target + 2] = b;
      this.pointAlpha[index] = edgeAlpha * (binding.node > 0.5 ? 1.45 : 0.54);
    }
    (this.pointGeometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.pointGeometry.getAttribute('aColor') as THREE.BufferAttribute).needsUpdate = true;
    (this.pointGeometry.getAttribute('aAlpha') as THREE.BufferAttribute).needsUpdate = true;
  }

  private populateMirrorMatrices(
    mirrors: THREE.InstancedMesh,
    seeds: Float32Array,
    sides: Float32Array,
  ): void {
    const positions = [
      [-0.87, 1.08, -1.44], [-0.38, 0.22, -1.67], [-0.79, -1.15, -1.52], [-0.2, -0.78, -1.78],
      [0.78, 1.02, -1.38], [0.35, 0.28, -1.71], [0.89, -0.93, -1.48], [0.28, -1.28, -1.82],
    ] as const;
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const position = new THREE.Vector3();
    const euler = new THREE.Euler();
    positions.forEach((value, index) => {
      const side = value[0] < 0 ? LEFT : RIGHT;
      position.set(value[0], value[1], value[2]);
      euler.set(0.08 + index * 0.025, side * (0.22 + index * 0.018), side * 0.12);
      quaternion.setFromEuler(euler);
      const size = 0.075 + (index % 3) * 0.018;
      scale.set(size * 1.25, size * 0.74, 1);
      matrix.compose(position, quaternion, scale);
      mirrors.setMatrixAt(index, matrix);
      seeds[index] = fract(index * 0.381 + 0.17);
      sides[index] = side;
    });
    mirrors.instanceMatrix.needsUpdate = true;
  }
}

function createInstallationGraph(): WeaveGraph {
  const nodeValues: number[] = [];
  const sides: number[] = [];
  const seeds: number[] = [];
  const edges: number[] = [];
  const kinds: number[] = [];
  const weights: number[] = [];
  const random = createSeededRandom(0x1a57a11);

  const addNode = (x: number, y: number, z: number, side: number): number => {
    const index = sides.length;
    nodeValues.push(x, y, z);
    sides.push(side);
    seeds.push(random());
    return index;
  };
  const addEdge = (a: number, b: number, kind: EdgeKind, weight = 0.2): void => {
    if (a === b) return;
    edges.push(a, b); kinds.push(kind); weights.push(weight);
  };

  const leftRows = 12;
  const leftCols = 6;
  const left: number[][] = [];
  for (let row = 0; row < leftRows; row += 1) {
    const rowNodes: number[] = [];
    for (let column = 0; column < leftCols; column += 1) {
      const x = lerp(-1.22, -0.13, column / (leftCols - 1)) + (random() - 0.5) * 0.025;
      const y = lerp(-2.02, 2.02, row / (leftRows - 1)) + (random() - 0.5) * 0.035;
      const z = -2.12 - (column % 3) * 0.11 - random() * 0.08;
      rowNodes.push(addNode(x, y, z, LEFT));
    }
    left.push(rowNodes);
  }
  for (let row = 0; row < leftRows; row += 1) {
    for (let column = 0; column < leftCols - 1; column += 1) {
      addEdge(left[row][column], left[row][column + 1], EdgeKind.Machine, 0.08 + random() * 0.12);
    }
  }
  for (let row = 0; row < leftRows - 1; row += 1) {
    for (let column = 0; column < leftCols; column += 1) {
      if (column === 0 || column === leftCols - 1 || (row + column) % 2 === 0) {
        addEdge(left[row][column], left[row + 1][column], EdgeKind.Machine, 0.11 + random() * 0.16);
      }
    }
  }

  const arc: number[] = [];
  for (let index = 0; index < 18; index += 1) {
    const angle = index / 18 * Math.PI * 2;
    arc.push(addNode(
      -0.64 + Math.cos(angle) * 0.49,
      0.1 + Math.sin(angle) * 1.25,
      -2.32 + Math.sin(angle * 2) * 0.06,
      LEFT,
    ));
  }
  arc.forEach((node, index) => addEdge(node, arc[(index + 1) % arc.length], EdgeKind.MachineArc, 0.06));
  addEdge(arc[1], left[7][1], EdgeKind.MachineArc, 0.08);
  addEdge(arc[6], left[4][0], EdgeKind.MachineArc, 0.08);
  addEdge(arc[10], left[1][2], EdgeKind.MachineArc, 0.08);

  const rightRows = 14;
  const rightCols = 9;
  const right: number[][] = [];
  for (let row = 0; row < rightRows; row += 1) {
    const rowNodes: number[] = [];
    for (let column = 0; column < rightCols; column += 1) {
      const x = lerp(0.12, 1.22, column / (rightCols - 1)) + (random() - 0.5) * 0.075;
      const y = lerp(-2.03, 2.03, row / (rightRows - 1)) + (random() - 0.5) * 0.105;
      const z = -1.78 - random() * 0.48 - column * 0.018;
      rowNodes.push(addNode(x, y, z, RIGHT));
    }
    right.push(rowNodes);
  }
  const rightFibreEdges: number[] = [];
  const addRightEdge = (a: number, b: number, weight: number): void => {
    rightFibreEdges.push(kinds.length);
    addEdge(a, b, EdgeKind.Fibre, weight);
  };
  for (let row = 0; row < rightRows; row += 1) {
    for (let column = 0; column < rightCols - 1; column += 1) {
      addRightEdge(right[row][column], right[row][column + 1], 0.08 + random() * 0.18);
    }
  }
  for (let row = 0; row < rightRows - 1; row += 1) {
    for (let column = 0; column < rightCols; column += 1) {
      addRightEdge(right[row][column], right[row + 1][column], 0.12 + random() * 0.25);
      if (column < rightCols - 1) {
        if ((row + column) % 2 === 0) {
          addRightEdge(right[row][column], right[row + 1][column + 1], 0.28 + random() * 0.3);
        } else {
          addRightEdge(right[row][column + 1], right[row + 1][column], 0.28 + random() * 0.3);
        }
      }
    }
  }

  const centerNodes: number[] = [];
  for (let row = 0; row < 9; row += 1) {
    centerNodes.push(addNode(
      (random() - 0.5) * 0.13,
      lerp(-1.82, 1.82, row / 8) + (random() - 0.5) * 0.08,
      -1.9 - random() * 0.26,
      CENTER,
    ));
  }
  for (let row = 0; row < centerNodes.length - 1; row += 1) {
    addEdge(centerNodes[row], centerNodes[row + 1], EdgeKind.Bridge, 0.18 + random() * 0.17);
    addEdge(left[row][leftCols - 1], centerNodes[row], EdgeKind.Bridge, 0.22 + random() * 0.21);
    addEdge(centerNodes[row], right[row][0], EdgeKind.Bridge, 0.2 + random() * 0.24);
  }
  addEdge(left[8][4], centerNodes[8], EdgeKind.Bridge, 0.2);
  addEdge(centerNodes[8], right[8][0], EdgeKind.Bridge, 0.2);

  rightFibreEdges.forEach((edge, index) => {
    if (index % 7 === 0) {
      addEdge(edges[edge * 2], edges[edge * 2 + 1], EdgeKind.MisreadEcho, 0.34);
    }
  });
  for (let row = 0; row < rightRows - 2; row += 2) {
    addEdge(right[row][1], right[row + 2][4], EdgeKind.UnreadableAttempt, 0.4);
    addEdge(right[row][4], right[row + 2][2], EdgeKind.UnreadableAttempt, 0.4);
  }

  const degrees = new Uint8Array(sides.length);
  for (let edge = 0; edge < edges.length; edge += 2) {
    degrees[edges[edge]] += 1;
    degrees[edges[edge + 1]] += 1;
  }
  return {
    nodes: Float32Array.from(nodeValues),
    nodeSides: Int8Array.from(sides),
    nodeSeeds: Float32Array.from(seeds),
    edges: Uint16Array.from(edges),
    edgeKinds: Uint8Array.from(kinds),
    edgeWeights: Float32Array.from(weights),
    degrees,
  };
}

function createPointBindings(graph: WeaveGraph): readonly PointBinding[] {
  const bindings: PointBinding[] = [];
  const edgeCount = graph.edges.length / 2;
  for (let edge = 0; edge < edgeCount; edge += 1) {
    const kind = graph.edgeKinds[edge] as EdgeKind;
    if (kind === EdgeKind.MisreadEcho || kind === EdgeKind.UnreadableAttempt) continue;
    const count = kind === EdgeKind.Fibre || kind === EdgeKind.Bridge ? 2 : edge % 4 === 0 ? 1 : 0;
    for (let index = 0; index < count; index += 1) {
      bindings.push({
        edge,
        amount: (index + 0.38 + fract(edge * 0.317)) / (count + 0.74),
        seed: fract(edge * 0.731 + index * 0.193),
        node: 0,
      });
    }
  }
  for (let node = 0; node < graph.degrees.length; node += 1) {
    let boundEdge = 0;
    for (let edge = 0; edge < edgeCount; edge += 1) {
      if (graph.edges[edge * 2] === node || graph.edges[edge * 2 + 1] === node) {
        boundEdge = edge;
        break;
      }
    }
    bindings.push({
      edge: boundEdge,
      amount: graph.edges[boundEdge * 2] === node ? 0 : 1,
      seed: fract(node * 0.417),
      node: 1,
    });
  }
  return bindings;
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

function lerp(a: number, b: number, amount: number): number {
  return a + (b - a) * amount;
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const x = Math.max(0, Math.min(1, (value - edge0) / Math.max(0.0001, edge1 - edge0)));
  return x * x * (3 - 2 * x);
}

function fract(value: number): number {
  return value - Math.floor(value);
}
