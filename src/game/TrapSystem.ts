import Phaser from 'phaser';
import type { SeededRandom } from '../domain/SeededRandom';
import { PIT, SPIKES, VENT, cycleLength, trapLayout, trapPhase, trapRadius, type TrapGrid, type TrapKind, type TrapPlacement } from '../dungeon/traps';
import { drawWarningCircle } from './warningMarkers';

export type { TrapKind } from '../dungeon/traps';

const SHEETS: Readonly<Record<TrapKind, { key: string; file: string; width: number; height: number; frames: number }>> = {
  spikes: { key: 'trap-spikes', file: '/assets/traps/spikes.png', width: 32, height: 32, frames: 6 },
  vent: { key: 'trap-vent', file: '/assets/traps/firevent.png', width: 32, height: 48, frames: 8 },
  pit: { key: 'trap-pit', file: '/assets/traps/pitfall.png', width: 32, height: 32, frames: 7 },
};

export interface Trap {
  readonly kind: TrapKind;
  readonly x: number;
  readonly y: number;
  readonly sprite: Phaser.GameObjects.Sprite;
  readonly radius: number;
  clock: number;
  /** Pits: 'intact' until stepped on, then 'crumbling', 'open', back to 'intact'. */
  pitState?: 'intact' | 'crumbling' | 'open';
  hitThisCycle: boolean;
}

export interface TrapHooks {
  /** Damage from spikes or flames at a point. */
  hurtHero(x: number, y: number): void;
  /** The floor gave way under the hero. */
  heroFell(x: number, y: number): void;
  /** A trap fires (spikes rise, a vent erupts, a pit crumbles). */
  sound?(kind: TrapKind): void;
}

/**
 * Spike plates, fire vents and crumbling pitfalls. Spikes and vents run on
 * staggered cycles (warning, then danger); pits hold until the hero steps on
 * them, crumble, and swallow whoever is still standing there.
 */
export class TrapSystem {
  readonly traps: Trap[] = [];
  /** Colour-blind-safe warnings: a striped black-and-white marker over every trap about to fire. */
  accessible = false;
  private warningGraphics?: Phaser.GameObjects.Graphics;

  constructor(private readonly scene: Phaser.Scene, private readonly hooks: TrapHooks) {}

  static preload(scene: Phaser.Scene): void {
    for (const sheet of Object.values(SHEETS)) scene.load.spritesheet(sheet.key, sheet.file, { frameWidth: sheet.width, frameHeight: sheet.height });
  }

  /** Lays traps out on whole tiles, away from door lanes and the centre where chests land (see dungeon/traps.ts). */
  spawn(random: SeededRandom, count: number, grid: TrapGrid, scale: number, keepClear: readonly { x: number; y: number }[], occupied: ReadonlySet<string> = new Set()): void {
    this.place(trapLayout(random, count, grid, scale, keepClear, occupied), grid.tile);
  }

  /** Places traps from a layout (co-op uses the server's, so indices match its pit states). */
  place(placements: readonly TrapPlacement[], tile: number): void {
    const grid = { tile };
    for (const placement of placements) {
      const { kind, x, y } = placement;
      const sheet = SHEETS[kind];
      const sprite = this.scene.add.sprite(x, y, sheet.key, 0)
        .setOrigin(0.5, kind === 'vent' ? 40 / 48 : 0.5)
        .setScale(grid.tile / 32 * 0.95)
        .setDepth(kind === 'vent' ? 9 : 5);
      this.traps.push({ kind, x, y, sprite, radius: trapRadius(grid.tile), clock: placement.clock, pitState: kind === 'pit' ? 'intact' : undefined, hitThisCycle: false });
    }
  }

  /**
   * Co-op: the server owns trap damage. This only shows each trap where the
   * shared room clock and the server's pit states say it is.
   */
  renderShared(roomClockMs: number, placements: readonly TrapPlacement[], pits: readonly number[]): void {
    this.traps.forEach((trap, index) => {
      const placement = placements[index];
      if (!placement) return;
      if (trap.kind === 'pit') {
        const state = pits[index] ?? 0;
        const next = state === 1 ? 'crumbling' : state === 2 ? 'open' : 'intact';
        if (next === 'crumbling' && trap.pitState !== 'crumbling') this.hooks.sound?.('pit');
        trap.pitState = next;
        trap.sprite.setFrame(next === 'intact' ? 0 : next === 'crumbling' ? 3 : 5);
        return;
      }
      const kind = trap.kind;
      trap.clock = ((placement.clock + roomClockMs) % cycleLength(kind) + cycleLength(kind)) % cycleLength(kind);
      const phase = trapPhase(kind, trap.clock);
      let frame = 0;
      if (kind === 'spikes') {
        const t = trap.clock;
        frame = phase === 'idle' ? 0 : phase === 'warn' ? 1 : phase === 'danger' ? (t < SPIKES.down + SPIKES.warn + 90 ? 2 : 3) : 5;
      } else {
        const t = trap.clock;
        frame = phase === 'idle' ? 0 : phase === 'warn' ? 1 : phase === 'danger' ? 2 + Math.floor((t - VENT.idle - VENT.warn) / 95) % 4 : (t < cycleLength('vent') - VENT.cool / 2 ? 6 : 7);
      }
      if (frame === 2 && Number(trap.sprite.frame.name) !== 2 && this.isNearCamera(trap)) this.hooks.sound?.(kind);
      trap.sprite.setFrame(frame);
    });
    this.drawAccessibleWarnings();
  }

