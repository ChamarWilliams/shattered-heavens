/** Types and constants shared by the dungeon run scene and its helpers. */
import Phaser from 'phaser';
import { type PackHeroId } from '../../assets/gameplayManifest';
import { type UnlockableHeroId } from '../../domain/heroUnlocks';
import { type ItemId } from '../../domain/runItems';
import { type EliteAffix } from '../../domain/elites';
import { type DungeonThemeId } from '../../dungeon';
import type { MusicId, SfxId } from '../audioManifest';

export type RunHeroId = 'li-yunfeng' | 'seo-jiwon' | 'tsukishiro-rei';
export type EnemyRole = 'hunter' | 'shooter' | 'sentinel' | 'protector' | 'boss';
export type EnemyProjectileStyle = 'hunter' | 'heavy' | 'sentinel' | 'boss';
export type ActionType = 'attack' | 'ability';

export interface PendingAction {
  type: ActionType;
  eventName: string;
  castId: string;
  aimRadians: number;
  released: boolean;
}

export interface EnemyActor {
  readonly id: number;
  /** Co-op: whoever this enemy is attacking (a hero on this screen, local or remote). */
  coopTarget?: { readonly x: number; readonly y: number };
  readonly sprite: Phaser.GameObjects.Sprite;
  readonly shadow: Phaser.GameObjects.Ellipse;
  readonly healthBar: Phaser.GameObjects.Graphics;
  readonly role: EnemyRole;
  /** Sheet column: hunter 0, shooter 1, sentinel 2, boss 3. */
  readonly column: number;
  /** Distance from the gameplay position down to the sprite's feet. */
  footOffset: number;
  /** Distance from the gameplay position up to the top of the sprite's head. */
  headOffset: number;
  maxHealth: number;
  networkId?: string;
  health: number;
  speed: number;
  radius: number;
  attackMs: number;
  specialMs: number;
  phase: number;
  slowRemainingMs: number;
  /** Keeps the walk cycle running briefly after a stop so it does not flicker. */
  moveLingerMs: number;
  /** Time left before a side-facing enemy may turn around again. */
  facingHoldMs: number;
  lastNetworkAttackPhase?: string;
  /** Bosses: the second form has begun. */
  phaseTwo?: boolean;
  /** Time left immune to damage (a boss changing form). */
  shieldMs: number;
  /** Ember infusion: time left burning, and time to the next tick. */
  burnMs: number;
  burnTickMs: number;
  burnDamage?: number;
  /** Elite echoes carry one affix (see domain/elites.ts). */
  elite?: EliteAffix;
  /** Warded elites: barrier left, and its size. */
  ward?: number;
  wardMax?: number;
  /** Scorching elites: time until the next flame patch. */
  scorchMs?: number;
  /** The tutorial's training dummy: struck like an enemy, but harmless, unkillable and never keeps doors shut. */
  dummy?: boolean;
}

/** Wardens and Protectors: big bodies with a bar at the top of the screen. */
export const isBig = (enemy: Pick<EnemyActor, 'role'>): boolean => enemy.role === 'boss' || enemy.role === 'protector';

export interface CombatProjectile {
  readonly view: Phaser.GameObjects.Image;
  readonly velocity: Phaser.Math.Vector2;
  readonly hostile: boolean;
  readonly damage: number;
  readonly radius: number;
  readonly theme: DungeonThemeId;
  readonly style: EnemyProjectileStyle;
  previousX: number;
  previousY: number;
  lifeMs: number;
  trailMs: number;
}

export const LOGICAL_WIDTH = 960;
export const LOGICAL_HEIGHT = 540;
// Rooms are a 19x13 tile grid centred on the logical screen. Solo runs scale the
// whole room up (ROOM_SCALE_SOLO) so there is more floor to dodge across, and the
// camera zooms out to fit; co-op keeps the server's 1:1 room.
export const ROOM_CENTER = { x: 480, y: 270 } as const;
export const BASE_TILE = 32;
export const ROOM_SCALE_SOLO = 1.3;
// The warden's echo opens just below the room centre at any room scale.
export const PORTAL_POINT = { x: 480, y: 285 } as const;
export const ENEMY_PROJECTILE_STYLES: readonly EnemyProjectileStyle[] = ['hunter', 'heavy', 'sentinel', 'boss'];
export const BOSS_PORTAL_EFFECTS: Readonly<Record<DungeonThemeId, Readonly<{
  opening: string;
  arrival: string;
}>>> = {
  'sectless-temple': { opening: 'flying_sword_summon', arrival: 'flying_sword_impact' },
  'nightfold-crypt': { opening: 'seo_nightfold_fold', arrival: 'seo_void_shear_impact' },
  'foxfire-shrine': { opening: 'foxfire_summon', arrival: 'rei_moonfox_hit' },
};
export const roomMaskCode = (mask: number): string => mask.toString().padStart(2, '0');
export const roomTextureKey = (themeId: DungeonThemeId, mask: number): string => `run-room:${themeId}:${roomMaskCode(mask)}`;
export const roomAssetUrl = (themeId: DungeonThemeId, mask: number): string => `/assets/dungeons/${themeId}/rooms-v5/room-mask-${roomMaskCode(mask)}-v5.webp`;
export const HERO_ASSETS: Readonly<Record<RunHeroId, PackHeroId>> = {
  'li-yunfeng': 'li_yunfeng',
  'seo-jiwon': 'seo_jiwon',
  'tsukishiro-rei': 'tsukishiro_rei',
};

