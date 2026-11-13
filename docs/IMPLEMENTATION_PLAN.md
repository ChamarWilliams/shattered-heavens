# Animation prototype implementation plan

## Milestone 1 — foundation (implemented)

- Vite + TypeScript + Phaser 3 application shell.
- Pure character state machine supporting idle, movement, attack, ability, hurt, and death.
- Reusable character configuration and registry for Li Yunfeng, Seo Jiwon, and Tsukishiro Rei.
- Phaser test room with collisions, keyboard control, state telemetry, and non-art fallback.
- Animation viewer with state selection, pause/restart, and 0.25–2× speed.
- Metadata schema and validation tests.

## Milestone 2 — artwork intake (implemented from approved board)

- Retain and inspect the approved 1536×1024 RGBA reference board.
- Extract all three characters without resampling into transparent 128×128 atlas cells.
- Author explicit frame rectangles and enable Li Yunfeng, Seo Jiwon, and Tsukishiro Rei.
- Preserve the board's translucent effect backplates and record its shifted heading limitation.

## Milestone 3 — gameplay polish

- Add frame events for attack windows, ability effects, footsteps, and recovery.
- Add direction-specific sequences where artwork supports them.
- Connect networking snapshots to the domain actor and interpolate remote views.

## Acceptance criteria for this prototype

- State logic is testable without Phaser.
- Every requested state can be triggered in the viewer and test room.
- Playback speed changes without changing gameplay timing.
- Missing or unapproved artwork never silently masquerades as production art.
- Production build and automated tests pass.
