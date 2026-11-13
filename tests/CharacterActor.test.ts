import { describe, expect, it } from 'vitest';
import { liYunfeng } from '../src/characters/config/liYunfeng';
import { CharacterActor } from '../src/domain/CharacterActor';

describe('CharacterActor', () => {
  it('returns to idle after a non-looping attack', () => {
    const actor = new CharacterActor(liYunfeng);
    actor.attack();
    expect(actor.snapshot().state).toBe('attack');
    actor.update(liYunfeng.animations.attack.durationMs);
    expect(actor.snapshot().state).toBe('idle');
  });

  it('does not allow movement to interrupt a locked ability', () => {
    const actor = new CharacterActor(liYunfeng);
    actor.useAbility();
    actor.move('E');
    expect(actor.snapshot()).toMatchObject({
      state: 'ability',
      orientation: { movementDirection: 'E' },
    });
  });

  it('reports action phases and permits a late-recovery cancel', () => {
    const actor = new CharacterActor(liYunfeng);
    actor.attack();
    expect(actor.snapshot().actionPhase).toBe('windup');
    actor.update(liYunfeng.animations.attack.durationMs * 0.5);
    expect(actor.snapshot().actionPhase).toBe('active');
    actor.update(liYunfeng.animations.attack.durationMs * 0.3);
    expect(actor.snapshot().actionPhase).toBe('recovery');
    expect(actor.canStartAction()).toBe(true);
    actor.useAbility();
    expect(actor.snapshot()).toMatchObject({ state: 'ability', actionPhase: 'windup' });
  });

  it('tracks movement, facing, and aim independently', () => {
    const actor = new CharacterActor(liYunfeng);
    actor.aim(0);
    actor.move('NW', true);
    expect(actor.snapshot().orientation).toMatchObject({
      movementDirection: 'NW',
      facingDirection: 'E',
      aimAngle: 0,
    });
  });

  it('transitions to death at zero health and resets', () => {
    const actor = new CharacterActor(liYunfeng);
    actor.hurt(liYunfeng.maxHealth);
    expect(actor.snapshot()).toMatchObject({ state: 'death', health: 0 });
    actor.reset();
    expect(actor.snapshot()).toMatchObject({ state: 'idle', health: liYunfeng.maxHealth });
  });
});
