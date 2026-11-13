import Phaser from 'phaser';

export interface HudTeammate {
  readonly name: string;
  readonly health: number;
  readonly downed: boolean;
}

export interface HudState {
  readonly heroName: string;
  readonly epithet: string;
  readonly portraitKey: string;
  readonly health: number;
  readonly maxHealth: number;
  readonly power: number;
  readonly abilityName: string;
  readonly abilityRemainingMs: number;
  readonly abilityTotalMs: number;
  readonly team?: readonly HudTeammate[];
  readonly boss?: Readonly<{ name: string; health: number; maxHealth: number }>;
  readonly realmName: string;
  readonly realmIndex: number;
  readonly realmCount: number;
  readonly themeColor: number;
}

const GOLD = 0xd5b66c;
const GOLD_BRIGHT = 0xf3dc98;
const INK = 0x050c0a;
const PANEL = 0x0b1714;
const PANEL_WIDTH = 120;
const MAP_HEIGHT = 96;
const MARGIN = 8;
// Smallest on-screen size, in CSS pixels per world unit, before the HUD scales up.
const MIN_SCREEN_SCALE = 1.45;
const BOSS_BAR_WIDTH = 280;

const label = (scene: Phaser.Scene, x: number, y: number, size: number, color: string, family = 'monospace', spacing = 1): Phaser.GameObjects.Text =>
  scene.add.text(x, y, '', { fontFamily: family, fontSize: `${size}px`, color, letterSpacing: spacing }).setResolution(3);

/** Notched panel with the double gold rule used across the menus. */
function drawRealmPanel(graphics: Phaser.GameObjects.Graphics, x: number, y: number, width: number, height: number): void {
  const notch = 5;
  const points = [
    [x + notch, y], [x + width - notch, y], [x + width, y + notch], [x + width, y + height - notch],
    [x + width - notch, y + height], [x + notch, y + height], [x, y + height - notch], [x, y + notch],
  ].map(([px, py]) => new Phaser.Math.Vector2(px, py));
  graphics.fillStyle(PANEL, 0.92).fillPoints(points, true);
  graphics.lineStyle(1, GOLD, 0.9).strokePoints(points, true);
  graphics.lineStyle(1, GOLD, 0.22).strokeRect(x + 3, y + 3, width - 6, height - 6);
  graphics.fillStyle(GOLD_BRIGHT, 1).fillRect(x + width / 2 - 1, y - 1, 3, 3).fillRect(x + width / 2 - 1, y + height - 1, 3, 3);
}

/**
 * Dungeon HUD drawn in the world: realm map and objective on the right and the
 * warden's bar along the top. Hero vitals live on the page's stat card. It anchors to the part of the
 * canvas the player can actually see, which changes with the screen's shape.
 */
export class DungeonHud {
  private readonly right: Phaser.GameObjects.Container;
  private readonly top: Phaser.GameObjects.Container;
  private readonly bossBars: Phaser.GameObjects.Graphics;
  private readonly realm: Phaser.GameObjects.Text;
  private readonly bossName: Phaser.GameObjects.Text;
  private readonly bossTag: Phaser.GameObjects.Text;
  readonly objective: Phaser.GameObjects.Text;
  private textScale = 1;
  private bossTrail = 1;
  /** Plain-text summary of what the HUD shows, for tests and debugging. */
  summary = '';

  constructor(scene: Phaser.Scene) {
    const rightFrame = scene.add.graphics();
    drawRealmPanel(rightFrame, 0, 0, PANEL_WIDTH, MAP_HEIGHT);
    this.realm = label(scene, PANEL_WIDTH / 2, 7, 5, '#c9b682').setOrigin(0.5, 0);
    this.objective = label(scene, PANEL_WIDTH / 2, MAP_HEIGHT + 8, 6, '#bcd4cc').setOrigin(0.5, 0).setAlign('center').setLineSpacing(3).setWordWrapWidth(PANEL_WIDTH - 8);
    this.right = scene.add.container(0, 0, [rightFrame, this.realm, this.objective]).setDepth(89);

    this.bossBars = scene.add.graphics();
    this.bossName = label(scene, 0, 0, 8, '#f1e3b8', 'Cinzel, Georgia, serif', 2).setOrigin(0.5, 0);
    this.bossTag = label(scene, BOSS_BAR_WIDTH / 2, 2, 5, '#ff8f94').setOrigin(1, 0);
    this.top = scene.add.container(0, 0, [this.bossBars, this.bossName, this.bossTag]).setDepth(89).setVisible(false);
  }

