import { createAnimationSet } from './sharedAnimations';
import type { CharacterConfig } from '../types';

export const tsukishiroRei: CharacterConfig = {
  id: 'tsukishiro-rei',
  displayName: 'Tsukishiro Rei',
  epithet: 'Keeper of the Moonlit Menagerie',
  accent: 0x9ba7d8,
  movementSpeed: 200,
  maxHealth: 110,
  passive: {
    kind: 'moonfire_halo',
    maxStacks: 3,
    stackDurationMs: 8000,
    movementSpeedPctPerStack: 0.04,
    basicDamagePerStack: 1,
    summonDurationPerStackMs: 700,
    summonAttackSpeedPctPerStack: 0.12,
  },
  asset: {
    enabled: true,
    imagePath: '/assets/characters/tsukishiro-rei/tsukishiro-rei.png',
    manifestPath: '/assets/characters/tsukishiro-rei/tsukishiro-rei.character.json',
    renderScale: 0.33,
    packId: 'tsukishiro_rei',
  },
  animations: createAnimationSet({
    move: { durationMs: 680 },
    attack: { durationMs: 620, events: [{ name: 'attack-projectile', normalizedTime: 0.46 }] },
    ability: { durationMs: 1120, events: [{ name: 'release-foxfire', normalizedTime: 0.52 }] },
  }),
  basicAttack: { kind: 'projectile', releaseEvent: 'attack-projectile', damage: 9, range: 520, radius: 9, projectileSpeed: 300 },
  activeAbility: {
    kind: 'foxfire_summon',
    releaseEvent: 'release-foxfire',
    projectile: { count: 1, spreadDegrees: [0], speed: 280, damage: 7, lifetimeMs: 1800, collisionRadius: 10 },
    slowPct: 0.25,
    slowMs: 1800,
    familiar: {
      count: 1,
      durationMs: 7200,
      orbitRadius: 64,
      orbitSpeedRadiansPerSecond: 1.45,
      attackIntervalMs: 760,
      acquisitionRange: 360,
    },
  },
};
