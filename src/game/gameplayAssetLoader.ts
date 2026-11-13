import Phaser from 'phaser';
import { DIRECTIONS_8 } from '../characters/directions';
import {
  effectAnimationKey,
  effectTextureKey,
  familiarTextureKey,
  GAMEPLAY_ASSET_ROOT,
  gameplayManifest,
  heroTextureKey,
  type PackAction,
  type PackHeroId,
  type FamiliarState,
  type PackFamiliarId,
} from '../assets/gameplayManifest';

export function preloadGameplayAssets(scene: Phaser.Scene): void {
  for (const [heroId, animations] of Object.entries(gameplayManifest.heroes) as [PackHeroId, typeof gameplayManifest.heroes[PackHeroId]][]) {
    for (const [action, metadata] of Object.entries(animations) as [PackAction, typeof animations[PackAction]][]) {
      for (const direction of DIRECTIONS_8) {
        const definition = metadata.directions[direction];
        scene.load.spritesheet(heroTextureKey(heroId, action, direction), `${GAMEPLAY_ASSET_ROOT}${definition.file}`, {
          frameWidth: gameplayManifest.frameWidth,
          frameHeight: gameplayManifest.frameHeight,
        });
      }
    }
  }
  for (const [effectId, definition] of Object.entries(gameplayManifest.effects)) {
    scene.load.spritesheet(effectTextureKey(effectId), `${GAMEPLAY_ASSET_ROOT}${definition.path}`, {
      frameWidth: definition.width,
      frameHeight: definition.height,
    });
  }
  for (const [familiarId, familiar] of Object.entries(gameplayManifest.familiars) as [PackFamiliarId, typeof gameplayManifest.familiars[PackFamiliarId]][]) {
    for (const [state, metadata] of Object.entries(familiar.states) as [FamiliarState, typeof familiar.states[FamiliarState]][]) {
      for (const direction of DIRECTIONS_8) {
        scene.load.spritesheet(familiarTextureKey(familiarId, state, direction), `${GAMEPLAY_ASSET_ROOT}${metadata.directions[direction].file}`, {
          frameWidth: familiar.frameWidth,
          frameHeight: familiar.frameHeight,
        });
      }
    }
  }
}

export function installEffectAnimations(scene: Phaser.Scene): void {
  for (const [effectId, definition] of Object.entries(gameplayManifest.effects)) {
    const animationKey = effectAnimationKey(effectId);
    if (scene.anims.exists(animationKey)) continue;
    const textureKey = effectTextureKey(effectId);
    scene.anims.create({
      key: animationKey,
      frames: scene.anims.generateFrameNumbers(textureKey, { start: 0, end: definition.frames - 1 }),
      frameRate: definition.fps,
      repeat: definition.loop ? -1 : 0,
    });
  }
}
