import { describe, expect, it } from 'vitest';
import { facingForRenderedState } from '../src/characters/renderFacing';

describe('movement-driven hero facing', () => {
  it.each(['idle', 'move'] as const)('uses movement direction while %s', (state) => {
    expect(facingForRenderedState(state, 'W', 'E')).toBe('W');
  });

  it.each(['attack', 'ability', 'hurt', 'death'] as const)('keeps action facing while %s', (state) => {
    expect(facingForRenderedState(state, 'W', 'E')).toBe('E');
  });
});
