# Audio brief

Every sound the game plays, what it should feel like and how long it should be.
The same list lives in code at `src/game/audioManifest.ts`; a test fails if the two drift apart.

## How to add a file

1. Name it after the id in the first column, e.g. `hit.ogg` or `warden.ogg`.
2. Put effects in `src/assets/audio/sfx/` and music in `src/assets/audio/music/`.
3. That is all. The game finds it on the next build (straight away under `pnpm dev`).

Anything still missing falls back to the built-in beeps (effects) or silence (music), so you can add sounds one at a time.

All 45 effects currently have synthesized stand-ins, made from noise, oscillators, struck bells and plucked strings by
`tools/synthesize_sfx.py`. They have the right character and length but are not studio quality. Replace any of them by
dropping in a file of the same name. Run `python tools/synthesize_sfx.py <id> ...` to regenerate specific ones after
tweaking a recipe. Music has no stand-ins and stays silent until real tracks are added.
For variety, add numbered takes, e.g. `hit.ogg`, `hit-2.ogg` and `hit-3.ogg`. The game picks one at random each time and shifts its pitch slightly.

## Technical targets

| | Music | Effects |
|---|---|---|
| Format | `.ogg` (Vorbis, q5–q6). Add a matching `.m4a` if Safari matters | `.ogg`, or `.wav` for very short ones |
| Sample rate | 44.1 kHz stereo | 44.1 kHz, mono is fine except for big moments |
| Loudness | About −16 LUFS integrated, peaks under −1 dBTP | Peaks around −3 dBFS; the game mixes them down |
| Loops | Cut on the bar so the end flows into the start, with no fade at either end and no silence at the start | n/a |
| Start | No silence before the first sound | Sound starts on the first frame; trim any lead-in |

Keep the realm themes in one family: the same instruments and tempo range, with a different mood for each realm.
The setting is a cultivation fantasy (manhua and manhwa), so traditional Chinese instruments fit best: guzheng, erhu, dizi, pipa, taiko-style drums and temple bells.
Foxfire Shrine can lean Japanese, with koto, shamisen and shrine bells.

## Priorities

If you can only get some of these, get them in this order. Each tier makes the game feel noticeably better on its own.

1. **Core feel:** `hit`, `hurt`, the three hero attacks and abilities, `enemy-telegraph`, `enemy-death`, `room-clear`, `chest-open`, `pickup-stone`, `pickup-item`, `ui-move` and `ui-confirm`, plus the `warden` and `pavilion` music.
2. **Atmosphere:** the three realm themes, `title`, `door-seal`, `portal-open`, the trap sounds, `pickup-rare`, `sting-death` and `sting-victory`.
3. **Everything else:** the special rooms, elites, the Protector, the trial, lore and unlocks, the remaining stings and the interface.

## Music (11 tracks)

| File | What it is | When it plays | Length | Loops |
|---|---|---|---|---|
| `music/title` | Main theme. Wistful and grand: guzheng, erhu, dizi over soft strings and taiko | Title screen | 1:30–2:30 | Yes |
| `music/pavilion` | Calm hub theme, warm and safe, a resting place between journeys | Wayfarers' Pavilion | 2:00–3:00 | Yes |
| `music/realm-sectless` | Exploration theme for a ruined sword temple above the clouds: airy flutes, plucked strings, steady pulse | Sectless Sky Temple rooms | 2:00–3:00 | Yes |
| `music/realm-nightfold` | Exploration theme for a shadow dynasty crypt: low drones, muted percussion, tension | Nightfold Shadow Crypt rooms | 2:00–3:00 | Yes |
| `music/realm-foxfire` | Exploration theme for a moonlit fox shrine: shamisen or koto, bells, mysterious and playful | Moonlit Foxfire Shrine rooms | 2:00–3:00 | Yes |
| `music/protector` | Mini-boss fight, driving and urgent but shorter-winded than the warden theme | Dharma Protector fights | 1:30–2:00 | Yes |
| `music/warden` | Boss fight theme, epic: full taiko, choir, soaring erhu | Realm warden fights (both forms) | 2:00–2:30 | Yes |
| `music/trial` | Fast, rhythmic survival theme | Bell of Trials waves | 1:00–1:30 | Yes |
| `music/sting-death` | Mournful fall: a single erhu phrase fading to silence | The hero falls | 5s–10s | No |
| `music/sting-victory` | Short triumphant fanfare | A warden is defeated | 5s–8s | No |
| `music/sting-tribulation` | Thunder and a rising, ominous chord | A new Tribulation begins | 6s–10s | No |

