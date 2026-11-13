import { describe, expect, it } from 'vitest';
import { direction8FromAngle, direction8FromVector } from '../src/characters/directions';

describe('eight-direction mapping', () => {
  it.each([
    [0, 'E'], [45, 'SE'], [90, 'S'], [135, 'SW'],
    [180, 'W'], [-135, 'NW'], [-90, 'N'], [-45, 'NE'],
  ] as const)('maps %s degrees to %s', (degrees, direction) => {
    expect(direction8FromAngle(degrees * Math.PI / 180)).toBe(direction);
  });

  it('preserves the fallback direction for a zero vector', () => {
    expect(direction8FromVector(0, 0, 'NW')).toBe('NW');
  });
});
