import type { Direction8 } from './directions';
import type { CharacterState } from './types';

export function facingForRenderedState(
  state: CharacterState,
  movementDirection: Direction8,
  facingDirection: Direction8,
): Direction8 {
  return state === 'idle' || state === 'move' ? movementDirection : facingDirection;
}
