# Love Me Before We Are Predicted

An interactive installation about gender performance, machine classification, intimacy prediction, and the productive possibility of being misread.

《Love Me Before We Are Predicted》是一件讨论性别表演、机器分类、亲密关系预测与误读的双人互动装置。两位参与者站在背靠背镜面两侧，通过触摸、摄像头观察、粒子化双手、垂直谱面与声音共同进入一段被算法命名的关系编舞。

![The physical installation with its asymmetric fibre structures](docs/images/Love%20Me%20Before%20We%20Are%20Predicted7.jpg)

## Concept

Two participants are treated as separate subjects, while a third, algorithmic gaze observes and compares their camera images. The work deliberately distinguishes a model's limited appearance scores from gender identity, personality, consent, or the truth of a relationship. The six outcomes are choreographic propositions rather than facts.

The installation's material and screen languages share the same tensions: silver structure, dark blue and grey-pink fibres, incomplete connections, mirrored acrylic butterflies, musical time, and large areas of black space.

## Installation and audience interaction

The physical installation uses a shared portrait-oriented Dell display, two Logitech C270 cameras, two conductive touch areas, a Raspberry Pi Pico-class controller with an AT42QT2120 capacitive-touch board, and stereo audio from the host computer.

1. The system waits in `IDLE`.
2. The first reliable touch enters `SOLO_A` or `SOLO_B`; the corresponding hand begins to form.
3. A second participant may join within the configured pairing window.
4. `JOIN` leads to the shared fingertip prelude and then `CONTACT`.
5. The current smoothed camera scores are frozen once for the interaction.
6. One of six result choreographies is performed with hands, staves, fibres, particles, butterflies, piano gestures, and music.
7. `RESET` releases the temporary result influence and returns to `IDLE`.

Keyboard controls remain available for development:

- Hold `A` / `B`: simulate the two touch channels.
- `1`–`6`: preview Collision, Soft Merge, Desire, Misreading, Refusal, or Unreadable.
- `0`: return to idle in development mode.
- `R`: safe reset.
- `C`: camera and touch-board setup.
- `D`: debug and ML calibration overlays.
- `Shift+D`: deeper engineering diagnostics.
- `H`: isolated hand-readability check.

## System architecture

```text
AT42QT2120 / keyboard
        |
TouchInputSource -> TouchStabilizer -> StateMachine
                                      |
CAM A -> Teachable Machine -> 10-sample smoothing --+
CAM B -> Teachable Machine -> 10-sample smoothing --+-> frozen CONTACT snapshot
                                      |
                               ResultResolver
                                      |
                           one of six ResultModules
                                      |
        +-----------------------------+------------------------------+
        |                             |                              |
  Three.js scene                AudioController              observation UI
  hands / staves /              nine local MP3s              two local videos
  particles / fibres
```

The input, state, result, audio, camera, and visual systems are separate modules. Result modules apply temporary choreography through the shared result layer rather than rebuilding the scene.

See [Architecture](docs/ARCHITECTURE.md) for module ownership, timing, privacy boundaries, and the complete runtime information flow.

## Information flow

- Camera A and Camera B remain separate `<video>` inputs.
- The bundled Teachable Machine model produces two appearance probabilities per camera every 200 ms.
- Each camera uses the arithmetic mean of its most recent ten valid predictions.
- On `CONTACT`, the pair is frozen. It cannot change during the result performance.
- The resolver derives a result from clarity and distance thresholds documented in [Result Logic](docs/RESULT_LOGIC.md).
- Camera frames are processed locally in the browser. The application does not upload or record them.
- Web Serial receives touch-state messages at 115200 baud. Browser permission and port authorization remain local to the exhibition computer.

## Six relationship outcomes

