import type { DungeonRunScene } from '../DungeonRunScene';
import { loadMeta, saveMeta } from '../../domain/metaProgress';
import { discover, entriesFor, readSlip, type LoreEntry } from '../../domain/lore';
import { ROOM_CENTER } from './runShared';

/**
 * Lore found during a run: Archive records, their toasts, and Jade Slips.
 * Split out of DungeonRunScene; it works on the run's state through `run`.
 */
export class RunLore {
  constructor(private readonly run: DungeonRunScene) {}

  /**
   * Records a lore event (an enemy met, a realm entered...) and announces anything
   * it newly reveals. Cheap when nothing is new, so it is safe to call per kill.
   */
  learn(event: string): void {
    if (this.run.coopSnapshot || entriesFor(event, this.run.loreKnown).length === 0) return;
    const meta = loadMeta();
    const found = discover(meta.lore, event);
    if (found.length === 0) { this.run.loreKnown = meta.lore; return; }
    saveMeta(meta);
    this.run.loreKnown = [...meta.lore];
    this.run.meta = { ...this.run.meta, lore: meta.lore };
    for (const item of found) this.queueLoreToast(item.title);
  }

  /** Collects discoveries made within a moment of each other and announces them together. */
  queueLoreToast(title: string): void {
    this.run.pendingToasts.push(title);
    if (this.run.pendingToasts.length > 1) return;
    this.run.time.delayedCall(180, () => {
      const titles = this.run.pendingToasts.splice(0);
      if (titles.length > 2) this.showLoreToast(`${titles.length} NEW RECORDS`);
      else for (const title of titles) this.showLoreToast(title);
    });
  }

  /** A quiet "new record" note at the top of the room; the archive holds the text. */
  showLoreToast(title: string): void {
    this.run.audioFeedback?.play('lore-found', 0.7);
    const slot = this.run.loreToasts++;
    const label = this.run.add.text(ROOM_CENTER.x, this.run.roomBounds.top + (22 + slot * 13) * this.run.roomScale, `ARCHIVE UPDATED  •  ${title.toUpperCase()}`, {
      fontFamily: 'IBM Plex Mono, monospace', fontSize: '6px', color: '#f0d48a', stroke: '#06100d', strokeThickness: 3, letterSpacing: 1,
    }).setOrigin(0.5).setDepth(95).setAlpha(0).setResolution(3);
    this.run.tweens.add({ targets: label, alpha: 1, duration: 260 });
    this.run.tweens.add({
      targets: label, alpha: 0, delay: 3000, duration: 500,
      onComplete: () => { label.destroy(); this.run.loreToasts = Math.max(0, this.run.loreToasts - 1); },
    });
  }

  /** Reading a Jade Slip shows a page of the world's history in full, or pays out stones once all are read. */
  readJadeSlip(x: number, y: number): void {
    const meta = loadMeta();
    const page = readSlip(meta.lore, Math.random());
    if (!page) {
      meta.shards += 3;
      this.run.runShards += 3;
      saveMeta(meta);
      this.run.game.events.emit('echo-shards-changed');
      this.run.spawnFloatingText(x, y - 18, 'THE SLIP IS BLANK, ITS HISTORY ALREADY KNOWN\n+3 SPIRIT STONES', '#9fe8cf', 1800);
      return;
    }
    saveMeta(meta);
    this.run.loreKnown = [...meta.lore];
    this.run.meta = { ...this.run.meta, lore: meta.lore };
    this.run.audioFeedback?.play('lore-found');
    this.showLoreCard(page);
  }

  /** A framed page of lore across the top of the floor; the game keeps running underneath. */
  showLoreCard(page: LoreEntry): void {
    const width = 250;
    const title = this.run.add.text(0, 0, `JADE SLIP  •  ${page.title.toUpperCase()}`, {
      fontFamily: 'Cinzel, Georgia, serif', fontSize: '7px', color: '#f0d48a', letterSpacing: 1, wordWrap: { width: width - 16 },
    }).setOrigin(0.5, 0).setResolution(3);
    const body = this.run.add.text(0, 0, page.text, {
      fontFamily: 'Barlow Condensed, sans-serif', fontSize: '9px', color: '#e8e2cf', align: 'center', lineSpacing: 1, wordWrap: { width: width - 16 },
    }).setOrigin(0.5, 0).setResolution(3);
    const height = title.height + body.height + 18;
    title.setPosition(0, 7);
    body.setPosition(0, 7 + title.height + 4);
    const panel = this.run.add.graphics();
    panel.fillStyle(0x07100e, 0.93).fillRect(-width / 2, 0, width, height);
    panel.lineStyle(1, 0x4fa88a, 1).strokeRect(-width / 2 + 0.5, 0.5, width - 1, height - 1);
    panel.lineStyle(1, 0xd5b66c, 0.4).strokeRect(-width / 2 + 3.5, 3.5, width - 7, height - 7);
    const card = this.run.add.container(ROOM_CENTER.x, this.run.roomBounds.top + this.run.wallBand + 4 * this.run.roomScale, [panel, title, body]).setDepth(96).setAlpha(0);
    this.run.tweens.add({ targets: card, alpha: 1, duration: 300 });
    this.run.tweens.add({ targets: card, alpha: 0, delay: 3200 + page.text.length * 38, duration: 700, onComplete: () => card.destroy() });
  }
}
