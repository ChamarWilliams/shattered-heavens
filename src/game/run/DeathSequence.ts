import Phaser from 'phaser';
import type { DungeonRunScene } from '../DungeonRunScene';
import { heroFrameCount } from '../../assets/gameplayManifest';
import { ENEMY_NAMES, HUB_NAME } from '../../domain/lexicon';
import { EPITAPHS } from '../../domain/lore';
import { PROTECTORS } from '../../domain/specialRooms';
import { DUNGEON_THEMES } from '../../dungeon';
import { music } from '../music';
import { LOGICAL_WIDTH, LOGICAL_HEIGHT } from './runShared';

/**
 * The fall: the death animation plays in full, the screen fades to black, an epitaph shows, then the run returns to the Pavilion.
 * Split out of DungeonRunScene; it works on the run's state through `run`.
 */
export class DeathSequence {
  constructor(private readonly run: DungeonRunScene) {}

  beginDeathSequence(): void {
    const killer = this.run.lastHurtBy !== 'the realm' ? this.run.lastHurtBy : (() => {
      const nearest = [...this.run.enemies].sort((a, b) => Phaser.Math.Distance.Between(a.sprite.x, a.sprite.y, this.run.hero.x, this.run.hero.y) - Phaser.Math.Distance.Between(b.sprite.x, b.sprite.y, this.run.hero.x, this.run.hero.y))[0];
      return nearest ? `the ${nearest.role === 'protector' ? PROTECTORS[this.run.dungeon.themeId].name : ENEMY_NAMES[this.run.dungeon.themeId][nearest.column]}` : 'the realm';
    })();
    this.run.recordRunOnce(`Fell to ${killer}`);
    music.setTrack(undefined);
    music.sting('sting-death');
    // The world freezes around the fallen hero: no more shots or telegraphs, and
    // enemies stop updating while the death animation plays in full.
    for (const projectile of [...this.run.projectiles]) this.run.removeProjectile(projectile);
    for (const transient of this.run.roomTransients) transient.destroy();
    this.run.roomTransients.clear();
    this.run.tweens.killTweensOf(this.run.bannerText);
    this.run.bannerText.setAlpha(0);
    this.run.objectiveText.setText('');
    this.run.invulnerableMs = 0;
    this.run.hero.setAlpha(1);
    this.run.deathSequence = { phase: 'dying', elapsedMs: 0, objects: [] };
    this.run.updateHud();
  }

  updateDeathSequence(delta: number): void {
    const sequence = this.run.deathSequence;
    if (!sequence) return;
    sequence.elapsedMs += delta;
    if (sequence.phase === 'dying') {
      this.run.actor.update(delta);
      const snapshot = this.run.actor.snapshot();
      const animation = this.run.config.animations.death;
      const progress = Math.min(1, snapshot.stateElapsedMs / animation.durationMs);
      const frameCount = heroFrameCount(this.run.heroAsset, 'death');
      this.run.hero.render('death', snapshot.orientation.facingDirection, progress, Math.min(frameCount - 1, Math.floor(progress * frameCount)));
      this.run.hero.setAlpha(1);
      // Li's mounted swords hide in the death state, as they do in normal play.
      this.run.cultivatorSwordView?.sync({ x: this.run.hero.x, y: this.run.hero.y }, 'death', snapshot.stateElapsedMs, snapshot.stateDurationMs, snapshot.orientation.movementDirection, snapshot.orientation.aimAngle, 0.5);
      // Hold on the last frame for a beat before the screen goes dark.
      if (sequence.elapsedMs >= animation.durationMs + 450) this.blackOutForDeath(sequence);
    } else if (sequence.phase === 'message' && this.run.keys && (Phaser.Input.Keyboard.JustDown(this.run.keys.interact) || Phaser.Input.Keyboard.JustDown(this.run.keys.attack))) {
      this.leaveAfterDeath(sequence);
    }
  }

  blackOutForDeath(sequence: NonNullable<DungeonRunScene['deathSequence']>): void {
    sequence.phase = 'blackout';
    const veil = this.run.add.rectangle(LOGICAL_WIDTH / 2, LOGICAL_HEIGHT / 2, LOGICAL_WIDTH * 2.4, LOGICAL_HEIGHT * 2.4, 0x000000, 1).setDepth(300).setAlpha(0);
    sequence.objects.push(veil);
    this.run.tweens.add({
      targets: veil,
      alpha: 1,
      duration: 900,
      ease: 'Sine.InOut',
      onComplete: () => {
        this.run.clearRoomObjects();
        this.run.clearHeroAbilitySystems();
        this.run.hero.setVisible(false);
        const theme = DUNGEON_THEMES[this.run.dungeon.themeId];
        const title = this.run.add.text(LOGICAL_WIDTH / 2, LOGICAL_HEIGHT / 2 - 18, 'YOUR ECHO FADES', {
          fontFamily: 'Cinzel, Georgia, serif', fontSize: '30px', color: '#e9d9a8', stroke: '#000000', strokeThickness: 4,
        }).setOrigin(0.5).setDepth(301).setAlpha(0).setResolution(2);
        const detail = this.run.add.text(LOGICAL_WIDTH / 2, LOGICAL_HEIGHT / 2 + 18, `FALLEN IN THE ${theme.name.toUpperCase()}  •  REALM ${this.run.themeIndex + 1} OF ${this.run.runThemeOrder.length}`, {
          fontFamily: 'monospace', fontSize: '8px', color: '#8fa49b', letterSpacing: 2,
        }).setOrigin(0.5).setDepth(301).setAlpha(0).setResolution(2);
        const hint = this.run.add.text(LOGICAL_WIDTH / 2, LOGICAL_HEIGHT / 2 + 64, `F  •  RETURN TO THE ${HUB_NAME.toUpperCase()}`, {
          fontFamily: 'monospace', fontSize: '7px', color: '#5f7168', letterSpacing: 2,
        }).setOrigin(0.5).setDepth(301).setAlpha(0).setResolution(2);
        const epitaph = this.run.add.text(LOGICAL_WIDTH / 2, LOGICAL_HEIGHT / 2 + 42, `"${EPITAPHS[Math.floor(Math.random() * EPITAPHS.length)]}"`, {
          fontFamily: 'Barlow Condensed, sans-serif', fontSize: '10px', fontStyle: 'italic', color: '#b7c4bc', align: 'center', wordWrap: { width: 300 },
        }).setOrigin(0.5).setDepth(301).setAlpha(0).setResolution(2);
        this.run.tweens.add({ targets: epitaph, alpha: 1, duration: 700, delay: 500 });
        sequence.objects.push(title, detail, hint, epitaph);
        this.run.tweens.add({ targets: [title, detail], alpha: 1, duration: 700, ease: 'Sine.Out' });
        this.run.tweens.add({ targets: hint, alpha: 1, duration: 500, delay: 900 });
        sequence.phase = 'message';
        this.run.time.delayedCall(3600, () => this.leaveAfterDeath(sequence));
      },
    });
  }

  leaveAfterDeath(sequence: NonNullable<DungeonRunScene['deathSequence']>): void {
    if (sequence.phase !== 'message' || this.run.deathSequence !== sequence) return;
    sequence.phase = 'leaving';
    const text = sequence.objects.filter((object): object is Phaser.GameObjects.Text => object instanceof Phaser.GameObjects.Text);
    this.run.tweens.add({ targets: text, alpha: 0, duration: 650, ease: 'Sine.In', onComplete: () => this.run.returnToHall() });
  }
}
