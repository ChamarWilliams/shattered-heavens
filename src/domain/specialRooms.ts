/**
 * Rules for the special rooms (see dungeon/roomFeatures.ts for where they go).
 * Pure so the prices, offers and wave sizes are tested without the game running.
 */
import type { DungeonThemeId } from '../dungeon/types';
import { ITEMS, RARE_DROPS, type ItemId } from './runItems';
import type { SeededRandom } from './SeededRandom';

export interface Ware {
  readonly item: ItemId;
  readonly price: number;
}

/** Spirit Stone prices at the Wandering Peddler. Paid from what this expedition has found. */
export const WARE_PRICES = { common: 2, rare: 6, warden: 9 } as const;

const priceOf = (item: ItemId): number => WARE_PRICES[ITEMS[item].rarity];

/** Three wares: something to heal, a relic or infusion, and a third that is sometimes a Jade Elixir. */
export function merchantStock(random: SeededRandom, locked: readonly ItemId[] = []): readonly Ware[] {
  const rares = RARE_DROPS.filter((id) => !locked.includes(id));
  const pick = <T>(list: readonly T[]): T => list[random.integer(0, list.length - 1)];
  const first: ItemId = 'spirit-peach';
  const second = pick(rares);
  const third: ItemId = random.next() < 0.3 ? 'jade-elixir' : random.next() < 0.5 ? 'qi-crystal' : pick(rares.filter((id) => id !== second));
  return [first, second, third].map((item) => ({ item, price: priceOf(item) }));
}

export const canAfford = (purse: number, ware: Ware): boolean => purse >= ware.price;

/** The Heart-Blood Altar takes one max heart; it refuses anyone left with fewer than this many. */
export const ALTAR_MIN_MAX_HEALTH = 3;
export const canOfferHeart = (maxHealth: number): boolean => maxHealth >= ALTAR_MIN_MAX_HEALTH;

/** What the altar gives: your hero's Manual when you lack it (sometimes), otherwise a relic or infusion. */
export function altarReward(random: SeededRandom, locked: readonly ItemId[], heroArt: ItemId | undefined, ownsArt: boolean): ItemId {
  if (heroArt && !ownsArt && random.next() < 0.3) return heroArt;
  const rares = RARE_DROPS.filter((id) => !locked.includes(id));
  return rares[random.integer(0, rares.length - 1)];
}

/** Enemies in each wave of a Bell of Trials. */
export function trialWaves(themeIndex: number, tribulation: number): readonly number[] {
  const base = 3 + themeIndex + tribulation;
  return [Math.min(8, base), Math.min(9, base + 1), Math.min(10, base + 2)];
}
/** Pause between trial waves, so a fresh wave never lands on top of the last one's shots. */
export const TRIAL_WAVE_GAP_MS = 1400;

/** Dharma Protectors: one mid-floor guardian per realm, drawn from that realm's heavy enemy art. */
export interface ProtectorDefinition {
  readonly name: string;
  /** Sheet column of the art it borrows (1 = the realm's heavy enemy). */
  readonly column: number;
}

export const PROTECTORS: Readonly<Record<DungeonThemeId, ProtectorDefinition>> = {
  'sectless-temple': { name: 'Bronze Lion Patriarch', column: 1 },
  'nightfold-crypt': { name: 'Hundred-Chain Executioner', column: 1 },
  'foxfire-shrine': { name: 'Thousand-Gate Keeper', column: 1 },
};

export const protectorHealth = (themeIndex: number, difficulty: number): number => Math.round((150 + themeIndex * 60) * difficulty);
