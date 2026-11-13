# Shattered Heavens — Architecture, Current State, and Remaining Work

Updated: October 30, 2026

This document is the primary handoff for the current playable build. It explains what the project is, how the major systems connect, what is already implemented, what remains unfinished, and how each remaining item should be validated.

## 1. Current product state

Shattered Heavens (formerly Echoes of the Realm) is currently a playable Phaser 3, TypeScript, and Vite action-roguelite prototype with:

- A title screen, Realm Hall lobby, Grand Archive, combat lab, and generated dungeon run.
- Three selectable heroes: Li Yunfeng, Seo Jiwon, and Tsukishiro Rei.
- Eight-direction movement and directional animation rendering.
- Hero-specific attacks, abilities, passives, projectiles, summons, and VFX.
- Three dungeon themes with authored room artwork and generated room graphs.
- Animated enemies, several enemy roles, themed projectiles, boss encounters, damage, death, room clearing, and progression.
- Desktop and touch input modes.
- A two-player room-code co-op architecture backed by a Netlify Function and Netlify Blobs.
- A Netlify-ready source package.

The game is a substantial vertical slice, not a content-complete commercial release. The most important remaining work is live gameplay validation, collision refinement, boss/portal completion testing, co-op deployment testing, and additional content/polish.

## 2. Technology and runtime architecture

| Layer | Technology | Responsibility |
| --- | --- | --- |
| Shell/UI | HTML and CSS | Title, overlays, dialogs, HUD controls, settings, hero selection, co-op room UI |
| Game rendering | Phaser 3 | Scenes, sprites, room art, animation, VFX, camera, keyboard/pointer input |
| Gameplay | TypeScript domain systems | Character state, abilities, projectiles, collision, dungeon generation, combat rules |
| Local build | Vite | Development server and production client bundle |
| Testing | Vitest and Playwright smoke scripts | Unit, integration, room-transition, and rendered gameplay checks |
| Multiplayer API | Netlify Function | Room creation, authentication, authoritative simulation, conditional writes |
| Multiplayer storage | Netlify Blobs | Strongly consistent room records with ETag conflict protection |

High-level flow:

```text
HTML/CSS game shell
  ├─ Title / Settings / Co-op dialogs
  ├─ Animation lab Phaser game
  └─ Main Phaser game
       ├─ Realm Hall
       ├─ Grand Archive
       └─ Dungeon Run
            ├─ CharacterActor state machine
            ├─ CharacterView renderer
            ├─ Hero-specific ability systems
            ├─ Dungeon generator + authored room masks
            ├─ Enemy AI + projectile patterns
            └─ Optional CoopClient
                    ↕ HTTP polling
               Netlify Function
                    ↕ conditional ETag writes
               Netlify Blobs
```

## 3. Important project locations

