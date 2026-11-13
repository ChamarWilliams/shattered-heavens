import type { DungeonThemeId } from './types';

export const DUNGEON_THEME_IDS: readonly DungeonThemeId[] = ['sectless-temple', 'nightfold-crypt', 'foxfire-shrine'];

/** Deterministic per-run shuffle so multiplayer can replicate the same order. */
export function shuffledDungeonThemes(seed: number): readonly DungeonThemeId[] {
  let state = seed >>> 0 || 0x9e3779b9;
  const random = (): number => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
  const order = [...DUNGEON_THEME_IDS];
  for (let index = order.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [order[index], order[swap]] = [order[swap], order[index]];
  }
  return order;
}
