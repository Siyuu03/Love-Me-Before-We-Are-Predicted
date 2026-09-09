import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { APP_CONFIG, type DisplayRotationDeg } from '../config';
import type { StateSnapshot } from '../core/types';
import { AmbientParticleField } from './ambient/AmbientParticleField';
import { ButterflySwarm } from './butterflies/ButterflySwarm';
import { ChoreographyController } from './choreography/ChoreographyController';
import { CoreLights } from './cores/CoreLights';
import { StructuralFilamentField } from './filaments/StructuralFilamentField';
import { ParticleHands } from './hands/ParticleHands';
import { SharedMotionField } from './motion/SharedMotionField';
import { RelationshipOrbitField } from './orbits/RelationshipOrbitField';
import { BridgeParticleField } from './staves/BridgeParticleField';
import { StaffField } from './staves/StaffField';
import { InstallationWeaveField } from './weave/InstallationWeaveField';
import { VISUAL_THEME } from './theme';
import { ResultDirector, type ResultDiagnostics } from './results/ResultDirector';
import { captureResultSnapshot } from './results/ResultSnapshot';
import type { ResultLayer } from './results/ResultLayer';
import type { RhythmFrame } from '../audio/RhythmDirector';

export interface SceneDiagnostics {
  readonly drawCalls: number;
  readonly sceneObjects: number;
  readonly particleCount: number;
  readonly handParticlesA: number;
  readonly handParticlesB: number;
  readonly butterflyInstances: number;
  readonly ambientParticles: number;
  readonly orbitParticles: number;
  readonly bridgeParticles: number;
  readonly filamentSegments: number;
  readonly triangles: number;
  readonly lineSegments: number;
  readonly gpuCalls: number;
  readonly geometries: number;
  readonly textures: number;
  readonly programs: number;
}

