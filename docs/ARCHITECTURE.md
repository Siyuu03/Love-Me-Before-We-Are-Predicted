# System architecture

## Purpose

The installation is a local Vite/TypeScript/Three.js application. Input acquisition, interaction stabilization, state, machine inference, result selection, audio, and rendering are intentionally separated so that a noisy sensor or unavailable camera cannot directly own the visual scene.

## Runtime information flow

```text
                                      local browser only

AT42QT2120 -> Pico -> USB serial -> SerialTouchInputSource --+
keyboard A/B -------------> KeyboardTouchInputSource --------+--> raw A/B
                                                               |
                                                        TouchStabilizer
                                                               |
                                               confirmed + latched touch
                                                               |
                                                        StateMachine
                +----------------------------------------------+------------------+
                |                                              |                  |
             state                                     CONTACT snapshot       state/result
                |                                              |                  |
       Three.js SceneManager                     freeze camera smoothing     AudioController
                |                                              |                  |
 hands / staves / piano /                              ResultResolver        nine local MP3s
 particles / weave / butterflies                              |
                |                                      one ResultId
                +------------------------ ResultDirector / ResultLayer

CAM A <video> -> Teachable Machine -> 10-sample average --+
CAM B <video> -> Teachable Machine -> 10-sample average --+--> frozen pair
```

## Module ownership

### Application orchestration

- `src/core/App.ts` owns lifecycle and wires subsystems together.
- `src/core/StateMachine.ts` owns the installation states and timed transitions.
- `src/core/types.ts` defines state, result, contact, and snapshot types.
- `src/config.ts` centralises interaction, camera, reset, and display settings.

### Touch and serial input

- `src/input/TouchInputSource.ts` is the common raw-input contract.
- `KeyboardTouchInputSource` and `SerialTouchInputSource` publish the same A/B raw state.
- `TouchStabilizer` owns confirmation, latching, pairing-window, and quiet-reset behaviour.
- `SerialProtocol` parses known edge messages and `STATE A=n B=n` heartbeats while retaining unknown raw lines for diagnostics.
- Web Serial permission is requested only from a user action. Authorised ports are browser state, not repository data.

### Cameras and observation

- `DualCameraManager` owns exactly one stream per selected device and keeps CAM A and CAM B separate.
- `CameraSetupPanel` provides permission, enumeration, assignment, retry, and status UI.
- Device IDs are read from safe configuration defaults or local browser storage; real assignments are not committed.
- `ObservationLayer` presents the two local `<video>` elements. The application does not intentionally record or upload them.

### Machine inference

- `DualTeachableMachineInference` loads the local export from `public/models/teachable-machine/`.
- Each camera is predicted independently every 200 ms.
- Each side keeps ten valid complete probability vectors and computes an arithmetic mean.
- The exact labels are matched by string, not assumed class indices.
- At CONTACT, `App.freezeAppearanceForContact()` freezes the smoothed pair once for that contact sequence.
- `ResultResolver` routes the immutable pair according to [`RESULT_LOGIC.md`](RESULT_LOGIC.md).
- Model values may shape the authored branch but are not assertions about a person's gender or relationship.

### Result choreography and rendering

- `SceneManager` owns the WebGL scene, camera, post-processing, viewport, and persistent visual systems.
- `ResultRegistry` exposes exactly six modules.
- `ResultDirector` handles entry, update, release, and disposal.
- `ResultLayer` carries temporary offsets and intensities into persistent scene systems; a result does not rebuild the entire scene.
- Hands, staves, piano notation, environment particles, bridge particles, orbit particles, fibres, installation weave, cores, and butterflies retain their own modules and reusable GPU resources.

### Audio

- `AudioController` maps installation/result states to nine files under `public/audio/`.
- `RhythmDirector` exposes authored rhythm profiles to the scene so hand and particle motion remain connected to the same state as the playing cue.
- The idle cue loops at lower gain; solo cues may loop; result cues play once.
- Browser autoplay policy may require the first pointer or keyboard interaction.

## Interaction sequence

```text
IDLE -> SOLO_A or SOLO_B -> JOIN -> CONTACT -> RESULT -> RESET -> IDLE
```

The state machine receives stabilized events, not raw serial bytes. CONTACT produces one contact snapshot. The ML pair is frozen for the same contact sequence and cannot change the selected result during RESULT. RESET clears temporary result influence and, on return to IDLE, clears the inference smoothing buffers for the next interaction.

## Failure boundaries

- No serial connection: keyboard A/B simulation and result previews remain available.
- Unknown serial line: retained for diagnostics; the render loop continues.
- Camera missing or denied: observation UI reports the real failure; the render loop continues.
- Model unavailable or fewer than ten valid samples: the safe routed result is Unreadable.
- Audio blocked by autoplay: visuals and interaction continue until a user gesture enables sound.
- One result or camera cannot allocate unbounded objects per frame; scene systems are constructed once and disposed with the application.

## Deployment boundary

`npm run build` emits `dist/`, including copied static audio and model assets. `dist/` is reproducible and ignored by Git. The deployable source of truth is `src/`, `public/`, `hardware/`, `test/`, project configuration, and documentation.
