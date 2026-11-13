import { describe, expect, it } from 'vitest';
import { isLobbyWalkable } from '../src/game/lobbyCollision';
import { moveWithCollision } from '../src/game/movement';

describe('Realm Hall collision map', () => {
  it('follows the black-brush furniture contour and table ring', () => {
    expect(isLobbyWalkable(480, 290)).toBe(false);
    expect(isLobbyWalkable(480, 365)).toBe(true);
    expect(isLobbyWalkable(580, 290)).toBe(true);
    expect(isLobbyWalkable(334, 180)).toBe(true);
    expect(isLobbyWalkable(100, 370)).toBe(false);
    expect(isLobbyWalkable(175, 370)).toBe(false);
    expect(isLobbyWalkable(85, 450)).toBe(false);
    expect(isLobbyWalkable(160, 430)).toBe(false);
    expect(isLobbyWalkable(235, 445)).toBe(true);
    expect(isLobbyWalkable(38, 420)).toBe(false);
    expect(isLobbyWalkable(280, 430)).toBe(true);
    expect(isLobbyWalkable(775, 450)).toBe(true);
    expect(isLobbyWalkable(823, 398)).toBe(false);
    expect(isLobbyWalkable(856, 382)).toBe(false);
    expect(isLobbyWalkable(260, 300)).toBe(true);
    expect(isLobbyWalkable(700, 430)).toBe(true);
    expect(isLobbyWalkable(720, 220)).toBe(true);
  });

  it('keeps the portal stairs and every lower passage open', () => {
    expect(isLobbyWalkable(480, 140)).toBe(true);
    expect(isLobbyWalkable(480, 92)).toBe(true);
    expect(isLobbyWalkable(300, 100)).toBe(false);
    expect(isLobbyWalkable(800, 160)).toBe(false);
    expect(isLobbyWalkable(15, 260)).toBe(true);
    expect(isLobbyWalkable(945, 260)).toBe(true);
    expect(isLobbyWalkable(0, 300)).toBe(false);
    expect(isLobbyWalkable(960, 300)).toBe(false);
    expect(isLobbyWalkable(100, 495)).toBe(true);
    expect(isLobbyWalkable(350, 495)).toBe(true);
    expect(isLobbyWalkable(900, 495)).toBe(true);
    expect(isLobbyWalkable(100, 520)).toBe(false);
    expect(isLobbyWalkable(350, 520)).toBe(false);
    expect(isLobbyWalkable(900, 520)).toBe(false);
    expect(isLobbyWalkable(240, 495)).toBe(true);
    expect(isLobbyWalkable(240, 520)).toBe(false);
    expect(isLobbyWalkable(480, 520)).toBe(true);
    expect(isLobbyWalkable(630, 495)).toBe(true);
    expect(isLobbyWalkable(630, 520)).toBe(false);
    expect(isLobbyWalkable(790, 495)).toBe(true);
    expect(isLobbyWalkable(790, 520)).toBe(false);
    expect(isLobbyWalkable(46, 300)).toBe(true);
    expect(isLobbyWalkable(350, 502)).toBe(true);
    expect(isLobbyWalkable(-1, 300)).toBe(false);
    expect(isLobbyWalkable(961, 300)).toBe(false);
    expect(isLobbyWalkable(480, -1)).toBe(false);
    expect(isLobbyWalkable(480, 541)).toBe(false);
  });
});

describe('collision-aware movement', () => {
  it('preserves diagonal movement in open space', () => {
    const result = moveWithCollision({ x: 20, y: 20 }, { x: 12, y: 12 }, () => true);
    expect(result).toEqual({ x: 32, y: 32, moved: true });
  });

  it('slides along a blocked axis instead of stopping', () => {
    const result = moveWithCollision(
      { x: 0, y: 0 },
      { x: 12, y: 12 },
      (x) => x < 5,
    );
    expect(result.x).toBeLessThan(5);
    expect(result.y).toBe(12);
    expect(result.moved).toBe(true);
  });

  it('substeps large frame deltas so thin blockers cannot be skipped', () => {
    const result = moveWithCollision(
      { x: 0, y: 0 },
      { x: 12, y: 0 },
      (x) => x < 5 || x > 8,
    );
    expect(result.x).toBeLessThan(5);
  });
});
