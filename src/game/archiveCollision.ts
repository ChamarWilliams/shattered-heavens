import { pointInPolygon, type EllipseBlocker, type PolygonBlocker } from './lobbyCollision';

export const ARCHIVE_BOUNDS = { left: 0, right: 960, top: 0, bottom: 540 } as const;

/** Solid architecture and furniture fitted to Grand Archive v3. */
export const ARCHIVE_POLYGON_BLOCKERS: readonly PolygonBlocker[] = [
  {
    id: 'upper-left-wall-stacks',
    points: [
      { x: 0, y: 0 }, { x: 410, y: 0 }, { x: 410, y: 55 },
      { x: 395, y: 55 }, { x: 395, y: 105 }, { x: 330, y: 105 },
      { x: 330, y: 135 }, { x: 300, y: 135 }, { x: 300, y: 120 },
      { x: 240, y: 120 }, { x: 240, y: 105 }, { x: 0, y: 105 },
    ],
  },
  {
    id: 'celestial-index-backdrop',
    points: [
      { x: 410, y: 0 }, { x: 550, y: 0 }, { x: 550, y: 55 },
      { x: 530, y: 55 }, { x: 530, y: 82 }, { x: 430, y: 82 },
      { x: 430, y: 55 }, { x: 410, y: 55 },
    ],
  },
  {
    id: 'upper-right-wall-stacks',
    points: [
      { x: 550, y: 0 }, { x: 960, y: 0 }, { x: 960, y: 105 },
      { x: 720, y: 105 }, { x: 720, y: 120 }, { x: 660, y: 120 },
      { x: 660, y: 135 }, { x: 630, y: 135 }, { x: 630, y: 105 },
      { x: 565, y: 105 }, { x: 565, y: 55 }, { x: 550, y: 55 },
    ],
  },
  {
    id: 'upper-left-reading-desk',
    points: [
      { x: 48, y: 118 }, { x: 214, y: 118 }, { x: 214, y: 171 },
      { x: 190, y: 178 }, { x: 72, y: 178 }, { x: 48, y: 170 },
    ],
  },
  {
    id: 'upper-right-reading-desk',
    points: [
      { x: 746, y: 118 }, { x: 912, y: 118 }, { x: 912, y: 170 },
      { x: 888, y: 178 }, { x: 770, y: 178 }, { x: 746, y: 171 },
    ],
  },
  {
    id: 'upper-left-catalogue-island',
    points: [
      { x: 235, y: 158 }, { x: 292, y: 158 }, { x: 305, y: 174 },
      { x: 305, y: 244 }, { x: 292, y: 252 }, { x: 238, y: 252 },
      { x: 228, y: 238 }, { x: 228, y: 177 },
    ],
  },
  {
    id: 'upper-right-catalogue-island',
    points: [
      { x: 668, y: 158 }, { x: 725, y: 158 }, { x: 732, y: 177 },
      { x: 732, y: 238 }, { x: 722, y: 252 }, { x: 668, y: 252 },
      { x: 655, y: 244 }, { x: 655, y: 174 },
    ],
  },
  {
    id: 'left-border',
    points: [
      { x: 0, y: 105 }, { x: 28, y: 105 }, { x: 28, y: 485 }, { x: 0, y: 485 },
    ],
  },
  {
    id: 'right-border-upper',
    points: [
      { x: 932, y: 105 }, { x: 960, y: 105 }, { x: 960, y: 240 }, { x: 932, y: 240 },
    ],
  },
  {
    id: 'right-border-lower',
    points: [
      { x: 932, y: 300 }, { x: 960, y: 300 }, { x: 960, y: 485 }, { x: 932, y: 485 },
    ],
  },
  {
    id: 'lower-left-wall-stacks',
    points: [
      { x: 28, y: 286 }, { x: 220, y: 286 }, { x: 220, y: 320 },
      { x: 230, y: 320 }, { x: 230, y: 385 }, { x: 90, y: 385 },
      { x: 90, y: 420 }, { x: 28, y: 420 },
    ],
  },
  {
    id: 'lower-left-reading-desk',
    points: [
      { x: 45, y: 420 }, { x: 220, y: 420 }, { x: 220, y: 470 }, { x: 45, y: 470 },
    ],
  },
  {
    id: 'lower-left-inner-stacks-top',
    points: [
      { x: 230, y: 300 }, { x: 304, y: 300 }, { x: 304, y: 360 }, { x: 230, y: 360 },
    ],
  },
  {
    id: 'lower-left-inner-stacks-bottom',
    points: [
      { x: 260, y: 420 }, { x: 304, y: 420 }, { x: 304, y: 455 }, { x: 260, y: 455 },
    ],
  },
  {
    id: 'lower-right-wall-stacks',
    points: [
      { x: 932, y: 286 }, { x: 740, y: 286 }, { x: 740, y: 320 },
      { x: 730, y: 320 }, { x: 730, y: 385 }, { x: 870, y: 385 },
      { x: 870, y: 420 }, { x: 932, y: 420 },
    ],
  },
  {
    id: 'lower-right-reading-desk',
    points: [
      { x: 740, y: 420 }, { x: 915, y: 420 }, { x: 915, y: 470 }, { x: 740, y: 470 },
    ],
  },
  {
    id: 'lower-right-inner-stacks-top',
    points: [
      { x: 656, y: 300 }, { x: 730, y: 300 }, { x: 730, y: 360 }, { x: 656, y: 360 },
    ],
  },
  {
    id: 'lower-right-inner-stacks-bottom',
    points: [
      { x: 656, y: 420 }, { x: 700, y: 420 }, { x: 700, y: 455 }, { x: 656, y: 455 },
    ],
  },
  {
    id: 'bottom-left-wall',
    points: [
      { x: 0, y: 480 }, { x: 420, y: 480 }, { x: 420, y: 540 }, { x: 0, y: 540 },
    ],
  },
  {
    id: 'bottom-right-wall',
    points: [
      { x: 540, y: 480 }, { x: 960, y: 480 }, { x: 960, y: 540 }, { x: 540, y: 540 },
    ],
  },
  {
    id: 'bottom-center-wall',
    points: [
      { x: 420, y: 480 }, { x: 540, y: 480 }, { x: 540, y: 540 }, { x: 420, y: 540 },
    ],
  },
];

export const ARCHIVE_ELLIPSE_BLOCKERS: readonly EllipseBlocker[] = [
  { x: 380, y: 225, radiusX: 43, radiusY: 36 },
  { x: 580, y: 225, radiusX: 43, radiusY: 36 },
  { x: 380, y: 350, radiusX: 43, radiusY: 36 },
  { x: 580, y: 350, radiusX: 43, radiusY: 36 },
];

export function isArchiveWalkable(x: number, y: number): boolean {
  if (x <= ARCHIVE_BOUNDS.left || x >= ARCHIVE_BOUNDS.right || y <= ARCHIVE_BOUNDS.top || y >= ARCHIVE_BOUNDS.bottom) {
    return false;
  }
  if (ARCHIVE_POLYGON_BLOCKERS.some((blocker) => pointInPolygon(x, y, blocker.points))) return false;
  if (ARCHIVE_ELLIPSE_BLOCKERS.some((blocker) => {
    const normalizedX = (x - blocker.x) / blocker.radiusX;
    const normalizedY = (y - blocker.y) / blocker.radiusY;
    return normalizedX * normalizedX + normalizedY * normalizedY <= 1;
  })) return false;
  return true;
}
