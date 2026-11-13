import Phaser from 'phaser';
import type { FormNumber, HeroId } from '../domain/heroProgress';

interface AuraStyle {
  readonly color: number;
  readonly bright: number;
  /** Shape of the orbiting motes: blades, wisps or flames. */
  readonly mote: 'blade' | 'wisp' | 'flame';
}

const STYLES: Readonly<Record<HeroId, AuraStyle>> = {
  'li-yunfeng': { color: 0x4fd4bd, bright: 0xd9fff6, mote: 'blade' },
  'seo-jiwon': { color: 0xa66bff, bright: 0xf0dcff, mote: 'wisp' },
  'tsukishiro-rei': { color: 0x4aa8ff, bright: 0xdcf0ff, mote: 'flame' },
};
/** Orbiting motes per form: none, a few, a full ring. */
const MOTES: Readonly<Record<FormNumber, number>> = { 1: 0, 2: 4, 3: 9 };

/**
 * A glow that follows a hero and grows grander with each Form, so a stronger
 * hero looks stronger without any new sprite art:
 *  I   nothing extra;
 *  II  a soft floor glow and four orbiting motes;
 *  III a brighter pool, a nine-mote ring, a halo and a rising shimmer.
 */
export class HeroFormAura {
  private readonly glow: Phaser.GameObjects.Ellipse;
  private readonly pool: Phaser.GameObjects.Ellipse;
  private readonly halo: Phaser.GameObjects.Ellipse;
  private readonly motes: Phaser.GameObjects.Shape[] = [];
  private readonly sparks: Phaser.GameObjects.Arc[] = [];
  private form: FormNumber = 1;
  private clock = 0;

  constructor(private readonly scene: Phaser.Scene, private readonly heroId: HeroId, private readonly scale: number, form: FormNumber) {
    const style = STYLES[heroId];
    this.pool = scene.add.ellipse(0, 0, 70 * scale, 22 * scale, style.color, 0.28).setBlendMode(Phaser.BlendModes.ADD);
    this.glow = scene.add.ellipse(0, 0, 44 * scale, 62 * scale, style.color, 0.1).setBlendMode(Phaser.BlendModes.ADD);
    this.halo = scene.add.ellipse(0, 0, 26 * scale, 9 * scale).setStrokeStyle(Math.max(1, 1.5 * scale), style.bright, 0.85).setBlendMode(Phaser.BlendModes.ADD);
    for (let index = 0; index < MOTES[3]; index += 1) {
      const size = 4 * scale;
      const mote = style.mote === 'blade' ? scene.add.rectangle(0, 0, size * 0.55, size * 2.6, style.bright, 0.95)
        : style.mote === 'wisp' ? scene.add.ellipse(0, 0, size * 1.5, size * 1.5, style.bright, 0.9)
          : scene.add.triangle(0, 0, 0, size * 2, size, size * 2, size * 0.5, 0, style.bright, 0.95);
      this.motes.push(mote.setBlendMode(Phaser.BlendModes.ADD));
    }
    for (let index = 0; index < 5; index += 1) this.sparks.push(scene.add.circle(0, 0, Math.max(0.8, 0.9 * scale), style.bright, 0.9).setBlendMode(Phaser.BlendModes.ADD));
    this.setForm(form);
  }

  /** Switches form; going up bursts a ring so the change reads as an ascension. */
  setForm(form: FormNumber, announce = false): void {
    const rose = form > this.form;
    this.form = form;
    this.pool.setVisible(form >= 2);
    this.glow.setVisible(form >= 2);
    this.halo.setVisible(form >= 3);
    this.motes.forEach((mote, index) => mote.setVisible(index < MOTES[form]));
    this.sparks.forEach((spark) => spark.setVisible(form >= 3));
    if (announce && rose) this.burst();
  }

  /** Follows the hero. feet is the hero's origin; the aura centres on the body. */
  update(x: number, y: number, depth: number, delta: number, visible = true): void {
    this.clock += delta;
    const s = this.scale;
    const show = visible && this.form >= 2;
    const bodyY = y + 4 * s;
    const pulse = 1 + 0.06 * Math.sin(this.clock / 420);
    this.pool.setPosition(x, y + 30 * s).setScale(pulse * (this.form === 3 ? 1.25 : 1)).setDepth(depth - 0.002).setAlpha(this.form === 3 ? 0.4 : 0.26);
    this.glow.setPosition(x, bodyY).setScale(pulse).setDepth(depth - 0.001).setAlpha(this.form === 3 ? 0.17 : 0.1);
    this.halo.setPosition(x, y - 30 * s + Math.sin(this.clock / 500) * 1.2 * s).setDepth(depth + 0.002);
    const count = MOTES[this.form];
    const radius = (this.form === 3 ? 26 : 21) * s;
    this.motes.forEach((mote, index) => {
      if (index >= count) return;
      const angle = this.clock / (this.form === 3 ? 1500 : 1900) * Math.PI * 2 + (index / count) * Math.PI * 2;
      const lift = Math.sin(this.clock / 700 + index) * 3 * s;
      mote.setPosition(x + Math.cos(angle) * radius, bodyY + Math.sin(angle) * radius * 0.42 + lift)
        .setRotation(this.heroId === 'li-yunfeng' ? angle + Math.PI / 2 : 0)
        // Motes passing behind the hero draw behind it.
        .setDepth(Math.sin(angle) < 0 ? depth - 0.003 : depth + 0.003);
    });
    if (this.form === 3) {
      this.sparks.forEach((spark, index) => {
        const phase = ((this.clock / 1600 + index / this.sparks.length) % 1);
        spark.setPosition(x + Math.sin(index * 2.4 + phase * 5) * 15 * s, y + 28 * s - phase * 62 * s).setAlpha(1 - phase).setDepth(depth + 0.003);
      });
    }
    for (const object of [this.pool, this.glow]) object.setVisible(show);
    this.halo.setVisible(visible && this.form >= 3);
    this.motes.forEach((mote, index) => mote.setVisible(visible && index < count));
    this.sparks.forEach((spark) => spark.setVisible(visible && this.form >= 3));
  }

  private burst(): void {
    const style = STYLES[this.heroId];
    for (let ring = 0; ring < 3; ring += 1) {
      const wave = this.scene.add.ellipse(this.pool.x, this.pool.y, 30 * this.scale, 10 * this.scale).setStrokeStyle(2, style.bright, 0.9).setBlendMode(Phaser.BlendModes.ADD).setDepth(this.pool.depth + 0.01);
      this.scene.tweens.add({ targets: wave, scaleX: 6, scaleY: 6, alpha: 0, delay: ring * 140, duration: 700, onComplete: () => wave.destroy() });
    }
  }

  destroy(): void {
    for (const object of [this.pool, this.glow, this.halo, ...this.motes, ...this.sparks]) object.destroy();
  }
}
