# Shattered Heavens: design notes and recommendations

The world and its vocabulary are documented in [`LORE.md`](LORE.md), and every sound the game wants is listed in
[`AUDIO_BRIEF.md`](AUDIO_BRIEF.md).

Several things recommended below have since been built:
- the Spirit Stone shops, oaths and saved expeditions
- wanderer Stages, with two grids each
- infusion tiers and Manuals
- the lore archive
- elites, Dharma Protectors, room cover and special rooms
- accessibility settings and the audio system

Each recommendation is marked **Built** or **Open**.

Where the game stands after the hall/dungeon overhaul, the knobs that tune it,
and what I would do next to make it a complete roguelite. Ordered by impact.

## The loop today

1. **Wayfarers' Pavilion.** You walk around as your hero. The others wander between interest points and talk in
   speech bubbles. Walk up and press E: a locked hero tells you how to earn them, an unlocked hero takes over.
2. **Expedition.** Three realms in a seeded order. Each realm is a branching floor of rooms ending in a warden.
3. **Rooms.** Doors seal until the enemies fall. Pillars and breakable urns give cover, and traps run throughout.
   Some enemies are elites with an affix. A chest drops in the centre once the room is sealed. The realm's own
   hero may be waiting in one room and offer a blessing.
   - **Dharma Protector:** a mini-boss halfway along the path to the warden.
   - **Special rooms:** a Wandering Peddler, a Heart-Blood Altar or a Bell of Trials, plus trap-guarded vaults.
4. **Warden.** A two-phase boss. A gilded chest drops under the echo, and the warden unlocks its realm's hero.
5. **Tribulation.** After the third warden the echo loops into a fresh set of realms, harder each time, until you fall.
6. **Death.** The death animation plays, the screen fades to black, the message shows, and you are back in the hall.
   Spirit Stones are kept.

## Tuning knobs (all in code, no data files yet)