- **Collision** — compressed contact, impact, asymmetric rebound, and material aftershock.
- **Soft Merge** — exchange and shared rhythm while two centres remain visible.
- **Desire** — attraction, near-contact, pursuit, and an unresolved interval.
- **Misreading** — response to delayed or displaced coordinates rather than the other subject's current gesture.
- **Refusal** — withdrawal, boundary, negative space, and continued integrity.
- **Unreadable** — repeated attempts to organise a relation that remain incomplete without erasing either participant.

These outcomes are not diagnoses. See [Result Logic](docs/RESULT_LOGIC.md) and the [Model Card](docs/MODEL_CARD.md).

![A result view combining two camera observations and the particle performance](docs/images/Love%20Me%20Before%20We%20Are%20Predicted2.png)

## Hardware

- Portrait-oriented 27-inch Dell display
- Two Logitech C270 USB cameras
- Raspberry Pi Pico-compatible controller
- AT42QT2120 capacitive-touch board
- Two conductive touch electrodes
- Stereo speaker output from the host computer
- Fibre, mirror, metal-frame, and acrylic installation structure

The recorded Pico wiring is:

| Signal | Pico pin |
| --- | --- |
| SDA | GP4 |
| SCL | GP5 |
| AT42 reset | GP6 |
| AT42 change | GP7 |
| Participant A | AT42 KEY11 / top socket |
| Participant B | AT42 KEY0 / bottom socket |

The actual sketch is in [`hardware/pico_at42qt2120/`](hardware/pico_at42qt2120/). The MPR121 folder is retained as a separate compatibility example and must not be presented as the exhibition firmware.

## Software

- Vite
- TypeScript
- Three.js and Three.js post-processing
- `@teachablemachine/image` / TensorFlow.js
- Web Serial API
- Browser MediaDevices API
- Node's test runner through `tsx`

## Machine-learning model and limitations

The unchanged exported model is included in `public/models/teachable-machine/` so the installation can load it without contacting Teachable Machine at runtime. It has exactly two configured labels:

- `feminine-coded appearance`
- `masculine-coded appearance`

These labels describe a narrow appearance coding produced by a project-specific training process. They do not identify a person's gender, sex, identity, expression, psychology, compatibility, or relationship. The training dataset is not included and cannot be reconstructed from the exported weights. See [Model Card](docs/MODEL_CARD.md).

## Directory structure

```text
.
├── docs/                 Project, ethics, model, result, and licence notes
│   └── images/           Curated documentation images
├── hardware/             Exhibition firmware, wiring notes, and compatibility example
├── public/
│   ├── audio/            Nine runtime MP3 cues
│   └── models/
│       └── teachable-machine/  Local Teachable Machine runtime export
├── src/
│   ├── audio/
│   ├── core/
│   ├── debug/
│   ├── input/
│   ├── ui/
│   ├── vision/
│   └── visual/
├── test/                 Automated tests
├── AI_USE.md             Generative-AI disclosure
├── THIRD_PARTY_NOTICES.md Third-party code, model, media, and licence notices
├── index.html
├── package.json
└── tsconfig.json
```

`node_modules/`, `dist/`, `coverage/`, temporary work, and unscreened output captures are intentionally excluded from version control.

## Installation

Requirements:

- Node.js 20.19+ or 22.12+ (Node 24 is also supported by the current Vite release)
- npm
- A Chromium-based browser with Web Serial support for physical touch input

```sh
npm ci
cp .env.example .env.local
```

Do not put real camera device IDs, tokens, or private machine paths in committed environment files.

## Running locally

```sh
npm run dev -- --host localhost
```

Open `http://localhost:5173/`. A first keyboard or pointer interaction may be required before browser audio playback can begin.

For a production check:

```sh
npm run build
npm run preview -- --host localhost
```

## Camera and Web Serial permissions

Press `C` to open setup. Camera permission and the serial-port chooser must be initiated by a real user gesture. Select two different cameras and save the assignment. Device IDs are stored only in this site's `localStorage`; they are not project assets.

