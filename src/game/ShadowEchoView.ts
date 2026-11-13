import Phaser from 'phaser';
import { effectAnimationKey, effectTextureKey, heroTextureKey } from '../assets/gameplayManifest';
import { direction8FromAngle } from '../characters/directions';
import type { ShadowEchoSnapshot } from '../domain/ShadowEchoSystem';

interface ShadowEchoViewOptions {
  readonly heroPackId: 'seo_jiwon';
  readonly impactEffect: string;
}

export class ShadowEchoView {
  private sprite?: Phaser.GameObjects.Sprite;

  constructor(private readonly scene: Phaser.Scene, private readonly options: ShadowEchoViewOptions) {}

  sync(snapshot: ShadowEchoSnapshot | undefined): void {
    if (!snapshot) {
      this.clear();
      return;
    }
    if (!this.sprite) {
      const direction = direction8FromAngle(snapshot.angleRadians);
      this.sprite = this.scene.add.sprite(snapshot.x, snapshot.y, heroTextureKey(this.options.heroPackId, 'active_ability', direction), 0)
        .setDepth(13)
        .setTint(0xc694ff)
        .setAlpha(0.68)
        .setScale(0.33);
    }
    const direction = direction8FromAngle(snapshot.angleRadians);
    const frame = snapshot.phase === 'waiting' ? 1 : Math.min(6, 4 + Math.floor(snapshot.progress * 3));
    this.sprite.setTexture(heroTextureKey(this.options.heroPackId, 'active_ability', direction), frame);
    const waitingPulse = snapshot.phase === 'waiting' ? 0.58 + Math.sin(this.scene.time.now * 0.02) * 0.08 : 0.86;
    this.sprite
      .setPosition(snapshot.x, snapshot.y)
      .setRotation(0)
      .setAlpha(waitingPulse)
      .setScale(snapshot.phase === 'waiting' ? 0.34 : 0.42);
    if (!snapshot.active) this.clear();
  }

  rupture(x: number, y: number, angleRadians: number, scale = 0.82): void {
    const sprite = this.scene.add.sprite(x, y, effectTextureKey(this.options.impactEffect), 0)
      .setDepth(14)
      .setRotation(angleRadians)
      .setScale(scale)
      .setBlendMode(Phaser.BlendModes.ADD)
      .play(effectAnimationKey(this.options.impactEffect));
    sprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => sprite.destroy());
  }

  clear(): void {
    this.sprite?.destroy();
    this.sprite = undefined;
  }
}
