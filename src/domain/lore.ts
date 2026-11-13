/**
 * The world's lore, and how each piece is found. Every entry belongs to an
 * Archive shelf and is revealed by exactly one event:
 *  - 'always'            known from the start;
 *  - 'enter:<realm>'     first time you step into a realm;
 *  - 'clear:<realm>'     first time you defeat that realm's warden;
 *  - 'kill:<realm>:<n>'  first time you defeat that enemy (n = 0..3, 3 is the warden);
 *  - 'kill:<realm>:protector' first time you defeat that realm's Dharma Protector;
 *  - 'elite'             first time you meet an elite echo;
 *  - 'feature:<kind>'    first time you find a Peddler, Altar or Bell of Trials;
 *  - 'item:<id>'         first time you pick that item up;
 *  - 'stage:<hero>:<n>'  first time a hero reaches Stage n;
 *  - 'first-kill', 'tribulation' one-off milestones;
 *  - 'slip'              only by reading Jade Slips, found in chests.
 * docs/LORE.md tells the same story in prose.
 */
import type { DungeonThemeId } from '../dungeon/types';
import type { UnlockableHeroId } from './heroUnlocks';
import { ALTAR_NAME, BELL_NAME, ENEMY_NAMES, MERCHANT_NAME, PROTECTOR_TITLE, STAGE_NAME } from './lexicon';
import { PROTECTORS } from './specialRooms';

export type ArchiveShelf = 'characters' | 'items' | 'enemies' | 'realms';

export interface LoreEntry {
  readonly id: string;
  readonly shelf: ArchiveShelf;
  readonly title: string;
  readonly subtitle: string;
  readonly text: string;
  /** The unlocking event (see above). */
  readonly event: string;
  /** What to do to find it, shown while it is still locked. */
  readonly hint: string;
}

const REALM_NAMES: Readonly<Record<DungeonThemeId, string>> = {
  'sectless-temple': 'Sectless Sky Temple',
  'nightfold-crypt': 'Nightfold Shadow Crypt',
  'foxfire-shrine': 'Moonlit Foxfire Shrine',
};
const SLIP_HINT = 'Found in Jade Slips: a rare find in room chests, and always in a warden\'s chest.';

const entry = (shelf: ArchiveShelf, id: string, title: string, subtitle: string, text: string, event: string, hint: string): LoreEntry =>
  ({ id, shelf, title, subtitle, text, event, hint });

// ---- Wanderers: a public record, then a chapter for each Stage the hero reaches ----
const HERO_CHAPTERS: readonly (readonly [UnlockableHeroId, string, readonly [string, string, string], readonly [string, string, string]])[] = [
  ['li-yunfeng', 'Li Yunfeng', ['The Sword Without a Sect', 'Blade-Bearer of the Open Path', 'Sword Immortal of the Ninefold Heaven'], [
    'Li left the Sectless Sky Temple the winter before the Sundering, convinced that a sword must be tested on the road. He came back to a sealed gate and a broken sky. He has carried four spirit blades and one question ever since.',
    'Before the Fallen Sect Master, Li finally understood the question: not whether the gate should have opened, but whether anyone had stayed to open it. He answered with the Open Path, a style that cuts only what stands in the way.',
    'After the third Tribulation Li stopped carrying his blades. They follow him now. The Ninefold Heaven, he says, is not above anyone. It is the place where nobody is turned away.']],
  ['seo-jiwon', 'Seo Jiwon', ['The Blade Between Shadows', 'Eclipse-Stepper', 'Moonless Sovereign'], [
    'A third-rank assassin of the Nightfold Dynasty, Seo was trained to leave no echo behind her. She refused the dynasty\'s final order, was named Exile, and has spent every day since learning what it costs to leave one.',
    'In the Crypt she met the Regent\'s gaze and was not erased. The Eclipse Step folds distance the way a shadow folds around a corner, and it only works for someone who has stopped hiding from being seen.',
    'The Nightfold\'s last heir was never found, so there was no throne left to take. Seo took the title anyway, privately, as a joke that stopped being funny. The shadows answer to it all the same.']],
  ['tsukishiro-rei', 'Tsukishiro Rei', ['Heir to the Moonfox Flame', 'Keeper of the Moonfox Covenant', 'Empress of the Silver Flame'], [
    'Rei is the last of the Tsukishiro line, whose blood once sealed covenants at the Foxfire Shrine. The moonfox that follows her is not a pet. It is an oath that learned to walk.',
    'Beside the Matriarch\'s ruin Rei read the first covenant aloud, and the shrine\'s flame answered. She is no longer a guest. She is a party to the oath, and the one who must keep it.',
    'Nine flames, nine tails, nine promises kept. Rei dislikes the title. The foxes find it very funny and use it anyway.']],
];

