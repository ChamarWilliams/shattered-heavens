# Gameplay asset pack audit

Manifest: `0.6` — hit polish v6: clip-safe fox attack and bespoke Rei/Seo collision impacts

Li Yunfeng, Seo Jiwon, and Tsukishiro Rei use bespoke direction-specific artwork for all six animation states. Rei's fire-spirit fox has its own authentic eight-direction idle, movement, and pounce sets.

- Dimension errors: 0
- Frames touching their declared cell edge: 0
- Multiple large horizontal-component candidates: 0

Li Yunfeng's v3 masters remain under `artifacts/li-yunfeng-premium-v3/`. Original Seo, Rei, and fox masters remain under `artifacts/bespoke-heroes-v4/`; movement corrections are under `artifacts/polish-v5/`; collision VFX and fox cleanup provenance are under `artifacts/hit-v6/`.

## Direction identity

All three heroes and the fire-spirit fox have distinct N/NE/E/SE/S/SW/W/NW files and render without runtime mirroring.

## Automated defect interpretation

Edge-touching frames are flagged as possible clipping. Multiple large horizontal groups are review candidates for adjacent characters or duplicate fragments. Character and familiar strips keep magical effects separate.

See `artifacts/gameplay-asset-audit.json` for per-frame bounds, anchors, hashes, and candidates. V6 collision and fox-cleanup provenance is recorded in `artifacts/hit-v6/provenance.json`.

## Remaining manual artwork work

No clipping or duplicate-character candidates remain in the engine-ready strips. Fox attack frames retain only their primary connected body, removing detached heads, tails, and fragments. Generated collision VFX remain replaceable prototype art under stable manifest keys.
