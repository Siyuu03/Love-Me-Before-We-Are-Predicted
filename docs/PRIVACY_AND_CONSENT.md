# Privacy and consent

## Runtime data flow

The installation uses two camera streams and a two-channel capacitive touch board.

- Camera permission is requested by the browser after a user action.
- Camera A and Camera B remain separate video elements.
- Teachable Machine inference runs locally in the browser.
- The application does not intentionally upload or record camera video.
- Smoothed model probabilities are stored only in memory for the current interaction.
- CONTACT freezes the current pair; RESET clears it for the next interaction.
- Web Serial touch messages are processed locally.
- Camera device IDs may be stored in the site's `localStorage` on the exhibition machine.

Browser permissions, serial authorizations, `localStorage`, and hardware device IDs are not repository assets and must not be exported from the exhibition profile into GitHub.

## Participant notice

Exhibition signage should clearly explain, before participation:

1. that two cameras are observing the installation area;
2. that a local appearance classifier processes the images;
3. that the classifier has two limited, binary appearance-coded labels;
4. that the six outcomes are artistic propositions rather than true assessments;
5. whether any separate documentation photography or video is taking place;
6. how participants can decline or leave without penalty.

## No identity claim

The model does not determine real gender, identity, sex, sexuality, personality, consent, compatibility, intimacy, or relationship truth. Its categories and six-way routing are part of the work's critique of machine classification.

## Documentation images

Only images deliberately placed in `docs/images/` should be considered for public documentation. The unscreened `outputs/` directory is excluded from Git.

Some curated images contain identifiable people. Before a public repository is created, the project owner must retain confirmation that:

- each identifiable participant agreed to publication;
- the photographer granted the intended use;
- the exhibition venue and any visible third-party works may be shown;
- captions and credits are accurate;
- consent can be withdrawn under an agreed process where applicable.

Being placed in `docs/images/` records project selection, not a legal determination of consent or copyright.

## Training data

**Training dataset not included / 训练数据集未包含。**

Do not publish original training images without reviewing consent, purpose limitation, participant expectations, copyright, sensitive attributes, retention, and withdrawal. Exported model weights cannot be used to reconstruct an ethically complete account of the dataset.

## Operational recommendations

- Use a dedicated local browser profile for the exhibition.
- Do not sync that profile to a personal cloud account.
- Disable unrelated browser extensions.
- Keep the site on `localhost` and avoid remote analytics.
- Do not add logging of raw frames or appearance scores without a new consent review.
- Close other camera applications before opening the installation.
- After deinstallation, remove local camera assignments and site permissions from the exhibition computer.
