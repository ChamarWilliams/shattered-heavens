import Phaser from 'phaser';
import type { CoopEnemySnapshot, CoopPlayerSnapshot, CoopRoomSnapshot } from '../../coop/protocol';
import type { EnemyActor } from './runShared';
import { ENTRY_POINTS, REVIVE_DISTANCE, REVIVE_DURATION_MS, coopRoomLayout, type CoopRoomLayout } from '../../coop/simulation';
import { PROTECTORS } from '../../domain/specialRooms';
import { unlockHeroForRealm } from '../../domain/heroUnlocks';
import { PROTECTOR_TITLE } from '../../domain/lexicon';
import { SCORCH } from '../../domain/elites';
import type { DungeonRunScene } from '../DungeonRunScene';
import { music } from '../music';
import { drawWarningCircle } from '../warningMarkers';
import { DUNGEON_THEMES } from '../../dungeon';
import { HERO_UNLOCK_NAMES, PORTAL_POINT, REALM_MUSIC, enemyAnimationKey } from './runShared';

/**
 * The browser side of co-op. The server (coop/simulation.ts) owns the shared
 * room; this mirrors it: the same generated rooms, cover, traps on the shared
 * clock, enemies with their elite marks and forms, burning ground, the Bell of
 * Trials and the echo. Chests, the Peddler and the Altar stay personal, and what
 * they change (hearts, power, speed) is reported back in the player's input.
 */
export class CoopRun {
  private seed?: number;
  private layout?: CoopRoomLayout;
  private clockBase = 0;
  private clockAt = 0;
  private wasCleared = true;
  private trialState?: string;
  private readonly secondForms = new Set<string>();
  private burnGraphics?: Phaser.GameObjects.Graphics;
  private finished = false;
  /** The last attack number seen per enemy, so each attack plays once on this screen. */
  private readonly attackSeqs = new Map<string, number>();
  /** Loot totals resume from the server once per page (after a reload mid-run). */
  private totalsResumed = false;
  private reviveGraphics?: Phaser.GameObjects.Graphics;
  private readonly reviveLabels: Phaser.GameObjects.Text[] = [];
  /** Running totals reported to the server; it applies only what is new. */
  healTotal = 0;
  maxHealthTotal = 0;
  /** Hearts enemy attacks took on this screen (reported; the server applies them). */
  hurtTotal = 0;

  constructor(private readonly run: DungeonRunScene) {}

  /** The scene object outlives each run: start every run (and its graphics) fresh. Loot totals keep counting. */
  reset(): void {
    this.seed = undefined;
    this.layout = undefined;
    this.wasCleared = true;
    this.trialState = undefined;
    this.secondForms.clear();
    this.burnGraphics = undefined;
    this.reviveGraphics = undefined;
    this.reviveLabels.length = 0;
    this.attackSeqs.clear();
    this.finished = false;
  }

  /** The fallen ally close enough for this player to revive, if any (the server's own test). */
  reviveTarget(): CoopPlayerSnapshot | undefined {
    const snapshot = this.run.coopSnapshot;
    const me = this.run.coopClient?.currentMembership?.playerId;
    const local = snapshot?.players.find((player) => player.id === me);
    if (!snapshot || !local || local.downed) return undefined;
    return snapshot.players.find((player) => player.id !== me && player.downed && Math.hypot(player.x - local.x, player.y - local.y) <= REVIVE_DISTANCE);
  }

  /** What a fallen player is told instead of the room objective. */
  downedMessage(): string | undefined {
    const snapshot = this.run.coopSnapshot;
    const me = this.run.coopClient?.currentMembership?.playerId;
    const local = snapshot?.players.find((player) => player.id === me);
    if (!snapshot || !local?.downed || snapshot.completed) return undefined;
    if (local.reviveProgressMs > 0) return 'You are down · being revived…';
    const allies = snapshot.players.filter((player) => player.id !== me && !player.downed).map((player) => player.name);
    return allies.length > 0 ? `You are down · hold on for ${allies.join(' or ')} to revive you` : 'You are down';
  }

