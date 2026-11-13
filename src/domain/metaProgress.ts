/**
 * Progress kept between expeditions: Spirit Stones and what they buy in the
 * Wayfarers' Pavilion, the oaths you swear to raise the stakes, and a short chronicle
 * of past runs. Stored as one JSON record in localStorage.
 */
import { sanitizeTutorial } from './tutorial';
import { defaultHeroRecords, sanitizeHeroRecord, type HeroId, type HeroRecord } from './heroProgress';
import { LORE_BY_ID } from './lore';
import type { ItemId } from './runItems';

export type ForgeUpgradeId = 'vitality' | 'focus' | 'fortune';
export type ProvisionId = 'spirit-peach' | 'qi-crystal' | 'random-relic';
export type TrialId = 'swift' | 'brittle' | 'trapped' | 'relentless';

export interface ForgeUpgrade { readonly id: ForgeUpgradeId; readonly name: string; readonly blurb: string; readonly costs: readonly number[] }
export interface Provision { readonly id: ProvisionId; readonly name: string; readonly blurb: string; readonly cost: number }
export interface Trial { readonly id: TrialId; readonly name: string; readonly blurb: string; readonly shardBonus: number }

/** Spirit Forge: permanent upgrades, three tiers each. */
export const FORGE_UPGRADES: readonly ForgeUpgrade[] = [
  { id: 'vitality', name: 'Tempered Vessel', blurb: '+1 heart at the start of every expedition', costs: [12, 25, 45] },
  { id: 'focus', name: 'Still Mind', blurb: 'Your ability recharges 8% faster', costs: [10, 22, 40] },
  { id: 'fortune', name: 'Lucky Thread', blurb: 'Chests hold relics 8% more often', costs: [15, 30, 55] },
];
/** Treasure Cabinet: relics and infusions that must be bought before chests can hold them. */
export const CABINET_UNLOCKS: readonly { id: ItemId; cost: number }[] = [
  { id: 'spirit-lantern', cost: 18 },
  { id: 'thorn-seal', cost: 18 },
  { id: 'storm-infusion', cost: 24 },
  { id: 'ember-infusion', cost: 24 },
];
/** Alchemy Table: one provision carried into the next expedition. */
export const PROVISIONS: readonly Provision[] = [
  { id: 'spirit-peach', name: 'Packed Peach', blurb: 'Start with a Spirit Peach in hand (restores 2 hearts when you need it)', cost: 5 },
  { id: 'qi-crystal', name: 'Pocket Qi', blurb: 'Start with your ability charged and a spare Qi Crystal', cost: 5 },
  { id: 'random-relic', name: 'Wrapped Relic', blurb: 'Start the expedition holding a random relic', cost: 18 },
];
/** Expedition Table: oaths that make the realms harsher and pay more spirit stones. */
export const TRIALS: readonly Trial[] = [
  { id: 'swift', name: 'Oath of Haste', blurb: 'Enemies move and strike 25% faster', shardBonus: 0.2 },
  { id: 'brittle', name: 'Oath of the Fragile Heart', blurb: 'Start with 2 fewer hearts', shardBonus: 0.25 },
  { id: 'trapped', name: 'Oath of Snares', blurb: 'Three more traps in every room', shardBonus: 0.15 },
  { id: 'relentless', name: 'Oath of the Horde', blurb: 'Two more enemies in every room', shardBonus: 0.25 },
];

export interface ChronicleEntry {
  readonly at: number;
  readonly hero: string;
  readonly resonance: number;
  readonly realm: string;
  readonly outcome: string;
  readonly rooms: number;
  readonly shards: number;
  readonly items: readonly string[];
}

export interface MetaState {
  shards: number;
  forge: Record<ForgeUpgradeId, number>;
  unlocked: ItemId[];
  provision?: ProvisionId;
  trials: TrialId[];
  bestResonance: number;
  chronicle: ChronicleEntry[];
  /** Per-hero progress: Dao Insight, feats, and the two technique/heart-method grids. */
  heroes: Record<HeroId, HeroRecord>;
  /** Ids of the Archive entries found so far (see lore.ts). */
  lore: string[];
  /** Tutorial hints already shown, and 'practice' once the first-room practice is done (see tutorial.ts). */
  tutorial: string[];
}

interface MetaStorage { getItem(key: string): string | null; setItem(key: string, value: string): void }
const STORAGE_KEY = 'echoes.meta';
const browserStorage = (): MetaStorage | undefined => { try { return globalThis.localStorage; } catch { return undefined; } };

