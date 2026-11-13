export interface CollisionPoint {
  readonly x: number;
  readonly y: number;
}

export interface PolygonBlocker {
  readonly id: string;
  readonly points: readonly CollisionPoint[];
}

export interface EllipseBlocker {
  readonly x: number;
  readonly y: number;
  readonly radiusX: number;
  readonly radiusY: number;
}

/** The containment boundary follows the complete 960 x 540 environment bitmap. */
export const LOBBY_BOUNDS = { left: 0, right: 960, top: 0, bottom: 540 } as const;

/**
 * Hand-traced blockers follow the user's black-brush contour along the inward
 * faces of the room art. Concave polygons preserve the portal and stair
 * openings instead of approximating the room with oversized rectangles.
 */
export const LOBBY_POLYGON_BLOCKERS: readonly PolygonBlocker[] = [
  {
    id: 'upper-architecture',
    points: [
      { x: 0, y: 0 }, { x: 960, y: 0 }, { x: 960, y: 230 },
      { x: 840, y: 230 }, { x: 840, y: 200 }, { x: 760, y: 200 },
      { x: 760, y: 180 }, { x: 740, y: 180 }, { x: 740, y: 155 },
      { x: 720, y: 155 }, { x: 720, y: 130 }, { x: 700, y: 130 },
      { x: 700, y: 145 }, { x: 610, y: 145 }, { x: 610, y: 165 },
      { x: 570, y: 165 }, { x: 570, y: 145 }, { x: 535, y: 145 },
      { x: 535, y: 110 }, { x: 520, y: 110 }, { x: 520, y: 90 },
      { x: 450, y: 90 }, { x: 450, y: 110 }, { x: 435, y: 110 },
      { x: 435, y: 145 }, { x: 390, y: 145 }, { x: 390, y: 165 },
      { x: 360, y: 165 }, { x: 360, y: 155 }, { x: 340, y: 155 },
      { x: 340, y: 130 }, { x: 185, y: 130 }, { x: 185, y: 150 },
      { x: 150, y: 150 }, { x: 150, y: 180 }, { x: 145, y: 180 },
      { x: 145, y: 195 }, { x: 135, y: 195 }, { x: 135, y: 210 },
      { x: 125, y: 210 }, { x: 125, y: 220 }, { x: 115, y: 220 },
      { x: 115, y: 230 },
    ],
  },
  {
    id: 'lower-left-furniture',
    points: [
      // The blue-marked side alcove above y=300 is intentionally walkable.
      { x: 0, y: 300 }, { x: 45, y: 300 },
      { x: 45, y: 310 }, { x: 145, y: 310 }, { x: 145, y: 345 },
      { x: 180, y: 345 }, { x: 180, y: 360 }, { x: 215, y: 360 },
      { x: 215, y: 380 }, { x: 240, y: 380 }, { x: 240, y: 440 },
      { x: 210, y: 440 }, { x: 210, y: 465 }, { x: 150, y: 465 },
      { x: 150, y: 440 }, { x: 125, y: 440 }, { x: 125, y: 465 },
      { x: 100, y: 465 }, { x: 100, y: 480 }, { x: 55, y: 480 },
      { x: 55, y: 490 }, { x: 0, y: 490 },
    ],
  },
  {
    id: 'lower-right-furniture',
    points: [
      // The blue-marked side alcove above y=300 is intentionally walkable.
      { x: 960, y: 300 }, { x: 930, y: 300 },
      { x: 930, y: 320 }, { x: 880, y: 320 }, { x: 880, y: 340 },
      { x: 840, y: 340 }, { x: 840, y: 355 }, { x: 780, y: 355 },
      { x: 780, y: 370 }, { x: 740, y: 370 }, { x: 740, y: 410 },
      { x: 760, y: 410 }, { x: 760, y: 440 }, { x: 800, y: 440 },
      { x: 800, y: 465 }, { x: 870, y: 465 }, { x: 870, y: 480 },
      { x: 905, y: 480 }, { x: 905, y: 490 }, { x: 960, y: 490 },
    ],
  },
  {
    id: 'bottom-containment-left',
    points: [
      { x: 0, y: 503 }, { x: 429, y: 503 },
      { x: 429, y: 540 }, { x: 0, y: 540 },
    ],
  },
  {
    id: 'bottom-containment-right',
    points: [
      { x: 543, y: 503 }, { x: 960, y: 503 },
      { x: 960, y: 540 }, { x: 543, y: 540 },
    ],
  },
];

export const LOBBY_ELLIPSE_BLOCKERS: readonly EllipseBlocker[] = [
  // Central expedition table and its attached stools, following the brush ring.
  { x: 480, y: 290, radiusX: 95, radiusY: 72 },
];

export function pointInPolygon(x: number, y: number, points: readonly CollisionPoint[]): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const current = points[i];
    const previous = points[j];
    const crosses = (current.y > y) !== (previous.y > y)
      && x < (previous.x - current.x) * (y - current.y) / (previous.y - current.y) + current.x;
    if (crosses) inside = !inside;
  }
  return inside;
}

export function isLobbyWalkable(x: number, y: number): boolean {
  if (x <= LOBBY_BOUNDS.left || x >= LOBBY_BOUNDS.right || y <= LOBBY_BOUNDS.top || y >= LOBBY_BOUNDS.bottom) {
    return false;
  }

  if (LOBBY_POLYGON_BLOCKERS.some((blocker) => pointInPolygon(x, y, blocker.points))) return false;

  if (LOBBY_ELLIPSE_BLOCKERS.some((blocker) => {
    const normalizedX = (x - blocker.x) / blocker.radiusX;
    const normalizedY = (y - blocker.y) / blocker.radiusY;
    return normalizedX * normalizedX + normalizedY * normalizedY <= 1;
  })) return false;

  return true;
}
