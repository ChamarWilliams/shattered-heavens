/**
 * Loot for a run. Heroes keep their own signature kit, so items change how that
 * kit performs instead of replacing it:
 *  - consumables apply the moment you pick them up;
 *  - relics are passive and stack for the rest of the run;
 *  - infusions temper your basic attack with an element. You carry one; a new
 *    one replaces the old.
 * Sprite indices match ITEM_ORDER in tools/generate_item_sprites.py.
 */
import type { SeededRandom } from './SeededRandom';

export type ItemKind = 'consumable' | 'relic' | 'infusion' | 'currency' | 'art' | 'lore';
export type ItemId =
  | 'spirit-peach' | 'jade-elixir' | 'qi-crystal' | 'echo-shard'
  | 'whetstone-talisman' | 'crane-feather' | 'phoenix-ember' | 'mirror-charm' | 'spirit-lantern' | 'thorn-seal'
  | 'frost-infusion' | 'storm-infusion' | 'ember-infusion'
  | 'art-sectless' | 'art-nightfold' | 'art-moonfox' | 'jade-slip';
export type InfusionId = 'frost-infusion' | 'storm-infusion' | 'ember-infusion';

export interface ItemDefinition {
  readonly id: ItemId;
  readonly kind: ItemKind;
  readonly name: string;
  /** One line shown when it is picked up. */
  readonly blurb: string;
  readonly sprite: number;
  readonly rarity: 'common' | 'rare' | 'warden';
}

export const ITEMS: Readonly<Record<ItemId, ItemDefinition>> = {
  'spirit-peach': { id: 'spirit-peach', kind: 'consumable', name: 'Spirit Peach', blurb: 'Restores 2 hearts', sprite: 0, rarity: 'common' },
  'jade-elixir': { id: 'jade-elixir', kind: 'consumable', name: 'Jade Elixir', blurb: '+1 max heart and a full heal', sprite: 1, rarity: 'warden' },
  'qi-crystal': { id: 'qi-crystal', kind: 'consumable', name: 'Qi Crystal', blurb: 'Your ability is ready again', sprite: 2, rarity: 'common' },
  'echo-shard': { id: 'echo-shard', kind: 'currency', name: 'Spirit Stones', blurb: 'Kept between expeditions', sprite: 3, rarity: 'common' },
  'whetstone-talisman': { id: 'whetstone-talisman', kind: 'relic', name: 'Whetstone Talisman', blurb: 'Basic attacks deal 20% more', sprite: 4, rarity: 'rare' },
  'crane-feather': { id: 'crane-feather', kind: 'relic', name: 'Crane Feather', blurb: 'Move 10% faster', sprite: 5, rarity: 'rare' },
  'phoenix-ember': { id: 'phoenix-ember', kind: 'relic', name: 'Phoenix Ember', blurb: 'Rise once at 2 hearts when you fall', sprite: 6, rarity: 'warden' },
  'mirror-charm': { id: 'mirror-charm', kind: 'relic', name: 'Mirror Charm', blurb: '15% chance to turn a hit aside', sprite: 7, rarity: 'rare' },
  'spirit-lantern': { id: 'spirit-lantern', kind: 'relic', name: 'Spirit Lantern', blurb: 'Ability recharges 20% faster', sprite: 8, rarity: 'rare' },
  'thorn-seal': { id: 'thorn-seal', kind: 'relic', name: 'Thorn Seal', blurb: 'Enemies that strike you take damage', sprite: 9, rarity: 'rare' },
  'frost-infusion': { id: 'frost-infusion', kind: 'infusion', name: 'Frost Infusion', blurb: 'Basic attacks slow enemies', sprite: 10, rarity: 'rare' },
  'storm-infusion': { id: 'storm-infusion', kind: 'infusion', name: 'Storm Infusion', blurb: 'Basic attacks arc to a second foe', sprite: 11, rarity: 'rare' },
  'ember-infusion': { id: 'ember-infusion', kind: 'infusion', name: 'Ember Infusion', blurb: 'Basic attacks set enemies burning', sprite: 12, rarity: 'rare' },
  'art-sectless': { id: 'art-sectless', kind: 'art', name: 'Ninefold Sword Manual', blurb: 'Li\'s ability hits 40% harder and returns 15% sooner', sprite: 13, rarity: 'warden' },
  'art-nightfold': { id: 'art-nightfold', kind: 'art', name: 'Eclipse Step Manual', blurb: 'Seo\'s ability hits 40% harder and returns 15% sooner', sprite: 14, rarity: 'warden' },
  'jade-slip': { id: 'jade-slip', kind: 'lore', name: 'Jade Slip', blurb: 'Reveals a lost page of history', sprite: 16, rarity: 'rare' },
  'art-moonfox': { id: 'art-moonfox', kind: 'art', name: 'Moonfox Rite Manual', blurb: 'Rei\'s ability hits 40% harder and returns 15% sooner', sprite: 15, rarity: 'warden' },
};

