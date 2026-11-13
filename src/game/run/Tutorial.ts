import Phaser from 'phaser';
import type { GeneratedRoom } from '../../dungeon/types';
import { loadMeta, saveMeta } from '../../domain/metaProgress';
import { PRACTICE_DONE, PRACTICE_STEPS } from '../../domain/tutorial';
import type { DungeonRunScene } from '../DungeonRunScene';
import { HERO_FOOT_OFFSET, actorDepth, type EnemyActor } from './runShared';

export const DUMMY_KEY = 'room-dummy';
const DUMMY_FRAME = { width: 32, height: 56 } as const;
type Step = 'move' | 'attack' | 'ability' | 'dodge' | 'leave';
const ORDER: readonly Step[] = ['move', 'attack', 'ability', 'dodge', 'leave'];
const DODGE = { windupMs: 1100, radius: 34, everyMs: 2200 } as const;

/**
 * The first-expedition practice in the start room: move, strike the training
 * dummy, use your technique, step out of a warning ring, then leave. The dummy
 * is a harmless EnemyActor (flagged `dummy`) so every hero's attacks already hit
 * it; it never attacks, never dies and never keeps the doors shut. Also the
 * single place the run asks for one-time tips.
 */
export class Tutorial {
  private step?: Step;
  private dummy?: EnemyActor;
  private startX = 0;
  private startY = 0;
  private dodgeMs = 0;
  private dodgeArmed = false;
  private dodgeMisses = 0;

  constructor(private readonly run: DungeonRunScene) {}

  static preload(scene: Phaser.Scene): void {
    scene.load.spritesheet(DUMMY_KEY, '/assets/rooms/dummy.png', { frameWidth: DUMMY_FRAME.width, frameHeight: DUMMY_FRAME.height });
  }

  get active(): boolean { return this.step !== undefined; }

  /** Asks the guidance card for a one-time tip (it ignores ones already seen). */
  hint(id: string): void {
    if (this.run.settings.tutorialHints && !this.run.coopSnapshot) this.run.game.events.emit('tutorial-hint', id);
  }

  /** Starts the practice in the first expedition's start room, once per save. */
  onEnterRoom(room: GeneratedRoom, resumed: boolean): void {
    if (this.step && room.kind !== 'start') { this.finish(); return; }
    if (this.step || resumed || room.kind !== 'start' || this.run.coopSnapshot || this.run.themeIndex !== 0 || this.run.resonance !== 0) return;
    if (!this.run.settings.tutorialHints || loadMeta().tutorial.includes(PRACTICE_DONE)) return;
    this.startX = this.run.hero.x;
    this.startY = this.run.hero.y;
    this.spawnDummy();
    this.goTo('move');
  }

  update(delta: number): void {
    if (!this.step) return;
    if (this.dummy) this.run.enemyAI.syncEnemyView(this.dummy);
    if (this.step === 'move' && Phaser.Math.Distance.Between(this.run.hero.x, this.run.hero.y, this.startX, this.startY) > 60) this.goTo('attack');
    else if (this.step === 'dodge') this.updateDodge(delta);
  }

  /** The dummy was struck: wobble, show the number, never fall. */
  onDummyHit(enemy: EnemyActor, amount: number): void {
    enemy.health = enemy.maxHealth;
    this.run.spawnFloatingText(enemy.sprite.x, enemy.sprite.y - enemy.headOffset, `${Math.max(1, Math.round(amount))}`, '#fff2cc', 600);
    const lean = this.run.hero.x < enemy.sprite.x ? 2 : 1;
    enemy.sprite.setFrame(lean);
    this.run.time.delayedCall(140, () => enemy.sprite.active && enemy.sprite.setFrame(0));
    this.run.audioFeedback?.play('hit');
    if (this.step === 'attack') this.goTo('ability');
  }

  onAbility(): void {
    if (this.step === 'ability') this.run.time.delayedCall(500, () => this.step === 'ability' && this.goTo('dodge'));
  }

  /** "Skip tutorial" on the card. */
  skip(): void {
    if (this.step) this.finish();
  }

