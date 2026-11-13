import Phaser from 'phaser';
import { GAMEPLAY_ASSET_ROOT, gameplayManifest, type PackHeroId } from '../assets/gameplayManifest';
import { DIRECTIONS_8, direction8FromVector, type Direction8 } from '../characters/directions';
import { getCharacter } from '../characters/registry';
import { HERO_UNLOCK_SPEECH, isHeroUnlocked } from '../domain/heroUnlocks';
import { formOf } from '../domain/heroProgress';
import { HERO_CHATTER } from '../domain/lore';
import { loadMeta } from '../domain/metaProgress';
import { HeroFormAura } from './HeroFormAura';
import type { CoopClient } from '../coop/CoopClient';
import type { CoopRoomSnapshot } from '../coop/protocol';
import { isLobbyWalkable } from './lobbyCollision';
import { moveWithCollision, type MoveVector } from './movement';

export type LobbyHeroId = 'li-yunfeng' | 'seo-jiwon' | 'tsukishiro-rei';
export type HallDirection = Direction8;
export type LobbyMoveVector = MoveVector;

interface LobbyInterest {
  readonly x: number;
  readonly y: number;
  readonly lines: readonly string[];
}

export interface HallHero {
  readonly id: LobbyHeroId;
  readonly assetId: PackHeroId;
  readonly name: string;
  readonly title: string;
  readonly station: { readonly x: number; readonly y: number };
  readonly color: number;
  readonly renderScale: number;
}

interface NpcActor {
  readonly hero: HallHero;
  readonly sprite: Phaser.GameObjects.Sprite;
  readonly shadow: Phaser.GameObjects.Ellipse;
  readonly name: Phaser.GameObjects.Container;
  readonly target: Phaser.Math.Vector2;
  facing: HallDirection;
  waitMs: number;
  currentInterest?: LobbyInterest;
  hasSpokenAtTarget: boolean;
  /** Time left standing still to face the player after being spoken to. */
  talkingMs: number;
  ambientBubble?: Phaser.GameObjects.Container;
}

/** A party member standing in the Pavilion with you (co-op). */
interface PartyActor {
  heroId: LobbyHeroId;
  readonly sprite: Phaser.GameObjects.Sprite;
  readonly shadow: Phaser.GameObjects.Ellipse;
  readonly label: Phaser.GameObjects.Text;
}

/** The Realm Gate's mouth: walking in here starts a run. */
const GATE = { x: 480, halfWidth: 40, bottom: 108 } as const;

export const HEROES: readonly HallHero[] = [
  { id: 'li-yunfeng', assetId: 'li_yunfeng', name: 'Li Yunfeng', title: 'SECTLESS SWORD', station: { x: 480, y: 348 }, color: 0x5cd4bd, renderScale: 0.31 },
  { id: 'seo-jiwon', assetId: 'seo_jiwon', name: 'Seo Jiwon', title: 'NIGHTFOLD EXILE', station: { x: 270, y: 242 }, color: 0xae69df, renderScale: 0.33 },
  { id: 'tsukishiro-rei', assetId: 'tsukishiro_rei', name: 'Tsukishiro Rei', title: 'MOONFOX HEIR', station: { x: 690, y: 242 }, color: 0x58a9ff, renderScale: 0.33 },
];

// The player and the wandering heroes share one draw band sorted by y, so whoever
// stands lower on screen is drawn in front; shadows sit just beneath the band.
const hallActorDepth = (y: number): number => 30 + y / 1000;

// Bubbles sit just above the head of a hall-scale hero sprite.
const BUBBLE_OFFSET_Y = -30;
const TALK_RANGE = 70;
// Shops and the expedition table, found by walking up to them; E opens them.
type HallStationId = 'forge' | 'apothecary' | 'cabinet' | 'table' | 'shrine';
const HALL_STATIONS: readonly { id: HallStationId; x: number; y: number; color: number }[] = [
  { id: 'apothecary', x: 150, y: 215, color: 0xd98a5a },
  { id: 'forge', x: 805, y: 215, color: 0xf07a3c },
  { id: 'cabinet', x: 805, y: 405, color: 0x6fd0c0 },
  { id: 'table', x: 480, y: 372, color: 0xe3c277 },
  { id: 'shrine', x: 182, y: 357, color: 0xb88cf0 },
];
const STATION_RANGE = 82;
const SWITCH_LINES: Readonly<Record<LobbyHeroId, string>> = {
  'li-yunfeng': 'A sword still needs a path. I will lead.',
  'seo-jiwon': 'Keep up. The shadows will not wait.',
  'tsukishiro-rei': 'The moonfox is ready to hunt.',
};

