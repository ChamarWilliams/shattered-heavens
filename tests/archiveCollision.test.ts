import { describe, expect, it } from 'vitest';
import { isArchiveWalkable } from '../src/game/archiveCollision';

describe('Grand Archive v4 collision map', () => {
  it('keeps the connected circulation routes open', () => {
    expect(isArchiveWalkable(480, 300)).toBe(true);
    expect(isArchiveWalkable(320, 275)).toBe(true);
    expect(isArchiveWalkable(640, 275)).toBe(true);
    expect(isArchiveWalkable(480, 95)).toBe(true);
    expect(isArchiveWalkable(480, 510)).toBe(false);
    expect(isArchiveWalkable(940, 270)).toBe(true);
    expect(isArchiveWalkable(940, 200)).toBe(false);
    expect(isArchiveWalkable(940, 330)).toBe(false);
  });

  it('makes every collection display approachable without walking through it', () => {
    expect(isArchiveWalkable(380, 225)).toBe(false);
    expect(isArchiveWalkable(580, 225)).toBe(false);
    expect(isArchiveWalkable(380, 350)).toBe(false);
    expect(isArchiveWalkable(580, 350)).toBe(false);
    expect(isArchiveWalkable(380, 275)).toBe(true);
    expect(isArchiveWalkable(580, 275)).toBe(true);
    expect(isArchiveWalkable(380, 405)).toBe(true);
    expect(isArchiveWalkable(580, 405)).toBe(true);
  });

  it('blocks shelves, desks, walls, and display islands', () => {
    expect(isArchiveWalkable(120, 145)).toBe(false);
    expect(isArchiveWalkable(265, 205)).toBe(false);
    expect(isArchiveWalkable(695, 205)).toBe(false);
    expect(isArchiveWalkable(840, 145)).toBe(false);
    expect(isArchiveWalkable(160, 380)).toBe(false);
    expect(isArchiveWalkable(800, 380)).toBe(false);
    expect(isArchiveWalkable(160, 440)).toBe(false);
    expect(isArchiveWalkable(800, 440)).toBe(false);
  });

  it('opens both lower reading wings through normal door-width passages', () => {
    expect(isArchiveWalkable(250, 390)).toBe(true);
    expect(isArchiveWalkable(160, 400)).toBe(true);
    expect(isArchiveWalkable(710, 390)).toBe(true);
    expect(isArchiveWalkable(800, 400)).toBe(true);
  });

  it('retains the complete image boundary', () => {
    expect(isArchiveWalkable(0, 270)).toBe(false);
    expect(isArchiveWalkable(960, 270)).toBe(false);
    expect(isArchiveWalkable(480, 0)).toBe(false);
    expect(isArchiveWalkable(480, 540)).toBe(false);
  });
});
