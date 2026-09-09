# Model card: appearance-coding classifier

## Overview

This project includes a local export of a Teachable Machine image model used as an intentionally limited algorithmic observer. Two existing camera streams are inferred independently in the browser. The output helps route an artwork into one of six choreographies; it is not a factual assessment of the people being observed.

## Source and local copy

- Original model URL: <https://teachablemachine.withgoogle.com/models/4ltRiLnoM/>
- Local download date: 2026-09-09
- Teachable Machine metadata timestamp: 2026-08-13T06:48:18.461Z
- Model input size: 224 × 224
- Runtime location: `public/models/teachable-machine/`

Included files:

| File | SHA-256 |
| --- | --- |
| `model.json` | `8be9d678c96e810dd55b0c5b9e55823e76f1bbbf2a64b671e603d5deb927af0e` |
| `metadata.json` | `b45b5af776a89754a2eee70b838e7c3851d97b46b5f985f2403a97faa18fa2af` |
| `model.weights.bin` | `c3e2f2fd7e57fc70542ac3f4f457465d93f09815fd52c39b057735bbf64e9de5` |

The application loads these files from `./models/teachable-machine/`; the remote URL is retained here for provenance rather than runtime dependency. The exported model files were relocated without changing their bytes, labels, weights, or inference formula.

## Classes

The exact labels are:

1. `feminine-coded appearance`
2. `masculine-coded appearance`

These names refer to the model's learned coding of images. They must not be interpreted as a person's gender identity, sex, expression, authenticity, personality, relationship role, or consent.

## Training data

**Training dataset not included / 训练数据集未包含。**

The original training images cannot be reconstructed from the exported model. The current repository therefore does not document dataset size, demographic distribution, image sources, participant consent, labelling procedure, class balance, train/test split, or measured accuracy. These omissions materially limit reproducibility and any claim about model quality.

## Runtime processing

- Each camera is predicted independently every 200 ms.
- The application reads the complete class-probability vector by exact class name.
- Each camera averages its most recent ten valid predictions.
- `s = avgFeminine - avgMasculine`.
- `q = abs(s)` is treated as output clarity, not identity confidence.
- `D = abs(sA - sB) / 2` compares the two smoothed outputs.
- The values are frozen once at CONTACT and remain immutable through the result animation.
- RESET clears both smoothing buffers before the next interaction.

The exact routing rules are documented in [RESULT_LOGIC.md](RESULT_LOGIC.md).

## Intended use

- Local exhibition artwork
- Critical demonstration of machine observation, categorisation, prediction, and misreading
- A source of choreographic branching within this artwork

## Prohibited interpretations and uses

This model must not be used to:

- determine or verify gender or sex;
- infer sexuality, personality, compatibility, intimacy, consent, or relationship status;
- rank, screen, identify, police, diagnose, or make decisions about people;
- claim scientific validity from the six artwork outcomes.

## Known limitations

- Only two binary appearance-coded classes are available.
- No explicit no-person or out-of-distribution class exists.
- Lighting, camera position, clothing, hairstyle, background, occlusion, skin tone, disability, cultural presentation, and hardware exposure can affect outputs.
- A confident softmax score does not establish correctness.
- Missing training documentation prevents independent fairness or accuracy evaluation.
- The artistic thresholds are authored and are not validated psychological or social measures.

## Privacy

Inference occurs locally in the browser using existing video elements. The application does not intentionally upload or record camera frames. Smoothed probabilities are held in memory for the current interaction and reset afterwards. Browser permissions and camera device IDs remain local to the host profile.

## Future documentation required

Before making claims about model evaluation, add a documented dataset card, consent and provenance records, class counts, evaluation protocol, confusion matrix, known failure examples, and an explicit retention/deletion policy. Do not publish private training images merely to satisfy reproducibility.
