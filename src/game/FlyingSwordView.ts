import Phaser from 'phaser';
import type { FlyingSwordSnapshot, ProjectileHit } from '../domain/FlyingSwordSystem';
import { effectAnimationKey, effectTextureKey } from '../assets/gameplayManifest';

interface ProjectileVfxOptions {
  projectileEffect: string;
  trailEffect: string;
  impactEffect: string;
  summonEffect?: string;
  projectileScale?: number;
  trailScale?: number;
  impactScale?: number;
  summonScale?: number;
  artAngleOffset?: number;
  trailAlpha?: number;
  trailBehindDistance?: number;
  trailIntervalMs?: number;
  rotateRadialEffects?: boolean;
}

export class FlyingSwordView {
  private readonly sprites = new Map<string, Phaser.GameObjects.Sprite>();
  private readonly trailElapsed = new Map<string, number>();

  constructor(private readonly scene: Phaser.Scene, private readonly options: ProjectileVfxOptions) {}

  sync(snapshots: readonly FlyingSwordSnapshot[], deltaMs: number): void {
    const activeIds = new Set(snapshots.map((snapshot) => snapshot.id));
    for (const snapshot of snapshots) {
      let sprite = this.sprites.get(snapshot.id);
      if (!sprite) {
        sprite = this.scene.add.sprite(snapshot.x, snapshot.y, effectTextureKey(this.options.projectileEffect), 0)
          .setOrigin(0.5)
          .setScale(this.options.projectileScale ?? 1)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setDepth(12);
        sprite.play(effectAnimationKey(this.options.projectileEffect));
        this.sprites.set(snapshot.id, sprite);
        this.trailElapsed.set(snapshot.id, 0);
      }
      sprite.setPosition(snapshot.x, snapshot.y).setRotation(snapshot.angleRadians + (this.options.artAngleOffset ?? 0));
      const elapsed = (this.trailElapsed.get(snapshot.id) ?? 0) + deltaMs;
      if (elapsed >= (this.options.trailIntervalMs ?? 55)) {
        this.spawnTrail(sprite);
        this.trailElapsed.set(snapshot.id, 0);
      } else {
        this.trailElapsed.set(snapshot.id, elapsed);
      }
    }

    for (const [id, sprite] of this.sprites) {
      if (activeIds.has(id)) continue;
      sprite.destroy();
      this.sprites.delete(id);
      this.trailElapsed.delete(id);
    }
  }

  impact(hit: ProjectileHit): void {
    const effect = this.scene.add.sprite(hit.x, hit.y, effectTextureKey(this.options.impactEffect), 0)
      .setOrigin(0.5)
      .setScale(this.options.impactScale ?? 1)
      .setRotation(this.options.rotateRadialEffects ? hit.angleRadians : 0)
      .setAlpha(0.92)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(13);
    effect.play(effectAnimationKey(this.options.impactEffect));
    const baseScale = this.options.impactScale ?? 1;
    this.scene.tweens.add({
      targets: effect,
      scale: baseScale * 1.15,
      duration: 360,
      ease: 'Cubic.Out',
    });
    effect.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => effect.destroy());
    this.scene.time.delayedCall(500, () => { if (effect.active) effect.destroy(); });
  }

  clear(): void {
    for (const sprite of this.sprites.values()) sprite.destroy();
    this.sprites.clear();
    this.trailElapsed.clear();
  }

  summon(x: number, y: number, angleRadians: number): void {
    if (!this.options.summonEffect) return;
    const effect = this.scene.add.sprite(x, y, effectTextureKey(this.options.summonEffect), 0)
      .setOrigin(0.5)
      .setRotation(this.options.rotateRadialEffects ? angleRadians : 0)
      .setScale(this.options.summonScale ?? 1)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(13)
      .play(effectAnimationKey(this.options.summonEffect));
    effect.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => effect.destroy());
  }

  private spawnTrail(source: Phaser.GameObjects.Sprite): void {
    const angle = source.rotation - (this.options.artAngleOffset ?? 0);
    const behind = this.options.trailBehindDistance ?? 18;
    const trail = this.scene.add.sprite(
      source.x - Math.cos(angle) * behind,
      source.y - Math.sin(angle) * behind,
      effectTextureKey(this.options.trailEffect),
      0,
    )
      .setOrigin(0.5)
      .setRotation(source.rotation)
      .setScale(this.options.trailScale ?? 1)
      .setAlpha(this.options.trailAlpha ?? 0.5)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(11);
    trail.play(effectAnimationKey(this.options.trailEffect));
    this.scene.tweens.add({
      targets: trail,
      scale: (this.options.trailScale ?? 1) * 0.82,
      alpha: 0,
      duration: 240,
      onComplete: () => trail.destroy(),
    });
  }
}
