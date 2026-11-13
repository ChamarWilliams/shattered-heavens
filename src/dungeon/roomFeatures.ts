/**
 * What makes a room more than a box of enemies. Decided from the dungeon's seed
 * alone, so a resumed run gets the same floor:
 *  - protector: a Dharma Protector (mini-boss) on the way to the warden;
 *  - merchant:  a Wandering Peddler selling for this expedition's Spirit Stones;
 *  - altar:     a Heart-Blood Altar that trades a max heart for a relic;
 *  - trial:     a Bell of Trials: ring it for waves of enemies and a gilded chest;
 *  - vault:     a hidden chest guarded by traps.
 * Cover (pillars and breakable urns) is laid out on the room's 19 x 13 tile grid.
 */
import { SeededRandom } from '../domain/SeededRandom';
import { DIRECTION_OFFSET, DOOR_BITS, CARDINAL_DIRECTIONS, countDoors, type GeneratedDungeon, type GeneratedRoom } from './types';

export type RoomFeature = 'protector' | 'merchant' | 'altar' | 'trial' | 'vault';

export const ROOM_GRID = { columns: 19, rows: 13 } as const;

/** Shortest walk from the start room to the warden's room, start and warden included. */
export function criticalPath(dungeon: GeneratedDungeon): readonly GeneratedRoom[] {
  const byCell = new Map(dungeon.rooms.map((room) => [`${room.x},${room.y}`, room]));
  const start = dungeon.rooms.find((room) => room.kind === 'start');
  const boss = dungeon.rooms.find((room) => room.kind === 'boss');
  if (!start || !boss) return [];
  const previous = new Map<string, GeneratedRoom | undefined>([[start.id, undefined]]);
  const queue: GeneratedRoom[] = [start];
  while (queue.length > 0) {
    const room = queue.shift() as GeneratedRoom;
    if (room.id === boss.id) break;
    for (const direction of CARDINAL_DIRECTIONS) {
      if ((room.doorMask & DOOR_BITS[direction]) === 0) continue;
      const offset = DIRECTION_OFFSET[direction];
      const next = byCell.get(`${room.x + offset.x},${room.y + offset.y}`);
      if (!next || previous.has(next.id)) continue;
      previous.set(next.id, room);
      queue.push(next);
    }
  }
  if (!previous.has(boss.id)) return [];
  const path: GeneratedRoom[] = [];
  for (let room: GeneratedRoom | undefined = boss; room; room = previous.get(room.id)) path.unshift(room);
  return path;
}

/**
 * Gives each floor a Protector on the critical path, a Peddler, and an Altar or a
 * Bell (both when there is room). Remaining dead ends the generator marked as
 * treasure become vaults.
 */
export function assignRoomFeatures(dungeon: GeneratedDungeon): ReadonlyMap<string, RoomFeature> {
  const random = new SeededRandom((dungeon.seed ^ 0x5eedf00d) >>> 0);
  const features = new Map<string, RoomFeature>();
  const path = criticalPath(dungeon);
  const middle = path.slice(1, -1);
  const eligible = (room: GeneratedRoom): boolean => room.kind !== 'start' && room.kind !== 'boss' && !features.has(room.id);
  // The Protector waits halfway, never right at the warden's door when it can help it.
  const protector = middle.length > 0
    ? middle[Math.min(middle.length - 1, Math.floor((middle.length - 1) / 2))]
    : dungeon.rooms.filter(eligible).sort((a, b) => (Math.abs(b.x) + Math.abs(b.y)) - (Math.abs(a.x) + Math.abs(a.y)))[0];
  if (protector) features.set(protector.id, 'protector');

  const onPath = new Set(path.map((room) => room.id));
  const shuffle = <T>(list: T[]): T[] => {
    for (let index = list.length - 1; index > 0; index -= 1) {
      const swap = random.integer(0, index);
      [list[index], list[swap]] = [list[swap], list[index]];
    }
    return list;
  };
  const deadEnds = shuffle(dungeon.rooms.filter((room) => eligible(room) && countDoors(room.doorMask) === 1));
  const sideRooms = shuffle(dungeon.rooms.filter((room) => eligible(room) && countDoors(room.doorMask) > 1 && !onPath.has(room.id)));
  const take = (): GeneratedRoom | undefined => {
    const room = deadEnds.find(eligible) ?? sideRooms.find(eligible);
    return room;
  };
  const altarFirst = random.next() < 0.5;
  for (const feature of ['merchant', altarFirst ? 'altar' : 'trial', altarFirst ? 'trial' : 'altar'] as const) {
    const room = take();
    if (room) features.set(room.id, feature);
  }
  for (const room of dungeon.rooms) if (room.kind === 'treasure' && !features.has(room.id)) features.set(room.id, 'vault');
  return features;
}

