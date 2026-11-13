import Phaser from 'phaser';
import type { DungeonRunScene } from '../DungeonRunScene';
import { ENEMY_NAMES } from '../../domain/lexicon';
import { ELITE_AFFIXES, ELITE_HEALTH, ELITE_SCALE, SCORCH, SUNDER_COUNT, SUNDER_HEALTH, SWIFT_RECOVERY, SWIFT_SPEED, WARD_SHARE, eliteChance, maxElitesPerRoom, rollEliteAffix, type EliteAffix } from '../../domain/elites';
import { PROTECTORS, protectorHealth } from '../../domain/specialRooms';
import { ringAnglesWithGap } from '../../dungeon/combatPatterns';
import { ENEMY_SHEET_ANCHOR, ENEMY_SHEET_CELL, ENEMY_SHEET_FOOT_Y, ENEMY_SHEET_SIDE_FACING, ENEMY_SHEET_TOP_Y } from '../enemySheetLayout';
import { moveWithCollision } from '../movement';
import { drawWarningCircle, drawWarningLine } from '../warningMarkers';
import { type EnemyRole, type EnemyActor, isBig, type CombatProjectile, enemyAnimationKey, ENEMY_COLUMNS, HERO_FOOT_OFFSET, actorDepth } from './runShared';

/**
 * Enemy behaviour for a run: spawning (including elites and Protectors), movement, every attack and its telegraph, warden and Protector fights.
 * Split out of DungeonRunScene; it works on the run's state through `run`.
 */
export class EnemyDirector {
  constructor(private readonly run: DungeonRunScene) {}

  /**
   * Spread angles for an aimed fan. A hero boxed into a corner by two walls
   * cannot step out of a wide fan in time, so there it keeps at most its middle
   * three shots and narrows them to 55%; the
   * dodge solver found every unavoidable volley came from a cornered hero.
   */
  fan(spreads: readonly number[]): readonly number[] {
    const margin = 60;
    const left = this.run.roomBounds.left + this.run.wallBand;
    const right = this.run.roomBounds.right - this.run.wallBand;
    const top = this.run.roomBounds.top + this.run.wallBand;
    const bottom = this.run.roomBounds.bottom - this.run.wallBand;
    const x = this.run.hero.x;
    const y = this.run.hero.y + 18;
    const cornered = (x - left < margin || right - x < margin) && (y - top < margin || bottom - y < margin);
    if (!cornered) return spreads;
    // At most the middle three shots, narrowed.
    const middle = spreads.length > 3 ? spreads.slice(Math.floor(spreads.length / 2) - 1, Math.floor(spreads.length / 2) + 2) : spreads;
    return middle.map((spread) => spread * 0.55);
  }

  /**
   * Spreads enemies over the floor, never on top of the hero, a trap or cover.
   * Some may be elites; `forceElite` guarantees one (the last trial wave).
   */
  spawnWave(count: number, forceElite = false, graceMs = 0): void {
    const placed: { x: number; y: number }[] = [];
    const chance = eliteChance(this.run.themeIndex, this.run.resonance, this.run.visitedRooms.size);
    const cap = maxElitesPerRoom(this.run.themeIndex, this.run.resonance);
    for (let index = 0; index < count; index += 1) {
      const roleIndex = (index + this.run.visitedRooms.size + this.run.themeIndex) % 3;
      let spot = this.run.roomPoint(0, 0);
      for (let attempt = 0; attempt < 30; attempt += 1) {
        const candidate = {
          x: this.run.random.integer(Math.round(this.run.floorBounds.left), Math.round(this.run.floorBounds.right)),
          y: this.run.random.integer(Math.round(this.run.floorBounds.top), Math.round(this.run.floorBounds.bottom)),
        };
        const clearOfHero = Phaser.Math.Distance.Between(candidate.x, candidate.y, this.run.hero.x, this.run.hero.y) > 170 * this.run.roomScale;
        const clearOfOthers = placed.every((other) => Phaser.Math.Distance.Between(candidate.x, candidate.y, other.x, other.y) > 60);
        const clearOfTraps = this.run.trapSystem.traps.every((trap) => Phaser.Math.Distance.Between(candidate.x, candidate.y, trap.x, trap.y) > 40);
        const clearOfCover = this.run.features.coverRects.every((rect) => Phaser.Math.Distance.Between(candidate.x, candidate.y, rect.centerX, rect.centerY) > 36 * this.run.roomScale);
        spot = candidate;
        if (clearOfHero && clearOfOthers && clearOfTraps && clearOfCover) break;
      }
      placed.push(spot);
      const role = roleIndex === 0 ? 'hunter' : roleIndex === 1 ? 'shooter' : 'sentinel';
      const enemy = this.spawnEnemy(role, spot.x, spot.y);
      const mustBeElite = forceElite && index === count - 1 && this.run.elitesThisRoom < cap + 1;
      const affix = this.run.elitesThisRoom < cap || mustBeElite ? rollEliteAffix(this.run.random, role, mustBeElite ? 1 : chance) : undefined;
      if (affix) this.makeElite(enemy, affix);
      if (graceMs > 0) { enemy.attackMs += graceMs; enemy.specialMs += graceMs; this.spawnArrival(enemy); }
    }
  }

