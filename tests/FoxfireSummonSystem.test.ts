import { describe, expect, it } from 'vitest';
import { tsukishiroRei } from '../src/characters/config/tsukishiroRei';
import { FoxfireSummonSystem } from '../src/domain/FoxfireSummonSystem';

const ability = tsukishiroRei.activeAbility;
if (ability?.kind !== 'foxfire_summon') throw new Error('Rei must use foxfire summons.');

describe('FoxfireSummonSystem', () => {
  it('creates one persistent named fire-spirit fox', () => {
    const system = new FoxfireSummonSystem(ability.familiar);
    const summoned = system.summon({ castId: 'rei-1', ownerId: tsukishiroRei.id, owner: { x: 100, y: 100 } });
    expect(summoned).toHaveLength(1);
    expect(new Set(summoned.map((familiar) => familiar.id)).size).toBe(1);
    expect(summoned[0].state).toBe('idle');
  });

  it('follows the owner, faces its target, and emits a foxfire attack', () => {
    const system = new FoxfireSummonSystem(ability.familiar);
    system.summon({ castId: 'rei-2', ownerId: tsukishiroRei.id, owner: { x: 100, y: 100 } });
    const attacks = system.update(600, { x: 120, y: 100 }, [{ id: 'dummy', x: 200, y: 100, health: 100 }]);
    expect(attacks).toHaveLength(1);
    expect(attacks.every((attack) => attack.targetId === 'dummy')).toBe(true);
    expect(new Set(attacks.map((attack) => attack.familiarId)).size).toBe(1);
    expect(system.snapshots().some((familiar) => familiar.x > 120)).toBe(true);
    expect(system.snapshots()[0].state).toBe('attack');
  });

  it('expires familiars independently of rendered objects', () => {
    const system = new FoxfireSummonSystem(ability.familiar);
    system.summon({ castId: 'rei-3', ownerId: tsukishiroRei.id, owner: { x: 0, y: 0 } });
    system.update(ability.familiar.durationMs, { x: 0, y: 0 }, []);
    expect(system.snapshots()).toHaveLength(0);
  });

  it('locks attack facing while smoothly following a moving owner', () => {
    const system = new FoxfireSummonSystem(ability.familiar);
    system.summon({ castId: 'rei-stable', ownerId: tsukishiroRei.id, owner: { x: 100, y: 100 } });
    system.update(240, { x: 100, y: 100 }, [{ id: 'dummy', x: 220, y: 100, health: 100 }]);
    const attacking = system.snapshots()[0];
    expect(attacking.state).toBe('attack');
    system.update(100, { x: 170, y: 150 }, [{ id: 'dummy', x: 220, y: 100, health: 100 }]);
    const following = system.snapshots()[0];
    expect(following.facingAngleRadians).toBeCloseTo(attacking.facingAngleRadians);
    expect(following.stateElapsedMs).toBeGreaterThan(attacking.stateElapsedMs);
    expect(Math.hypot(following.x - attacking.x, following.y - attacking.y)).toBeLessThan(90);
  });

  it('keeps the fox inside padded room bounds and applies Moonfire empowerment', () => {
    const system = new FoxfireSummonSystem(ability.familiar);
    const bounds = { left: 94, right: 606, top: 94, bottom: 376 };
    const [summoned] = system.summon({
      castId: 'rei-empowered',
      ownerId: tsukishiroRei.id,
      owner: { x: 650, y: 420 },
      bounds,
      empowerment: { stacks: 3, durationBonusMs: 2100, attackIntervalMultiplier: 0.64 },
    });
    expect(summoned).toMatchObject({ x: 606, y: 376, empowermentStacks: 3, remainingMs: 9300 });
    system.update(300, { x: 650, y: 420 }, [], bounds);
    const [following] = system.snapshots();
    expect(following.x).toBeLessThanOrEqual(bounds.right);
    expect(following.y).toBeLessThanOrEqual(bounds.bottom);
  });
});
