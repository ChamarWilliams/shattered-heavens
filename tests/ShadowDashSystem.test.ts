import { describe, expect, it } from 'vitest';
import { ShadowDashSystem } from '../src/domain/ShadowDashSystem';

describe('ShadowDashSystem', () => {
  it.each([0, 45, 90, -135])('travels the configured distance at %s degrees', (degrees) => {
    const system = new ShadowDashSystem({ distance: 160, durationMs: 200, damage: 22, collisionRadius: 24 });
    const angle = degrees * Math.PI / 180;
    system.start({ x: 20, y: 30 }, angle);
    const finished = system.update(200)!;
    expect(finished.x).toBeCloseTo(20 + Math.cos(angle) * 160, 5);
    expect(finished.y).toBeCloseTo(30 + Math.sin(angle) * 160, 5);
    expect(finished.progress).toBe(1);
  });
});