  /** Rings and labels over fallen wanderers: who is down, who can be revived, and how far along it is. */
  private drawRevives(snapshot: CoopRoomSnapshot): void {
    const run = this.run;
    const me = run.coopClient?.currentMembership?.playerId;
    const graphics = (this.reviveGraphics ??= run.add.graphics().setDepth(58));
    graphics.clear();
    const target = this.reviveTarget();
    const key = document.documentElement.dataset.inputMode === 'touch' ? 'USE' : 'F';
    let used = 0;
    for (const player of snapshot.players) {
      if (!player.downed || snapshot.completed) continue;
      const mine = player.id === me;
      const view = mine ? run.hero : run.remoteHeroes.get(player.id)?.view;
      if (!view) continue;
      const x = view.x;
      const y = view.y + 14;
      const progress = Phaser.Math.Clamp(player.reviveProgressMs / REVIVE_DURATION_MS, 0, 1);
      const reachable = target?.id === player.id;
      graphics.lineStyle(3, 0x05080a, 0.6).strokeCircle(x, y, 22);
      graphics.lineStyle(1, reachable ? 0x9df5c8 : 0xe0c27a, 0.8).strokeCircle(x, y, 22);
      if (progress > 0) {
        graphics.lineStyle(4, 0x7fe9b4, 1).beginPath();
        graphics.arc(x, y, 22, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2, false);
        graphics.strokePath();
      }
      if (mine) continue;
      const label = (this.reviveLabels[used] ??= run.add.text(0, 0, '', {
        fontFamily: 'monospace', fontSize: '8px', color: '#fff3cf', backgroundColor: '#06100ddd', padding: { x: 6, y: 3 }, align: 'center',
      }).setOrigin(0.5, 1).setDepth(61).setResolution(2));
      const name = player.name.toUpperCase();
      label.setText(reachable ? `HOLD ${key} TO REVIVE ${name}` : `${name} IS DOWN`)
        .setColor(reachable ? '#c9ffe4' : '#fff3cf')
        .setPosition(x, view.y - 42).setScale(run.settings.textScale).setVisible(true);
      used += 1;
    }
    for (let index = used; index < this.reviveLabels.length; index += 1) this.reviveLabels[index].setVisible(false);
  }

  /** Applies a snapshot from the server. */
  onSnapshot(snapshot: CoopRoomSnapshot): void {
    const run = this.run;
    run.coopSnapshot = snapshot;
    if (this.seed !== snapshot.seed) {
      this.seed = snapshot.seed;
      run.prepareDungeonLayouts(snapshot.seed);
      run.coopRoomId = undefined;
      this.loadFloor(snapshot);
    } else if (snapshot.themeIndex !== run.themeIndex) {
      this.loadFloor(snapshot);
    }
    if (run.coopRoomId !== snapshot.roomId) this.enterRoom(snapshot);
    this.syncLocalPlayer(snapshot);
    for (const id of snapshot.cleared) run.clearedRooms.add(id);
    this.clockBase = snapshot.roomClockMs;
    this.clockAt = run.time.now;
    run.features.syncBrokenUrns(snapshot.brokenUrns);
    this.syncEnemies(snapshot);
    this.syncTrial(snapshot);
    if (!this.wasCleared && snapshot.roomCleared) this.onRoomCleared(snapshot);
    this.wasCleared = snapshot.roomCleared;
    if (snapshot.portalOpen && !run.bossPortal) run.createBossPortal();
    if (snapshot.completed) this.finish(snapshot);
    run.ensureRemoteHero(snapshot);
  }

