import { describe, expect, it } from 'vitest';
import { SeededRandom } from '../src/domain/SeededRandom';
import { ITEMS, RunLoadout, rollChest } from '../src/domain/runItems';

describe('run items', () => {
  it('stacks relics and swaps infusions', () => {
    const loadout = new RunLoadout();
    loadout.add('whetstone-talisman');
    loadout.add('whetstone-talisman');
    expect(loadout.basicDamageMultiplier).toBeCloseTo(1.4);
    expect(loadout.add('frost-infusion')).toBeUndefined();
    expect(loadout.add('ember-infusion')).toBe('frost-infusion');
    expect(loadout.infusion).toBe('ember-infusion');
    loadout.add('echo-shard');
    expect(loadout.shards).toBe(1);
  });

  it('caps the deflect chance and spends the phoenix once', () => {
    const loadout = new RunLoadout();
    for (let index = 0; index < 6; index += 1) loadout.add('mirror-charm');
    expect(loadout.deflectChance).toBe(0.45);
    expect(loadout.canRevive).toBe(false);
    loadout.add('phoenix-ember');
    expect(loadout.canRevive).toBe(true);
    loadout.phoenixSpent = true;
    expect(loadout.canRevive).toBe(false);
  });

  it('fills chests with known items, warden chests always hold a relic or infusion', () => {
    const random = new SeededRandom(7);
    for (let index = 0; index < 50; index += 1) {
      const room = rollChest('room', random, 0);
      expect(room.length).toBeGreaterThan(0);
      for (const id of room) expect(ITEMS[id]).toBeDefined();
      const warden = rollChest('warden', random, 2);
      expect(['relic', 'infusion']).toContain(ITEMS[warden[0]].kind);
    }
  });
});

describe('infusion tiers and hero Arts', () => {
  it('deepens an infusion you already carry, up to III, and resets on a new element', () => {
    const loadout = new RunLoadout();
    loadout.add('storm-infusion');
    expect(loadout.infusionLevel).toBe(1);
    loadout.add('storm-infusion');
    loadout.add('storm-infusion');
    loadout.add('storm-infusion');
    expect(loadout.infusionLevel).toBe(3);
    expect(loadout.add('frost-infusion')).toBe('storm-infusion');
    expect(loadout.infusionLevel).toBe(1);
  });

  it('only counts an Art for its own hero and stacks it', () => {
    const loadout = new RunLoadout();
    loadout.add('art-nightfold');
    loadout.add('art-nightfold');
    expect(loadout.abilityDamageMultiplier('art-nightfold')).toBeCloseTo(1.8);
    expect(loadout.abilityArtCooldownMultiplier('art-nightfold')).toBeCloseTo(0.7225);
    expect(loadout.abilityDamageMultiplier('art-sectless')).toBe(1);
  });

  it('can hold the hero Art in a warden chest but never in a room chest', () => {
    const random = new SeededRandom(3);
    const warden = Array.from({ length: 80 }, () => rollChest('warden', random, 0, { heroArt: 'art-moonfox' }));
    expect(warden.some((drops) => drops.includes('art-moonfox'))).toBe(true);
    const room = Array.from({ length: 80 }, () => rollChest('room', random, 5, { heroArt: 'art-moonfox' }));
    expect(room.some((drops) => drops.includes('art-moonfox'))).toBe(false);
  });
});
