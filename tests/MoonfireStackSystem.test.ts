import { describe, expect, it } from 'vitest';
import { MoonfireStackSystem } from '../src/domain/MoonfireStackSystem';

const config = {
  maxStacks: 3,
  stackDurationMs: 8000,
  movementSpeedPctPerStack: 0.04,
  basicDamagePerStack: 1,
  summonDurationPerStackMs: 700,
  summonAttackSpeedPctPerStack: 0.12,
} as const;

describe('MoonfireStackSystem', () => {
  it('caps, refreshes, and exposes Rei self buffs', () => {
    const system = new MoonfireStackSystem(config);
    system.gain(4);
    expect(system.snapshot()).toMatchObject({ stacks: 3, remainingMs: 8000, movementSpeedMultiplier: 1.12, basicDamageBonus: 3 });
    system.update(500);
    system.gain();
    expect(system.snapshot().remainingMs).toBe(8000);
  });

  it('expires and converts stacks into summon empowerment', () => {
    const system = new MoonfireStackSystem(config);
    system.gain(3);
    expect(system.consumeForSummon()).toEqual({ stacks: 3, durationBonusMs: 2100, attackIntervalMultiplier: 0.64 });
    expect(system.snapshot().stacks).toBe(0);
    system.gain();
    system.update(8000);
    expect(system.snapshot().stacks).toBe(0);
  });
});