  /** Per frame: interpolate enemies and draw what the server says is dangerous. */
  update(): void {
    const run = this.run;
    const snapshot = run.coopSnapshot;
    if (!snapshot) return;
    const accessible = run.settings.accessibleWarnings;
    this.burnGraphics ??= run.add.graphics().setDepth(7);
    this.burnGraphics.clear();
    const frameDelta = run.game.loop.delta;
    for (const networkEnemy of snapshot.enemies) {
      const enemy = run.enemies.find((candidate) => candidate.networkId === networkEnemy.id);
      if (!enemy) continue;
      // Burns this player set (Moonfire and the like) tick here and are reported as hits.
      if (enemy.burnMs > 0 && enemy.health > 0) {
        enemy.burnMs -= frameDelta;
        enemy.burnTickMs -= frameDelta;
        if (enemy.burnTickMs <= 0) { enemy.burnTickMs = 400; run.damageEnemy(enemy, enemy.burnDamage ?? 4); }
      }
      const previousX = enemy.sprite.x;
      const previousY = enemy.sprite.y;
      enemy.sprite.x = Phaser.Math.Linear(enemy.sprite.x, networkEnemy.x, 0.24);
      enemy.sprite.y = Phaser.Math.Linear(enemy.sprite.y, networkEnemy.y, 0.24);
      // Start the attack animation once per windup instead of every frame.
      if (networkEnemy.attackPhase === 'windup' && enemy.lastNetworkAttackPhase !== 'windup') {
        enemy.sprite.play(enemyAnimationKey(run.dungeon.themeId, enemy.column, 'attack'));
      }
      enemy.lastNetworkAttackPhase = networkEnemy.attackPhase;
      run.enemyAI.faceEnemyToward(enemy, run.nearestHeroX(enemy), frameDelta);
      run.enemyAI.playEnemyLocomotion(enemy, Phaser.Math.Distance.Between(previousX, previousY, enemy.sprite.x, enemy.sprite.y) > 0.2, frameDelta);
      run.enemyAI.syncEnemyView(enemy);
    }
    for (const burn of snapshot.burns) {
      if (burn.armed && !accessible) {
        this.burnGraphics.fillStyle(0xff7a3c, 0.42).fillCircle(burn.x, burn.y, SCORCH.radius);
        this.burnGraphics.fillStyle(0xffd27a, 0.5).fillCircle(burn.x, burn.y, SCORCH.radius * 0.5);
      } else {
        drawWarningCircle(this.burnGraphics, burn.x, burn.y, SCORCH.radius, run.themeColor(), accessible, { dashed: !burn.armed, cross: burn.armed, fillAlpha: 0.3 });
      }
    }
    this.drawRevives(snapshot);
    if (this.layout) run.trapSystem.renderShared(this.clockBase + (run.time.now - this.clockAt), this.layout.traps, snapshot.pits);
  }

  /** What this player sends with every sync. */
  sendInput(moveX: number, moveY: number, aimRadians: number, revive: boolean, interact: boolean): void {
    const run = this.run;
    const passive = run.moonfireSystem?.snapshot().movementSpeedMultiplier ?? 1;
    run.coopClient?.updateInput(moveX, moveY, aimRadians, revive, interact, {
      power: run.power * run.loadout.basicDamageMultiplier * (1 + run.heroMods.basicDamage),
      speed: passive * run.loadout.moveSpeedMultiplier * run.blessingSpeed * (1 + run.heroMods.moveSpeed),
      healTotal: this.healTotal,
      maxHealthTotal: this.maxHealthTotal,
      hurtTotal: this.hurtTotal,
    });
  }

  /** The Bell of Trials is shared: ask the server to ring it. */
  ringBell(): void {
    this.run.coopClient?.use();
  }

  reportHurt(amount: number): void { this.hurtTotal += Math.max(0, Math.round(amount)); }
  reportHeal(amount: number): void { this.healTotal += Math.max(0, Math.round(amount)); }
  reportMaxHealth(delta: number): void { this.maxHealthTotal += Math.round(delta); }

  private loadFloor(snapshot: CoopRoomSnapshot): void {
    this.run.startTheme(snapshot.themeIndex, false);
    this.secondForms.clear();
    this.run.showBanner(`${DUNGEON_THEMES[this.run.dungeon.themeId].name}\nSHARED EXPEDITION  •  ${snapshot.themeIndex + 1} / ${snapshot.themeOrder.length}`);
  }

  private enterRoom(snapshot: CoopRoomSnapshot): void {
    const run = this.run;
    const room = run.dungeon.rooms.find((candidate) => candidate.id === snapshot.roomId);
    if (!room) return;
    run.clearRoomObjects();
    run.currentRoom = room;
    run.coopRoomId = room.id;
    run.visitedRooms.add(room.id);
    run.drawRoom(room);
    const feature = run.roomFeatures.get(room.id);
    this.layout = coopRoomLayout(snapshot.seed, room, feature, snapshot.entrySide, snapshot.themeIndex);
    const grid = { originX: run.roomBounds.x, originY: run.roomBounds.y, tile: run.tileSize, columns: 19, rows: 13 };
    run.features.spawnCover(run.dungeon.themeId, this.layout.cover, grid);
    run.trapSystem.place(this.layout.traps, run.tileSize);
    // Peddler, Altar and vault chests are personal; the Bell is shared but drawn here too.
    if (feature && feature !== 'protector') run.featureRooms.setUpFeatureRoom(room, feature);
    const local = snapshot.players.find((player) => player.id === run.coopClient?.currentMembership?.playerId);
    const spot = local ?? ENTRY_POINTS[snapshot.entrySide];
    run.hero.setPosition(spot.x, spot.y);
    run.transitionLockedMs = 250;
    this.wasCleared = snapshot.roomCleared;
    this.trialState = snapshot.trial?.state;
    if (snapshot.trial?.state === 'done') run.features.silenceBell();
    if (!snapshot.roomCleared) run.audioFeedback?.play('door-seal');
    music.setTrack(room.kind === 'boss' && !snapshot.roomCleared ? 'warden' : feature === 'protector' && !snapshot.roomCleared ? 'protector' : REALM_MUSIC[run.dungeon.themeId]);
    if (feature === 'protector' && !snapshot.roomCleared) run.showBanner(`${PROTECTOR_TITLE.toUpperCase()}\n${PROTECTORS[run.dungeon.themeId].name.toUpperCase()}`);
  }

