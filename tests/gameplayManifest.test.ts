import { describe, expect, it } from 'vitest';
import { gameplayManifest } from '../src/assets/gameplayManifest';
import { DIRECTIONS_8 } from '../src/characters/directions';

describe('gameplay asset manifest', () => {
  it('declares authentic eight-direction artwork for every hero animation', () => {
    expect(gameplayManifest.frameWidth).toBe(384);
    expect(gameplayManifest.frameHeight).toBe(384);
    for (const actions of Object.values(gameplayManifest.heroes)) {
      for (const action of Object.values(actions)) {
        expect(Object.keys(action.directions)).toEqual([...DIRECTIONS_8]);
        for (const direction of DIRECTIONS_8) {
          expect(action.directions[direction].authenticDirectionalArtwork).toBe(true);
          expect(action.directions[direction].frameCount).toBe(action.frames);
          expect(action.directions[direction].shadowAnchors).toHaveLength(action.frames);
        }
      }
    }
  });

  it('keeps all three abilities in standalone effect sheets', () => {
    expect(Object.keys(gameplayManifest.effects)).toEqual(expect.arrayContaining([
      'flying_sword', 'flying_sword_trail', 'flying_sword_summon', 'flying_sword_impact',
      'foxfire_projectile', 'foxfire_summon', 'foxfire_impact',
      'sectless_slash',
      'seo_void_shear', 'seo_void_shear_impact', 'seo_nightfold_trail', 'seo_nightfold_fold',
      'seo_heartbreak_hit', 'rei_fire_fox_summon', 'rei_foxfire_bolt', 'rei_moonfox_hit',
    ]));
  });

  it('declares real eight-direction idle, move, and attack art for Rei fire-spirit fox', () => {
    const fox = gameplayManifest.familiars.rei_fire_fox;
    for (const state of ['idle', 'move', 'attack'] as const) {
      expect(Object.keys(fox.states[state].directions)).toEqual([...DIRECTIONS_8]);
      for (const direction of DIRECTIONS_8) expect(fox.states[state].directions[direction].authenticDirectionalArtwork).toBe(true);
    }
  });
});
