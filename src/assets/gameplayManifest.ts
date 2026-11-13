import manifestData from './gameplay-manifest.json';
import type { Direction8 } from '../characters/directions';
import type { CharacterState } from '../characters/types';

export type PackHeroId = 'li_yunfeng' | 'seo_jiwon' | 'tsukishiro_rei';
export type PackAction = 'idle' | 'move' | 'basic_attack' | 'active_ability' | 'hurt' | 'death';
export type PackFamiliarId = 'rei_fire_fox';
export type FamiliarState = 'idle' | 'move' | 'attack';

export interface DirectionAssetDefinition {
  readonly file: string;
  readonly frameCount: number;
  readonly authenticDirectionalArtwork: boolean;
  readonly source: string;
  readonly reviewRequired: boolean;
  readonly shadowAnchors: readonly {
    readonly x: number;
    readonly y: number;
    readonly width: number;
  }[];
}

export interface EffectDefinition {
  readonly path: string;
  readonly width: number;
  readonly height: number;
  readonly frames: number;
  readonly fps: number;
  readonly loop: boolean;
}

export interface FamiliarDirectionDefinition {
  readonly file: string;
  readonly authenticDirectionalArtwork: boolean;
}

interface GameplayManifest {
  readonly version: string;
  readonly status: string;
  readonly frameWidth: number;
  readonly frameHeight: number;
  readonly directions: readonly Direction8[];
  readonly heroes: Record<PackHeroId, Record<PackAction, {
    readonly frames: number;
    readonly directions: Record<Direction8, DirectionAssetDefinition>;
  }>>;
  readonly effects: Record<string, EffectDefinition>;
  readonly familiars: Record<PackFamiliarId, {
    readonly frameWidth: number;
    readonly frameHeight: number;
    readonly states: Record<FamiliarState, {
      readonly frames: number;
      readonly fps: number;
      readonly loop: boolean;
      readonly directions: Record<Direction8, FamiliarDirectionDefinition>;
    }>;
  }>;
}

export const gameplayManifest = manifestData as unknown as GameplayManifest;
export const GAMEPLAY_ASSET_ROOT = '/assets/gameplay-kit/';

export function packActionForState(state: CharacterState): PackAction {
  if (state === 'attack') return 'basic_attack';
  if (state === 'ability') return 'active_ability';
  return state;
}

export function heroTextureKey(hero: PackHeroId, action: PackAction, direction: Direction8): string {
  return `hero:${hero}:${action}:${direction}`;
}

export function heroFrameCount(hero: PackHeroId, state: CharacterState): number {
  return gameplayManifest.heroes[hero][packActionForState(state)].frames;
}

export function effectTextureKey(effect: string): string { return `fx:${effect}`; }
export function effectAnimationKey(effect: string): string { return `fx-animation:${effect}`; }
export function familiarTextureKey(familiar: PackFamiliarId, state: FamiliarState, direction: Direction8): string {
  return `familiar:${familiar}:${state}:${direction}`;
}
