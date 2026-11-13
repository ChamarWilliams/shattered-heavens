# Gameplay asset pack audit

Manifest: `0.2` — prototype assets; Li Yunfeng premium bespoke 8-direction v3; Seo/Rei directional fallbacks

Li Yunfeng uses bespoke, direction-specific artwork for all six animation states. Seo Jiwon and Tsukishiro Rei retain declared directional fallbacks.

- Dimension errors: 0
- Frames touching a 384×384 edge: 0
- Multiple large horizontal-component candidates: 0

Li Yunfeng's complete v3 character and VFX set is user-approved bespoke generated artwork. High-resolution masters and deterministic 384x384 repack metadata are retained under `artifacts/li-yunfeng-premium-v3/`. Seo and Rei remain curated from supplied pixels.

## Direction fallback identity

Li Yunfeng's N/NE/E/SE/S/SW/W/NW files contain distinct viewpoint artwork and render without runtime mirroring. Seo and Rei retain byte-identical fallback files; their SW/W/NW views are mirrored at runtime.

## Automated defect interpretation

Edge-touching frames are flagged as possible clipping. Multiple large horizontal groups are review candidates for adjacent characters or duplicate fragments. Li's character strips intentionally keep all magical effects separate.

See `artifacts/curated-gameplay-asset-audit.json` for per-frame bounds, anchors, hashes, and candidates. Li v3 source provenance is recorded in `artifacts/li-yunfeng-premium-v3/provenance.json`.

## Remaining manual artwork work

Li's idle, movement, attack, ability, hurt, and death states now have eight distinct viewpoints. The runtime frames use authored key poses plus restrained engine-normalized transition frames. Seo and Rei still require dedicated true eight-direction source art.
