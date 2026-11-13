import Phaser from 'phaser';
import { ITEMS, type ItemId } from '../domain/runItems';

export const LOOT_ITEMS_KEY = 'loot-items';
export const LOOT_CHESTS_KEY = 'loot-chests';
export const LOOT_ITEM_CELL = 32;
export const LOOT_CHEST_SIZE = { width: 48, height: 44, frames: 5 } as const;

interface Chest {
  readonly sprite: Phaser.GameObjects.Sprite;
  readonly shadow: Phaser.GameObjects.Ellipse;
  readonly kind: 'room' | 'warden';
  readonly items: readonly ItemId[];
  landed: boolean;
  opened: boolean;
  readonly onOpen?: () => void;
}

interface Pickup {
  readonly id: ItemId;
  readonly sprite: Phaser.GameObjects.Image;
  readonly glow: Phaser.GameObjects.Ellipse;
  ready: boolean;
  bob: number;
}

/**
 * Chests and the items they scatter. A chest drops in when a room is sealed,
 * bursts open when the hero walks into it, and its items are collected by
 * walking over them (with a short magnet pull so it feels generous).
 */
export class LootSystem {
  private readonly chests: Chest[] = [];
  private readonly pickups: Pickup[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly onCollect: (id: ItemId, x: number, y: number) => void,
    private readonly depthFor: (y: number) => number,
    private readonly sound: (id: 'chest-land' | 'chest-open') => void = () => undefined,
  ) {}

  static installAnimations(scene: Phaser.Scene): void {
    for (const [row, kind] of (['room', 'warden'] as const).entries()) {
      const key = `loot-chest-open:${kind}`;
      if (scene.anims.exists(key)) continue;
      const start = row * LOOT_CHEST_SIZE.frames;
      scene.anims.create({ key, frames: scene.anims.generateFrameNumbers(LOOT_CHESTS_KEY, { start: start + 1, end: start + LOOT_CHEST_SIZE.frames - 1 }), frameRate: 14, repeat: 0 });
    }
  }

  spawnChest(kind: 'room' | 'warden', x: number, y: number, items: readonly ItemId[], onOpen?: () => void): void {
    const frame = kind === 'room' ? 0 : LOOT_CHEST_SIZE.frames;
    const shadow = this.scene.add.ellipse(x, y + 9, 30, 9, 0x000000, 0.45).setDepth(8).setScale(0.3);
    const sprite = this.scene.add.sprite(x, y - 70, LOOT_CHESTS_KEY, frame).setOrigin(0.5, 0.8).setScale(kind === 'warden' ? 0.82 : 0.7).setDepth(this.depthFor(y)).setAlpha(0);
    const chest: Chest = { sprite, shadow, kind, items, landed: false, opened: false, onOpen };
    this.chests.push(chest);
    // Drops in from above, lands with a squash and a puff of dust.
    this.scene.tweens.add({ targets: shadow, scale: 1, duration: 420, ease: 'Quad.In' });
    this.scene.tweens.add({
      targets: sprite, y, alpha: 1, duration: 420, ease: 'Quad.In',
      onComplete: () => {
        const base = sprite.scaleX;
        this.sound('chest-land');
        this.scene.tweens.add({ targets: sprite, scaleX: base * 1.18, scaleY: base * 0.82, duration: 70, yoyo: true, onComplete: () => { chest.landed = true; } });
        for (let index = 0; index < 6; index += 1) {
          const angle = Math.PI + (index / 5) * Math.PI;
          const dust = this.scene.add.circle(x, y + 6, 2.5, 0xcbbfa0, 0.7).setDepth(9);
          this.scene.tweens.add({ targets: dust, x: x + Math.cos(angle) * 18, y: y + 6 + Math.sin(angle) * 5, alpha: 0, scale: 1.8, duration: 380, onComplete: () => dust.destroy() });
        }
      },
    });
  }

  /** Adds an item to the most recent chest, scattering it at once if that chest is already open. */
  addToLastChest(id: ItemId): void {
    const chest = this.chests[this.chests.length - 1];
    if (!chest) return;
    if (chest.opened) this.scatter(id, chest.sprite.x, chest.sprite.y - 12, 0, 1);
    else (chest.items as ItemId[]).push(id);
  }