  private goTo(step: Step): void {
    if (this.step) this.run.game.events.emit('tutorial-step-done', `practice-${this.step}`);
    this.step = step;
    this.dodgeMs = 900;
    this.dodgeArmed = false;
    this.dodgeMisses = 0;
    // The card queues practice steps in front of tips, so each shows as the last one closes.
    this.run.time.delayedCall(this.step === 'move' ? 600 : 750, () => {
      if (this.step === step) this.run.game.events.emit('tutorial-hint', PRACTICE_STEPS[ORDER.indexOf(step)].id);
    });
    if (step === 'leave' && this.dummy) {
      const dummy = this.dummy;
      this.run.tweens.add({ targets: [dummy.sprite, dummy.shadow], alpha: 0, duration: 500, onComplete: () => this.removeDummy() });
    }
  }

  private updateDodge(delta: number): void {
    if (this.dodgeArmed) return;
    this.dodgeMs -= delta;
    if (this.dodgeMs > 0) return;
    // A harmless rehearsal: the ring closes on where you stand; step out in time.
    this.dodgeArmed = true;
    const x = this.run.hero.x;
    const y = this.run.hero.y;
    const radius = DODGE.radius * this.run.roomScale;
    this.run.enemyAI.telegraphZone(x, y, radius, DODGE.windupMs);
    this.run.audioFeedback?.play('enemy-telegraph');
    this.run.time.delayedCall(DODGE.windupMs, () => {
      if (this.step !== 'dodge') return;
      this.run.effectPool.spawn({ effectId: 'flying_sword_impact', x, y, scale: 0.4, depth: 34 });
      const caught = Phaser.Math.Distance.Between(this.run.hero.x, this.run.hero.y, x, y) < radius;
      if (!caught || this.dodgeMisses >= 2) {
        this.run.spawnFloatingText(this.run.hero.x, this.run.hero.y - 44, caught ? 'YOU WILL GET IT' : 'WELL READ', '#9be3a3', 1100);
        this.goTo('leave');
        return;
      }
      this.dodgeMisses += 1;
      this.run.spawnFloatingText(this.run.hero.x, this.run.hero.y - 44, 'STEP OUT BEFORE IT CLOSES', '#ffd982', 1300);
      this.dodgeArmed = false;
      this.dodgeMs = DODGE.everyMs;
    });
  }

  private finish(): void {
    if (this.step) this.run.game.events.emit('tutorial-step-done', `practice-${this.step}`);
    this.step = undefined;
    this.removeDummy();
    const meta = loadMeta();
    for (const id of [PRACTICE_DONE, ...PRACTICE_STEPS.map((hint) => hint.id)]) if (!meta.tutorial.includes(id)) meta.tutorial.push(id);
    saveMeta(meta);
  }

  private spawnDummy(): void {
    const point = this.run.roomPoint(0, -0.28);
    const scale = this.run.roomScale;
    const sprite = this.run.add.sprite(point.x, point.y, DUMMY_KEY, 0).setOrigin(0.5, 0.62).setScale(scale);
    const shadow = this.run.add.ellipse(point.x, point.y, 30 * scale, 10 * scale, 0x000000, 0.45).setDepth(8);
    const healthBar = this.run.add.graphics().setDepth(27);
    const footOffset = DUMMY_FRAME.height * 0.38 * scale;
    this.dummy = {
      id: -1, sprite, shadow, healthBar, role: 'sentinel', column: 0, dummy: true,
      footOffset, headOffset: DUMMY_FRAME.height * 0.62 * scale,
      maxHealth: 9999, health: 9999, speed: 0, radius: 16 * scale, attackMs: Infinity, specialMs: Infinity, phase: 0,
      slowRemainingMs: 0, moveLingerMs: 0, facingHoldMs: 0, shieldMs: 0, burnMs: 0, burnTickMs: 0,
    };
    sprite.setDepth(actorDepth(point.y + footOffset - HERO_FOOT_OFFSET));
    this.run.enemies.push(this.dummy);
  }

  private removeDummy(): void {
    const dummy = this.dummy;
    if (!dummy) return;
    this.dummy = undefined;
    const index = this.run.enemies.indexOf(dummy);
    if (index >= 0) this.run.enemies.splice(index, 1);
    dummy.sprite.destroy(); dummy.shadow.destroy(); dummy.healthBar.destroy();
  }
}
