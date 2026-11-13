import { describe, expect, it } from 'vitest';
import { pointToSegmentDistanceSquared, sweptCircleIntersectsCircle } from '../src/domain/collision';

describe('continuous collision helpers', () => {
  it('finds the nearest point on a segment', () => {
    expect(pointToSegmentDistanceSquared({ x: 5, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(9);
  });

  it('detects a fast projectile crossing a target between frames', () => {
    expect(sweptCircleIntersectsCircle({ x: 0, y: 0 }, { x: 100, y: 0 }, 3, { x: 50, y: 4 }, 2)).toBe(true);
  });

  it('does not report a near miss', () => {
    expect(sweptCircleIntersectsCircle({ x: 0, y: 0 }, { x: 100, y: 0 }, 3, { x: 50, y: 7 }, 2)).toBe(false);
  });
});