  update(heroX: number, heroY: number, delta: number): void {
    for (const chest of this.chests) {
      if (!chest.landed || chest.opened) continue;
      if (Phaser.Math.Distance.Between(heroX, heroY + 18, chest.sprite.x, chest.sprite.y) < 30) this.open(chest);
    }
    for (const pickup of [...this.pickups]) {
      if (!pickup.ready) continue;
      pickup.bob += delta;
      const distance = Phaser.Math.Distance.Between(heroX, heroY + 10, pickup.sprite.x, pickup.sprite.y);
      if (distance < 52) {
        // Magnet: drift toward the hero, faster the closer they are.
        const pull = Math.min(1, (52 - distance) / 52) * 0.28;
        pickup.sprite.x = Phaser.Math.Linear(pickup.sprite.x, heroX, pull);
        pickup.sprite.y = Phaser.Math.Linear(pickup.sprite.y, heroY + 6, pull);
      } else {
        pickup.sprite.y += Math.sin(pickup.bob / 220) * 0.08;
      }
      pickup.glow.setPosition(pickup.sprite.x, pickup.sprite.y + 9);
      if (distance < 16) this.collect(pickup);
    }
  }

  clear(): void {
    for (const chest of this.chests.splice(0)) { chest.sprite.destroy(); chest.shadow.destroy(); }
    for (const pickup of this.pickups.splice(0)) { pickup.sprite.destroy(); pickup.glow.destroy(); }
  }

  /** Pops a single item out of the ground at a point, e.g. an elite's drop or a broken urn. */
  drop(id: ItemId, x: number, y: number): void {
    this.scatter(id, x, y - 12, 0, 1);
  }

  get openChestCount(): number { return this.chests.filter((chest) => chest.opened).length; }

  private open(chest: Chest): void {
    chest.opened = true;
    chest.onOpen?.();
    this.sound('chest-open');
    chest.sprite.play(`loot-chest-open:${chest.kind}`);
    const glow = chest.kind === 'warden' ? 0x9cf0ff : 0xffd982;
    const burst = this.scene.add.circle(chest.sprite.x, chest.sprite.y - 10, 10, glow, 0.55).setDepth(this.depthFor(chest.sprite.y) + 0.01);
    this.scene.tweens.add({ targets: burst, scale: 3, alpha: 0, duration: 420, onComplete: () => burst.destroy() });
    chest.items.forEach((id, index) => {
      this.scene.time.delayedCall(180 + index * 110, () => this.scatter(id, chest.sprite.x, chest.sprite.y - 12, index, chest.items.length));
    });
  }

  private scatter(id: ItemId, x: number, y: number, index: number, count: number): void {
    const item = ITEMS[id];
    const spread = count === 1 ? 0 : (index / (count - 1) - 0.5) * 1.6;
    const angle = Math.PI / 2 + spread + (index % 2 === 0 ? 0.15 : -0.15);
    const landX = x + Math.cos(angle) * 30 * (count === 1 ? 0.2 : 1);
    const landY = y + 22 + Math.sin(angle) * 8;
    const glowColor = item.rarity === 'warden' ? 0x9cf0ff : item.rarity === 'rare' ? 0xd7a6ff : 0xffe39b;
    const glow = this.scene.add.ellipse(landX, landY + 9, 18, 6, glowColor, 0.35).setDepth(8).setAlpha(0);
    const sprite = this.scene.add.image(x, y, LOOT_ITEMS_KEY, item.sprite).setScale(0.55).setDepth(this.depthFor(landY + 20));
    const pickup: Pickup = { id, sprite, glow, ready: false, bob: index * 300 };
    this.pickups.push(pickup);
    // A little arc out of the chest.
    this.scene.tweens.add({ targets: sprite, x: landX, duration: 420, ease: 'Linear' });
    this.scene.tweens.add({ targets: sprite, y: y - 26, duration: 200, ease: 'Quad.Out', yoyo: false, onComplete: () => {
      this.scene.tweens.add({ targets: sprite, y: landY, duration: 220, ease: 'Bounce.Out', onComplete: () => { pickup.ready = true; glow.setAlpha(1); } });
    } });
  }

  private collect(pickup: Pickup): void {
    const index = this.pickups.indexOf(pickup);
    if (index >= 0) this.pickups.splice(index, 1);
    const { x, y } = pickup.sprite;
    pickup.glow.destroy();
    this.scene.tweens.add({ targets: pickup.sprite, y: y - 14, alpha: 0, scale: 0.8, duration: 200, onComplete: () => pickup.sprite.destroy() });
    this.onCollect(pickup.id, x, y);
  }
}