  private syncLocalPlayer(snapshot: CoopRoomSnapshot): void {
    const run = this.run;
    const local = snapshot.players.find((player) => player.id === run.coopClient?.currentMembership?.playerId);
    if (!local) return;
    if (!this.totalsResumed) {
      // A fresh page (a reload mid-run) carries on from what the server already counted.
      this.totalsResumed = true;
      this.healTotal = Math.max(this.healTotal, local.loot.heal);
      this.hurtTotal = Math.max(this.hurtTotal, local.loot.hurt);
      if (this.maxHealthTotal === 0) this.maxHealthTotal = local.loot.maxHealth;
    }
    // Hurt this screen already showed but the server has not counted yet stays shown (prediction).
    const pendingHurt = Math.max(0, this.hurtTotal - local.loot.hurt);
    const shown = local.downed ? 0 : Math.max(0, local.health - pendingHurt);
    // Feedback for damage that came from the server's side (traps, burning ground).
    if (shown < run.health && !local.downed && run.invulnerableMs <= 0) {
      run.audioFeedback?.play('hurt');
      run.actor.hurt(1);
      run.invulnerableMs = 700;
    }
    run.health = shown;
    run.maxHealth = local.maxHealth;
    const error = Phaser.Math.Distance.Between(run.hero.x, run.hero.y, local.x, local.y);
    const blend = error > 96 ? 1 : 0.28;
    run.hero.setPosition(Phaser.Math.Linear(run.hero.x, local.x, blend), Phaser.Math.Linear(run.hero.y, local.y, blend));
    if (local.downed && run.actor.snapshot().state !== 'death') run.actor.kill();
    if (!local.downed && run.actor.snapshot().state === 'death') run.actor.reset();
  }

  private syncEnemies(snapshot: CoopRoomSnapshot): void {
    const run = this.run;
    const active = new Set(snapshot.enemies.map((enemy) => enemy.id));
    for (const enemy of [...run.enemies]) {
      if (!enemy.networkId || active.has(enemy.networkId)) continue;
      run.enemies.splice(run.enemies.indexOf(enemy), 1);
      run.audioFeedback?.play(enemy.elite || enemy.role === 'protector' || enemy.role === 'boss' ? 'elite-death' : 'enemy-death');
      const burst = run.add.circle(enemy.sprite.x, enemy.sprite.y, 30, run.themeColor(), 0.7).setDepth(33);
      run.tweens.add({ targets: burst, alpha: 0, scale: 1.8, duration: 380, onComplete: () => burst.destroy() });
      enemy.sprite.destroy(); enemy.shadow.destroy(); enemy.healthBar.destroy();
    }
    for (const networkEnemy of snapshot.enemies) {
      let enemy = run.enemies.find((candidate) => candidate.networkId === networkEnemy.id);
      if (!enemy) {
        enemy = run.enemyAI.spawnEnemy(networkEnemy.role, networkEnemy.x, networkEnemy.y);
        enemy.networkId = networkEnemy.id;
        if (networkEnemy.elite) run.enemyAI.makeElite(enemy, networkEnemy.elite);
        if (networkEnemy.small) {
          enemy.sprite.setScale(enemy.sprite.scaleX * 0.82);
          enemy.footOffset *= 0.82;
          enemy.headOffset *= 0.82;
        }
      }
      // Prediction: hits this screen already landed count at once, before the server confirms them.
      const pending = run.coopClient?.pendingDamage(networkEnemy.id) ?? 0;
      const soaked = Math.min(networkEnemy.ward ?? 0, pending);
      enemy.health = Math.max(0, networkEnemy.health - (pending - soaked));
      enemy.maxHealth = networkEnemy.maxHealth;
      enemy.ward = Math.max(0, (networkEnemy.ward ?? 0) - soaked);
      enemy.wardMax = networkEnemy.wardMax;
      enemy.shieldMs = networkEnemy.shielded ? 250 : 0;
      enemy.sprite.setAlpha(enemy.health > 0 ? 1 : 0.45);
      this.playNetworkAttack(enemy, networkEnemy);
      if (networkEnemy.phaseTwo && !this.secondForms.has(networkEnemy.id)) {
        this.secondForms.add(networkEnemy.id);
        if (networkEnemy.role === 'boss') run.enemyAI.enterBossPhaseTwo(enemy);
        else run.enemyAI.flashAttack(enemy, run.themeColor());
      }
    }
  }

