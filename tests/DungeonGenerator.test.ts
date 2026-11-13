import { describe, expect, it } from 'vitest';
import { generateDungeon, validateDungeon } from '../src/dungeon/DungeonGenerator';
import { templatesForTheme } from '../src/dungeon/templates';
import {
  DOOR_BITS,
  DungeonTile,
  countDoors,
  rotateDoorMask,
  type DungeonThemeId,
  type RoomTileMap,
} from '../src/dungeon/types';

const THEMES: readonly DungeonThemeId[] = ['sectless-temple', 'nightfold-crypt', 'foxfire-shrine'];

function boundaryDoorMask(tileMap: RoomTileMap): number {
  const centerX = Math.floor(tileMap.width / 2);
  const centerY = Math.floor(tileMap.height / 2);
  let mask = 0;
  if (tileMap.tiles[0][centerX] === DungeonTile.Door) mask |= DOOR_BITS.N;
  if (tileMap.tiles[centerY][tileMap.width - 1] === DungeonTile.Door) mask |= DOOR_BITS.E;
  if (tileMap.tiles[tileMap.height - 1][centerX] === DungeonTile.Door) mask |= DOOR_BITS.S;
  if (tileMap.tiles[centerY][0] === DungeonTile.Door) mask |= DOOR_BITS.W;
  return mask;
}

describe('dungeon room template library', () => {
  it.each(THEMES)('provides five useful topology maps for %s', (themeId) => {
    const templates = templatesForTheme(themeId);
    expect(templates).toHaveLength(5);
    expect(templates.map((template) => template.topology)).toEqual(['cap', 'straight', 'corner', 'junction', 'crossroads']);
    expect(templates.map((template) => countDoors(template.canonicalDoorMask))).toEqual([1, 2, 2, 3, 4]);
  });

  it.each(THEMES)('keeps authored doorway tiles synchronized with masks for %s', (themeId) => {
    for (const template of templatesForTheme(themeId)) {
      expect(boundaryDoorMask(template.tileMap)).toBe(template.canonicalDoorMask);
    }
  });

  it.each(THEMES)('keeps the three-tile masonry band solid except at real door corridors for %s', (themeId) => {
    for (const template of templatesForTheme(themeId)) {
      const { tileMap, canonicalDoorMask } = template;
      const centerX = Math.floor(tileMap.width / 2);
      const centerY = Math.floor(tileMap.height / 2);
      for (let depth = 0; depth < 3; depth += 1) {
        expect(tileMap.tiles[depth][centerX]).toBe((canonicalDoorMask & DOOR_BITS.N) !== 0 ? DungeonTile.Door : DungeonTile.Wall);
        expect(tileMap.tiles[tileMap.height - 1 - depth][centerX]).toBe((canonicalDoorMask & DOOR_BITS.S) !== 0 ? DungeonTile.Door : DungeonTile.Wall);
        expect(tileMap.tiles[centerY][depth]).toBe((canonicalDoorMask & DOOR_BITS.W) !== 0 ? DungeonTile.Door : DungeonTile.Wall);
        expect(tileMap.tiles[centerY][tileMap.width - 1 - depth]).toBe((canonicalDoorMask & DOOR_BITS.E) !== 0 ? DungeonTile.Door : DungeonTile.Wall);
      }
    }
  });

  it.each(THEMES)('does not create invisible or arbitrary interior collision for %s', (themeId) => {
    for (const template of templatesForTheme(themeId)) {
      const interior = template.tileMap.tiles.flat().filter((tile) => tile === DungeonTile.Prop || tile === DungeonTile.Hazard);
      expect(interior).toEqual([]);
    }
  });

  it('rotates doorway masks clockwise', () => {
    expect(rotateDoorMask(DOOR_BITS.N, 1)).toBe(DOOR_BITS.E);
    expect(rotateDoorMask(DOOR_BITS.N | DOOR_BITS.E, 2)).toBe(DOOR_BITS.S | DOOR_BITS.W);
    expect(rotateDoorMask(DOOR_BITS.N, 4)).toBe(DOOR_BITS.N);
  });
});

describe('Isaac-style dungeon generation', () => {
  it.each(THEMES)('builds a connected reciprocal 16-room %s dungeon', (themeId) => {
    const dungeon = generateDungeon({ seed: 481516, themeId, roomCount: 16 });
    expect(dungeon.rooms).toHaveLength(16);
    expect(dungeon.rooms.filter((room) => room.kind === 'start')).toHaveLength(1);
    expect(dungeon.rooms.filter((room) => room.kind === 'boss')).toHaveLength(1);
    expect(validateDungeon(dungeon)).toEqual([]);
    for (const room of dungeon.rooms) {
      expect(boundaryDoorMask(room.tileMap)).toBe(room.doorMask);
      expect(room.tileMap.width).toBe(19);
      expect(room.tileMap.height).toBe(13);
    }
  });

  it('is deterministic for multiplayer-safe seed replication', () => {
    const options = { seed: 90210, themeId: 'foxfire-shrine' as const, roomCount: 20 };
    expect(generateDungeon(options)).toEqual(generateDungeon(options));
    expect(generateDungeon({ ...options, seed: 90211 })).not.toEqual(generateDungeon(options));
  });
});
