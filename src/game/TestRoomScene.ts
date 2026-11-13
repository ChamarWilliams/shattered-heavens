import Phaser from 'phaser';
import { heroFrameCount, type PackHeroId } from '../assets/gameplayManifest';
import { direction8FromVector } from '../characters/directions';
import { facingForRenderedState } from '../characters/renderFacing';
import { characters, getCharacter } from '../characters/registry';
import type { CharacterConfig, CharacterState } from '../characters/types';
import { CharacterActor } from '../domain/CharacterActor';
import { FoxfireSummonSystem } from '../domain/FoxfireSummonSystem';
import { FlyingSwordSystem, type FlyingSwordConfig, type ProjectileHit } from '../domain/FlyingSwordSystem';
import { MoonfireStackSystem } from '../domain/MoonfireStackSystem';
import { SectlessSealSystem, type SectlessDetonation } from '../domain/SectlessSealSystem';
import { ShadowDashSystem } from '../domain/ShadowDashSystem';
import { ShadowEchoSystem } from '../domain/ShadowEchoSystem';
import { CharacterView } from './CharacterView';
import { CultivatorSwordArrayView } from './CultivatorSwordArrayView';
import { FoxfireSummonView } from './FoxfireSummonView';
import { FlyingSwordView } from './FlyingSwordView';
import { MoonfireStackView } from './MoonfireStackView';
import { SectlessSealView } from './SectlessSealView';
import { ShadowEchoView } from './ShadowEchoView';
import { TransientEffectPool } from './TransientEffectPool';
import { gameEvents } from './events';
import { installEffectAnimations, preloadGameplayAssets } from './gameplayAssetLoader';
import { installCharacterTexture, preloadCharacter } from './installCharacterTextures';

type ActionType = 'attack' | 'ability';
interface PendingAction { type: ActionType; eventName: string; castId: string; aimRadians: number; released: boolean }
interface TargetDummy {
  id: string; x: number; y: number; radius: number; health: number; slowRemainingMs: number;
  ring?: Phaser.GameObjects.Arc; label?: Phaser.GameObjects.Text;
}
const ROOM = { left: 36, right: 664, top: 36, bottom: 434 } as const;
const FOX_BOUNDS = { left: ROOM.left + 58, right: ROOM.right - 58, top: ROOM.top + 58, bottom: ROOM.bottom - 58 } as const;

export class TestRoomScene extends Phaser.Scene {
  private config: CharacterConfig = getCharacter('li-yunfeng');
  private actor = new CharacterActor(this.config);
  private view!: CharacterView;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keys!: Record<'W' | 'A' | 'S' | 'D' | 'E' | 'H' | 'K' | 'R' | 'B', Phaser.Input.Keyboard.Key>;
  private projectileSystem?: FlyingSwordSystem;
  private projectileView?: FlyingSwordView;
  private cultivatorSwordView?: CultivatorSwordArrayView;
  private basicProjectileSystem?: FlyingSwordSystem;
  private basicProjectileView?: FlyingSwordView;
  private summonProjectileSystem?: FlyingSwordSystem;
  private summonProjectileView?: FlyingSwordView;
  private summonSystem?: FoxfireSummonSystem;
  private summonView?: FoxfireSummonView;
  private moonfireSystem?: MoonfireStackSystem;
  private moonfireView?: MoonfireStackView;
  private sealSystem?: SectlessSealSystem;
  private sealView?: SectlessSealView;
  private dashSystem?: ShadowDashSystem;
  private echoSystem?: ShadowEchoSystem;
  private echoView?: ShadowEchoView;
  private debugGraphics!: Phaser.GameObjects.Graphics;
  private effectPool!: TransientEffectPool;
  private pendingAction?: PendingAction;
  private actionSequence = 0;
  private totalDamage = 0;
  private debugVisible = false;
  private dashTrailElapsed = 0;
  private readonly dashHits = new Set<string>();
  private readonly echoHits = new Set<string>();
  private readonly targets: TargetDummy[] = [
    { id: 'dummy-east', x: 575, y: 235, radius: 18, health: 100, slowRemainingMs: 0 },
    { id: 'dummy-north-east', x: 535, y: 105, radius: 18, health: 100, slowRemainingMs: 0 },
    { id: 'dummy-south-east', x: 535, y: 365, radius: 18, health: 100, slowRemainingMs: 0 },
  ];

