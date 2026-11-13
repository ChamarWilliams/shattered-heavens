export interface GameSettings {
  readonly masterVolume: number;
  readonly effectsVolume: number;
  readonly musicVolume: number;
  readonly reduceMotion: boolean;
  readonly damageNumbers: boolean;
  /** Camera shake and hit kicks: 0 off, 0.5 low, 1 full. */
  readonly screenShake: number;
  /** Multiplies interface and in-game text: 1, 1.15 or 1.3. */
  readonly textScale: number;
  /**
   * Colour-blind-safe warnings: every telegraph, trap warning and burning
   * patch is drawn in black and white with a hatch pattern and a thicker
   * outline, so danger never depends on telling colours apart.
   */
  readonly accessibleWarnings: boolean;
  /** Show tutorial hints (the first-room practice and one-time tips). */
  readonly tutorialHints: boolean;
}

export const DEFAULT_GAME_SETTINGS: GameSettings = {
  masterVolume: 0.7,
  effectsVolume: 0.8,
  musicVolume: 0.6,
  reduceMotion: false,
  damageNumbers: true,
  screenShake: 1,
  textScale: 1,
  accessibleWarnings: false,
  tutorialHints: true,
};

export const SCREEN_SHAKE_LEVELS: readonly number[] = [0, 0.5, 1];
export const TEXT_SCALES: readonly number[] = [1, 1.15, 1.3];

/** Reads settings saved by an older version too: anything missing or out of range falls back to the default. */
export function normalizeSettings(raw: Partial<GameSettings> | undefined): GameSettings {
  const pick = (value: unknown, allowed: readonly number[], fallback: number): number =>
    typeof value === 'number' && allowed.includes(value) ? value : fallback;
  const unit = (value: unknown, fallback: number): number => typeof value === 'number' && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : fallback;
  return {
    masterVolume: unit(raw?.masterVolume, DEFAULT_GAME_SETTINGS.masterVolume),
    effectsVolume: unit(raw?.effectsVolume, DEFAULT_GAME_SETTINGS.effectsVolume),
    musicVolume: unit(raw?.musicVolume, DEFAULT_GAME_SETTINGS.musicVolume),
    reduceMotion: Boolean(raw?.reduceMotion),
    damageNumbers: raw?.damageNumbers !== false,
    screenShake: pick(raw?.screenShake, SCREEN_SHAKE_LEVELS, DEFAULT_GAME_SETTINGS.screenShake),
    textScale: pick(raw?.textScale, TEXT_SCALES, DEFAULT_GAME_SETTINGS.textScale),
    accessibleWarnings: Boolean(raw?.accessibleWarnings),
    tutorialHints: raw?.tutorialHints !== false,
  };
}
