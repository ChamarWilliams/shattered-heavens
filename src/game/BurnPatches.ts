import Phaser from 'phaser';
import { SCORCH } from '../domain/elites';
import { drawWarningCircle } from './warningMarkers';

interface Patch {
  readonly x: number;
  readonly y: number;
  readonly graphics: Phaser.GameObjects.Graphics;
  armMs: number;
  lifeMs: number;
  hit: boolean;
}

/**
 * Burning ground left by Scorching elites. Each patch shows a dashed warning
 * ring while it arms, then burns for a while. It can hurt the hero once.
 */
export class BurnPatches {
  private readonly patches: Patch[] = [];
  private elapsedMs = 0;

  constructor(private readonly scene: Phaser.Scene, private readonly hurtHero: (x: number, y: number) => void, private readonly ignite: () => void = () => undefined) {}

  get count(): number { return this.patches.length; }

  spawn(x: number, y: number, scale: number): void {
    if (this.patches.length >= SCORCH.maxPatches * 2) return;
    const graphics = this.scene.add.graphics().setDepth(7);
    this.patches.push({ x, y, graphics, armMs: SCORCH.armMs, lifeMs: SCORCH.burnMs, hit: false });
    graphics.setData('scale', scale);
  }

  update(delta: number, heroX: number, heroFeetY: number, accent: number, accessible = false): void {
    this.elapsedMs += delta;
    for (const patch of [...this.patches]) {
      const radius = SCORCH.radius * (patch.graphics.getData('scale') as number);
      const g = patch.graphics.clear();
      if (patch.armMs > 0) {
        patch.armMs -= delta;
        // Warning: a dashed ring that fills in as it arms.
        const progress = 1 - patch.armMs / SCORCH.armMs;
        drawWarningCircle(g, patch.x, patch.y, radius, accent, accessible, { dashed: true, fillAlpha: 0.3, strength: progress });
        continue;
      }
      if (patch.lifeMs === SCORCH.burnMs) this.ignite();
      patch.lifeMs -= delta;
      if (patch.lifeMs <= 0) { patch.graphics.destroy(); this.patches.splice(this.patches.indexOf(patch), 1); continue; }
      const flicker = 0.75 + 0.25 * Math.sin(this.elapsedMs / 70 + patch.x);
      const fade = Math.min(1, patch.lifeMs / 400);
      if (accessible) {
        // Burning: cross-hatched and solid-ringed, unlike the dashed arming ring.
        g.setAlpha(fade);
        drawWarningCircle(g, patch.x, patch.y, radius, accent, true, { cross: true });
      } else {
        g.setAlpha(1);
        g.fillStyle(0xff7a3c, 0.42 * fade * flicker).fillCircle(patch.x, patch.y, radius);
        g.fillStyle(0xffd27a, 0.5 * fade * flicker).fillCircle(patch.x, patch.y, radius * 0.5);
        g.lineStyle(1.5, accent, 0.8 * fade).strokeCircle(patch.x, patch.y, radius);
      }
      if (!patch.hit && Phaser.Math.Distance.Between(heroX, heroFeetY, patch.x, patch.y) < radius) {
        patch.hit = true;
        this.hurtHero(patch.x, patch.y);
      }
    }
  }

  clear(): void {
    for (const patch of this.patches.splice(0)) patch.graphics.destroy();
  }
}