| Path | Purpose |
| --- | --- |
| `index.html` | Game shell, overlays, dialogs, title screen, touch controls |
| `src/main.ts` | Client entry point and Phaser game creation |
| `src/ui/setupGameShell.ts` | Screen routing, hero selection, input mode, dialogs, settings, co-op UI |
| `src/style.css` | Responsive UI, HUD, dialogs, title, lobby, mobile controls |
| `src/game/LobbyScene.ts` | Realm Hall player, NPC wandering, dialogue, gate and archive entry |
| `src/game/ArchiveScene.ts` | Grand Archive map and return transition |
| `src/game/TestRoomScene.ts` | Animation/combat lab |
| `src/game/DungeonRunScene.ts` | Dungeon combat, AI, rooms, boss flow, VFX, HUD, co-op presentation |
| `src/domain/CharacterActor.ts` | Rendering-independent character action state machine |
| `src/game/CharacterView.ts` | Character sprite rendering and directional frame selection |
| `src/characters/` | Reusable character configurations and direction helpers |
| `src/domain/FlyingSwordSystem.ts` | Independent projectile simulation used by hero abilities |
| `src/domain/FoxfireSummonSystem.ts` | Rei familiar behavior |
| `src/domain/ShadowDashSystem.ts` | Seo dash movement and hits |
| `src/domain/SectlessSealSystem.ts` | Li Yunfeng seal/return behavior |
| `src/dungeon/` | Room templates, themes, masks, procedural generation, combat pattern helpers |
| `src/coop/protocol.ts` | Network request/snapshot types |
| `src/coop/CoopClient.ts` | Polling, reconnect, local input, prediction/interpolation data |
| `src/coop/simulation.ts` | Authoritative two-player room simulation |
| `netlify/functions/game.ts` | Netlify Function endpoint at `/.netlify/functions/game` |
| `public/assets/gameplay-kit/` | Approved hero, familiar, projectile, and VFX assets |
| `public/assets/dungeons/` | Dungeon room, enemy, and projectile art by theme |
| `tests/` | Unit and domain integration tests |
| `tools/smoke-dungeon-combat.mjs` | Rendered hero/combat configuration smoke test |
| `tools/smoke-doorways.mjs` | Lobby, archive, room-mask, and doorway smoke test |
| `netlify.toml` | Production build, publish, Function, and caching configuration |

## 4. Scene and navigation flow

```text
Title
  ├─ Play → Realm Hall
  ├─ Online Co-op → host/join room → Realm Hall
  └─ Settings

Realm Hall
  ├─ Walk to NPC → dialogue → switch hero
  ├─ Walk through left archive entrance → Grand Archive
  └─ Walk into Realm Gate → randomized dungeon run

Grand Archive
  └─ Walk through right entrance → Realm Hall

Dungeon Run
  ├─ Clear ordinary rooms → traverse authored door openings
  ├─ Defeat theme boss → themed portal
  ├─ Enter portal → next randomized theme
  └─ Enter final portal → Realm Hall
```

The lobby and archive do not use artificial “Enter” buttons. Transitions are intended to happen by walking through the correct map opening.

## 5. Character architecture

### Shared structure

Each hero uses a reusable `CharacterConfig` containing movement speed, health, animation durations, frame events, attack data, ability data, assets, and render scale.

`CharacterActor` owns gameplay state without drawing sprites. Its primary states are:

```text
idle → move
idle/move → attack windup → active → recovery → idle
idle/move → ability windup → active → recovery → idle
any valid state → hurt → idle
any state → death
```

`CharacterView` reads actor state and renders the matching directional sprites. Movement facing is based on movement direction. Aim-facing is used only for actions that need aim direction.

### Li Yunfeng

- Four cultivator swords float behind him as a character feature.
- Basic attack uses his dedicated melee animation and slash hit VFX.
- Active ability uses independent flying sword projectiles.
- Flying swords have individual movement, collision, damage, trails, impacts, and lifetime.
- Sectless Seal behavior adds a more meaningful return/detonation loop.

### Seo Jiwon

- Basic attack uses bespoke void-shear presentation and hit VFX.
- Active ability is a shadow dash with independent movement and collision.
- Shadow echoes and Nightfold effects support his assassin identity.

### Tsukishiro Rei

- Basic attacks use independent foxfire projectiles and hit VFX.
- Active ability summons an independently rendered fire-spirit fox.
- Moonfire stacks orbit Rei and influence her kit.
- Familiar idle, movement, and attack rendering use eight-direction mappings.

## 6. Asset rules and current asset status

- Existing artwork is treated as source material, not automatically assumed to be engine-ready.
- The gameplay manifest defines frame size, frame count, direction fallback, and effect metadata.
- Direction placeholders are not represented as authentic eight-direction art.
- Standalone effects remain separate from character sprite sheets.
- No replacement artwork should be generated without explicit approval.
- Directional sprite cleanup is still needed for any frame that clips, jitters, contains duplicate fragments, or has inconsistent feet/shadow anchors.

