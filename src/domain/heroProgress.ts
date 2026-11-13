/**
 * Hero progression. Every wanderer has three Stages and two 3x3 grids:
 *  - the Techniques grid holds ability upgrades, the Heart Method grid holds passives;
 *  - the centre of each grid is the hero's base kit and is always active;
 *  - you spend Dao Insight to open nodes next to ones you already own, and
 *    equip a limited number of them (more slots with each Form) to mix and match.
 * Stages are earned by feats, not points: defeat your realm's warden as that hero
 * for Stage II, then complete a full tribulation of all three realms for Stage III.
 */
import type { UnlockableHeroId } from './heroUnlocks';

export type HeroId = UnlockableHeroId;
export type GridId = 'arts' | 'dispositions';
export type FormNumber = 1 | 2 | 3;

/** Everything a node can change. Values add together across equipped nodes. */
export interface HeroMods {
  abilityDamage: number;
  abilityCooldown: number;
  basicDamage: number;
  moveSpeed: number;
  bonusHearts: number;
  deflect: number;
  roomHeal: number;
  castShieldMs: number;
  critChance: number;
  killsPerHeal: number;
  shardLuck: number;
}
export type NodeEffect = Partial<HeroMods>;

export interface GridNode {
  readonly id: string;
  readonly grid: GridId;
  /** 0..8 across a 3x3 grid, row by row; 4 is the centre. */
  readonly position: number;
  readonly name: string;
  readonly blurb: string;
  readonly effect: NodeEffect;
  readonly form: FormNumber;
  readonly cost: number;
}

export interface HeroRecord {
  points: number;
  /** Defeated this hero's own realm warden while playing them. */
  homeWarden: boolean;
  /** Completed all three realms in one expedition while playing them. */
  loop: boolean;
  unlocked: string[];
  equipped: string[];
}

export interface HeroDefinition {
  readonly id: HeroId;
  readonly homeRealm: 'sectless-temple' | 'nightfold-crypt' | 'foxfire-shrine';
  readonly forms: readonly [string, string, string];
  readonly gridNames: Readonly<Record<GridId, string>>;
  readonly nodes: readonly GridNode[];
}

export const CENTER = 4;
export const NEIGHBOURS: Readonly<Record<number, readonly number[]>> = {
  0: [1, 3], 1: [0, 2, 4], 2: [1, 5], 3: [0, 4, 6], 4: [1, 3, 5, 7], 5: [2, 4, 8], 6: [3, 7], 7: [4, 6, 8], 8: [5, 7],
};
const FORM_OF_POSITION: Readonly<Record<number, FormNumber>> = { 1: 1, 3: 1, 5: 1, 7: 1, 0: 2, 2: 2, 6: 3, 8: 3 };
const COST_OF_FORM: Readonly<Record<FormNumber, number>> = { 1: 4, 2: 8, 3: 14 };
export const SLOTS_PER_FORM: Readonly<Record<FormNumber, number>> = { 1: 1, 2: 2, 3: 3 };

type Spec = readonly [name: string, blurb: string, effect: NodeEffect];
/** Eight nodes in position order 0,1,2,3,5,6,7,8 (the centre is the base kit). */
const POSITIONS = [0, 1, 2, 3, 5, 6, 7, 8] as const;

function grid(heroId: HeroId, gridId: GridId, specs: readonly Spec[]): GridNode[] {
  return specs.map(([name, blurb, effect], index) => {
    const position = POSITIONS[index];
    const form = FORM_OF_POSITION[position];
    return { id: `${heroId}:${gridId}:${position}`, grid: gridId, position, name, blurb, effect, form, cost: COST_OF_FORM[form] };
  });
}

