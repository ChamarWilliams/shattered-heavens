export const CARDINAL_DIRECTIONS = ['N', 'E', 'S', 'W'] as const;

export type CardinalDirection = (typeof CARDINAL_DIRECTIONS)[number];
export type DungeonThemeId = 'sectless-temple' | 'nightfold-crypt' | 'foxfire-shrine';
export type RoomTopology = 'cap' | 'straight' | 'corner' | 'junction' | 'crossroads';

export const DOOR_BITS: Readonly<Record<CardinalDirection, number>> = {
  N: 1,
  E: 2,
  S: 4,
  W: 8,
};

export const OPPOSITE_DIRECTION: Readonly<Record<CardinalDirection, CardinalDirection>> = {
  N: 'S',
  E: 'W',
  S: 'N',
  W: 'E',
};

export const DIRECTION_OFFSET: Readonly<Record<CardinalDirection, Readonly<{ x: number; y: number }>>> = {
  N: { x: 0, y: -1 },
  E: { x: 1, y: 0 },
  S: { x: 0, y: 1 },
  W: { x: -1, y: 0 },
};

export enum DungeonTile {
  Void = 0,
  Floor = 1,
  FloorAccent = 2,
  Wall = 3,
  Door = 4,
  Hazard = 5,
  Prop = 6,
  Objective = 7,
}

export interface DungeonTheme {
  readonly id: DungeonThemeId;
  readonly name: string;
  readonly hero: string;
  /** Approved visual source. It must be normalized before fixed-grid slicing. */
  readonly artSourceUrl: string;
  readonly palette: Readonly<{
    background: number;
    floor: number;
    accent: number;
    wall: number;
    door: number;
    hazard: number;
  }>;
}

export interface RoomTileMap {
  readonly width: number;
  readonly height: number;
  readonly tiles: readonly (readonly DungeonTile[])[];
}

export interface RoomTemplate {
  readonly id: string;
  readonly themeId: DungeonThemeId;
  readonly topology: RoomTopology;
  readonly canonicalDoorMask: number;
  readonly tileMap: RoomTileMap;
  readonly encounterTags: readonly string[];
}

export interface GeneratedRoom {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly doorMask: number;
  readonly templateId: string;
  readonly topology: RoomTopology;
  readonly rotationQuarterTurns: 0 | 1 | 2 | 3;
  readonly kind: 'start' | 'combat' | 'treasure' | 'boss';
  readonly tileMap: RoomTileMap;
}

export interface GeneratedDungeon {
  readonly seed: number;
  readonly themeId: DungeonThemeId;
  readonly rooms: readonly GeneratedRoom[];
  readonly bounds: Readonly<{ minX: number; minY: number; maxX: number; maxY: number }>;
}

export interface DungeonGenerationOptions {
  readonly seed: number;
  readonly themeId: DungeonThemeId;
  readonly roomCount?: number;
  readonly maxRadius?: number;
}

export function countDoors(mask: number): number {
  let count = 0;
  for (const direction of CARDINAL_DIRECTIONS) if ((mask & DOOR_BITS[direction]) !== 0) count += 1;
  return count;
}

export function rotateDoorMask(mask: number, quarterTurns: number): number {
  const turns = ((quarterTurns % 4) + 4) % 4;
  let result = mask;
  for (let turn = 0; turn < turns; turn += 1) {
    result = ((result << 1) & 0b1111) | ((result >> 3) & 1);
  }
  return result;
}

export function directionsForMask(mask: number): readonly CardinalDirection[] {
  return CARDINAL_DIRECTIONS.filter((direction) => (mask & DOOR_BITS[direction]) !== 0);
}