export const enemyAnimationKey = (theme: DungeonThemeId, column: number, state: 'idle' | 'move' | 'attack'): string => `enemy:${theme}:${column}:${state}`;
export const ABILITY_COOLDOWN_MS = 5200;
export const ABILITY_NAMES: Readonly<Record<RunHeroId, string>> = {
  'li-yunfeng': 'Fourfold Flying Sword',
  'seo-jiwon': 'Nightfold Passage',
  'tsukishiro-rei': 'Foxfire Covenant',
};
export const portraitKey = (heroId: string): string => `hero-portrait:${heroId}`;
export const toRoman = (value: number): string => {
  const numerals: [number, string][] = [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let rest = Math.max(1, value); let out = '';
  for (const [amount, numeral] of numerals) while (rest >= amount) { out += numeral; rest -= amount; }
  return out;
};
// Each realm's own hero may be waiting inside it for anyone who is not playing them.
export const REALM_HEROES: Readonly<Record<DungeonThemeId, RunHeroId>> = {
  'sectless-temple': 'li-yunfeng',
  'nightfold-crypt': 'seo-jiwon',
  'foxfire-shrine': 'tsukishiro-rei',
};
export const REALM_ALLY_CHANCE = 0.6;
export const HERO_ARTS: Readonly<Record<RunHeroId, ItemId>> = { 'li-yunfeng': 'art-sectless', 'seo-jiwon': 'art-nightfold', 'tsukishiro-rei': 'art-moonfox' };
export const BLESSINGS: Readonly<Record<RunHeroId, Readonly<{ name: string; line: string }>>> = {
  'li-yunfeng': { name: 'Sectless Resolve', line: 'Take my resolve. Your strikes will land 25% harder.' },
  'seo-jiwon': { name: 'Nightfold Veil', line: 'Walk in my shadow. You will move 15% faster.' },
  'tsukishiro-rei': { name: 'Moonfox Ward', line: 'The moonfox guards you now. One more heart.' },
};
export const HERO_UNLOCK_NAMES: Readonly<Record<UnlockableHeroId, string>> = { 'li-yunfeng': 'LI YUNFENG', 'seo-jiwon': 'SEO JIWON', 'tsukishiro-rei': 'TSUKISHIRO REI' };
// Portal sheets from tools/generate_portal_sprites.py: drawn at 2x, shown at 0.5,
// with the rift centred on (80, 104) and its floor glow under the hero's feet.
export const PORTAL_FRAME = { width: 160, height: 224, openFrames: 10, idleFrames: 8, originX: 80, originY: 108 } as const;
export const ENEMY_COLUMNS: Readonly<Record<EnemyRole, number>> = { hunter: 0, shooter: 1, sentinel: 2, protector: 1, boss: 3 };
// Heroes, familiars and enemies share the 10 + y/1000 draw band the ability views
// (sword rack, moonfire wisps, foxfire familiars) are layered against, sorted by
// where each one stands. Enemy feet are converted to the hero's origin, which
// sits this far above the hero's feet.
export const HERO_FOOT_OFFSET = 36;
export const HERO_SOUNDS: Readonly<Record<RunHeroId, Readonly<{ attack: SfxId; ability: SfxId }>>> = {
  'li-yunfeng': { attack: 'li-attack', ability: 'li-ability' },
  'seo-jiwon': { attack: 'seo-attack', ability: 'seo-ability' },
  'tsukishiro-rei': { attack: 'rei-attack', ability: 'rei-ability' },
};
export const REALM_MUSIC: Readonly<Record<DungeonThemeId, MusicId>> = {
  'sectless-temple': 'realm-sectless', 'nightfold-crypt': 'realm-nightfold', 'foxfire-shrine': 'realm-foxfire',
};
export const actorDepth = (originY: number): number => 10 + originY / 1000;