  update(delta: number, heroX: number, heroFeetY: number): void {
    for (const trap of this.traps) {
      const onTrap = Phaser.Math.Distance.Between(heroX, heroFeetY, trap.x, trap.y) < trap.radius;
      if (trap.kind === 'spikes') this.updateSpikes(trap, delta, onTrap);
      else if (trap.kind === 'vent') this.updateVent(trap, delta, onTrap);
      else this.updatePit(trap, delta, onTrap);
    }
    this.drawAccessibleWarnings();
  }

  /** Which traps are warning (about to hurt) or dangerous right now. */
  private warningState(trap: Trap): 'warn' | 'danger' | undefined {
    if (trap.kind === 'spikes') {
      const t = trap.clock;
      if (t >= SPIKES.down && t < SPIKES.down + SPIKES.warn) return 'warn';
      if (t >= SPIKES.down + SPIKES.warn && t < SPIKES.down + SPIKES.warn + SPIKES.up) return 'danger';
      return undefined;
    }
    if (trap.kind === 'vent') {
      const t = trap.clock;
      if (t >= VENT.idle && t < VENT.idle + VENT.warn) return 'warn';
      if (t >= VENT.idle + VENT.warn && t < VENT.idle + VENT.warn + VENT.fire) return 'danger';
      return undefined;
    }
    return trap.pitState === 'crumbling' ? 'warn' : trap.pitState === 'open' ? 'danger' : undefined;
  }

  private isNearCamera(trap: Trap): boolean {
    return this.scene.cameras.main.worldView.contains(trap.x, trap.y);
  }

  private drawAccessibleWarnings(): void {
    if (!this.accessible) { this.warningGraphics?.clear(); return; }
    this.warningGraphics ??= this.scene.add.graphics().setDepth(9.5);
    const g = this.warningGraphics.clear();
    for (const trap of this.traps) {
      const state = this.warningState(trap);
      if (state) drawWarningCircle(g, trap.x, trap.y, trap.radius + 3, 0xffffff, true, { dashed: state === 'warn', cross: state === 'danger' });
    }
  }

  clear(): void {
    for (const trap of this.traps.splice(0)) trap.sprite.destroy();
    this.warningGraphics?.clear();
  }

  private updateSpikes(trap: Trap, delta: number, onTrap: boolean): void {
    const cycle = SPIKES.down + SPIKES.warn + SPIKES.up + SPIKES.sink;
    trap.clock = (trap.clock + delta) % cycle;
    const t = trap.clock;
    let frame = 0;
    if (t < SPIKES.down) { frame = 0; trap.hitThisCycle = false; }
    else if (t < SPIKES.down + SPIKES.warn) frame = 1;
    else if (t < SPIKES.down + SPIKES.warn + SPIKES.up) frame = t < SPIKES.down + SPIKES.warn + 90 ? 2 : 3;
    else frame = 5;
    if (frame === 2 && Number(trap.sprite.frame.name) !== 2 && this.isNearCamera(trap)) this.hooks.sound?.('spikes');
    trap.sprite.setFrame(frame);
    if ((frame === 2 || frame === 3) && onTrap && !trap.hitThisCycle) {
      trap.hitThisCycle = true;
      this.hooks.hurtHero(trap.x, trap.y);
    }
  }

  private updateVent(trap: Trap, delta: number, onTrap: boolean): void {
    const cycle = VENT.idle + VENT.warn + VENT.fire + VENT.cool;
    trap.clock = (trap.clock + delta) % cycle;
    const t = trap.clock;
    let frame = 0;
    if (t < VENT.idle) { frame = 0; trap.hitThisCycle = false; }
    else if (t < VENT.idle + VENT.warn) frame = 1;
    else if (t < VENT.idle + VENT.warn + VENT.fire) frame = 2 + Math.floor((t - VENT.idle - VENT.warn) / 95) % 4;
    else frame = t < cycle - VENT.cool / 2 ? 6 : 7;
    if (frame === 2 && Number(trap.sprite.frame.name) !== 2 && this.isNearCamera(trap)) this.hooks.sound?.('vent');
    trap.sprite.setFrame(frame);
    if (frame >= 2 && frame <= 5 && onTrap && !trap.hitThisCycle) {
      trap.hitThisCycle = true;
      this.hooks.hurtHero(trap.x, trap.y);
    }
  }

  private updatePit(trap: Trap, delta: number, onTrap: boolean): void {
    if (trap.pitState === 'intact') {
      if (!onTrap) return;
      trap.pitState = 'crumbling';
      trap.clock = 0;
      this.hooks.sound?.('pit');
      this.scene.tweens.add({ targets: trap.sprite, x: trap.x + 1.5, duration: 40, yoyo: true, repeat: 5 });
    }
    trap.clock += delta;
    if (trap.pitState === 'crumbling') {
      trap.sprite.setFrame(Math.min(4, 1 + Math.floor(trap.clock / (PIT.crumble / 4))));
      if (trap.clock < PIT.crumble) return;
      trap.pitState = 'open';
      trap.clock = 0;
      trap.sprite.setFrame(5);
      if (onTrap) this.hooks.heroFell(trap.x, trap.y);
      return;
    }
    // Open: anyone walking in falls; it knits back together after a while.
    if (onTrap && trap.clock > 120 && !trap.hitThisCycle) {
      trap.hitThisCycle = true;
      this.hooks.heroFell(trap.x, trap.y);
    }
    if (trap.clock >= PIT.open) {
      trap.pitState = 'intact';
      trap.hitThisCycle = false;
      trap.sprite.setFrame(0);
    }
  }
}