export class SceneManager {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(35, 9 / 16, 0.1, 40);
  private readonly renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
  });
  private readonly staffField = new StaffField();
  private readonly relationshipWeave = new InstallationWeaveField();
  private readonly ambientParticles = new AmbientParticleField();
  private readonly relationshipOrbits = new RelationshipOrbitField();
  private readonly bridgeParticles = new BridgeParticleField();
  private readonly structuralFilaments = new StructuralFilamentField();
  private readonly particleHands = new ParticleHands();
  private readonly butterflies = new ButterflySwarm();
  private readonly coreLights = new CoreLights();
  private readonly choreography = new ChoreographyController(
    APP_CONFIG.contactThresholdMs,
    APP_CONFIG.contactTransitionMs,
  );
  private readonly sharedMotion = new SharedMotionField();
  private readonly resultDirector = new ResultDirector();
  private readonly drawingBufferSize = new THREE.Vector2();
  private readonly cameraTarget = new THREE.Vector3(0, 0, -0.25);
  private readonly composer: EffectComposer;
  private readonly bloomPass: UnrealBloomPass;

  constructor(
    private readonly container: HTMLElement,
    private readonly displayRotationDeg: DisplayRotationDeg,
    private readonly logicalAspectRatio: number,
  ) {
    // The installation now has one immutable portrait master. Keep the legacy
    // constructor inputs for compatibility, but never rotate or stretch this
    // visual stage in response to them.
    void this.displayRotationDeg;
    void this.logicalAspectRatio;
    this.scene.background = new THREE.Color(VISUAL_THEME.background);
    this.scene.fog = new THREE.FogExp2(VISUAL_THEME.fog.color, VISUAL_THEME.fog.density);
    this.camera.position.set(0, 0.03, VISUAL_THEME.camera.baseZ);
    this.camera.lookAt(0, 0, -0.25);

    this.scene.add(
      this.relationshipWeave.object3d,
      this.staffField.object3d,
      this.ambientParticles.object3d,
      this.relationshipOrbits.object3d,
      this.structuralFilaments.object3d,
      this.bridgeParticles.object3d,
      this.particleHands.object3d,
      this.butterflies.object3d,
      this.coreLights.object3d,
    );

    this.renderer.setClearColor(VISUAL_THEME.background, 1);
    this.renderer.setPixelRatio(
      Math.min(window.devicePixelRatio, VISUAL_THEME.postprocessing.pixelRatioCap),
    );
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = VISUAL_THEME.postprocessing.exposure;
    this.renderer.domElement.className = 'installation-canvas';
    this.renderer.domElement.setAttribute('aria-hidden', 'true');
    this.container.append(this.renderer.domElement);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(1, 1),
      VISUAL_THEME.postprocessing.bloomStrength,
      VISUAL_THEME.postprocessing.bloomRadius,
      VISUAL_THEME.postprocessing.bloomThreshold,
    );
    this.composer.addPass(this.bloomPass);

    this.resize();
  }

  update(deltaSeconds: number, snapshot: StateSnapshot, rhythm: RhythmFrame): void {
    const choreography = this.choreography.update(deltaSeconds, snapshot);
    const sharedMotion = this.sharedMotion.update(deltaSeconds, snapshot, choreography);
    const anchors = this.coreLights.update(
      deltaSeconds,
      snapshot,
      choreography,
      sharedMotion,
      this.resultDirector.layer,
    );
    this.sharedMotion.updateReferences(anchors, choreography);
    const resultLayer = this.resultDirector.update(deltaSeconds, snapshot, (canonical) =>
      captureResultSnapshot({
        shared: this.sharedMotion.getFrame(), contact: snapshot.contactSnapshot,
        butterflies: this.butterflies.captureState(), cameraPosition: this.camera.position,
        cameraTarget: this.cameraTarget,
        handParticleCounts: [this.particleHands.particleCountA, this.particleHands.particleCountB],
        handFormation: [choreography.handPresenceA, choreography.handPresenceB],
        orbitAlignment: choreography.staffAlignment,
        coreVelocities: this.coreLights.captureVelocities(),
        canonical,
      }));
    this.camera.position.y = 0.03 + sharedMotion.slowBreath * VISUAL_THEME.camera.breathY;
    this.camera.position.z = VISUAL_THEME.camera.baseZ
      + sharedMotion.slowBreath * VISUAL_THEME.camera.breathZ;
    this.cameraTarget.z = -0.25
      + sharedMotion.secondaryBreath * VISUAL_THEME.camera.focusShiftZ;
    this.camera.lookAt(this.cameraTarget);
    this.relationshipWeave.update(
      deltaSeconds,
      sharedMotion,
      choreography,
      resultLayer,
      snapshot.state,
      snapshot.currentResult,
    );
    this.staffField.update(sharedMotion, choreography, resultLayer, rhythm);
    this.ambientParticles.update(deltaSeconds, sharedMotion, choreography, resultLayer, rhythm);
    this.relationshipOrbits.update(sharedMotion, choreography, resultLayer);
    this.structuralFilaments.update(sharedMotion, choreography, resultLayer);
    this.bridgeParticles.update(sharedMotion, choreography, resultLayer);
    this.particleHands.update(
      deltaSeconds,
      sharedMotion,
      choreography,
      resultLayer,
      rhythm,
    );
    this.butterflies.update(deltaSeconds, choreography, sharedMotion, resultLayer);
  }

  render(): void {
    this.composer.render();
  }

  resize(): void {
    const renderWidth = Math.max(1, this.container.clientWidth);
    const renderHeight = Math.max(1, this.container.clientHeight);
    this.camera.aspect = 9 / 16;
    this.camera.updateProjectionMatrix();
    const pixelRatio = Math.min(
      window.devicePixelRatio,
      VISUAL_THEME.postprocessing.pixelRatioCap,
    );
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(renderWidth, renderHeight, false);
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(renderWidth, renderHeight);
    this.renderer.getDrawingBufferSize(this.drawingBufferSize);
    this.coreLights.setViewportHeight(this.drawingBufferSize.y);
    const secondaryParticleViewport = Math.min(this.drawingBufferSize.y, 1440);
    this.ambientParticles.setViewportHeight(secondaryParticleViewport);
    this.particleHands.setViewportHeight(this.drawingBufferSize.y);
    this.relationshipOrbits.setViewportHeight(secondaryParticleViewport);
    this.bridgeParticles.setViewportHeight(secondaryParticleViewport);
    this.relationshipWeave.setViewportHeight(secondaryParticleViewport);
    this.staffField.setViewportHeight(this.drawingBufferSize.y);

    const canvas = this.renderer.domElement;
    canvas.style.width = `${renderWidth}px`;
    canvas.style.height = `${renderHeight}px`;
    canvas.style.transform = 'translate(-50%, -50%)';
  }

  getDiagnostics(): SceneDiagnostics {
    let sceneObjects = 0;
    this.scene.traverse(() => {
      sceneObjects += 1;
    });

    return {
      drawCalls: this.countSceneDrawCalls(),
      sceneObjects,
      particleCount:
        this.coreLights.particleCount +
        this.particleHands.particleCount +
        this.ambientParticles.particleCount +
        this.relationshipOrbits.particleCount +
        this.bridgeParticles.particleCount,
      handParticlesA: this.particleHands.particleCountA,
      handParticlesB: this.particleHands.particleCountB,
      butterflyInstances: this.butterflies.instanceCount,
      ambientParticles: this.ambientParticles.particleCount,
      orbitParticles: this.relationshipOrbits.particleCount,
      bridgeParticles: this.bridgeParticles.particleCount,
      filamentSegments: this.structuralFilaments.segmentCount,
      triangles: this.renderer.info.render.triangles,
      lineSegments: this.renderer.info.render.lines,
      gpuCalls: this.renderer.info.render.calls,
      geometries: this.renderer.info.memory.geometries,
      textures: this.renderer.info.memory.textures,
      programs: this.renderer.info.programs?.length ?? 0,
    };
  }

  getResultDiagnostics(): ResultDiagnostics { return this.resultDirector.getDiagnostics(); }

  getResultLayer(): ResultLayer { return this.resultDirector.layer; }

  setHandReadabilityCheck(active: boolean): void {
    this.ambientParticles.object3d.visible = !active;
    this.relationshipOrbits.object3d.visible = !active;
    this.structuralFilaments.object3d.visible = !active;
    this.relationshipWeave.object3d.visible = !active;
    this.bridgeParticles.object3d.visible = !active;
    this.butterflies.object3d.visible = !active;
    this.coreLights.object3d.visible = !active;
    this.particleHands.setReadabilityCheck(active);
    this.staffField.setDebugVisibility(active ? 0.06 : 1);
  }

  dispose(): void {
    this.staffField.dispose();
    this.ambientParticles.dispose();
    this.relationshipOrbits.dispose();
    this.structuralFilaments.dispose();
    this.relationshipWeave.dispose();
    this.bridgeParticles.dispose();
    this.particleHands.dispose();
    this.butterflies.dispose();
    this.coreLights.dispose();
    this.resultDirector.dispose();
    this.bloomPass.dispose();
    this.composer.dispose();
    this.scene.clear();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private countSceneDrawCalls(): number {
    let drawCalls = 0;
    this.scene.traverse((object) => {
      if (
        object instanceof THREE.Points
        || object instanceof THREE.LineSegments
        || object instanceof THREE.Mesh
      ) {
        drawCalls += 1;
      }
    });
    return drawCalls;
  }
}
