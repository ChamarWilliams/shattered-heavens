import { describe, expect, it } from 'vitest';
import { ITEMS } from '../src/domain/runItems';
import { ENEMY_NAMES } from '../src/domain/lexicon';
import { HERO_CHATTER, LORE, LORE_BY_ID, SHELF_ORDER, discover, entriesFor, isKnown, loreProgress, readSlip, unreadSlips } from '../src/domain/lore';
import { defaultMeta, loadMeta, saveMeta } from '../src/domain/metaProgress';

describe('lore', () => {
  it('has unique ids, every shelf, and a way to find every locked entry', () => {
    expect(new Set(LORE.map((item) => item.id)).size).toBe(LORE.length);
    for (const shelf of SHELF_ORDER) expect(LORE.some((item) => item.shelf === shelf)).toBe(true);
    for (const item of LORE) {
      expect(item.text.length).toBeGreaterThan(40);
      expect(item.hint.length).toBeGreaterThan(5);
      if (item.event !== 'always') expect(item.event).toMatch(/^(enter:|clear:|kill:|item:|stage:|feature:|first-kill$|elite$|tribulation$|slip$)/);
    }
  });

  it('covers every item, enemy and hero stage', () => {
    for (const id of Object.keys(ITEMS)) expect(LORE_BY_ID.has(`item-${id}`), `item ${id}`).toBe(true);
    for (const [realm, names] of Object.entries(ENEMY_NAMES)) names.forEach((_, column) => expect(LORE_BY_ID.has(`enemy-${realm}-${column}`)).toBe(true));
    for (const hero of ['li-yunfeng', 'seo-jiwon', 'tsukishiro-rei']) for (const chapter of [1, 2, 3]) expect(LORE_BY_ID.has(`hero-${hero}-${chapter}`)).toBe(true);
  });

  it('reveals entries from events once, and treats "always" as known', () => {
    const known: string[] = [];
    expect(LORE.filter((item) => item.event === 'always').every((item) => isKnown(known, item))).toBe(true);
    expect(entriesFor('kill:sectless-temple:0', known)).toHaveLength(1);
    expect(discover(known, 'kill:sectless-temple:0').map((item) => item.id)).toEqual(['enemy-sectless-temple-0']);
    expect(discover(known, 'kill:sectless-temple:0')).toEqual([]);
    expect(discover(known, 'stage:li-yunfeng:2')[0].id).toBe('hero-li-yunfeng-2');
    expect(discover(known, 'no-such-event')).toEqual([]);
  });

  it('reads Jade Slips until none are left', () => {
    const known: string[] = [];
    const total = unreadSlips(known).length;
    expect(total).toBeGreaterThanOrEqual(6);
    const read = new Set<string>();
    for (let index = 0; index < total; index += 1) {
      const page = readSlip(known, index / total)!;
      expect(page.event).toBe('slip');
      read.add(page.id);
    }
    expect(read.size).toBe(total);
    expect(readSlip(known, 0.5)).toBeUndefined();
    expect(unreadSlips(known)).toEqual([]);
  });

  it('reports progress and ties hall chatter to real entries', () => {
    const none = loreProgress([]);
    expect(none.total).toBe(LORE.length);
    expect(none.found).toBe(LORE.filter((item) => item.event === 'always').length);
    for (const chatter of Object.values(HERO_CHATTER).flat()) expect(LORE_BY_ID.has(chatter.requires)).toBe(true);
  });

  it('saves discovered lore and drops unknown ids', () => {
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
    const meta = defaultMeta();
    meta.lore = ['world-sundering', 'not-a-real-entry', 'world-sundering'];
    saveMeta(meta, storage);
    expect(loadMeta(storage).lore).toEqual(['world-sundering']);
  });
});
