/**
 * Elite echoes: a stronger variant of an ordinary enemy carrying one affix.
 * Affixes change how the fight plays, never how fast a telegraph resolves:
 * every windup an elite uses is the same length as its ordinary form's.
 */
import type { ItemId } from './runItems';
import type { SeededRandom } from './SeededRandom';

export type EliteAffix = 'warded' | 'swift' | 'sundering' | 'scorching';
export type EliteRole = 'hunter' | 'shooter' | 'sentinel';

export interface EliteAffixDefinition {
  readonly id: EliteAffix;
  readonly name: string;
  readonly blurb: string;
  /** Aura colour. Each affix also has its own marker shape so colour is never the only cue. */
  readonly color: number;
  readonly marker: 'ring' | 'chevron' | 'split' | 'flame';
}

export const ELITE_AFFIXES: Readonly<Record<EliteAffix, EliteAffixDefinition>> = {
  warded: { id: 'warded', name: 'Warded', blurb: 'A qi barrier soaks the first blows', color: 0x8fe3ff, marker: 'ring' },
  swift: { id: 'swift', name: 'Swift', blurb: 'Moves and recovers faster', color: 0xb7ff8a, marker: 'chevron' },
  sundering: { id: 'sundering', name: 'Sundering', blurb: 'Splits in two when it falls', color: 0xd59bff, marker: 'split' },
  scorching: { id: 'scorching', name: 'Scorching', blurb: 'Leaves burning ground behind it', color: 0xff8a4a, marker: 'flame' },
};

/** Elites have this many times an ordinary enemy's health. */
export const ELITE_HEALTH = 2;
export const ELITE_SCALE = 1.15;
/** A Warded elite's barrier, as a share of its health. */
export const WARD_SHARE = 0.4;
/** Swift elites move this much faster and wait this much less between attacks (windups are unchanged). */
export const SWIFT_SPEED = 1.4;
export const SWIFT_RECOVERY = 0.8;
/** Sundering elites split into this many ordinary copies, each with this share of an ordinary enemy's health. */
export const SUNDER_COUNT = 2;
export const SUNDER_HEALTH = 0.4;
/** Scorching elites drop a flame patch this often while moving; it arms after a visible warning. */
export const SCORCH = { intervalMs: 900, armMs: 650, burnMs: 2200, radius: 16, maxPatches: 6 } as const;

/** Chance for each ordinary enemy to spawn as an elite. None in the first realm's first rooms. */
export function eliteChance(themeIndex: number, tribulation: number, roomsVisited: number): number {
  if (themeIndex === 0 && tribulation === 0 && roomsVisited < 3) return 0;
  return Math.min(0.4, 0.07 + 0.05 * themeIndex + 0.07 * tribulation);
}

/** Most elites allowed in one room. */
export function maxElitesPerRoom(themeIndex: number, tribulation: number): number {
  return themeIndex === 0 && tribulation === 0 ? 1 : tribulation >= 2 ? 3 : 2;
}

/** Affixes that make sense for a role: a sentinel never moves, so it cannot leave fire behind. */
export function affixesFor(role: EliteRole): readonly EliteAffix[] {
  return role === 'sentinel' ? ['warded', 'swift', 'sundering'] : ['warded', 'swift', 'sundering', 'scorching'];
}

/** Rolls whether an enemy is elite, and with which affix. */
export function rollEliteAffix(random: SeededRandom, role: EliteRole, chance: number): EliteAffix | undefined {
  if (chance <= 0 || random.next() >= chance) return undefined;
  const pool = affixesFor(role);
  return pool[random.integer(0, pool.length - 1)];
}

/** What an elite leaves behind when it falls. */
export function eliteDrop(random: SeededRandom): ItemId {
  const roll = random.next();
  return roll < 0.55 ? 'echo-shard' : roll < 0.85 ? 'spirit-peach' : 'qi-crystal';
}
