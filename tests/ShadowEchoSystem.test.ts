import { describe, expect, it } from 'vitest';
import { ShadowEchoSystem } from '../src/domain/ShadowEchoSystem';

describe('ShadowEchoSystem', () => {
  const config = { distance: 160, delayMs: 430, durationMs: 260, damage: 28, collisionRadius: 30 };

  it('waits at Seo origin, then independently repeats the dash path', () => {
    const system = new ShadowEchoSystem(config);
    const start = system.start({ x: 40, y: 80 }, 0);
    expect(start.phase).toBe('waiting');
    expect(start.x).toBe(40);
    expect(system.update(429)?.phase).toBe('waiting');
    const striking = system.update(131)!;
    expect(striking.phase).toBe('striking');
    expect(striking.x).toBeGreaterThan(40);
    expect(striking.x).toBeLessThan(200);
  });

  it('finishes at the configured endpoint and clears renderer-independent state', () => {
    const system = new ShadowEchoSystem(config);
    system.start({ x: 10, y: 20 }, Math.PI / 2);
    const finished = system.update(config.delayMs + config.durationMs)!;
    expect(finished.active).toBe(false);
    expect(finished.x).toBeCloseTo(10);
    expect(finished.y).toBeCloseTo(180);
    expect(system.update(16)).toBeUndefined();
  });
});
