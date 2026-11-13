import { createAnimationSet } from './sharedAnimations';
import type { CharacterConfig } from '../types';

export const liYunfeng: CharacterConfig = {
  id: 'li-yunfeng',
  displayName: 'Li Yunfeng',
  epithet: 'The Sword Without a Sect',
  accent: 0xd9b56d,
  movementSpeed: 210,
  maxHealth: 100,
  asset: {
    enabled: true,
    imagePath: '/assets/characters/li-yunfeng/li-yunfeng.png',
    manifestPath: '/assets/characters/li-yunfeng/li-yunfeng.character.json',
    renderScale: 0.31,
    packId: 'li_yunfeng',
  },
  animations: createAnimationSet({
    attack: { durationMs: 520, events: [{ name: 'attack-hit', normalizedTime: 0.42 }] },
    ability: { durationMs: 980, events: [{ name: 'release-swords', normalizedTime: 0.58 }] },
  }),
  activeAbility: {
    kind: 'flying_sword',
    releaseEvent: 'release-swords',
    projectile: {
      count: 4,
      spreadDegrees: [-24, -8, 8, 24],
      speed: 360,
      damage: 9,
      lifetimeMs: 1400,
      collisionRadius: 11,
    },
    seal: {
      maxStacksPerTarget: 5,
      durationMs: 2800,
      recallDamagePerStack: 12,
      expireDamagePerStack: 7,
      detonationRadius: 78,
    },
  },
  basicAttack: {
    kind: 'melee', releaseEvent: 'attack-hit', damage: 14, range: 62, radius: 28,
    vfx: { slashEffect: 'sectless_slash', impactEffect: 'flying_sword_impact', slashScale: 0.55, impactScale: 0.3 },
  },
};
