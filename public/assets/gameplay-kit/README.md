# Shattered Heavens — gameplay asset integration kit (prototype)

## What is included
- 3 heroes x 6 animations x 8 named direction strips (144 PNG strips) and individually numbered transparent 384x384 frames.
- Reusable isolated VFX sets for Flying Sword, Nightfold Echo, and Rei's fire-spirit fox.
- Reference art and a JSON manifest.
- A Phaser loading and direction-selection example.

## CRITICAL LIMITATION
THE EIGHT DIRECTIONS ARE **NOT** eight genuine hand-drawn perspective views. The old source boards contain just one approximate facing with art defects. Leftward directions use horizontal mirroring; other directions reuse source frames. This kit is **engine-integrable placeholder art**, NOT a finished directional animation set. Do not tell a client that these are authentic eight-direction sprites. Original frames can still contain labels, adjacent fragments, and inconsistencies.

## How to use
Load directional strip texture files with Phaser.load.spritesheet(...,{frameWidth:384,frameHeight:384}). Each strip is a horizontal strip of exactly N 384x384 frames. Use frame origin 0.5, 0.75 and collision separate from display. For early gameplay, validate all animations with debug scene and use per-sprite scale ~0.33 or better a rescaled asset pipeline.

VFX are true programmatic transparent RGBA graphics at exact sizes, and are intentionally simple placeholders. Projectile entities, hitboxes, and motion are code, not graphics. See src/ and manifest.

## NEXT ART PRODUCTION TASKS
Draw true N/NE/E/SE/S/SW/W/NW base character poses for each hero from the same locked proportions. Then animate 4-frame idle, 6-frame movement, 5-frame basic attack, 8-frame ability, 3-frame hurt. Death can initially share a single direction. Export raw transparent frame files with one character per frame, stable ground anchor and no texts or UI. Replace individual placeholders without changing animation keys.

## Updated directional reference
`reference_only/latest_directional_concept_NOT_SLICED.png` remains reference-only and must not be auto-sliced. The engine-ready hero strips under `assets/heroes/` and fox strips under `assets/familiars/` are normalized bespoke directional assets; the original supplied boards are retained only for provenance and comparison.
