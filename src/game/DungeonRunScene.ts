import Phaser from 'phaser';
import { heroFrameCount, type PackHeroId } from '../assets/gameplayManifest';
import { direction8FromAngle, direction8FromVector, type Direction8 } from '../characters/directions';
import { facingForRenderedState } from '../characters/renderFacing';
import { characters, getCharacter } from '../characters/registry';
import type { CharacterConfig, CharacterState } from '../characters/types';
import type { CoopClient } from '../coop/CoopClient';
import type { CoopRoomSnapshot } from '../coop/protocol';
import { CharacterActor } from '../domain/CharacterActor';
import { sweptCircleIntersectsCircle } from '../domain/collision';
import { FlyingSwordSystem, type FlyingSwordConfig, type ProjectileHit } from '../domain/FlyingSwordSystem';
import { FoxfireSummonSystem } from '../domain/FoxfireSummonSystem';
import { MoonfireStackSystem } from '../domain/MoonfireStackSystem';
import { SectlessSealSystem, type SectlessDetonation } from '../domain/SectlessSealSystem';
import { ShadowDashSystem } from '../domain/ShadowDashSystem';
import { ShadowEchoSystem } from '../domain/ShadowEchoSystem';
import { SeededRandom } from '../domain/SeededRandom';
import { unlockHeroForRealm } from '../domain/heroUnlocks';
import { CABINET_UNLOCKS, loadMeta, recordRun, saveMeta, type MetaState, type TrialId } from '../domain/metaProgress';
import { ENEMY_NAMES, HUB_NAME, LOOP_NAME, PROTECTOR_TITLE, STAGE_NAME } from '../domain/lexicon';
import { unreadSlips } from '../domain/lore';
import { SAVED_RUN_KEY, type SavedRun } from '../domain/savedRun';
import { HEROES_PROGRESS, formOf, formTitle, masteryPointsFor, modifiersFor, neutralMods, type HeroMods } from '../domain/heroProgress';
import { ITEMS, RunLoadout, rollChest, type ItemId } from '../domain/runItems';
import { ELITE_AFFIXES, eliteDrop } from '../domain/elites';
import { PROTECTORS } from '../domain/specialRooms';
import { assignRoomFeatures, coverLayout, roomLayoutSeed, type RoomFeature } from '../dungeon/roomFeatures';
import { DIRECTION_OFFSET, DOOR_BITS, DungeonTile, generateDungeon, DUNGEON_THEMES, DUNGEON_THEME_IDS, shuffledDungeonThemes, type DungeonThemeId, type GeneratedDungeon, type GeneratedRoom } from '../dungeon';
import { AudioFeedback } from './AudioFeedback';
import { music } from './music';
import { CharacterView } from './CharacterView';
import { CultivatorSwordArrayView } from './CultivatorSwordArrayView';
import { DungeonHud } from './DungeonHud';
import { HeroFormAura } from './HeroFormAura';
import { TrapSystem } from './TrapSystem';
import { EnemyDirector } from './run/EnemyDirector';
import { FeatureRooms } from './run/FeatureRooms';
import { RunLore } from './run/RunLore';
import { DeathSequence } from './run/DeathSequence';
import { Tutorial } from './run/Tutorial';
import { CoopRun } from './run/CoopRun';
import { RoomFeatureSystem } from './RoomFeatureSystem';
import { BurnPatches } from './BurnPatches';
import { LOOT_CHEST_SIZE, LOOT_CHESTS_KEY, LOOT_ITEM_CELL, LOOT_ITEMS_KEY, LootSystem } from './LootSystem';
import { ENEMY_SHEET_CELL } from './enemySheetLayout';
import { FlyingSwordView } from './FlyingSwordView';
import { FoxfireSummonView } from './FoxfireSummonView';
import { installEffectAnimations, preloadGameplayAssets } from './gameplayAssetLoader';
import { installCharacterTexture, preloadCharacter } from './installCharacterTextures';
import { MoonfireStackView } from './MoonfireStackView';
import { SectlessSealView } from './SectlessSealView';
import { ShadowEchoView } from './ShadowEchoView';
import { TransientEffectPool } from './TransientEffectPool';
import { moveWithCollision } from './movement';
import { DEFAULT_GAME_SETTINGS, type GameSettings } from './settings';
import { type RunHeroId, type ActionType, type PendingAction, type EnemyActor, isBig, type CombatProjectile, LOGICAL_WIDTH, LOGICAL_HEIGHT, ROOM_CENTER, BASE_TILE, ROOM_SCALE_SOLO, PORTAL_POINT, ENEMY_PROJECTILE_STYLES, BOSS_PORTAL_EFFECTS, roomTextureKey, roomAssetUrl, HERO_ASSETS, enemyAnimationKey, ABILITY_COOLDOWN_MS, ABILITY_NAMES, portraitKey, toRoman, REALM_HEROES, REALM_ALLY_CHANCE, HERO_ARTS, BLESSINGS, HERO_UNLOCK_NAMES, PORTAL_FRAME, HERO_FOOT_OFFSET, HERO_SOUNDS, REALM_MUSIC, actorDepth } from './run/runShared';

export class DungeonRunScene extends Phaser.Scene {
  // Members without `private` are shared with the run helpers in ./run/.
  readonly enemyAI = new EnemyDirector(this);
  readonly featureRooms = new FeatureRooms(this);
  readonly lore = new RunLore(this);
  readonly death = new DeathSequence(this);
  readonly tutorial = new Tutorial(this);
  readonly coopRun = new CoopRun(this);
  heroId: RunHeroId = 'li-yunfeng';
  heroAsset: PackHeroId = 'li_yunfeng';
  config: CharacterConfig = getCharacter('li-yunfeng');
  actor = new CharacterActor(this.config);
  hero!: CharacterView;
  cultivatorSwordView?: CultivatorSwordArrayView;
  private abilityProjectileSystem?: FlyingSwordSystem;
  private abilityProjectileView?: FlyingSwordView;
  private basicProjectileSystem?: FlyingSwordSystem;
  private basicProjectileView?: FlyingSwordView;
  private summonProjectileSystem?: FlyingSwordSystem;
  private summonProjectileView?: FlyingSwordView;
  private summonSystem?: FoxfireSummonSystem;
  private summonView?: FoxfireSummonView;
  moonfireSystem?: MoonfireStackSystem;
  private moonfireView?: MoonfireStackView;
  private sealSystem?: SectlessSealSystem;
  private sealView?: SectlessSealView;
  private dashSystem?: ShadowDashSystem;
  private echoSystem?: ShadowEchoSystem;
  private echoView?: ShadowEchoView;
  effectPool!: TransientEffectPool;
  private facing: Direction8 = 'S';
  private movement?: { readonly x: number; readonly y: number };
  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  keys?: Record<'up' | 'down' | 'left' | 'right' | 'attack' | 'ability' | 'interact' | 'pause' | 'escape', Phaser.Input.Keyboard.Key>;
  private roomGraphics!: Phaser.GameObjects.Graphics;
  private roomBackground?: Phaser.GameObjects.Image;
  private vfxGraphics!: Phaser.GameObjects.Graphics;
  private minimapGraphics!: Phaser.GameObjects.Graphics;
  private hud!: DungeonHud;
  objectiveText!: Phaser.GameObjects.Text;
  bannerText!: Phaser.GameObjects.Text;
  health = 7;
  maxHealth = 7;
  power = 1;
  private attackCooldownMs = 0;
  private abilityCooldownMs = 0;
  attackDirectorMs = 0;
  invulnerableMs = 0;
  private paused = false;
  private hitStopMs = 0;
  runEnded = false;
  roomScale = 1;
  roomBounds = new Phaser.Geom.Rectangle(176, 62, 608, 416);
  /** Painted masonry is three tiles deep on every side. */
  wallBand = 3 * BASE_TILE;
  /** Where rectangle-bounded actors (familiars) may stand, with their whole body clear of the walls. */
  floorBounds = new Phaser.Geom.Rectangle(288, 178, 384, 180);
  tileSize = BASE_TILE;
  trapSystem!: TrapSystem;
  features!: RoomFeatureSystem;
  burns!: BurnPatches;
  /** Special rooms on the current floor, and which one-time things in them are used up. */
  roomFeatures: ReadonlyMap<string, RoomFeature> = new Map();
  readonly usedFeatures = new Set<string>();
  trial?: { roomId: string; waves: readonly number[]; wave: number; gapMs: number };
  elitesThisRoom = 0;
  /** Where the hero came into the current room; pitfalls return them here. */
  roomEntryPoint = { x: 480, y: 330 };
  /** The hero is dropping into a pit. */
  private fall?: { x: number; y: number; elapsedMs: number; fromX: number; fromY: number };
  /** How many times the party has gone round all three realms; each loop is harder. */
  resonance = 0;
  loadout = new RunLoadout();
  loot!: LootSystem;
  /** Realm hero waiting in this realm, the room they wait in, and whether they have been met. */
  private realmAlly?: { heroId: RunHeroId; roomId: string; sprite?: Phaser.GameObjects.Sprite; met: boolean };
  private readonly blessings = new Set<RunHeroId>();
  /** Movement bonus from Seo's blessing. */
  blessingSpeed = 1;
  private lastVitals = '';
  meta: MetaState = loadMeta();
  /** Oaths sworn at the Expedition Table (solo only). */
  trials = new Set<TrialId>();
  runShards = 0;
  private runRecorded = false;
  /** One-time provisions bought at the apothecary. */
  private reservePeach = false;
  private reserveQi = false;
  /** What last hurt the hero, for the chronicle. */
  lastHurtBy = 'the realm';
  /** What this hero's equipped grid nodes add (solo only; the co-op server does not know them). */
  heroMods: HeroMods = neutralMods();
  private aura?: HeroFormAura;
  private wardensThisRun = 0;
  /** Ids of Archive entries found so far, mirrored from the saved record. */
  loreKnown: string[] = [];
  loreToasts = 0;
  /** Titles waiting to be announced together, so a burst of discoveries is one note. */
  pendingToasts: string[] = [];
  private killCount = 0;
  /** Set by traps just before they deal damage, so the chronicle can name them. */
  pendingHurtBy?: string;
  /** Death plays out in steps: the hero's death animation, a fade to black, the message, then the hall. */
  deathSequence?: { phase: 'dying' | 'blackout' | 'message' | 'leaving'; elapsedMs: number; objects: Phaser.GameObjects.GameObject[] };
  themeIndex = 0;
  dungeon!: GeneratedDungeon;
  currentRoom!: GeneratedRoom;
  readonly clearedRooms = new Set<string>();
  readonly visitedRooms = new Set<string>();
  readonly enemies: EnemyActor[] = [];
  readonly projectiles: CombatProjectile[] = [];
  readonly roomTransients = new Set<Phaser.GameObjects.GameObject>();
  nextEnemyId = 1;
  transitionLockedMs = 0;
  /** The current room was entered by resuming a saved run (no practice then). */
  private resumedRun = false;
  /** Last value sent to the touch USE button. */
  private useAvailable = false;
  /** Which half of the room the hero is in, so the guidance card can sit in the other. */
  private heroHalf?: 'top' | 'bottom';
  /** Time left to press Esc a second time and leave the run. */
  private leaveArmedMs = 0;
  bossPortal?: Phaser.GameObjects.Container;
  private bossPortalReady = false;
  private portalTravelPending = false;
  portalTravelIntent = false;
  private portalTravelProgress = 0;
  private portalArmed = false;
  networkTelegraphs?: Phaser.GameObjects.Graphics;
  seed = 0;
  random = new SeededRandom(1);
  private readonly preparedDungeons = new Map<DungeonThemeId, GeneratedDungeon>();
  runThemeOrder: readonly DungeonThemeId[] = DUNGEON_THEME_IDS;
  private pendingAction?: PendingAction;
  private bufferedAction?: { type: ActionType; remainingMs: number };
  private actionSequence = 0;
  private dashTrailElapsed = 0;
  private readonly dashHits = new Set<number>();
  private readonly echoHits = new Set<number>();
  settings: GameSettings = DEFAULT_GAME_SETTINGS;
  audioFeedback?: AudioFeedback;
  private heroLight?: Phaser.GameObjects.Image;
  private movementParticleMs = 0;
  coopClient?: CoopClient;
  coopSnapshot?: CoopRoomSnapshot;
  coopRoomId?: string;
  /** Teammates in a co-op party (up to two besides you), keyed by player id. */
  /** The touch USE button is being held (reviving an ally). */
  private touchUseHeld = false;
  readonly remoteHeroes = new Map<string, { view: CharacterView; state: CharacterState; elapsedMs: number; previous: { x: number; y: number } }>();
  private lastMoveX = 0;
  private lastMoveY = 0;

  constructor() {
    super('dungeon-run');
  }

  init(): void {
    // Co-op walks the server's floor, so its rooms (and their art, loaded next) come from the server's seed.
    const coopSeed = (this.registry.get('coopClient') as CoopClient | undefined)?.currentSnapshot?.seed;
    this.prepareDungeonLayouts(coopSeed);
  }

  preload(): void {
    if (this.preparedDungeons.size === 0) this.prepareDungeonLayouts();
    for (const heroId of Object.keys(HERO_ASSETS)) this.load.image(portraitKey(heroId), `/assets/ui/hero-portraits/${heroId}.png`);
    TrapSystem.preload(this);
    RoomFeatureSystem.preload(this, DUNGEON_THEME_IDS);
    Tutorial.preload(this);
    this.load.spritesheet(LOOT_ITEMS_KEY, '/assets/items/items.png', { frameWidth: LOOT_ITEM_CELL, frameHeight: LOOT_ITEM_CELL });
    this.load.spritesheet(LOOT_CHESTS_KEY, '/assets/items/chests.png', { frameWidth: LOOT_CHEST_SIZE.width, frameHeight: LOOT_CHEST_SIZE.height });
    for (const [themeId] of Object.entries(DUNGEON_THEMES) as [DungeonThemeId, unknown][]) {
      this.load.spritesheet(`portal-open:${themeId}`, `/assets/dungeons/${themeId}/portal/portal-open.png`, { frameWidth: PORTAL_FRAME.width, frameHeight: PORTAL_FRAME.height });
      this.load.spritesheet(`portal-idle:${themeId}`, `/assets/dungeons/${themeId}/portal/portal-idle.png`, { frameWidth: PORTAL_FRAME.width, frameHeight: PORTAL_FRAME.height });
      this.load.spritesheet(`run-enemies:${themeId}`, `/assets/dungeons/${themeId}/enemies-animated-v3.png`, { frameWidth: ENEMY_SHEET_CELL, frameHeight: ENEMY_SHEET_CELL });
      for (const style of ENEMY_PROJECTILE_STYLES) {
        this.load.image(`enemy-projectile:${themeId}:${style}`, `/assets/dungeons/${themeId}/projectiles-v4/projectile-${style}-v4.png`);
      }
      const dungeon = this.preparedDungeons.get(themeId);
      const masks = new Set(dungeon?.rooms.map((room) => room.doorMask) ?? []);
      for (const mask of masks) this.load.image(roomTextureKey(themeId, mask), roomAssetUrl(themeId, mask));
    }
    preloadGameplayAssets(this);
    for (const character of characters) preloadCharacter(this, character);
  }

