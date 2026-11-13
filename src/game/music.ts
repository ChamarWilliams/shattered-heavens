import { MUSIC, MUSIC_FALLBACKS, type MusicId } from './audioManifest';
import { audioIndex } from './audioLibrary';
import { DEFAULT_GAME_SETTINGS, type GameSettings } from './settings';

const FADE_MS = 900;

interface Playing {
  readonly id: MusicId;
  readonly url: string;
  readonly element: HTMLAudioElement;
  target: number;
}

/**
 * Background music for the whole page. Tracks stream from files (so long loops
 * do not sit decoded in memory) and crossfade when the scene changes. Stings
 * play once over a ducked track. With no files present it simply stays quiet.
 */
class MusicPlayer {
  private settings: GameSettings = DEFAULT_GAME_SETTINGS;
  private current?: Playing;
  private readonly fading = new Set<Playing>();
  private wanted?: MusicId;
  private duck = 1;
  private timer?: ReturnType<typeof setInterval>;
  private unlockArmed = false;
  private readonly chosen = new Map<MusicId, string>();

  updateSettings(settings: GameSettings): void {
    this.settings = settings;
    this.tick();
  }

  /** Switches to a looping track (or silence), crossfading from whatever was playing. */
  setTrack(id: MusicId | undefined): void {
    if (this.wanted === id) return;
    this.wanted = id;
    const url = id ? this.urlFor(id) : undefined;
    // Two slots sharing one song (e.g. two realms) keep it playing.
    if (url && this.current?.url === url) return;
    if (this.current) { this.current.target = 0; this.fading.add(this.current); }
    this.current = undefined;
    if (id && url) {
      const element = new Audio(url);
      element.loop = MUSIC[id].loop;
      element.volume = 0;
      element.preload = 'auto';
      this.current = { id, url, element, target: 1 };
      this.start(element);
    }
    this.ensureTimer();
  }

  /** Plays a one-off sting, lowering the current track while it sounds. */
  sting(id: MusicId): void {
    const url = this.urlFor(id);
    if (!url) return;
    const element = new Audio(url);
    element.volume = Math.min(1, this.level());
    this.duck = 0.25;
    element.addEventListener('ended', () => { this.duck = 1; this.ensureTimer(); }, { once: true });
    this.start(element);
    this.ensureTimer();
  }

  /** The slot's own track, or the one it borrows (see MUSIC_FALLBACKS). Takes are picked once per slot. */
  private urlFor(id: MusicId): string | undefined {
    const chosen = this.chosen.get(id);
    if (chosen) return chosen;
    let slot: MusicId | undefined = id;
    for (let hops = 0; slot && hops < 4; hops += 1) {
      const takes = audioIndex().music.get(slot)?.takes;
      if (takes?.length) {
        const url = takes[Math.floor(Math.random() * takes.length)];
        this.chosen.set(id, url);
        return url;
      }
      slot = MUSIC_FALLBACKS[slot];
    }
    return undefined;
  }

  private level(): number {
    return this.settings.masterVolume * this.settings.musicVolume;
  }

  /** Browsers block audio until the player interacts; retry on the first key or tap. */
  private start(element: HTMLAudioElement): void {
    void element.play().catch(() => {
      if (this.unlockArmed) return;
      this.unlockArmed = true;
      const unlock = (): void => {
        this.unlockArmed = false;
        window.removeEventListener('pointerdown', unlock);
        window.removeEventListener('keydown', unlock);
        if (this.current) void this.current.element.play().catch(() => undefined);
      };
      window.addEventListener('pointerdown', unlock);
      window.addEventListener('keydown', unlock);
    });
  }

  private ensureTimer(): void {
    this.timer ??= setInterval(() => this.tick(), 50);
  }

  private tick(): void {
    const step = 50 / FADE_MS;
    const level = this.level();
    const approach = (playing: Playing, goal: number): number => {
      const volume = playing.element.volume;
      const next = volume < goal ? Math.min(goal, volume + step * Math.max(level, 0.05)) : Math.max(goal, volume - step * Math.max(level, 0.05));
      playing.element.volume = Math.min(1, Math.max(0, next));
      return playing.element.volume;
    };
    let settled = true;
    if (this.current) {
      const goal = level * this.duck * this.current.target;
      if (Math.abs(approach(this.current, goal) - goal) > 0.001) settled = false;
    }
    for (const playing of [...this.fading]) {
      if (approach(playing, 0) <= 0.001) {
        playing.element.pause();
        playing.element.removeAttribute('src');
        this.fading.delete(playing);
      } else settled = false;
    }
    if (settled && this.timer) { clearInterval(this.timer); this.timer = undefined; }
  }
}

export const music = new MusicPlayer();
