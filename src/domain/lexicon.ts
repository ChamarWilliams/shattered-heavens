/**
 * The game's vocabulary. Shattered Heavens is a cultivation fantasy in the
 * manhua/manhwa tradition, so every system borrows that genre's language and
 * the same word always means the same thing. Display text only: saved data and
 * internal ids keep their original names. index.html repeats these words by hand.
 * See docs/LORE.md for what each term means in the world.
 */
import type { DungeonThemeId } from '../dungeon/types';

/** The game's title. It was "Echoes of the Realm" until that clashed with an existing WEBTOON. */
export const GAME_TITLE = 'Shattered Heavens';
export const HUB_NAME = "Wayfarers' Pavilion";
export const CURRENCY = 'Spirit Stones';
export const CURRENCY_ONE = 'Spirit Stone';
export const LOOP_NAME = 'Tribulation';
export const INSIGHT_NAME = 'Dao Insight';
export const STAGE_NAME = 'Stage';
export const OATH_NAME = 'Oath';
/** Mid-floor guardians (see domain/specialRooms.ts for their names). */
export const PROTECTOR_TITLE = 'Dharma Protector';
export const MERCHANT_NAME = 'Wandering Peddler';
export const ALTAR_NAME = 'Heart-Blood Altar';
export const BELL_NAME = 'Bell of Trials';

const ROMAN: readonly string[] = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
export const roman = (value: number): string => ROMAN[value] ?? String(value);

/** Names for each realm's four enemies: hunter, shooter, sentinel, warden. */
export const ENEMY_NAMES: Readonly<Record<DungeonThemeId, readonly [string, string, string, string]>> = {
  'sectless-temple': ['Gale Disciple', 'Stone Lion Guardian', 'Sword Wisp', 'Fallen Sect Master'],
  'nightfold-crypt': ['Nightfold Assassin', 'Chain Revenant', 'Void Eye', 'Eclipse Regent'],
  'foxfire-shrine': ['Paper Charm Spirit', 'Shrine Sentinel', 'Corrupted Moonfox', 'Nine-Tailed Calamity'],
};

/**
 * Words the game used to use. Nothing visible may use them any more; a test
 * scans the source for these so a stray old name cannot creep back in.
 */
export const RETIRED_TERMS: readonly RegExp[] = [
  /Echo Shards?/i, /Mastery Points?/i, /Realm Hall/i, /\bApothecary\b/, /\bAPOTHECARY\b/, /Relic Cabinet/i,
  /Echoes of the Realm/i, /Echoes <small>of the<\/small> Realm/, /Echoes of<\/span> the Realm/,
  /\bResonance\b/, /\bRESONANCE\b/, /\bFORM (I|II|III|\$\{)/, /\bForm (I|II|III|\$\{)/, /\bDispositions\b/,
];