  create(): void {
    this.scene.stop('realm-hall');
    this.scene.stop('grand-archive');
    this.coopClient = this.registry.get('coopClient') as CoopClient | undefined;
    this.coopRun.reset();
    this.networkTelegraphs = undefined;
    const coopLocal = this.coopClient?.currentSnapshot?.players.find((player) => player.id === this.coopClient?.currentMembership?.playerId);
    const selected = (coopLocal?.heroId ?? this.registry.get('selectedHero')) as RunHeroId | undefined;
    this.heroId = selected && selected in HERO_ASSETS ? selected : 'li-yunfeng';
    this.heroAsset = HERO_ASSETS[this.heroId];
    this.config = getCharacter(this.heroId);
    this.actor = new CharacterActor(this.config);
    this.applyRoomScale(this.coopClient?.currentSnapshot ? 1 : ROOM_SCALE_SOLO);
    this.meta = loadMeta();
    this.trials = new Set(this.coopClient?.currentSnapshot ? [] : this.meta.trials);
    this.runShards = 0;
    this.runRecorded = false;
    this.lastHurtBy = 'the realm';
    this.heroMods = this.coopClient?.currentSnapshot ? neutralMods() : modifiersFor(this.heroId, this.meta.heroes[this.heroId]);
    this.wardensThisRun = 0;
    this.killCount = 0;
    this.loreKnown = [...this.meta.lore];
    this.loreToasts = 0;
    this.pendingToasts = [];
    this.maxHealth = Math.max(3, Math.max(5, Math.ceil(this.config.maxHealth / 15)) + this.meta.forge.vitality + this.heroMods.bonusHearts - (this.trials.has('brittle') ? 2 : 0));
    this.health = this.maxHealth;
    this.power = 1;
    this.resonance = 0;
    this.loadout = new RunLoadout();
    this.realmAlly = undefined;
    this.blessings.clear();
    this.blessingSpeed = 1;
    this.lastVitals = '';
    this.applyProvision();
    this.paused = false;
    this.hitStopMs = 0;
    this.runEnded = false;
    this.deathSequence = undefined;
    this.heroHalf = undefined;
    this.attackCooldownMs = 0;
    this.abilityCooldownMs = 0;
    this.invulnerableMs = 0;
    this.pendingAction = undefined;
    this.bufferedAction = undefined;
    this.actionSequence = 0;
    this.nextEnemyId = 1;
    // Zoom out just enough that the scaled room and its HUD margin fit the screen.
    this.cameras.main.setZoom(2 * Math.min(1, LOGICAL_HEIGHT / (this.roomBounds.height + 124))).centerOn(LOGICAL_WIDTH / 2, LOGICAL_HEIGHT / 2).setBackgroundColor('#050908');
    for (const character of characters) installCharacterTexture(this, character);
    installEffectAnimations(this);
    this.effectPool = new TransientEffectPool(this);
    this.createEnemyAnimations();
    this.roomGraphics = this.add.graphics().setDepth(3);
    this.vfxGraphics = this.add.graphics().setDepth(35);
    this.minimapGraphics = this.add.graphics().setDepth(92);
    this.hero = new CharacterView(this, this.config, 480, 286, 'gameplay').setDepth(actorDepth(286));
    this.aura?.destroy();
    this.aura = new HeroFormAura(this, this.heroId, 1, formOf(this.meta.heroes[this.heroId]));
    this.createHeroLight();
    this.hud = new DungeonHud(this);
    LootSystem.installAnimations(this);
    this.trapSystem = new TrapSystem(this, {
      hurtHero: (x, y) => { this.pendingHurtBy = 'a trap'; this.damagePlayer(1, x, y); },
      heroFell: (x, y) => { this.pendingHurtBy = 'a pitfall'; this.dropIntoPit(x, y); },
      sound: (kind) => this.audioFeedback?.play(kind === 'spikes' ? 'spike-trap' : kind === 'vent' ? 'fire-vent' : 'pit-crumble', 0.45),
    });
    this.loot = new LootSystem(this, (id, x, y) => this.collectItem(id, x, y), (y) => actorDepth(y - HERO_FOOT_OFFSET), (sound) => this.audioFeedback?.play(sound));
    RoomFeatureSystem.installAnimations(this);
    this.features = new RoomFeatureSystem(this, {
      depthFor: (feetY) => actorDepth(feetY - HERO_FOOT_OFFSET),
      urnBroken: (x, y) => { this.audioFeedback?.play('urn-break'); if (this.random.next() < 0.25) this.loot.drop('echo-shard', x, y); },
    });
    this.burns = new BurnPatches(this, (x, y) => { this.pendingHurtBy = 'scorched ground'; this.damagePlayer(1, x, y); }, () => this.audioFeedback?.play('burn-ignite', 0.5));
    this.trial = undefined;
    this.usedFeatures.clear();
    this.objectiveText = this.hud.objective;
    this.bannerText = this.add.text(480, 250, '', { fontFamily: 'Georgia, serif', fontSize: '26px', color: '#f4df9b', stroke: '#07100e', strokeThickness: 7, align: 'center' }).setOrigin(0.5).setDepth(100).setAlpha(0);
    this.configureHeroAbilitySystems();
    this.settings = (this.registry.get('gameSettings') as GameSettings | undefined) ?? DEFAULT_GAME_SETTINGS;
    this.audioFeedback = new AudioFeedback(this.settings);
    this.trapSystem.accessible = this.settings.accessibleWarnings;
    this.features.textScale = this.settings.textScale;
    this.hud.setTextScale(this.settings.textScale);

    if (this.input.keyboard) {
      this.cursors = this.input.keyboard.createCursorKeys();
      this.keys = {
        up: this.input.keyboard.addKey('W'), down: this.input.keyboard.addKey('S'), left: this.input.keyboard.addKey('A'), right: this.input.keyboard.addKey('D'),
        attack: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE), ability: this.input.keyboard.addKey('E'), interact: this.input.keyboard.addKey('F'),
        pause: this.input.keyboard.addKey('P'), escape: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC),
      };
    }
    const movementListener = (movement?: { readonly x: number; readonly y: number }): void => { this.movement = movement; };
    const attackListener = (): void => this.beginAction('attack');
    const abilityListener = (): void => this.beginAction('ability');
    const skipTutorialListener = (): void => this.tutorial.skip();
    const useListener = (): void => this.useNearestFeature();
    const settingsListener = (settings: GameSettings): void => {
      this.settings = settings;
      this.audioFeedback?.updateSettings(settings);
      music.updateSettings(settings);
      this.trapSystem.accessible = settings.accessibleWarnings;
      this.features.textScale = settings.textScale;
      this.hud.setTextScale(settings.textScale);
    };
    const removeCoopListener = this.coopClient?.onSnapshot((snapshot) => {
      if (this.currentRoom || this.coopSnapshot) this.coopRun.onSnapshot(snapshot);
      else this.coopSnapshot = snapshot;
    });
    this.game.events.on('lobby-input', movementListener);
    this.game.events.on('dungeon-attack', attackListener);
    this.game.events.on('dungeon-ability', abilityListener);
    this.game.events.on('game-settings', settingsListener);
    this.game.events.on('tutorial-skipped', skipTutorialListener);
    this.game.events.on('dungeon-interact', useListener);
    this.touchUseHeld = false;
    const useHoldListener = (held: boolean): void => { this.touchUseHeld = held; };
    this.game.events.on('dungeon-use-hold', useHoldListener);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off('dungeon-use-hold', useHoldListener);
      this.game.events.off('lobby-input', movementListener);
      this.game.events.off('dungeon-attack', attackListener);
      this.game.events.off('dungeon-ability', abilityListener);
      this.game.events.off('game-settings', settingsListener);
      this.game.events.off('tutorial-skipped', skipTutorialListener);
      this.game.events.off('dungeon-interact', useListener);
      this.game.events.emit('dungeon-interact-available', false);
      removeCoopListener?.();
      for (const remote of this.remoteHeroes.values()) remote.view.destroy();
      this.remoteHeroes.clear();
      this.audioFeedback?.destroy();
      this.audioFeedback = undefined;
      this.game.events.emit('dungeon-mode', false);
      this.effectPool.clear();
      this.clearHeroAbilitySystems();
    });
    this.game.events.emit('dungeon-mode', true);
    const resume = (this.registry.get('resumeRun') as SavedRun | undefined) ?? undefined;
    this.registry.remove('resumeRun');
    if (this.coopClient?.currentSnapshot) this.coopRun.onSnapshot(this.coopClient.currentSnapshot);
    else if (resume?.version === 1 && resume.heroId === this.heroId) this.resumeRun(resume);
    else this.startTheme(0);
  }

  update(_time: number, delta: number): void {
    if (!this.keys || this.runEnded) {
      if (this.deathSequence) this.death.updateDeathSequence(delta);
      else if (this.runEnded && this.keys && Phaser.Input.Keyboard.JustDown(this.keys.interact)) this.returnToHall();
      return;
    }
    if (Phaser.Input.Keyboard.JustDown(this.keys.escape)) {
      // Leaving ends the expedition, so it takes a second press to confirm.
      if (this.leaveArmedMs > 0) { this.returnToHall(); return; }
      this.leaveArmedMs = 2500;
      this.spawnFloatingText(this.hero.x, this.hero.y - 46, 'PRESS ESC AGAIN TO ABANDON\nTHE EXPEDITION', '#ff9aa5', 2500);
    }
    this.leaveArmedMs = Math.max(0, this.leaveArmedMs - delta);
    if (Phaser.Input.Keyboard.JustDown(this.keys.pause)) this.setPaused(!this.paused);
    if (this.paused) { this.objectiveText.setText('PAUSED  •  P TO RESUME'); return; }
    if (this.hitStopMs > 0) {
      this.hitStopMs = Math.max(0, this.hitStopMs - delta);
      this.drawVfx();
      this.updateHud();
      return;
    }

    if (this.bufferedAction) {
      this.bufferedAction.remainingMs -= delta;
      if (this.bufferedAction.remainingMs <= 0) this.bufferedAction = undefined;
    }

    this.attackCooldownMs = Math.max(0, this.attackCooldownMs - delta);
    this.abilityCooldownMs = Math.max(0, this.abilityCooldownMs - delta);
    this.attackDirectorMs = Math.max(0, this.attackDirectorMs - delta);
    this.invulnerableMs = Math.max(0, this.invulnerableMs - delta);
    this.transitionLockedMs = Math.max(0, this.transitionLockedMs - delta);
    this.hero.setAlpha(this.invulnerableMs > 0 && Math.floor(this.invulnerableMs / 90) % 2 === 0 ? 0.35 : 1);

    if (this.fall) this.updateFall(delta);
    else this.updatePlayer(delta);
    if (this.runEnded) return;
    if (!this.coopSnapshot && !this.fall) {
      this.trapSystem.update(delta, this.hero.x, this.hero.y + 18);
      this.burns.update(delta, this.hero.x, this.hero.y + 18, this.themeColor(), this.settings.accessibleWarnings);
    }
    this.features.update(delta, this.hero.x, this.hero.y + 18, Boolean(this.fall) || this.hostileCount > 0);
    if (Phaser.Input.Keyboard.JustDown(this.keys.interact)) this.useNearestFeature();
    this.reportUseAvailable();
    this.tutorial.update(delta);
    const half = this.hero.y > ROOM_CENTER.y ? 'bottom' : 'top';
    if (half !== this.heroHalf) { this.heroHalf = half; this.game.events.emit('hero-half', half); }
    if (this.updateBossPortalTravel()) {
      this.drawVfx();
      this.updateHud();
      this.drawMinimap();
      return;
    }
    if (Phaser.Input.Keyboard.JustDown(this.keys.attack) || this.input.activePointer.leftButtonDown() && this.input.activePointer.getDuration() < 40) this.beginAction('attack');
    if (Phaser.Input.Keyboard.JustDown(this.keys.ability)) this.beginAction('ability');
    if (this.coopClient) this.coopRun.sendInput(this.lastMoveX, this.lastMoveY, this.aimAngle(), this.keys.interact.isDown || this.touchUseHeld, this.portalTravelIntent);
    this.updateHeroAbilities(delta);
    this.loot.update(this.hero.x, this.hero.y, delta);
    this.updateRealmAlly();
    if (this.coopSnapshot) this.coopRun.update();
    else this.enemyAI.updateEnemies(delta);
    this.updateProjectiles(delta);
    // A lethal hit ends the run mid-frame; the empty room must not count as cleared.
    if (this.runEnded) return;
    if (!this.coopSnapshot) { this.featureRooms.updateTrial(delta); this.updateRoomState(); }
    this.updateRemoteHero(delta);
    this.drawVfx();
    this.updateHud();
    this.drawMinimap();
  }

  private createHeroLight(): void {
    const key = 'run:hero-light';
    if (!this.textures.exists(key)) {
      const texture = this.textures.createCanvas(key, 256, 256);
      if (!texture) return;
      const context = texture.getContext();
      const gradient = context.createRadialGradient(128, 128, 4, 128, 128, 126);
      gradient.addColorStop(0, 'rgba(255,255,255,0.46)');
      gradient.addColorStop(0.42, 'rgba(255,255,255,0.14)');
      gradient.addColorStop(1, 'rgba(255,255,255,0)');
      context.fillStyle = gradient;
      context.fillRect(0, 0, 256, 256);
      texture.refresh();
    }
    this.heroLight = this.add.image(this.hero.x, this.hero.y, key)
      .setScale(0.72, 0.42)
      .setAlpha(0.32)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(4);
  }

  private spawnMovementParticle(delta: number): void {
    if (this.settings.reduceMotion) return;
    this.movementParticleMs += delta;
    if (this.movementParticleMs < 90) return;
    this.movementParticleMs = 0;
    const particle = this.add.circle(this.hero.x - this.lastMoveX * 12, this.hero.y + 19 - this.lastMoveY * 4, 2.2, this.themeColor(), 0.48).setDepth(8);
    this.roomTransients.add(particle);
    this.tweens.add({
      targets: particle,
      x: particle.x - this.lastMoveX * 8,
      y: particle.y - 7,
      alpha: 0,
      scale: 0.35,
      duration: 280,
      onComplete: () => {
        this.roomTransients.delete(particle);
        particle.destroy();
      },
    });
  }

  private createEnemyAnimations(): void {
    for (const themeId of DUNGEON_THEME_IDS) {
      if (!this.anims.exists(`portal-open:${themeId}`)) {
        this.anims.create({ key: `portal-open:${themeId}`, frames: this.anims.generateFrameNumbers(`portal-open:${themeId}`, { start: 0, end: PORTAL_FRAME.openFrames - 1 }), frameRate: 16, repeat: 0 });
        this.anims.create({ key: `portal-idle:${themeId}`, frames: this.anims.generateFrameNumbers(`portal-idle:${themeId}`, { start: 0, end: PORTAL_FRAME.idleFrames - 1 }), frameRate: 10, repeat: -1 });
      }
      for (let column = 0; column < 4; column += 1) {
        const texture = `run-enemies:${themeId}`;
        const definitions = [
          { state: 'idle' as const, frames: [column, column + 4], frameRate: 2.4, repeat: -1 },
          { state: 'move' as const, frames: [column + 4, column + 8], frameRate: 7, repeat: -1 },
          { state: 'attack' as const, frames: [column + 8, column + 12, column], frameRate: 9, repeat: 0 },
        ];
        for (const definition of definitions) {
          const key = enemyAnimationKey(themeId, column, definition.state);
          if (!this.anims.exists(key)) this.anims.create({ key, frames: definition.frames.map((frame) => ({ key: texture, frame })), frameRate: definition.frameRate, repeat: definition.repeat });
        }
      }
    }
  }

  /** Loads a realm's floor; `enter` false leaves room entry to co-op, which follows the server. */
  startTheme(index: number, enter = true): void {
    this.themeIndex = index;
    const themeId = this.runThemeOrder[index];
    const prepared = this.preparedDungeons.get(themeId);
    if (!prepared) throw new Error(`Missing prepared dungeon for ${themeId}`);
    this.dungeon = prepared;
    this.lore.learn(`enter:${themeId}`);
    this.clearedRooms.clear();
    this.visitedRooms.clear();
    this.roomFeatures = assignRoomFeatures(prepared);
    this.usedFeatures.clear();
    const start = this.dungeon.rooms.find((room) => room.kind === 'start');
    if (!start) throw new Error('Generated dungeon has no start room');
    this.clearedRooms.add(start.id);
    this.setupRealmAlly(themeId);
    music.setTrack(REALM_MUSIC[themeId]);
    if (!enter) { this.currentRoom = start; return; }
    this.enterRoom(start, 'S');
    this.showBanner(`${DUNGEON_THEMES[themeId].name}\n${this.resonance > 0 ? `${LOOP_NAME.toUpperCase()} ${toRoman(this.resonance + 1)}  •  ` : ''}${index + 1} / ${this.runThemeOrder.length}`);
  }

  private applyRoomScale(scale: number): void {
    this.roomScale = scale;
    this.tileSize = BASE_TILE * scale;
    const width = 19 * this.tileSize;
    const height = 13 * this.tileSize;
    this.roomBounds = new Phaser.Geom.Rectangle(ROOM_CENTER.x - width / 2, ROOM_CENTER.y - height / 2, width, height);
    this.wallBand = 3 * this.tileSize;
    const insetX = this.wallBand + 16 * scale;
    const insetY = this.wallBand + 20 * scale;
    this.floorBounds = new Phaser.Geom.Rectangle(this.roomBounds.x + insetX, this.roomBounds.y + insetY, width - 2 * insetX, height - 2 * insetY);
  }

  /** A point on the room expressed as fractions of its half-size from the centre. */
  roomPoint(u: number, v: number): { x: number; y: number } {
    return { x: ROOM_CENTER.x + u * this.roomBounds.width / 2, y: ROOM_CENTER.y + v * this.roomBounds.height / 2 };
  }

  /** The floor gives way: the hero drops into the pit, takes a hit and climbs back in at the door. */
  private dropIntoPit(x: number, y: number): void {
    this.audioFeedback?.play('fall');
    if (this.fall || this.runEnded || this.portalTravelPending) return;
    this.actor.stop();
    this.fall = { x, y, elapsedMs: 0, fromX: this.hero.x, fromY: this.hero.y };
  }

  private updateFall(delta: number): void {
    const fall = this.fall!;
    fall.elapsedMs += delta;
    const progress = Math.min(1, fall.elapsedMs / 420);
    this.hero.setPosition(Phaser.Math.Linear(fall.fromX, fall.x, progress), Phaser.Math.Linear(fall.fromY, fall.y - 12, progress));
    this.hero.setScale(1 - 0.75 * progress).setAlpha(1 - progress);
    if (progress < 1) return;
    this.fall = undefined;
    this.hero.setScale(1).setAlpha(1).setPosition(this.roomEntryPoint.x, this.roomEntryPoint.y);
    this.invulnerableMs = 0;
    this.damagePlayer(1, fall.x, fall.y);
    if (!this.runEnded) this.invulnerableMs = Math.max(this.invulnerableMs, 1100);
  }

  /** Difficulty multiplier: each resonance and each extra party member adds pressure. */
  get difficulty(): number {
    const partySize = this.coopSnapshot?.players.length ?? 1;
    return 1 + 0.35 * this.resonance + 0.4 * (partySize - 1);
  }

  private get abilityCooldownTotal(): number {
    return ABILITY_COOLDOWN_MS * this.loadout.abilityCooldownMultiplier * this.loadout.abilityArtCooldownMultiplier(HERO_ARTS[this.heroId]) * (1 - 0.08 * this.meta.forge.focus) * Math.max(0.4, 1 - this.heroMods.abilityCooldown);
  }

  /** Ability damage scale: power plus the hero's own Art. */
  private get abilityPower(): number {
    return this.power * this.loadout.abilityDamageMultiplier(HERO_ARTS[this.heroId]) * (1 + this.heroMods.abilityDamage);
  }

  /** Chest contents respect the Treasure Cabinet and the Lucky Thread upgrade. */
  /** Relics and infusions still locked in the Treasure Cabinet. */
  get lockedItems(): ItemId[] {
    return CABINET_UNLOCKS.map((unlock) => unlock.id).filter((id) => !this.meta.unlocked.includes(id));
  }

  rollChestItems(kind: 'room' | 'warden', extraRare = 0): ItemId[] {
    const locked = this.lockedItems;
    return rollChest(kind, this.random, this.resonance, { locked, rareBonus: 0.08 * this.meta.forge.fortune + extraRare, heroArt: HERO_ARTS[this.heroId], slipChance: this.coopSnapshot || unreadSlips(this.loreKnown).length === 0 ? 0 : 0.22 });
  }

  /** Applies (and uses up) the provision bought at the apothecary. */
  private applyProvision(): void {
    this.reservePeach = false;
    this.reserveQi = false;
    const provision = this.coopClient?.currentSnapshot ? undefined : this.meta.provision;
    if (!provision) return;
    if (provision === 'spirit-peach') this.reservePeach = true;
    else if (provision === 'qi-crystal') this.reserveQi = true;
    else {
      const [relic] = this.rollChestItems('warden');
      this.loadout.add(relic);
    }
    this.meta.provision = undefined;
    saveMeta(this.meta);
  }

  /** Records a feat for the hero being played; returns the announcement when it raises their Form. */
  private earnFeat(feat: 'homeWarden' | 'loop'): string | undefined {
    if (this.coopSnapshot) return undefined;
    const meta = loadMeta();
    const record = meta.heroes[this.heroId];
    if (record[feat]) return undefined;
    const before = formOf(record);
    record[feat] = true;
    const after = formOf(record);
    saveMeta(meta);
    this.meta = { ...this.meta, heroes: meta.heroes };
    if (after <= before) return undefined;
    this.aura?.setForm(after, true);
    this.lore.learn(`stage:${this.heroId}:${after}`);
    return `${STAGE_NAME.toUpperCase()} ${after === 2 ? 'II' : 'III'} ATTAINED\n${formTitle(this.heroId, record).toUpperCase()}`;
  }

  /** Saves the run at each room entry so closing the tab never loses it (solo only). */
  saveRunSnapshot(): void {
    if (this.coopSnapshot || this.runEnded || this.runRecorded) return;
    const snapshot: SavedRun = {
      version: 1, heroId: this.heroId, seed: this.seed, resonance: this.resonance, themeIndex: this.themeIndex, roomId: this.currentRoom.id,
      cleared: [...this.clearedRooms], visited: [...this.visitedRooms], health: this.health, maxHealth: this.maxHealth, power: this.power,
      relics: [...this.loadout.relics.entries()], infusion: this.loadout.infusion, infusionLevel: this.loadout.infusionLevel,
      phoenixSpent: this.loadout.phoenixSpent, blessings: [...this.blessings], blessingSpeed: this.blessingSpeed, runShards: this.runShards,
      used: [...this.usedFeatures],
    };
    try { localStorage.setItem(SAVED_RUN_KEY, JSON.stringify(snapshot)); } catch { /* optional */ }
  }

  /** Rebuilds a saved run: same realms, same room, same loadout. */
  private resumeRun(saved: SavedRun): void {
    this.resonance = saved.resonance;
    this.prepareDungeonLayouts(saved.seed);
    this.themeIndex = saved.themeIndex;
    const themeId = this.runThemeOrder[saved.themeIndex];
    const prepared = this.preparedDungeons.get(themeId);
    const room = prepared?.rooms.find((candidate) => candidate.id === saved.roomId);
    if (!prepared || !room) { this.startTheme(0); return; }
    this.dungeon = prepared;
    this.health = saved.health;
    this.maxHealth = saved.maxHealth;
    this.power = saved.power;
    for (const [id, count] of saved.relics) this.loadout.relics.set(id, count);
    this.loadout.infusion = saved.infusion as RunLoadout['infusion'];
    this.loadout.infusionLevel = saved.infusionLevel;
    this.loadout.phoenixSpent = saved.phoenixSpent;
    for (const id of saved.blessings) this.blessings.add(id);
    this.blessingSpeed = saved.blessingSpeed;
    this.runShards = saved.runShards;
    this.clearedRooms.clear();
    this.visitedRooms.clear();
    for (const id of saved.cleared) this.clearedRooms.add(id);
    for (const id of saved.visited) this.visitedRooms.add(id);
    this.roomFeatures = assignRoomFeatures(prepared);
    this.usedFeatures.clear();
    for (const id of saved.used ?? []) this.usedFeatures.add(id);
    this.setupRealmAlly(themeId);
    music.setTrack(REALM_MUSIC[themeId]);
    this.resumedRun = true;
    this.enterRoom(room, 'S');
    this.showBanner(`${DUNGEON_THEMES[themeId].name}\nTHE ECHO RESUMES`);
  }

  /** Writes the run into the chronicle once, paying the trial bonus on shards found. */
  recordRunOnce(outcome: string): void {
    if (this.runRecorded || this.coopSnapshot) return;
    this.runRecorded = true;
    try { localStorage.removeItem(SAVED_RUN_KEY); } catch { /* optional */ }
    this.meta = { ...loadMeta(), trials: this.meta.trials };
    this.meta.heroes[this.heroId].points += masteryPointsFor(this.visitedRooms.size, this.wardensThisRun, this.resonance + 1);
    recordRun(this.meta, {
      hero: this.config.displayName,
      resonance: this.resonance + 1,
      realm: DUNGEON_THEMES[this.dungeon.themeId].name,
      outcome,
      rooms: this.visitedRooms.size,
      shards: this.runShards,
      items: [...this.loadout.relics.keys()].map((id) => ITEMS[id].name),
    });
    saveMeta(this.meta);
    this.game.events.emit('echo-shards-changed');
  }

  /** After the last realm, the echoes loop: a fresh set of realms, louder than before. */
  private enterNextResonance(): void {
    this.resonance += 1;
    this.lore.learn('tribulation');
    music.sting('sting-tribulation');
    this.prepareDungeonLayouts((this.seed * 1664525 + 1013904223 + this.resonance) >>> 0);
    this.startTheme(0);
    this.meta = loadMeta();
    this.meta.bestResonance = Math.max(this.meta.bestResonance, this.resonance + 1);
    saveMeta(this.meta);
    // Completing every realm is the feat for the last form (it follows the home warden if that has not fallen yet).
    const ascended = this.earnFeat('homeWarden') ?? this.earnFeat('loop');
    if (ascended) this.time.delayedCall(1200, () => this.showBanner(ascended));
  }

  private setupRealmAlly(themeId: DungeonThemeId): void {
    this.realmAlly = undefined;
    const heroId = REALM_HEROES[themeId];
    if (this.coopSnapshot || heroId === this.heroId || this.blessings.has(heroId) || this.random.next() > REALM_ALLY_CHANCE) return;
    const rooms = this.dungeon.rooms.filter((room) => room.kind !== 'start' && room.kind !== 'boss' && !this.roomFeatures.has(room.id));
    if (rooms.length === 0) return;
    this.realmAlly = { heroId, roomId: rooms[this.random.integer(0, rooms.length - 1)].id, met: false };
  }

  /** The realm's hero appears in their room once it is sealed; walking up to them grants a blessing. */
  private updateRealmAlly(): void {
    const ally = this.realmAlly;
    if (!ally || ally.met || this.currentRoom.id !== ally.roomId || !this.clearedRooms.has(ally.roomId)) return;
    if (!ally.sprite) {
      const scale = ally.heroId === 'li-yunfeng' ? 0.31 : 0.33;
      ally.sprite = this.add.sprite(this.roomBounds.centerX + 110, this.roomBounds.centerY - 30, `hall:${ally.heroId}:idle:S`, 0).setScale(scale).setAlpha(0);
      ally.sprite.setDepth(actorDepth(ally.sprite.y));
      if (this.anims.exists(`hall-anim:${ally.heroId}:idle:S`)) ally.sprite.play(`hall-anim:${ally.heroId}:idle:S`);
      this.tweens.add({ targets: ally.sprite, alpha: 1, duration: 500 });
    }
    if (Phaser.Math.Distance.Between(this.hero.x, this.hero.y, ally.sprite.x, ally.sprite.y) > 40) return;
    ally.met = true;
    this.blessings.add(ally.heroId);
    const blessing = BLESSINGS[ally.heroId];
    if (ally.heroId === 'li-yunfeng') this.power += 0.25;
    else if (ally.heroId === 'seo-jiwon') this.blessingSpeed = 1.15;
    else { this.maxHealth += 1; this.health = Math.min(this.maxHealth, this.health + 1); }
    this.spawnFloatingText(ally.sprite.x, ally.sprite.y - 44, blessing.line, '#f6eedb', 2600);
    this.showBanner(`${blessing.name.toUpperCase()}\nA REALM HERO'S BLESSING`);
    const sprite = ally.sprite;
    this.time.delayedCall(2600, () => { if (sprite.active) this.tweens.add({ targets: sprite, alpha: 0, y: sprite.y - 12, duration: 600, onComplete: () => sprite.destroy() }); });
    ally.sprite = undefined;
  }

  /** Basic attacks carry relic damage and the hero's infusion. */
  private basicHit(enemy: EnemyActor, amount: number): void {
    const crit = this.random.next() < this.heroMods.critChance;
    const damage = Math.round(amount * this.loadout.basicDamageMultiplier * (1 + this.heroMods.basicDamage) * (crit ? 1.8 : 1));
    if (crit) { this.spawnFloatingText(enemy.sprite.x, enemy.sprite.y - enemy.headOffset - 4, 'CRIT', '#ffd982', 500); this.audioFeedback?.play('crit'); }
    this.damageEnemy(enemy, damage);
    if (enemy.health <= 0) return;
    switch (this.loadout.infusion) {
      case 'frost-infusion': enemy.slowRemainingMs = Math.max(enemy.slowRemainingMs, 1600 + 700 * (this.loadout.infusionLevel - 1)); enemy.sprite.setTint(0x9cf0ff); this.time.delayedCall(160, () => enemy.sprite.active && enemy.sprite.clearTint()); break;
      case 'ember-infusion': enemy.burnMs = 2400 + 1000 * (this.loadout.infusionLevel - 1); enemy.burnDamage = 4 + 2 * (this.loadout.infusionLevel - 1); break;
      case 'storm-infusion': {
        // Arcs to one more foe per level.
        let from = enemy;
        const struck = new Set<EnemyActor>([enemy]);
        for (let jump = 0; jump < this.loadout.infusionLevel; jump += 1) {
        const next = this.enemies.filter((other) => !struck.has(other)).sort((a, b) => Phaser.Math.Distance.Between(a.sprite.x, a.sprite.y, from.sprite.x, from.sprite.y) - Phaser.Math.Distance.Between(b.sprite.x, b.sprite.y, from.sprite.x, from.sprite.y))[0];
        if (!next || Phaser.Math.Distance.Between(next.sprite.x, next.sprite.y, from.sprite.x, from.sprite.y) > 130) break;
        struck.add(next);
        const origin = from;
        from = next;
        const arc = this.add.graphics().setDepth(31);
        arc.lineStyle(2, 0xe7d4ff, 0.95).beginPath().moveTo(origin.sprite.x, origin.sprite.y);
        for (let step = 1; step < 5; step += 1) arc.lineTo(Phaser.Math.Linear(origin.sprite.x, next.sprite.x, step / 5) + Phaser.Math.Between(-6, 6), Phaser.Math.Linear(origin.sprite.y, next.sprite.y, step / 5) + Phaser.Math.Between(-6, 6));
        arc.lineTo(next.sprite.x, next.sprite.y).strokePath();
        this.tweens.add({ targets: arc, alpha: 0, duration: 200, onComplete: () => arc.destroy() });
        this.damageEnemy(next, Math.round(damage * 0.5));
        }
        break;
      }
      default: break;
    }
  }

  private retaliateWithThorns(): void {
    const damage = this.loadout.thornDamage;
    if (damage <= 0) return;
    const target = this.enemies.find((enemy) => Phaser.Math.Distance.Between(enemy.sprite.x, enemy.sprite.y, this.hero.x, this.hero.y) < 90);
    if (target) this.damageEnemy(target, damage);
  }

  collectItem(id: ItemId, x: number, y: number): void {
    const item = ITEMS[id];
    if (item.kind === 'relic') this.tutorial.hint('relic');
    if (id === 'spirit-peach') { this.health = Math.min(this.maxHealth, this.health + 2); if (this.coopSnapshot) this.coopRun.reportHeal(2); }
    else if (id === 'jade-elixir') { this.maxHealth += 1; this.health = this.maxHealth; if (this.coopSnapshot) { this.coopRun.reportMaxHealth(1); this.coopRun.reportHeal(this.maxHealth); } }
    else if (id === 'qi-crystal') this.abilityCooldownMs = 0;
    const replaced = this.loadout.add(id);
    this.lore.learn(`item:${id}`);
    if (id === 'jade-slip') { this.lore.readJadeSlip(x, y); return; }
    if (id === 'echo-shard') {
      this.runShards += 1;
      const meta = loadMeta();
      meta.shards += 1;
      saveMeta(meta);
      this.game.events.emit('echo-shards-changed');
    }
    this.audioFeedback?.play(id === 'echo-shard' ? 'pickup-stone' : item.rarity === 'common' ? 'pickup-item' : 'pickup-rare');
    if (id === 'spirit-peach' || id === 'jade-elixir') this.audioFeedback?.play('heal', 0.7);
    this.spawnFloatingText(x, y - 18, id === 'echo-shard' ? '+1 SPIRIT STONE' : `${item.name.toUpperCase()}\n${item.blurb}${replaced ? `  (replaces ${ITEMS[replaced].name})` : ''}`, item.rarity === 'warden' ? '#9cf0ff' : item.rarity === 'rare' ? '#e7d4ff' : '#ffe39b', id === 'echo-shard' ? 900 : 1800);
  }

  spawnFloatingText(x: number, y: number, text: string, color: string, durationMs = 1400): void {
    const label = this.add.text(x, y, text, {
      fontFamily: 'Cinzel, Georgia, serif', fontSize: '8px', color, align: 'center', stroke: '#06100d', strokeThickness: 3, wordWrap: { width: 170 },
    }).setOrigin(0.5, 1).setDepth(92).setResolution(3).setScale(this.settings.textScale);
    this.tweens.add({ targets: label, y: y - 16, duration: durationMs, ease: 'Sine.Out' });
    this.tweens.add({ targets: label, alpha: 0, delay: durationMs * 0.7, duration: durationMs * 0.3, onComplete: () => label.destroy() });
  }

  private enterRoom(room: GeneratedRoom, fromDirection: 'N' | 'E' | 'S' | 'W'): void {
    this.currentRoom = room;
    this.visitedRooms.add(room.id);
    this.clearRoomObjects();
    this.drawRoom(room);
    // Character art extends below its gameplay origin. Move the actor fully
    // beyond the threshold so its feet never appear embedded in a sealed wall.
    const spawn = {
      N: { x: ROOM_CENTER.x, y: this.roomBounds.top + 145 * this.roomScale }, E: { x: this.roomBounds.right - 140 * this.roomScale, y: ROOM_CENTER.y },
      S: { x: ROOM_CENTER.x, y: this.roomBounds.bottom - 150 * this.roomScale }, W: { x: this.roomBounds.left + 140 * this.roomScale, y: ROOM_CENTER.y },
    }[fromDirection];
    this.hero.setPosition(spawn.x, spawn.y);
    this.roomEntryPoint = { x: spawn.x, y: spawn.y };
    const feature = this.roomFeatures.get(room.id);
    this.elitesThisRoom = 0;
    if (room.kind !== 'start' && room.kind !== 'boss' && !this.coopSnapshot) {
      // Cover and traps belong to the room: the same ones every visit.
      const hash = roomLayoutSeed(this.seed, room.id);
      const grid = { originX: this.roomBounds.x, originY: this.roomBounds.y, tile: this.tileSize, columns: 19, rows: 13 };
      const cover = coverLayout(new SeededRandom(hash ^ 0xc0de), feature);
      this.features.spawnCover(this.dungeon.themeId, cover, grid);
      const calm = feature === 'merchant' || feature === 'altar' || feature === 'trial' || feature === 'protector';
      if (!calm) {
        const traps = Math.min(11, 2 + this.themeIndex + this.resonance + (this.trials.has('trapped') ? 3 : 0) + (feature === 'vault' ? 3 : 0));
        this.trapSystem.spawn(new SeededRandom(hash), traps, grid, this.roomScale, [spawn, this.roomPoint(0, 0)], new Set(cover.map((piece) => `${piece.column},${piece.row}`)));
      }
      this.featureRooms.setUpFeatureRoom(room, feature);
    }
    if (!this.clearedRooms.has(room.id)) this.spawnEncounter(room);
    this.tutorial.onEnterRoom(room, this.resumedRun);
    this.resumedRun = false;
    this.hintsForRoom(room, feature);
    if (feature === 'protector' && !this.clearedRooms.has(room.id)) this.showBanner(`${PROTECTOR_TITLE.toUpperCase()}\n${PROTECTORS[this.dungeon.themeId].name.toUpperCase()}`);
    this.transitionLockedMs = 350;
    this.saveRunSnapshot();
  }

  drawRoom(room: GeneratedRoom): void {
    this.roomBackground?.destroy();
    this.roomBackground = this.add.image(this.roomBounds.centerX, this.roomBounds.centerY, roomTextureKey(this.dungeon.themeId, room.doorMask))
      .setDisplaySize(this.roomBounds.width, this.roomBounds.height)
      .setDepth(0);
    this.roomGraphics.clear();
  }

  private spawnEncounter(room: GeneratedRoom): void {
    this.audioFeedback?.play('door-seal');
    if (room.kind === 'boss') { const point = this.roomPoint(0, -0.15); this.enemyAI.spawnEnemy('boss', point.x, point.y); music.setTrack('warden'); return; }
    if (this.roomFeatures.get(room.id) === 'protector') { const point = this.roomPoint(0, -0.2); this.enemyAI.spawnEnemy('protector', point.x, point.y); music.setTrack('protector'); return; }
    // More enemies as the run goes on.
    this.enemyAI.spawnWave(Math.min(11, 3 + this.themeIndex + Math.floor(this.visitedRooms.size / 4) + this.resonance + (this.trials.has('relentless') ? 2 : 0)));
  }

  private updatePlayer(delta: number): void {
    let x = this.movement?.x ?? 0;
    let y = this.movement?.y ?? 0;
    if (this.keys && this.cursors) {
      if (this.keys.left.isDown || this.cursors.left.isDown) x -= 1;
      if (this.keys.right.isDown || this.cursors.right.isDown) x += 1;
      if (this.keys.up.isDown || this.cursors.up.isDown) y -= 1;
      if (this.keys.down.isDown || this.cursors.down.isDown) y += 1;
    }
    const aim = this.aimAngle();
    this.actor.aim(aim);
    const length = Math.hypot(x, y);
    const moving = length > 0;
    this.lastMoveX = moving ? x / length : 0;
    this.lastMoveY = moving ? y / length : 0;
    const before = this.actor.snapshot();
    if (moving) {
      x /= length; y /= length;
      this.facing = direction8FromVector(x, y, this.facing);
      this.actor.move(this.facing, true);
      const passiveSpeed = this.moonfireSystem?.snapshot().movementSpeedMultiplier ?? 1;
      const speed = this.config.movementSpeed * 0.72 * passiveSpeed * this.loadout.moveSpeedMultiplier * this.blessingSpeed * (1 + this.heroMods.moveSpeed);
      const movement = moveWithCollision(
        { x: this.hero.x, y: this.hero.y },
        { x: x * speed * delta / 1000, y: y * speed * delta / 1000 },
        (candidateX, candidateY) => !this.isSolidAt(candidateX, candidateY + 18),
        2,
      );
      this.hero.setPosition(movement.x, movement.y);
      if (movement.moved) this.spawnMovementParticle(delta);
    } else if (before.state === 'idle' || before.state === 'move') this.actor.stop();
    this.recoverPlayerFromSolid();
    if (this.tileAtWorld(this.hero.x, this.hero.y + 18) === DungeonTile.Hazard) this.damagePlayer(1);
    this.constrainOrTransition();
    this.actor.update(delta);
    const snapshot = this.actor.snapshot();
    this.releaseActionIfReady(snapshot.state, snapshot.stateElapsedMs);
    const animation = this.config.animations[snapshot.state];
    const progress = animation.loop ? (snapshot.stateElapsedMs % animation.durationMs) / animation.durationMs : Math.min(1, snapshot.stateElapsedMs / animation.durationMs);
    const frameCount = heroFrameCount(this.heroAsset, snapshot.state);
    const frameIndex = Math.min(frameCount - 1, Math.floor(progress * frameCount));
    const renderedFacing = facingForRenderedState(snapshot.state, snapshot.orientation.movementDirection, snapshot.orientation.facingDirection);
    this.hero.render(snapshot.state, renderedFacing, progress, frameIndex);
    this.hero.setDepth(actorDepth(this.hero.y));
    this.aura?.update(this.hero.x, this.hero.y, this.hero.depth, delta, this.hero.visible && !this.fall);
    this.hero.setAlpha(this.invulnerableMs > 0 && Math.floor(this.invulnerableMs / 90) % 2 === 0 ? 0.35 : this.hero.alpha);
    this.heroLight?.setPosition(this.hero.x, this.hero.y + 10).setTint(this.themeColor()).setVisible(!this.settings.reduceMotion);
    if (this.cultivatorSwordView) {
      const releaseName = snapshot.state === 'attack' ? this.config.basicAttack?.releaseEvent : snapshot.state === 'ability' ? this.config.activeAbility?.releaseEvent : undefined;
      const releaseTime = animation.events?.find((event) => event.name === releaseName)?.normalizedTime ?? 0.5;
      this.cultivatorSwordView.sync({ x: this.hero.x, y: this.hero.y }, snapshot.state, snapshot.stateElapsedMs, snapshot.stateDurationMs, snapshot.orientation.movementDirection, snapshot.orientation.aimAngle, releaseTime);
    }
    this.flushBufferedAction();
  }

  private constrainOrTransition(): void {
    if (this.coopSnapshot) {
      this.hero.x = Phaser.Math.Clamp(this.hero.x, this.roomBounds.left + 18, this.roomBounds.right - 18);
      this.hero.y = Phaser.Math.Clamp(this.hero.y, this.roomBounds.top + 18, this.roomBounds.bottom - 28);
      return;
    }
    const open = this.clearedRooms.has(this.currentRoom.id) && this.hostileCount === 0 && this.transitionLockedMs <= 0 && !this.trial;
    const doorHalf = 48 * this.roomScale;
    const centerX = this.roomBounds.centerX;
    const centerY = this.roomBounds.centerY;
    const tryExit = (direction: 'N' | 'E' | 'S' | 'W'): boolean => {
      if (!open || (this.currentRoom.doorMask & DOOR_BITS[direction]) === 0) return false;
      const offset = DIRECTION_OFFSET[direction];
      const next = this.dungeon.rooms.find((room) => room.x === this.currentRoom.x + offset.x && room.y === this.currentRoom.y + offset.y);
      if (!next) return false;
      const opposite = ({ N: 'S', E: 'W', S: 'N', W: 'E' } as const)[direction];
      this.enterRoom(next, opposite);
      return true;
    };
    if (this.hero.y < this.roomBounds.top + 25 && Math.abs(this.hero.x - centerX) < doorHalf && tryExit('N')) return;
    if (this.hero.x > this.roomBounds.right - 25 && Math.abs(this.hero.y - centerY) < doorHalf && tryExit('E')) return;
    if (this.hero.y > this.roomBounds.bottom - 35 && Math.abs(this.hero.x - centerX) < doorHalf && tryExit('S')) return;
    if (this.hero.x < this.roomBounds.left + 25 && Math.abs(this.hero.y - centerY) < doorHalf && tryExit('W')) return;
    this.hero.x = Phaser.Math.Clamp(this.hero.x, this.roomBounds.left + 18, this.roomBounds.right - 18);
    this.hero.y = Phaser.Math.Clamp(this.hero.y, this.roomBounds.top + 18, this.roomBounds.bottom - 28);
  }

  private configureHeroAbilitySystems(): void {
    this.clearHeroAbilitySystems();
    const ability = this.config.activeAbility;
    if (ability?.kind === 'flying_sword') {
      this.cultivatorSwordView = new CultivatorSwordArrayView(this);
      this.abilityProjectileSystem = new FlyingSwordSystem(ability.projectile);
      this.sealSystem = new SectlessSealSystem(ability.seal);
      this.sealView = new SectlessSealView(this);
      this.abilityProjectileView = new FlyingSwordView(this, {
        projectileEffect: 'flying_sword', trailEffect: 'flying_sword_trail', impactEffect: 'flying_sword_impact', summonEffect: 'flying_sword_summon',
        projectileScale: 0.62, trailBehindDistance: 36, trailScale: 0.6, trailAlpha: 0.72, trailIntervalMs: 62, summonScale: 0.68, impactScale: 0.58,
      });
    } else if (ability?.kind === 'foxfire_summon') {
      this.summonSystem = new FoxfireSummonSystem(ability.familiar);
      this.summonView = new FoxfireSummonView(this);
      this.summonProjectileSystem = new FlyingSwordSystem(ability.projectile);
      this.summonProjectileView = new FlyingSwordView(this, {
        projectileEffect: 'rei_foxfire_bolt', trailEffect: 'rei_foxfire_bolt', impactEffect: 'rei_moonfox_hit', summonEffect: 'rei_fire_fox_summon',
        artAngleOffset: Math.PI, trailBehindDistance: 14, trailAlpha: 0.32, trailIntervalMs: 75, summonScale: 0.62, impactScale: 0.72,
      });
      if (this.config.passive?.kind === 'moonfire_halo') {
        this.moonfireSystem = new MoonfireStackSystem(this.config.passive);
        this.moonfireView = new MoonfireStackView(this);
      }
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
    }
  }

  private beginAction(type: ActionType): void {
    if (this.paused || this.runEnded || this.portalTravelPending) return;
    if (type === 'attack' && this.attackCooldownMs > 0) {
      if (this.attackCooldownMs <= 180) this.bufferedAction = { type, remainingMs: 220 };
      return;
    }
    if (type === 'ability' && this.abilityCooldownMs > 0) return;
    const before = this.actor.snapshot();
    if (!this.actor.canStartAction()) {
      if (before.state !== 'death') this.bufferedAction = { type, remainingMs: 220 };
      return;
    }
    const definition = type === 'attack' ? this.config.basicAttack : this.config.activeAbility;
    if (!definition) return;
    const aimRadians = this.aimAngle();
    this.actor.aim(aimRadians);
    this.facing = direction8FromAngle(aimRadians);
    type === 'attack' ? this.actor.attack() : this.actor.useAbility();
    if (type === 'ability' && this.heroMods.castShieldMs > 0) this.invulnerableMs = Math.max(this.invulnerableMs, this.heroMods.castShieldMs);
    if (type === 'attack') this.attackCooldownMs = 330;
    else if (this.reserveQi) { this.reserveQi = false; this.abilityCooldownMs = 0; this.spawnFloatingText(this.hero.x, this.hero.y - 40, 'POCKET QI', '#9cf0ff'); }
    else this.abilityCooldownMs = this.abilityCooldownTotal;
    this.actionSequence += 1;
    this.pendingAction = { type, eventName: definition.releaseEvent, castId: `${this.config.id}-${type}-${this.actionSequence}`, aimRadians, released: false };
    this.bufferedAction = undefined;
    if (type === 'attack') this.coopClient?.attack();
    else this.coopClient?.ability();
    this.audioFeedback?.play(HERO_SOUNDS[this.heroId][type === 'attack' ? 'attack' : 'ability']);
  }

  private flushBufferedAction(): void {
    const buffered = this.bufferedAction;
    if (!buffered || !this.actor.canStartAction()) return;
    this.beginAction(buffered.type);
  }

  private releaseActionIfReady(state: CharacterState, elapsedMs: number): void {
    const pending = this.pendingAction;
    if (!pending || pending.released) return;
    const expectedState: CharacterState = pending.type === 'attack' ? 'attack' : 'ability';
    if (state !== expectedState) return;
    const animation = this.config.animations[expectedState];
    const event = animation.events?.find((entry) => entry.name === pending.eventName);
    if (!event || elapsedMs < animation.durationMs * event.normalizedTime) return;
    pending.aimRadians = this.aimAngle();
    this.actor.aim(pending.aimRadians);
    pending.released = true;
    if (pending.type === 'attack') this.releaseBasicAttack(pending);
    else this.releaseAbility(pending);
  }

  private releaseBasicAttack(pending: PendingAction): void {
    const attack = this.config.basicAttack;
    if (!attack) return;
    if (attack.kind === 'projectile' && this.basicProjectileSystem) {
      this.basicProjectileSystem.spawn({ castId: pending.castId, casterId: this.config.id, origin: this.projectileOrigin(pending.aimRadians, 26), aimRadians: pending.aimRadians });
      return;
    }
    const hitX = this.hero.x + Math.cos(pending.aimRadians) * attack.range;
    const hitY = this.hero.y + Math.sin(pending.aimRadians) * attack.range;
    let hitConfirmed = false;
    for (const enemy of [...this.enemies]) {
      if (Phaser.Math.Distance.Between(hitX, hitY, enemy.sprite.x, enemy.sprite.y) > attack.radius + enemy.radius) continue;
      hitConfirmed = true;
      const targetId = this.enemyTargetId(enemy);
      this.basicHit(enemy, attack.damage * this.power);
      const detonation = this.sealSystem?.recall(targetId);
      if (detonation) this.resolveSectlessDetonation(detonation);
    }
    const vfx = attack.vfx ?? { slashEffect: 'sectless_slash', impactEffect: 'flying_sword_impact', slashScale: 0.55, impactScale: 0.3 };
    this.effectPool.spawn({ effectId: vfx.slashEffect, x: hitX, y: hitY, rotation: pending.aimRadians, scale: vfx.slashScale });
    if (hitConfirmed) this.effectPool.spawn({ effectId: vfx.impactEffect, x: hitX, y: hitY, rotation: pending.aimRadians, scale: vfx.impactScale });
  }

  private releaseAbility(pending: PendingAction): void {
    this.tutorial.onAbility();
    const ability = this.config.activeAbility;
    if (!ability) return;
    const origin = this.projectileOrigin(pending.aimRadians, 28);
    if (ability.kind === 'flying_sword' && this.abilityProjectileSystem) {
      this.abilityProjectileView?.summon(origin.x, origin.y, pending.aimRadians);
      this.abilityProjectileSystem.spawn({ castId: pending.castId, casterId: this.config.id, origin, aimRadians: pending.aimRadians });
    } else if (ability.kind === 'foxfire_summon' && this.summonSystem) {
      const empowerment = this.moonfireSystem?.consumeForSummon();
      this.effectPool.spawn({ effectId: 'rei_fire_fox_summon', x: this.hero.x, y: this.hero.y, scale: 0.82 });
      this.summonSystem.summon({ castId: pending.castId, ownerId: this.config.id, owner: { x: this.hero.x, y: this.hero.y }, bounds: this.floorBounds, empowerment });
      this.summonView?.sync(this.summonSystem.snapshots());
    } else if (ability.kind === 'shadow_dash' && this.dashSystem) {
      this.dashHits.clear();
      this.echoHits.clear();
      this.dashTrailElapsed = 0;
      const originPoint = { x: this.hero.x, y: this.hero.y };
      this.dashSystem.start(originPoint, pending.aimRadians);
      this.echoSystem?.start(originPoint, pending.aimRadians);
      this.invulnerableMs = Math.max(this.invulnerableMs, ability.durationMs + 160);
      this.effectPool.spawn({ effectId: ability.vfx.foldEffect, x: this.hero.x, y: this.hero.y, scale: ability.vfx.foldScale });
    }
  }

  private updateHeroAbilities(delta: number): void {
    this.updateHeroProjectileSet(this.abilityProjectileSystem, this.abilityProjectileView, delta, true);
    this.updateHeroProjectileSet(this.basicProjectileSystem, this.basicProjectileView, delta, false);
    this.updateHeroProjectileSet(this.summonProjectileSystem, this.summonProjectileView, delta, true);
    this.updateDashAndEcho(delta);
    this.updateSummons(delta);
    const passive = this.moonfireSystem?.update(delta);
    if (passive) this.moonfireView?.sync(passive, { x: this.hero.x, y: this.hero.y }, this.time.now);
    for (const detonation of this.sealSystem?.update(delta) ?? []) this.resolveSectlessDetonation(detonation);
    this.sealView?.sync(this.sealSystem?.snapshots() ?? [], this.time.now);
  }

  private updateHeroProjectileSet(system: FlyingSwordSystem | undefined, view: FlyingSwordView | undefined, delta: number, isAbility: boolean): void {
    if (!system || !view) return;
    system.update(delta);
    system.removeWhere((sword) => {
      if (!this.features.stopsShot(sword.x, sword.y, sword.collisionRadius)) return false;
      view.impact({ projectileId: sword.id, targetId: 'cover', x: sword.x, y: sword.y, damage: 0, angleRadians: sword.angleRadians });
      return true;
    });
    for (const enemy of [...this.enemies]) {
      for (const hit of system.collideCircle({ id: this.enemyTargetId(enemy), x: enemy.sprite.x, y: enemy.sprite.y, radius: enemy.radius })) {
        this.applyHeroProjectileHit(enemy, hit, isAbility);
        view.impact(hit);
        if (enemy.health <= 0) break;
      }
    }
    system.removeOutside(this.roomBounds);
    view.sync(system.snapshots(), delta);
  }

  private applyHeroProjectileHit(enemy: EnemyActor, hit: ProjectileHit, isAbility: boolean): void {
    const passiveBonus = !isAbility ? this.moonfireSystem?.snapshot().basicDamageBonus ?? 0 : 0;
    if (isAbility) this.damageEnemy(enemy, Math.round(hit.damage * this.abilityPower));
    else this.basicHit(enemy, (hit.damage + passiveBonus) * this.power);
    if (!isAbility && this.moonfireSystem) {
      const before = this.moonfireSystem.snapshot().stacks;
      const after = this.moonfireSystem.gain().stacks;
      if (after > before) this.effectPool.spawn({ effectId: 'foxfire_impact', x: this.hero.x, y: this.hero.y - 18, scale: 0.34 });
    }
    if (!isAbility) return;
    if (this.config.activeAbility?.kind === 'foxfire_summon') enemy.slowRemainingMs = this.config.activeAbility.slowMs;
    if (this.config.activeAbility?.kind === 'flying_sword') {
      this.sealSystem?.apply({ id: this.enemyTargetId(enemy), x: enemy.sprite.x, y: enemy.sprite.y });
    }
  }

  private updateDashAndEcho(delta: number): void {
    const ability = this.config.activeAbility;
    if (ability?.kind !== 'shadow_dash' || !this.dashSystem) return;
    const dash = this.dashSystem.update(delta);
    if (dash) {
      const movement = moveWithCollision(
        { x: this.hero.x, y: this.hero.y },
        { x: dash.x - this.hero.x, y: dash.y - this.hero.y },
        (candidateX, candidateY) => !this.isSolidAt(candidateX, candidateY + 18),
        3,
      );
      this.hero.setPosition(movement.x, movement.y);
      this.features.breakUrnsNear(this.hero.x, this.hero.y + 18, ability.collisionRadius);
      this.dashTrailElapsed += delta;
      if (this.dashTrailElapsed >= ability.vfx.trailIntervalMs) {
        this.effectPool.spawn({ effectId: ability.vfx.trailEffect, x: this.hero.x, y: this.hero.y, rotation: dash.angleRadians + Math.PI, scale: ability.vfx.trailScale, fadeDurationMs: 220 });
        this.dashTrailElapsed = 0;
      }
      for (const enemy of [...this.enemies]) {
        if (this.dashHits.has(enemy.id)) continue;
        if (Phaser.Math.Distance.Between(this.hero.x, this.hero.y, enemy.sprite.x, enemy.sprite.y) > ability.collisionRadius + enemy.radius) continue;
        this.dashHits.add(enemy.id);
        this.damageEnemy(enemy, Math.round(ability.damage * this.abilityPower));
        this.effectPool.spawn({ effectId: ability.vfx.hitEffect, x: enemy.sprite.x, y: enemy.sprite.y, rotation: dash.angleRadians, scale: 0.64 });
      }
      if (!dash.active) this.effectPool.spawn({ effectId: ability.vfx.foldEffect, x: this.hero.x, y: this.hero.y, scale: ability.vfx.foldScale });
    }
    const echo = this.echoSystem?.update(delta);
    this.echoView?.sync(echo);
    if (!echo || echo.phase !== 'striking') return;
    for (const enemy of [...this.enemies]) {
      if (this.echoHits.has(enemy.id)) continue;
      if (Phaser.Math.Distance.Between(echo.x, echo.y, enemy.sprite.x, enemy.sprite.y) > ability.echo.collisionRadius + enemy.radius) continue;
      this.echoHits.add(enemy.id);
      this.damageEnemy(enemy, Math.round(ability.echo.damage * this.abilityPower));
      this.echoView?.rupture(enemy.sprite.x, enemy.sprite.y, echo.angleRadians, 0.88);
    }
    if (!echo.active) this.echoView?.rupture(echo.x, echo.y, echo.angleRadians, 0.78);
  }

  private updateSummons(delta: number): void {
    const targets = this.enemies.map((enemy) => ({ id: this.enemyTargetId(enemy), x: enemy.sprite.x, y: enemy.sprite.y, health: enemy.health }));
    const attacks = this.summonSystem?.update(delta, { x: this.hero.x, y: this.hero.y }, targets, this.floorBounds) ?? [];
    this.summonView?.sync(this.summonSystem?.snapshots() ?? []);
    for (const attack of attacks) {
      this.summonProjectileSystem?.spawn({ castId: attack.shotId, casterId: attack.familiarId, origin: attack.origin, aimRadians: attack.aimRadians });
    }
  }

  private resolveSectlessDetonation(detonation: SectlessDetonation): void {
    this.features.breakUrnsNear(detonation.x, detonation.y, detonation.radius);
    for (const enemy of [...this.enemies]) {
      if (Phaser.Math.Distance.Between(detonation.x, detonation.y, enemy.sprite.x, enemy.sprite.y) <= detonation.radius + enemy.radius) {
        this.damageEnemy(enemy, Math.round(detonation.damage * this.abilityPower));
      }
    }
    this.effectPool.spawn({ effectId: 'flying_sword_impact', x: detonation.x, y: detonation.y, scale: 0.72 });
    this.effectPool.spawn({ effectId: 'sectless_slash', x: detonation.x, y: detonation.y, rotation: detonation.stacks * 0.45, scale: 0.68 });
  }

  private projectileOrigin(angle: number, distance: number): { x: number; y: number } {
    return { x: this.hero.x + Math.cos(angle) * distance, y: this.hero.y + Math.sin(angle) * distance };
  }

  private enemyTargetId(enemy: EnemyActor): string {
    return `enemy-${enemy.id}`;
  }




  ensureRemoteHero(snapshot: CoopRoomSnapshot): void {
    const membership = this.coopClient?.currentMembership;
    const others = snapshot.players.filter((player) => player.id !== membership?.playerId);
    for (const [id, remote] of this.remoteHeroes) {
      if (others.some((player) => player.id === id)) continue;
      remote.view.destroy();
      this.remoteHeroes.delete(id);
    }
    for (const player of others) {
      if (this.remoteHeroes.has(player.id)) continue;
      const view = new CharacterView(this, getCharacter(player.heroId), player.x, player.y, 'gameplay').setDepth(actorDepth(player.y));
      // Party members may share a hero, so each ally carries their name.
      view.add(this.add.text(0, -52, player.name, { fontFamily: "'IBM Plex Mono', monospace", fontSize: '9px', color: '#e9e0c4', backgroundColor: '#07100ecc', padding: { x: 4, y: 2 } }).setOrigin(0.5).setResolution(3));
      this.remoteHeroes.set(player.id, { view, state: 'idle', elapsedMs: 0, previous: { x: player.x, y: player.y } });
    }
  }

  private updateRemoteHero(delta: number): void {
    if (!this.coopClient?.currentMembership || !this.coopSnapshot) return;
    for (const [id, entry] of this.remoteHeroes) {
      const remote = this.coopClient.samplePlayer(id) ?? this.coopSnapshot.players.find((player) => player.id === id);
      if (!remote) continue;
      const nextState: CharacterState = remote.downed ? 'death' : remote.action === 'attack' ? 'attack' : remote.action === 'ability' ? 'ability' : remote.action === 'move' ? 'move' : 'idle';
      if (nextState !== entry.state) { entry.state = nextState; entry.elapsedMs = 0; } else entry.elapsedMs += delta;
      const animation = getCharacter(remote.heroId).animations[nextState];
      const progress = animation.loop ? (entry.elapsedMs % animation.durationMs) / animation.durationMs : Math.min(1, entry.elapsedMs / animation.durationMs);
      const frameCount = heroFrameCount(HERO_ASSETS[remote.heroId], nextState);
      const frameIndex = Math.min(frameCount - 1, Math.floor(progress * frameCount));
      const movementFacing = direction8FromVector(remote.x - entry.previous.x, remote.y - entry.previous.y, direction8FromAngle(remote.aimRadians));
      const facing = facingForRenderedState(nextState, movementFacing, direction8FromAngle(remote.aimRadians));
      entry.view.setPosition(remote.x, remote.y).setDepth(actorDepth(remote.y));
      entry.view.render(nextState, facing, progress, frameIndex);
      entry.previous = { x: remote.x, y: remote.y };
    }
  }


  spawnProjectile(
    x: number,
    y: number,
    angle: number,
    speed: number,
    hostile: boolean,
    damage: number,
    radius: number,
    _color: number,
    style: CombatProjectile['style'] = 'sentinel',
  ): void {
    if (hostile) this.audioFeedback?.play('enemy-shot', 0.5);
    const texture = `enemy-projectile:${this.dungeon.themeId}:${style}`;
    const hostileScale = style === 'boss' ? 0.25 : style === 'heavy' ? 0.22 : style === 'hunter' ? 0.16 : 0.18;
    const view = this.add.image(x, y, texture, 0)
      .setRotation(angle)
      .setScale(hostileScale)
      .setBlendMode(Phaser.BlendModes.NORMAL)
      .setDepth(30);
    this.projectiles.push({
      view,
      velocity: new Phaser.Math.Vector2(Math.cos(angle) * speed, Math.sin(angle) * speed),
      hostile,
      damage,
      radius,
      theme: this.dungeon.themeId,
      style,
      previousX: x,
      previousY: y,
      lifeMs: 4200,
      trailMs: 0,
    });
  }

  private updateProjectiles(delta: number): void {
    for (const projectile of [...this.projectiles]) {
      projectile.lifeMs -= delta;
      projectile.trailMs -= delta;
      projectile.previousX = projectile.view.x;
      projectile.previousY = projectile.view.y;
      projectile.view.x += projectile.velocity.x * delta / 1000;
      projectile.view.y += projectile.velocity.y * delta / 1000;
      if (projectile.hostile && projectile.trailMs <= 0) {
        projectile.trailMs = projectile.style === 'boss' ? 42 : 64;
        this.spawnProjectileAfterimage(projectile);
      }
      let remove = projectile.lifeMs <= 0 || !Phaser.Geom.Rectangle.Inflate(Phaser.Geom.Rectangle.Clone(this.roomBounds), 20, 20).contains(projectile.view.x, projectile.view.y);
      let impact = false;
      // Pillars and urns stop shots from both sides; urns shatter.
      if (!remove && this.features.stopsShot(projectile.view.x, projectile.view.y, projectile.radius)) { remove = true; impact = true; }
      if (!remove && projectile.hostile && sweptCircleIntersectsCircle(
        { x: projectile.previousX, y: projectile.previousY },
        { x: projectile.view.x, y: projectile.view.y },
        projectile.radius,
        { x: this.hero.x, y: this.hero.y },
        18,
      )) {
        this.damagePlayer(projectile.damage, projectile.previousX, projectile.previousY);
        remove = true;
        impact = true;
      }
      if (!remove && !projectile.hostile) {
        for (const enemy of [...this.enemies]) {
          if (sweptCircleIntersectsCircle(
            { x: projectile.previousX, y: projectile.previousY },
            { x: projectile.view.x, y: projectile.view.y },
            projectile.radius,
            { x: enemy.sprite.x, y: enemy.sprite.y },
            enemy.radius,
          )) {
            this.damageEnemy(enemy, projectile.damage);
            remove = true;
            impact = true;
            break;
          }
        }
      }
      if (remove) this.removeProjectile(projectile, impact);
    }
  }

  private spawnProjectileAfterimage(projectile: CombatProjectile): void {
    const echo = this.add.image(projectile.view.x, projectile.view.y, projectile.view.texture.key)
      .setRotation(projectile.view.rotation)
      .setScale(projectile.view.scaleX * 0.82, projectile.view.scaleY * 0.82)
      .setAlpha(projectile.theme === 'nightfold-crypt' ? 0.42 : 0.34)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(28);
    this.tweens.add({
      targets: echo,
      alpha: 0,
      scaleX: echo.scaleX * 0.48,
      scaleY: echo.scaleY * 0.48,
      duration: projectile.style === 'boss' ? 240 : 180,
      onComplete: () => echo.destroy(),
    });
  }

  private spawnProjectileImpact(projectile: CombatProjectile): void {
    const x = projectile.view.x;
    const y = projectile.view.y;
    const fragments = projectile.theme === 'sectless-temple' ? 3 : projectile.theme === 'nightfold-crypt' ? 4 : 5;
    for (let index = 0; index < fragments; index += 1) {
      const angle = projectile.view.rotation + (index - (fragments - 1) / 2) * 0.52;
      const fragment = this.add.image(x, y, projectile.view.texture.key)
        .setRotation(angle)
        .setScale(projectile.view.scaleX * 0.52)
        .setAlpha(0.78)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(32);
      this.tweens.add({
        targets: fragment,
        x: x + Math.cos(angle) * (18 + index * 2),
        y: y + Math.sin(angle) * (18 + index * 2),
        alpha: 0,
        scaleX: fragment.scaleX * 0.35,
        scaleY: fragment.scaleY * 0.35,
        duration: 220,
        onComplete: () => fragment.destroy(),
      });
    }
  }

  damageEnemy(enemy: EnemyActor, amount: number): void {
    if (enemy.dummy) { this.tutorial.onDummyHit(enemy, amount); return; }
    if (enemy.shieldMs > 0) return;
    const hitAngle = Phaser.Math.Angle.Between(this.hero.x, this.hero.y, enemy.sprite.x, enemy.sprite.y);
    if (this.coopSnapshot && enemy.networkId) {
      // Co-op: this screen decides the hit (it is what you saw); the server applies it and
      // decides deaths. Health drops here at once and the enemy fades until the server agrees.
      if (enemy.health <= 0 || amount <= 0) return;
      this.coopClient?.hit(enemy.networkId, amount);
      const soaked = Math.min(enemy.ward ?? 0, amount);
      if (soaked > 0) { enemy.ward = (enemy.ward ?? 0) - soaked; this.spawnDamageNumber(enemy.sprite.x, enemy.sprite.y - enemy.headOffset + 6, soaked, '#8fe3ff'); }
      const dealt = amount - soaked;
      if (dealt > 0) {
        enemy.health = Math.max(0, enemy.health - dealt);
        this.spawnDamageNumber(enemy.sprite.x, enemy.sprite.y - enemy.headOffset + 6, dealt, isBig(enemy) ? '#ffe39b' : '#fff2cc');
      }
      this.audioFeedback?.play('hit');
      if (!this.settings.reduceMotion) this.hitStopMs = Math.max(this.hitStopMs, isBig(enemy) ? 52 : 34);
      this.kickCamera(hitAngle, isBig(enemy) ? 4.2 : 2.5);
      enemy.sprite.setTintFill(0xffffff);
      this.time.delayedCall(70, () => enemy.sprite.active && enemy.sprite.clearTint());
      if (enemy.health <= 0) enemy.sprite.setAlpha(0.45);
      this.enemyAI.syncEnemyView(enemy);
      return;
    }
    if (enemy.ward && enemy.ward > 0) {
      // A Warded elite's barrier soaks hits first.
      const soaked = Math.min(enemy.ward, amount);
      enemy.ward -= soaked;
      amount -= soaked;
      this.spawnDamageNumber(enemy.sprite.x, enemy.sprite.y - enemy.headOffset + 6, soaked, '#8fe3ff');
      if (enemy.ward <= 0) {
        this.audioFeedback?.play('ward-break');
        const burst = this.add.circle(enemy.sprite.x, enemy.sprite.y, enemy.radius + 6, ELITE_AFFIXES.warded.color, 0).setStrokeStyle(3, ELITE_AFFIXES.warded.color, 0.9).setDepth(31);
        this.tweens.add({ targets: burst, scale: 1.8, alpha: 0, duration: 320, onComplete: () => burst.destroy() });
      }
      if (amount <= 0) { this.audioFeedback?.play('hit'); return; }
    }
    enemy.health = Math.max(0, enemy.health - amount);
    this.spawnDamageNumber(enemy.sprite.x, enemy.sprite.y - enemy.headOffset + 6, amount, isBig(enemy) ? '#ffe39b' : '#fff2cc');
    this.audioFeedback?.play('hit');
    if (!this.settings.reduceMotion) {
      this.hitStopMs = Math.max(this.hitStopMs, isBig(enemy) ? 52 : 34);
    }
    this.kickCamera(hitAngle, isBig(enemy) ? 4.2 : 2.5);
    enemy.sprite.setTintFill(0xffffff);
    this.time.delayedCall(70, () => enemy.sprite.active && enemy.sprite.clearTint());
    if (enemy.health > 0) return;
    this.killCount += 1;
    this.lore.learn('first-kill');
    this.lore.learn(enemy.role === 'protector' ? `kill:${this.dungeon.themeId}:protector` : `kill:${this.dungeon.themeId}:${enemy.column}`);
    if (this.heroMods.killsPerHeal > 0 && this.killCount % this.heroMods.killsPerHeal === 0 && this.health < this.maxHealth) {
      this.health += 1;
      this.spawnFloatingText(this.hero.x, this.hero.y - 40, '+1 HEART', '#ff9aa5', 900);
    }
    const deathX = enemy.sprite.x;
    const deathY = enemy.sprite.y;
    this.audioFeedback?.play(enemy.elite || isBig(enemy) ? 'elite-death' : 'enemy-death');
    const index = this.enemies.indexOf(enemy);
    if (index >= 0) this.enemies.splice(index, 1);
    enemy.healthBar.destroy();
    const bossDefeated = enemy.role === 'boss';
    if (enemy.elite) this.loot.drop(eliteDrop(this.random), deathX, deathY + enemy.footOffset - 6);
    if (enemy.elite === 'sundering') this.enemyAI.sunder(enemy, deathX, deathY);
    if (enemy.role === 'protector') this.showBanner(`${PROTECTORS[this.dungeon.themeId].name.toUpperCase()}\nFALLS`);
    const burst = this.add.circle(deathX, deathY, bossDefeated ? 70 : isBig(enemy) ? 50 : 30, enemy.elite ? ELITE_AFFIXES[enemy.elite].color : this.themeColor(), 0.7).setDepth(33);
    this.tweens.add({ targets: burst, alpha: 0, scale: 1.8, duration: 380, onComplete: () => burst.destroy() });
    if (bossDefeated) {
      const portalEffect = BOSS_PORTAL_EFFECTS[this.dungeon.themeId];
      this.effectPool.spawn({ effectId: portalEffect.arrival, x: deathX, y: deathY, scale: 0.95, depth: 34 });
      this.tweens.add({
        targets: [enemy.sprite, enemy.shadow],
        alpha: 0,
        scaleX: enemy.sprite.scaleX * 1.18,
        scaleY: enemy.sprite.scaleY * 0.35,
        y: deathY + 18,
        duration: 520,
        ease: 'Cubic.In',
        onComplete: () => { enemy.sprite.destroy(); enemy.shadow.destroy(); },
      });
    } else {
      enemy.sprite.destroy();
      enemy.shadow.destroy();
    }
  }

  damagePlayer(amount: number, sourceX = this.roomBounds.centerX, sourceY = this.roomBounds.centerY): void {
    if (this.invulnerableMs > 0 || this.runEnded) return;
    if (this.coopSnapshot) {
      // Co-op: you dodge (or not) on your own screen; the server applies what landed.
      const me = this.coopSnapshot.players.find((player) => player.id === this.coopClient?.currentMembership?.playerId);
      if (!me || me.downed || this.health <= 0) return;
      if (this.random.next() < this.loadout.deflectChance) {
        this.invulnerableMs = 400;
        this.spawnFloatingText(this.hero.x, this.hero.y - 40, 'DEFLECTED', '#cfe6ef');
        this.audioFeedback?.play('deflect');
        return;
      }
      this.coopRun.reportHurt(amount);
      this.health = Math.max(0, this.health - amount);
      this.invulnerableMs = 900;
      this.spawnDamageNumber(this.hero.x, this.hero.y - 42, amount, '#ff8f94');
      this.audioFeedback?.play('hurt');
      if (!this.settings.reduceMotion) this.hitStopMs = Math.max(this.hitStopMs, 44);
      this.kickCamera(Phaser.Math.Angle.Between(sourceX, sourceY, this.hero.x, this.hero.y), 5);
      if (this.health > 0) this.actor.hurt(1);
      return;
    }
    if (this.random.next() < this.loadout.deflectChance + this.heroMods.deflect) {
      this.invulnerableMs = 400;
      this.spawnFloatingText(this.hero.x, this.hero.y - 40, 'DEFLECTED', '#cfe6ef');
      this.audioFeedback?.play('deflect');
      return;
    }
    this.retaliateWithThorns();
    this.lastHurtBy = this.pendingHurtBy ?? 'the realm';
    this.pendingHurtBy = undefined;
    this.health = Math.max(0, this.health - amount);
    this.invulnerableMs = 900;
    if (this.health > 0 && this.health <= 2) this.tutorial.hint('low-health');
    this.spawnDamageNumber(this.hero.x, this.hero.y - 42, amount, '#ff8f94');
    this.audioFeedback?.play('hurt');
    if (!this.settings.reduceMotion) {
      this.hitStopMs = Math.max(this.hitStopMs, 44);
    }
    this.kickCamera(Phaser.Math.Angle.Between(sourceX, sourceY, this.hero.x, this.hero.y), 5);
    if (this.health === 1 && this.reservePeach) {
      this.reservePeach = false;
      this.health = Math.min(this.maxHealth, 3);
      this.spawnFloatingText(this.hero.x, this.hero.y - 40, 'PACKED PEACH', '#ffe39b');
    }
    if (this.health <= 0 && this.loadout.canRevive) {
      this.loadout.phoenixSpent = true;
      this.health = 2;
      this.invulnerableMs = 2200;
      this.cameras.main.flash(260, 255, 140, 60);
      this.showBanner('PHOENIX EMBER\nYOU RISE AGAIN');
      this.audioFeedback?.play('revive');
      return;
    }
    if (this.health <= 0) {
      this.actor.kill();
      this.endRun(false);
    } else this.actor.hurt(1);
  }

  /** Real enemies in the room (the practice dummy does not count). */
  get hostileCount(): number {
    let count = 0;
    for (const enemy of this.enemies) if (!enemy.dummy) count += 1;
    return count;
  }

  /** Uses the Peddler, Altar or Bell you are standing beside (F, or USE on touch). */
  private useNearestFeature(): void {
    if (this.runEnded || this.fall || this.hostileCount > 0) return;
    const target = this.features.nearest(this.hero.x, this.hero.y + 18);
    if (target) this.featureRooms.interactWithFeature(target);
  }

  private reportUseAvailable(): void {
    const available = (!this.fall && this.hostileCount === 0 && Boolean(this.features.nearest(this.hero.x, this.hero.y + 18))) || Boolean(this.coopRun.reviveTarget());
    if (available === this.useAvailable) return;
    this.useAvailable = available;
    this.game.events.emit('dungeon-interact-available', available);
  }

  /** One-time tips for what this room holds. */
  private hintsForRoom(room: GeneratedRoom, feature: RoomFeature | undefined): void {
    if (this.tutorial.active || room.kind === 'start') return;
    if (feature === 'merchant' || feature === 'altar' || feature === 'trial' || feature === 'vault') this.tutorial.hint(feature);
    if (this.clearedRooms.has(room.id) && feature !== 'vault') return;
    if (room.kind === 'boss') this.tutorial.hint('warden');
    else if (feature === 'protector') this.tutorial.hint('protector');
    else if (feature !== 'vault') this.tutorial.hint('seal');
    if (this.trapSystem.traps.length > 0) this.tutorial.hint('traps');
    if (this.features.coverRects.length > 0) this.tutorial.hint('cover');
  }

  private updateRoomState(): void {
    if (this.runEnded || this.hostileCount > 0 || this.clearedRooms.has(this.currentRoom.id)) return;
    this.clearedRooms.add(this.currentRoom.id);
    const unlocked = this.currentRoom.kind === 'boss' ? unlockHeroForRealm(this.dungeon.themeId) : undefined;
    // Every sealed room drops a chest in its centre; the warden's lies under the echo.
    const protectorRoom = this.roomFeatures.get(this.currentRoom.id) === 'protector';
    if (this.currentRoom.kind === 'boss') this.loot.spawnChest('warden', this.roomBounds.centerX, PORTAL_POINT.y + 65, this.rollChestItems('warden'));
    else if (protectorRoom) this.loot.spawnChest('warden', this.roomBounds.centerX, this.roomBounds.centerY + 10, [...this.rollChestItems('room', 1), 'echo-shard']);
    else if (this.currentRoom.kind !== 'start') this.loot.spawnChest('room', this.roomBounds.centerX, this.roomBounds.centerY + 10, this.rollChestItems('room'));
    if (this.currentRoom.kind !== 'start') this.time.delayedCall(900, () => this.tutorial.hint('chest'));
    let ascended: string | undefined;
    if (this.currentRoom.kind === 'boss') {
      this.wardensThisRun += 1;
      this.lore.learn(`clear:${this.dungeon.themeId}`);
      if (this.dungeon.themeId === HEROES_PROGRESS[this.heroId].homeRealm) ascended = this.earnFeat('homeWarden');
    } else if (this.currentRoom.kind !== 'start' && Math.random() < this.heroMods.shardLuck) {
      // Fox Fortune: an extra shard rolls out of the chest.
      this.loot.addToLastChest('echo-shard');
    }
    if (!protectorRoom) this.showBanner(this.currentRoom.kind === 'boss' ? `REALM WARDEN DEFEATED${unlocked ? `\n\n${HERO_UNLOCK_NAMES[unlocked]} UNLOCKED` : ''}${ascended ? `\n\n${ascended}` : ''}` : 'ROOM CLEARED');
    this.audioFeedback?.play('room-clear');
    if (unlocked) this.time.delayedCall(700, () => this.audioFeedback?.play('hero-unlock'));
    else if (ascended) this.time.delayedCall(700, () => this.audioFeedback?.play('stage-up'));
    if (this.currentRoom.kind === 'boss') music.sting('sting-victory');
    if (this.currentRoom.kind === 'boss' || protectorRoom) music.setTrack(REALM_MUSIC[this.dungeon.themeId]);
    this.health = Math.min(this.maxHealth, this.health + 1 + this.heroMods.roomHeal);
    if (this.currentRoom.kind === 'boss') this.createBossPortal();
  }

  createBossPortal(): void {
    if (this.bossPortal || this.runEnded) return;
    this.time.delayedCall(1600, () => this.tutorial.hint('portal'));
    const theme = DUNGEON_THEMES[this.dungeon.themeId];
    const effect = BOSS_PORTAL_EFFECTS[this.dungeon.themeId];
    const finalRealm = this.themeIndex === this.runThemeOrder.length - 1;
    const themeId = this.dungeon.themeId;
    const rift = this.add.sprite(0, 0, `portal-open:${themeId}`, 0)
      .setOrigin(PORTAL_FRAME.originX / PORTAL_FRAME.width, PORTAL_FRAME.originY / PORTAL_FRAME.height)
      .setScale(0.5);
    const label = this.add.text(0, -70, finalRealm ? `${LOOP_NAME.toUpperCase()} ${toRoman(this.resonance + 2)} AWAITS` : 'THE NEXT REALM AWAITS', {
      fontFamily: 'monospace', fontSize: '8px', color: '#f4e0a6', backgroundColor: '#06100ddd', padding: { x: 8, y: 4 },
    }).setOrigin(0.5).setAlpha(0);
    this.bossPortal = this.add.container(PORTAL_POINT.x, PORTAL_POINT.y, [rift, label]).setDepth(7);
    this.bossPortalReady = false;
    this.portalTravelPending = false;
    this.portalTravelProgress = 0;
    this.portalArmed = false;
    this.portalTravelIntent = false;
    this.effectPool.spawn({ effectId: effect.opening, x: PORTAL_POINT.x, y: PORTAL_POINT.y, scale: 0.9, depth: 34 });
    this.time.delayedCall(400, () => this.audioFeedback?.play('portal-open'));
    this.cameras.main.flash(150, (theme.palette.door >> 16) & 0xff, (theme.palette.door >> 8) & 0xff, theme.palette.door & 0xff, true);
    // The rift tears open, then settles into its idle swirl before it can be entered.
    rift.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
      rift.play(`portal-idle:${themeId}`);
      this.bossPortalReady = true;
      this.tweens.add({ targets: label, alpha: 1, duration: 260 });
    });
    rift.play(`portal-open:${themeId}`);
    // Co-op grants this once per warden in CoopRun (the echo can be re-drawn on a return visit).
    if (!this.coopSnapshot) {
      this.power += 0.25;
      this.maxHealth += 1;
      this.health = this.maxHealth;
    }
  }

  private updateBossPortalTravel(): boolean {
    if (this.portalTravelPending) {
      // updatePlayer re-renders the hero every frame, which resets scale and alpha,
      // so the fade into the portal is reapplied here after that render.
      this.hero.setAlpha(1 - this.portalTravelProgress).setScale(1 - 0.8 * this.portalTravelProgress);
      return true;
    }
    if (!this.bossPortal || !this.bossPortalReady) return false;
    const inside = Phaser.Math.Distance.Between(this.hero.x, this.hero.y, PORTAL_POINT.x, PORTAL_POINT.y) <= 42;
    // A hero already standing where the portal opens must step out and back in,
    // so finishing the boss never yanks them into the next realm unannounced.
    if (!inside) { this.portalArmed = true; return false; }
    if (!this.portalArmed) return false;
    if (this.coopSnapshot) {
      this.portalTravelIntent = true;
      return false;
    }
    this.portalTravelPending = true;
    this.actor.stop();
    const portal = this.bossPortal;
    const effect = BOSS_PORTAL_EFFECTS[this.dungeon.themeId];
    this.effectPool.spawn({ effectId: effect.arrival, x: PORTAL_POINT.x, y: PORTAL_POINT.y, scale: 0.82, depth: 35 });
    this.audioFeedback?.play('portal-enter');
    this.tweens.add({ targets: this.hero, x: PORTAL_POINT.x, y: PORTAL_POINT.y, duration: 430, ease: 'Cubic.In' });
    this.tweens.addCounter({ from: 0, to: 1, duration: 430, ease: 'Cubic.In', onUpdate: (tween) => { this.portalTravelProgress = tween.getValue() ?? 0; } });
    this.tweens.add({ targets: portal, scale: 1.35, alpha: 0, duration: 480, ease: 'Cubic.In' });
    this.cameras.main.fadeOut(480, 4, 9, 12);
    this.time.delayedCall(500, () => {
      this.hero.setAlpha(1).setScale(1);
      this.advanceTheme();
      this.cameras.main.fadeIn(420, 4, 9, 12);
    });
    return true;
  }

  private advanceTheme(): void {
    this.bossPortal?.destroy(); this.bossPortal = undefined;
    this.bossPortalReady = false;
    this.portalTravelPending = false;
    this.portalTravelProgress = 0;
    this.portalArmed = false;
    this.portalTravelIntent = false;
    if (this.themeIndex >= this.runThemeOrder.length - 1) { this.enterNextResonance(); return; }
    this.startTheme(this.themeIndex + 1);
  }

  endRun(victory: boolean): void {
    if (this.runEnded) return;
    this.runEnded = true;
    if (!victory) {
      this.death.beginDeathSequence();
      return;
    }
    this.clearRoomObjects();
    this.updateHud();
    this.tweens.killTweensOf(this.bannerText);
    this.bannerText.setText(`THE FRACTURED REALMS ANSWER\nVICTORY\n\nRETURNING TO THE ${HUB_NAME.toUpperCase()}`).setAlpha(1).setScale(1);
    this.objectiveText.setText('ALL THREE REALM WARDENS DEFEATED  •  F TO CONTINUE');
    this.time.delayedCall(2600, () => {
      this.cameras.main.fadeOut(420, 4, 9, 12);
      this.time.delayedCall(440, () => this.returnToHall());
    });
  }

  returnToHall(): void {
    this.recordRunOnce(this.runEnded ? 'Victorious' : 'Left the realms');
    this.setPaused(false);
    // The hall fades up from black instead of popping in.
    this.registry.set('hallFadeIn', true);
    this.scene.start('realm-hall');
  }

  prepareDungeonLayouts(seedOverride?: number): void {
    const requestedSeed = seedOverride ?? this.registry.get('dungeonSeed');
    if (typeof requestedSeed === 'number' && Number.isFinite(requestedSeed)) {
      this.seed = requestedSeed >>> 0;
    } else {
      const entropy = new Uint32Array(1);
      globalThis.crypto?.getRandomValues(entropy);
      this.seed = (entropy[0] || Date.now()) >>> 0;
    }
    this.random = new SeededRandom(this.seed ^ 0xa5a5a5a5);
    this.preparedDungeons.clear();
    this.runThemeOrder = shuffledDungeonThemes(this.seed);
    this.runThemeOrder.forEach((themeId, index) => {
      this.preparedDungeons.set(themeId, generateDungeon({ seed: this.seed + index * 7919, themeId, roomCount: 9 + index * 2, maxRadius: 5 }));
    });
  }

  clearRoomObjects(): void {
    this.loot?.clear();
    this.trapSystem?.clear();
    this.features?.clear();
    this.burns?.clear();
    this.trial = undefined;
    this.fall = undefined;
    this.realmAlly?.sprite?.destroy();
    if (this.realmAlly) this.realmAlly.sprite = undefined;
    for (const enemy of this.enemies.splice(0)) { enemy.sprite.destroy(); enemy.shadow.destroy(); enemy.healthBar.destroy(); }
    for (const projectile of [...this.projectiles]) this.removeProjectile(projectile);
    for (const transient of this.roomTransients) transient.destroy();
    this.roomTransients.clear();
    this.abilityProjectileSystem?.clear(); this.abilityProjectileView?.clear();
    this.basicProjectileSystem?.clear(); this.basicProjectileView?.clear();
    this.summonProjectileSystem?.clear(); this.summonProjectileView?.clear();
    this.sealSystem?.clear(); this.sealView?.clear();
    this.dashSystem?.clear(); this.echoSystem?.clear(); this.echoView?.clear();
    this.dashHits.clear(); this.echoHits.clear();
    this.bossPortal?.destroy(); this.bossPortal = undefined;
    this.bossPortalReady = false;
    this.portalTravelPending = false;
    this.portalTravelProgress = 0;
    this.portalArmed = false;
    this.portalTravelIntent = false;
  }

  clearHeroAbilitySystems(): void {
    this.abilityProjectileSystem?.clear(); this.abilityProjectileView?.clear();
    this.basicProjectileSystem?.clear(); this.basicProjectileView?.clear();
    this.summonProjectileSystem?.clear(); this.summonProjectileView?.clear();
    this.summonSystem?.clear(); this.summonView?.clear();
    this.moonfireSystem?.clear(); this.moonfireView?.clear();
    this.sealSystem?.clear(); this.sealView?.clear();
    this.dashSystem?.clear(); this.echoSystem?.clear(); this.echoView?.clear();
    this.cultivatorSwordView?.clear();
    this.abilityProjectileSystem = undefined; this.abilityProjectileView = undefined;
    this.basicProjectileSystem = undefined; this.basicProjectileView = undefined;
    this.summonProjectileSystem = undefined; this.summonProjectileView = undefined;
    this.summonSystem = undefined; this.summonView = undefined;
    this.moonfireSystem = undefined; this.moonfireView = undefined;
    this.sealSystem = undefined; this.sealView = undefined;
    this.dashSystem = undefined; this.echoSystem = undefined; this.echoView = undefined;
    this.cultivatorSwordView = undefined;
    this.pendingAction = undefined;
    this.bufferedAction = undefined;
    this.dashHits.clear(); this.echoHits.clear();
  }

  private tileAtWorld(x: number, y: number): DungeonTile {
    const map = this.currentRoom.tileMap;
    const originX = ROOM_CENTER.x - map.width * this.tileSize / 2;
    const originY = ROOM_CENTER.y - map.height * this.tileSize / 2;
    const tileX = Math.floor((x - originX) / this.tileSize);
    const tileY = Math.floor((y - originY) / this.tileSize);
    return map.tiles[tileY]?.[tileX] ?? DungeonTile.Void;
  }

  private isSolidAt(x: number, y: number): boolean {
    return this.isFootprintSolidAt(x, y, 11, 5);
  }

  isFootprintSolidAt(x: number, y: number, halfWidth: number, halfHeight: number): boolean {
    if (this.features?.blocksRect(x - halfWidth, y - halfHeight, x + halfWidth, y + halfHeight)) return true;
    for (const [offsetX, offsetY] of [[-halfWidth, -halfHeight], [halfWidth, -halfHeight], [-halfWidth, halfHeight], [halfWidth, halfHeight]] as const) {
      const tile = this.tileAtWorld(x + offsetX, y + offsetY);
      if (tile === DungeonTile.Wall || tile === DungeonTile.Prop || tile === DungeonTile.Void) return true;
    }
    return false;
  }

  private setPaused(paused: boolean): void {
    if (this.paused === paused) return;
    this.paused = paused;
    this.time.paused = paused;
    if (paused) this.tweens.pauseAll();
    else this.tweens.resumeAll();
  }

  private kickCamera(angle: number, baseStrength: number): void {
    const strength = baseStrength * this.settings.screenShake;
    if (strength <= 0) return;
    const camera = this.cameras.main;
    this.tweens.killTweensOf(camera);
    const targetX = camera.scrollX;
    const targetY = camera.scrollY;
    camera.setScroll(targetX - Math.cos(angle) * strength, targetY - Math.sin(angle) * strength);
    this.tweens.add({ targets: camera, scrollX: targetX, scrollY: targetY, duration: 90, ease: 'Quad.Out' });
  }

  private spawnDamageNumber(x: number, y: number, amount: number, color: string): void {
    if (!this.settings.damageNumbers) return;
    const label = this.add.text(x, y, `${Math.max(0, Math.round(amount))}`, {
      fontFamily: 'Arial, sans-serif',
      fontStyle: 'bold',
      fontSize: '12px',
      color,
      stroke: '#130b0a',
      strokeThickness: 3,
      resolution: 2,
    }).setOrigin(0.5).setDepth(92).setScale(this.settings.textScale);
    this.roomTransients.add(label);
    this.tweens.add({
      targets: label,
      y: y - 24,
      alpha: 0,
      scale: 1.14,
      duration: this.settings.reduceMotion ? 180 : 460,
      ease: 'Quad.Out',
      onComplete: () => {
        this.roomTransients.delete(label);
        label.destroy();
      },
    });
  }

  /**
   * A dash, room transition, or future network correction must never leave the
   * player embedded in collision. Search outward for the nearest legal foot
   * position so movement can always recover instead of becoming permanently
   * locked.
   */
  private recoverPlayerFromSolid(): void {
    if (!this.isSolidAt(this.hero.x, this.hero.y + 18)) return;
    for (let radius = 4; radius <= 72; radius += 4) {
      for (let index = 0; index < 16; index += 1) {
        const angle = index * Math.PI / 8;
        const x = this.hero.x + Math.cos(angle) * radius;
        const y = this.hero.y + Math.sin(angle) * radius;
        if (!this.isSolidAt(x, y + 18)) {
          this.hero.setPosition(x, y);
          return;
        }
      }
    }
    this.hero.setPosition(this.roomBounds.centerX, this.roomBounds.bottom - 64);
  }

  removeProjectile(projectile: CombatProjectile, impact = false): void {
    const index = this.projectiles.indexOf(projectile);
    if (index >= 0) this.projectiles.splice(index, 1);
    if (impact && projectile.view.active) this.spawnProjectileImpact(projectile);
    projectile.view.destroy();
  }

  private drawVfx(): void {
    this.vfxGraphics.clear();
    if (this.hostileCount > 0) {
      this.vfxGraphics.lineStyle(3, 0xd95a64, 0.4).strokeRoundedRect(this.roomBounds.x + 2, this.roomBounds.y + 2, this.roomBounds.width - 4, this.roomBounds.height - 4, 8);
    } else {
      this.vfxGraphics.lineStyle(3, this.themeColor(), 0.38).strokeRoundedRect(this.roomBounds.x + 2, this.roomBounds.y + 2, this.roomBounds.width - 4, this.roomBounds.height - 4, 8);
    }
  }

  private drawMinimap(): void {
    const { originX, originY, cell } = this.hud.mapLayout(this.dungeon.rooms);
    this.minimapGraphics.clear();
    for (const room of this.dungeon.rooms) {
      const x = originX + room.x * cell; const y = originY + room.y * cell;
      const visited = this.visitedRooms.has(room.id);
      const current = room.id === this.currentRoom.id;
      const color = current ? 0xffe194 : room.kind === 'boss' ? 0xd4475b : visited ? this.themeColor() : 0x354943;
      this.minimapGraphics.fillStyle(color, visited || room.kind === 'boss' ? 1 : 0.55).fillRect(x + 1, y + 1, cell - 2, cell - 2);
      if (current) this.minimapGraphics.lineStyle(1, 0xffffff, 0.9).strokeRect(x + 0.5, y + 0.5, cell - 1, cell - 1);
      // Special rooms show once you have seen their door: a coloured mark with its own shape.
      const feature = this.roomFeatures.get(room.id);
      const seen = visited || this.dungeon.rooms.some((other) => this.visitedRooms.has(other.id) && Math.abs(other.x - room.x) + Math.abs(other.y - room.y) === 1);
      if (feature && seen) this.drawMapMark(feature, x + cell / 2, y + cell / 2, Math.max(1.5, cell * 0.22));
    }
  }

  private drawMapMark(feature: RoomFeature, x: number, y: number, size: number): void {
    const g = this.minimapGraphics;
    const color = { protector: 0xff9a3c, merchant: 0xf0d48a, altar: 0xff6a7a, trial: 0xc79aff, vault: 0xfff1c2 }[feature];
    g.fillStyle(0x06100d, 1).fillCircle(x, y, size + 1);
    g.fillStyle(color, 1);
    if (feature === 'protector') g.fillTriangle(x, y - size, x + size, y + size, x - size, y + size);
    else if (feature === 'merchant') g.fillCircle(x, y, size);
    else if (feature === 'altar') g.fillRect(x - size * 0.8, y - size * 0.8, size * 1.6, size * 1.6);
    else if (feature === 'trial') g.fillTriangle(x - size, y - size, x + size, y - size, x, y + size);
    else g.fillTriangle(x, y - size, x + size, y, x, y + size).fillTriangle(x, y - size, x - size, y, x, y + size);
  }

  updateHud(): void {
    const boss = this.runEnded ? undefined : this.enemies.find((enemy) => isBig(enemy));
    const visible = this.visibleWorldRect();
    this.hud.layout(visible, this.roomBounds, this.game.canvas.getBoundingClientRect().width / this.cameras.main.worldView.width, this.headerBottomWorldY(visible));
    this.hud.update({
      heroName: this.config.displayName,
      epithet: this.config.epithet,
      portraitKey: portraitKey(this.heroId),
      health: this.health,
      maxHealth: this.maxHealth,
      power: this.power,
      abilityName: ABILITY_NAMES[this.heroId],
      abilityRemainingMs: this.abilityCooldownMs,
      abilityTotalMs: this.abilityCooldownTotal,
      team: this.coopSnapshot?.players.map((player) => ({ name: player.name, health: player.health, downed: player.downed })),
      boss: boss ? { name: boss.role === 'protector' ? PROTECTORS[this.dungeon.themeId].name : ENEMY_NAMES[this.dungeon.themeId][3], health: boss.health, maxHealth: boss.maxHealth } : undefined,
      realmName: DUNGEON_THEMES[this.dungeon.themeId].name,
      realmIndex: this.themeIndex,
      realmCount: this.runThemeOrder.length,
      themeColor: this.themeColor(),
    }, this.game.loop.delta);
    this.emitVitals();
    if (this.runEnded) return;
    const feature = this.roomFeatures.get(this.currentRoom.id);
    if (this.coopSnapshot) { this.objectiveText.setText((this.coopRun.downedMessage() ?? this.coopSnapshot.objective).toUpperCase()); return; }
    if (this.trial) this.objectiveText.setText(`BELL OF TRIALS\nWAVE ${Math.min(this.trial.wave, this.trial.waves.length)} / ${this.trial.waves.length}${this.hostileCount > 0 ? `  •  ${this.hostileCount} REMAIN` : ''}`);
    else if (this.tutorial.active) this.objectiveText.setText('PRACTICE\nFOLLOW THE GUIDANCE');
    else if (this.hostileCount > 0) this.objectiveText.setText(boss ? (boss.role === 'protector' ? `DEFEAT THE ${PROTECTOR_TITLE.toUpperCase()}` : 'DEFEAT THE REALM WARDEN') : `SEAL THE ROOM\n${this.hostileCount} ${this.hostileCount === 1 ? 'ENEMY' : 'ENEMIES'} REMAIN`);
    else if (this.bossPortal) this.objectiveText.setText('WARDEN DEFEATED\nWALK INTO THE ECHO');
    else if (feature === 'merchant') this.objectiveText.setText(`WANDERING PEDDLER\n◆ ${this.runShards} THIS EXPEDITION`);
    else if (feature === 'altar') this.objectiveText.setText('HEART-BLOOD ALTAR');
    else if (feature === 'trial' && !this.usedFeatures.has(`${this.currentRoom.id}:trial`)) this.objectiveText.setText('BELL OF TRIALS\nRING IT IF YOU DARE');
    else if (feature === 'vault') this.objectiveText.setText('HIDDEN VAULT\nMIND THE TRAPS');
    else this.objectiveText.setText('ROOM CLEAR\nFOLLOW THE MAP');
  }

  /** Feeds the page's stat card (shared with the Pavilion) whenever the hero's state changes. */
  private emitVitals(): void {
    const abilityReady = this.abilityCooldownMs <= 0;
    const vitals = {
      name: this.config.displayName,
      health: this.health,
      maxHealth: this.maxHealth,
      abilityRatio: abilityReady ? 1 : 1 - this.abilityCooldownMs / this.abilityCooldownTotal,
      abilityLabel: abilityReady ? 'READY' : `${(this.abilityCooldownMs / 1000).toFixed(1)}s`,
      power: this.power,
      resonance: this.resonance + 1,
      formTitle: formTitle(this.heroId, loadMeta().heroes[this.heroId]),
      items: [
        ...[...this.loadout.relics.entries()].map(([id, count]) => ({ sprite: ITEMS[id].sprite, name: ITEMS[id].name, blurb: ITEMS[id].blurb, count })),
        ...(this.loadout.infusion ? [{ sprite: ITEMS[this.loadout.infusion].sprite, name: `${ITEMS[this.loadout.infusion].name} ${['', 'I', 'II', 'III'][this.loadout.infusionLevel]}`, blurb: ITEMS[this.loadout.infusion].blurb, count: this.loadout.infusionLevel }] : []),
      ],
      blessings: [...this.blessings].map((id) => BLESSINGS[id].name),
    };
    const signature = JSON.stringify(vitals);
    if (signature === this.lastVitals) return;
    this.lastVitals = signature;
    this.game.events.emit('run-vitals', vitals);
  }

  /** The part of the world the player can see; the canvas is cropped differently per screen shape. */
  private visibleWorldRect(): Phaser.Geom.Rectangle {
    const canvas = this.game.canvas;
    const rect = canvas.getBoundingClientRect();
    const view = this.cameras.main.worldView;
    if (rect.width <= 0 || rect.height <= 0) return new Phaser.Geom.Rectangle(view.x, view.y, view.width, view.height);
    const parent = canvas.parentElement?.getBoundingClientRect() ?? rect;
    const left = Math.max(rect.left, parent.left, 0);
    const top = Math.max(rect.top, parent.top, 0);
    const right = Math.min(rect.right, parent.right, window.innerWidth);
    const bottom = Math.min(rect.bottom, parent.bottom, window.innerHeight);
    const toX = (x: number): number => view.x + (x - rect.left) / rect.width * view.width;
    const toY = (y: number): number => view.y + (y - rect.top) / rect.height * view.height;
    return new Phaser.Geom.Rectangle(toX(left), toY(top), toX(right) - toX(left), toY(bottom) - toY(top));
  }

  /** World y of the page header's buttons, which float over the top-right of the canvas. */
  private headerBottomWorldY(visible: Phaser.Geom.Rectangle): number {
    const header = document.querySelector('.lobby-screen .lobby-status')?.getBoundingClientRect();
    const rect = this.game.canvas.getBoundingClientRect();
    if (!header || rect.height <= 0) return visible.top;
    const view = this.cameras.main.worldView;
    return view.y + (header.bottom - rect.top) / rect.height * view.height;
  }

  private aimAngle(): number {
    const world = this.input.activePointer.positionToCamera(this.cameras.main) as Phaser.Math.Vector2;
    if (Phaser.Math.Distance.Between(world.x, world.y, this.hero.x, this.hero.y) < 16) {
      const angleByDirection: Readonly<Record<Direction8, number>> = { E: 0, SE: Math.PI / 4, S: Math.PI / 2, SW: Math.PI * 3 / 4, W: Math.PI, NW: -Math.PI * 3 / 4, N: -Math.PI / 2, NE: -Math.PI / 4 };
      return angleByDirection[this.facing];
    }
    return Phaser.Math.Angle.Between(this.hero.x, this.hero.y, world.x, world.y);
  }

  nearestHeroX(enemy: EnemyActor): number {
    let nearestX = this.hero.x;
    let best = Phaser.Math.Distance.Between(enemy.sprite.x, enemy.sprite.y, this.hero.x, this.hero.y);
    for (const { view } of this.remoteHeroes.values()) {
      const distance = Phaser.Math.Distance.Between(enemy.sprite.x, enemy.sprite.y, view.x, view.y);
      if (distance < best) { best = distance; nearestX = view.x; }
    }
    return nearestX;
  }

  showBanner(text: string): void {
    const size = this.settings.textScale;
    this.bannerText.setText(text).setAlpha(0).setScale(0.9 * size);
    this.tweens.add({ targets: this.bannerText, alpha: 1, scale: size, duration: 220, yoyo: true, hold: 900 });
  }

  themeColor(): number {
    return DUNGEON_THEMES[this.dungeon.themeId].palette.door;
  }
}
