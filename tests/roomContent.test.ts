import { describe, expect, it } from 'vitest';
import { generateDungeon } from '../src/dungeon/DungeonGenerator';
import { assignRoomFeatures, coverLayout, criticalPath, isCoverCell, ROOM_GRID } from '../src/dungeon/roomFeatures';
import { DUNGEON_THEME_IDS } from '../src/dungeon';
import { SeededRandom } from '../src/domain/SeededRandom';
import {
  ELITE_AFFIXES, affixesFor, eliteChance, eliteDrop, maxElitesPerRoom, rollEliteAffix,
} from '../src/domain/elites';
import {
  ALTAR_MIN_MAX_HEALTH, PROTECTORS, WARE_PRICES, altarReward, canAfford, canOfferHeart, merchantStock, protectorHealth, trialWaves,
} from '../src/domain/specialRooms';
import { ITEMS } from '../src/domain/runItems';

const floors = (): ReturnType<typeof generateDungeon>[] => {
  const result: ReturnType<typeof generateDungeon>[] = [];
  for (let seed = 1; seed <= 60; seed += 1) {
    for (const [index, themeId] of DUNGEON_THEME_IDS.entries()) result.push(generateDungeon({ seed: seed * 104729 + index * 7919, themeId, roomCount: 9 + index * 2, maxRadius: 5 }));
  }
  return result;
};

describe('room features', () => {
  it('puts exactly one Protector on the way to the warden, and never touches the start or warden rooms', () => {
    for (const dungeon of floors()) {
      const features = assignRoomFeatures(dungeon);
      const protectors = [...features].filter(([, feature]) => feature === 'protector');
      expect(protectors).toHaveLength(1);
      const path = criticalPath(dungeon).map((room) => room.id);
      if (path.length > 2) expect(path).toContain(protectors[0][0]);
      for (const room of dungeon.rooms) if (room.kind === 'start' || room.kind === 'boss') expect(features.has(room.id)).toBe(false);
    }
  });

  it('almost always offers a Peddler and an Altar or Bell on every floor', () => {
    let withMerchant = 0;
    let withShrine = 0;
    const all = floors();
    for (const dungeon of all) {
      const values = [...assignRoomFeatures(dungeon).values()];
      if (values.includes('merchant')) withMerchant += 1;
      if (values.includes('altar') || values.includes('trial')) withShrine += 1;
    }
    expect(withMerchant / all.length).toBeGreaterThan(0.97);
    expect(withShrine / all.length).toBeGreaterThan(0.95);
  });

  it('is decided by the seed alone', () => {
    const dungeon = generateDungeon({ seed: 4242, themeId: 'nightfold-crypt', roomCount: 11, maxRadius: 5 });
    expect([...assignRoomFeatures(dungeon)]).toEqual([...assignRoomFeatures(dungeon)]);
  });
});

describe('room cover', () => {
  // Every floor tile the hero can stand on (inside the 3-tile wall band).
  const floorCells = (): [number, number][] => {
    const cells: [number, number][] = [];
    for (let row = 3; row <= ROOM_GRID.rows - 4; row += 1) for (let column = 3; column <= ROOM_GRID.columns - 4; column += 1) cells.push([column, row]);
    return cells;
  };

  it('never blocks a door lane and never cuts off part of the floor', () => {
    for (let seed = 1; seed <= 400; seed += 1) {
      for (const feature of [undefined, 'vault', 'merchant', 'protector'] as const) {
        const pieces = coverLayout(new SeededRandom(seed), feature);
        const blocked = new Set(pieces.map((piece) => `${piece.column},${piece.row}`));
        for (const piece of pieces) expect(isCoverCell(piece.column, piece.row)).toBe(true);
        const open = floorCells().filter(([column, row]) => !blocked.has(`${column},${row}`));
        const seen = new Set<string>(['9,6']);
        const queue: [number, number][] = [[9, 6]];
        while (queue.length > 0) {
          const [column, row] = queue.shift() as [number, number];
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const key = `${column + dx},${row + dy}`;
            if (seen.has(key) || blocked.has(key) || !open.some(([c, r]) => c === column + dx && r === row + dy)) continue;
            seen.add(key);
            queue.push([column + dx, row + dy]);
          }
        }
        expect(seen.size).toBe(open.length);
      }
    }
  });

  it('keeps the special rooms to four framing pillars and fills vaults with urns', () => {
    expect(coverLayout(new SeededRandom(3), 'merchant')).toHaveLength(4);
    const vault = coverLayout(new SeededRandom(3), 'vault');
    expect(vault.every((piece) => piece.kind === 'urn')).toBe(true);
    expect(vault.length).toBeGreaterThanOrEqual(4);
  });
});

