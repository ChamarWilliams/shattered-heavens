import Phaser from 'phaser';
import type { DungeonThemeId } from '../dungeon/types';
import { coverFootprint, type CoverPiece } from '../dungeon/roomFeatures';
import { ITEMS } from '../domain/runItems';
import type { Ware } from '../domain/specialRooms';
import { LOOT_ITEMS_KEY } from './LootSystem';

const SHEETS = {
  merchant: { key: 'room-merchant', file: '/assets/rooms/merchant.png', width: 80, height: 64 },
  altar: { key: 'room-altar', file: '/assets/rooms/altar.png', width: 48, height: 56 },
  bell: { key: 'room-bell', file: '/assets/rooms/bell.png', width: 48, height: 64 },
  pedestal: { key: 'room-pedestal', file: '/assets/rooms/pedestal.png', width: 32, height: 20 },
} as const;
const coverKey = (themeId: DungeonThemeId): string => `room-cover:${themeId}`;
/** Cover sheet frames: pillar, then urn intact, cracking, bursting, shards. */
const COVER_FRAME = { width: 32, height: 56, pillar: 0, urn: 1, cracking: 2, bursting: 3, shards: 4 } as const;

interface PlacedCover {
  readonly kind: CoverPiece['kind'];
  readonly sprite: Phaser.GameObjects.Sprite;
  /** Ground footprint that blocks feet and shots. */
  readonly rect: Phaser.Geom.Rectangle;
  broken: boolean;
}

export type FeatureTarget =
  | { readonly kind: 'ware'; readonly index: number; readonly x: number; readonly y: number }
  | { readonly kind: 'altar' | 'bell'; readonly x: number; readonly y: number };

interface Interactable {
  readonly target: FeatureTarget;
  readonly objects: Phaser.GameObjects.GameObject[];
  prompt: string;
  enabled: boolean;
}

export interface RoomFeatureHooks {
  /** World depth for something whose feet stand at y. */
  depthFor(feetY: number): number;
  /** An urn shattered at this point. */
  urnBroken(x: number, y: number): void;
}

/**
 * Everything placed inside a room that is not an enemy, a trap or loot:
 * pillars and breakable urns that block movement and shots, and the props of
 * the special rooms (the Peddler's stall and wares, the Heart-Blood Altar, the
 * Bell of Trials) with their F-to-interact prompts.
 */
export class RoomFeatureSystem {
  private readonly cover: PlacedCover[] = [];
  private readonly interactables: Interactable[] = [];
  private readonly decor: Phaser.GameObjects.GameObject[] = [];
  private readonly promptText: Phaser.GameObjects.Text;
  private elapsedMs = 0;
  /** Settings → Text size. */
  textScale = 1;
  private altarSprite?: Phaser.GameObjects.Sprite;
  private bellSprite?: Phaser.GameObjects.Sprite;

  constructor(private readonly scene: Phaser.Scene, private readonly hooks: RoomFeatureHooks) {
    this.promptText = scene.add.text(0, 0, '', {
      fontFamily: 'monospace', fontSize: '8px', color: '#fff3cf', backgroundColor: '#06100ddd', padding: { x: 6, y: 3 }, align: 'center',
    }).setOrigin(0.5, 1).setDepth(60).setResolution(2).setVisible(false);
  }

  static preload(scene: Phaser.Scene, themes: readonly DungeonThemeId[]): void {
    for (const sheet of Object.values(SHEETS)) scene.load.spritesheet(sheet.key, sheet.file, { frameWidth: sheet.width, frameHeight: sheet.height });
    for (const themeId of themes) scene.load.spritesheet(coverKey(themeId), `/assets/rooms/cover-${themeId}.png`, { frameWidth: COVER_FRAME.width, frameHeight: COVER_FRAME.height });
  }

  static installAnimations(scene: Phaser.Scene): void {
    if (!scene.anims.exists('room-merchant:idle')) {
      scene.anims.create({ key: 'room-merchant:idle', frames: scene.anims.generateFrameNumbers(SHEETS.merchant.key, { start: 0, end: 1 }), frameRate: 3, repeat: -1 });
      scene.anims.create({ key: 'room-altar:lit', frames: scene.anims.generateFrameNumbers(SHEETS.altar.key, { start: 0, end: 1 }), frameRate: 5, repeat: -1 });
      scene.anims.create({ key: 'room-bell:ring', frames: scene.anims.generateFrameNumbers(SHEETS.bell.key, { frames: [1, 2, 1, 2, 0] }), frameRate: 9, repeat: 0 });
    }
  }

  // ---- Cover ----