const HEROES: LoreEntry[] = HERO_CHAPTERS.flatMap(([id, name, titles, texts]) => [0, 1, 2].map((index) => entry(
  'characters', `hero-${id}-${index + 1}`, name, titles[index], texts[index],
  index === 0 ? 'always' : `stage:${id}:${index + 1}`,
  `Reach ${STAGE_NAME} ${index === 1 ? 'II' : 'III'} as ${name}.`,
)));

// ---- Relics ----
const RELICS: readonly (readonly [string, string, string])[] = [
  ['spirit-peach', 'Spirit Peach', 'It grows on a tree older than the Heavens. The fruit remembers being whole, and eating one reminds the body how.'],
  ['jade-elixir', 'Jade Elixir', 'Alchemists spent a hundred years refining it to widen a vessel, not to lengthen a life. The difference matters.'],
  ['qi-crystal', 'Qi Crystal', 'Qi pressed solid by a sect that ran out of time to use it. It is still warm.'],
  ['echo-shard', 'Spirit Stones', 'Crystallised qi, the coin of every cultivator. Before the Sundering a stone bought a meal. Now it buys a second chance.'],
  ['whetstone-talisman', 'Whetstone Talisman', 'A sect elder\'s blessing on paper: sharpen the intent, not the edge.'],
  ['crane-feather', 'Crane Feather', 'Cranes carried the first wanderers between the Heavens. Their feathers still weigh nothing.'],
  ['phoenix-ember', 'Phoenix Ember', 'A spark of a fire that only rises. It will not let its bearer be the last thing to burn.'],
  ['mirror-charm', 'Mirror Charm', 'Polished bronze that shows a stranger\'s face. Blows aimed at that stranger tend to miss you.'],
  ['spirit-lantern', 'Spirit Lantern', 'Lit with a wanderer\'s patience. The longer it burns, the sooner the next flame comes.'],
  ['thorn-seal', 'Thorn Seal', 'A Nightfold seal of grievance: whoever strikes its bearer is struck by their own reasons.'],
  ['frost-infusion', 'Frost Infusion', 'Winter drawn from the edge of the Void Tide and tempered into qi. It slows whatever it touches.'],
  ['storm-infusion', 'Storm Infusion', 'Tribulation lightning, bottled before it struck. It remembers where to go next.'],
  ['ember-infusion', 'Ember Infusion', 'Foxfire lit from a covenant lantern. It forgets nothing it burns.'],
  ['art-sectless', 'Ninefold Sword Manual', 'Master Bai\'s unpublished notes. The ninth form is a blank page, left for the reader.'],
  ['art-nightfold', 'Eclipse Step Manual', 'A Nightfold primer with a single rule on the first page: to arrive, first be elsewhere.'],
  ['art-moonfox', 'Moonfox Rite Manual', 'The covenant words in a script only the foxes can finish reading.'],
  ['jade-slip', 'Jade Slip', 'A strip of jade that holds a few thousand characters of someone\'s memory. Press it to your brow and read.'],
];
const ITEM_ENTRIES: LoreEntry[] = RELICS.map(([id, title, text]) => entry('items', `item-${id}`, title, 'Relic record', text, `item:${id}`, `Pick up the ${title}.`));

