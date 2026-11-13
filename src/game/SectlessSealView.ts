import Phaser from 'phaser';
import { effectAnimationKey, effectTextureKey } from '../assets/gameplayManifest';
import type { SectlessSealSnapshot } from '../domain/SectlessSealSystem';

interface SealVisual {
  readonly container: Phaser.GameObjects.Container;
  readonly swords: Phaser.GameObjects.Sprite[];
  readonly label: Phaser.GameObjects.Text;
}

export class SectlessSealView {
  private readonly visuals = new Map<string, SealVisual>();

  constructor(private readonly scene: Phaser.Scene) {}

  sync(snapshots: readonly SectlessSealSnapshot[], timeMs: number): void {
    const active = new Set(snapshots.map((snapshot) => snapshot.targetId));
    for (const snapshot of snapshots) {
      let visual = this.visuals.get(snapshot.targetId);
      if (!visual) {
        const container = this.scene.add.container(snapshot.x, snapshot.y).setDepth(14);
        const label = this.scene.add.text(0, -33, 'SECTLESS', {
          fontFamily: 'monospace', fontSize: '7px', color: '#f4d681', backgroundColor: '#10201c', padding: { x: 3, y: 1 },
        }).setOrigin(0.5);
        container.add(label);
        visual = { container, swords: [], label };
        this.visuals.set(snapshot.targetId, visual);
      }
      visual.container.setPosition(snapshot.x, snapshot.y);
      visual.label.setText(`SEAL ×${snapshot.stacks}`);
      while (visual.swords.length < snapshot.stacks) {
        const sword = this.scene.add.sprite(0, 0, effectTextureKey('flying_sword'), 0)
          .setScale(0.22)
          .setBlendMode(Phaser.BlendModes.ADD)
          .play(effectAnimationKey('flying_sword'));
        visual.container.add(sword);
        visual.swords.push(sword);
      }
      while (visual.swords.length > snapshot.stacks) visual.swords.pop()?.destroy();
      visual.swords.forEach((sword, index) => {
        const angle = timeMs * 0.0018 + index * Math.PI * 2 / Math.max(1, snapshot.stacks);
        sword.setPosition(Math.cos(angle) * 25, Math.sin(angle) * 12 - 5).setRotation(angle + Math.PI / 2);
      });
    }
    for (const [id, visual] of this.visuals) {
      if (active.has(id)) continue;
      visual.container.destroy(true);
      this.visuals.delete(id);
    }
  }

  clear(): void {
    for (const visual of this.visuals.values()) visual.container.destroy(true);
    this.visuals.clear();
  }
}
