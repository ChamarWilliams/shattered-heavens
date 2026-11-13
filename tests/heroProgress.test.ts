import { describe, expect, it } from 'vitest';
import {
  HEROES_PROGRESS, defaultHeroRecord, equippedIn, formOf, formTitle, masteryPointsFor, modifiersFor, nextFormGoal, nodeById, nodeState,
  sanitizeHeroRecord, slotsFor, toggleEquip, unlockNode, type HeroId,
} from '../src/domain/heroProgress';
import { defaultMeta, loadMeta, saveMeta } from '../src/domain/metaProgress';

const HEROES = Object.keys(HEROES_PROGRESS) as HeroId[];

describe('hero progression', () => {
  it('gives every hero two full grids of eight nodes with unique ids', () => {
    for (const heroId of HEROES) {
      const { nodes } = HEROES_PROGRESS[heroId];
      expect(nodes).toHaveLength(16);
      expect(new Set(nodes.map((node) => node.id)).size).toBe(16);
      for (const grid of ['arts', 'dispositions'] as const) {
        expect(nodes.filter((node) => node.grid === grid).map((node) => node.position).sort()).toEqual([0, 1, 2, 3, 5, 6, 7, 8]);
      }
    }
  });

  it('advances forms through feats, with a title for each', () => {
    const record = defaultHeroRecord();
    expect(formOf(record)).toBe(1);
    expect(formTitle('li-yunfeng', record)).toBe('The Sectless Wanderer');
    expect(nextFormGoal('li-yunfeng', record)).toContain('Sectless Sky Temple');
    record.loop = true;
    expect(formOf(record)).toBe(1);
    record.homeWarden = true;
    expect(formOf(record)).toBe(3);
    expect(formTitle('li-yunfeng', record)).toBe('Sword Immortal of the Ninefold Heaven');
    expect(nextFormGoal('li-yunfeng', record)).toBeUndefined();
  });

  it('only opens nodes next to owned ones, and only up to the current form', () => {
    const record = defaultHeroRecord();
    record.points = 100;
    const corner = nodeById('seo-jiwon', 'seo-jiwon:arts:0')!;
    expect(nodeState('seo-jiwon', record, corner)).toBe('form-locked');
    expect(unlockNode('seo-jiwon', record, corner.id)).toBe(false);
    expect(unlockNode('seo-jiwon', record, 'seo-jiwon:arts:1')).toBe(true);
    record.homeWarden = true;
    expect(nodeState('seo-jiwon', record, corner)).toBe('available');
    const far = nodeById('seo-jiwon', 'seo-jiwon:arts:2')!;
    expect(nodeState('seo-jiwon', record, far)).toBe('available');
    const blocked = nodeById('seo-jiwon', 'seo-jiwon:arts:8')!;
    expect(nodeState('seo-jiwon', record, blocked)).toBe('form-locked');
    record.loop = true;
    expect(nodeState('seo-jiwon', record, blocked)).toBe('blocked');
  });

  it('charges points, auto-equips into free slots and respects the slot limit', () => {
    const record = defaultHeroRecord();
    record.points = 20;
    expect(slotsFor(record)).toBe(1);
    expect(unlockNode('li-yunfeng', record, 'li-yunfeng:arts:1')).toBe(true);
    expect(record.points).toBe(16);
    expect(unlockNode('li-yunfeng', record, 'li-yunfeng:arts:3')).toBe(true);
    expect(equippedIn(record, 'arts')).toEqual(['li-yunfeng:arts:1']);
    expect(toggleEquip('li-yunfeng', record, 'li-yunfeng:arts:3')).toBe(false);
    expect(toggleEquip('li-yunfeng', record, 'li-yunfeng:arts:1')).toBe(true);
    expect(toggleEquip('li-yunfeng', record, 'li-yunfeng:arts:3')).toBe(true);
    expect(equippedIn(record, 'arts')).toEqual(['li-yunfeng:arts:3']);
    record.points = 0;
    expect(unlockNode('li-yunfeng', record, 'li-yunfeng:arts:5')).toBe(false);
  });

  it('sums equipped effects and takes the quickest kill-heal', () => {
    const record = defaultHeroRecord();
    record.homeWarden = true;
    record.unlocked = ['li-yunfeng:arts:1', 'li-yunfeng:arts:7', 'li-yunfeng:dispositions:3'];
    record.equipped = [...record.unlocked];
    const mods = modifiersFor('li-yunfeng', record);
    expect(mods.abilityDamage).toBeCloseTo(0.2);
    expect(mods.killsPerHeal).toBe(8);
    expect(mods.bonusHearts).toBe(1);
  });

  it('cleans up bad saves and persists through the meta record', () => {
    const cleaned = sanitizeHeroRecord('tsukishiro-rei', { points: -5, unlocked: ['nope', 'tsukishiro-rei:arts:1', 'tsukishiro-rei:arts:1'], equipped: ['nope', 'tsukishiro-rei:dispositions:3'], loop: true });
    expect(cleaned.points).toBe(0);
    expect(cleaned.loop).toBe(false);
    expect(cleaned.unlocked).toEqual(['tsukishiro-rei:arts:1']);
    expect(cleaned.equipped).toEqual([]);
    const meta = defaultMeta();
    meta.heroes['tsukishiro-rei'].points = 9;
    meta.heroes['tsukishiro-rei'].homeWarden = true;
    meta.heroes['tsukishiro-rei'].unlocked = ['tsukishiro-rei:arts:1', 'tsukishiro-rei:dispositions:3', 'bogus'];
    meta.heroes['tsukishiro-rei'].equipped = ['tsukishiro-rei:arts:1'];
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
    saveMeta(meta, storage);
    const loaded = loadMeta(storage).heroes['tsukishiro-rei'];
    expect(loaded.points).toBe(9);
    expect(formOf(loaded)).toBe(2);
    expect(loaded.unlocked).toEqual(['tsukishiro-rei:arts:1', 'tsukishiro-rei:dispositions:3']);
    expect(loaded.equipped).toEqual(['tsukishiro-rei:arts:1']);
  });

  it('awards mastery for rooms, wardens and loops', () => {
    expect(masteryPointsFor(8, 0, 1)).toBe(8);
    expect(masteryPointsFor(20, 3, 2)).toBe(20 + 18 + 8);
  });
});
