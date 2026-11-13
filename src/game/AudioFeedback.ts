import type { GameSettings } from './settings';
import type { SfxId } from './audioManifest';
import { audioContext, audioIndex, loadBuffer } from './audioLibrary';

export type CombatSound = SfxId;

interface Beep { start: number; end: number; duration: number; type: OscillatorType; volume: number }

// Procedural stand-ins until real files are dropped into src/assets/audio/sfx/.
const BEEPS = {
  attack: { start: 220, end: 125, duration: 0.07, type: 'triangle', volume: 0.024 },
  ability: { start: 260, end: 520, duration: 0.16, type: 'sine', volume: 0.028 },
  hit: { start: 105, end: 62, duration: 0.055, type: 'square', volume: 0.018 },
  hurt: { start: 84, end: 48, duration: 0.11, type: 'sawtooth', volume: 0.016 },
  bright: { start: 330, end: 660, duration: 0.24, type: 'sine', volume: 0.025 },
  tick: { start: 660, end: 720, duration: 0.045, type: 'square', volume: 0.008 },
  confirm: { start: 440, end: 880, duration: 0.18, type: 'triangle', volume: 0.03 },
  low: { start: 160, end: 90, duration: 0.12, type: 'triangle', volume: 0.02 },
} as const satisfies Record<string, Beep>;

/** Which stand-in each sound uses; `undefined` stays silent until a file exists (to avoid beep spam). */
const FALLBACK: Readonly<Partial<Record<SfxId, keyof typeof BEEPS>>> = {
  'li-attack': 'attack', 'seo-attack': 'attack', 'rei-attack': 'attack',
  'li-ability': 'ability', 'seo-ability': 'ability', 'rei-ability': 'ability',
  hit: 'hit', crit: 'hit', hurt: 'hurt', deflect: 'tick', heal: 'bright', revive: 'bright',
  'room-clear': 'bright', 'chest-open': 'bright', 'pickup-item': 'bright', 'pickup-rare': 'confirm', 'pickup-stone': 'tick',
  'portal-open': 'bright', 'portal-enter': 'bright', 'bell-toll': 'low', 'altar-offer': 'low', purchase: 'confirm', deny: 'low',
  'lore-found': 'confirm', 'hero-unlock': 'confirm', 'stage-up': 'confirm',
  'ui-move': 'tick', 'ui-confirm': 'confirm', 'ui-back': 'tick', 'ui-open': 'tick',
};

/** Shortest gap between two plays of the same sound, so a volley is one sound and not twenty. */
const MIN_GAP_MS: Readonly<Partial<Record<SfxId, number>>> = {
  'enemy-telegraph': 140, 'enemy-shot': 110, hit: 45, crit: 60, 'pickup-stone': 60, 'enemy-death': 70, 'urn-break': 60, 'ui-move': 40,
};

/** Sound effects. Plays the file for a sound when one exists, otherwise a procedural beep. */
export class AudioFeedback {
  private readonly lastPlayed = new Map<SfxId, number>();

  constructor(private settings: GameSettings) {}

  updateSettings(settings: GameSettings): void { this.settings = settings; }

  play(sound: SfxId, volume = 1): void {
    const level = this.settings.masterVolume * this.settings.effectsVolume * volume;
    if (level <= 0) return;
    const now = performance.now();
    const gap = MIN_GAP_MS[sound];
    if (gap && now - (this.lastPlayed.get(sound) ?? -Infinity) < gap) return;
    this.lastPlayed.set(sound, now);
    const entry = audioIndex().sfx.get(sound);
    if (entry) {
      const url = entry.takes[Math.floor(Math.random() * entry.takes.length)];
      void loadBuffer(url).then((buffer) => {
        const context = audioContext();
        if (!buffer || !context) return;
        const source = context.createBufferSource();
        const gain = context.createGain();
        source.buffer = buffer;
        // Small pitch variation keeps repeated sounds from feeling mechanical.
        source.playbackRate.value = 0.96 + Math.random() * 0.08;
        gain.gain.value = level;
        source.connect(gain).connect(context.destination);
        source.start();
      });
      return;
    }
    const fallback = FALLBACK[sound];
    if (fallback) this.beep(BEEPS[fallback], level);
  }

  private beep(definition: Beep, level: number): void {
    const context = audioContext();
    if (!context) return;
    const now = context.currentTime;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = definition.type;
    oscillator.frequency.setValueAtTime(definition.start, now);
    oscillator.frequency.exponentialRampToValueAtTime(definition.end, now + definition.duration);
    gain.gain.setValueAtTime(definition.volume * level, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + definition.duration);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + definition.duration);
  }

  /** The page shares one audio context, so there is nothing to close. */
  destroy(): void {
    this.lastPlayed.clear();
  }
}
