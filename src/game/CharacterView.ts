import Phaser from 'phaser';
import { gameplayManifest, heroTextureKey, packActionForState, type PackHeroId } from '../assets/gameplayManifest';
import type { Direction8 } from '../characters/directions';
import type { CharacterConfig, CharacterState } from '../characters/types';
import { getFramePivot } from './installCharacterTextures';

export class CharacterView extends Phaser.GameObjects.Container {
  private readonly shadow: Phaser.GameObjects.Ellipse;
  private readonly bodyArt: Phaser.GameObjects.Graphics;
  private readonly sword: Phaser.GameObjects.Rectangle;
  private readonly frameLabel: Phaser.GameObjects.Text;
  private readonly sprite?: Phaser.GameObjects.Sprite;
  private readonly textureKey: string;
  private readonly packId?: PackHeroId;
  private readonly renderScale: number;

  constructor(
    scene: Phaser.Scene,
    config: CharacterConfig,
    x: number,
    y: number,
    _mode: 'gameplay' | 'inspection' = 'gameplay',
  ) {
    super(scene, x, y);
    this.textureKey = `${config.id}-sheet`;
    this.packId = config.asset.packId as PackHeroId | undefined;
    this.renderScale = config.asset.renderScale ?? 1;
    this.shadow = scene.add.ellipse(0, 23, 44, 14, 0x000000, 0.35);
    this.bodyArt = scene.add.graphics();
    this.sword = scene.add.rectangle(19, 0, 4, 38, 0xe6d3a5).setOrigin(0.5, 0.8).setRotation(0.28);
    this.frameLabel = scene.add.text(0, -48, '01', {
      fontFamily: 'monospace', fontSize: '9px', color: '#e9d7a8', backgroundColor: '#11150f', padding: { x: 3, y: 2 },
    }).setOrigin(0.5);
    const packIdleKey = this.packId ? heroTextureKey(this.packId, 'idle', 'S') : '';
    if (packIdleKey && scene.textures.exists(packIdleKey)) {
      this.sprite = scene.add.sprite(0, 28, packIdleKey, 0).setOrigin(0.5, 0.75).setScale(this.renderScale);
      this.add([this.shadow, this.sprite]);
      this.bodyArt.setVisible(false);
      this.sword.setVisible(false);
      this.frameLabel.setVisible(false);
    } else if (config.asset.enabled && scene.textures.exists(this.textureKey) && scene.textures.get(this.textureKey).has('idle-01')) {
      this.sprite = scene.add.sprite(0, 28, this.textureKey, 'idle-01').setOrigin(0.5, 1).setScale(this.renderScale);
      this.add([this.shadow, this.sprite]);
      this.bodyArt.setVisible(false);
      this.sword.setVisible(false);
      this.frameLabel.setVisible(false);
    } else {
      this.add([this.shadow, this.bodyArt, this.sword, this.frameLabel]);
    }
    this.drawBody(config.accent);
    scene.add.existing(this);
  }

  render(state: CharacterState, facing: Direction8, progress: number, frameIndex: number): void {
    this.frameLabel.setText(String(frameIndex + 1).padStart(2, '0'));
    const frameName = `${state}-${String(frameIndex + 1).padStart(2, '0')}`;
    if (this.sprite && this.packId) {
      const renderedState = state;
      const renderedAction = packActionForState(renderedState);
      const textureKey = heroTextureKey(this.packId, renderedAction, facing);
      if (this.scene.textures.exists(textureKey)) {
        const texture = this.scene.textures.get(textureKey);
        const availableFrames = Math.max(1, texture.frameTotal - 1);
        const renderedFrame = frameIndex % availableFrames;
        this.sprite.setTexture(textureKey, renderedFrame).setOrigin(0.5, 0.75).setScale(this.renderScale);
        const definition = gameplayManifest.heroes[this.packId][renderedAction].directions[facing];
        const mirroredFallback = !definition.authenticDirectionalArtwork && (facing === 'SW' || facing === 'W' || facing === 'NW');
        this.sprite.setFlipX(mirroredFallback).setPosition(0, 28);
        const anchor = definition.shadowAnchors[renderedFrame];
        if (anchor) {
          const shadowWidth = Phaser.Math.Clamp(anchor.width * this.renderScale * (state === 'death' ? 0.7 : 0.48), 28, state === 'death' ? 72 : 50);
          this.shadow
            .setPosition(anchor.x * this.renderScale, 26 + anchor.y * this.renderScale)
            .setDisplaySize(shadowWidth, state === 'death' ? 11 : 14)
            .setAlpha(state === 'death' ? 0.28 : 0.35);
        }
      }
    } else {
      this.sprite?.setFrame(frameName);
      const pivot = getFramePivot(this.textureKey, frameName);
      if (this.sprite && pivot) this.sprite.setOrigin(pivot.x / pivot.width, pivot.y / pivot.height);
    }
    const fallbackFlip = !this.packId && (facing === 'W' || facing === 'SW' || facing === 'NW');
    this.setScale(fallbackFlip ? -1 : 1, 1);
    this.frameLabel.setScale(fallbackFlip ? -1 : 1, 1);
    this.setAlpha(state === 'hurt' && Math.floor(progress * 8) % 2 === 0 ? 0.35 : 1);
    this.setAngle(!this.sprite && state === 'death' ? Math.min(90, progress * 100) : 0);
    const offset = this.offsetForState(state, progress);
    this.bodyArt.y = offset;
    this.sword.y = offset;
    this.frameLabel.y = -48 + offset;
    this.sword.setVisible(!this.sprite && (state === 'attack' || state === 'ability' || state === 'idle'));
    this.sword.setRotation(state === 'attack' ? -1.9 + progress * 3.2 : state === 'ability' ? progress * Math.PI * 4 : 0.28);
  }

  private offsetForState(state: CharacterState, progress: number): number {
    if (state === 'idle') return Math.sin(progress * Math.PI * 2) * 0.25;
    if (state === 'move') return Math.sin(progress * Math.PI * 8) * 0.65;
    if (state === 'ability') return -Math.sin(progress * Math.PI) * 0.8;
    return 0;
  }

  private drawBody(accent: number): void {
    this.bodyArt.clear();
    this.bodyArt.fillStyle(0x111713).fillCircle(0, -22, 10);
    this.bodyArt.fillStyle(accent).fillTriangle(-14, -12, 14, -12, 10, 22);
    this.bodyArt.fillStyle(0x222a24).fillTriangle(-14, -12, -10, 22, 10, 22);
    this.bodyArt.lineStyle(2, 0xe5d2a1, 0.6).strokeTriangle(-14, -12, 14, -12, 10, 22);
  }
}
