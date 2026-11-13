# Shattered Heavens — Dungeon Generation v1

## Three realm themes

| Realm | Hero affinity | Combat identity | Environment hooks |
| --- | --- | --- | --- |
| Sectless Sky Temple | Li Yunfeng | disciplined lanes, sword seals, wind gaps | jade floors, cloud inlays, sword racks, chasms |
| Nightfold Shadow Crypt | Seo Jiwon | ambushes, broken sightlines, dash routes | obsidian halls, eclipse marks, shadow rifts, chained pillars |
| Moonlit Foxfire Shrine | Tsukishiro Rei | summon space, orbiting hazards, spirit pursuit | moonlit slate, foxfire patches, shrine gates, offering jars |

Each theme owns five canonical `19 × 13` semantic tile maps. Rotating those maps creates every cardinal orientation without duplicating room data.

## Required room pieces

| Piece | Canonical doors | Purpose |
| --- | --- | --- |
| Cap | N | start, boss, treasure, or dead-end room |
| Straight | N + S | lane combat and chase encounters |
| Corner | N + E | ambushes and line-of-sight breaks |
| Junction | N + E + W | wave encounters and route choices |
| Crossroads | N + E + S + W | elite arena or navigation hub |

Door sockets are three tiles wide and always centered on the room edge. A room is only valid when the adjacent room owns the opposite socket. Rendering follows a truthful-door rule: every non-empty N/E/S/W mask has a complete, pre-generated room bitmap. The bitmap is selected when the room is entered and never changes. Combat can lock movement through an existing doorway, but clearing an encounter never opens, removes, or composites wall art.

## Generation contract

1. A seed grows a connected set of cardinal grid cells.
2. Physical neighbors determine each room's exact doorway mask.
3. The generator chooses the matching topology and rotates its canonical map.
4. The farthest room becomes the boss room; the origin is always the start room.
5. `validateDungeon` rejects doors into empty space, missing neighbor doors, or non-reciprocal connections.

The output contains only deterministic gameplay data. Rendering, encounter selection, enemy simulation, and future server authority consume this result without changing it. A multiplayer server can generate once and send the seed plus authoritative room state to clients.

## Art status

Each theme owns a clean four-door master and a clean solid-wall master under `artifacts/dungeon-room-masters-v5/`. `tools/build_static_room_variants.py` bakes those into `room-mask-01-v5.webp` through `room-mask-15-v5.webp`, covering every valid combination from a one-sided cap through a four-sided crossroads. These final bitmaps contain both the room and its permanent doors; runtime wall overlays and removable closure patches are retired. Semantic tiles drive the matching collision envelope and centered door sockets. Arbitrary generated hazards and blockers remain removed so collision matches the visible art.

Enemies and bosses use true four-state source animation sheets normalized by `tools/normalize_enemy_animations.py`: idle, locomotion contact, locomotion passing, and attack. Hero rendering uses the same `CharacterActor`, `CharacterView`, frame pivots, shadow anchors, and effect manifest as the combat laboratory.

Enemy projectiles use authored transparent silhouettes per realm, normalized by `tools/normalize_projectile_assets.py`. A shared attack director prevents simultaneous bullet-wall launches; fans use wider angular separation, radial patterns reserve an explicit safe lane, and all high-threat attacks have readable windups.

Each new run deterministically shuffles the three realm themes from its run seed, so Sectless Temple is not forced to be the opening dungeon. Within every theme, hunters, heavy shooters, sentinels, and bosses have separate projectile silhouettes and separate attack-pattern families. Boss pattern selection follows the active theme rather than the shuffled theme position.

Dungeon heroes use the same domain systems and rendering views as the combat laboratory: Li Yunfeng's sword volley and Sectless seals, Seo Jiwon's dash and delayed shadow echo, and Tsukishiro Rei's moonfire stacks, foxfire shot, and summoned fox. Cast release events, current aim at release, projectile collision, summon behavior, and bespoke effects therefore remain consistent between the laboratory and a live run.

Gameplay still reads semantic tile IDs rather than artwork, so future visual replacements do not alter generation, collision, hazards, or encounter logic.
