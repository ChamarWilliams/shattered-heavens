# Character asset requirements

The source reference board is not treated as a spritesheet. No grid size, transparency, frame boundary, timing, pivot, or sequence order is assumed.

## Required delivery

- One lossless transparent PNG per logical sheet; indexed or RGBA PNG is accepted.
- One metadata JSON file matching `CharacterAssetManifest` in `src/characters/types.ts`.
- Explicit pixel rectangle for every frame: `x`, `y`, `width`, `height`.
- Explicit frame names and ordered frame names for every animation.
- Duration per animation in milliseconds, loop behavior, and interruptibility.
- Consistent foot pivot per frame, plus gameplay hurtbox and optional hitbox data.
- Nearest-neighbor sampling; no baked scaling, glow, room background, UI, labels, or guides.

## Validation gate

Before enabling a sheet, record the following in a review report:

1. PNG dimensions and color mode.
2. Presence of real alpha pixels (`alpha < 255`) and absence of matte/background pixels.
3. Measured nontransparent bounds for each proposed frame.
4. Duplicate, clipped, empty, or visually inconsistent frames.
5. Ground/pivot alignment and direction labels.
6. Playback review for idle, move, attack, ability, hurt, and death.
7. Approval status. Rejected or ambiguous frames remain disabled.

Place approved files under `public/assets/characters/<id>/`. Set the character config's `asset.enabled` to `true` only after validation.
