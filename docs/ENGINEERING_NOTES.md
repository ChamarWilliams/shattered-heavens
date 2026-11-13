# Shattered Heavens: Engineering Notes

A cultivation-fantasy action roguelite (Phaser 3, TypeScript, Vite). Formerly *Echoes of the Realm*; the old name is kept in the repository and folder names and in saved-data keys so nothing breaks.

Phaser 3 + TypeScript + Vite prototype for Li Yunfeng, Seo Jiwon, and Tsukishiro Rei. It includes a playable test room and an independent animation inspection viewport.

## Run

```powershell
pnpm install
pnpm dev
```

Open `http://127.0.0.1:4173/` and press any key at the title screen.

**Controls.** WASD or the arrow keys move and the mouse aims.
- In the Wayfarers' Pavilion, E talks to the wanderer beside you.
- In a realm, Space attacks, E uses your ability and F interacts (the Peddler, Altar, Bell).
- P pauses. Esc pressed twice abandons the expedition.
- Touch controls appear on phones and tablets.

Online co-op (up to three wanderers, any heroes) is available from the title screen after a Netlify deployment.
The Function endpoint is `/.netlify/functions/game`. Deployment instructions are in `DEPLOY_NETLIFY.md`.

The Combat Lab (`?view=lab`) is the original animation test room. In it, H and K play hurt and death, R resets, and B toggles combat debug rays.

**Further reading:**
- `docs/DESIGN_NOTES.md`: the game loop, the tuning knobs and what to build next.
- `docs/LORE.md`: the world and its vocabulary.
- `docs/AUDIO_BRIEF.md`: every sound and music track the game wants, and where to drop the files.

## Project structure

```text
public/assets/gameplay-kit/       Imported manifest, hero strips, standalone VFX
src/assets/                       Typed manifest adapter
src/characters/                   Reusable hero configs and 8-way direction mapping
src/domain/                       Renderer-independent actor, projectile, seal, summon, and dash logic
src/coop/                         Shared protocol, authoritative simulation, and predictive polling client
src/game/                         Phaser scenes (Pavilion, dungeon run, archive), HUD, loot, traps, room features, audio
src/game/run/                     The dungeon run's helpers: enemy behaviour, special rooms, lore, death sequence
src/assets/audio/                 Drop sound effects and music here (see docs/AUDIO_BRIEF.md)
netlify/functions/game.ts         Co-op room-code Function backed by strongly consistent Netlify Blobs
src/ui/                           Viewer controls and telemetry
tests/                            Direction, state, combat, and manifest tests
tools/audit_gameplay_pack.py      Pixel/dimension/directional audit
tools/import_li_premium_v3.py     Repack Li's bespoke 8-way masters and VFX
tools/import_redesigned_li_motion.py  Repack approved Li idle/move edits
tools/import_polish_v5.py        Rebuild Seo/Rei locomotion, shadow anchors, and Seo VFX
tools/import_hit_v6.py           Clean fox attacks and repack bespoke collision VFX
tools/smoke-test.cjs              Browser integration validation
docs/GAMEPLAY_ASSET_AUDIT.md      Manual and automated art defect report
```

## Asset contract

- Hero strips are transparent RGBA PNGs described by `manifest.json` and currently use 384×384 frames.
- Every hero animation exposes authentic N, NE, E, SE, S, SW, W, and NW artwork across idle, movement, basic attack, active ability, hurt, and death. Rei's fire-spirit fox also has independent eight-direction idle, movement, and pounce sets.
- Character strips, projectile sprites, trails, summons, impacts, collision shapes, and gameplay entities remain separate.
- Replacement art must preserve manifest keys and frame dimensions, or update the manifest. Li's premium masters are retained under `artifacts/li-yunfeng-premium-v3/`; the v5 Seo/Rei corrective masters, prompt record, and deterministic provenance are under `artifacts/polish-v5/`.
- Display origins and measured frame corrections are rendering metadata. Collision and damage never depend on opaque pixels.

## Implementation plan and status