export const HEROES_PROGRESS: Readonly<Record<HeroId, HeroDefinition>> = {
  'li-yunfeng': {
    id: 'li-yunfeng',
    homeRealm: 'sectless-temple',
    forms: ['The Sectless Wanderer', 'Blade-Bearer of the Open Path', 'Sword Immortal of the Ninefold Heaven'],
    gridNames: { arts: 'Sword Techniques', dispositions: 'Sectless Heart Method' },
    nodes: [
      ...grid('li-yunfeng', 'arts', [
        ['Heaven-Splitting Arc', 'Ability +35% damage', { abilityDamage: 0.35 }],
        ['Open-Path Edge', 'Ability +20% damage', { abilityDamage: 0.2 }],
        ['Sword-Qi Tide', 'Ability recharges 20% faster', { abilityCooldown: 0.2 }],
        ['Flowing Blades', 'Ability recharges 12% faster', { abilityCooldown: 0.12 }],
        ['Sword Ward', 'A 0.7s ward after casting', { castShieldMs: 700 }],
        ['Ninefold Sovereign', 'Ability +30% damage, 10% faster', { abilityDamage: 0.3, abilityCooldown: 0.1 }],
        ['Blade Hunger', 'Every 8th kill restores a heart', { killsPerHeal: 8 }],
        ['Thousand Blades Return', 'A 1.1s ward after casting', { castShieldMs: 1100 }],
      ]),
      ...grid('li-yunfeng', 'dispositions', [
        ['Unbound Heart', '+1 heart', { bonusHearts: 1 }],
        ['Wandering Stride', 'Move 8% faster', { moveSpeed: 0.08 }],
        ['Edge Discipline', 'Basic attacks +20% damage', { basicDamage: 0.2 }],
        ['Iron Resolve', '+1 heart', { bonusHearts: 1 }],
        ['Honed Instinct', '12% chance to strike critically', { critChance: 0.12 }],
        ['Hundred-Road Pace', 'Move 10% faster, 5% to deflect', { moveSpeed: 0.1, deflect: 0.05 }],
        ['Quiet Mind', 'Clearing a room heals an extra heart', { roomHeal: 1 }],
        ["Sword Saint's Poise", '10% critical, basic +15% damage', { critChance: 0.1, basicDamage: 0.15 }],
      ]),
    ],
  },
  'seo-jiwon': {
    id: 'seo-jiwon',
    homeRealm: 'nightfold-crypt',
    forms: ['The Nightfold Exile', 'Eclipse-Stepper', 'Moonless Sovereign'],
    gridNames: { arts: 'Shadow Techniques', dispositions: "Exile's Heart Method" },
    nodes: [
      ...grid('seo-jiwon', 'arts', [
        ['Eclipse Passage', 'Ability recharges 20% faster', { abilityCooldown: 0.2 }],
        ['Folded Step', 'Ability recharges 12% faster', { abilityCooldown: 0.12 }],
        ['Rend From Nowhere', 'Ability +35% damage', { abilityDamage: 0.35 }],
        ['Echo Rupture', 'Ability +22% damage', { abilityDamage: 0.22 }],
        ['Veil Step', 'A 0.9s veil after casting', { castShieldMs: 900 }],
        ['Moonless Fold', 'A 0.6s veil, 12% faster', { castShieldMs: 600, abilityCooldown: 0.12 }],
        ['Dusk Appetite', 'Every 7th kill restores a heart', { killsPerHeal: 7 }],
        ['Sovereign of Shadows', 'Ability +30% damage, kills heal every 9th', { abilityDamage: 0.3, killsPerHeal: 9 }],
      ]),
      ...grid('seo-jiwon', 'dispositions', [
        ['Heartbreak', 'Basic attacks +20% damage', { basicDamage: 0.2 }],
        ['Light Foot', 'Move 10% faster', { moveSpeed: 0.1 }],
        ['Slipstream', 'Move 12% faster', { moveSpeed: 0.12 }],
        ['Knife Edge', '14% chance to strike critically', { critChance: 0.14 }],
        ['Shadow Skin', '8% chance to deflect', { deflect: 0.08 }],
        ['Night Ward', '+1 heart', { bonusHearts: 1 }],
        ['Cold Patience', 'Clearing a room heals an extra heart', { roomHeal: 1 }],
        ['Unseen Hunter', '12% critical, 6% deflect', { critChance: 0.12, deflect: 0.06 }],
      ]),
    ],
  },
  'tsukishiro-rei': {
    id: 'tsukishiro-rei',
    homeRealm: 'foxfire-shrine',
    forms: ['Heir to the Moonfox Flame', 'Keeper of the Moonfox Covenant', 'Empress of the Silver Flame'],
    gridNames: { arts: 'Foxfire Techniques', dispositions: 'Moonfox Heart Method' },
    nodes: [
      ...grid('tsukishiro-rei', 'arts', [
        ['Nine-Flame Surge', 'Ability +35% damage', { abilityDamage: 0.35 }],
        ['Warm Embers', 'Ability +20% damage', { abilityDamage: 0.2 }],
        ['Covenant Rhythm', 'Ability recharges 20% faster', { abilityCooldown: 0.2 }],
        ['Quick Calling', 'Ability recharges 12% faster', { abilityCooldown: 0.12 }],
        ['Fox Ward', 'A 0.8s ward after casting', { castShieldMs: 800 }],
        ['Moonfox Blessing', 'A 0.7s ward, ability +12% damage', { castShieldMs: 700, abilityDamage: 0.12 }],
        ['Spirit Feast', 'Every 8th kill restores a heart', { killsPerHeal: 8 }],
        ['Flame Empress', 'Ability +30% damage, 10% faster', { abilityDamage: 0.3, abilityCooldown: 0.1 }],
      ]),
      ...grid('tsukishiro-rei', 'dispositions', [
        ['Bright Flame', 'Basic attacks +20% damage', { basicDamage: 0.2 }],
        ['Soft Paws', 'Move 8% faster', { moveSpeed: 0.08 }],
        ['Lantern Walk', 'Clearing a room heals an extra heart', { roomHeal: 1 }],
        ['Moon-Touched Vitality', '+1 heart', { bonusHearts: 1 }],
        ['Silver Charm', '8% chance to deflect', { deflect: 0.08 }],
        ['Sky-Fox Grace', 'Move 10% faster, 8% critical', { moveSpeed: 0.1, critChance: 0.08 }],
        ['Fox Fortune', 'Room chests often hold an extra shard', { shardLuck: 0.25 }],
        ['Eternal Flame', '+1 heart, basic +10% damage', { bonusHearts: 1, basicDamage: 0.1 }],
      ]),
    ],
  },
};