  /** Places cover on the room's tile grid. Each piece blocks its tile's ground footprint. */
  spawnCover(themeId: DungeonThemeId, pieces: readonly CoverPiece[], grid: { originX: number; originY: number; tile: number }): void {
    for (const piece of pieces) {
      const foot = coverFootprint(piece, grid);
      const rect = new Phaser.Geom.Rectangle(foot.left, foot.top, foot.width, foot.height);
      const baseY = foot.baseY;
      const sprite = this.scene.add.sprite(foot.centerX, baseY, coverKey(themeId), piece.kind === 'pillar' ? COVER_FRAME.pillar : COVER_FRAME.urn)
        .setOrigin(0.5, 1)
        .setScale(grid.tile / 32)
        .setDepth(this.hooks.depthFor(baseY));
      this.cover.push({ kind: piece.kind, sprite, rect, broken: false });
    }
  }

  /** Whether intact cover overlaps a ground rectangle (a footprint). */
  blocksRect(left: number, top: number, right: number, bottom: number): boolean {
    return this.cover.some((piece) => !piece.broken && piece.rect.right > left && piece.rect.left < right && piece.rect.bottom > top && piece.rect.top < bottom);
  }

  /**
   * A shot at (x, y) with this radius hits cover. Urns shatter; returns whether
   * the shot was stopped.
   */
  stopsShot(x: number, y: number, radius: number): boolean {
    const circle = new Phaser.Geom.Circle(x, y, Math.max(1, radius * 0.6));
    for (const piece of this.cover) {
      if (piece.broken || !Phaser.Geom.Intersects.CircleToRectangle(circle, piece.rect)) continue;
      if (piece.kind === 'urn') this.shatter(piece);
      return true;
    }
    return false;
  }

  /** Co-op: shatters the urns the server says are broken (by cover index). */
  syncBrokenUrns(indices: readonly number[]): void {
    for (const index of indices) {
      const piece = this.cover[index];
      if (piece && piece.kind === 'urn' && !piece.broken) this.shatter(piece);
    }
  }

  /** Shatters every urn within a radius (dashes, detonations). */
  breakUrnsNear(x: number, y: number, radius: number): void {
    const circle = new Phaser.Geom.Circle(x, y, radius);
    for (const piece of this.cover) if (piece.kind === 'urn' && !piece.broken && Phaser.Geom.Intersects.CircleToRectangle(circle, piece.rect)) this.shatter(piece);
  }

  /** Cover centres, so traps and spawns can keep away from them. */
  get coverRects(): readonly Phaser.Geom.Rectangle[] {
    return this.cover.filter((piece) => !piece.broken).map((piece) => piece.rect);
  }

  private shatter(piece: PlacedCover): void {
    piece.broken = true;
    piece.sprite.setFrame(COVER_FRAME.cracking);
    this.scene.time.delayedCall(60, () => piece.sprite.active && piece.sprite.setFrame(COVER_FRAME.bursting));
    this.scene.time.delayedCall(160, () => {
      if (!piece.sprite.active) return;
      piece.sprite.setFrame(COVER_FRAME.shards).setDepth(6);
    });
    this.hooks.urnBroken(piece.rect.centerX, piece.rect.centerY);
  }

  // ---- Special-room props ----

  spawnMerchant(stall: { x: number; y: number }, wares: readonly Ware[], sold: readonly boolean[], scale: number): void {
    const sprite = this.scene.add.sprite(stall.x, stall.y, SHEETS.merchant.key, 0).setOrigin(0.5, 1).setScale(scale).setDepth(this.hooks.depthFor(stall.y)).play('room-merchant:idle');
    this.decor.push(sprite);
    const spacing = 64 * scale;
    wares.forEach((ware, index) => {
      const x = stall.x + (index - 1) * spacing;
      const y = stall.y + 58 * scale;
      const pedestal = this.scene.add.image(x, y, SHEETS.pedestal.key).setOrigin(0.5, 1).setScale(scale).setDepth(this.hooks.depthFor(y));
      const icon = this.scene.add.image(x, y - 22 * scale, LOOT_ITEMS_KEY, ITEMS[ware.item].sprite).setScale(0.55 * scale).setDepth(this.hooks.depthFor(y) + 0.001);
      const price = this.scene.add.text(x, y + 2, `◆ ${ware.price}`, { fontFamily: 'monospace', fontSize: '8px', color: '#f0d48a', stroke: '#06100d', strokeThickness: 3 })
        .setOrigin(0.5, 0).setDepth(this.hooks.depthFor(y) + 0.002).setResolution(2);
      const interactable: Interactable = {
        target: { kind: 'ware', index, x, y: y - 10 },
        objects: [pedestal, icon, price],
        prompt: `F  BUY ${ITEMS[ware.item].name.toUpperCase()}  ◆ ${ware.price}\n${ITEMS[ware.item].blurb}`,
        enabled: !sold[index],
      };
      if (sold[index]) this.markSold(interactable);
      this.interactables.push(interactable);
    });
  }

