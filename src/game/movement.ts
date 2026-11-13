export interface MoveVector {
  readonly x: number;
  readonly y: number;
}

export interface MoveResult extends MoveVector {
  readonly moved: boolean;
}

/**
 * Move through a collision field in small steps. The full diagonal is tried
 * first; per-axis fallbacks make movement slide along solid edges.
 */
export function moveWithCollision(
  start: MoveVector,
  delta: MoveVector,
  isWalkable: (x: number, y: number) => boolean,
  maxStep = 3,
): MoveResult {
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(delta.x), Math.abs(delta.y)) / maxStep));
  const stepX = delta.x / steps;
  const stepY = delta.y / steps;
  let x = start.x;
  let y = start.y;
  let moved = false;

  for (let index = 0; index < steps; index++) {
    if (isWalkable(x + stepX, y + stepY)) {
      x += stepX;
      y += stepY;
      moved = moved || stepX !== 0 || stepY !== 0;
      continue;
    }
    if (stepX !== 0 && isWalkable(x + stepX, y)) {
      x += stepX;
      moved = true;
    }
    if (stepY !== 0 && isWalkable(x, y + stepY)) {
      y += stepY;
      moved = true;
    }
  }

  return { x, y, moved };
}