export const defaultHeroRecord = (): HeroRecord => ({ points: 0, homeWarden: false, loop: false, unlocked: [], equipped: [] });
export const defaultHeroRecords = (): Record<HeroId, HeroRecord> => ({
  'li-yunfeng': defaultHeroRecord(), 'seo-jiwon': defaultHeroRecord(), 'tsukishiro-rei': defaultHeroRecord(),
});

export const nodeById = (heroId: HeroId, id: string): GridNode | undefined => HEROES_PROGRESS[heroId].nodes.find((node) => node.id === id);

/** Stage I always; II once the home warden has fallen to this hero; III once they have also survived a tribulation. */
export function formOf(record: HeroRecord): FormNumber {
  if (!record.homeWarden) return 1;
  return record.loop ? 3 : 2;
}
export const formTitle = (heroId: HeroId, record: HeroRecord): string => HEROES_PROGRESS[heroId].forms[formOf(record) - 1];
export const slotsFor = (record: HeroRecord): number => SLOTS_PER_FORM[formOf(record)];
export const equippedIn = (record: HeroRecord, grid: GridId): string[] => record.equipped.filter((id) => id.split(':')[1] === grid);

/** How the next form is earned, or undefined at the last form. */
export function nextFormGoal(heroId: HeroId, record: HeroRecord): string | undefined {
  if (!record.homeWarden) return `Defeat the realm warden of the ${REALM_NAMES[HEROES_PROGRESS[heroId].homeRealm]} while playing as this hero.`;
  if (!record.loop) return 'Complete all three realms in a single expedition and step through the final echo into the next tribulation.';
  return undefined;
}
const REALM_NAMES = { 'sectless-temple': 'Sectless Sky Temple', 'nightfold-crypt': 'Nightfold Shadow Crypt', 'foxfire-shrine': 'Moonlit Foxfire Shrine' } as const;

