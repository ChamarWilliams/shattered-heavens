import type { DungeonRunScene } from '../DungeonRunScene';
import { SeededRandom } from '../../domain/SeededRandom';
import { loadMeta, saveMeta } from '../../domain/metaProgress';
import { TRIAL_WAVE_GAP_MS, altarReward, canAfford, canOfferHeart, merchantStock, trialWaves } from '../../domain/specialRooms';
import { type RoomFeature } from '../../dungeon/roomFeatures';
import { type GeneratedRoom } from '../../dungeon';
import { music } from '../music';
import { type FeatureTarget } from '../RoomFeatureSystem';
import { HERO_ARTS, REALM_MUSIC } from './runShared';

/**
 * Special rooms: the Wandering Peddler, the Heart-Blood Altar, the Bell of Trials and hidden vaults.
 * Split out of DungeonRunScene; it works on the run's state through `run`.
 */
export class FeatureRooms {
  constructor(private readonly run: DungeonRunScene) {}

  /** Props for special rooms. Peaceful ones count as sealed the moment you walk in. */
  setUpFeatureRoom(room: GeneratedRoom, feature: RoomFeature | undefined): void {
    if (!feature || feature === 'protector') return;
    const scale = this.run.roomScale;
    const used = (key: string): boolean => this.run.usedFeatures.has(`${room.id}:${key}`);
    this.run.clearedRooms.add(room.id);
    if (feature === 'merchant') {
      const stock = this.merchantWares(room);
      this.run.features.spawnMerchant(this.run.roomPoint(0, -0.3), stock, stock.map((_, index) => used(`ware:${index}`)), scale);
      this.run.lore.learn('feature:merchant');
    } else if (feature === 'altar') {
      this.run.features.spawnAltar(this.run.roomPoint(0, -0.18), used('altar'), scale);
      this.run.lore.learn('feature:altar');
    } else if (feature === 'trial') {
      this.run.features.spawnBell(this.run.roomPoint(0, -0.18), used('trial'), scale);
      this.run.lore.learn('feature:trial');
    } else if (feature === 'vault' && !used('vault')) {
      this.run.loot.spawnChest('room', this.run.roomBounds.centerX, this.run.roomBounds.centerY + 10, this.run.rollChestItems('room', 0.6), () => this.run.usedFeatures.add(`${room.id}:vault`));
    }
  }

  /** The Peddler's stock is fixed per room, so leaving and coming back shows the same wares. */
  merchantWares(room: GeneratedRoom): ReturnType<typeof merchantStock> {
    let hash = this.run.seed ^ 0x9edd1e;
    for (const character of room.id) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619) >>> 0;
    return merchantStock(new SeededRandom(hash), this.run.lockedItems);
  }

  interactWithFeature(target: FeatureTarget): void {
    const room = this.run.currentRoom;
    const say = (text: string, color = '#ffe39b'): void => this.run.spawnFloatingText(target.x, target.y - 40, text, color, 1600);
    if (target.kind === 'ware') {
      const ware = this.merchantWares(room)[target.index];
      if (!ware || this.run.usedFeatures.has(`${room.id}:ware:${target.index}`)) return;
      if (!canAfford(this.run.runShards, ware)) { this.run.audioFeedback?.play('deny'); say(`NEED ◆ ${ware.price}\nyou have ◆ ${this.run.runShards} from this expedition`, '#ff9aa5'); return; }
      this.run.runShards -= ware.price;
      const meta = loadMeta();
      meta.shards = Math.max(0, meta.shards - ware.price);
      saveMeta(meta);
      this.run.game.events.emit('echo-shards-changed');
      this.run.usedFeatures.add(`${room.id}:ware:${target.index}`);
      this.run.features.sellWare(target.index);
      this.run.audioFeedback?.play('purchase');
      this.run.collectItem(ware.item, target.x, target.y);
    } else if (target.kind === 'altar') {
      if (!canOfferHeart(this.run.maxHealth)) { this.run.audioFeedback?.play('deny'); say('THE ALTAR REFUSES\nyour vessel is too frail', '#ff9aa5'); return; }
      this.run.maxHealth -= 1;
      if (this.run.coopSnapshot) this.run.coopRun.reportMaxHealth(-1);
      this.run.health = Math.min(this.run.health, this.run.maxHealth);
      this.run.usedFeatures.add(`${room.id}:altar`);
      this.run.features.spendAltar();
      this.run.audioFeedback?.play('altar-offer');
      const reward = altarReward(this.run.random, this.run.lockedItems, HERO_ARTS[this.run.heroId], this.run.loadout.stacks(HERO_ARTS[this.run.heroId]) > 0);
      this.run.cameras.main.flash(220, 200, 40, 60);
      say('−1 MAX HEART', '#ff6a7a');
      this.run.loot.drop(reward, target.x, target.y + 30);
    } else if (this.run.coopSnapshot) {
      // The Bell is shared in co-op: the server rings it and runs the waves for everyone.
      this.run.coopRun.ringBell();
      return;
    } else {
      this.run.usedFeatures.add(`${room.id}:trial`);
      this.run.features.ringBell();
      this.run.trial = { roomId: room.id, waves: trialWaves(this.run.themeIndex, this.run.resonance), wave: 0, gapMs: 700 };
      this.run.elitesThisRoom = 0;
      this.run.showBanner('THE BELL TOLLS\nENDURE THREE WAVES');
      this.run.audioFeedback?.play('bell-toll');
      music.setTrack('trial');
    }
    this.run.saveRunSnapshot();
  }

  /** Runs the Bell of Trials: waves arrive one after another, then a gilded chest. */
  updateTrial(delta: number): void {
    const trial = this.run.trial;
    if (!trial || this.run.runEnded || this.run.enemies.length > 0) return;
    trial.gapMs -= delta;
    if (trial.gapMs > 0) return;
    if (trial.wave < trial.waves.length) {
      trial.wave += 1;
      trial.gapMs = TRIAL_WAVE_GAP_MS;
      this.run.enemyAI.spawnWave(trial.waves[trial.wave - 1], trial.wave === trial.waves.length, 700);
      return;
    }
    this.run.trial = undefined;
    this.run.features.silenceBell();
    this.run.loot.spawnChest('warden', this.run.roomBounds.centerX, this.run.roomBounds.centerY + 10, [...this.run.rollChestItems('room', 1), 'echo-shard', 'echo-shard']);
    this.run.showBanner('TRIAL ENDURED');
    this.run.audioFeedback?.play('room-clear');
    music.setTrack(REALM_MUSIC[this.run.dungeon.themeId]);
    this.run.saveRunSnapshot();
  }
}
