import Phaser from 'phaser';
import type { CharacterAssetManifest, CharacterConfig } from '../characters/types';
import { validateManifest } from '../characters/validateManifest';

interface FramePivot { x: number; y: number; width: number; height: number }
const framePivots = new Map<string, FramePivot>();

export function getFramePivot(textureKey: string, frameName: string): FramePivot | undefined {
  return framePivots.get(`${textureKey}:${frameName}`);
}

export function preloadCharacter(scene: Phaser.Scene, config: CharacterConfig): void {
  if (!config.asset.enabled) return;
  scene.load.image(`${config.id}-sheet`, config.asset.imagePath);
  scene.load.json(`${config.id}-manifest`, config.asset.manifestPath);
}

export function installCharacterTexture(scene: Phaser.Scene, config: CharacterConfig): boolean {
  if (!config.asset.enabled) return false;
  const manifest = scene.cache.json.get(`${config.id}-manifest`) as CharacterAssetManifest | undefined;
  const texture = scene.textures.get(`${config.id}-sheet`);
  if (!manifest || texture.key === '__MISSING') return false;
  const errors = validateManifest(config, manifest);
  if (errors.length > 0) {
    console.error(`Rejected ${config.id} animation manifest`, errors);
    return false;
  }
  for (const frame of manifest.frames) {
    if (!texture.has(frame.name)) texture.add(frame.name, 0, frame.x, frame.y, frame.width, frame.height);
    framePivots.set(`${config.id}-sheet:${frame.name}`, {
      x: frame.pivotX, y: frame.pivotY, width: frame.width, height: frame.height,
    });
  }
  return true;
}