Use `CONNECT TOUCH BOARD` to invoke the Web Serial chooser. Previously authorized ports may be reopened after refresh without automatically opening a system chooser. Close Arduino Serial Monitor before connecting because the port cannot be shared.

Detailed camera guidance is in [hardware/CAMERA_SETUP.md](hardware/CAMERA_SETUP.md), and serial guidance is in [hardware/TOUCH_BOARD_SETUP.md](hardware/TOUCH_BOARD_SETUP.md).

## Pico/Arduino setup and pin mapping

Open `hardware/pico_at42qt2120/Arduino_IDE_Files_Pelagic_Memory_A_Map_That_Breathes.ino` in Arduino IDE with Raspberry Pi Pico board support installed. Keep the companion header in the same sketch folder for archival completeness, although the current exhibition sketch directly implements its required register operations.

The sketch uses 115200 baud, AT42 address `0x1C`, a touch threshold of 25, detection integrator 8, software debounce 120 ms, and A/B channels KEY11/KEY0. Keep hands away during startup calibration. Confirm `AT42_READY` and `STATE A=0 B=0` before opening the webpage. See [Hardware](docs/HARDWARE.md) and the [firmware README](hardware/pico_at42qt2120/README.md).

## Testing

```sh
npm test
npm run build
```

The tests cover the state machine, touch stabilization, serial parsing, camera configuration, result lifecycle, audio mapping, visual object stability, Teachable Machine smoothing, CONTACT freezing, and six-way routing.

## Troubleshooting

- **Audio is silent:** interact with the page once; browsers block autoplay before a user gesture.
- **Camera is unavailable:** close Photo Booth, Zoom, FaceTime, Teams, and other camera tabs; press `C` and retry only the affected camera.
- **Only one C270 works:** connect one camera directly and one through a powered hub, then reselect them.
- **Touch board is unavailable:** close Serial Monitor, reconnect at 115200 baud, and verify Chrome Web Serial permission.
- **Model does not load:** confirm all three files exist together in `public/models/teachable-machine/` and that the site is served through Vite rather than opened as a raw file.
- **Result is Unreadable:** insufficient samples or low/unstable appearance clarity intentionally falls back to Unreadable.

## AI-use declaration

Generative AI tools, including ChatGPT and OpenAI Codex, assisted with research support, writing, code development, debugging, documentation, test design, and visual iteration under the artist's direction. Human authorship remains responsible for the concept, artistic decisions, hardware construction, model training choices, validation, and final publication. See [AI Use](AI_USE.md).

## Music attribution

The nine cues are converted and edited excerpts of Franz Schubert's *Fantasia in F Minor, D. 940*, performed by The Latsos Duo and recorded/uploaded by Wikimedia user Asuas. The source recording is licensed [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). This music licence is separate from the copyright status of the project source code. See [Music Attribution](docs/MUSIC_ATTRIBUTION.md).

## Privacy and consent

Camera frames are displayed and inferred locally and are not intentionally uploaded or recorded by this application. The model's two appearance scores are frozen only for the current interaction and are reset afterwards. Public photographs, model training data, and participant consent require separate governance. See [Privacy and Consent](docs/PRIVACY_AND_CONSENT.md).

## Credits

- Concept, installation, visual direction, and project authorship: Siyuu
- Software and technical development: project author with AI-assisted development
- Teachable Machine model: project-specific export by the project author; original training dataset not included
- Music: Franz Schubert, *Fantasia in F Minor, D. 940*; performed by The Latsos Duo; recording/upload by Asuas; edited into nine cues under CC BY-SA 4.0
- Core open-source software: Three.js, Vite, TypeScript, Teachable Machine Image, and TensorFlow.js

## Licence scope

No open-source licence has yet been selected for the project code. All rights remain with their respective copyright holders unless a file states otherwise.

The nine music files are documented separately under CC BY-SA 4.0. Third-party packages retain their own licences; see [Third-party Notices](THIRD_PARTY_NOTICES.md).
