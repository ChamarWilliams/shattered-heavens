import Phaser from 'phaser';
import { effectAnimationKey, effectTextureKey } from '../assets/gameplayManifest';
import type { MoonfireStackSnapshot } from '../domain/MoonfireStackSystem';

export class MoonfireStackView {
  private readonly wisps: Phaser.GameObjects.Sprite[] = [];

  constructor(private readonly scene: Phaser.Scene) {}

  sync(snapshot: MoonfireStackSnapshot, owner: { readonly x: number; readonly y: number }, timeMs: number): void {
    while (this.wisps.length < snapshot.stacks) {
      const sprite = this.scene.add.sprite(owner.x, owner.y, effectTextureKey('foxfire_projectile'), 0)
        .setScale(0.42)
        .setBlendMode(Phaser.BlendModes.ADD)
        .play(effectAnimationKey('foxfire_projectile'));
      this.wisps.push(sprite);
    }
    while (this.wisps.length > snapshot.stacks) this.wisps.pop()?.destroy();

    const count = this.wisps.length;
    for (let index = 0; index < count; index++) {
      const angle = timeMs * 0.0022 + index * Math.PI * 2 / count;
      const x = owner.x + Math.cos(angle) * 30;
      const y = owner.y - 20 + Math.sin(angle) * 12;
      this.wisps[index]
        .setPosition(x, y)
        .setDepth(10 + y / 1000)
        .setAlpha(0.72 + Math.sin(timeMs * 0.006 + index) * 0.12);
    }
  }

  clear(): void {
    for (const sprite of this.wisps) sprite.destroy();
    this.wisps.length = 0;
  }
}