| What | Where | Now |
|---|---|---|
| Difficulty multiplier | `DungeonRunScene.difficulty` | `1 + 0.35 × tribulation + 0.4 × (party − 1)`, applied to enemy health |
| Enemies per room | `spawnEncounter` | `min(9, 3 + realm + rooms/4 + tribulation)` |
| Traps per room | `enterRoom` | `min(8, 2 + realm + tribulation)` |
| Room size | `ROOM_SCALE_SOLO` | 1.3× solo, 1× co-op |
| Trap timings | `TrapSystem` (`SPIKES`, `VENT`, `PIT`) | 500–650 ms warning before every hit |
| Loot tables | `rollChest` in `runItems.ts` | Room: 1 common, 45% shard, 18% + 6%/tribulation rare. Warden: rare + prize + 2 spirit stones |
| Realm-hero chance | `REALM_ALLY_CHANCE` | 60% per realm, if you are not that hero |
| Party size | `COOP_MAX_PLAYERS` | 3, heroes may repeat |
| Elite chance | `eliteChance` in `domain/elites.ts` | 0 in the first 3 rooms of a fresh run, then 7% + 5%/realm + 7%/tribulation, max 40%; 1–3 per room |
| Elite strength | `ELITE_HEALTH`, `WARD_SHARE`, `SWIFT_*`, `SUNDER_*`, `SCORCH` | 2× health; barrier 40%; Swift 1.4× speed, 0.8× recovery (windups unchanged) |
| Protector | `PROTECTORS`, `protectorHealth` in `domain/specialRooms.ts` | (150 + 60 × realm) × difficulty; 820 ms charge telegraph |
| Peddler prices | `WARE_PRICES` | common 2, rare 6, warden 9 (this expedition's Spirit Stones only) |
| Trial waves | `trialWaves` | 3/4/5 enemies + realm + tribulation, capped at 8/9/10; 1.4 s between waves |
| Cover | `coverLayout` in `dungeon/roomFeatures.ts` | one of 6 pillar patterns plus 0–3 urns; never in the door lanes |

## Tutorial

The tutorial lives in `domain/tutorial.ts`, `run/Tutorial.ts` and `ui/setupTutorial.ts`.

**First-room practice.** The first expedition opens with a five-step practice in the start room:
1. Move.
2. Strike the training dummy.
3. Use your technique.
4. Step out of a harmless warning ring (after two misses it moves on anyway).
5. Leave through a door.

The dummy never attacks, never dies and never keeps the doors shut.

**One-time tips.** After the practice, each tip shows the first time its situation comes up:
- sealed rooms, traps, cover, chests and relics
- elites
- the Peddler, Altar, Bell and vaults
- Protectors, wardens and the echo
- low hearts
- in the Pavilion: moving and talking, the gate, the shops (after your first run) and the shrine (once you have Dao Insight)

**How the card works:**
- **Controls:** it names the right control for keyboard or touch.
- **Placement:** it moves to whichever half of the room the hero isn't in.
- **Skipping:** it can be skipped at any time.
- **Settings:** Guidance can turn hints off or replay them all.

Touch players get a **USE** button whenever they stand beside a Peddler ware, Altar or Bell.

## Fairness rules

A dodge solver checks every enemy, Protector and warden attack, both forms included, in the 1.3× solo room.

- **The test:** it searches every position the slowest hero (Rei, 144 px/s) can reach without being hit. The hero starts still and can only move 250 ms after the warning appears.
- **Coverage:** start positions span the whole floor at each attacking range.
- **Cover:** the worst case is assumed. Pillars block the hero but not the shots.

The last pass found unavoidable cases only for a hero boxed into a corner. These rules now remove them:

- **Corner fans:** when the hero is within 60 px of two walls, an aimed fan keeps only its middle three shots, narrowed to 55%.
- **Slam radius:** the Stone Lion's slam hits exactly its drawn 58 px circle. It used to hit at 72 px.
- **Enraged Sectless warden:** speeds its three-shot fan up instead of widening it to five, as the Foxfire warden does.
- **Unaimed bursts:** they turn so a gap faces the hero, as the rings do.
- **Point-blank fans:** Paper Charm Spirits hop back 36 px before releasing theirs.
- **Protector charge:** the warning line shows for 820 ms.
- **Elites:** affixes never shorten a windup. Swift only shortens the recovery between attacks.

Keep these when adding attacks. Any new aimed fan should go through `EnemyDirector.fan()`.

## Recommendations

### 1. Give Spirit Stones somewhere to go (meta progression) — **Built**
Spirit stones are collected and saved, but nothing spends them. The hall already has the right places for a shop:
the alchemy table, the spirit forge and the Treasure Cabinet.
- **Spirit Forge:** permanent upgrades, such as +1 starting heart, a cheaper first ability, or an extra chest reroll.
- **Treasure Cabinet:** unlock new relics and infusions into the drop pool, so runs gain variety over time.
- **Alchemy Table:** buy a consumable to start each run with.

Without a sink, the long-term reason to keep playing is weak.

### 2. Decide on the weapon model before adding more art — **Built** (kit-first: infusion tiers and Manuals)
Soul Knight's identity is weapon swapping. Here each hero has a fixed, animated kit, so I added
**infusions** (Frost, Storm, Ember) that change the basic attack without new animations. Choose one of:
- **Kit-first (recommended):** keep signature kits, and grow infusions into a small tree, e.g. Storm I → Storm II
  chains three times. Add hero-specific "arts" that alter the ability. This needs little art.
- **Weapon-first:** two weapon slots with ground pickups. Each weapon needs attack art for 3 heroes × 8 directions,
  which is a large art budget.

### 3. Room variety and cover — **Built** (per-realm trap retheme still open)
Bigger rooms help, but they are still open boxes. Add, in priority order:
- **Obstacles inside rooms** (pillars, statues, braziers) that block shots and give cover. The tile grid already
  supports `Prop` tiles.
- **Special rooms.** The generator already has an unused `treasure` kind. Add a shrine (trade a heart for a relic),
  a shop (spend run-only coins), and a challenge room (survive waves for a better chest).
- **Per-realm traps.** Retheme the three traps for each realm: jade blades for Sectless, shadow pits for Nightfold,
  foxfire jets for Foxfire.

### 4. A deeper enemy roster — **Built** (elites and Protectors; mixed realms still open)
Three regular enemies per realm runs out fast.
- **Elites:** a glowing variant with an affix (shielded, splitting, hasted, or leaves fire behind) and a better drop.
- **Mixed realms from Tribulation II:** let enemies cross over between realms.
- **One mini-boss per realm:** a mid-floor fight before the warden.

### 5. Wardens — second forms **Built**, the rest **Open**
Each warden now has a second form. Next:
- A **signature drop** per warden, such as a unique relic.
- **Arena changes in phase 2**, e.g. the floor partly collapses or fire spreads.
- At deeper tribulations, wardens could borrow each other's moves.

### 6. Co-op parity — **Built (content), open (meta)**
The co-op server now walks the real floor: the same rooms, doors, traps, cover, urns, elites, Protectors, the warden's
second form and the Bell of Trials as solo, with personal chests, Peddler, Altar and vault. See `COOP_ARCHITECTURE.md`.
- Still solo-only: realm-hero blessings, Heat trials, hero Forms, provisions, Jade Slips, feats and run saving.
- The party gathers in the Wayfarers' Pavilion and the party leader leads everyone through the gate. **Built.**
- **Test on two or three real devices before relying on this.** It has only been tested in two browser windows on one machine.

### 7. Feel and readability — audio system and accessibility **Built**
- Real sound effects and music. The system is built. Drop files named in `AUDIO_BRIEF.md` into
  `src/assets/audio/` and they play. Until then the procedural beeps remain.
- Colour-blind-safe warnings, screen shake and text size are in Settings.
- Gamepad support in the dungeon. The title menu supports gamepads, but combat does not.
- Aim assist on touch.

### 8. Art direction
The new portal, chest, item and trap sprites are drawn procedurally by `tools/generate_*_sprites.py`. They are
consistent placeholders, but they are lower fidelity than the hero and room art.
- Commission or generate final art in the heroes' painted pixel style. The sheets have fixed layouts, so new art
  can drop in without code changes.
- Also make the realm-hero NPCs in dungeons use dungeon-scale sprites instead of the hall-scale sprites they use now.

### 9. Balance and telemetry — Heat (Oaths) **Built**, telemetry **Open**
- Log run length, cause of death, the room of death and items picked, at least locally, so tuning is based on data.
- Make tribulation tougher in more than health: add Hades-style "Heat" modifiers you choose to turn on for better
  rewards, e.g. faster enemies, extra traps, or fewer hearts.

### 10. Saving — **Built**
Runs cannot be resumed after closing the tab. A run snapshot (seed, realm, room, hearts, loadout) would make
mobile play viable.

## Known gaps after this pass
- **Co-op** rooms keep the 1× size. Blessings, Heat, Forms, provisions, Jade Slips and run saving are solo-only (see section 6).
- **No gamepad in the dungeon or the Pavilion.** The title menu supports gamepads.