// ---- Bestiary ----
const BESTIARY: Readonly<Record<DungeonThemeId, readonly [string, string, string, string]>> = {
  'sectless-temple': [
    'Sword disciples caught mid-lesson when the Heavens broke. They still run the drills Master Bai taught them, only faster, and with no one left to bow to.',
    'Temple lions awakened by a grief too large for the temple to hold. They roar spirit qi outward in a fan. Step out of the line and the roar means nothing.',
    'The leftover will of a disciple\'s sword after the disciple fell. It hovers where the owner died, waiting to be picked up.',
    'Bai Wuji, last master of the Sectless Sky Temple. He greets every visitor with a rain of swords and an apology, in that order.'],
  'nightfold-crypt': [
    'The dynasty\'s third-rank blades, cut loose from their orders. They lunge from the dark at whoever they last saw.',
    'A minister bound to the throne by golden chains forged from his own oath. He drags them behind him like a coat.',
    'The Regent\'s watchfulness, given a body. It never blinks, which is how you know it is not alive.',
    'Lu Moyan, ruling for an heir who never came. Eclipse is his art: he vanishes from where you aimed and appears where you have just stopped looking.'],
  'foxfire-shrine': [
    'A covenant charm that learned to read itself aloud. It follows the terms exactly, including the ones that no longer apply.',
    'Armour from the shrine\'s honour guard, still standing its watch. The glaive is ceremonial. The strike is not.',
    'A shrine fox touched by the Void Tide. Its flames are the right colour for the wrong reason.',
    'Hua Linyue, the Moonfox Matriarch. Her nine flames hold the tide at the shrine\'s door. When she turns on a guest, it is because the tide has borrowed her voice.'],
};
const ENEMY_ENTRIES: LoreEntry[] = (Object.keys(BESTIARY) as DungeonThemeId[]).flatMap((realm) => BESTIARY[realm].map((text, column) => entry(
  'enemies', `enemy-${realm}-${column}`, ENEMY_NAMES[realm][column], column === 3 ? `Warden of the ${REALM_NAMES[realm]}` : `Echo of the ${REALM_NAMES[realm]}`, text,
  `kill:${realm}:${column}`, column === 3 ? `Defeat the ${ENEMY_NAMES[realm][column]}, warden of the ${REALM_NAMES[realm]}.` : `Defeat a ${ENEMY_NAMES[realm][column]} in the ${REALM_NAMES[realm]}.`,
)));

const PROTECTOR_LORE: Readonly<Record<DungeonThemeId, string>> = {
  'sectless-temple': 'The bronze lion that sat beside the temple gate for nine hundred years. When the gate closed it was told to let no one through, and it has never been told otherwise.',
  'nightfold-crypt': 'The dynasty\'s headsman, who swore to carry out every sentence the throne passed. There were a hundred sentences left unread when the Regent stopped speaking. He carries all hundred chains.',
  'foxfire-shrine': 'The keeper of the shrine\'s thousand gates, who counted every guest who passed beneath them. Since the tide rose the count no longer comes out right, and the keeper has decided the error is you.',
};
const PROTECTOR_ENTRIES: LoreEntry[] = (Object.keys(PROTECTOR_LORE) as DungeonThemeId[]).map((realm) => entry(
  'enemies', `protector-${realm}`, PROTECTORS[realm].name, `${PROTECTOR_TITLE} of the ${REALM_NAMES[realm]}`, PROTECTOR_LORE[realm],
  `kill:${realm}:protector`, `Defeat the ${PROTECTOR_TITLE} halfway through the ${REALM_NAMES[realm]}.`,
));
const ELITE_ENTRY = entry('enemies', 'enemy-elites', 'Elite Echoes', 'Wills that refused to fade',
  'Some echoes hold on harder than the rest. A barrier of stubborn qi, a body that splits rather than fall, feet that leave fire behind. Each wears its refusal as a mark above its head.',
  'elite', 'Meet an elite echo (marked with a glyph and a gold-edged bar) on any expedition.');