The current runtime manifest is `src/assets/gameplay-manifest.json` and the approved runtime assets are under `public/assets/gameplay-kit/`.

## 7. Dungeon architecture

### Themes

1. Sectless Sky Temple
2. Nightfold Shadow Crypt
3. Moonlit Foxfire Shrine

Each theme has authored room images for multiple static door masks. Doors are selected before the room is shown; runtime walls are not supposed to open by drawing over the artwork.

### Generation

`DungeonGenerator` creates a deterministic graph from a seed. Rooms select an authored mask matching their north/east/south/west connections. The run shuffles theme order from the seed.

### Collision

The dungeon room image is 19 by 13 logical tiles. Collision now uses a three-tile-deep masonry band matching the visible wall depth. Only actual door corridors cut through that band.

This recently fixed the defect where characters could walk across the painted top and bottom walls. The same inner-floor bounds were added to the authoritative co-op simulation.

### Enemy roles

- Hunter: approaches and performs close-range pressure.
- Shooter: keeps range and fires heavier projectiles.
- Sentinel: pattern-based area denial.
- Boss: theme-specific multi-phase attacks with an enraged threshold.

Enemy projectiles use distinct theme/role art instead of sharing one sword projectile.

## 8. Boss and portal system — current in-progress state

The previous behavior removed the defeated boss immediately and showed a simple circle requiring an interaction key. That behavior was not acceptable.

The current code now implements:

- A boss-specific dissolve instead of instant disappearance.
- A theme-matched defeat burst using existing approved VFX.
- A portal assembled from rotating runes, an animated core, motes, glow, and a theme-specific glyph.
- Existing approved VFX for portal opening and arrival:
  - Sectless: flying sword summon/impact effects.
  - Nightfold: shadow fold/void impact effects.
  - Foxfire: foxfire summon/moonfox impact effects.
- Automatic activation when the hero walks into the portal.
- Intermediate portals lead to the next dungeon theme.
- The final portal returns to the Realm Hall.
- Co-op boss progression now requires an authoritative player to be physically near the portal center.

This implementation compiles and the unit suite passes, but it still requires a complete visual playthrough of all three themes. Treat that verification as the first task when work resumes.

## 9. Multiplayer architecture

### Current model

- Maximum two players.
- Host creates a six-character room code.
- Guest joins with the code.
- Each player receives a server-generated ID and private session token.
- Tokens are not included in public room snapshots.
- Client sends monotonic input and action serials.
- Netlify Function owns room state.
- Netlify Blobs stores room records using strong consistency.
- Conditional ETag writes prevent two simultaneous player updates from silently overwriting each other.
- Bounded retries resolve ordinary write conflicts.

### Synchronized state

- Player position, health, hero, downed state, and revive progress.
- Enemy position, health, target behavior, and attack phase.
- Theme order, room index, room clear state, objective, and completion.
- Damage contribution and connection state.

### Client presentation

- Local movement is predicted.
- Authoritative snapshots reconcile local position.
- Remote movement is interpolated.
- Bespoke hero VFX remain client-side presentation while damage is resolved authoritatively.

### Important limitation

Transport uses approximately 140 ms polling, not persistent WebSockets. This is appropriate for a zero-setup Netlify-only prototype, but it will not provide competitive low-latency action-game networking. A later production version should use an authoritative persistent game server or edge/WebSocket service.

## 10. Input and controls

### Desktop

| Control | Action |
| --- | --- |
| WASD or arrow keys | Move |
| Mouse pointer | Aim |
| Space or primary attack control | Basic attack |
| E | Active ability |
| F | Context interaction/revive where applicable |
| P | Pause |
| Escape | Return to hall from dungeon |

### Mobile

- Platform/input mode is detected from pointer capability and live touch input.
- On-screen directional controls drive the same movement event path as desktop input.
- Attack and ability buttons emit the same gameplay events as keyboard controls.