1. Validate archive paths, PNG dimensions/alpha, frame bounds, duplicate candidates, and directional authenticity. Complete.
2. Load the manifest through one typed asset adapter and expose all 144 hero/direction/state combinations in the viewer. Complete.
3. Separate `movementDirection`, `facingDirection`, and free `aimAngle` in renderer-independent state. Complete.
4. Drive attack/ability release from animation events. Complete.
5. Implement standalone Flying Sword, Nightfold Echo, and fire-spirit fox entities/VFX. Complete.
6. Keep projectile count, damage, speed, collision radius, lifetime, and dash values in character configuration. Complete.
7. Validate all viewer combinations and ability behavior in a real browser. Complete.
8. Replace all hero and familiar fallbacks with genuine eight-direction art and clean the defects in the audit report. Complete.
9. Replace Li's frozen idle and repeated movement poses with an approved four-frame breathing loop and six-frame movement cycle. Complete.
10. Add Li's bespoke Sectless Sword Array visual language across melee, cast, projectile, trail, summon, and impact effects. Complete.
11. Turn Flying Sword into the Sectless Seal combo system: projectiles mark targets, melee recalls marks for an area burst, and expired marks detonate at reduced power. Complete.
12. Rebuild Rei as a summoner with a persistent, independently targeting directional fire-spirit fox. Complete.
13. Rebuild Seo and Rei locomotion around contact, compression, passing, and lift phases; anchor shadows to each rendered frame; replace Seo's generic slash/dash effects; and stabilize Rei's fox during owner movement. Complete.
14. Add Yunfeng's four-sword cultivator rack and launch formation, clean duplicated fox attack fragments, and add bespoke Rei/Seo collision impacts. Complete.

Attacks and abilities allow normal movement while their animation state remains locked. Aim is sampled again at the configured release event, so last-second cursor changes affect the fired direction. The normal cursor guide is removed; B shows optional combat-debug rays only. Melee attacks render a short-lived slash and collision circle at the actual configured hitbox center.

## Signature combat mechanics

- **Li Yunfeng — Four-Sword Sectless Array:** four swords float tightly behind him with every blade fixed vertically upward. Their behind-body position follows his eight-way character direction, never the cursor, and natural overlap means some may be occluded. The rack remains completely stationary and behind his character during melee; his authored character animation supplies the hand sword. His ability pulls all four floating swords into a character-relative forward orbit, then the final launch samples live aim at −24°, −8°, +8°, and +24°.
- **Seo Jiwon — Void Shear / Nightfold Echo:** his melee uses a dedicated violet-gold shear and impact at the configured hitbox. Nightfold emits separate directional trail and fold effects, dashes through its target line, then resolves its delayed echo. VFX identities, scales, timing, damage, and dash distance are character configuration data.
- **Tsukishiro Rei — Moonlit Menagerie:** her ability summons one persistent directional fire-spirit fox for 7.2 seconds. The familiar follows with smoothed motion, acquires the nearest living target, locks its attack facing during each pounce, fires independently, applies slow on hit, and remains stable while Rei moves. Familiar count, duration, orbit, attack cadence, range, bolt damage, collision, and lifetime are configuration data.
- **Tsukishiro Rei — Moonfire Halo passive:** basic foxfire hits grant one orbiting wisp for eight seconds, up to three. Each held stack adds 4% movement speed and +1 basic-bolt damage. Summoning the fox consumes the halo; every consumed stack adds 0.7 seconds of duration and makes the familiar attack 12% faster. All values are configuration data.
- Both systems are deterministic domain simulations. Phaser only renders their snapshots, so a future multiplayer server can own summons, seals, projectiles, hits, and detonation events.

## Multiplayer boundary

Combat simulation is independent from Phaser rendering. `FlyingSwordSystem` already accepts an authority mode and consumes deterministic cast commands. The current room uses `local-prototype`; a multiplayer implementation should create and resolve casts on the server, replicate snapshots/events to clients, and treat Phaser views as presentation only.

## Validation

```powershell
pnpm check
pnpm build
```

Current result: 86 tests passing, production build successful, the Netlify Function bundling as Node 22 ESM, and all three dungeon heroes passing browser combat smoke tests without console errors. Coverage includes continuous collision, deterministic combat randomness, action phases, two-player membership/input/revive simulation, randomized realms, and distinct enemy projectile roles.
