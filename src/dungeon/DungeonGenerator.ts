import { ROOM_TEMPLATES, createOrientedTileMap, templatesForTheme } from './templates';
import {
  CARDINAL_DIRECTIONS,
  DIRECTION_OFFSET,
  DOOR_BITS,
  OPPOSITE_DIRECTION,
  countDoors,
  rotateDoorMask,
  type DungeonGenerationOptions,
  type GeneratedDungeon,
  type GeneratedRoom,
  type RoomTemplate,
  type RoomTopology,
} from './types';

interface Cell { readonly x: number; readonly y: number }

class SeededRandom {
  private state: number;
  constructor(seed: number) { this.state = seed >>> 0 || 0x6d2b79f5; }
  next(): number {
    this.state += 0x6d2b79f5;
    let value = this.state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  }
  integer(maxExclusive: number): number { return Math.floor(this.next() * maxExclusive); }
}

const cellKey = (cell: Cell): string => `${cell.x},${cell.y}`;

function topologyForMask(mask: number): RoomTopology {
  const doors = countDoors(mask);
  if (doors === 1) return 'cap';
  if (doors === 3) return 'junction';
  if (doors === 4) return 'crossroads';
  if (doors === 2) {
    const opposite = mask === (DOOR_BITS.N | DOOR_BITS.S) || mask === (DOOR_BITS.E | DOOR_BITS.W);
    return opposite ? 'straight' : 'corner';
  }
  throw new Error(`Unsupported room door mask: ${mask}`);
}

function resolveTemplate(templates: readonly RoomTemplate[], mask: number): Readonly<{ template: RoomTemplate; turns: 0 | 1 | 2 | 3 }> {
  const topology = topologyForMask(mask);
  const template = templates.find((candidate) => candidate.topology === topology);
  if (!template) throw new Error(`Missing ${topology} room template`);
  for (let turns = 0; turns < 4; turns += 1) {
    if (rotateDoorMask(template.canonicalDoorMask, turns) === mask) return { template, turns: turns as 0 | 1 | 2 | 3 };
  }
  throw new Error(`Template ${template.id} cannot match door mask ${mask}`);
}

function growCells(random: SeededRandom, roomCount: number, maxRadius: number): readonly Cell[] {
  const cells: Cell[] = [{ x: 0, y: 0 }];
  const occupied = new Set<string>(['0,0']);
  let attempts = 0;
  while (cells.length < roomCount && attempts < roomCount * 100) {
    attempts += 1;
    const origin = cells[random.integer(cells.length)];
    const direction = CARDINAL_DIRECTIONS[random.integer(CARDINAL_DIRECTIONS.length)];
    const offset = DIRECTION_OFFSET[direction];
    const candidate = { x: origin.x + offset.x, y: origin.y + offset.y };
    if (Math.abs(candidate.x) > maxRadius || Math.abs(candidate.y) > maxRadius || occupied.has(cellKey(candidate))) continue;
    cells.push(candidate);
    occupied.add(cellKey(candidate));
  }
  if (cells.length !== roomCount) throw new Error(`Could not place ${roomCount} rooms inside radius ${maxRadius}`);
  return cells;
}

function doorMaskFor(cell: Cell, occupied: ReadonlySet<string>): number {
  let mask = 0;
  for (const direction of CARDINAL_DIRECTIONS) {
    const offset = DIRECTION_OFFSET[direction];
    if (occupied.has(`${cell.x + offset.x},${cell.y + offset.y}`)) mask |= DOOR_BITS[direction];
  }
  return mask;
}

export function generateDungeon(options: DungeonGenerationOptions): GeneratedDungeon {
  const roomCount = Math.max(2, Math.min(options.roomCount ?? 12, 48));
  const maxRadius = Math.max(2, options.maxRadius ?? Math.ceil(Math.sqrt(roomCount)) + 1);
  const random = new SeededRandom(options.seed);
  const cells = growCells(random, roomCount, maxRadius);
  const occupied = new Set(cells.map(cellKey));
  const templates = templatesForTheme(options.themeId);
  const farthest = [...cells].sort((a, b) => (Math.abs(b.x) + Math.abs(b.y)) - (Math.abs(a.x) + Math.abs(a.y)))[0];

  const rooms: GeneratedRoom[] = cells.map((cell, index) => {
    const doorMask = doorMaskFor(cell, occupied);
    const { template, turns } = resolveTemplate(templates, doorMask);
    const isStart = cell.x === 0 && cell.y === 0;
    const isBoss = cell.x === farthest.x && cell.y === farthest.y;
    const kind = isStart ? 'start' : isBoss ? 'boss' : countDoors(doorMask) === 1 && random.next() < 0.45 ? 'treasure' : 'combat';
    return {
      id: `room-${index}`,
      x: cell.x,
      y: cell.y,
      doorMask,
      templateId: template.id,
      topology: template.topology,
      rotationQuarterTurns: turns,
      kind,
      tileMap: createOrientedTileMap(options.themeId, template.topology, doorMask),
    };
  });

  return {
    seed: options.seed,
    themeId: options.themeId,
    rooms,
    bounds: {
      minX: Math.min(...cells.map((cell) => cell.x)),
      minY: Math.min(...cells.map((cell) => cell.y)),
      maxX: Math.max(...cells.map((cell) => cell.x)),
      maxY: Math.max(...cells.map((cell) => cell.y)),
    },
  };
}

export function validateDungeon(dungeon: GeneratedDungeon): readonly string[] {
  const issues: string[] = [];
  const rooms = new Map(dungeon.rooms.map((room) => [`${room.x},${room.y}`, room]));
  for (const room of dungeon.rooms) {
    for (const direction of CARDINAL_DIRECTIONS) {
      const hasDoor = (room.doorMask & DOOR_BITS[direction]) !== 0;
      const offset = DIRECTION_OFFSET[direction];
      const neighbor = rooms.get(`${room.x + offset.x},${room.y + offset.y}`);
      if (hasDoor && !neighbor) issues.push(`${room.id} has ${direction} door into empty space`);
      if (!hasDoor && neighbor) issues.push(`${room.id} lacks ${direction} door to adjacent ${neighbor.id}`);
      if (hasDoor && neighbor && (neighbor.doorMask & DOOR_BITS[OPPOSITE_DIRECTION[direction]]) === 0) {
        issues.push(`${room.id} ${direction} door is not reciprocal with ${neighbor.id}`);
      }
    }
  }
  return issues;
}

export { ROOM_TEMPLATES };
