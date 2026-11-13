# Corrective polish v5

## What changed

- Seo Jiwon and Tsukishiro Rei movement strips now use eight visual frames built from four readable locomotion phases: contact, compression, passing, and lift. Every pose is independently normalized to a shared ground line, so animation motion does not move the gameplay entity.
- Seo's basic attack uses standalone `seo_void_shear` and `seo_void_shear_impact` effects at the configured melee hitbox. Nightfold uses independent `seo_nightfold_trail` and `seo_nightfold_fold` effects instead of the old generic dot trail.
- Every hero direction/state definition now carries a `shadowAnchors` entry for every rendered frame. `CharacterView` uses the active frame's opaque bounds, which keeps Seo's death shadow centered beneath the fallen body.
- Rei's summon projectile art is rotated 180 degrees relative to its travel heading because its source sprite points left. The summon cast effect no longer inherits the aim rotation.
- The fire-spirit fox uses deterministic frame selection from domain `stateElapsedMs`. Direction changes preserve phase, attack facing stays locked for the attack window, owner following is smoothed, and Phaser animation restarts are eliminated.
- Fox movement is constrained to a padded room rectangle and shares the same Y-depth formula as Rei, so it cannot leave the visible play area or incorrectly draw across her body. Its render scale is reduced from 0.46 to 0.38.
- Rei now has Moonfire Halo: basic hits build up to three animated wisps around her. Held stacks grant movement speed and basic damage; her summon consumes the stacks to extend the fox's duration and shorten its attack interval.

## Expansion boundaries

- Domain systems own state, position, facing, hit resolution, damage, and lifetime. Phaser views only render snapshots.
- Hero combat VFX are selected by character configuration rather than hero-specific branches inside the renderer.
- Transient VFX use a bounded sprite pool (maximum 12 retained sprites per effect) to avoid repeated object allocation during combat.
- Visual frame counts come from the asset manifest, while gameplay event timing remains in character configuration. New art can add visual in-betweens without changing authoritative combat timing.
- Familiar count, movement, targeting, attacks, damage, and lifetime remain configuration data suitable for future server-authoritative replication.

## Validation

- 42 automated tests pass.
- Production build succeeds.
- Browser smoke test passes all 144 hero/state/direction combinations with no console errors.
- Targeted browser checks confirm Seo's VFX, centered death shadow, Rei's three-wisp passive, stack consumption, empowered summon, projectile orientation, padded fox bounds, shared Y-depth, one stable fox during diagonal owner movement, and no fox Phaser animation restart.
- Asset audit reports zero dimension errors, zero edge-touching frames, and zero duplicate-component candidates.

## Remaining art polish

The v5 movement key poses and Seo effects are functional prototype artwork, not locked final art. A final pixel-art pass can refine hair strands, coat hems, foot-contact silhouettes, and VFX shapes while preserving the manifest keys and architecture.
