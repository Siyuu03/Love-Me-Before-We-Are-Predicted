# Third-party licences

The publication-facing, lockfile-level inventory is maintained in [`../THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md). This file retains the shorter development summary.

This project depends on third-party open-source packages. They retain their own licences. This document is informational and is not a substitute for the packages' complete licence texts or legal advice.

## Direct runtime dependencies

| Package | Installed version | Declared licence | Use |
| --- | ---: | --- | --- |
| `three` | 0.185.1 | MIT | WebGL scene, geometry, materials, post-processing |
| `@teachablemachine/image` | 0.8.5 | Apache-2.0 | Loading and running the exported image model |

## Direct development dependencies

| Package | Installed version | Declared licence | Use |
| --- | ---: | --- | --- |
| `@types/three` | 0.185.4 | MIT | TypeScript declarations |
| `tsx` | 4.23.12 | MIT | TypeScript test execution |
| `typescript` | 7.0.2 | Apache-2.0 | Type checking |
| `vite` | 8.2.1 | MIT | Development and production build tooling |

## Transitive dependency summary

The current lockfile contains packages declaring MIT, Apache-2.0, Apache-2.0 AND MIT, MPL-2.0, ISC, and BSD-3-Clause licences. Exact package versions and integrity hashes are recorded in `package-lock.json`.

Before a public release, generate or verify a complete notices bundle from the locked dependency tree and retain all licence notices required by the individual packages. In particular, files under MPL-2.0 retain the obligations of that licence; their presence does not change the licence of unrelated project files.

## Other materials

- The Teachable Machine export is documented separately in [MODEL_CARD.md](MODEL_CARD.md).
- Music is documented separately in [MUSIC_ATTRIBUTION.md](MUSIC_ATTRIBUTION.md).
- No licence has yet been chosen for the project's original source code.
- Curated documentation photographs and screenshots remain subject to their photographers' and depicted participants' permissions unless explicitly licensed elsewhere.