  /** Turns an ordinary enemy into an elite: tougher, larger, marked, with one affix. */
  makeElite(enemy: EnemyActor, affix: EliteAffix): void {
    this.run.elitesThisRoom += 1;
    this.run.tutorial.hint('elite');
    enemy.elite = affix;
    enemy.maxHealth = Math.round(enemy.maxHealth * ELITE_HEALTH);
    enemy.health = enemy.maxHealth;
    enemy.sprite.setScale(enemy.sprite.scaleX * ELITE_SCALE);
    // Draw offsets were measured at the base scale.
    enemy.footOffset *= ELITE_SCALE;
    enemy.headOffset *= ELITE_SCALE;
    enemy.radius = Math.round(enemy.radius * 1.1);
    enemy.shadow.setFillStyle(ELITE_AFFIXES[affix].color, 0.42);
    if (affix === 'warded') { enemy.wardMax = Math.round(enemy.maxHealth * WARD_SHARE); enemy.ward = enemy.wardMax; }
    if (affix === 'swift') enemy.speed *= SWIFT_SPEED;
    if (affix === 'scorching') enemy.scorchMs = SCORCH.intervalMs;
    this.run.lore.learn('elite');
    this.placeEnemySafely(enemy, enemy.sprite.x, enemy.sprite.y);
  }

  /** A short pillar of light where a summoned enemy is forming, so it never appears unannounced. */
  spawnArrival(enemy: EnemyActor): void {
    enemy.sprite.setAlpha(0);
    this.run.tweens.add({ targets: enemy.sprite, alpha: 1, duration: 420 });
    const pillar = this.run.add.ellipse(enemy.sprite.x, enemy.sprite.y + enemy.footOffset - 4, 40, 14, this.run.themeColor(), 0.5).setDepth(9);
    this.run.tweens.add({ targets: pillar, scaleX: 0.2, alpha: 0, duration: 520, onComplete: () => pillar.destroy() });
  }

  spawnEnemy(role: EnemyRole, x: number, y: number): EnemyActor {
    const boss = role === 'boss';
    const protector = role === 'protector';
    const themeId = this.run.dungeon.themeId;
    const column = protector ? PROTECTORS[themeId].column : ENEMY_COLUMNS[role];
    const scale = boss ? 0.58 : protector ? 0.52 : 0.38;
    const maxHealth = protector ? protectorHealth(this.run.themeIndex, this.run.difficulty) : Math.round((boss ? 280 + this.run.themeIndex * 120 : 36 + this.run.themeIndex * 12 + (role === 'sentinel' ? 16 : 0)) * this.run.difficulty);
    const shadow = this.run.add.ellipse(x, y, boss ? 96 : protector ? 78 : 46, boss ? 32 : protector ? 26 : 16, 0x000000, 0.48).setDepth(8);
    // The sheet anchor is the sprite's body centre, which is where hit circles sit.
    const sprite = this.run.add.sprite(x, y, `run-enemies:${themeId}`, column)
      .setOrigin(ENEMY_SHEET_ANCHOR.x / ENEMY_SHEET_CELL, ENEMY_SHEET_ANCHOR.y / ENEMY_SHEET_CELL)
      .setScale(scale)
      .play(enemyAnimationKey(themeId, column, 'idle'));
    // Health bars draw above every actor so they never hide behind the hero.
    const healthBar = this.run.add.graphics().setDepth(27);
    const enemy: EnemyActor = {
      id: this.run.nextEnemyId++, sprite, shadow, healthBar, role, column,
      footOffset: (ENEMY_SHEET_FOOT_Y[themeId][column] - ENEMY_SHEET_ANCHOR.y) * scale,
      headOffset: (ENEMY_SHEET_ANCHOR.y - ENEMY_SHEET_TOP_Y[themeId][column]) * scale,
      maxHealth, health: maxHealth, speed: (boss ? 25 : protector ? 32 : role === 'hunter' ? 54 : role === 'shooter' ? 34 : 22) * (this.run.trials.has('swift') ? 1.25 : 1), radius: boss ? 38 : protector ? 32 : 23,
      attackMs: boss || protector ? 1200 : 500 + column * 320, specialMs: boss ? 3600 : protector ? 3200 : 1900, phase: 0, slowRemainingMs: 0, moveLingerMs: 0, facingHoldMs: 0, shieldMs: 0, burnMs: 0, burnTickMs: 0,
    };
    this.run.enemies.push(enemy);
    this.placeEnemySafely(enemy, x, y);
    this.syncEnemyView(enemy);
    return enemy;
  }

  /** Keeps shadow, draw order and health bar attached to the enemy's current position. */
  syncEnemyView(enemy: EnemyActor): void {
    enemy.shadow.setPosition(enemy.sprite.x, enemy.sprite.y + enemy.footOffset - (isBig(enemy) ? 8 : 4));
    enemy.sprite.setDepth(actorDepth(enemy.sprite.y + enemy.footOffset - HERO_FOOT_OFFSET));
    this.drawEnemyHealth(enemy);
  }

  /** Plays idle/move without restarting the cycle when movement stutters for a frame. */
  playEnemyLocomotion(enemy: EnemyActor, moving: boolean, delta: number): void {
    enemy.moveLingerMs = moving ? 180 : Math.max(0, enemy.moveLingerMs - delta);
    if (enemy.sprite.anims.isPlaying && enemy.sprite.anims.currentAnim?.key.endsWith(':attack')) return;
    enemy.sprite.play(enemyAnimationKey(this.run.dungeon.themeId, enemy.column, enemy.moveLingerMs > 0 ? 'move' : 'idle'), true);
  }

