# Updated-frame automated audit

> Rejected for live use on October 27, 2026. The updated archive produced worse hard clipping than the previous pack, so the live prototype was rolled back. This report is retained as evidence for why those cuts were rejected.

- Frames inspected: 96
- Declared size/alpha: all frames are 384x384 transparent RGBA PNGs
- Significant source-partition boundary contacts: 57

A boundary contact means at least 20 opaque pixels meet a crop partition from the original board. It is a clipping-risk signal, not proof that every contacted pixel is a duplicate character.

## Significant boundary-contact filenames

- `li_yunfeng/idle/frame_03.png`
- `li_yunfeng/move/frame_02.png`
- `li_yunfeng/move/frame_03.png`
- `li_yunfeng/move/frame_04.png`
- `li_yunfeng/move/frame_05.png`
- `li_yunfeng/basic_attack/frame_03.png`
- `li_yunfeng/basic_attack/frame_04.png`
- `li_yunfeng/active_ability/frame_02.png`
- `li_yunfeng/active_ability/frame_03.png`
- `li_yunfeng/active_ability/frame_04.png`
- `li_yunfeng/active_ability/frame_05.png`
- `li_yunfeng/active_ability/frame_06.png`
- `li_yunfeng/active_ability/frame_07.png`
- `li_yunfeng/hurt/frame_02.png`
- `li_yunfeng/death/frame_02.png`
- `li_yunfeng/death/frame_03.png`
- `li_yunfeng/death/frame_04.png`
- `li_yunfeng/death/frame_05.png`
- `seo_jiwon/idle/frame_03.png`
- `seo_jiwon/move/frame_05.png`
- `seo_jiwon/basic_attack/frame_03.png`
- `seo_jiwon/basic_attack/frame_04.png`
- `seo_jiwon/basic_attack/frame_05.png`
- `seo_jiwon/active_ability/frame_02.png`
- `seo_jiwon/active_ability/frame_03.png`
- `seo_jiwon/active_ability/frame_04.png`
- `seo_jiwon/active_ability/frame_05.png`
- `seo_jiwon/active_ability/frame_06.png`
- `seo_jiwon/active_ability/frame_07.png`
- `seo_jiwon/hurt/frame_02.png`
- `seo_jiwon/death/frame_02.png`
- `seo_jiwon/death/frame_03.png`
- `seo_jiwon/death/frame_04.png`
- `seo_jiwon/death/frame_06.png`
- `tsukishiro_rei/idle/frame_04.png`
- `tsukishiro_rei/move/frame_02.png`
- `tsukishiro_rei/move/frame_03.png`
- `tsukishiro_rei/basic_attack/frame_01.png`
- `tsukishiro_rei/basic_attack/frame_02.png`
- `tsukishiro_rei/basic_attack/frame_03.png`
- `tsukishiro_rei/basic_attack/frame_04.png`
- `tsukishiro_rei/basic_attack/frame_05.png`
- `tsukishiro_rei/active_ability/frame_01.png`
- `tsukishiro_rei/active_ability/frame_02.png`
- `tsukishiro_rei/active_ability/frame_03.png`
- `tsukishiro_rei/active_ability/frame_04.png`
- `tsukishiro_rei/active_ability/frame_05.png`
- `tsukishiro_rei/active_ability/frame_06.png`
- `tsukishiro_rei/active_ability/frame_07.png`
- `tsukishiro_rei/active_ability/frame_08.png`
- `tsukishiro_rei/hurt/frame_02.png`
- `tsukishiro_rei/death/frame_01.png`
- `tsukishiro_rei/death/frame_02.png`
- `tsukishiro_rei/death/frame_03.png`
- `tsukishiro_rei/death/frame_04.png`
- `tsukishiro_rei/death/frame_05.png`
- `tsukishiro_rei/death/frame_06.png`

## Loop alignment warnings

- `li_yunfeng/idle`: foot-center span 23.62 px; ground span 3 px
- `li_yunfeng/move`: foot-center span 133.19 px; ground span 31 px
- `seo_jiwon/idle`: foot-center span 18.38 px; ground span 1 px
- `seo_jiwon/move`: foot-center span 32.15 px; ground span 4 px
- `tsukishiro_rei/move`: foot-center span 31.98 px; ground span 5 px

See the JSON report for every frame's bounding box, source boundary contacts, ground position, and measured foot center.

## Manual visual review

The following filenames still show an adjacent pose or character fragment. These are visually confirmed, not merely automated boundary warnings:

- `li_yunfeng/idle/frame_01.png`
- `li_yunfeng/idle/frame_02.png`
- `li_yunfeng/idle/frame_03.png`
- `li_yunfeng/move/frame_01.png`
- `li_yunfeng/move/frame_02.png`
- `li_yunfeng/move/frame_03.png`
- `li_yunfeng/move/frame_04.png`
- `li_yunfeng/move/frame_05.png`
- `li_yunfeng/basic_attack/frame_01.png`
- `li_yunfeng/basic_attack/frame_03.png`
- `li_yunfeng/basic_attack/frame_04.png`
- `li_yunfeng/hurt/frame_01.png`
- `li_yunfeng/hurt/frame_02.png`
- `li_yunfeng/death/frame_01.png`
- `li_yunfeng/death/frame_02.png`
- `li_yunfeng/death/frame_03.png`
- `li_yunfeng/death/frame_04.png`
- `li_yunfeng/death/frame_05.png`
- `seo_jiwon/death/frame_02.png`
- `seo_jiwon/death/frame_03.png`
- `tsukishiro_rei/basic_attack/frame_01.png`
- `tsukishiro_rei/basic_attack/frame_02.png`
- `tsukishiro_rei/basic_attack/frame_04.png`
- `tsukishiro_rei/hurt/frame_02.png`
- `tsukishiro_rei/death/frame_01.png`
- `tsukishiro_rei/death/frame_02.png`
- `tsukishiro_rei/death/frame_03.png`

The following filenames show a character body cut short rather than a complete isolated pose:

- `li_yunfeng/idle/frame_04.png`
- `li_yunfeng/move/frame_06.png`
- `li_yunfeng/basic_attack/frame_05.png`
- `li_yunfeng/hurt/frame_03.png`
- `li_yunfeng/death/frame_06.png`
- `seo_jiwon/death/frame_01.png`
- `tsukishiro_rei/basic_attack/frame_05.png`
- `tsukishiro_rei/hurt/frame_03.png`

All 24 `active_ability/frame_01.png` through `frame_08.png` files remain source-board composites with embedded, partition-clipped VFX. Normal gameplay continues to use the standalone Flying Sword, Shadow Dash, and Foxfire assets instead of displaying these baked VFX; the animation viewer intentionally exposes the raw frames for review.

Idle alignment is corrected at render time for all three heroes using measured ground/foot offsets. The movement loops listed above cannot be made visually stable through translation alone because their source frames contain missing or neighboring pose pixels.
