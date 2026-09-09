# Result Logic

This document records the implemented six-way result routing and the artistic reading of each result. It does not claim that the model can determine real gender, identity, compatibility, intimacy, consent, or the truth of a relationship.

## Inputs

Camera A and Camera B are processed independently. Every 200 ms, the local Teachable Machine export returns probabilities for two exact labels:

- `feminine-coded appearance`
- `masculine-coded appearance`

For each camera, the system retains the most recent ten valid predictions and calculates arithmetic means:

```text
avgFeminine = mean(last 10 feminine probabilities)
avgMasculine = mean(last 10 masculine probabilities)
s = avgFeminine - avgMasculine
q = abs(s)
```

`s` is a signed difference between the model's two appearance scores. `q` is only the magnitude of that difference; it is not a confidence in gender or identity.

For the pair:

```text
D = abs(sA - sB) / 2
```

`D` is a distance between two model outputs, not a social or psychological distance between people.

## Freeze point

When the existing shared-touch condition reaches `CONTACT`, the application freezes the latest smoothed pair once. Further camera predictions cannot change the selected result during `CONTACT`, `RESULT`, or its coda. After `RESET` completes and the system returns to `IDLE`, both ten-sample buffers are cleared and begin collecting again.

## Decision order

The implemented order is significant:

```text
if either camera has fewer than 10 valid samples:
    Unreadable

else if qA < 0.24 and qB < 0.24:
    Unreadable

else if exactly one side has q < 0.24:
    if the other side has q >= 0.42:
        Refusal
    else:
        Unreadable

else:  # both q values are >= 0.24
    D = abs(sA - sB) / 2
    if D < 0.18:
        Soft Merge
    else if D < 0.40:
        Desire
    else if D < 0.65:
        Misreading
    else:
        Collision
```

Boundary behaviour:

- `q = 0.24` is treated as sufficiently clear for the distance branch.
- `q = 0.42` satisfies the clear-side condition for Refusal.
- `D = 0.18` routes to Desire.
- `D = 0.40` routes to Misreading.
- `D = 0.65` routes to Collision.
- Any insufficient or unhandled state safely becomes Unreadable.

## Development and fallback sources

- Number keys `1`–`6` are explicit previews and bypass model routing.
- A frozen camera appearance pair takes priority when resolving a real CONTACT.
- An explicit external hint with confidence at least `0.5` is supported for future integration.
- Fixed and cycle modes are development fallbacks.
- Without reliable external input, the safe fallback is Unreadable.

No `Math.random`, previous-result suppression, touch order, A/B identity, or participant waiting time is used to select the six results. Seeded values may shape a choreography after selection, but do not choose its result ID.

## Outcome narratives

These descriptions are interpretive choreography notes, not spoken voice-over scripts or model claims.

### Collision

Two forces genuinely meet, but the meeting compresses, displaces, and rebounds. The hands remain visible after impact. The result speaks about material tension and non-symmetrical aftershock, not victory or failure.

### Soft Merge

Particles, rhythms, and hand boundaries exchange without collapsing two subjects into one. Two cores remain present. The result proposes temporary resonance while preserving difference.

### Desire

The hands are drawn toward a shared interval, repeatedly approach, and remain fractionally unresolved. Desire is expressed as tension, suspension, pursuit, and incomplete arrival rather than romantic certainty.

### Misreading

A gesture is answered at an old, delayed, or displaced coordinate. Both subjects remain present, while the machine's timing and spatial assumption fail to coincide with them.

### Refusal

One or both hands withdraw, turn, or reclaim space. The central field opens rather than punishes. Refusal is treated as boundary and self-protection, not rejection as failure.

### Unreadable

Several organisations almost form and then loosen. The machine cannot stabilise a single classification, but neither participant is erased. Unreadable protects incompleteness from being misrepresented as technical failure.

## Interpretation warning

The routing transforms two outputs from a limited binary appearance classifier into an artwork. The labels and thresholds are authored mechanics. They are not scientifically validated measures of gender, attraction, relationship quality, consent, or future behaviour.