  /**
   * Turns profile-drawn enemies toward their target. A dead zone and a short hold
   * stop them from flipping back and forth while the target is straight above or
   * below them, or dashes through them. Front-facing art is never mirrored.
   */
  faceEnemyToward(enemy: EnemyActor, targetX: number, delta: number): void {
    enemy.facingHoldMs = Math.max(0, enemy.facingHoldMs - delta);
    if (!ENEMY_SHEET_SIDE_FACING[this.run.dungeon.themeId][enemy.column] || enemy.facingHoldMs > 0) return;
    if (enemy.sprite.anims.isPlaying && enemy.sprite.anims.currentAnim?.key.endsWith(':attack')) return;
    const dx = targetX - enemy.sprite.x;
    const faceLeft = enemy.sprite.flipX ? dx < 16 : dx < -16;
    if (faceLeft === enemy.sprite.flipX) return;
    enemy.sprite.setFlipX(faceLeft);
    enemy.facingHoldMs = 350;
  }

  updateEnemies(delta: number): void {
    for (const enemy of [...this.run.enemies]) {
      if (enemy.dummy) continue;
      enemy.shieldMs = Math.max(0, enemy.shieldMs - delta);
      if (enemy.burnMs > 0) {
        enemy.burnMs -= delta;
        enemy.burnTickMs -= delta;
        if (enemy.burnTickMs <= 0) {
          enemy.burnTickMs = 400;
          this.run.damageEnemy(enemy, enemy.burnDamage ?? 4);
          if (enemy.health <= 0) continue;
        }
      }
      // Swift elites recover sooner between attacks; their windups are unchanged.
      const clock = (this.run.trials.has('swift') ? delta * 1.25 : delta) / (enemy.elite === 'swift' ? SWIFT_RECOVERY : 1);
      enemy.attackMs -= clock;
      enemy.specialMs -= clock;
      enemy.slowRemainingMs = Math.max(0, enemy.slowRemainingMs - delta);
      const angle = Phaser.Math.Angle.Between(enemy.sprite.x, enemy.sprite.y, this.run.hero.x, this.run.hero.y);
      const distance = Phaser.Math.Distance.Between(enemy.sprite.x, enemy.sprite.y, this.run.hero.x, this.run.hero.y);
      let moving = false;
      if (enemy.role === 'hunter') {
        if (distance > 52) { this.moveEnemy(enemy, angle, delta); moving = true; }
        else if (enemy.attackMs <= 0 && this.run.attackDirectorMs <= 0) {
          enemy.attackMs = 1300;
          this.run.attackDirectorMs = 420;
          this.performHunterAttack(enemy, angle);
        }
      } else if (enemy.role === 'shooter') {
        if (distance > 110) { this.moveEnemy(enemy, angle, delta); moving = true; }
        if (enemy.attackMs <= 0 && distance < 160 && this.run.attackDirectorMs <= 0) {
          enemy.attackMs = 1750;
          this.run.attackDirectorMs = 680;
          this.performHeavyAttack(enemy, angle);
        }
      } else if (enemy.role === 'sentinel') {
        if (enemy.attackMs <= 0 && this.run.attackDirectorMs <= 0) {
          enemy.attackMs = 2050;
          this.run.attackDirectorMs = 760;
          this.performSentinelAttack(enemy, angle);
          enemy.phase += 1;
        }
      } else if (enemy.role === 'protector') {
        moving = this.updateProtector(enemy, angle, distance, delta);
      } else {
        this.updateBoss(enemy, angle, distance, delta);
        moving = distance > 175;
      }
      if (enemy.elite === 'scorching' && moving) {
        enemy.scorchMs = (enemy.scorchMs ?? SCORCH.intervalMs) - delta;
        if (enemy.scorchMs <= 0) {
          enemy.scorchMs = SCORCH.intervalMs;
          this.run.burns.spawn(enemy.sprite.x, enemy.sprite.y + enemy.footOffset - 4, this.run.roomScale);
        }
      }
      this.faceEnemyToward(enemy, this.run.hero.x, delta);
      this.playEnemyLocomotion(enemy, moving, delta);
      enemy.sprite.x = Phaser.Math.Clamp(enemy.sprite.x, this.run.roomBounds.left + 30, this.run.roomBounds.right - 30);
      enemy.sprite.y = Phaser.Math.Clamp(enemy.sprite.y, this.run.roomBounds.top + 35, this.run.roomBounds.bottom - 35);
      this.syncEnemyView(enemy);
    }
  }

  /**
   * Dharma Protectors: a ring of shots with a gap toward you, a fan, and a
   * telegraphed charge along a marked line. At half health they call two echoes
   * to their side once, and recover a little faster. Returns whether it moved.
   */
  updateProtector(enemy: EnemyActor, angle: number, distance: number, delta: number): boolean {
    if (!enemy.phaseTwo && enemy.health <= enemy.maxHealth * 0.5) {
      enemy.phaseTwo = true;
      enemy.shieldMs = 900;
      this.run.attackDirectorMs = Math.max(this.run.attackDirectorMs, 1100);
      for (const projectile of [...this.run.projectiles]) if (projectile.hostile) this.run.removeProjectile(projectile);
      this.flashAttack(enemy, this.run.themeColor());
      this.spawnWave(2, false, 900);
      return false;
    }
    if (enemy.shieldMs > 0) return false;
    let moving = false;
    if (distance > 130) { this.moveEnemy(enemy, angle, delta); moving = true; }
    const enraged = Boolean(enemy.phaseTwo);
    if (enemy.attackMs <= 0 && this.run.attackDirectorMs <= 0) {
      enemy.attackMs = enraged ? 1500 : 1900;
      this.run.attackDirectorMs = 850;
      enemy.phase += 1;
      this.protectorVolley(enemy, angle);
    }
    if (enemy.specialMs <= 0 && this.run.attackDirectorMs <= 0) {
      enemy.specialMs = enraged ? 3600 : 4400;
      this.run.attackDirectorMs = 1300;
      this.chargeAtHero(enemy, angle);
    }
    return moving;
  }

