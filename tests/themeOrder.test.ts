import { describe, expect, it } from 'vitest';
import { DUNGEON_THEME_IDS, shuffledDungeonThemes } from '../src/dungeon/themeOrder';

describe('dungeon theme order', () => {
  it('is deterministic and always contains every theme once', () => {
    expect(shuffledDungeonThemes(481516)).toEqual(shuffledDungeonThemes(481516));
    expect([...shuffledDungeonThemes(481516)].sort()).toEqual([...DUNGEON_THEME_IDS].sort());
  });

  it('does not force Sectless Temple to be first', () => {
    const firstThemes = new Set(Array.from({ length: 24 }, (_, seed) => shuffledDungeonThemes(seed + 1)[0]));
    expect(firstThemes).toEqual(new Set(DUNGEON_THEME_IDS));
  });
});
