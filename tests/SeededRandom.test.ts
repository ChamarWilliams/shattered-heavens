import { describe, expect, it } from 'vitest';
import { SeededRandom } from '../src/domain/SeededRandom';

describe('SeededRandom', () => {
  it('replays the same sequence from the same seed', () => {
    const first = new SeededRandom(9182);
    const second = new SeededRandom(9182);
    expect(Array.from({ length: 8 }, () => first.next())).toEqual(Array.from({ length: 8 }, () => second.next()));
  });

  it('keeps integer results inside the requested inclusive range', () => {
    const random = new SeededRandom(42);
    const values = Array.from({ length: 100 }, () => random.integer(3, 7));
    expect(values.every((value) => value >= 3 && value <= 7)).toBe(true);
  });
});
