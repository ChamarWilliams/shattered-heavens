# Reference board validation — 2026-10-26

Source: `public/assets/source/character-reference-board.png`

## Confirmed

- Dimensions: 1536×1024.
- Pixel format: 32-bit RGBA.
- Transparent pixels are present; large unused regions have alpha `0`.
- Three character groups are present: Li Yunfeng, Seo Jiwon, and Tsukishiro Rei.
- Numbered sequence groups support 4 idle, 6 move, 5 attack, 8 ability, 3 hurt, and 6 death frames in the project metadata.
- Extraction is nearest-neighbor/source-copy only. No frame is redrawn, regenerated, or rescaled.

## Known source limitations

- The board is a presentation/reference layout, not an engine-authored atlas.
- Several headings are shifted relative to the numbered art groups.
- Translucent colored backplates and effect trails are embedded in the supplied pixels.
- Some effects cross apparent frame boundaries, so edge fragments remain visible in adjacent cells.
- The text saying “64x64 per frame” does not match the measured character/effect bounds. The extracted atlas therefore uses 128×128 cells without scaling the source.

These limitations are preserved rather than silently repainted. A future production-art pass should start from the original per-frame source exports if they become available.

## Frames v2 update

- Imported Li Yunfeng's supplied 384×384 per-frame sheets from `echoes_of_the_realm_frames_v2.zip`.
- Idle feet use a shared measured pivot at `(200, 319)`.
- The lower body below source Y `286` is held from idle frame 1 across all four idle frames, eliminating stepping while preserving upper-body breathing, hair, and clothing changes.
- The projectile and impact placeholders were isolated from supplied ability frame 8 because the ZIP did not include standalone projectile/VFX files.
- Ability rendering keeps projectiles out of the character sprite: frames 1–4 use the corrected idle body as a clean wind-up and frames 5–8 hold the isolated release pose.
- Remaining manual cleanup: text-label fragments and cross-frame effect fragments are still present in some move, attack, hurt, and death frames. A final character-only casting sequence and final standalone projectile, trail, and impact exports are still needed. The current extracted VFX is suitable for functionality, not production art.