export function defaultMeta(): MetaState {
  return { shards: 0, forge: { vitality: 0, focus: 0, fortune: 0 }, unlocked: [], trials: [], bestResonance: 1, chronicle: [], heroes: defaultHeroRecords(), lore: [], tutorial: [] };
}

export function loadMeta(storage = browserStorage()): MetaState {
  const meta = defaultMeta();
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as Partial<MetaState>;
      meta.shards = Math.max(0, Number(saved.shards) || 0);
      for (const upgrade of FORGE_UPGRADES) meta.forge[upgrade.id] = Math.min(upgrade.costs.length, Math.max(0, Number(saved.forge?.[upgrade.id]) || 0));
      meta.unlocked = (saved.unlocked ?? []).filter((id) => CABINET_UNLOCKS.some((unlock) => unlock.id === id));
      meta.provision = PROVISIONS.some((provision) => provision.id === saved.provision) ? saved.provision : undefined;
      meta.trials = (saved.trials ?? []).filter((id) => TRIALS.some((trial) => trial.id === id));
      meta.bestResonance = Math.max(1, Number(saved.bestResonance) || 1);
      meta.chronicle = Array.isArray(saved.chronicle) ? saved.chronicle.slice(0, 12) : [];
      for (const id of Object.keys(meta.heroes) as HeroId[]) meta.heroes[id] = sanitizeHeroRecord(id, saved.heroes?.[id]);
      meta.lore = (saved.lore ?? []).filter((id, index, all) => LORE_BY_ID.has(id) && all.indexOf(id) === index);
      meta.tutorial = sanitizeTutorial(saved.tutorial);
    } else {
      // Shards collected before this record existed.
      meta.shards = Math.max(0, Number(storage?.getItem('echoes.echoShards')) || 0);
      meta.bestResonance = Math.max(1, Number(storage?.getItem('echoes.bestResonance')) || 1);
    }
  } catch { /* A malformed save starts fresh. */ }
  return meta;
}

export function saveMeta(meta: MetaState, storage = browserStorage()): void {
  try { storage?.setItem(STORAGE_KEY, JSON.stringify(meta)); } catch { /* Storage is optional. */ }
}

/** Next price of a forge upgrade, or undefined once it is maxed. */
export function forgeCost(meta: MetaState, id: ForgeUpgradeId): number | undefined {
  return FORGE_UPGRADES.find((upgrade) => upgrade.id === id)?.costs[meta.forge[id]];
}

/** Spends shards if there are enough; returns whether the purchase happened. */
export function spend(meta: MetaState, cost: number | undefined): boolean {
  if (cost === undefined || meta.shards < cost) return false;
  meta.shards -= cost;
  return true;
}

export function buyForge(meta: MetaState, id: ForgeUpgradeId): boolean {
  if (!spend(meta, forgeCost(meta, id))) return false;
  meta.forge[id] += 1;
  return true;
}

export function buyUnlock(meta: MetaState, id: ItemId): boolean {
  const unlock = CABINET_UNLOCKS.find((candidate) => candidate.id === id);
  if (!unlock || meta.unlocked.includes(id) || !spend(meta, unlock.cost)) return false;
  meta.unlocked.push(id);
  return true;
}

export function buyProvision(meta: MetaState, id: ProvisionId): boolean {
  const provision = PROVISIONS.find((candidate) => candidate.id === id);
  if (!provision || meta.provision || !spend(meta, provision.cost)) return false;
  meta.provision = id;
  return true;
}

export function toggleTrial(meta: MetaState, id: TrialId): void {
  meta.trials = meta.trials.includes(id) ? meta.trials.filter((trial) => trial !== id) : [...meta.trials, id];
}

/** Shard payout multiplier from the chosen trials. */
export function trialShardMultiplier(trials: readonly TrialId[]): number {
  return 1 + trials.reduce((sum, id) => sum + (TRIALS.find((trial) => trial.id === id)?.shardBonus ?? 0), 0);
}

/** Records how a run ended and pays the trial bonus on the shards it found. Returns the bonus. */
export function recordRun(meta: MetaState, entry: Omit<ChronicleEntry, 'at'>, at = Date.now()): number {
  const bonus = Math.floor(entry.shards * (trialShardMultiplier(meta.trials) - 1));
  meta.shards += bonus;
  meta.bestResonance = Math.max(meta.bestResonance, entry.resonance);
  meta.chronicle = [{ ...entry, shards: entry.shards + bonus, at }, ...meta.chronicle].slice(0, 12);
  return bonus;
}
