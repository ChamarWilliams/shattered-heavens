import { describe, expect, it } from 'vitest';
import { buyForge, buyProvision, buyUnlock, defaultMeta, forgeCost, loadMeta, recordRun, saveMeta, toggleTrial, trialShardMultiplier } from '../src/domain/metaProgress';

const memory = (initial: Record<string, string> = {}) => {
  const values = new Map(Object.entries(initial));
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
};

describe('meta progression', () => {
  it('buys forge tiers in order until mastered', () => {
    const meta = defaultMeta();
    meta.shards = 200;
    expect(buyForge(meta, 'vitality')).toBe(true);
    expect(buyForge(meta, 'vitality')).toBe(true);
    expect(buyForge(meta, 'vitality')).toBe(true);
    expect(forgeCost(meta, 'vitality')).toBeUndefined();
    expect(buyForge(meta, 'vitality')).toBe(false);
    expect(meta.shards).toBe(200 - 12 - 25 - 45);
  });

  it('refuses purchases it cannot afford and only one provision at a time', () => {
    const meta = defaultMeta();
    meta.shards = 20;
    expect(buyUnlock(meta, 'storm-infusion')).toBe(false);
    expect(buyProvision(meta, 'spirit-peach')).toBe(true);
    expect(buyProvision(meta, 'qi-crystal')).toBe(false);
    expect(buyUnlock(meta, 'thorn-seal')).toBe(false);
  });

  it('pays trial bonuses into the chronicle and remembers the deepest resonance', () => {
    const meta = defaultMeta();
    toggleTrial(meta, 'relentless');
    toggleTrial(meta, 'brittle');
    expect(trialShardMultiplier(meta.trials)).toBeCloseTo(1.5);
    const bonus = recordRun(meta, { hero: 'Li', resonance: 3, realm: 'Sectless', outcome: 'Fell', rooms: 9, shards: 10, items: [] });
    expect(bonus).toBe(5);
    expect(meta.shards).toBe(5);
    expect(meta.bestResonance).toBe(3);
    expect(meta.chronicle[0].shards).toBe(15);
  });

  it('round-trips through storage and migrates loose shard counts', () => {
    const storage = memory({ 'echoes.echoShards': '7' });
    const migrated = loadMeta(storage);
    expect(migrated.shards).toBe(7);
    migrated.unlocked.push('ember-infusion');
    saveMeta(migrated, storage);
    expect(loadMeta(storage).unlocked).toEqual(['ember-infusion']);
  });
});