Mobile still needs a full real-device pass for multi-touch, safe-area insets, small landscape screens, accidental page gestures, and long-session performance.

## 11. Current validation status

Before this handoff:

- TypeScript compiled successfully.
- The unit/integration suite passed before the final documentation pause.
- Dungeon hero/combat smoke testing passed for all three heroes.
- Lobby/archive/doorway smoke testing passed.
- Production Vite build passed.
- Netlify Function bundled successfully in the previous packaging pass.

The most recent functional additions are the boss dissolve and themed portal flow. Those changes passed TypeScript and the existing test suite, but the new portal must still be visually verified through all three bosses before the release package is considered final.

## 12. Remaining work, ordered by priority

### P0 — Required before uploading a public beta

#### 1. Complete boss portal verification

- Defeat each of the three theme bosses.
- Confirm the boss dissolves instead of snapping out.
- Confirm the correct theme opening effect plays.
- Confirm the portal remains visible and does not cover the player incorrectly.
- Walk into the portal without pressing a button.
- Confirm themes one and two load the next dungeon.
- Confirm the third portal returns to the Realm Hall.
- Confirm hero selection, health rules, power, and animation systems remain valid after transition.
- Repeat once in two-player co-op.

Acceptance: no missing hero, black screen, duplicate portal, stuck transition, incorrect theme, or interaction-key requirement.

#### 2. Full dungeon collision pass

- Test all door-mask variants in all three themes.
- Walk continuously against every visible wall edge and corner.
- Verify only real door openings permit passage.
- Verify dash, knockback, summon movement, server reconciliation, and room spawn cannot place actors in walls.
- Check boss and enemy footprints against the new deeper wall band.

Acceptance: the player’s feet never enter painted masonry and transitions remain reachable.

#### 3. Hero persistence and room-transition pass

- Start as each hero from the lobby.
- Clear multiple rooms and cross several doors.
- Enter the next theme through a boss portal.
- Confirm HUD, sprite, stats, basic attack, ability system, passive, and VFX remain the selected hero’s implementation.

Acceptance: no transition silently changes the hero or leaves an old hero system active.

#### 4. Boss and enemy fairness pass

- Measure telegraph time, projectile speed, gap width, recovery, and density in the smallest rooms.
- Ensure every pattern has a readable escape route.
- Prevent overlapping enemies from generating unavoidable combined patterns.
- Verify enraged boss phases are harder without becoming undodgeable.

Acceptance: every attack can be understood and avoided by normal movement on desktop and mobile.

#### 5. Production co-op deployment test

- Deploy to Netlify.
- Host on one physical device and join from another network/device.
- Test reconnect, room transitions, hero combinations, enemy health, down/revive, boss portal, final return, and stale-room behavior.
- Inspect Function logs and Blob conflict retries.

Acceptance: two players can complete a run without permanent desync or manual state repair.

### P1 — Required for a polished beta

#### 6. Mobile usability and responsive QA

- Test iOS Safari and Android Chrome.
- Validate touch joystick/button simultaneous input.
- Add safe-area padding for notches and home indicators.
- Confirm readable HUD scale at common mobile landscape sizes.
- Prevent browser navigation gestures and unwanted text selection.
- Test resume after tab backgrounding and device rotation.

#### 7. Animation QA matrix

For every hero and familiar, verify idle, move, attack, ability, hurt, and death across eight directions.

Flag by exact filename:

- Clipped body/effect pixels.
- Duplicate character fragments.
- Feet/pivot drift.
- Shadow anchor drift.
- Incorrect direction.
- Idle frames that resemble walking.
- Movement frames with only one convincing leg motion.

Do not repaint or replace source artwork without approval.

#### 8. Combat feel tuning