**In the game now:** three tracks supplied by the project owner, normalised to −16 LUFS with the silence trimmed.
Slots without their own file borrow a track (`MUSIC_FALLBACKS` in `audioManifest.ts`). Adding a dedicated file for a slot
takes over straight away.

| Track | Slot | Also plays for |
|---|---|---|
| Moonlit Courtyard | `pavilion` | `title` |
| Beyond the Pagoda Gate | `realm-sectless` | `realm-nightfold`, `realm-foxfire` |
| Tides of the Emperor | `warden` | `protector`, `trial` |

Still missing: separate realm themes for Nightfold and Foxfire, a title theme, and the three stings.

Total running time is about 17–21 minutes of music, mostly loops.
The three realm themes and `warden` are where the money goes if you commission anything.

## Sound effects (45)


### Heroes

| File | What it is | When it plays | Length |
|---|---|---|---|
| `sfx/li-attack` | Light jian (straight sword) swing with a thin spirit shimmer | Li Yunfeng's basic attack | 0.2s–0.35s |
| `sfx/li-ability` | Four spirit swords ringing out of their sheaths and launching | Li's Flying Sword ability | 0.6s–1s |
| `sfx/seo-attack` | Quick dagger slash, dry and close | Seo Jiwon's basic attack | 0.15s–0.3s |
| `sfx/seo-ability` | Shadow-step whoosh that folds in on itself | Seo's Shadow Dash | 0.4s–0.7s |
| `sfx/rei-attack` | Soft foxfire bolt cast, a breathy flame puff | Tsukishiro Rei's basic attack | 0.2s–0.4s |
| `sfx/rei-ability` | Fox spirit summoned: a yip inside a rising blue flame | Rei's Foxfire Summon | 0.7s–1.1s |
| `sfx/hit` | Meaty impact on a spirit body, short | Any hero hit on an enemy | 0.08s–0.2s |
| `sfx/crit` | Sharper, brighter impact with a metallic ring | A critical hit | 0.2s–0.35s |
| `sfx/hurt` | Hero takes a hit: thud plus a short grunt-free whoosh | The hero loses a heart | 0.2s–0.35s |
| `sfx/deflect` | Bronze mirror deflecting a blow | Mirror Charm turns a hit aside | 0.2s–0.35s |
| `sfx/heal` | Warm chime with a soft rising shimmer | A heart is restored | 0.4s–0.7s |
| `sfx/revive` | Phoenix flare: a roar of fire that rises in pitch | Phoenix Ember brings the hero back | 1.2s–2s |

### Enemies

| File | What it is | When it plays | Length |
|---|---|---|---|
| `sfx/enemy-telegraph` | Short warning tone, clear but not shrill (a temple bell tick) | An enemy starts winding up an attack (rate-limited) | 0.2s–0.4s |
| `sfx/enemy-shot` | Spirit projectile fired, airy and light | An enemy volley is released (rate-limited) | 0.15s–0.3s |
| `sfx/enemy-death` | Echo dissolving into motes, a soft shatter | An ordinary enemy falls | 0.4s–0.7s |
| `sfx/elite-death` | Bigger, heavier version of the enemy death, with a gong under it | An elite falls | 0.7s–1.1s |
| `sfx/ward-break` | Glassy barrier cracking and bursting | A Warded elite's barrier breaks | 0.3s–0.6s |
| `sfx/protector-charge` | Heavy footfalls building into a rush | A Dharma Protector charges | 0.5s–0.9s |
| `sfx/warden-roar` | Deep, echoing roar or war cry with a sub boom | A warden enters its second form | 1.2s–2s |

### Traps and hazards

