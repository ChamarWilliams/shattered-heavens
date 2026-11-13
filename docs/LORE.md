# Shattered Heavens: lore bible and vocabulary

The game is a cultivation fantasy in the manhua/manhwa tradition: sects, Daos, secret realms, tribulation
lightning, jade slips and wandering swordsmen. The words used in menus and banners come from that genre,
and each one always means the same thing. The prose below is the source for the Archive text in
`src/domain/lore.ts`; the vocabulary lives in `src/domain/lexicon.ts`, and a test fails if a retired name
reappears in the source.

## The world

**The Nine Heavens.** Long ago nine sects each held up one Heaven, and each Heaven rested on a single Dao.
Together they sealed the **Void Tide** beneath the world, a hunger that is not evil, only endless. Every
cultivator who ever lived was climbing toward the Heavens.

**The Great Sundering.** One night a tribulation lightning fell that no Dao had called. The Heavens did not
fall; they shattered, and what remained of the nine Daos scattered into pockets of memory: the **Secret
Realms**.

**Echoes.** A cultivator's will can outlast the body. The Sundering froze those wills mid-motion. They walk
the Secret Realms as echoes: loyal, grieving, or simply unable to stop. **Wardens** are the strongest echoes,
the ones who refused to fade.

**The Wayfarers' Pavilion.** The Archivist built the Pavilion outside the Sundering. It is the one place echoes
cannot reach: a refuge where wanderers rest, trade spirit stones for craft and set out again. Its **Grand
Archive** files whatever wanderers recover, and no one has ever seen the Archivist, only thanked them.

**Tribulation.** Each time the three wardens fall, the Heavens notice. A fresh tribulation gathers, harsher
than the last. The wise do not call it punishment; they call it an invitation to climb.

## The three Secret Realms

### Sectless Sky Temple
A temple above the clouds where any seeker was taught the sword, whatever their birth. It had no name, no
ranks and no walls, until the Sundering gave it all three. **Sect Master Bai Wuji** sealed the gate against
refugees to keep the sword legacy whole. The legacy survived; he never forgave himself, and his guilt became
the temple's guardian.
- Echoes: **Gale Disciples** (drills with no one left to bow to), **Stone Lion Guardians** (grief given
  voice), **Sword Wisps** (a fallen disciple's sword, waiting to be picked up).
- Warden: the **Fallen Sect Master**. He greets every visitor with a rain of swords and an apology.

### Nightfold Shadow Crypt
The burial hall of a shadow dynasty that ruled in the dark between eclipses. Its kings were entombed
standing, so that they would never stop watching the throne. **Regent Lu Moyan** ruled in the name of a child
who never came of age and has held the throne ever since, certain the heir is merely late.
- Echoes: **Nightfold Assassins** (blades cut loose from their orders), **Chain Revenants** (ministers bound
  by their own oath), **Void Eyes** (the Regent's watchfulness with a body).
- Warden: the **Eclipse Regent**.

### Moonlit Foxfire Shrine
A shrine where foxes and humans swore covenants over foxfire. The lanterns still burn blue; whoever lights
one is, by old custom, a guest. **Matriarch Hua Linyue** fed her own nine flames into the shrine's seal to
hold the Void Tide back a little longer, and can no longer tell a guest from the tide.
- Echoes: **Paper Charm Spirits** (covenant charms reciting their terms), **Shrine Sentinels** (the honour
  guard, still on watch), **Corrupted Moonfoxes** (flames the right colour for the wrong reason).
- Warden: the **Nine-Tailed Calamity**.

## The wanderers

Each has three **Stages**, earned by feats, and a short chapter for each (found in the Archive).

| Wanderer | Stage I | Stage II | Stage III |
|---|---|---|---|
| **Li Yunfeng**, the Sword Without a Sect. Left the temple before the Sundering; has carried four spirit blades and one question ever since. | The Sectless Wanderer | Blade-Bearer of the Open Path | Sword Immortal of the Ninefold Heaven |
| **Seo Jiwon**, the Blade Between Shadows. A third-rank Nightfold assassin and the only one ever to refuse the dynasty's last order. | The Nightfold Exile | Eclipse-Stepper | Moonless Sovereign |
| **Tsukishiro Rei**, heir to the Moonfox flame. Last of the line whose blood sealed covenants at the shrine; her moonfox is an oath that learned to walk. | Heir to the Moonfox Flame | Keeper of the Moonfox Covenant | Empress of the Silver Flame |

- **Stage II:** defeat your own realm's warden while playing that wanderer.
- **Stage III:** complete all three realms in one expedition and step through the final echo.

## Vocabulary

| Term | Meaning | Replaces |
|---|---|---|
| **Secret Realm** / realm | One of the three dungeons | (unchanged) |
| **Wayfarers' Pavilion** | The hub between expeditions | Realm Hall |
| **Spirit Stones** | The currency kept between expeditions | Echo Shards |
| **Tribulation** | The loop number: each full set of realms is harsher | Resonance |
| **Dao Insight** | Points spent on a wanderer's grids | Mastery Points |
| **Stage** | A wanderer's tier (I to III), with a title | Form |
| **Techniques** / **Heart Method** | The ability grid / the passive grid | Arts / Dispositions |
| **Manual** | A wanderer's technique scroll, found in warden chests | Art (item) |
| **Oath** | A self-imposed challenge that raises the spirit stone payout | Trial |
| **Alchemy Table** | Pack one provision for the next expedition | Apothecary |
| **Treasure Cabinet** | Catalogue relics so chests can hold them | Relic Cabinet |
| **Jade Slip** | A relic that holds a page of lost history | (new) |
| **Warden** | The strongest echo of a realm | (unchanged) |
| **Dharma Protector** | A realm's mid-floor guardian (mini-boss) | (new) |
| **Elite** | A stronger echo with one affix: Warded, Swift, Sundering or Scorching | (new) |
| **Wandering Peddler** / **Heart-Blood Altar** / **Bell of Trials** | The special rooms: a shop, a heart-for-relic trade, a wave challenge | (new) |
| **Echo** | The frozen will of a fallen cultivator; every enemy | (unchanged) |

## Where the lore is found

The Grand Archive has four shelves (Wanderers, Relics, Bestiary, Histories) holding 61 records. Each is
revealed one way, and a locked record tells you how.

| How | What it reveals |
|---|---|
| Known from the start | The Nine Heavens, the Pavilion, each wanderer's first chapter |
| **Enter** a realm | That realm's history |
| **Defeat** an enemy for the first time | Its Bestiary record (wardens included) |
| **Defeat a warden** | The story of that realm's fall |
| **Defeat a Dharma Protector** | Its Bestiary record |
| **Meet an elite** | The record of elite echoes |
| **Find the Peddler, an Altar or a Bell** | Their Histories records |
| **Reach a Stage** | The next chapter of that wanderer's story |
| **Pick up** an item for the first time | The relic's record |
| **Read a Jade Slip** | A hidden page: the Sundering, the Void Tide, the Archivist, and one secret for each realm. Slips are a rare find in room chests and always in a warden's chest |
| **Start a second Tribulation** | The record of why it gets harder |
| **Talk to wanderers in the Pavilion** | Once you have found a record they care about, they sometimes speak about it instead of the furniture |
| **Fall in a run** | An epitaph of old teaching on the death screen |
| **Loading screens** | A few lines of lore among the tips |

Adding lore is data only: add an entry to `src/domain/lore.ts` with the event that reveals it. The tests check
that every item, enemy and wanderer stage has a record and every record has a way to be found.