  constructor() { super('test-room'); }

  preload(): void {
    preloadGameplayAssets(this);
    for (const character of characters) preloadCharacter(this, character);
  }

  create(): void {
    for (const character of characters) installCharacterTexture(this, character);
    installEffectAnimations(this);
    this.effectPool = new TransientEffectPool(this);
    this.createRoom();
    this.createTargets();
    this.debugGraphics = this.add.graphics().setDepth(19);
    this.createPlayableCharacter(this.config.id);
    this.scene.launch('viewer');
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.keys = this.input.keyboard!.addKeys('W,A,S,D,E,H,K,R,B') as typeof this.keys;
    this.input.keyboard!.on('keydown-SPACE', () => this.beginAction('attack'));
    this.keys.E.on('down', () => this.beginAction('ability'));
    this.keys.H.on('down', () => this.actor.hurt(15));
    this.keys.K.on('down', () => this.actor.kill());
    this.keys.R.on('down', () => this.resetPrototype());
    this.keys.B.on('down', () => { this.debugVisible = !this.debugVisible; });
    gameEvents.on('playable-character-change', this.createPlayableCharacter, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => gameEvents.off('playable-character-change', this.createPlayableCharacter, this));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.effectPool.clear());
  }

  update(_time: number, delta: number): void {
    if (!this.view?.active) return;
    const body = this.view.body as Phaser.Physics.Arcade.Body;
    const aimRadians = this.currentAimRadians();
    this.actor.aim(aimRadians);
    const horizontal = Number(this.keys.D.isDown || this.cursors.right.isDown) - Number(this.keys.A.isDown || this.cursors.left.isDown);
    const vertical = Number(this.keys.S.isDown || this.cursors.down.isDown) - Number(this.keys.W.isDown || this.cursors.up.isDown);
    const beforeMovement = this.actor.snapshot();
    const movementAllowed = beforeMovement.state !== 'hurt' && beforeMovement.state !== 'death';
    if ((horizontal || vertical) && movementAllowed) {
      this.actor.move(direction8FromVector(horizontal, vertical, beforeMovement.orientation.movementDirection), true);
      const passiveSpeed = this.moonfireSystem?.snapshot().movementSpeedMultiplier ?? 1;
      const velocity = new Phaser.Math.Vector2(horizontal, vertical).normalize().scale(this.config.movementSpeed * passiveSpeed);
      body.setVelocity(velocity.x, velocity.y);
    } else {
      if (beforeMovement.state === 'idle' || beforeMovement.state === 'move') this.actor.stop();
      body.setVelocity(0, 0);
    }
    this.actor.update(delta);
    this.updatePassive(delta);
    const snapshot = this.actor.snapshot();
    this.releaseActionIfReady(snapshot.state, snapshot.stateElapsedMs);
    this.updateDash(delta);
    this.updateSummons(delta);
    this.updateProjectiles(delta, aimRadians);
    this.updateTargets(delta);
    this.sealView?.sync(this.sealSystem?.snapshots() ?? [], this.time.now);
    const animation = this.config.animations[snapshot.state];
    const progress = animation.loop ? (snapshot.stateElapsedMs % animation.durationMs) / animation.durationMs : Math.min(1, snapshot.stateElapsedMs / animation.durationMs);
    const renderFrameCount = this.config.asset.packId
      ? heroFrameCount(this.config.asset.packId as PackHeroId, snapshot.state)
      : animation.frames.length;
    const frameIndex = Math.min(renderFrameCount - 1, Math.floor(progress * renderFrameCount));
    const renderedFacing = facingForRenderedState(
      snapshot.state,
      snapshot.orientation.movementDirection,
      snapshot.orientation.facingDirection,
    );
    this.view.render(snapshot.state, renderedFacing, progress, frameIndex);
    this.view.setDepth(10 + this.view.y / 1000);
    const releaseEventName = snapshot.state === 'attack'
      ? this.config.basicAttack?.releaseEvent
      : snapshot.state === 'ability' ? this.config.activeAbility?.releaseEvent : undefined;
    const releaseNormalizedTime = this.config.animations[snapshot.state].events
      ?.find((event) => event.name === releaseEventName)?.normalizedTime ?? 0.5;
    this.cultivatorSwordView?.sync(
      { x: this.view.x, y: this.view.y },
      snapshot.state,
      snapshot.stateElapsedMs,
      snapshot.stateDurationMs,
      snapshot.orientation.movementDirection,
      snapshot.orientation.aimAngle,
      releaseNormalizedTime,
    );
    this.drawAimAndDebug(aimRadians);
    gameEvents.emit('actor-update', snapshot, frameIndex, renderFrameCount);
  }

  private createPlayableCharacter = (characterId: string): void => {
    const position = this.view?.active ? { x: this.view.x, y: this.view.y } : { x: 350, y: 235 };
    this.clearCombatObjects();
    if (this.view?.active) this.view.destroy();
    this.config = getCharacter(characterId);
    this.actor = new CharacterActor(this.config);
    this.view = new CharacterView(this, this.config, position.x, position.y, 'gameplay');
    this.physics.add.existing(this.view);
    (this.view.body as Phaser.Physics.Arcade.Body).setSize(28, 34).setOffset(-14, -10).setCollideWorldBounds(true);
    this.configureAbilitySystems();
  };

  private configureAbilitySystems(): void {
    const ability = this.config.activeAbility;
    this.projectileSystem = undefined;
    this.projectileView = undefined;
    this.cultivatorSwordView = undefined;
    this.summonProjectileSystem = undefined;
    this.summonProjectileView = undefined;
    this.summonSystem = undefined;
    this.summonView = undefined;
    this.moonfireSystem = undefined;
    this.moonfireView = undefined;
    this.sealSystem = undefined;
    this.sealView = undefined;
    this.dashSystem = undefined;
    this.echoSystem = undefined;
    this.echoView = undefined;
    if (ability?.kind === 'flying_sword') {
      this.cultivatorSwordView = new CultivatorSwordArrayView(this);
      this.projectileSystem = new FlyingSwordSystem(ability.projectile);
      this.sealSystem = new SectlessSealSystem(ability.seal);
      this.sealView = new SectlessSealView(this);
      this.projectileView = new FlyingSwordView(this, {
        projectileEffect: 'flying_sword', trailEffect: 'flying_sword_trail', impactEffect: 'flying_sword_impact', summonEffect: 'flying_sword_summon',
        projectileScale: 0.62, trailBehindDistance: 36, trailScale: 0.6, trailAlpha: 0.72, trailIntervalMs: 62, summonScale: 0.68, impactScale: 0.58,
      });
    } else if (ability?.kind === 'foxfire_summon') {
      this.summonSystem = new FoxfireSummonSystem(ability.familiar);
      this.summonView = new FoxfireSummonView(this);
      if (this.config.passive?.kind === 'moonfire_halo') {
        this.moonfireSystem = new MoonfireStackSystem(this.config.passive);
        this.moonfireView = new MoonfireStackView(this);
      }
      this.summonProjectileSystem = new FlyingSwordSystem(ability.projectile);
      this.summonProjectileView = new FlyingSwordView(this, {
        projectileEffect: 'rei_foxfire_bolt', trailEffect: 'rei_foxfire_bolt', impactEffect: 'rei_moonfox_hit', summonEffect: 'rei_fire_fox_summon',
        artAngleOffset: Math.PI, trailBehindDistance: 14, trailAlpha: 0.32, trailIntervalMs: 75, summonScale: 0.62, impactScale: 0.72,
      });
    } else if (ability?.kind === 'shadow_dash') {
      this.dashSystem = new ShadowDashSystem(ability);
      this.echoSystem = new ShadowEchoSystem({ distance: ability.distance, ...ability.echo });
      this.echoView = new ShadowEchoView(this, { heroPackId: 'seo_jiwon', impactEffect: ability.vfx.echoImpactEffect });
    }
    const basic = this.config.basicAttack;
    if (basic?.kind === 'projectile') {
      const projectileConfig: FlyingSwordConfig = {
        count: 1, spreadDegrees: [0], speed: basic.projectileSpeed ?? 300, damage: basic.damage, lifetimeMs: 1700, collisionRadius: basic.radius,
      };
      this.basicProjectileSystem = new FlyingSwordSystem(projectileConfig);
      this.basicProjectileView = new FlyingSwordView(this, {
        projectileEffect: 'rei_foxfire_bolt', trailEffect: 'rei_foxfire_bolt', impactEffect: 'rei_moonfox_hit', projectileScale: 0.72, trailScale: 0.6, impactScale: 0.72,
        artAngleOffset: Math.PI, trailBehindDistance: 12, trailAlpha: 0.28, trailIntervalMs: 80,
      });
    } else {
      this.basicProjectileSystem = undefined;
      this.basicProjectileView = undefined;
    }
  }

  private beginAction(type: ActionType): void {
    const before = this.actor.snapshot().state;
    if (before !== 'idle' && before !== 'move') return;
    const definition = type === 'attack' ? this.config.basicAttack : this.config.activeAbility;
    if (!definition) return;
    const aimRadians = this.currentAimRadians();
    this.actor.aim(aimRadians);
    type === 'attack' ? this.actor.attack() : this.actor.useAbility();
    this.actionSequence += 1;
    this.pendingAction = { type, eventName: definition.releaseEvent, castId: `${this.config.id}-${type}-${this.actionSequence}`, aimRadians, released: false };
  }

  private releaseActionIfReady(state: CharacterState, elapsedMs: number): void {
    const pending = this.pendingAction;
    if (!pending || pending.released) return;
    const expectedState: CharacterState = pending.type === 'attack' ? 'attack' : 'ability';
    if (state !== expectedState) return;
    const animation = this.config.animations[expectedState];
    const event = animation.events?.find((entry) => entry.name === pending.eventName);
    if (!event || elapsedMs < animation.durationMs * event.normalizedTime) return;
    pending.aimRadians = this.currentAimRadians();
    this.actor.aim(pending.aimRadians);
    pending.released = true;
    pending.type === 'attack' ? this.releaseBasicAttack(pending) : this.releaseAbility(pending);
  }

  private releaseBasicAttack(pending: PendingAction): void {
    const attack = this.config.basicAttack;
    if (!attack) return;
    if (attack.kind === 'projectile' && this.basicProjectileSystem) {
      this.basicProjectileSystem.spawn({ castId: pending.castId, casterId: this.config.id, origin: this.projectileOrigin(pending.aimRadians, 26), aimRadians: pending.aimRadians });
      return;
    }
    const hitX = this.view.x + Math.cos(pending.aimRadians) * attack.range;
    const hitY = this.view.y + Math.sin(pending.aimRadians) * attack.range;
    let hitConfirmed = false;
    for (const target of this.targets) {
      if (Phaser.Math.Distance.Between(hitX, hitY, target.x, target.y) <= attack.radius + target.radius) {
        hitConfirmed = true;
        this.damageTarget(target, attack.damage);
        const detonation = this.sealSystem?.recall(target.id);
        if (detonation) this.resolveSectlessDetonation(detonation);
      }
    }
    const vfx = attack.vfx ?? { slashEffect: 'sectless_slash', impactEffect: 'flying_sword_impact', slashScale: 0.55, impactScale: 0.3 };
    this.spawnMeleeSlash(hitX, hitY, pending.aimRadians, hitConfirmed, vfx);
  }

  private releaseAbility(pending: PendingAction): void {
    const ability = this.config.activeAbility;
    if (!ability) return;
    const origin = this.projectileOrigin(pending.aimRadians, 28);
    if (ability.kind === 'flying_sword' && this.projectileSystem) {
      this.projectileView?.summon(origin.x, origin.y, pending.aimRadians);
      this.projectileSystem.spawn({ castId: pending.castId, casterId: this.config.id, origin, aimRadians: pending.aimRadians });
      gameEvents.emit('ability-release', { count: ability.projectile.count, aimDegrees: Phaser.Math.RadToDeg(pending.aimRadians) });
    } else if (ability.kind === 'foxfire_summon' && this.summonSystem) {
      const empowerment = this.moonfireSystem?.consumeForSummon();
      this.spawnEffect('rei_fire_fox_summon', this.view.x, this.view.y, 0, 0.82);
      this.summonSystem.summon({
        castId: pending.castId,
        ownerId: this.config.id,
        owner: { x: this.view.x, y: this.view.y },
        bounds: FOX_BOUNDS,
        empowerment,
      });
      this.summonView?.sync(this.summonSystem.snapshots());
      gameEvents.emit('ability-release', { count: ability.familiar.count, aimDegrees: Phaser.Math.RadToDeg(pending.aimRadians) });
    } else if (ability.kind === 'shadow_dash' && this.dashSystem) {
      this.dashHits.clear();
      this.echoHits.clear();
      this.dashTrailElapsed = 0;
      const origin = { x: this.view.x, y: this.view.y };
      this.dashSystem.start(origin, pending.aimRadians);
      this.echoSystem?.start(origin, pending.aimRadians);
      this.spawnEffect(ability.vfx.foldEffect, this.view.x, this.view.y, 0, ability.vfx.foldScale);
      gameEvents.emit('ability-release', { count: 1, aimDegrees: Phaser.Math.RadToDeg(pending.aimRadians) });
    }
  }

  private updateDash(delta: number): void {
    const ability = this.config.activeAbility;
    if (ability?.kind !== 'shadow_dash' || !this.dashSystem) return;
    const dash = this.dashSystem.update(delta);
    if (dash) {
      (this.view.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
      this.view.setPosition(Phaser.Math.Clamp(dash.x, ROOM.left, ROOM.right), Phaser.Math.Clamp(dash.y, ROOM.top, ROOM.bottom));
      this.dashTrailElapsed += delta;
      if (this.dashTrailElapsed >= ability.vfx.trailIntervalMs) {
        this.spawnEffect(ability.vfx.trailEffect, this.view.x, this.view.y, dash.angleRadians + Math.PI, ability.vfx.trailScale, 220);
        this.dashTrailElapsed = 0;
      }
      for (const target of this.targets) {
        if (this.dashHits.has(target.id)) continue;
        if (Phaser.Math.Distance.Between(this.view.x, this.view.y, target.x, target.y) <= ability.collisionRadius + target.radius) {
          this.dashHits.add(target.id);
          this.damageTarget(target, ability.damage);
          this.spawnEffect(ability.vfx.hitEffect, target.x, target.y, dash.angleRadians, 0.64);
        }
      }
      if (!dash.active) this.spawnEffect(ability.vfx.foldEffect, this.view.x, this.view.y, 0, ability.vfx.foldScale);
    }
    const echo = this.echoSystem?.update(delta);
    this.echoView?.sync(echo);
    if (!echo || echo.phase !== 'striking') return;
    for (const target of this.targets) {
      if (this.echoHits.has(target.id)) continue;
      if (Phaser.Math.Distance.Between(echo.x, echo.y, target.x, target.y) <= ability.echo.collisionRadius + target.radius) {
        this.echoHits.add(target.id);
        this.damageTarget(target, ability.echo.damage);
        this.echoView?.rupture(target.x, target.y, echo.angleRadians, 0.88);
      }
    }
    if (!echo.active) this.echoView?.rupture(echo.x, echo.y, echo.angleRadians, 0.78);
  }

  private updateProjectiles(delta: number, aimRadians: number): void {
    this.updateProjectileSet(this.projectileSystem, this.projectileView, delta, true);
    this.updateProjectileSet(this.basicProjectileSystem, this.basicProjectileView, delta, false);
    this.updateProjectileSet(this.summonProjectileSystem, this.summonProjectileView, delta, true);
    const active = (this.projectileSystem?.snapshots().length ?? 0)
      + (this.basicProjectileSystem?.snapshots().length ?? 0)
      + (this.summonProjectileSystem?.snapshots().length ?? 0);
    gameEvents.emit('projectile-update', { active, aimDegrees: Phaser.Math.RadToDeg(aimRadians), totalDamage: this.totalDamage });
    gameEvents.emit('combat-status', {
      summons: this.summonSystem?.snapshots().length ?? 0,
      seals: this.sealSystem?.snapshots().reduce((sum, seal) => sum + seal.stacks, 0) ?? 0,
      moonfire: this.moonfireSystem?.snapshot().stacks ?? 0,
    });
  }

  private updateProjectileSet(system: FlyingSwordSystem | undefined, view: FlyingSwordView | undefined, delta: number, isAbility: boolean): void {
    if (!system || !view) return;
    system.update(delta);
    for (const target of this.targets) {
      for (const hit of system.collideCircle(target)) {
        this.applyProjectileHit(target, hit, isAbility);
        view.impact(hit);
      }
    }
    system.removeOutside(ROOM);
    view.sync(system.snapshots(), delta);
  }

  private applyProjectileHit(target: TargetDummy, hit: ProjectileHit, isAbility: boolean): void {
    const passiveBonus = !isAbility ? this.moonfireSystem?.snapshot().basicDamageBonus ?? 0 : 0;
    this.damageTarget(target, hit.damage + passiveBonus);
    if (!isAbility && this.moonfireSystem) {
      const before = this.moonfireSystem.snapshot().stacks;
      const after = this.moonfireSystem.gain().stacks;
      if (after > before) this.spawnEffect('foxfire_impact', this.view.x, this.view.y - 18, 0, 0.34);
    }
    if (!isAbility) return;
    if (this.config.activeAbility?.kind === 'foxfire_summon') target.slowRemainingMs = this.config.activeAbility.slowMs;
    if (this.config.activeAbility?.kind === 'flying_sword') this.sealSystem?.apply(target);
  }

  private updateTargets(delta: number): void {
    for (const detonation of this.sealSystem?.update(delta) ?? []) this.resolveSectlessDetonation(detonation);
    for (const target of this.targets) {
      target.slowRemainingMs = Math.max(0, target.slowRemainingMs - delta);
      target.ring?.setStrokeStyle(2, target.slowRemainingMs > 0 ? 0x79bdff : 0x72a998, 0.8);
      target.label?.setText(`TARGET ${target.health}${target.slowRemainingMs > 0 ? '  SLOWED' : ''}`);
    }
  }

  private damageTarget(target: TargetDummy, damage: number): void {
    target.health = Math.max(0, target.health - damage);
    this.totalDamage += damage;
  }

  private updateSummons(delta: number): void {
    const attacks = this.summonSystem?.update(delta, { x: this.view.x, y: this.view.y }, this.targets, FOX_BOUNDS) ?? [];
    this.summonView?.sync(this.summonSystem?.snapshots() ?? []);
    for (const attack of attacks) {
      this.summonProjectileSystem?.spawn({
        castId: attack.shotId,
        casterId: attack.familiarId,
        origin: attack.origin,
        aimRadians: attack.aimRadians,
      });
    }
  }

  private updatePassive(delta: number): void {
    const snapshot = this.moonfireSystem?.update(delta);
    if (!snapshot) return;
    this.moonfireView?.sync(snapshot, { x: this.view.x, y: this.view.y }, this.time.now);
  }

  private resolveSectlessDetonation(detonation: SectlessDetonation): void {
    for (const target of this.targets) {
      if (Phaser.Math.Distance.Between(detonation.x, detonation.y, target.x, target.y) <= detonation.radius + target.radius) {
        this.damageTarget(target, detonation.damage);
      }
    }
    this.spawnEffect('flying_sword_impact', detonation.x, detonation.y, 0, 0.72);
    this.spawnEffect('sectless_slash', detonation.x, detonation.y, detonation.stacks * 0.45, 0.68);
  }

  private currentAimRadians(): number {
    const pointer = this.input.activePointer;
    const x = pointer.x - this.view.x;
    const y = pointer.y - this.view.y;
    return x * x + y * y < 64 ? this.actor.snapshot().orientation.aimAngle : Math.atan2(y, x);
  }

  private projectileOrigin(angle: number, distance: number): { x: number; y: number } {
    return { x: this.view.x + Math.cos(angle) * distance, y: this.view.y + Math.sin(angle) * distance };
  }

  private drawAimAndDebug(angle: number): void {
    const origin = this.projectileOrigin(angle, 25);
    this.debugGraphics.clear().setVisible(this.debugVisible);
    if (!this.debugVisible) return;
    this.debugGraphics.lineStyle(1, 0xe7c26d, 0.35);
    const ability = this.config.activeAbility;
    const spreads = ability?.kind === 'flying_sword' ? ability.projectile.spreadDegrees : [0];
    for (const spread of spreads) {
      const ray = angle + Phaser.Math.DegToRad(spread);
      this.debugGraphics.lineBetween(origin.x, origin.y, origin.x + Math.cos(ray) * 145, origin.y + Math.sin(ray) * 145);
    }
    this.debugGraphics.lineStyle(1, 0xff8f80, 0.42);
    for (const target of this.targets) this.debugGraphics.strokeCircle(target.x, target.y, target.radius);
  }

  private spawnMeleeSlash(
    x: number,
    y: number,
    angle: number,
    hitConfirmed: boolean,
    vfx: NonNullable<NonNullable<CharacterConfig['basicAttack']>['vfx']>,
  ): void {
    this.spawnEffect(vfx.slashEffect, x, y, angle, vfx.slashScale);
    if (hitConfirmed) this.spawnEffect(vfx.impactEffect, x, y, angle, vfx.impactScale);
  }

  private spawnEffect(effectId: string, x: number, y: number, angle: number, scale = 1, fadeDuration?: number): void {
    this.effectPool.spawn({ effectId, x, y, rotation: angle, scale, fadeDurationMs: fadeDuration });
  }

  private createRoom(): void {
    this.physics.world.setBounds(ROOM.left, ROOM.top, ROOM.right - ROOM.left, ROOM.bottom - ROOM.top);
    this.add.rectangle(350, 235, 700, 470, 0x111611);
    const grid = this.add.graphics().lineStyle(1, 0x313a30, 0.42);
    for (let x = ROOM.left; x <= ROOM.right; x += 52) grid.lineBetween(x, ROOM.top, x, ROOM.bottom);
    for (let y = ROOM.top; y <= ROOM.bottom; y += 52) grid.lineBetween(ROOM.left, y, ROOM.right, y);
    this.add.rectangle(350, 235, ROOM.right - ROOM.left, ROOM.bottom - ROOM.top).setStrokeStyle(3, 0x877243, 0.72);
    this.add.text(54, 52, 'TEST ROOM / 8-WAY FACING / B: DEBUG', { fontFamily: 'monospace', fontSize: '10px', color: '#756c56' });
  }

  private createTargets(): void {
    for (const target of this.targets) {
      target.ring = this.add.circle(target.x, target.y, target.radius, 0x27332d, 0.9).setStrokeStyle(2, 0x72a998, 0.72);
      target.label = this.add.text(target.x, target.y + 27, 'TARGET 100', { fontFamily: 'monospace', fontSize: '8px', color: '#90a69b' }).setOrigin(0.5);
    }
  }

  private resetPrototype(): void {
    this.actor.reset();
    this.view.setPosition(350, 235);
    this.clearCombatObjects();
    this.configureAbilitySystems();
    this.totalDamage = 0;
    for (const target of this.targets) { target.health = 100; target.slowRemainingMs = 0; }
  }

  private clearCombatObjects(): void {
    this.effectPool?.clear();
    this.pendingAction = undefined;
    this.projectileSystem?.clear(); this.projectileView?.clear();
    this.cultivatorSwordView?.clear();
    this.basicProjectileSystem?.clear(); this.basicProjectileView?.clear();
    this.summonProjectileSystem?.clear(); this.summonProjectileView?.clear();
    this.summonSystem?.clear(); this.summonView?.clear();
    this.moonfireSystem?.clear(); this.moonfireView?.clear();
    this.sealSystem?.clear(); this.sealView?.clear();
    this.dashSystem?.clear(); this.dashHits.clear();
    this.echoSystem?.clear(); this.echoView?.clear(); this.echoHits.clear();
  }
}