// ---- Realms and the wider world ----
const WORLD: LoreEntry[] = [
  entry('realms', 'world-heavens', 'The Nine Heavens', 'The world before', 'Long ago nine sects each held up one Heaven, and each Heaven rested on a single Dao. Together they sealed the Void Tide beneath the world. Every cultivator who ever lived was climbing toward them.', 'always', 'Known from the start.'),
  entry('realms', 'world-pavilion', "The Wayfarers' Pavilion", 'The one safe place', 'The Archivist built the Pavilion outside the Sundering, and it is the one place the echoes do not reach. Wanderers rest here, trade spirit stones for craft, and set out again.', 'always', 'Known from the start.'),
  entry('realms', 'world-echoes', 'Echoes', 'What the Sundering left', 'A cultivator\'s will can outlast the body. The Sundering froze those wills mid-motion. They walk the Secret Realms as echoes: loyal, grieving, or simply unable to stop.', 'first-kill', 'Defeat any enemy.'),
  entry('realms', 'world-sundering', 'The Great Sundering', 'The night the sky broke', 'On the night the Heavens broke, a tribulation lightning fell that no Dao had called. The Heavens did not fall. They shattered, and what was left of the Nine Daos scattered into pockets of memory: the Secret Realms.', 'slip', SLIP_HINT),
  entry('realms', 'world-void-tide', 'The Void Tide', 'What the Heavens held back', 'Beneath the Nine Heavens waits the Void Tide. It is not evil, only hungry. The Heavens existed to hold it. With the Heavens broken, the tide rises one realm at a time.', 'slip', SLIP_HINT),
  entry('realms', 'world-archivist', 'The Archivist', 'Keeper of the shelves', 'No one remembers who built the Grand Archive. Its shelves fill themselves with whatever wanderers recover. The Archivist, if there is one, has never been seen, only thanked.', 'slip', SLIP_HINT),
  entry('realms', 'world-peddler', `The ${MERCHANT_NAME}`, 'A stall where no stall should be', 'Nobody has seen the Peddler arrive or leave. The stall is simply there, in a realm that should be empty, selling whatever the last wanderer needed for whatever this one has found. The prices are fair. That is the strangest part.', 'feature:merchant', 'Find the Peddler\'s stall in a side room of any realm.'),
  entry('realms', 'world-altar', `The ${ALTAR_NAME}`, 'A bargain older than sects', 'Before there were sects there were altars, and before there were relics there was blood. Offer the altar a little of your vessel and it gives back something a fallen cultivator no longer needs.', 'feature:altar', 'Find a Heart-Blood Altar in a side room of any realm.'),
  entry('realms', 'world-bell', `The ${BELL_NAME}`, 'Ring it if you dare', 'Every sect hung a bell where disciples proved themselves. Ring one now and the realm answers with every echo it can spare. Those who endure find that the realm, grudgingly, pays its debts.', 'feature:trial', 'Find a Bell of Trials in a side room of any realm.'),
  entry('realms', 'world-tribulation', 'Tribulation', 'Why it gets harder', 'Each time the three Wardens fall, the Heavens notice. A fresh tribulation gathers, harsher than the last. The wise do not call it punishment. They call it an invitation to climb.', 'tribulation', 'Step through the final echo to begin a second Tribulation.'),
];
const REALM_LORE: readonly (readonly [DungeonThemeId, string, string, string, string, string, string])[] = [
  ['sectless-temple', 'sectless', 'A temple above the clouds where any seeker was taught the sword, whatever their birth. Its sect had no name, no ranks and no walls, until the Sundering gave it all three.',
    'Why the Gate Closed', 'Sect Master Bai Wuji sealed the temple gate against the refugees pouring in, to keep the sword legacy whole. The legacy survived. He never forgave himself, and his guilt became the temple\'s guardian.',
    'Verses of the Open Path', 'Carved over the temple lintel: "A sword with no sect belongs to every road." Beneath it, scratched in another hand: "Except this one."'],
  ['nightfold-crypt', 'nightfold', 'The burial hall of a shadow dynasty that ruled in the dark between eclipses. Its kings were entombed standing, so that they would never stop watching the throne.',
    'The Regent\'s Vigil', 'Regent Lu Moyan ruled in the name of a child who never came of age. He has held the throne ever since, certain the heir is merely late. The chains on his ministers are not punishment. They are loyalty with nowhere left to go.',
    'The Last Order', 'The Nightfold gave its assassins one rule: obey the final order. The dynasty\'s last order was spoken to a girl named Seo Jiwon. She is the only assassin ever to have refused it.'],
  ['foxfire-shrine', 'foxfire', 'A shrine where foxes and humans once swore covenants over foxfire. The lanterns still burn blue. Whoever lights one is, by old custom, a guest.',
    'The Matriarch\'s Flame', 'Matriarch Hua Linyue fed her own nine flames into the shrine\'s seal to hold the Void Tide back a little longer. What remains of her is vast and bright, and can no longer tell a guest from the tide.',
    'The Covenant of Paper', 'Every covenant at the shrine was written on a paper charm and kept in a lantern. The paper spirits are those charms, still reciting their terms to anyone who walks past.'],
];
const REALM_ENTRIES: LoreEntry[] = REALM_LORE.flatMap(([realm, key, intro, clearTitle, clearText, slipTitle, slipText]) => [
  entry('realms', `realm-${key}-1`, REALM_NAMES[realm], 'A Secret Realm', intro, `enter:${realm}`, `Enter the ${REALM_NAMES[realm]}.`),
  entry('realms', `realm-${key}-2`, clearTitle, REALM_NAMES[realm], clearText, `clear:${realm}`, `Defeat the warden of the ${REALM_NAMES[realm]}.`),
  entry('realms', `realm-${key}-3`, slipTitle, REALM_NAMES[realm], slipText, 'slip', SLIP_HINT),
]);