  /** Called after a ware is bought. */
  sellWare(index: number): void {
    const interactable = this.interactables.find((candidate) => candidate.target.kind === 'ware' && candidate.target.index === index);
    if (interactable) this.markSold(interactable);
  }

  private markSold(interactable: Interactable): void {
    interactable.enabled = false;
    const [, icon, price] = interactable.objects as [Phaser.GameObjects.Image, Phaser.GameObjects.Image, Phaser.GameObjects.Text];
    icon.setVisible(false);
    price.setText('SOLD').setColor('#8a978f');
  }

  spawnAltar(point: { x: number; y: number }, used: boolean, scale: number): void {
    const sprite = this.scene.add.sprite(point.x, point.y, SHEETS.altar.key, used ? 2 : 0).setOrigin(0.5, 1).setScale(scale).setDepth(this.hooks.depthFor(point.y));
    if (!used) sprite.play('room-altar:lit');
    this.altarSprite = sprite;
    this.interactables.push({ target: { kind: 'altar', x: point.x, y: point.y - 6 }, objects: [sprite], prompt: 'F  OFFER ONE MAX HEART\nfor a relic', enabled: !used });
  }

  spendAltar(): void {
    this.altarSprite?.stop().setFrame(2);
    const altar = this.interactables.find((candidate) => candidate.target.kind === 'altar');
    if (altar) altar.enabled = false;
  }

  spawnBell(point: { x: number; y: number }, rung: boolean, scale: number): void {
    const sprite = this.scene.add.sprite(point.x, point.y, SHEETS.bell.key, rung ? 3 : 0).setOrigin(0.5, 1).setScale(scale).setDepth(this.hooks.depthFor(point.y));
    this.bellSprite = sprite;
    this.interactables.push({ target: { kind: 'bell', x: point.x, y: point.y - 6 }, objects: [sprite], prompt: 'F  RING THE BELL OF TRIALS\nsurvive three waves for a gilded chest', enabled: !rung });
  }

  ringBell(): void {
    this.bellSprite?.play('room-bell:ring');
    const bell = this.interactables.find((candidate) => candidate.target.kind === 'bell');
    if (bell) bell.enabled = false;
  }

  /** The trial is over: the bell falls silent. */
  silenceBell(): void {
    this.bellSprite?.stop().setFrame(3);
  }

  /** The nearest thing the hero can interact with, if within reach. */
  nearest(heroX: number, heroFeetY: number, reach = 34): FeatureTarget | undefined {
    let best: Interactable | undefined;
    let bestDistance = reach;
    for (const interactable of this.interactables) {
      if (!interactable.enabled) continue;
      const distance = Phaser.Math.Distance.Between(heroX, heroFeetY, interactable.target.x, interactable.target.y);
      if (distance < bestDistance) { best = interactable; bestDistance = distance; }
    }
    return best?.target;
  }

  update(delta: number, heroX: number, heroFeetY: number, suppressed: boolean): void {
    this.elapsedMs += delta;
    for (const interactable of this.interactables) {
      if (interactable.target.kind !== 'ware' || !interactable.enabled) continue;
      const icon = interactable.objects[1] as Phaser.GameObjects.Image;
      icon.y = interactable.target.y - 12 * (icon.scaleX / 0.55) + Math.sin(this.elapsedMs / 380 + interactable.target.index) * 1.5;
    }
    const target = suppressed ? undefined : this.nearest(heroX, heroFeetY);
    const interactable = target && this.interactables.find((candidate) => candidate.target === target);
    if (!interactable) { this.promptText.setVisible(false); return; }
    const top = interactable.target.kind === 'ware' ? interactable.target.y - 30 : interactable.target.y - 60;
    this.promptText.setText(interactable.prompt).setPosition(interactable.target.x, top).setScale(this.textScale).setVisible(true);
  }

  clear(): void {
    for (const piece of this.cover.splice(0)) piece.sprite.destroy();
    for (const interactable of this.interactables.splice(0)) for (const object of interactable.objects) object.destroy();
    for (const object of this.decor.splice(0)) object.destroy();
    this.altarSprite = undefined;
    this.bellSprite = undefined;
    this.promptText.setVisible(false);
  }
}