  /** A Protector's volley: a ring with a gap toward its target, or a fan, turn about. */
  protectorVolley(enemy: EnemyActor, angle: number): void {
    const enraged = Boolean(enemy.phaseTwo);
    if (enemy.phase % 2 === 0) {
      this.telegraphEnemy(enemy, this.run.themeColor(), 50, 560, () => {
        const target = this.targetOf(enemy);
        this.spawnRingWithGap(enemy, enraged ? 11 : 9, Phaser.Math.Angle.Between(enemy.sprite.x, enemy.sprite.y, target.x, target.y), 0.7, 118, 8, 'heavy');
      });
    } else {
      this.telegraphEnemy(enemy, this.run.themeColor(), 44, 560, () => {
        for (const spread of this.fan([-0.5, -0.25, 0, 0.25, 0.5])) this.run.spawnProjectile(enemy.sprite.x, enemy.sprite.y, angle + spread, enraged ? 175 : 160, true, 1, 8, this.run.themeColor(), 'heavy');
      }, angle, 220);
    }
  }

  /** Who an enemy is attacking: in co-op the hero the server picked, otherwise you. */
  targetOf(enemy: EnemyActor): { readonly x: number; readonly y: number } {
    return enemy.coopTarget ?? this.run.hero;
  }

  /**
   * Co-op: the server says this enemy attacks now. Every screen plays the same
   * attack solo would, aimed at the enemy's target; each screen only checks hits
   * on its own hero. The server owns where enemies stand, so nothing here moves them
   * for good (lunges snap back to the server's position).
   */
  performNetworkAttack(enemy: EnemyActor, kind: 'basic' | 'special' | 'signature' | 'charge', angle: number): void {
    enemy.phase += 1;
    if (enemy.role === 'hunter') this.performHunterAttack(enemy, angle);
    else if (enemy.role === 'shooter') this.performHeavyAttack(enemy, angle);
    else if (enemy.role === 'sentinel') this.performSentinelAttack(enemy, angle);
    else if (enemy.role === 'protector') { if (kind === 'charge') this.chargeAtHero(enemy, angle); else this.protectorVolley(enemy, angle); }
    else if (kind === 'signature') this.castPhaseTwoSignature(enemy);
    else if (kind === 'special') this.bossSpecial(enemy, angle);
    else this.bossVolley(enemy, angle);
  }

  /** A charge along a line shown for 820 ms. Only the body hurts, and only once. */
  chargeAtHero(enemy: EnemyActor, angle: number): void {
    const range = 170 * this.run.roomScale;
    this.telegraphEnemy(enemy, this.run.themeColor(), enemy.radius, 820, () => {
      this.run.audioFeedback?.play('protector-charge');
      let hit = false;
      const steps = 8;
      for (let step = 1; step <= steps; step += 1) {
        this.run.time.delayedCall(step * 30, () => {
          if (!enemy.sprite.active || enemy.health <= 0 || this.run.runEnded) return;
          this.moveEnemyDistance(enemy, angle, range / steps);
          this.syncEnemyView(enemy);
          if (!hit && Phaser.Math.Distance.Between(enemy.sprite.x, enemy.sprite.y, this.run.hero.x, this.run.hero.y) < enemy.radius + 12) {
            hit = true;
            this.run.pendingHurtBy = PROTECTORS[this.run.dungeon.themeId].name;
            this.run.damagePlayer(1, enemy.sprite.x, enemy.sprite.y);
          }
        });
      }
    }, angle, range);
  }

  updateBoss(enemy: EnemyActor, angle: number, distance: number, delta: number): void {
    if (!enemy.phaseTwo && enemy.health <= enemy.maxHealth * 0.5) { this.enterBossPhaseTwo(enemy); return; }
    if (enemy.shieldMs > 0) return;
    const enraged = enemy.health <= enemy.maxHealth * 0.5;
    if (distance > 175) this.moveEnemy(enemy, angle, delta * 0.55);
    if (enemy.attackMs <= 0 && this.run.attackDirectorMs <= 0) {
      enemy.attackMs = enraged ? 1250 : 1650;
      this.run.attackDirectorMs = 950;
      enemy.phase += 1;
      this.bossVolley(enemy, angle);
    }
    if (enemy.specialMs <= 0 && this.run.attackDirectorMs <= 0 && enemy.phaseTwo && enemy.phase % 2 === 1) {
      // Second form: every other special is the warden's signature move.
      enemy.specialMs = 3000;
      this.run.attackDirectorMs = 1300;
      enemy.phase += 1;
      this.castPhaseTwoSignature(enemy);
    } else if (enemy.specialMs <= 0 && this.run.attackDirectorMs <= 0) {
      enemy.specialMs = enraged ? 2800 : 3900;
      this.run.attackDirectorMs = 800;
      if (enemy.phaseTwo) enemy.phase += 1;
      this.bossSpecial(enemy, angle);
    }
  }

