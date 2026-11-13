import { describe, expect, it } from 'vitest';
import { liYunfeng } from '../src/characters/config/liYunfeng';
import { FlyingSwordSystem } from '../src/domain/FlyingSwordSystem';

const ability = liYunfeng.activeAbility;
if (ability?.kind !== 'flying_sword') throw new Error('Li Yunfeng must use Flying Sword.');
const config = ability.projectile;

describe('FlyingSwordSystem', () => {
  it('launches the four outer rack swords at the configured spread angles', () => {
    const system = new FlyingSwordSystem(config);
    const swords = system.spawn({ castId: 'cast-1', casterId: 'li-yunfeng', origin: { x: 10, y: 20 }, aimRadians: 0 });
    expect(swords).toHaveLength(4);
    expect(swords.map((sword) => Math.round(sword.angleRadians * 180 / Math.PI))).toEqual([-24, -8, 8, 24]);
    expect(new Set(swords.map((sword) => sword.id)).size).toBe(4);
  });

  it.each([0, 45, 90, -45])('rotates and travels correctly at a %s degree aim angle', (degrees) => {
    const system = new FlyingSwordSystem(config);
    const aimRadians = degrees * Math.PI / 180;
    system.spawn({ castId: `cast-${degrees}`, casterId: 'li-yunfeng', origin: { x: 0, y: 0 }, aimRadians });
    system.update(100);
    const swords = system.snapshots();
    swords.forEach((sword, index) => {
      const angle = aimRadians + config.spreadDegrees[index] * Math.PI / 180;
      expect(sword.angleRadians).toBeCloseTo(angle, 8);
      expect(sword.x).toBeCloseTo(Math.cos(angle) * config.speed * 0.1, 5);
      expect(sword.y).toBeCloseTo(Math.sin(angle) * config.speed * 0.1, 5);
    });
  });

  it('resolves collision and lifetime independently per projectile', () => {
    const system = new FlyingSwordSystem(config);
    system.spawn({ castId: 'cast-hit', casterId: 'li-yunfeng', origin: { x: 0, y: 0 }, aimRadians: 0 });
    system.update(200);
    const firstAngle = config.spreadDegrees[0] * Math.PI / 180;
    const hits = system.collideCircle({ id: 'target', x: Math.cos(firstAngle) * 72, y: Math.sin(firstAngle) * 72, radius: 1 });
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ targetId: 'target', damage: config.damage });
    expect(system.snapshots()).toHaveLength(3);
    system.update(config.lifetimeMs);
    expect(system.snapshots()).toHaveLength(0);
  });
});
