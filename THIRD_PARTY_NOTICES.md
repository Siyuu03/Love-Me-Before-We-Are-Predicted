# Third-party notices

This inventory describes third-party components distributed with, or required to build, *Love Me Before We Are Predicted*. It is not a licence for the project's original source code. Package versions and integrity hashes are fixed by `package-lock.json`; the licence files distributed inside each installed package remain authoritative.

## Direct dependencies

| Component | Version | Licence | Purpose |
| --- | ---: | --- | --- |
| Three.js | 0.185.1 | MIT | WebGL scene, geometry, materials, and post-processing |
| Teachable Machine Image | 0.8.5 | Apache-2.0 | Loading and running the exported image classifier |
| Vite | 8.2.1 | MIT | Development and production builds |
| TypeScript | 7.0.2 | Apache-2.0 | Static type checking |
| tsx | 4.23.12 | MIT | TypeScript test execution |
| @types/three | 0.185.4 | MIT | Three.js TypeScript declarations |

## Locked transitive and optional packages

The following package families and packages are present in the current lockfile. Platform-specific packages are optional build binaries; only the variant matching the installation platform is installed or executed.

| Licence | Locked packages |
| --- | --- |
| Apache-2.0 | `@dimforge/rapier3d-compat@0.12.0`; `@teachablemachine/image@0.8.5`; `@tensorflow/tfjs@1.3.1`; `@tensorflow/tfjs-converter@1.3.1`; `@tensorflow/tfjs-core@1.3.1`; `@tensorflow/tfjs-data@1.3.1`; `detect-libc@2.1.2`; `typescript@7.0.2`; all locked `@typescript/typescript-* @7.0.2` platform binaries |
| Apache-2.0 AND MIT | `@tensorflow/tfjs-layers@1.3.1` |
| MIT | all locked `@esbuild/* @0.28.2` platform binaries; `@oxc-project/types@0.143.0`; all locked `@rolldown/binding-* @1.2.3` platform binaries; `@rolldown/pluginutils@1.0.1`; `@tweenjs/tween.js@23.1.3`; `@types/node@26.2.0`; `@types/node-fetch@2.6.13`; `@types/offscreencanvas@2019.3.0`; `@types/seedrandom@2.4.27`; `@types/stats.js@0.17.4`; `@types/webgl-ext@0.0.30`; `@types/webgl2@0.0.4`; `@types/webxr@0.5.24`; `asynckit@0.4.0`; `autobind-decorator@2.4.0`; `call-bind-apply-helpers@1.0.2`; `combined-stream@1.0.8`; `delayed-stream@1.0.0`; `dunder-proto@1.0.1`; `es-define-property@1.0.1`; `es-errors@1.3.0`; `es-object-atoms@1.1.2`; `es-set-tostringtag@2.1.0`; `esbuild@0.28.2`; `fdir@6.5.0`; `fflate@0.8.3`; `form-data@4.0.6`; `fsevents@2.3.3`; `function-bind@1.1.2`; `get-intrinsic@1.3.0`; `get-proto@1.0.1`; `gopd@1.2.0`; `has-symbols@1.1.0`; `has-tostringtag@1.0.2`; `hasown@2.0.4`; `math-intrinsics@1.1.0`; `meshoptimizer@1.1.1`; `mime-db@1.52.0`; `mime-types@2.1.35`; `nanoid@3.3.18`; `node-fetch@2.1.2`; `postcss@8.5.26`; `rolldown@1.2.3`; `seedrandom@2.4.4`; `three@0.185.1`; `tinyglobby@0.2.17`; `tsx@4.23.12`; `undici-types@8.3.0`; `vite@8.2.1` |
| MPL-2.0 | `lightningcss@1.33.0` and all locked `lightningcss-* @1.33.0` platform binaries |
| ISC | `picocolors@1.1.1` |
| BSD-3-Clause | `source-map-js@1.2.1` |

The root package is marked `private: true`; no licence has been selected for the project's original code. No repository-wide `LICENSE` is added by this release.

## Teachable Machine runtime model

The project-specific exported model is stored in `public/models/teachable-machine/`. Its provenance, exact files, hashes, labels, and limitations are documented in [`docs/MODEL_CARD.md`](docs/MODEL_CARD.md). The original training dataset is not included. The model must not be treated as a tool for determining a person's gender, identity, or relationship.

The browser runtime uses Google's Teachable Machine Image library and TensorFlow.js under their package licences above. Inclusion of the project-specific weights does not change those library licences and does not grant rights to any absent training imagery.

## Music

All nine MP3 cues are converted and edited excerpts of:

- Composition: Franz Schubert, *Fantasia in F Minor, D. 940 (Op. posth. 103)*
- Performance: The Latsos Duo
- Live recording and Wikimedia upload: Asuas
- Source: [Wikimedia Commons file page](https://commons.wikimedia.org/wiki/File:Fantasia_in_F_minor_by_Franz_Schubert,_D.940_(Op._posth._103).ogg)
- Original file: [Ogg Vorbis recording](https://commons.wikimedia.org/wiki/Special:Redirect/file/Fantasia_in_F_minor_by_Franz_Schubert,_D.940_(Op._posth._103).ogg)
- Licence: [Creative Commons Attribution-ShareAlike 4.0 International](https://creativecommons.org/licenses/by-sa/4.0/)
- Changes: converted to MP3, edited, divided into nine cues, and configured for looping or one-shot playback in the installation

CC BY-SA 4.0 applies to the adapted audio files, not automatically to the project code, photographs, model, firmware, or other artwork. See [`docs/MUSIC_ATTRIBUTION.md`](docs/MUSIC_ATTRIBUTION.md) for cue names and checksums.

## Firmware and hardware references

The AT42QT2120 sketch uses the Arduino `Wire` API supplied by the selected Raspberry Pi Pico-compatible Arduino core. The archived MPR121 compatibility example also depends on the Adafruit MPR121 library. That example is not the exhibition firmware.

The repository does not bundle Arduino IDE, a Pico board core, or the Adafruit MPR121 package. Their licences and notices must be accepted from the versions installed by the user.

## Photographs and documentation media

Documentation photographs and screenshots remain subject to the rights of their photographers, the artist, the venue, and identifiable participants. Inclusion in this private repository is not a general public-content licence. See [`docs/PRIVACY_AND_CONSENT.md`](docs/PRIVACY_AND_CONSENT.md).