const COMMON_DROPS: readonly ItemId[] = ['spirit-peach', 'qi-crystal', 'echo-shard'];
export const RARE_DROPS: readonly ItemId[] = ['whetstone-talisman', 'crane-feather', 'mirror-charm', 'spirit-lantern', 'thorn-seal', 'frost-infusion', 'storm-infusion', 'ember-infusion'];

export interface ChestOptions {
  /** Relics and infusions not yet bought at the Pavilion's Treasure Cabinet. */
  readonly locked?: readonly ItemId[];
  /** Extra chance for a room chest to hold a relic (Lucky Thread). */
  readonly rareBonus?: number;
  /** The Manual for the hero being played; warden chests sometimes hold it. */
  readonly heroArt?: ItemId;
  /** Chance a room chest holds a Jade Slip (0 once every slip has been read). A warden's chest always holds one while this is above zero. */
  readonly slipChance?: number;
}

/** What a chest holds. Room chests give one or two everyday things and sometimes a relic; warden chests always give a relic or infusion plus a warden prize. */
export function rollChest(kind: 'room' | 'warden', random: SeededRandom, resonance: number, options: ChestOptions = {}): ItemId[] {
  const pick = <T>(list: readonly T[]): T => list[random.integer(0, list.length - 1)];
  const rares = RARE_DROPS.filter((id) => !options.locked?.includes(id));
  if (kind === 'warden') {
    const prize: ItemId = options.heroArt && random.next() < 0.35 ? options.heroArt : random.next() < 0.5 ? 'jade-elixir' : 'phoenix-ember';
    return [pick(rares), prize, 'echo-shard', 'echo-shard', ...((options.slipChance ?? 0) > 0 ? ['jade-slip' as const] : [])];
  }
  const drops: ItemId[] = [pick(COMMON_DROPS)];
  if (random.next() < 0.45) drops.push('echo-shard');
  if (random.next() < (options.slipChance ?? 0)) drops.push('jade-slip');
  // Deeper resonances are richer.
  if (random.next() < 0.18 + resonance * 0.06 + (options.rareBonus ?? 0)) drops.push(pick(rares));
  return drops;
}

/** Everything a hero has picked up this run. */
export class RunLoadout {
  readonly relics = new Map<ItemId, number>();
  infusion?: InfusionId;
  /** Finding the infusion you already carry deepens it, up to III. */
  infusionLevel = 0;
  shards = 0;
  phoenixSpent = false;

  stacks(id: ItemId): number { return this.relics.get(id) ?? 0; }

  get basicDamageMultiplier(): number { return 1 + 0.2 * this.stacks('whetstone-talisman'); }
  get moveSpeedMultiplier(): number { return 1 + 0.1 * this.stacks('crane-feather'); }
  get abilityCooldownMultiplier(): number { return Math.pow(0.8, this.stacks('spirit-lantern')); }
  /** Chance that an incoming hit is turned aside, capped so it never trivialises play. */
  get deflectChance(): number { return Math.min(0.45, 0.15 * this.stacks('mirror-charm')); }
  get thornDamage(): number { return 14 * this.stacks('thorn-seal'); }
  get canRevive(): boolean { return this.stacks('phoenix-ember') > 0 && !this.phoenixSpent; }
  /** Hero Manuals: one counts only for its own hero. */
  artStacks(art: ItemId | undefined): number { return art ? this.stacks(art) : 0; }
  abilityDamageMultiplier(art: ItemId | undefined): number { return 1 + 0.4 * this.artStacks(art); }
  abilityArtCooldownMultiplier(art: ItemId | undefined): number { return Math.pow(0.85, this.artStacks(art)); }

  /** Records a pickup that lasts for the run. Consumables are applied by the caller. Returns the infusion it replaced, if any. */
  add(id: ItemId): InfusionId | undefined {
    const item = ITEMS[id];
    if (item.kind === 'relic' || item.kind === 'art') this.relics.set(id, this.stacks(id) + 1);
    else if (item.kind === 'currency') this.shards += 1;
    else if (item.kind === 'infusion') {
      if (this.infusion === id) {
        this.infusionLevel = Math.min(3, this.infusionLevel + 1);
        return undefined;
      }
      const replaced = this.infusion;
      this.infusion = id as InfusionId;
      this.infusionLevel = 1;
      return replaced;
    }
    return undefined;
  }
}