const INTERESTS: Record<LobbyHeroId, readonly LobbyInterest[]> = {
  'li-yunfeng': [
    { x: 480, y: 414, lines: ['Every road begins at the map.', 'No sect. No master. Still a path.'] },
    { x: 390, y: 205, lines: ['These blades remember their wielders.', 'A quiet edge lasts longest.'] },
    { x: 570, y: 205, lines: ['The gate is humming again.', 'The realm beyond feels restless.'] },
  ],
  'seo-jiwon': [
    { x: 286, y: 226, lines: ['The tea has gone cold.', 'Someone moved this cushion.'] },
    { x: 315, y: 386, lines: ['Even shadows collect dust.', 'The archives omit the useful parts.'] },
    { x: 335, y: 310, lines: ['A shorter route cuts west.', 'This map has too many honest roads.'] },
  ],
  'tsukishiro-rei': [
    { x: 674, y: 218, lines: ['The spirit basin is unusually still.', 'Foxfire likes the lanterns here.'] },
    { x: 706, y: 392, lines: ['This cushion is warm already.', 'The moonfox was sitting here.'] },
    { x: 625, y: 350, lines: ['That province has old shrine roads.', 'The map smells faintly of rain.'] },
  ],
};

export const hallTextureKey = (id: LobbyHeroId, state: 'idle' | 'move', direction: HallDirection): string =>
  `hall:${id}:${state}:${direction}`;
export const animationKey = (id: LobbyHeroId, state: 'idle' | 'move', direction: HallDirection): string =>
  `hall-anim:${id}:${state}:${direction}`;

export class LobbyScene extends Phaser.Scene {
  private controlledHero: LobbyHeroId = 'li-yunfeng';
  private player!: Phaser.GameObjects.Sprite;
  private playerShadow!: Phaser.GameObjects.Ellipse;
  private playerRing!: Phaser.GameObjects.Graphics;
  private readonly npcObjects: Phaser.GameObjects.GameObject[] = [];
  private readonly npcActors = new Map<LobbyHeroId, NpcActor>();
  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd?: Record<'up' | 'down' | 'left' | 'right' | 'interact', Phaser.Input.Keyboard.Key>;
  private virtualMovement?: LobbyMoveVector;
  /** The wandering hero close enough to talk to with E, if any. */
  private nearestNpc?: NpcActor;
  private nearestStation?: HallStationId;
  private playerAura?: HeroFormAura;
  private readonly npcAuras = new Map<LobbyHeroId, HeroFormAura>();
  private readonly stationGlows = new Map<HallStationId, Phaser.GameObjects.Ellipse>();
  private facing: HallDirection = 'S';
  private dialogueOpen = false;
  private enteringGate = false;
  private readonly partyActors = new Map<string, PartyActor>();
  private gateLabel?: Phaser.GameObjects.Text;
  private notice?: Phaser.GameObjects.Container;
  private lastNoticeAt = -10_000;
  private startRequestedAt = 0;
  /** When the Pavilion screen last appeared (a key that opened it must not also act inside it). */
  private shownAt = 0;

  constructor() {
    super('realm-hall');
  }

  preload(): void {
    this.load.image('hall:environment', '/assets/environments/realm-hall-v1.png');
    for (const hero of HEROES) {
      for (const direction of DIRECTIONS_8) {
        for (const state of ['idle', 'move'] as const) {
          const definition = gameplayManifest.heroes[hero.assetId][state].directions[direction];
          this.load.spritesheet(
            hallTextureKey(hero.id, state, direction),
            `${GAMEPLAY_ASSET_ROOT}${definition.file}`,
            {
              frameWidth: gameplayManifest.frameWidth,
              frameHeight: gameplayManifest.frameHeight,
              endFrame: definition.frameCount - 1,
            },
          );
        }
      }
    }
  }

  /** One-time Pavilion tips (the guidance card skips any already seen). */
  private queueHallHints(): void {
    const hint = (id: string): void => { this.game.events.emit('tutorial-hint', id); };
    const meta = loadMeta();
    hint('pavilion-move');
    hint('pavilion-gate');
    if (meta.chronicle.length > 0) hint('pavilion-shops');
    if (Object.values(meta.heroes).some((record) => record.points > 0)) hint('pavilion-shrine');
  }