export type NodeState = 'base' | 'equipped' | 'owned' | 'available' | 'form-locked' | 'blocked';

export function nodeState(heroId: HeroId, record: HeroRecord, node: GridNode): NodeState {
  if (record.equipped.includes(node.id)) return 'equipped';
  if (record.unlocked.includes(node.id)) return 'owned';
  if (node.form > formOf(record)) return 'form-locked';
  const owned = (position: number): boolean => position === CENTER || record.unlocked.includes(`${heroId}:${node.grid}:${position}`);
  return NEIGHBOURS[node.position].some(owned) ? 'available' : 'blocked';
}

export function unlockNode(heroId: HeroId, record: HeroRecord, id: string): boolean {
  const node = nodeById(heroId, id);
  if (!node || nodeState(heroId, record, node) !== 'available' || record.points < node.cost) return false;
  record.points -= node.cost;
  record.unlocked.push(id);
  // The first node you open in a grid starts out equipped, so spending points always does something.
  if (equippedIn(record, node.grid).length < slotsFor(record)) record.equipped.push(id);
  return true;
}

/** Equips an owned node (if a slot is free) or unequips it. */
export function toggleEquip(heroId: HeroId, record: HeroRecord, id: string): boolean {
  const node = nodeById(heroId, id);
  if (!node || !record.unlocked.includes(id)) return false;
  if (record.equipped.includes(id)) {
    record.equipped = record.equipped.filter((equipped) => equipped !== id);
    return true;
  }
  if (equippedIn(record, node.grid).length >= slotsFor(record)) return false;
  record.equipped.push(id);
  return true;
}

export function neutralMods(): HeroMods {
  return { abilityDamage: 0, abilityCooldown: 0, basicDamage: 0, moveSpeed: 0, bonusHearts: 0, deflect: 0, roomHeal: 0, castShieldMs: 0, critChance: 0, killsPerHeal: 0, shardLuck: 0 };
}

/** Sums every equipped node. killsPerHeal takes the quickest, since stacking the same heal would be a trap. */
export function modifiersFor(heroId: HeroId, record: HeroRecord): HeroMods {
  const total = neutralMods();
  for (const id of record.equipped.slice(0, SLOTS_PER_FORM[3] * 2)) {
    const node = nodeById(heroId, id);
    if (!node) continue;
    for (const [key, value] of Object.entries(node.effect) as [keyof HeroMods, number][]) {
      if (key === 'killsPerHeal') total.killsPerHeal = total.killsPerHeal === 0 ? value : Math.min(total.killsPerHeal, value);
      else total[key] += value;
    }
  }
  return total;
}

/** Keeps a loaded record honest: known nodes only, equipped nodes owned, within the slot limit. */
export function sanitizeHeroRecord(heroId: HeroId, saved: Partial<HeroRecord> | undefined): HeroRecord {
  const record = defaultHeroRecord();
  record.points = Math.max(0, Math.floor(Number(saved?.points) || 0));
  record.homeWarden = Boolean(saved?.homeWarden);
  record.loop = Boolean(saved?.loop) && record.homeWarden;
  record.unlocked = (saved?.unlocked ?? []).filter((id, index, all) => nodeById(heroId, id) && all.indexOf(id) === index);
  for (const grid of ['arts', 'dispositions'] as const) {
    const kept = (saved?.equipped ?? []).filter((id) => record.unlocked.includes(id) && nodeById(heroId, id)?.grid === grid);
    record.equipped.push(...kept.slice(0, slotsFor(record)));
  }
  return record;
}

/** Dao Insight for a finished expedition: rooms explored, wardens felled and tribulations survived. */
export const masteryPointsFor = (rooms: number, wardens: number, resonance: number): number => rooms + 6 * wardens + 8 * Math.max(0, resonance - 1);
