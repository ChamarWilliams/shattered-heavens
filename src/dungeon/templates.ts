import {
  DOOR_BITS,
  DungeonTile,
  type DungeonTheme,
  type DungeonThemeId,
  type RoomTemplate,
  type RoomTileMap,
  type RoomTopology,
} from './types';

const ROOM_WIDTH = 19;
const ROOM_HEIGHT = 13;
const DOOR_HALF_WIDTH = 1;
// The room paintings include deep masonry around the playable floor.  A
// one-tile border allowed actors to walk across that masonry, so collision
// follows the inner edge of the artwork instead. Door corridors cut through
// the full wall depth and remain the only legal way across it.
const WALL_DEPTH = 3;

export const DUNGEON_THEMES: Readonly<Record<DungeonThemeId, DungeonTheme>> = {
  'sectless-temple': {
    id: 'sectless-temple',
    name: 'Sectless Sky Temple',
    hero: 'Li Yunfeng',
    artSourceUrl: '/assets/dungeons/sectless-temple/source-kit-v1.png',
    palette: { background: 0x071416, floor: 0x24474d, accent: 0xd3a94f, wall: 0x102a30, door: 0x6ee7e5, hazard: 0x8bd8e6 },
  },
  'nightfold-crypt': {
    id: 'nightfold-crypt',
    name: 'Nightfold Shadow Crypt',
    hero: 'Seo Jiwon',
    artSourceUrl: '/assets/dungeons/nightfold-crypt/source-kit-v1.png',
    palette: { background: 0x090711, floor: 0x211d32, accent: 0x7650a8, wall: 0x100d1b, door: 0xb881ff, hazard: 0x9c42ff },
  },
  'foxfire-shrine': {
    id: 'foxfire-shrine',
    name: 'Moonlit Foxfire Shrine',
    hero: 'Tsukishiro Rei',
    artSourceUrl: '/assets/dungeons/foxfire-shrine/source-kit-v1.png',
    palette: { background: 0x07121d, floor: 0x243b52, accent: 0xd5ad54, wall: 0x172334, door: 0x57d8ff, hazard: 0x36aef5 },
  },
};

const TOPOLOGIES: readonly Readonly<{
  topology: RoomTopology;
  doorMask: number;
  encounterTags: readonly string[];
}>[] = [
  { topology: 'cap', doorMask: DOOR_BITS.N, encounterTags: ['start-or-dead-end', 'reward-safe'] },
  { topology: 'straight', doorMask: DOOR_BITS.N | DOOR_BITS.S, encounterTags: ['lane-combat', 'chase'] },
  { topology: 'corner', doorMask: DOOR_BITS.N | DOOR_BITS.E, encounterTags: ['ambush', 'line-of-sight-break'] },
  { topology: 'junction', doorMask: DOOR_BITS.N | DOOR_BITS.E | DOOR_BITS.W, encounterTags: ['wave-combat', 'choice-room'] },
  { topology: 'crossroads', doorMask: DOOR_BITS.N | DOOR_BITS.E | DOOR_BITS.S | DOOR_BITS.W, encounterTags: ['elite-arena', 'hub'] },
];

function isDoorCell(x: number, y: number, mask: number): boolean {
  const centerX = Math.floor(ROOM_WIDTH / 2);
  const centerY = Math.floor(ROOM_HEIGHT / 2);
  if (y < WALL_DEPTH && (mask & DOOR_BITS.N) !== 0) return Math.abs(x - centerX) <= DOOR_HALF_WIDTH;
  if (x >= ROOM_WIDTH - WALL_DEPTH && (mask & DOOR_BITS.E) !== 0) return Math.abs(y - centerY) <= DOOR_HALF_WIDTH;
  if (y >= ROOM_HEIGHT - WALL_DEPTH && (mask & DOOR_BITS.S) !== 0) return Math.abs(x - centerX) <= DOOR_HALF_WIDTH;
  if (x < WALL_DEPTH && (mask & DOOR_BITS.W) !== 0) return Math.abs(y - centerY) <= DOOR_HALF_WIDTH;
  return false;
}

function createTileMap(themeIndex: number, topologyIndex: number, doorMask: number): RoomTileMap {
  const centerX = Math.floor(ROOM_WIDTH / 2);
  const centerY = Math.floor(ROOM_HEIGHT / 2);
  const tiles = Array.from({ length: ROOM_HEIGHT }, (_, y) => Array.from({ length: ROOM_WIDTH }, (_, x) => {
    const border = x < WALL_DEPTH || y < WALL_DEPTH || x >= ROOM_WIDTH - WALL_DEPTH || y >= ROOM_HEIGHT - WALL_DEPTH;
    if (isDoorCell(x, y, doorMask)) return DungeonTile.Door;
    if (border) return DungeonTile.Wall;
    if (x === centerX && y === centerY) return topologyIndex >= 3 ? DungeonTile.Objective : DungeonTile.FloorAccent;
    if ((x + y + themeIndex + topologyIndex) % 11 === 0) return DungeonTile.FloorAccent;
    return DungeonTile.Floor;
  }));
  return { width: ROOM_WIDTH, height: ROOM_HEIGHT, tiles };
}

export const ROOM_TEMPLATES: readonly RoomTemplate[] = (Object.keys(DUNGEON_THEMES) as DungeonThemeId[]).flatMap(
  (themeId, themeIndex) => TOPOLOGIES.map((definition, topologyIndex) => ({
    id: `${themeId}-${definition.topology}`,
    themeId,
    topology: definition.topology,
    canonicalDoorMask: definition.doorMask,
    tileMap: createTileMap(themeIndex, topologyIndex, definition.doorMask),
    encounterTags: definition.encounterTags,
  })),
);

export function templatesForTheme(themeId: DungeonThemeId): readonly RoomTemplate[] {
  return ROOM_TEMPLATES.filter((template) => template.themeId === themeId);
}

export function createOrientedTileMap(themeId: DungeonThemeId, topology: RoomTopology, doorMask: number): RoomTileMap {
  const themeIndex = (Object.keys(DUNGEON_THEMES) as DungeonThemeId[]).indexOf(themeId);
  const topologyIndex = TOPOLOGIES.findIndex((definition) => definition.topology === topology);
  if (themeIndex < 0 || topologyIndex < 0) throw new Error(`Unknown room style ${themeId}/${topology}`);
  return createTileMap(themeIndex, topologyIndex, doorMask);
}

export function rotateTileMap(source: RoomTileMap, quarterTurns: number): RoomTileMap {
  let tiles = source.tiles.map((row) => [...row]);
  const turns = ((quarterTurns % 4) + 4) % 4;
  for (let turn = 0; turn < turns; turn += 1) {
    const height = tiles.length;
    const width = tiles[0]?.length ?? 0;
    tiles = Array.from({ length: width }, (_, y) => Array.from({ length: height }, (_, x) => tiles[height - 1 - x][y]));
  }
  return { width: tiles[0]?.length ?? 0, height: tiles.length, tiles };
}