export const LORE: readonly LoreEntry[] = [...HEROES, ...ITEM_ENTRIES, ...ENEMY_ENTRIES, ...PROTECTOR_ENTRIES, ELITE_ENTRY, ...WORLD, ...REALM_ENTRIES];
export const LORE_BY_ID: ReadonlyMap<string, LoreEntry> = new Map(LORE.map((item) => [item.id, item]));
export const SHELF_ORDER: readonly ArchiveShelf[] = ['characters', 'items', 'enemies', 'realms'];

/** Whether an entry has been found. */
export const isKnown = (known: readonly string[], loreEntry: LoreEntry): boolean => loreEntry.event === 'always' || known.includes(loreEntry.id);

/** Entries an event would reveal that are not yet known. */
export const entriesFor = (event: string, known: readonly string[]): LoreEntry[] => LORE.filter((item) => item.event === event && !isKnown(known, item));

/** Slip-only entries still waiting to be read. */
export const unreadSlips = (known: readonly string[]): LoreEntry[] => LORE.filter((item) => item.event === 'slip' && !known.includes(item.id));

/**
 * Records an event, returning the entries it newly revealed. `known` is updated
 * in place so the caller can save it.
 */
export function discover(known: string[], event: string): LoreEntry[] {
  const found = entriesFor(event, known);
  for (const item of found) known.push(item.id);
  return found;
}

/** Reads a Jade Slip: reveals one unread slip entry at random, or none once they are all read. */
export function readSlip(known: string[], roll: number): LoreEntry | undefined {
  const pool = unreadSlips(known);
  if (pool.length === 0) return undefined;
  const chosen = pool[Math.min(pool.length - 1, Math.floor(roll * pool.length))];
  known.push(chosen.id);
  return chosen;
}

export const loreProgress = (known: readonly string[]): { found: number; total: number } =>
  ({ found: LORE.filter((item) => isKnown(known, item)).length, total: LORE.length });

/** Wisdom shown as a wanderer falls, in the voice of an old teacher. */
export const EPITAPHS: readonly string[] = [
  'The Dao does not end. It waits for you to return.',
  'A fallen cultivator is a seed the Heavens have not yet read.',
  'Even the Nine Heavens fell once. Stand again.',
  'Echoes teach those who stop to listen.',
  'Every tribulation is an invitation.',
  'A broken sword still remembers the hand that held it.',
];

/** Lore-flavoured loading tips. */
export const LORE_TIPS: readonly string[] = [
  'The Nine Heavens fell in a single night. What remains are echoes.',
  'Wardens are echoes that refused to fade.',
  'Jade Slips in chests hold the lost history of the Heavens.',
  'The Wayfarers\' Pavilion is the one place the echoes cannot reach.',
  'Each Tribulation is harsher than the last. The Heavens are curious.',
];

/**
 * Things the Pavilion's wanderers say once you have found the matching entry,
 * so lore also arrives through conversation. `requires` is an entry id.
 */
export const HERO_CHATTER: Readonly<Record<UnlockableHeroId, readonly { requires: string; line: string }[]>> = {
  'li-yunfeng': [
    { requires: 'realm-sectless-2', line: 'Master Bai shut the gate to save the sword. I would have opened it. I am still deciding if that makes me wrong.' },
    { requires: 'world-sundering', line: 'Lightning fell that no Dao had called. Whoever called it, I will meet them eventually.' },
    { requires: 'realm-sectless-3', line: 'Somebody scratched an answer under the lintel. I know the handwriting. I wish I did not.' },
  ],
  'seo-jiwon': [
    { requires: 'realm-nightfold-2', line: 'The Regent waits for a child who is not coming. I know something about orders that outlive their purpose.' },
    { requires: 'world-void-tide', line: 'The tide is hungry, not wicked. That makes it harder to hate.' },
    { requires: 'realm-nightfold-3', line: 'I said no once. It echoed longer than I expected.' },
  ],
  'tsukishiro-rei': [
    { requires: 'realm-foxfire-2', line: 'She burned her own flames to hold the tide. I carry what is left of her promise.' },
    { requires: 'world-echoes', line: 'Echoes are not ghosts. They are sentences nobody finished.' },
    { requires: 'realm-foxfire-3', line: 'Paper remembers every word you swear. Be careful what you write.' },
  ],
};
