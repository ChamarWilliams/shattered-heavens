# Shattered Heavens — Phase 1 Engineering Audit

Audit scope: Phaser scenes, renderer-independent combat domains, input shell, lobby/archive collision, dungeon generation and combat, persistence, tests, and production/deployment boundaries.

Severity key: **P0** blocks co-op or release, **P1** can soft-lock/desync or materially damage play, **P2** is a visible quality or maintainability problem, **P3** is cleanup.

## Actionable triage

| Priority | Area | Finding and evidence | Player/release impact | Action | Status |
| --- | --- | --- | --- | --- | --- |
| P0 | Networking/state | There was no room service, transport, replicated snapshot, authoritative simulation, reconnect token, or remote-player entity. | Separate devices could not share a run; trusting either client would allow instant state divergence. | Introduce shared serializable protocol and deterministic room simulation, then a Netlify Function/Blobs room adapter and predictive client session. | Implemented in Phase 3 |
| P0 | Progression/revive | Run state was scene-local and no downed/revive model existed. | A refresh, reconnect, or scene race could lose the run; two-player revive could not work. | Create authoritative run/player snapshots with revision, heartbeat, downed timer, revive progress, and shared room/floor state. | Implemented in Phase 3 |
| P0 | Deployment | No `netlify.toml`, Function, Blobs adapter, production API configuration, or deployable archive existed. | Netlify Drop could serve only the static client. | Add the production Function and package after the protocol is stable. | Implemented in Phase 4 |
| P1 | Collision/pathing | Enemy chase, lunges, boss relocation, and summon spawns previously changed sprite coordinates without consulting semantic collision. | Enemies could enter walls/props, become unhittable, or attack through closed geometry. | Route enemy motion through stepped collision and recover teleports/spawns to nearest legal floor. | Fixed in Phase 1 |
| P1 | Collision/combat | Projectile collision previously checked only the final point for each frame. | Fast projectiles could pass through a player/enemy during a frame spike. | Use swept-circle collision from previous to current position for domain and dungeon projectiles. | Fixed in Phase 1 |
| P1 | Pause/state | `paused` returned early from `update`, but Phaser delayed calls and tweens continued. | Enemy telegraphs could resolve and effects progress while the pause overlay said the game was stopped. | Pause/resume the scene clock and tween manager with the gameplay flag. | Fixed in Phase 1 |
| P1 | Determinism | Boss teleports used `Phaser.Math.Between`; run seeds mixed `Date.now()` and `Math.random()`. | Identical room seeds could still produce different combat outcomes, preventing reconciliation and replay. | Use a run-seeded PRNG for gameplay decisions and permit an injected authoritative seed. | Fixed in Phase 1 |
| P1 | Action state | `CharacterActor` lacked explicit windup/active/recovery information, cancel windows, and buffered input. | Input could feel eaten and reconciliation lacked a stable phase. | Add serializable action phases, late-recovery canceling, and a short input buffer. | Implemented in Phase 2 |
| P1 | Runtime ownership | The combat-lab and lobby/dungeon Phaser games both ran while hidden. | Mobile devices spent CPU/GPU on invisible canvases. | Sleep the inactive game loop and wake/refresh only the visible surface. | Implemented in Phase 2 |
| P1 | Settings | Audio, reduced-motion, and damage-number settings were persisted but not consumed by Phaser gameplay. | Accessibility controls appeared functional while changing little. | Publish typed settings and apply them to motion, damage text, lighting/particles, and audio. | Implemented in Phase 2 |
| P1 | Health ownership | Dungeon hearts and `CharacterActor.health` are separate mutable values; hurt changes the actor by `1` while dungeon damage changes hearts independently. | Replicated health and animation state can disagree, especially around death/revive. | Move combat health to one serializable player state and make `CharacterActor` consume presentation events. | Phase 3 queued |
| P2 | Rendering order | `TransientEffectPool` defaulted every effect behind dungeon actors. | Hits and impacts could render behind their target. | Give effects a Y-aware combat overlay depth. | Implemented in Phase 2 |
| P2 | Combat feedback | Hits lacked hit-stop, directional kick, damage numbers, and shared damage accounting. | Attacks lacked weight and co-op readability. | Add bounded hit-stop, directional camera kick, damage numbers, and team damage telemetry. | Implemented in Phase 2 |
| P2 | Telegraph lifecycle | Room telegraphs were not owned by room cleanup. Delayed callbacks checked dead enemies, but stale warning art could survive a transition briefly. | Visual false positives during fast room changes. | Track room-transient telegraphs and destroy them on room cleanup. | Fixed in Phase 1 |
| P2 | Enemy navigation | Enemies now collide, but use local steering only; there is no tile path search around large concave obstacles. | An enemy can stall behind complex props instead of navigating around them. | Add low-frequency grid A* with local steering fallback after collision-blocked time. | Phase 3 follow-up |
| P2 | Progression/inventory | No inventory implementation exists, so there is no current inventory leak—but there is also no authoritative relic/loadout schema. | Items cannot be safely added or synchronized yet. | Define immutable item IDs and server-owned inventory mutations before adding pickups. | Phase 3 queued |
| P2 | Audio/ambience | No gameplay audio service or authored event hooks were present. | Attacks, impacts, and room clears lacked audio feedback. | Add a settings-aware procedural feedback layer that authored clips can later replace behind the same API. | Implemented in Phase 2 |
| P2 | Test coverage | Domain systems and generation are covered, but there are no tests for pause semantics, scene ownership, settings propagation, reconnect/revision conflicts, or long-run combat invariants. | Regressions can pass unit checks and appear only in browser sessions. | Add browser smoke assertions and protocol/simulation tests alongside each phase. | In progress |
| P3 | Build/performance | The production JavaScript bundle is approximately 1.39 MB minified and triggers Vite's chunk warning. | Slower first load on mobile networks. | Lazy-load the combat lab and split Phaser/vendor/application chunks after co-op boundaries settle. | Phase 4 queued |

## Phase 1 verification

- TypeScript build and all unit tests pass.
- Continuous collision has direct low-frame-rate tunneling tests.
- Seeded randomness has deterministic replay/range tests.
- The three-hero dungeon browser smoke passes with no browser errors.
- Randomized theme order, correct hero system ownership, inactive lobby scene, and four distinct projectile roles remain verified.

## Architectural conclusion

The existing renderer-independent ability systems are a strong foundation, but `DungeonRunScene` currently combines input, authoritative state, AI, collision, progression, and presentation. Co-op must not synchronize Phaser objects directly. The safe path is to extract a serializable simulation/protocol boundary, keep Phaser as a view/input client, and let the Netlify Function advance and conditionally commit authoritative room snapshots.
