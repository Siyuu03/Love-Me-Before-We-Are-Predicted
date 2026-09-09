import * as THREE from 'three';
import type { StateSnapshot } from '../../core/types';
import type { ChoreographyFrame } from '../choreography/ChoreographyController';
import type { SharedMotionFrame } from '../motion/SharedMotionField';
import { COLOR_PALETTE, VISUAL_THEME } from '../theme';
import { CoreMotion } from './CoreMotion';
import type { ResultLayer } from '../results/ResultLayer';

const CORE_COUNT = 2;

const vertexShader = /* glsl */ `
  precision highp float;

  uniform float uViewportHeight;

  attribute vec3 aColor;
  attribute vec3 aEdgeColor;
  attribute float aSize;

  varying vec3 vColor;
  varying vec3 vEdgeColor;

  void main() {
    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    vColor = aColor;
    vEdgeColor = aEdgeColor;
    gl_PointSize = min(48.0, aSize * 0.74 * uViewportHeight / max(1.0, -viewPosition.z));
    gl_Position = projectionMatrix * viewPosition;
  }
`;

const fragmentShader = /* glsl */ `
  precision highp float;

  uniform vec3 uHighlight;

  varying vec3 vColor;
  varying vec3 vEdgeColor;

  void main() {
    vec2 centered = gl_PointCoord - vec2(0.5);
    float distanceFromCenter = length(centered) * 2.0;
    if (distanceFromCenter > 1.0) discard;

    float pin = 1.0 - smoothstep(0.0, 0.08, distanceFromCenter);
    float body = (1.0 - smoothstep(0.04, 0.24, distanceFromCenter)) * 0.52;
    float halo = pow(max(0.0, 1.0 - distanceFromCenter), 4.4) * 0.18;
    float alpha = min(1.0, pin + body + halo);
    vec3 metallicBody = mix(vEdgeColor, vColor, body + pin * 0.68);
    vec3 color = mix(metallicBody, uHighlight, pin * 0.32) * (0.82 + pin * 0.22);
    gl_FragColor = vec4(color, alpha);
  }
`;

export class CoreLights {
  readonly object3d: THREE.Points;
  readonly particleCount = CORE_COUNT;
  private readonly geometry = new THREE.BufferGeometry();
  private readonly material: THREE.ShaderMaterial;
  private readonly motion = new CoreMotion();
  private readonly positions = new Float32Array(CORE_COUNT * 3);
  private readonly sizes = new Float32Array([
    VISUAL_THEME.cores.a.size,
    VISUAL_THEME.cores.b.size,
  ]);
  private readonly displayPoints: readonly [THREE.Vector3, THREE.Vector3] = [
    new THREE.Vector3(), new THREE.Vector3(),
  ];
  constructor() {
    const colorA = new THREE.Color(VISUAL_THEME.cores.a.color);
    const colorB = new THREE.Color(VISUAL_THEME.cores.b.color);
    const edgeA = new THREE.Color(VISUAL_THEME.cores.a.edgeColor);
    const edgeB = new THREE.Color(VISUAL_THEME.cores.b.edgeColor);
    const colors = new Float32Array([
      colorA.r,
      colorA.g,
      colorA.b,
      colorB.r,
      colorB.g,
      colorB.b,
    ]);
    const edgeColors = new Float32Array([
      edgeA.r,
      edgeA.g,
      edgeA.b,
      edgeB.r,
      edgeB.g,
      edgeB.b,
    ]);

    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
    this.geometry.setAttribute('aEdgeColor', new THREE.BufferAttribute(edgeColors, 3));
    this.geometry.setAttribute('aSize', new THREE.BufferAttribute(this.sizes, 1));

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uViewportHeight: { value: 1080 },
        uHighlight: { value: new THREE.Color(COLOR_PALETTE.highlight) },
      },
      vertexShader,
      fragmentShader,
      transparent: true,
      depthTest: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });

    this.object3d = new THREE.Points(this.geometry, this.material);
    this.object3d.name = 'ParticipantCoreLights';
    this.object3d.frustumCulled = false;
    this.object3d.renderOrder = 4;
  }

  update(
    deltaSeconds: number,
    snapshot: StateSnapshot,
    choreography: ChoreographyFrame,
    sharedMotion: SharedMotionFrame,
    result: ResultLayer,
  ): readonly [THREE.Vector3, THREE.Vector3] {
    const points = this.motion.update(deltaSeconds, choreography, sharedMotion);
    this.displayPoints[0].copy(points[0]).add(copyResultOffset(result.coreOffsetA, RESULT_OFFSET_A));
    this.displayPoints[1].copy(points[1]).add(copyResultOffset(result.coreOffsetB, RESULT_OFFSET_B));
    if (result.coreSync > 0) {
      const centerY = (this.displayPoints[0].y + this.displayPoints[1].y) * 0.5;
      this.displayPoints[0].y = THREE.MathUtils.lerp(this.displayPoints[0].y, centerY, result.coreSync * 0.42);
      this.displayPoints[1].y = THREE.MathUtils.lerp(this.displayPoints[1].y, centerY, result.coreSync * 0.42);
    }
    this.displayPoints[0].toArray(this.positions, 0);
    this.displayPoints[1].toArray(this.positions, 3);
    this.geometry.attributes.position.needsUpdate = true;

    const pulseA = 1 + choreography.soloRhythmA *
      (0.055 + sharedMotion.secondaryBreath * 0.035);
    const pulseB = 1 + choreography.soloRhythmB *
      (0.055 - sharedMotion.secondaryBreath * 0.032);
    const tensionScale = 1 + choreography.tension * 0.09;
    const targetScaleA = (snapshot.aPressed ? 1.12 : 1) * pulseA * tensionScale;
    const targetScaleB = (snapshot.bPressed ? 1.12 : 1) * pulseB * tensionScale;
    const blend = 1 - Math.exp(-6 * deltaSeconds);
    this.sizes[0] = THREE.MathUtils.lerp(
      this.sizes[0],
      VISUAL_THEME.cores.a.size * targetScaleA * result.coreBrightness,
      blend,
    );
    this.sizes[1] = THREE.MathUtils.lerp(
      this.sizes[1],
      VISUAL_THEME.cores.b.size * targetScaleB * result.coreBrightness,
      blend,
    );
    this.geometry.attributes.aSize.needsUpdate = true;
    return this.displayPoints;
  }

  setViewportHeight(viewportHeight: number): void {
    this.material.uniforms.uViewportHeight.value = viewportHeight;
  }

  captureVelocities(): readonly [THREE.Vector3, THREE.Vector3] {
    return this.motion.captureVelocities();
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}

const RESULT_OFFSET_A = new THREE.Vector3();
const RESULT_OFFSET_B = new THREE.Vector3();

function copyResultOffset(source: THREE.Vector3, target: THREE.Vector3): THREE.Vector3 {
  return target.copy(source);
}
