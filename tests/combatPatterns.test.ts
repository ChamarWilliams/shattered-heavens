import { describe, expect, it } from 'vitest';
import { ringAnglesWithGap, wrappedAngularDistance } from '../src/dungeon/combatPatterns';

describe('dungeon projectile patterns', () => {
  it('reserves the requested safe lane in a rotating radial volley', () => {
    const gapAngle = 0.73;
    const gapHalfWidth = 0.6;
    const angles = ringAnglesWithGap(10, 0.38, gapAngle, gapHalfWidth);

    expect(angles.length).toBeLessThan(10);
    expect(angles.length).toBeGreaterThanOrEqual(7);
    for (const angle of angles) expect(wrappedAngularDistance(angle, gapAngle)).toBeGreaterThanOrEqual(gapHalfWidth);
  });

  it('keeps the safe lane valid across the -pi/pi seam', () => {
    const gapAngle = Math.PI - 0.04;
    const gapHalfWidth = 0.62;
    const angles = ringAnglesWithGap(8, -Math.PI + 0.08, gapAngle, gapHalfWidth);
    for (const angle of angles) expect(wrappedAngularDistance(angle, gapAngle)).toBeGreaterThanOrEqual(gapHalfWidth);
  });
});
