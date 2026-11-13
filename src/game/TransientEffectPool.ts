import Phaser from 'phaser';
import { effectAnimationKey, effectTextureKey } from '../assets/gameplayManifest';

export interface TransientEffectOptions {
  readonly effectId: string;
  readonly x: number;
  readonly y: number;
  readonly rotation?: number;
  readonly scale?: number;
  readonly alpha?: number;
  readonly depth?: number;
  readonly fadeDurationMs?: number;
  readonly blendMode?: Phaser.BlendModes;
}

export class TransientEffectPool {
  private readonly available = new Map<string, Phaser.GameObjects.Sprite[]>();
  private readonly active = new Set<Phaser.GameObjects.Sprite>();

  constructor(private readonly scene: Phaser.Scene, private readonly maxRetainedPerEffect = 12) {}

  spawn(options: TransientEffectOptions): Phaser.GameObjects.Sprite {
    const bucket = this.available.get(options.effectId) ?? [];
    this.available.set(options.effectId, bucket);
    const sprite = bucket.pop() ?? this.scene.add.sprite(0, 0, effectTextureKey(options.effectId), 0);
    this.scene.tweens.killTweensOf(sprite);
    sprite.removeAllListeners(Phaser.Animations.Events.ANIMATION_COMPLETE);
    sprite
      .setActive(true)
      .setVisible(true)
      .setTexture(effectTextureKey(options.effectId), 0)
      .setPosition(options.x, options.y)
      .setRotation(options.rotation ?? 0)
      .setScale(options.scale ?? 1)
      .setAlpha(options.alpha ?? 1)
      .setDepth(options.depth ?? 30 + options.y / 1000)
      .setBlendMode(options.blendMode ?? Phaser.BlendModes.ADD)
      .play(effectAnimationKey(options.effectId), true);
    this.active.add(sprite);
    if (options.fadeDurationMs) {
      this.scene.tweens.add({
        targets: sprite,
        alpha: 0,
        duration: options.fadeDurationMs,
        onComplete: () => this.release(options.effectId, sprite),
      });
    } else {
      sprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => this.release(options.effectId, sprite));
    }
    return sprite;
  }

  clear(): void {
    for (const sprite of this.active) sprite.destroy();
    for (const bucket of this.available.values()) for (const sprite of bucket) sprite.destroy();
    this.active.clear();
    this.available.clear();
  }

  private release(effectId: string, sprite: Phaser.GameObjects.Sprite): void {
    if (!sprite.active || !this.active.delete(sprite)) return;
    sprite.stop().setActive(false).setVisible(false);
    const bucket = this.available.get(effectId) ?? [];
    this.available.set(effectId, bucket);
    if (bucket.length < this.maxRetainedPerEffect) bucket.push(sprite);
    else sprite.destroy();
  }
}
