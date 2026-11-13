import { describe, expect, it } from 'vitest';
import { isHeroUnlocked, loadUnlockedHeroes, unlockHeroForRealm } from '../src/domain/heroUnlocks';

const memoryStorage = (initial: Record<string, string> = {}) => {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
  };
};

describe('hero unlocks', () => {
  it('starts with only Li unlocked', () => {
    const storage = memoryStorage();
    expect([...loadUnlockedHeroes(storage)]).toEqual(['li-yunfeng']);
    expect(isHeroUnlocked('seo-jiwon', storage)).toBe(false);
    expect(isHeroUnlocked('tsukishiro-rei', storage)).toBe(false);
  });

  it('unlocks each hero once, after their own realm warden', () => {
    const storage = memoryStorage();
    expect(unlockHeroForRealm('sectless-temple', storage)).toBeUndefined();
    expect(unlockHeroForRealm('nightfold-crypt', storage)).toBe('seo-jiwon');
    expect(unlockHeroForRealm('nightfold-crypt', storage)).toBeUndefined();
    expect(isHeroUnlocked('seo-jiwon', storage)).toBe(true);
    expect(isHeroUnlocked('tsukishiro-rei', storage)).toBe(false);
    expect(unlockHeroForRealm('foxfire-shrine', storage)).toBe('tsukishiro-rei');
    expect(loadUnlockedHeroes(storage)).toEqual(new Set(['li-yunfeng', 'seo-jiwon', 'tsukishiro-rei']));
  });

  it('ignores malformed or unknown saved entries', () => {
    expect([...loadUnlockedHeroes(memoryStorage({ 'echoes.unlockedHeroes': '{oops' }))]).toEqual(['li-yunfeng']);
    expect(loadUnlockedHeroes(memoryStorage({ 'echoes.unlockedHeroes': '["seo-jiwon","villain"]' }))).toEqual(new Set(['li-yunfeng', 'seo-jiwon']));
  });
});