- Tune hit-stop per attack weight.
- Tune camera kick and screen shake limits.
- Balance damage numbers and overlap prevention.
- Add consistent hit confirmation audio by damage type.
- Review cancel windows, buffer duration, recovery, and movement during abilities.
- Verify melee slash VFX exactly matches the damaging hitbox.

#### 9. Audio implementation

The code currently includes procedural feedback hooks, not a complete authored soundscape.

Needed:

- Hero attack/ability sounds.
- Enemy-role attacks and telegraphs.
- Boss phase and death audio.
- Portal opening and travel audio.
- Lobby/archive/dungeon ambience.
- Music transitions by theme.
- Volume categories and mute behavior.

#### 10. UI and accessibility polish

- Finalize custom dialogue and notification styling.
- Add clear tutorial prompts that disappear after first use.
- Improve pause/settings behavior during co-op.
- Add remappable controls.
- Add color-blind-safe telegraph options.
- Verify text contrast and scaling.
- Add co-op latency/reconnect indicator without clutter.

### P2 — Content and production expansion

#### 11. More authored room variants

- At least four strong gameplay layouts per theme for each useful connection count.
- Deliberate arenas for melee, ranged, summon, and boss play.
- Theme-specific hazards and interactable props.
- Reward, event, rest, and challenge rooms.

#### 12. Enemy roster expansion

- Multiple unique enemies per theme, not palette-only variants.
- Individual silhouettes, animation sets, projectile families, audio, and tactics.
- Support units, area denial, chargers, summoners, elites, and mini-bosses.

#### 13. Boss production pass

- Unique boss animation set per theme.
- Intro, phase change, stagger, death, and portal handoff animations.
- Multiple deterministic patterns with anti-overlap scheduling.
- Co-op target selection and scaling.
- Boss health UI and phase communication.

#### 14. Roguelite progression

- Run rewards and choices.
- Items/relics with data-driven configuration.
- Character upgrades and unlocks.
- Persistent profile/versioned save data.
- Reward economy and balancing.
- Run summary and statistics.

#### 15. Archive completion

- Character records.
- Enemy records.
- Item/relic records.
- Boss records.
- Discovery state and readable entries.
- Navigation between shelves/collections through the physical library.

#### 16. Performance and bundle optimization

- Split the current large Phaser/client bundle with dynamic imports.
- Load only the active theme’s dungeon art and enemy assets.
- Audit texture memory on mobile.
- Pool additional projectiles and particles.
- Add performance budgets and low-effects mode.

#### 17. Production operations

- Error monitoring and structured Function logs.
- Room expiration/cleanup policy.
- Abuse/rate-limit protection.
- Version compatibility checks between clients and room snapshots.
- Privacy policy, credits, licenses, and public release metadata.
- Custom domain and deploy rollback plan.

## 13. Recommended resume order

When development resumes, use this exact order:

1. Run `pnpm dev -- --port 4173`.
2. Visually complete the boss portal test in all three themes.
3. Fix any portal transition defect before unrelated work.
4. Run the all-theme collision matrix.
5. Run `pnpm run check`.
6. Run `node tools/smoke-dungeon-combat.mjs`.
7. Run `node tools/smoke-doorways.mjs`.
8. Run `pnpm run build`.
9. Test two physical devices on a real Netlify deployment.
10. Only after those pass, rebuild `netlify-ready-game.zip` and upload the beta.

## 14. Build and packaging commands

```powershell
pnpm install --frozen-lockfile
pnpm run check
pnpm run build
pnpm run package:netlify
```

Development:

```powershell
pnpm dev -- --port 4173
```

Local game URL:

```text
http://127.0.0.1:4173/?assets=all-heroes-bespoke-v4&view=lobby
```

## 15. Release decision

Do not upload the public beta yet. The architecture and packaging are in place, but the boss portal change, complete wall-collision matrix, hero persistence across transitions, and real two-device Netlify co-op session must be verified first.

The current build should be treated as an internal playtest build until every P0 acceptance criterion above passes.