  create(): void {
    this.time.delayedCall(1200, () => this.queueHallHints());
    if (this.registry.get('hallFadeIn')) {
      this.registry.remove('hallFadeIn');
      this.cameras.main.fadeIn(700, 0, 0, 0);
    }
    this.enteringGate = false;
    this.partyActors.clear();
    this.notice = undefined;
    this.gateLabel = this.add.text(GATE.x, 132, '', {
      fontFamily: "'IBM Plex Mono', monospace", fontSize: '7px', color: '#f1e3b8', backgroundColor: '#07100ed9', padding: { x: 5, y: 3 }, align: 'center',
    }).setOrigin(0.5).setResolution(4).setDepth(60).setVisible(false);
    const registeredHero = this.registry.get('selectedHero') as LobbyHeroId | undefined;
    this.controlledHero = HEROES.some((hero) => hero.id === registeredHero) ? registeredHero! : 'li-yunfeng';
    this.registry.set('selectedHero', this.controlledHero);
    this.cameras.main.setBackgroundColor('#060a09');
    this.cameras.main.setZoom(2).centerOn(480, 270);
    this.add.image(480, 270, 'hall:environment').setDisplaySize(960, 540).setDepth(10);
    this.createHeroAnimations();
    this.createGate();
    this.createPlayer();
    this.rebuildNpcs();
    this.createAtmosphere();
    this.stationGlows.clear();
    for (const station of HALL_STATIONS) {
      // A soft pool of light marks a station only while you stand at it.
      this.stationGlows.set(station.id, this.add.ellipse(station.x, station.y + 18, 90, 30, station.color, 0.16).setDepth(27).setVisible(false));
    }

    if (this.input.keyboard) {
      this.cursors = this.input.keyboard.createCursorKeys();
      this.wasd = {
        up: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
        down: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
        left: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
        right: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
        interact: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E),
      };
    }

