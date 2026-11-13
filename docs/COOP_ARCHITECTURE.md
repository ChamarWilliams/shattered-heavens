# Co-op architecture (up to three wanderers)

## Authority and transport

The browser sends input commands to `/.netlify/functions/game`; it never writes room state directly. The Function (`netlify/functions/game.ts`) is a thin adapter: it hands each request to `handleCoopRequest` in `src/coop/server.ts`, which authenticates the membership token, advances the deterministic room simulation (`src/coop/simulation.ts`) and conditionally commits the next room record to the strongly consistent `echoes-coop-rooms-v1` Blob store.

Every mutation reads the current record and ETag, then writes with `onlyIfMatch`. Conflicts retry from the newest authoritative record. Room creation uses `onlyIfNew`, so a room code cannot overwrite another expedition. The same handler runs against an in-memory store in the tests and in the two-browser harness, so what is tested is the code that ships.

The transport polls every 140 ms with adaptive reconnect backoff. This suits a zero-provisioning Netlify Functions/Blobs deployment but is not a persistent WebSocket server. Local movement is predicted immediately; authoritative positions reconcile with bounded correction, and remote heroes interpolate between snapshots.

The protocol is versioned (`COOP_SCHEMA_VERSION = 4`). A room stored by an older version is refused as not found rather than misread.

## The Pavilion and the party leader

A new room starts in the **gathering** phase. Everyone who has joined stands in the Wayfarers' Pavilion together: each client reports where its wanderer stands and which hero they picked, and draws the others with their names. Heroes can still change while the party gathers.

The player who created the room is the **party leader**. Only the leader can walk into the Realm Gate; anyone else is told who leads. When the leader walks in, the server starts the expedition and every client in the party enters the dungeon together. If the leader leaves the room or loses connection for 12 seconds while the party is gathering, the next wanderer takes over.

When a run ends (victory or defeat) the party returns to the Pavilion, and the leader can start another expedition on a new floor seed. Someone who joins while a run is under way goes straight in to join it.

## One floor, three screens

Every client and the server build the same floor from the room seed: `generateDungeon` with the same seed, theme and room count, then `assignRoomFeatures`. Each room's traps and cover come from `coopRoomLayout`, seeded by `roomLayoutSeed(seed, roomId)` and the side the party entered from, so every screen draws identical spikes, vents, pits, pillars and urns without sending them over the wire. Co-op rooms use the 1× room size.

## What the server owns

- the room seed, theme order, current realm, current room and the side the party came in by;
- which rooms are sealed, the room clock (trap cycles run from it on every screen), pit states, broken urns and ember patches;
- player position, health, max hearts, downed state, revive progress, input acknowledgement and damage dealt;
- enemies: role, position, aggro target, health and deaths, plus elite affixes (Warded, Sundering and the rest), Protector charges, adds and enrage, and the warden's second form and its shield;
- **when** each enemy attacks, which kind of attack it is (basic, special, the warden's signature, the Protector's charge) and whom it is aimed at;
- the Bell of Trials: who rang it, the current wave and the wave spawns;
- door transitions (a player walks out through an open door and the party follows), the echo portal, the next realm, expedition completion and failure when every wanderer is down.

Encounter size grows by one enemy per extra wanderer, and Bell waves grow the same way.

## Combat: each screen judges its own hits

Fights are judged where the player can see them, so nothing is lost to network delay:

- **Your attacks.** Your screen runs your hero's full kit (projectiles, flying swords, seals, burns) against the enemies it shows. Each hit it sees land is numbered and sent to the server, which applies it once (resending is harmless) through the same elite rules: barriers soak, Sundering elites split, Protectors and wardens change form. The enemy's health bar drops on your screen at once (prediction); an enemy you finish fades until the server confirms the kill, then is gone everywhere and never comes back. The server caps each hit at 600 damage and 64 hits per sync.
- **Enemy attacks.** When the server says an enemy attacks, every screen plays the same attack solo would (its telegraph, projectiles in its own style, the warden's patterns) aimed at the targeted hero. Each screen checks hits only on its own hero and reports the hearts it lost as a running total; the server applies at most 3 per sync and decides who is downed. Traps and burning ground stay on the server.
- **Disconnects.** A player who stops syncing for 12 seconds stops being targeted and no longer holds a run open: if everyone still connected is down, the run fails. After 90 seconds they leave the party (the next wanderer leads if it was the leader). A screen that reloads mid-run picks up its loot and hurt totals and its hit numbering from the server.

## Falling and reviving

A wanderer at zero hearts is **downed**, not out: they lie where they fell, enemies ignore them, and they travel with the party through doors and the echo. An ally standing within 68 px who holds **F** (or the **USE** button on touch) for 2.2 seconds revives them with half their hearts and 1.5 seconds of grace. Letting go pauses the revive and it slowly drains. Both screens show it: a ring with progress over the fallen wanderer, "HOLD F TO REVIVE …" for an ally in reach (or "… IS DOWN" otherwise), and the fallen player is told who can revive them. If every wanderer is down at once, the expedition fails.

## Time on the server

The room only advances when a player syncs. Each sync catches up on the time since the last one (up to one second) in 100 ms steps, so a slow connection never puts the room in slow motion and nothing moves far enough in one step to pass through cover.

## What each player owns

Loot is instanced: when a room is sealed each player gets their own chest, and the Peddler, the Altar and the vault chest are personal. Clients report the effects that matter to the server as running totals: hearts restored, max hearts gained or lost, and their speed multiplier. Totals are idempotent, so a resent request cannot double a heal. The server clamps everything it accepts (heals at most 4 hearts per sync, max hearts ±2 per sync, speed ×0.8–1.6).

Attack and ability presses (which pose the hero for the others and break urns) and Use presses (ringing the Bell) are sent as monotonic counters, so a retried or throttled request never loses or repeats a press.

## Not in co-op yet

Realm-hero blessings, Heat trials, hero Forms and their bonuses, provisions from the Apothecary, Jade Slips, feats and run saving are solo-only. Co-op runs use neutral hero modifiers.

## Security and lifecycle

- Room keys are generated server-side from a restricted alphabet.
- Player IDs and bearer tokens are generated server-side; tokens never appear in shared snapshots.
- Names and inputs are normalized and clamped server-side.
- Room keys are scoped and cannot contain caller-selected paths.
- Payloads are capped at 16 KB and responses are non-cacheable.
- Membership is kept in `sessionStorage` for same-tab reconnect and cleared on leave or authentication failure.
- Room metadata carries a six-hour expiration timestamp for cleanup policies.

## Testing and its limits

- `tests/coopSimulation.test.ts` covers gathering in the Pavilion, the leader-only start and handover, a second run, joining, movement and cover collision, revives, heal idempotency, determinism, doors, shared traps, announced enemy attacks and reported hurt, reported hits, disconnects, Warded and Sundering elites, Protectors, the warden's second form, the Bell, the portal, failure and the request handler.
- A Playwright harness drove two browser windows against the real handler: both saw each other in the Pavilion, the guest was refused at the gate, the leader took both in, and after the party fell the leader started a second run on a new floor. Both also saw the same rooms, enemies, traps and cover; each received their own chest; the warden fight, portal and Bell synced on both screens.
- **It has not been tested on separate real devices or on the live Netlify deployment.** Try it on two or three devices before relying on it.

## Scaling boundary

Conditional writes protect a room of up to three players against overlapping requests, but each room is still one frequently updated JSON record. Larger parties, sub-100 ms competitive combat, many more entities or global matchmaking should move the same protocol to a persistent WebSocket room service.