  /** The warden's regular volley, in its realm's shape. */
  bossVolley(enemy: EnemyActor, angle: number): void {
    const enraged = enemy.health <= enemy.maxHealth * 0.5;
    const theme = this.run.dungeon.themeId;
    {
      this.telegraphEnemy(enemy, this.run.themeColor(), 54, enraged ? 520 : 560, () => {
        if (theme === 'sectless-temple') {
          // As with Foxfire, enrage speeds the fan up; widening it walled off the corners.
          const spreads = this.fan([-0.5, 0, 0.5]);
          for (const spread of spreads) this.run.spawnProjectile(enemy.sprite.x, enemy.sprite.y, angle + spread, enraged ? 175 : 150, true, 1, 8, this.run.themeColor(), 'boss');
        } else if (theme === 'nightfold-crypt') {
          this.spawnRingWithGap(enemy, enraged ? 11 : 8, angle, 0.68, enraged ? 150 : 126, 9, 'boss');
        } else {
          // A wider enraged fan walls off the escape along the arena edge, so enrage
          // speeds the same fan up instead of widening it.
          for (const spread of this.fan([-0.6, -0.3, 0, 0.3, 0.6])) this.run.spawnProjectile(enemy.sprite.x, enemy.sprite.y, angle + spread, enraged ? 170 : 145, true, 1, 8, this.run.themeColor(), 'boss');
        }
      }, angle, 260);
    }
  }

  /** The warden's special move for its realm. In co-op it neither blinks nor summons: the server owns both. */
  bossSpecial(enemy: EnemyActor, angle: number): void {
    const enraged = enemy.health <= enemy.maxHealth * 0.5;
    const theme = this.run.dungeon.themeId;
    const networked = Boolean(this.run.coopSnapshot);
    {
      if (theme === 'sectless-temple') {
        this.telegraphEnemy(enemy, this.run.themeColor(), 68, 520, () => {
          // The burst is turned so a gap always faces you: holding still is safe.
          const count = enraged ? 8 : 4;
          const target = this.targetOf(enemy);
          const offset = Phaser.Math.Angle.Between(enemy.sprite.x, enemy.sprite.y, target.x, target.y) + Math.PI / count;
          for (let index = 0; index < count; index += 1) {
            this.run.spawnProjectile(enemy.sprite.x, enemy.sprite.y, offset + index * Math.PI * 2 / count, enraged ? 132 : 112, true, 1, 8, this.run.themeColor(), 'boss');
          }
        });
      } else if (theme === 'nightfold-crypt') {
        // Landing too close turns the follow-up fan into a point-blank hit.
        if (!networked) {
          const destination = this.pointAwayFromHero(200);
          this.placeEnemySafely(enemy, destination.x, destination.y);
        }
        this.telegraphEnemy(enemy, this.run.themeColor(), 40, 520, () => {
          const target = this.targetOf(enemy);
          const freshAngle = Phaser.Math.Angle.Between(enemy.sprite.x, enemy.sprite.y, target.x, target.y);
          for (const spread of this.fan([-0.62, -0.31, 0, 0.31, 0.62])) this.run.spawnProjectile(enemy.sprite.x, enemy.sprite.y, freshAngle + spread, 205, true, 1, 9, this.run.themeColor(), 'boss');
        }, angle, 240);
      } else {
        // Cap summons so a long fight cannot stack adds into overlapping, undodgeable volleys.
        if (!networked && this.run.enemies.filter((other) => other.role !== 'boss').length < 2) {
          this.spawnEnemy(enemy.phase % 2 === 0 ? 'hunter' : 'shooter', enemy.sprite.x + (enemy.phase % 2 === 0 ? -72 : 72), enemy.sprite.y + 55);
        }
        this.spawnRingWithGap(enemy, enraged ? 8 : 6, angle, 0.8, 118, 8, 'boss');
      }
    }
  }