    const selectedListener = (id: LobbyHeroId): void => this.setControlledHero(id);
    const moveListener = (movement?: LobbyMoveVector): void => { this.virtualMovement = movement; };
    const interactListener = (): void => this.talkToNearest();
    // Page dialogs (the archive) pause the hall while they are open.
    const dialogueListener = (open: boolean): void => { this.dialogueOpen = open; };
    const screenListener = (name: string): void => {
      if (name !== 'lobby') return;
      this.shownAt = performance.now();
      this.input.keyboard?.resetKeys();
    };
    this.shownAt = performance.now();
    this.game.events.on('screen-shown', screenListener);
    this.game.events.on('lobby-hero-selected', selectedListener);
    this.game.events.on('lobby-input', moveListener);
    this.game.events.on('lobby-interact', interactListener);
    this.game.events.on('lobby-dialogue-state', dialogueListener);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off('lobby-hero-selected', selectedListener);
      this.game.events.off('lobby-input', moveListener);
      this.game.events.off('lobby-interact', interactListener);
      this.game.events.off('lobby-dialogue-state', dialogueListener);
      this.game.events.off('screen-shown', screenListener);
    });
  }

  update(_time: number, delta: number): void {
    this.updateNpcs(delta);
    if (this.dialogueOpen || this.inputBlocked()) {
      this.player.play(animationKey(this.controlledHero, 'idle', this.facing), true);
      this.syncParty(false);
      return;
    }
    if (this.wasd && Phaser.Input.Keyboard.JustDown(this.wasd.interact)) this.talkToNearest();

    let x = 0;
    let y = 0;
    if (this.cursors?.left.isDown || this.wasd?.left.isDown) x -= 1;
    if (this.cursors?.right.isDown || this.wasd?.right.isDown) x += 1;
    if (this.cursors?.up.isDown || this.wasd?.up.isDown) y -= 1;
    if (this.cursors?.down.isDown || this.wasd?.down.isDown) y += 1;
    x += this.virtualMovement?.x ?? 0;
    y += this.virtualMovement?.y ?? 0;

    const moving = x !== 0 || y !== 0;
    if (moving) {
      const length = Math.hypot(x, y);
      x /= length;
      y /= length;
      const speed = 145 * delta / 1000;
      const movement = moveWithCollision(
        this.player,
        { x: x * speed, y: y * speed },
        (nextX, nextY) => this.isWalkable(nextX, nextY),
      );
      this.player.setPosition(movement.x, movement.y);
      this.facing = direction8FromVector(x, y, this.facing);
      this.player.play(animationKey(this.controlledHero, 'move', this.facing), true);
    } else {
      this.player.play(animationKey(this.controlledHero, 'idle', this.facing), true);
    }
    this.player.setDepth(hallActorDepth(this.player.y));
    this.playerAura?.update(this.player.x, this.player.y, this.player.depth, delta);
    this.playerShadow.setPosition(this.player.x, this.player.y + 31).setDepth(29 + this.player.y / 1000);
    this.playerRing.setPosition(this.player.x, this.player.y + 31).setDepth(28 + this.player.y / 1000);

    if (this.player.x <= 18 && this.player.y >= 230 && this.player.y <= 300) {
      this.scene.start('grand-archive');
      return;
    }

    const party = this.syncParty(moving);
    // A start request that never took (a lost connection) frees the gate again.
    if (this.enteringGate && party && this.time.now - this.startRequestedAt > 4000) this.enteringGate = false;

    // Walking into the Realm Gate starts a run, the same way the west opening leads to the archive.
    if (!this.enteringGate && !this.dialogueOpen && Math.abs(this.player.x - GATE.x) <= GATE.halfWidth && this.player.y <= GATE.bottom) {
      if (party && (party.snapshot.phase === 'gathering' || party.snapshot.completed)) {
        if (party.snapshot.hostId === party.me) {
          // The leader opens the gate for everyone; the shell takes each wanderer in when the server says so.
          this.enteringGate = true;
          this.startRequestedAt = this.time.now;
          party.client.start();
          this.showNotice('Opening the gate for the party…');
        } else {
          const leader = party.snapshot.players.find((member) => member.id === party.snapshot.hostId)?.name ?? 'the party leader';
          this.showNotice(`Only ${leader} can lead the party through.`);
          this.player.y = GATE.bottom + 10;
        }
        return;
      }
      this.enteringGate = true;
      this.game.events.emit('lobby-action', 'enter');
      return;
    }

    this.updateNearestNpc();
  }

  private createHeroAnimations(): void {
    for (const hero of HEROES) {
      for (const direction of DIRECTIONS_8) {
        for (const state of ['idle', 'move'] as const) {
          const key = animationKey(hero.id, state, direction);
          if (this.anims.exists(key)) continue;
          const frameCount = gameplayManifest.heroes[hero.assetId][state].directions[direction].frameCount;
          const durationMs = getCharacter(hero.id).animations[state].durationMs;
          this.anims.create({
            key,
            frames: this.anims.generateFrameNumbers(hallTextureKey(hero.id, state, direction), {
              start: 0,
              end: frameCount - 1,
            }),
            frameRate: frameCount / (durationMs / 1000),
            repeat: -1,
          });
        }
      }
    }
  }

  private isWalkable(x: number, y: number): boolean {
    return isLobbyWalkable(x, y);
  }

  private createGate(): void {
    const x = 480;
    const y = 92;
    // The gate simply glows; walking into it is the way in.
    const glow = this.add.ellipse(x, y, 155, 125, 0x4de2c2, 0.08).setDepth(11);
    this.tweens.add({ targets: glow, alpha: 0.35, duration: 1000, yoyo: true, repeat: -1 });
  }

  private createPlayer(): void {
    const returningFromArchive = this.registry.get('lobbySpawnFromArchive') === true;
    this.registry.set('lobbySpawnFromArchive', false);
    const spawn = returningFromArchive
      ? { x: 52, y: 268, facing: 'E' as HallDirection }
      : { x: 480, y: 430, facing: 'N' as HallDirection };
    this.playerShadow = this.add.ellipse(spawn.x, spawn.y + 31, 47, 16, 0x000000, 0.52).setDepth(29);
    this.player = this.add.sprite(spawn.x, spawn.y, hallTextureKey(this.controlledHero, 'idle', spawn.facing), 0)
      .setScale(this.hero(this.controlledHero).renderScale)
      .setDepth(30);
    this.player.play(animationKey(this.controlledHero, 'idle', spawn.facing));
    this.facing = spawn.facing;
    this.playerRing = this.add.graphics().setPosition(spawn.x, spawn.y + 31).setDepth(28);
    this.playerRing.lineStyle(2, 0xd7bd73, 0.88).strokeEllipse(0, 0, 67, 23);
    this.tweens.add({ targets: this.playerRing, alpha: 0.45, duration: 900, yoyo: true, repeat: -1 });
  }

  /**
   * What a wanderer says at a stop. Once you have found lore they care about,
   * they sometimes talk about it instead of the furniture, so history also
   * reaches you through conversation.
   */
  private pickAmbientLine(actor: NpcActor): string {
    const known = loadMeta().lore;
    const stories = HERO_CHATTER[actor.hero.id].filter((chatter) => known.includes(chatter.requires) || chatter.requires === 'always');
    if (stories.length > 0 && Math.random() < 0.5) return Phaser.Utils.Array.GetRandom(stories).line;
    return Phaser.Utils.Array.GetRandom([...(actor.currentInterest?.lines ?? ['...'])]);
  }

  /** (Re)builds every hero's form aura from the saved progress. */
  private refreshAuras(): void {
    if (!this.player) return;
    const heroes = loadMeta().heroes;
    this.playerAura?.destroy();
    this.playerAura = new HeroFormAura(this, this.controlledHero, 0.9, formOf(heroes[this.controlledHero]));
    for (const aura of this.npcAuras.values()) aura.destroy();
    this.npcAuras.clear();
    for (const id of this.npcActors.keys()) this.npcAuras.set(id, new HeroFormAura(this, id, 0.9, formOf(heroes[id])));
  }

  private rebuildNpcs(): void {
    for (const actor of this.npcActors.values()) actor.ambientBubble?.destroy(true);
    for (const object of this.npcObjects) object.destroy();
    this.npcObjects.length = 0;
    this.npcActors.clear();
    for (const hero of HEROES) {
      if (hero.id === this.controlledHero) continue;
      const { x, y } = hero.station;
      const shadow = this.add.ellipse(x, y + 31, 50, 17, 0x000000, 0.5).setDepth(29 + y / 1000);
      const sprite = this.add.sprite(x, y, hallTextureKey(hero.id, 'idle', 'S'), 0).setScale(hero.renderScale).setDepth(hallActorDepth(y));
      sprite.play(animationKey(hero.id, 'idle', 'S'));
      const name = this.createNpcNameplate(hero, x, y - 63);
      const actor: NpcActor = {
        hero,
        sprite,
        shadow,
        name,
        target: new Phaser.Math.Vector2(x, y),
        facing: 'S',
        waitMs: Phaser.Math.Between(600, 1500),
        hasSpokenAtTarget: false,
        talkingMs: 0,
      };
      this.npcActors.set(hero.id, actor);
      this.npcObjects.push(shadow, sprite, name);
    }
    this.refreshAuras();
  }

  private updateNpcs(delta: number): void {
    for (const actor of this.npcActors.values()) {
      if (this.dialogueOpen || actor.talkingMs > 0) {
        actor.talkingMs = Math.max(0, actor.talkingMs - delta);
        actor.sprite.play(animationKey(actor.hero.id, 'idle', actor.facing), true);
        this.positionNpcParts(actor);
        continue;
      }

      if (actor.waitMs > 0) {
        actor.waitMs -= delta;
        actor.sprite.play(animationKey(actor.hero.id, 'idle', actor.facing), true);
        if (actor.waitMs <= 0) this.chooseNpcTarget(actor);
        this.positionNpcParts(actor);
        continue;
      }

      const distance = Phaser.Math.Distance.Between(actor.sprite.x, actor.sprite.y, actor.target.x, actor.target.y);
      if (distance <= 3) {
        actor.sprite.setPosition(actor.target.x, actor.target.y);
        actor.waitMs = Phaser.Math.Between(4800, 8500);
        actor.sprite.play(animationKey(actor.hero.id, 'idle', actor.facing), true);
        if (!actor.hasSpokenAtTarget && actor.currentInterest) {
          actor.hasSpokenAtTarget = true;
          this.showAmbientBubble(actor, this.pickAmbientLine(actor));
        }
        this.positionNpcParts(actor);
        continue;
      }

      const dx = (actor.target.x - actor.sprite.x) / distance;
      const dy = (actor.target.y - actor.sprite.y) / distance;
      const speed = 31 * delta / 1000;
      const movement = moveWithCollision(
        actor.sprite,
        { x: dx * speed, y: dy * speed },
        (nextX, nextY) => this.isWalkable(nextX, nextY),
      );
      actor.sprite.setPosition(movement.x, movement.y);
      actor.facing = direction8FromVector(dx, dy, actor.facing);
      actor.sprite.play(animationKey(actor.hero.id, 'move', actor.facing), true);
      this.positionNpcParts(actor);
    }
  }

  private chooseNpcTarget(actor: NpcActor): void {
    const choices = INTERESTS[actor.hero.id].filter((interest) => interest !== actor.currentInterest);
    actor.currentInterest = Phaser.Utils.Array.GetRandom([...choices]);
    actor.hasSpokenAtTarget = false;
    actor.ambientBubble?.destroy(true);
    actor.ambientBubble = undefined;
    actor.target.set(actor.currentInterest.x, actor.currentInterest.y);
  }

  private createNpcNameplate(hero: HallHero, x: number, y: number): Phaser.GameObjects.Container {
    const width = Math.max(74, hero.name.length * 7 + 20);
    const background = this.add.graphics();
    background.fillStyle(0x081511, 0.82).fillRoundedRect(-width / 2, -10, width, 20, 4);
    background.lineStyle(1, 0x526d62, 0.72).strokeRoundedRect(-width / 2, -10, width, 20, 4);
    background.lineStyle(1, hero.color, 0.78).lineBetween(-width / 2 + 9, 9, width / 2 - 9, 9);
    background.fillStyle(0xd8bd72, 0.9).fillTriangle(-width / 2 + 4, 0, -width / 2 + 8, -3, -width / 2 + 8, 3);
    const label = this.add.text(2, -1, hero.name.toUpperCase(), {
      fontFamily: 'Cinzel, serif',
      fontSize: '8px',
      color: '#e8dfcb',
      letterSpacing: 1,
      resolution: 2,
    }).setOrigin(0.5);
    return this.add.container(x, y, [background, label]).setDepth(47).setVisible(false);
  }

  private positionNpcParts(actor: NpcActor): void {
    const { x, y } = actor.sprite;
    actor.shadow.setPosition(x, y + 31).setDepth(29 + y / 1000);
    actor.sprite.setDepth(hallActorDepth(y));
    this.npcAuras.get(actor.hero.id)?.update(x, y, actor.sprite.depth, this.game.loop.delta);
    // Labels float above every hero, so walking past an NPC never hides them.
    actor.name.setPosition(x, y - 63).setDepth(47 + y / 1000);
    actor.ambientBubble?.setPosition(x, y + BUBBLE_OFFSET_Y);
  }

  /**
   * A classic speech bubble: cream paper, dark ink outline, stepped pixel
   * corners and a tail pointing at the speaker. The text types itself out.
   */
  private createWorldSpeechBubble(line: string, maxWidth = 132): Phaser.GameObjects.Container {
    const text = this.add.text(0, 0, '', {
      fontFamily: 'Barlow Condensed, sans-serif', fontSize: '9px', color: '#2a2016', align: 'left', wordWrap: { width: maxWidth - 16 }, resolution: 3,
    }).setOrigin(0.5, 0);
    const wrapped = text.getWrappedText(line).join('\n');
    text.setText(wrapped);
    const textWidth = Math.ceil(text.width);
    const textHeight = Math.ceil(text.height);
    const width = Math.max(40, textWidth + 14);
    const height = textHeight + 9;
    // A fixed box keeps the typed-out lines from shifting as they fill in.
    text.setFixedSize(textWidth, textHeight).setText('').setPosition(0, -7 - height + 4);
    const g = this.add.graphics();
    const left = -width / 2;
    const top = -height - 7;
    const ink = 0x1b1410;
    // Outline, then paper, each with 2px stepped corners.
    for (const [inset, color] of [[0, ink], [1, 0xf6eedb]] as const) {
      g.fillStyle(color, 1)
        .fillRect(left + 2 + inset, top + inset, width - 4 - inset * 2, height - inset * 2)
        .fillRect(left + inset, top + 2 + inset, width - inset * 2, height - 4 - inset * 2)
        .fillRect(left + 1 + inset, top + 1 + inset, width - 2 - inset * 2, height - 2 - inset * 2);
    }
    g.fillStyle(0xd9cdb0, 1).fillRect(left + 2, top + height - 3, width - 4, 1);
    // Tail.
    g.fillStyle(ink, 1).fillTriangle(-5, -8, 5, -8, 0, 0);
    g.fillStyle(0xf6eedb, 1).fillTriangle(-3, -8, 3, -8, 0, -2.5);
    const bubble = this.add.container(0, 0, [g, text]);
    let shown = 0;
    const timer = this.time.addEvent({
      delay: 18,
      repeat: wrapped.length - 1,
      callback: () => { shown += 1; if (text.active) text.setText(wrapped.slice(0, shown)); },
    });
    bubble.once(Phaser.GameObjects.Events.DESTROY, () => timer.remove());
    return bubble;
  }

  /** Shows a bubble over an NPC's head for a while, replacing any it already had. */
  private showAmbientBubble(actor: NpcActor, line: string, durationMs = 3200): void {
    actor.ambientBubble?.destroy(true);
    const bubble = this.createWorldSpeechBubble(line)
      .setPosition(actor.sprite.x, actor.sprite.y + BUBBLE_OFFSET_Y)
      .setDepth(70)
      .setScale(0.4)
      .setAlpha(0);
    actor.ambientBubble = bubble;
    const size = (this.registry.get('gameSettings') as { textScale?: number } | undefined)?.textScale ?? 1;
    this.tweens.add({ targets: bubble, alpha: 1, scale: size, duration: 170, ease: 'Back.Out' });
    this.time.delayedCall(durationMs, () => {
      if (actor.ambientBubble !== bubble || !bubble.active) return;
      this.tweens.add({
        targets: bubble,
        alpha: 0,
        scale: bubble.scale * 0.85,
        duration: 180,
        onComplete: () => {
          if (actor.ambientBubble === bubble) actor.ambientBubble = undefined;
          bubble.destroy(true);
        },
      });
    });
  }

  /** The wanderer you are standing beside shows their nameplate; nothing else is labelled. */
  private updateNearestNpc(): void {
    let nearest: NpcActor | undefined;
    let best = TALK_RANGE;
    for (const actor of this.npcActors.values()) {
      const distance = Phaser.Math.Distance.Between(this.player.x, this.player.y, actor.sprite.x, actor.sprite.y);
      if (distance <= best) { best = distance; nearest = actor; }
    }
    this.nearestNpc = nearest;
    for (const actor of this.npcActors.values()) actor.name.setVisible(actor === nearest && !actor.ambientBubble);
    let station: HallStationId | undefined;
    if (!nearest) {
      let closest = STATION_RANGE;
      for (const candidate of HALL_STATIONS) {
        const distance = Phaser.Math.Distance.Between(this.player.x, this.player.y, candidate.x, candidate.y);
        if (distance <= closest) { closest = distance; station = candidate.id; }
      }
    }
    this.nearestStation = station;
    for (const [id, glow] of this.stationGlows) glow.setVisible(id === station);
  }

  /**
   * E beside a wanderer: a locked hero tells you how to earn them; an unlocked
   * one takes over, and the hero you were playing returns to the hall.
   */
  /** Keys reach the Pavilion only while it is on screen, no menu is open, and it has been up for a moment. */
  private inputBlocked(): boolean {
    return document.body.dataset.screen !== 'lobby' || document.querySelector('dialog[open]') !== null || performance.now() - this.shownAt < 350;
  }

  private talkToNearest(): void {
    if (this.inputBlocked()) return;
    if (!this.nearestNpc && this.nearestStation && !this.dialogueOpen) {
      this.game.events.emit('hall-station', this.nearestStation);
      return;
    }
    const actor = this.nearestNpc;
    if (!actor || this.dialogueOpen || actor.talkingMs > 0) return;
    const unlocked = isHeroUnlocked(actor.hero.id);
    actor.facing = direction8FromVector(this.player.x - actor.sprite.x, this.player.y - actor.sprite.y, actor.facing);
    actor.sprite.play(animationKey(actor.hero.id, 'idle', actor.facing), true);
    actor.talkingMs = unlocked ? 1400 : 4600;
    this.showAmbientBubble(actor, unlocked ? SWITCH_LINES[actor.hero.id] : HERO_UNLOCK_SPEECH[actor.hero.id], unlocked ? 1300 : 4400);
    if (!unlocked) return;
    this.time.delayedCall(1100, () => {
      if (!this.player?.active) return;
      const ring = this.add.circle(this.player.x, this.player.y + 10, 18, actor.hero.color, 0).setStrokeStyle(2, actor.hero.color, 0.9).setDepth(60);
      this.tweens.add({ targets: ring, scale: 2.4, alpha: 0, duration: 420, onComplete: () => ring.destroy() });
      this.game.events.emit('lobby-hero-request', actor.hero.id);
    });
  }

  private createAtmosphere(): void {
    for (let index = 0; index < 24; index++) {
      const mote = this.add.circle(Phaser.Math.Between(55, 905), Phaser.Math.Between(155, 490), Phaser.Math.Between(1, 2), index % 4 === 0 ? 0xe0bb69 : 0x56c7ad, Phaser.Math.FloatBetween(0.08, 0.28)).setDepth(40);
      this.tweens.add({ targets: mote, y: mote.y - Phaser.Math.Between(15, 42), x: mote.x + Phaser.Math.Between(-12, 12), alpha: 0, duration: Phaser.Math.Between(1800, 3500), delay: Phaser.Math.Between(0, 1600), repeat: -1 });
    }
  }

  private setControlledHero(id: LobbyHeroId): void {
    if (!HEROES.some((hero) => hero.id === id)) return;
    this.controlledHero = id;
    this.registry.set('selectedHero', id);
    if (!this.player) return;
    this.facing = 'S';
    this.player.setScale(this.hero(id).renderScale).play(animationKey(id, 'idle', 'S'), true);
    this.rebuildNpcs();
  }

  /**
   * Co-op: tells the server where this wanderer stands and draws the rest of the
   * party where they stand, with their names. Returns the party, if in one.
   */
  private syncParty(moving: boolean): { client: CoopClient; snapshot: CoopRoomSnapshot; me: string } | undefined {
    const client = this.registry.get('coopClient') as CoopClient | undefined;
    const snapshot = client?.currentSnapshot;
    const me = client?.currentMembership?.playerId;
    if (!client || !snapshot || !me || !client.connected) {
      for (const id of [...this.partyActors.keys()]) this.removePartyActor(id);
      this.gateLabel?.setVisible(false);
      return undefined;
    }
    client.updateHall({ x: Math.round(this.player.x), y: Math.round(this.player.y), facing: this.facing, moving }, this.controlledHero);
    const gathering = snapshot.phase === 'gathering' || snapshot.completed;
    const others = gathering ? snapshot.players.filter((member) => member.id !== me && member.hall && member.connected) : [];
    for (const id of [...this.partyActors.keys()]) if (!others.some((member) => member.id === id)) this.removePartyActor(id);
    for (const member of others) {
      const hall = member.hall!;
      let actor = this.partyActors.get(member.id);
      if (actor && actor.heroId !== member.heroId) { this.removePartyActor(member.id); actor = undefined; }
      if (!actor) {
        const shadow = this.add.ellipse(hall.x, hall.y + 31, 47, 16, 0x000000, 0.5);
        const sprite = this.add.sprite(hall.x, hall.y, hallTextureKey(member.heroId, 'idle', hall.facing), 0).setScale(this.hero(member.heroId).renderScale);
        const label = this.add.text(hall.x, hall.y - 46, member.name, {
          fontFamily: "'IBM Plex Mono', monospace", fontSize: '7px', color: '#f1e3b8', backgroundColor: '#07100ecc', padding: { x: 3, y: 2 },
        }).setOrigin(0.5).setResolution(4);
        actor = { heroId: member.heroId, sprite, shadow, label };
        this.partyActors.set(member.id, actor);
      }
      const x = Phaser.Math.Linear(actor.sprite.x, hall.x, 0.25);
      const y = Phaser.Math.Linear(actor.sprite.y, hall.y, 0.25);
      const walking = hall.moving || Math.hypot(hall.x - x, hall.y - y) > 2;
      actor.sprite.setPosition(x, y).setDepth(hallActorDepth(y)).play(animationKey(member.heroId, walking ? 'move' : 'idle', hall.facing), true);
      actor.shadow.setPosition(x, y + 31).setDepth(29 + y / 1000);
      actor.label.setText(member.name).setPosition(x, y - 46).setDepth(48 + y / 1000);
    }
    const leader = snapshot.players.find((member) => member.id === snapshot.hostId);
    const count = `${snapshot.players.length}/3`;
    const text = !gathering
      ? 'EXPEDITION UNDER WAY · WALK IN TO JOIN'
      : snapshot.hostId === me
        ? `PARTY ${count} · WALK IN TO LEAD EVERYONE THROUGH`
        : `PARTY ${count} · ${(leader?.name ?? 'THE LEADER').toUpperCase()} OPENS THE GATE`;
    this.gateLabel?.setText(text).setVisible(true);
    return { client, snapshot, me };
  }

  private removePartyActor(id: string): void {
    const actor = this.partyActors.get(id);
    if (!actor) return;
    actor.sprite.destroy();
    actor.shadow.destroy();
    actor.label.destroy();
    this.partyActors.delete(id);
  }

  /** A short bubble over the player's own head. */
  private showNotice(line: string): void {
    if (this.time.now - this.lastNoticeAt < 1500) return;
    this.lastNoticeAt = this.time.now;
    this.notice?.destroy(true);
    const bubble = this.createWorldSpeechBubble(line).setPosition(this.player.x, this.player.y + BUBBLE_OFFSET_Y).setDepth(70);
    this.notice = bubble;
    this.time.delayedCall(2400, () => { if (bubble.active) bubble.destroy(true); if (this.notice === bubble) this.notice = undefined; });
  }

  private hero(id: LobbyHeroId): HallHero {
    return HEROES.find((hero) => hero.id === id) ?? HEROES[0];
  }

}
