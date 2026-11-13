import Phaser from 'phaser';
import { familiarTextureKey, gameplayManifest } from '../assets/gameplayManifest';
import { direction8FromAngle } from '../characters/directions';
import type { FoxfireFamiliarSnapshot } from '../domain/FoxfireSummonSystem';

export class FoxfireSummonView {
  private readonly sprites = new Map<string, Phaser.GameObjects.Sprite>();

  constructor(private readonly scene: Phaser.Scene) {}

  sync(snapshots: readonly FoxfireFamiliarSnapshot[]): void {
    const active = new Set(snapshots.map((snapshot) => snapshot.id));
    for (const snapshot of snapshots) {
      let sprite = this.sprites.get(snapshot.id);
      const direction = direction8FromAngle(snapshot.facingAngleRadians);
      const textureKey = familiarTextureKey('rei_fire_fox', snapshot.state, direction);
      const metadata = gameplayManifest.familiars.rei_fire_fox.states[snapshot.state];
      const frameDurationMs = 1000 / metadata.fps;
      const rawFrame = Math.floor(snapshot.stateElapsedMs / frameDurationMs);
      const frame = metadata.loop ? rawFrame % metadata.frames : Math.min(metadata.frames - 1, rawFrame);
      if (!sprite) {
        sprite = this.scene.add.sprite(snapshot.x, snapshot.y, textureKey, frame)
          .setScale(0.38)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setDepth(14);
        this.scene.tweens.add({ targets: sprite, scale: { from: 0.12, to: 0.38 }, duration: 280, ease: 'Back.Out' });
        this.sprites.set(snapshot.id, sprite);
      }
      sprite.setTexture(textureKey, frame);
      const fade = Math.min(1, snapshot.remainingMs / 450);
      const attackCompensation = snapshot.state === 'attack' ? 12 : 0;
      const renderX = snapshot.x - Math.cos(snapshot.facingAngleRadians) * attackCompensation;
      const renderY = snapshot.y - Math.sin(snapshot.facingAngleRadians) * attackCompensation;
      sprite.setPosition(renderX, renderY).setAlpha(0.96 * fade).setDepth(10 + renderY / 1000);
    }
    for (const [id, sprite] of this.sprites) {
      if (active.has(id)) continue;
      sprite.destroy();
      this.sprites.delete(id);
    }
  }

  clear(): void {
    for (const sprite of this.sprites.values()) sprite.destroy();
    this.sprites.clear();
  }
}
