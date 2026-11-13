export const DIRECTIONS_8 = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;
export type Direction8 = (typeof DIRECTIONS_8)[number];

const ANGLE_DIRECTIONS: readonly Direction8[] = ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE'];

export function direction8FromAngle(angleRadians: number): Direction8 {
  const sector = Math.round(angleRadians / (Math.PI / 4));
  return ANGLE_DIRECTIONS[((sector % 8) + 8) % 8];
}

export function direction8FromVector(x: number, y: number, fallback: Direction8 = 'S'): Direction8 {
  if (x === 0 && y === 0) return fallback;
  return direction8FromAngle(Math.atan2(y, x));
}

export interface HeroOrientation {
  readonly movementDirection: Direction8;
  readonly facingDirection: Direction8;
  readonly aimAngle: number;
}
