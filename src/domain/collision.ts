export interface Point2D {
  readonly x: number;
  readonly y: number;
}

/** Squared distance from a point to a finite line segment. */
export function pointToSegmentDistanceSquared(point: Point2D, start: Point2D, end: Point2D): number {
  const segmentX = end.x - start.x;
  const segmentY = end.y - start.y;
  const lengthSquared = segmentX * segmentX + segmentY * segmentY;
  if (lengthSquared <= Number.EPSILON) {
    const dx = point.x - start.x;
    const dy = point.y - start.y;
    return dx * dx + dy * dy;
  }
  const projection = ((point.x - start.x) * segmentX + (point.y - start.y) * segmentY) / lengthSquared;
  const t = Math.max(0, Math.min(1, projection));
  const nearestX = start.x + segmentX * t;
  const nearestY = start.y + segmentY * t;
  const dx = point.x - nearestX;
  const dy = point.y - nearestY;
  return dx * dx + dy * dy;
}

export function sweptCircleIntersectsCircle(
  start: Point2D,
  end: Point2D,
  movingRadius: number,
  target: Point2D,
  targetRadius: number,
): boolean {
  const combinedRadius = Math.max(0, movingRadius) + Math.max(0, targetRadius);
  return pointToSegmentDistanceSquared(target, start, end) <= combinedRadius * combinedRadius;
}