| File | What it is | When it plays | Length |
|---|---|---|---|
| `sfx/spike-trap` | Stone grinding then spikes snapping up | Spike plates fire | 0.3s–0.5s |
| `sfx/fire-vent` | Gas hiss into a burst of flame | A fire vent erupts | 0.7s–1.2s |
| `sfx/pit-crumble` | Stone slab cracking and crumbling | A pitfall gives way | 0.5s–0.8s |
| `sfx/fall` | Falling whoosh into a distant thud | The hero falls into a pit | 0.8s–1.2s |
| `sfx/burn-ignite` | Small flame catching on stone | A Scorching elite's patch ignites | 0.2s–0.4s |

### Rooms, loot and the world

| File | What it is | When it plays | Length |
|---|---|---|---|
| `sfx/door-seal` | Heavy stone doors slamming shut with a qi seal hum | You enter a room with enemies | 0.5s–0.9s |
| `sfx/room-clear` | Short triumphant sting (guzheng or bells) and doors unsealing | A room is cleared | 1s–1.6s |
| `sfx/chest-land` | Wooden chest thumping onto stone | A chest drops into the room | 0.3s–0.5s |
| `sfx/chest-open` | Lid creak and a sparkle of treasure | A chest opens | 0.6s–1s |
| `sfx/pickup-stone` | Tiny crystal clink | A Spirit Stone is picked up | 0.12s–0.3s |
| `sfx/pickup-item` | Pleasant pickup chime | A common item is picked up | 0.3s–0.6s |
| `sfx/pickup-rare` | Richer chime with a sparkle tail | A relic, infusion or manual is picked up | 0.8s–1.3s |
| `sfx/urn-break` | Ceramic urn shattering | An urn is broken | 0.3s–0.5s |
| `sfx/portal-open` | Space tearing open into a low swirling hum | The echo (portal) opens after a warden falls | 1.5s–2.5s |
| `sfx/portal-enter` | Rushing whoosh into silence | You step into the echo | 1s–1.5s |
| `sfx/bell-toll` | Large temple bell struck once, long tail | You ring the Bell of Trials | 2s–3.5s |
| `sfx/altar-offer` | Heartbeat thump into a dark choral swell | You offer a heart at the Heart-Blood Altar | 1s–1.6s |
| `sfx/purchase` | Coins and a satisfied register-like chime | You buy from the Wandering Peddler | 0.4s–0.7s |
| `sfx/deny` | Soft muted thunk, clearly "no" | You cannot afford or use something | 0.15s–0.3s |
| `sfx/lore-found` | Paper scroll unrolling with a gentle chime | A new Archive record is found | 0.8s–1.2s |
| `sfx/hero-unlock` | Heroic sting, a few bars on erhu or dizi | A new wanderer is unlocked | 2s–3s |
| `sfx/stage-up` | Ascending shimmer into a resonant gong | A wanderer reaches a new Stage | 2s–3s |

### Interface

| File | What it is | When it plays | Length |
|---|---|---|---|
| `sfx/ui-move` | Tiny wooden tick | Moving between menu buttons | 0.04s–0.1s |
| `sfx/ui-confirm` | Clean confirm chime | Choosing a menu option | 0.15s–0.3s |
| `sfx/ui-back` | Softer, lower version of the confirm | Closing a dialog or going back | 0.1s–0.2s |
| `sfx/ui-open` | Paper panel sliding open | Opening a dialog (shops, shrine, archive, settings) | 0.2s–0.4s |

## Where to get them

- **Free, safe for a commercial game:** Kenney's audio packs (CC0), the Sonniss GDC Game Audio Bundles (royalty-free, released every year) and Freesound clips marked CC0.
- **Paid:** Epidemic Sound or Artlist subscriptions, and asset-store packs such as "Asian Fantasy" or "Wuxia" music and SFX bundles. Read each licence before you rely on it.
- **Commissioned:** for the four key themes (`title`, `pavilion`, `warden` and one realm), a composer on a game-audio marketplace can match the style.
- **Avoid** anything marked "non-commercial" (CC BY-NC) or "personal use". Keep a note of where every file came from and its licence, so the credits screen is easy later.
