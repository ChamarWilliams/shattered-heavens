import type { AnimationDefinition, CharacterState } from '../types';

export const animationFrames = (prefix: string, count: number) =>
  Array.from({ length: count }, (_, index) => `${prefix}-${String(index + 1).padStart(2, '0')}`);

export function createAnimationSet(
  overrides: Partial<Record<CharacterState, Partial<AnimationDefinition>>> = {},
): Record<CharacterState, AnimationDefinition> {
  const base: Record<CharacterState, AnimationDefinition> = {
    idle: { frames: animationFrames('idle', 4), durationMs: 1200, loop: true, interruptible: true },
    move: { frames: animationFrames('move', 6), durationMs: 720, loop: true, interruptible: true },
    attack: { frames: animationFrames('attack', 5), durationMs: 560, loop: false, interruptible: false },
    ability: { frames: animationFrames('ability', 8), durationMs: 920, loop: false, interruptible: false },
    hurt: { frames: animationFrames('hurt', 3), durationMs: 360, loop: false, interruptible: false },
    death: { frames: animationFrames('death', 6), durationMs: 1100, loop: false, interruptible: false },
  };

  return Object.fromEntries(
    Object.entries(base).map(([state, definition]) => [
      state,
      { ...definition, ...overrides[state as CharacterState] },
    ]),
  ) as Record<CharacterState, AnimationDefinition>;
}
