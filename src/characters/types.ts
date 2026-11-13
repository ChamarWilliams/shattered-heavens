export const CHARACTER_STATES = ['idle', 'move', 'attack', 'ability', 'hurt', 'death'] as const;

export type CharacterState = (typeof CHARACTER_STATES)[number];
export type { Direction8, HeroOrientation } from './directions';

export interface AnimationEventDefinition {
  readonly name: string;
  readonly normalizedTime: number;
}

export interface AnimationDefinition {
  readonly frames: readonly string[];
  readonly durationMs: number;
  readonly loop: boolean;
  readonly interruptible: boolean;
  readonly events?: readonly AnimationEventDefinition[];
}

export interface FrameRectangle {
  readonly name: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly pivotX: number;
  readonly pivotY: number;
}

export interface CharacterAssetManifest {
  readonly image: string;
  readonly alphaRequired: true;
  readonly frames: readonly FrameRectangle[];
  readonly validation: {
    readonly approved: boolean;
    readonly reviewedAt?: string;
    readonly notes: readonly string[];
  };
}

export interface CharacterConfig {
  readonly id: string;
  readonly displayName: string;
  readonly epithet: string;
  readonly accent: number;
  readonly movementSpeed: number;
  readonly maxHealth: number;
  readonly passive?: {
    readonly kind: 'moonfire_halo';
    readonly maxStacks: number;
    readonly stackDurationMs: number;
    readonly movementSpeedPctPerStack: number;
    readonly basicDamagePerStack: number;
    readonly summonDurationPerStackMs: number;
    readonly summonAttackSpeedPctPerStack: number;
  };
  readonly asset: {
    readonly enabled: boolean;
    readonly imagePath: string;
    readonly manifestPath: string;
    readonly renderScale?: number;
    readonly packId?: string;
  };
  readonly basicAttack?: {
    readonly kind: 'melee' | 'projectile';
    readonly releaseEvent: string;
    readonly damage: number;
    readonly range: number;
    readonly radius: number;
    readonly projectileSpeed?: number;
    readonly vfx?: {
      readonly slashEffect: string;
      readonly impactEffect: string;
      readonly slashScale: number;
      readonly impactScale: number;
    };
  };
  readonly activeAbility?:
  | {
    readonly kind: 'flying_sword';
    readonly releaseEvent: string;
    readonly projectile: {
      readonly count: number;
      readonly spreadDegrees: readonly number[];
      readonly speed: number;
      readonly damage: number;
      readonly lifetimeMs: number;
      readonly collisionRadius: number;
    };
    readonly seal: {
      readonly maxStacksPerTarget: number;
      readonly durationMs: number;
      readonly recallDamagePerStack: number;
      readonly expireDamagePerStack: number;
      readonly detonationRadius: number;
    };
  }
  | {
    readonly kind: 'shadow_dash';
    readonly releaseEvent: string;
    readonly distance: number;
    readonly durationMs: number;
    readonly damage: number;
    readonly collisionRadius: number;
    readonly vfx: {
      readonly trailEffect: string;
      readonly foldEffect: string;
      readonly hitEffect: string;
      readonly echoImpactEffect: string;
      readonly trailScale: number;
      readonly foldScale: number;
      readonly trailIntervalMs: number;
    };
    readonly echo: {
      readonly delayMs: number;
      readonly durationMs: number;
      readonly damage: number;
      readonly collisionRadius: number;
    };
  }
  | {
    readonly kind: 'foxfire_summon';
    readonly releaseEvent: string;
    readonly projectile: {
      readonly count: 1;
      readonly spreadDegrees: readonly [0];
      readonly speed: number;
      readonly damage: number;
      readonly lifetimeMs: number;
      readonly collisionRadius: number;
    };
    readonly slowPct: number;
    readonly slowMs: number;
    readonly familiar: {
      readonly count: number;
      readonly durationMs: number;
      readonly orbitRadius: number;
      readonly orbitSpeedRadiansPerSecond: number;
      readonly attackIntervalMs: number;
      readonly acquisitionRange: number;
    };
  };
  readonly animations: Readonly<Record<CharacterState, AnimationDefinition>>;
}