  /** Plays each attack the server announces, once, aimed at the hero it targets. */
  private playNetworkAttack(enemy: EnemyActor, networkEnemy: CoopEnemySnapshot): void {
    const attack = networkEnemy.attack;
    if (!attack) return;
    const seen = this.attackSeqs.get(networkEnemy.id);
    this.attackSeqs.set(networkEnemy.id, attack.seq);
    const fresh = seen === undefined ? networkEnemy.attackPhase === 'windup' : attack.seq > seen;
    if (!fresh || networkEnemy.shielded || enemy.health <= 0 || this.run.runEnded) return;
    const target = this.heroView(networkEnemy.targetPlayerId);
    enemy.coopTarget = target;
    this.run.enemyAI.performNetworkAttack(enemy, attack.kind, Phaser.Math.Angle.Between(enemy.sprite.x, enemy.sprite.y, target.x, target.y));
  }

  /** Where a party member stands on this screen: you, or the ally's figure. */
  private heroView(playerId?: string): { readonly x: number; readonly y: number } {
    const run = this.run;
    if (!playerId || playerId === run.coopClient?.currentMembership?.playerId) return run.hero;
    return run.remoteHeroes.get(playerId)?.view ?? run.hero;
  }

  private syncTrial(snapshot: CoopRoomSnapshot): void {
    const state = snapshot.trial?.state;
    if (state === this.trialState) return;
    if (state === 'running') {
      this.run.features.ringBell();
      this.run.audioFeedback?.play('bell-toll');
      this.run.showBanner('THE BELL TOLLS\nENDURE THREE WAVES');
      music.setTrack('trial');
    }
    this.trialState = state;
  }

  /** A room the party sealed: everyone gets their own chest. */
  private onRoomCleared(snapshot: CoopRoomSnapshot): void {
    const run = this.run;
    const room = run.currentRoom;
    const feature = run.roomFeatures.get(room.id);
    const center = { x: run.roomBounds.centerX, y: run.roomBounds.centerY + 10 };
    if (room.kind === 'boss') {
      run.loot.spawnChest('warden', center.x, PORTAL_POINT.y + 65, run.rollChestItems('warden'));
      const unlocked = unlockHeroForRealm(run.dungeon.themeId);
      run.showBanner(`REALM WARDEN DEFEATED${unlocked ? `\n\n${HERO_UNLOCK_NAMES[unlocked]} UNLOCKED` : ''}`);
      // The warden's reward, once: more power and a heart, full hearts on the server.
      run.power += 0.25;
      this.reportMaxHealth(1);
      this.reportHeal(20);
      music.sting('sting-victory');
    } else if (feature === 'protector') {
      run.loot.spawnChest('warden', center.x, center.y, [...run.rollChestItems('room', 1), 'echo-shard']);
      run.showBanner(`${PROTECTORS[run.dungeon.themeId].name.toUpperCase()}\nFALLS`);
    } else if (feature === 'trial' && snapshot.trial?.state === 'done') {
      run.loot.spawnChest('warden', center.x, center.y, [...run.rollChestItems('room', 1), 'echo-shard', 'echo-shard']);
      run.features.silenceBell();
      run.showBanner('TRIAL ENDURED');
    } else {
      run.loot.spawnChest('room', center.x, center.y, run.rollChestItems('room'));
      run.showBanner('ROOM CLEARED');
    }
    run.audioFeedback?.play('room-clear');
    music.setTrack(REALM_MUSIC[run.dungeon.themeId]);
  }

  private finish(snapshot: CoopRoomSnapshot): void {
    if (this.finished) return;
    this.finished = true;
    if (snapshot.failed) { this.run.endRun(false); return; }
    this.run.showBanner('EXPEDITION COMPLETE');
    music.sting('sting-victory');
    this.run.time.delayedCall(3500, () => this.run.returnToHall());
  }
}
