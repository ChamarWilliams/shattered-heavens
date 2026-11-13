import { createAnimationSet } from './sharedAnimations';
import type { CharacterConfig } from '../types';

export const seoJiwon: CharacterConfig = {
  id: 'seo-jiwon',
  displayName: 'Seo Jiwon',
  epithet: 'The Blade Between Heartbeats',
  accent: 0x78b9a8,
  movementSpeed: 225,
  maxHealth: 90,
  asset: {
    enabled: true,
    imagePath: '/assets/characters/seo-jiwon/seo-jiwon.png',
    manifestPath: '/assets/characters/seo-jiwon/seo-jiwon.character.json',
    renderScale: 0.33,
    packId: 'seo_jiwon',
  },
  animations: createAnimationSet({
    move: { durationMs: 640 },
    attack: { durationMs: 440, events: [{ name: 'attack-hit', normalizedTime: 0.36 }] },
    ability: { durationMs: 720, events: [{ name: 'release-dash', normalizedTime: 0.28 }] },
  }),
  basicAttack: {
    kind: 'melee', releaseEvent: 'attack-hit', damage: 16, range: 54, radius: 25,
    vfx: { slashEffect: 'seo_void_shear', impactEffect: 'seo_heartbreak_hit', slashScale: 0.62, impactScale: 0.62 },
  },
  activeAbility: {
    kind: 'shadow_dash',
    releaseEvent: 'release-dash',
    distance: 160,
    durationMs: 220,
    damage: 14,
    collisionRadius: 24,
    vfx: {
      trailEffect: 'seo_nightfold_trail',
      foldEffect: 'seo_nightfold_fold',
      hitEffect: 'seo_heartbreak_hit',
      echoImpactEffect: 'seo_heartbreak_hit',
      trailScale: 0.58,
      foldScale: 0.66,
      trailIntervalMs: 54,
    },
    echo: {
      delayMs: 430,
      durationMs: 260,
      damage: 28,
      collisionRadius: 30,
    },
  },
};
