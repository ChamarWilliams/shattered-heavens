import Phaser from 'phaser';
import { direction8FromVector } from '../characters/directions';
import { isArchiveWalkable } from './archiveCollision';
import { animationKey, hallTextureKey, HEROES, type HallDirection, type LobbyHeroId, type LobbyMoveVector } from './LobbyScene';
import { moveWithCollision } from './movement';

type ArchiveCollectionId = 'characters' | 'items' | 'enemies' | 'realms';
type ArchiveInteraction = { readonly kind: 'collection'; readonly id: ArchiveCollectionId };

interface ArchiveStation {
  readonly id: ArchiveCollectionId;
  readonly label: string;
  readonly x: number;
  readonly y: number;
  readonly color: number;
}

const STATIONS: readonly ArchiveStation[] = [
  { id: 'characters', label: 'WANDERER CHRONICLES', x: 380, y: 350, color: 0xd4b765 },
  { id: 'items', label: 'RELIC CATALOGUE', x: 580, y: 225, color: 0x62cbb4 },
  { id: 'enemies', label: 'BESTIARY RECORDS', x: 380, y: 225, color: 0xbc755f },
  { id: 'realms', label: 'REALM HISTORIES', x: 580, y: 350, color: 0x6ca8d2 },
];

const ARCHIVE_SPAWN_POINT = { x: 910, y: 270 } as const;

export class ArchiveScene extends Phaser.Scene {
  private controlledHero: LobbyHeroId = 'li-yunfeng';
  private player!: Phaser.GameObjects.Sprite;
  private shadow!: Phaser.GameObjects.Ellipse;
  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd?: Record<'up' | 'down' | 'left' | 'right' | 'interact', Phaser.Input.Keyboard.Key>;
  private virtualMovement?: LobbyMoveVector;
  private facing: HallDirection = 'N';
  private nearest?: ArchiveInteraction;
  private dialogueOpen = false;
  private readonly stationGlows = new Map<ArchiveCollectionId, Phaser.GameObjects.Graphics>();

  constructor() {
    super('grand-archive');
  }

  preload(): void {
    this.load.image('archive:environment', '/assets/environments/grand-archive-v4.png');
  }

  create(): void {
    this.controlledHero = (this.registry.get('selectedHero') as LobbyHeroId | undefined) ?? 'li-yunfeng';
    this.cameras.main.setBackgroundColor('#060a09').setZoom(2).centerOn(480, 270);
    this.add.image(480, 270, 'archive:environment').setDisplaySize(960, 540).setDepth(10);
    this.createStations();
    this.createPlayer();

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

    const moveListener = (movement?: LobbyMoveVector): void => { this.virtualMovement = movement; };
    const interactListener = (): void => this.interact();
    const dialogueListener = (open: boolean): void => { this.dialogueOpen = open; };
    this.game.events.on('lobby-input', moveListener);
    this.game.events.on('lobby-interact', interactListener);
    this.game.events.on('lobby-dialogue-state', dialogueListener);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off('lobby-input', moveListener);
      this.game.events.off('lobby-interact', interactListener);
      this.game.events.off('lobby-dialogue-state', dialogueListener);
    });
  }

  update(_time: number, delta: number): void {
    if (this.dialogueOpen) {
      this.player.play(animationKey(this.controlledHero, 'idle', this.facing), true);
      return;
    }
    if (this.wasd && Phaser.Input.Keyboard.JustDown(this.wasd.interact)) this.interact();

    let x = 0;
    let y = 0;
    if (this.cursors?.left.isDown || this.wasd?.left.isDown) x -= 1;
    if (this.cursors?.right.isDown || this.wasd?.right.isDown) x += 1;
    if (this.cursors?.up.isDown || this.wasd?.up.isDown) y -= 1;
    if (this.cursors?.down.isDown || this.wasd?.down.isDown) y += 1;
    x += this.virtualMovement?.x ?? 0;
    y += this.virtualMovement?.y ?? 0;

    if (x || y) {
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

    this.player.setDepth(30 + this.player.y / 1000);
    this.shadow.setPosition(this.player.x, this.player.y + 31).setDepth(29 + this.player.y / 1000);
    if (this.player.x >= 942 && this.player.y >= 240 && this.player.y <= 300) {
      this.registry.set('lobbySpawnFromArchive', true);
      this.scene.start('realm-hall');
      return;
    }
    this.updateInteraction();
  }

  private createStations(): void {
    for (const station of STATIONS) {
      const glow = this.add.graphics().setDepth(12).setVisible(false);
      glow.fillStyle(station.color, 0.08).fillEllipse(station.x, station.y, 94, 42);
      glow.lineStyle(2, station.color, 0.68).strokeEllipse(station.x, station.y, 88, 37);
      this.tweens.add({ targets: glow, alpha: 0.42, duration: 850, yoyo: true, repeat: -1 });
      this.stationGlows.set(station.id, glow);
      const zone = this.add.zone(station.x, station.y, 120, 95).setInteractive({ useHandCursor: true }).setDepth(20);
      zone.on('pointerdown', () => {
        if (Phaser.Math.Distance.Between(this.player.x, this.player.y, station.x, station.y) <= 95) {
          this.openCollection(station.id);
        }
      });
    }
  }

  private createPlayer(): void {
    const hero = HEROES.find((entry) => entry.id === this.controlledHero) ?? HEROES[0];
    this.facing = 'W';
    this.shadow = this.add.ellipse(ARCHIVE_SPAWN_POINT.x, ARCHIVE_SPAWN_POINT.y + 31, 38, 14, 0x000000, 0.5).setDepth(29);
    this.player = this.add.sprite(ARCHIVE_SPAWN_POINT.x, ARCHIVE_SPAWN_POINT.y, hallTextureKey(this.controlledHero, 'idle', 'W'), 0)
      .setScale(hero.renderScale)
      .setDepth(30);
    this.player.play(animationKey(this.controlledHero, 'idle', 'W'));
  }

  private updateInteraction(): void {
    const interactions: ArchiveInteraction[] = [
      ...STATIONS.map((station): ArchiveInteraction => ({ kind: 'collection', id: station.id })),
    ];
    interactions.sort((a, b) => this.distanceTo(a) - this.distanceTo(b));
    const nearest = interactions[0];
    this.nearest = nearest && this.distanceTo(nearest) <= 96 ? nearest : undefined;

    for (const station of STATIONS) {
      this.stationGlows.get(station.id)?.setVisible(
        Phaser.Math.Distance.Between(this.player.x, this.player.y, station.x, station.y) <= 118,
      );
    }
    // Stations glow as you approach; E opens the nearest one. No floating prompts.
  }

  private interact(): void {
    if (!this.nearest) return;
    this.openCollection(this.nearest.id);
  }

  private openCollection(id: ArchiveCollectionId): void {
    this.game.events.emit('archive-collection', id);
  }

  private distanceTo(interaction: ArchiveInteraction): number {
    const point = this.station(interaction.id);
    return Phaser.Math.Distance.Between(this.player.x, this.player.y, point.x, point.y);
  }

  private station(id: ArchiveCollectionId): ArchiveStation {
    return STATIONS.find((station) => station.id === id) ?? STATIONS[0];
  }

  private isWalkable(x: number, y: number): boolean {
    return isArchiveWalkable(x, y);
  }
}
