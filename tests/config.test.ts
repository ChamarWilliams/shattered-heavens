import { describe, expect, it } from 'vitest';
import { characters } from '../src/characters/registry';
import { CHARACTER_STATES } from '../src/characters/types';

describe('character configuration contract', () => {
  it('provides every required state for every registered character', () => {
    expect(characters.map((character) => character.id)).toEqual(['li-yunfeng', 'seo-jiwon', 'tsukishiro-rei']);
    for (const character of characters) {
      for (const state of CHARACTER_STATES) {
        expect(character.animations[state].frames.length).toBeGreaterThan(0);
        expect(character.animations[state].durationMs).toBeGreaterThan(0);
      }
    }
  });

  it('registers validated PNG and metadata paths', () => {
    expect(characters.every((character) => character.asset.enabled)).toBe(true);
    expect(characters.every((character) => character.asset.imagePath.endsWith('.png'))).toBe(true);
    expect(characters.every((character) => character.asset.manifestPath.endsWith('.character.json'))).toBe(true);
  });
});
