import { describe, expect, it } from 'vitest';
import { liYunfeng } from '../src/characters/config/liYunfeng';
import { SectlessSealSystem } from '../src/domain/SectlessSealSystem';

const ability = liYunfeng.activeAbility;
if (ability?.kind !== 'flying_sword') throw new Error('Li must use Flying Sword.');

describe('SectlessSealSystem', () => {
  it('stacks sword seals and rewards a melee recall', () => {
    const system = new SectlessSealSystem(ability.seal);
    for (let index = 0; index < 4; index++) system.apply({ id: 'dummy', x: 50, y: 60 });
    expect(system.snapshots()[0]).toMatchObject({ targetId: 'dummy', stacks: 4 });
    expect(system.recall('dummy')).toMatchObject({
      stacks: 4,
      damage: ability.seal.recallDamagePerStack * 4,
      reason: 'recalled',
    });
    expect(system.snapshots()).toHaveLength(0);
  });

  it('caps stacks and auto-detonates expired seals for reduced damage', () => {
    const system = new SectlessSealSystem(ability.seal);
    for (let index = 0; index < 9; index++) system.apply({ id: 'dummy', x: 1, y: 2 });
    expect(system.snapshots()[0].stacks).toBe(ability.seal.maxStacksPerTarget);
    const events = system.update(ability.seal.durationMs);
    expect(events[0]).toMatchObject({
      stacks: ability.seal.maxStacksPerTarget,
      damage: ability.seal.expireDamagePerStack * ability.seal.maxStacksPerTarget,
      reason: 'expired',
    });
  });
});