  /**
   * At half health a warden sheds its first form: a brief immune transformation,
   * the arena is cleared of shots (no unfair overlap), then a new signature move
   * joins its rotation.
   */
  enterBossPhaseTwo(enemy: EnemyActor): void {
    enemy.phaseTwo = true;
    enemy.shieldMs = 1500;
    enemy.attackMs = 1900;
    enemy.specialMs = 1700;
    enemy.phase = 1;
    this.run.attackDirectorMs = 1600;
    for (const projectile of [...this.run.projectiles]) if (projectile.hostile) this.run.removeProjectile(projectile);
    const color = this.run.themeColor();
    enemy.shadow.setFillStyle(color, 0.55);
    this.run.tweens.add({ targets: enemy.shadow, alpha: 0.35, duration: 520, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    this.run.tweens.add({ targets: enemy.sprite, scaleX: enemy.sprite.scaleX * 1.08, scaleY: enemy.sprite.scaleY * 1.08, duration: 600, ease: 'Back.Out' });
    for (let ring = 0; ring < 3; ring += 1) {
      const wave = this.run.add.circle(enemy.sprite.x, enemy.sprite.y, 20, color, 0).setStrokeStyle(3, color, 0.9).setDepth(31);
      this.run.tweens.add({ targets: wave, scale: 5, alpha: 0, delay: ring * 180, duration: 700, onComplete: () => wave.destroy() });
    }
    this.run.audioFeedback?.play('warden-roar');
    if (this.run.settings.screenShake > 0) this.run.cameras.main.shake(380, 0.006 * this.run.settings.screenShake);
    this.run.showBanner(`${ENEMY_NAMES[this.run.dungeon.themeId][3].toUpperCase()}\nSECOND FORM`);
  }

  castPhaseTwoSignature(enemy: EnemyActor): void {
    const theme = this.run.dungeon.themeId;
    if (theme === 'sectless-temple') {
      // Sword Rain: blades fall on and around you; step out of every marked circle.
      const turn = this.run.random.next() * Math.PI * 2;
      const target = this.targetOf(enemy);
      const spots = [{ x: target.x, y: target.y }, ...[0, 1, 2, 3].map((index) => ({ x: target.x + Math.cos(turn + index * Math.PI / 2) * 86, y: target.y + Math.sin(turn + index * Math.PI / 2) * 86 }))];
      this.flashAttack(enemy, this.run.themeColor());
      for (const spot of spots) {
        this.telegraphZone(spot.x, spot.y, 30, 780);
        this.run.time.delayedCall(780, () => {
          if (!enemy.sprite.active || this.run.runEnded) return;
          this.run.effectPool.spawn({ effectId: 'flying_sword_impact', x: spot.x, y: spot.y, scale: 0.42, depth: 34 });
          if (Phaser.Math.Distance.Between(this.run.hero.x, this.run.hero.y, spot.x, spot.y) < 30) this.run.damagePlayer(1, spot.x, spot.y);
        });
      }
    } else if (theme === 'nightfold-crypt') {
      // Eclipse Weave: blink away, then two rings whose gaps overlap only partly.
      if (!this.run.coopSnapshot) {
        const destination = this.pointAwayFromHero(220);
        this.placeEnemySafely(enemy, destination.x, destination.y);
      }
      const target = this.targetOf(enemy);
      const aim = Phaser.Math.Angle.Between(enemy.sprite.x, enemy.sprite.y, target.x, target.y);
      this.telegraphEnemy(enemy, this.run.themeColor(), 46, 560, () => {
        this.spawnRingWithGap(enemy, 12, aim, 0.7, 128, 8, 'boss');
        this.run.time.delayedCall(480, () => { if (enemy.sprite.active && !this.run.runEnded) this.spawnRingWithGap(enemy, 12, aim + 0.45, 0.7, 128, 8, 'boss'); });
      }, aim, 200);
    } else {
      // Nine-Tailed Spiral: three arms of foxfire wheel outward; keep circling with them.
      this.telegraphEnemy(enemy, this.run.themeColor(), 52, 520, () => {
        const start = this.run.random.next() * Math.PI * 2;
        for (let shot = 0; shot < 7; shot += 1) {
          this.run.time.delayedCall(shot * 150, () => {
            if (!enemy.sprite.active || this.run.runEnded) return;
            for (let arm = 0; arm < 3; arm += 1) this.run.spawnProjectile(enemy.sprite.x, enemy.sprite.y, start + arm * Math.PI * 2 / 3 + shot * 0.32, 112, true, 1, 7, this.run.themeColor(), 'boss');
          });
        }
      });
    }
  }

  moveEnemy(enemy: EnemyActor, angle: number, delta: number): void {
    const slowMultiplier = enemy.slowRemainingMs > 0 ? 0.75 : 1;
    const distance = enemy.speed * slowMultiplier * delta / 1000;
    this.moveEnemyDistance(enemy, angle, distance);
  }

  moveEnemyDistance(enemy: EnemyActor, angle: number, distance: number): void {
    const start = { x: enemy.sprite.x, y: enemy.sprite.y };
    const attempt = (attemptAngle: number) => moveWithCollision(
      start,
      { x: Math.cos(attemptAngle) * distance, y: Math.sin(attemptAngle) * distance },
      (x, y) => !this.isEnemySolidAt(enemy, x, y),
      2,
    );
    let movement = attempt(angle);
    if (!movement.moved && distance > 0.25) {
      // Step around pillars: try a shallow then a sharp turn, favouring one side per enemy.
      const side = (enemy.id + enemy.phase) % 2 === 0 ? 1 : -1;
      for (const turn of [Math.PI / 4, -Math.PI / 4, Math.PI / 2, -Math.PI / 2]) {
        movement = attempt(angle + side * turn);
        if (movement.moved) break;
      }
    }
    enemy.sprite.setPosition(movement.x, movement.y);
  }

  performHunterAttack(enemy: EnemyActor, angle: number): void {
    const { x: targetX, y: targetY } = this.targetOf(enemy);
    // Windup and hit radii are sized so the slowest hero can step clear after a
    // normal reaction time, even when the hunter attacks from point-blank range.
    const windupMs = 620;
    if (this.run.dungeon.themeId === 'sectless-temple') this.telegraphZone(enemy.sprite.x + Math.cos(angle) * 58, enemy.sprite.y + Math.sin(angle) * 58, 40, windupMs);
    else if (this.run.dungeon.themeId === 'nightfold-crypt') this.telegraphZone(targetX, targetY, 30, windupMs);
    this.telegraphEnemy(enemy, this.run.themeColor(), 24, windupMs, () => {
      if (this.run.dungeon.themeId === 'sectless-temple') {
        this.moveEnemyDistance(enemy, angle, 58);
        if (Phaser.Math.Distance.Between(enemy.sprite.x, enemy.sprite.y, this.run.hero.x, this.run.hero.y) < 40) this.run.damagePlayer(1);
      } else if (this.run.dungeon.themeId === 'nightfold-crypt') {
        this.placeEnemySafely(enemy, targetX - Math.cos(angle) * 34, targetY - Math.sin(angle) * 34);
        if (Phaser.Math.Distance.Between(targetX, targetY, this.run.hero.x, this.run.hero.y) < 30) this.run.damagePlayer(1);
      } else {
        // Hop back first so the fan never starts point-blank.
        this.moveEnemyDistance(enemy, angle + Math.PI, 36);
        for (const spread of this.fan([-0.45, 0, 0.45])) this.run.spawnProjectile(enemy.sprite.x, enemy.sprite.y, angle + spread, 180, true, 1, 7, this.run.themeColor(), 'hunter');
      }
    }, angle, Math.min(230, Phaser.Math.Distance.Between(enemy.sprite.x, enemy.sprite.y, targetX, targetY)));
  }

  performHeavyAttack(enemy: EnemyActor, angle: number): void {
    this.telegraphEnemy(enemy, this.run.themeColor(), 58, 560, () => {
      if (this.run.dungeon.themeId === 'sectless-temple') {
        // The slam hits exactly what its 58 px warning circle covers.
        if (Phaser.Math.Distance.Between(enemy.sprite.x, enemy.sprite.y, this.run.hero.x, this.run.hero.y) < 58) this.run.damagePlayer(1);
        for (let index = 0; index < 4; index += 1) this.run.spawnProjectile(enemy.sprite.x, enemy.sprite.y, index * Math.PI / 2, 92, true, 1, 6, this.run.themeColor(), 'heavy');
      } else if (this.run.dungeon.themeId === 'nightfold-crypt') {
        for (const spread of this.fan([-0.5, 0, 0.5])) this.run.spawnProjectile(enemy.sprite.x, enemy.sprite.y, angle + spread, 165, true, 1, 8, this.run.themeColor(), 'heavy');
      } else {
        for (const spread of this.fan([-0.52, 0, 0.52])) this.run.spawnProjectile(enemy.sprite.x, enemy.sprite.y, angle + spread, 205, true, 1, 7, this.run.themeColor(), 'heavy');
      }
    }, angle, 210);
  }

  performSentinelAttack(enemy: EnemyActor, angle: number): void {
    this.telegraphEnemy(enemy, this.run.themeColor(), 34, 520, () => {
      if (this.run.dungeon.themeId === 'sectless-temple') {
        for (const spread of this.fan([-0.5, 0, 0.5])) this.run.spawnProjectile(enemy.sprite.x, enemy.sprite.y, angle + spread, 205, true, 1, 7, this.run.themeColor(), 'sentinel');
      } else if (this.run.dungeon.themeId === 'nightfold-crypt') {
        this.spawnRingWithGap(enemy, 7, angle, 0.65, 125, 7, 'sentinel');
      } else {
        this.spawnRingWithGap(enemy, 6, angle, 0.62, 145, 7, 'sentinel');
      }
    }, angle, 230);
  }

  spawnRingWithGap(enemy: EnemyActor, count: number, gapAngle: number, gapHalfWidth: number, speed: number, radius: number, style: CombatProjectile['style']): void {
    const offset = enemy.phase * 0.19;
    for (const shotAngle of ringAnglesWithGap(count, offset, gapAngle, gapHalfWidth)) {
      this.run.spawnProjectile(enemy.sprite.x, enemy.sprite.y, shotAngle, speed, true, 1, radius, this.run.themeColor(), style);
    }
  }

  /** Ground marker for strikes that land away from the attacker, so the danger zone is readable. */
  telegraphZone(x: number, y: number, radius: number, delayMs: number): void {
    const zone = this.run.add.graphics().setDepth(29);
    this.run.roomTransients.add(zone);
    drawWarningCircle(zone, x, y, radius, this.run.themeColor(), this.run.settings.accessibleWarnings);
    this.run.time.delayedCall(delayMs, () => {
      this.run.roomTransients.delete(zone);
      zone.destroy();
    });
  }

  /** A random boss-legal floor point at least minDistance from the hero, or the farthest one sampled. */
  pointAwayFromHero(minDistance: number): { x: number; y: number } {
    let best = { x: this.run.roomBounds.centerX, y: this.run.roomBounds.centerY };
    let bestDistance = -1;
    for (let attempt = 0; attempt < 24; attempt += 1) {
      const x = this.run.random.integer(Math.round(this.run.floorBounds.left), Math.round(this.run.floorBounds.right));
      const y = this.run.random.integer(Math.round(this.run.floorBounds.top - 20 * this.run.roomScale), Math.round(this.run.floorBounds.bottom));
      const distance = Phaser.Math.Distance.Between(x, y, this.run.hero.x, this.run.hero.y);
      if (distance >= minDistance) return { x, y };
      if (distance > bestDistance) { best = { x, y }; bestDistance = distance; }
    }
    return best;
  }

  telegraphEnemy(enemy: EnemyActor, color: number, radius: number, delayMs: number, resolve: () => void, aimAngle?: number, range = 190): void {
    this.flashAttack(enemy, color);
    this.run.audioFeedback?.play('enemy-telegraph', isBig(enemy) ? 0.9 : 0.55);
    const warning = this.run.add.graphics().setDepth(29);
    this.run.roomTransients.add(warning);
    const accessible = this.run.settings.accessibleWarnings;
    drawWarningCircle(warning, enemy.sprite.x, enemy.sprite.y, radius, color, accessible, { fillAlpha: 0.08 });
    if (aimAngle !== undefined) drawWarningLine(warning, enemy.sprite.x, enemy.sprite.y, aimAngle, range, color, accessible);
    // The accessible style stays fully visible until it resolves.
    this.run.tweens.add({ targets: warning, alpha: accessible ? 0.85 : 0.35, duration: delayMs });
    this.run.time.delayedCall(delayMs, () => {
      this.run.roomTransients.delete(warning);
      warning.destroy();
      if (enemy.sprite.active && enemy.health > 0) resolve();
    });
  }

  /** A Sundering elite falls apart into smaller, ordinary copies that wait a moment before acting. */
  sunder(enemy: EnemyActor, x: number, y: number): void {
    for (let index = 0; index < SUNDER_COUNT; index += 1) {
      const angle = Phaser.Math.Angle.Between(this.run.hero.x, this.run.hero.y, x, y) + (index === 0 ? -0.9 : 0.9);
      const child = this.spawnEnemy(enemy.role, x + Math.cos(angle) * 30, y + Math.sin(angle) * 30);
      child.maxHealth = Math.max(1, Math.round(child.maxHealth * SUNDER_HEALTH));
      child.health = child.maxHealth;
      child.sprite.setScale(child.sprite.scaleX * 0.82);
      child.footOffset *= 0.82;
      child.headOffset *= 0.82;
      child.attackMs += 1000;
      child.specialMs += 1000;
      this.spawnArrival(child);
    }
  }

  isEnemySolidAt(enemy: EnemyActor, x: number, y: number): boolean {
    const boss = isBig(enemy);
    const halfHeight = boss ? 10 : 6;
    // Keep the whole body on the floor, not just the feet: a big sprite whose
    // feet fit could still stand with its body sunk into the back or side walls.
    const floorTop = this.run.roomBounds.top + this.run.wallBand;
    if (y - enemy.headOffset < floorTop - 26) return true;
    if (x - enemy.radius < this.run.roomBounds.left + this.run.wallBand - 6 || x + enemy.radius > this.run.roomBounds.right - this.run.wallBand + 6) return true;
    // Collide at the drawn feet so sprites never stand inside the front wall.
    return this.run.isFootprintSolidAt(x, y + enemy.footOffset - halfHeight, enemy.role === 'boss' ? 24 : enemy.role === 'protector' ? 20 : 13, halfHeight);
  }

  placeEnemySafely(enemy: EnemyActor, desiredX: number, desiredY: number): void {
    const boundedX = Phaser.Math.Clamp(desiredX, this.run.roomBounds.left + 32, this.run.roomBounds.right - 32);
    const boundedY = Phaser.Math.Clamp(desiredY, this.run.roomBounds.top + 38, this.run.roomBounds.bottom - 38);
    if (!this.isEnemySolidAt(enemy, boundedX, boundedY)) {
      enemy.sprite.setPosition(boundedX, boundedY);
      return;
    }
    for (let radius = 12; radius <= 128; radius += 12) {
      for (let index = 0; index < 16; index += 1) {
        const angle = index * Math.PI / 8;
        const x = Phaser.Math.Clamp(boundedX + Math.cos(angle) * radius, this.run.roomBounds.left + 32, this.run.roomBounds.right - 32);
        const y = Phaser.Math.Clamp(boundedY + Math.sin(angle) * radius, this.run.roomBounds.top + 38, this.run.roomBounds.bottom - 38);
        if (!this.isEnemySolidAt(enemy, x, y)) {
          enemy.sprite.setPosition(x, y);
          return;
        }
      }
    }
  }

  drawEnemyHealth(enemy: EnemyActor): void {
    if (enemy.dummy) return;
    const width = enemy.role === 'boss' ? 120 : enemy.role === 'protector' ? 84 : enemy.elite ? 50 : 42;
    const x = enemy.sprite.x - width / 2;
    const y = enemy.sprite.y - enemy.headOffset - 10;
    const g = enemy.healthBar.clear();
    g.fillStyle(0x13090b, 0.9).fillRoundedRect(x, y, width, 6, 3).fillStyle(isBig(enemy) ? 0xd14355 : 0xc4525f, 1).fillRoundedRect(x + 1, y + 1, (width - 2) * enemy.health / enemy.maxHealth, 4, 2);
    if (!enemy.elite) return;
    const affix = ELITE_AFFIXES[enemy.elite];
    g.lineStyle(1, 0xf0d48a, 0.95).strokeRoundedRect(x - 0.5, y - 0.5, width + 1, 7, 3);
    if (enemy.ward && enemy.wardMax) g.fillStyle(affix.color, 0.95).fillRect(x + 1, y - 3, (width - 2) * enemy.ward / enemy.wardMax, 2);
    // Each affix has its own glyph left of the bar, so it reads without colour.
    const mx = x - 7;
    const my = y + 3;
    g.fillStyle(0x06100d, 1).fillCircle(mx, my, 5.5);
    g.fillStyle(affix.color, 1).lineStyle(1.5, affix.color, 1);
    if (affix.marker === 'ring') g.strokeCircle(mx, my, 3.2);
    else if (affix.marker === 'chevron') { g.lineBetween(mx - 3, my + 1, mx, my - 2); g.lineBetween(mx, my - 2, mx + 3, my + 1); g.lineBetween(mx - 3, my + 3.5, mx, my + 0.5); g.lineBetween(mx, my + 0.5, mx + 3, my + 3.5); }
    else if (affix.marker === 'split') { g.fillTriangle(mx - 3.5, my, mx - 0.6, my - 3.5, mx - 0.6, my + 3.5); g.fillTriangle(mx + 3.5, my, mx + 0.6, my - 3.5, mx + 0.6, my + 3.5); }
    else g.fillTriangle(mx, my - 4, mx + 3, my + 3, mx - 3, my + 3);
  }

  flashAttack(enemy: EnemyActor, color: number): void {
    // Face the target before the attack locks the facing for its duration.
    enemy.facingHoldMs = 0;
    this.faceEnemyToward(enemy, this.run.hero.x, 0);
    enemy.sprite.play(enemyAnimationKey(this.run.dungeon.themeId, enemy.column, 'attack'), true);
    enemy.sprite.setTint(color);
    this.run.time.delayedCall(120, () => enemy.sprite.active && enemy.sprite.clearTint());
    const ring = this.run.add.circle(enemy.sprite.x, enemy.sprite.y, enemy.radius + 12, color, 0).setStrokeStyle(3, color, 0.8).setDepth(31);
    this.run.tweens.add({ targets: ring, scale: 1.6, alpha: 0, duration: 280, onComplete: () => ring.destroy() });
  }
}