  /**
   * Re-anchors the panels to the visible part of the world (in world units).
   * screenScale is CSS pixels per world unit; small screens scale the HUD up so
   * its text stays legible. rightTop keeps the map clear of the page's header buttons.
   */
  layout(visible: Phaser.Geom.Rectangle, room: Phaser.Geom.Rectangle, screenScale: number, rightTop: number): void {
    const scale = Phaser.Math.Clamp(MIN_SCREEN_SCALE / Math.max(0.1, screenScale), 1, 2);
    const top = Math.max(visible.top + MARGIN, room.top);
    this.right.setScale(scale).setPosition(Math.round(visible.right - MARGIN - PANEL_WIDTH * scale), Math.round(Math.max(top, rightTop + MARGIN)));
    // Above the room when that strip is on screen, otherwise just inside its top wall.
    const bossTop = room.top - visible.top >= 40 ? room.top - 38 : visible.top + MARGIN;
    this.top.setScale(scale).setPosition(Math.round(room.centerX), Math.round(bossTop));
  }

  /** Where the scene should draw the realm map, in world units. */
  /** Settings → Text size: the objective and boss name grow; the bars keep their size. */
  setTextScale(scale: number): void {
    if (scale === this.textScale) return;
    this.textScale = scale;
    for (const text of [this.objective, this.realm, this.bossName, this.bossTag]) text.setScale(scale);
  }

  mapLayout(rooms: readonly Readonly<{ x: number; y: number }>[]): { originX: number; originY: number; cell: number } {
    const xs = rooms.map((room) => room.x);
    const ys = rooms.map((room) => room.y);
    const columns = Math.max(...xs) - Math.min(...xs) + 1;
    const rows = Math.max(...ys) - Math.min(...ys) + 1;
    const scale = this.right.scaleX;
    const cell = Math.max(4, Math.min(11, Math.floor((PANEL_WIDTH - 16) / columns), Math.floor((MAP_HEIGHT - 26) / rows))) * scale;
    return {
      originX: this.right.x + PANEL_WIDTH * scale / 2 - (columns * cell) / 2 - Math.min(...xs) * cell,
      originY: this.right.y + 18 * scale + ((MAP_HEIGHT - 22) * scale - rows * cell) / 2 - Math.min(...ys) * cell,
      cell,
    };
  }

  update(state: HudState, delta: number): void {
    this.realm.setText(`${state.realmName.toUpperCase()}  ${state.realmIndex + 1}/${state.realmCount}`);
    this.drawBoss(state, delta);
    this.summary = `${state.heroName} ${state.health}/${state.maxHealth} power ${state.power.toFixed(2)}${state.boss ? ` boss ${state.boss.health}/${state.boss.maxHealth}` : ''}`;
  }

  destroy(): void {
    for (const container of [this.right, this.top]) container.destroy(true);
  }

  private drawBoss(state: HudState, delta: number): void {
    const boss = state.boss;
    this.top.setVisible(Boolean(boss));
    if (!boss) { this.bossTrail = 1; return; }
    const ratio = Phaser.Math.Clamp(boss.health / boss.maxHealth, 0, 1);
    // The pale chip trails behind real damage so big hits read clearly.
    this.bossTrail = this.bossTrail < ratio ? ratio : Math.max(ratio, this.bossTrail - delta / 1600);
    const enraged = ratio <= 0.5;
    this.bossName.setText(boss.name.toUpperCase());
    this.bossTag.setText(enraged ? 'ENRAGED' : `${boss.health} / ${boss.maxHealth}`).setColor(enraged ? '#ff8f94' : '#9fb2a9');
    const x = -BOSS_BAR_WIDTH / 2; const y = 16;
    const bars = this.bossBars.clear();
    bars.fillStyle(INK, 0.95).fillRect(x - 3, y - 3, BOSS_BAR_WIDTH + 6, 12);
    bars.lineStyle(1, GOLD, 0.95).strokeRect(x - 3.5, y - 3.5, BOSS_BAR_WIDTH + 7, 13);
    bars.fillStyle(GOLD_BRIGHT, 1);
    for (const ex of [x - 9, x + BOSS_BAR_WIDTH + 6]) {
      bars.fillPoints([new Phaser.Math.Vector2(ex + 2, y - 1), new Phaser.Math.Vector2(ex + 5, y + 3), new Phaser.Math.Vector2(ex + 2, y + 7), new Phaser.Math.Vector2(ex - 1, y + 3)], true);
    }
    bars.fillStyle(0xf6e6d0, 0.85).fillRect(x, y, Math.round(BOSS_BAR_WIDTH * this.bossTrail), 6);
    bars.fillStyle(enraged ? 0xff4d5e : 0xc8384a, 1).fillRect(x, y, Math.round(BOSS_BAR_WIDTH * ratio), 6);
    bars.fillStyle(0xff9aa5, 0.55).fillRect(x, y, Math.round(BOSS_BAR_WIDTH * ratio), 2);
    // The enrage threshold.
    bars.fillStyle(GOLD_BRIGHT, 0.9).fillRect(0, y - 2, 1, 10);
  }
}