describe('elites', () => {
  it('never appear in the first rooms of a fresh expedition and grow more common with depth', () => {
    expect(eliteChance(0, 0, 0)).toBe(0);
    expect(eliteChance(0, 0, 2)).toBe(0);
    expect(eliteChance(1, 0, 5)).toBeGreaterThan(eliteChance(0, 0, 5));
    expect(eliteChance(2, 3, 5)).toBeLessThanOrEqual(0.4);
    expect(maxElitesPerRoom(0, 0)).toBe(1);
  });

  it('never gives a stationary sentinel a fire trail', () => {
    expect(affixesFor('sentinel')).not.toContain('scorching');
    const random = new SeededRandom(9);
    for (let index = 0; index < 500; index += 1) expect(rollEliteAffix(random, 'sentinel', 1)).not.toBe('scorching');
  });

  it('gives every affix its own marker shape, not just a colour', () => {
    const markers = Object.values(ELITE_AFFIXES).map((affix) => affix.marker);
    expect(new Set(markers).size).toBe(markers.length);
  });

  it('drops something useful', () => {
    const random = new SeededRandom(5);
    for (let index = 0; index < 50; index += 1) expect(['echo-shard', 'spirit-peach', 'qi-crystal']).toContain(eliteDrop(random));
  });
});

describe('special rooms', () => {
  it('stocks a peach, a relic and a third ware, priced by rarity', () => {
    const stock = merchantStock(new SeededRandom(12));
    expect(stock).toHaveLength(3);
    expect(stock[0].item).toBe('spirit-peach');
    for (const ware of stock) expect(ware.price).toBe(WARE_PRICES[ITEMS[ware.item].rarity]);
    expect(stock[1].item).not.toBe(stock[2].item);
    expect(canAfford(5, { item: 'spirit-peach', price: 2 })).toBe(true);
    expect(canAfford(1, { item: 'spirit-peach', price: 2 })).toBe(false);
  });

  it('never sells relics still locked in the Treasure Cabinet', () => {
    const locked = ['whetstone-talisman', 'crane-feather', 'mirror-charm'] as const;
    for (let seed = 1; seed < 200; seed += 1) {
      for (const ware of merchantStock(new SeededRandom(seed), locked)) expect(locked).not.toContain(ware.item);
    }
  });

  it('only takes a heart from a hero who can spare one', () => {
    expect(canOfferHeart(ALTAR_MIN_MAX_HEALTH)).toBe(true);
    expect(canOfferHeart(ALTAR_MIN_MAX_HEALTH - 1)).toBe(false);
    expect(altarReward(new SeededRandom(1), [], 'art-sectless', true)).not.toBe('art-sectless');
  });

  it('grows trial waves with depth but caps them', () => {
    expect(trialWaves(0, 0)).toEqual([3, 4, 5]);
    expect(trialWaves(2, 9).every((count, index) => count <= 8 + index)).toBe(true);
  });

  it('names a Protector for every realm and scales its health', () => {
    for (const themeId of DUNGEON_THEME_IDS) expect(PROTECTORS[themeId].name.length).toBeGreaterThan(0);
    expect(protectorHealth(2, 1)).toBeGreaterThan(protectorHealth(0, 1));
  });
});