export interface CoverPiece {
  readonly column: number;
  readonly row: number;
  readonly kind: 'pillar' | 'urn';
}

/**
 * Cover never sits in the door lanes (the middle three columns and the middle
 * row), so every door connects to every other, and never touches the walls, so
 * it cannot close off a corner.
 */
export const isCoverCell = (column: number, row: number): boolean =>
  column >= 4 && column <= 14 && row >= 4 && row <= 8 && Math.abs(column - 9) > 1 && row !== 6;

const mirror = (cells: readonly (readonly [number, number])[]): (readonly [number, number])[] =>
  cells.flatMap(([column, row]) => [[column, row], [18 - column, row]] as const);

const PILLAR_PATTERNS: readonly (readonly (readonly [number, number])[])[] = [
  [],
  mirror([[5, 4], [5, 8]]),
  mirror([[6, 4], [6, 8]]),
  mirror([[5, 5], [5, 7]]),
  mirror([[5, 4], [6, 4], [5, 8], [6, 8]]),
  mirror([[7, 5], [4, 8]]),
];

/** The cover in a room. Special rooms keep their floor clear except for four framing pillars. */
export function coverLayout(random: SeededRandom, feature: RoomFeature | undefined): readonly CoverPiece[] {
  if (feature === 'merchant' || feature === 'altar' || feature === 'trial' || feature === 'protector') {
    return PILLAR_PATTERNS[1].map(([column, row]) => ({ column, row, kind: 'pillar' as const }));
  }
  const pieces: CoverPiece[] = [];
  const taken = new Set<string>();
  const add = (column: number, row: number, kind: CoverPiece['kind']): void => {
    const key = `${column},${row}`;
    if (!isCoverCell(column, row) || taken.has(key)) return;
    taken.add(key);
    pieces.push({ column, row, kind });
  };
  if (feature !== 'vault') {
    const pattern = PILLAR_PATTERNS[random.integer(0, PILLAR_PATTERNS.length - 1)];
    for (const [column, row] of pattern) add(column, row, 'pillar');
  }
  const urns = feature === 'vault' ? random.integer(4, 6) : random.integer(0, 3);
  for (let attempt = 0; attempt < 40 && pieces.filter((piece) => piece.kind === 'urn').length < urns; attempt += 1) {
    add(random.integer(4, 14), random.integer(4, 8), 'urn');
  }
  return pieces;
}

/** A cover piece's ground footprint (what blocks feet and shots) on a room grid. */
export function coverFootprint(piece: CoverPiece, grid: { originX: number; originY: number; tile: number }): { left: number; top: number; width: number; height: number; baseY: number; centerX: number } {
  const left = grid.originX + piece.column * grid.tile;
  const top = grid.originY + piece.row * grid.tile;
  const inset = piece.kind === 'pillar' ? { x: 0.14, top: 0.22, bottom: 0.06 } : { x: 0.2, top: 0.3, bottom: 0.1 };
  return {
    left: left + grid.tile * inset.x,
    top: top + grid.tile * inset.top,
    width: grid.tile * (1 - 2 * inset.x),
    height: grid.tile * (1 - inset.top - inset.bottom),
    baseY: top + grid.tile * (1 - inset.bottom * 0.5),
    centerX: left + grid.tile / 2,
  };
}

/** The seed a room's traps (and, xor 0xc0de, its cover) are laid out from. Shared by solo runs and the co-op server. */
export function roomLayoutSeed(runSeed: number, roomId: string): number {
  let hash = runSeed;
  for (const character of roomId) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619) >>> 0;
  return hash;
}
