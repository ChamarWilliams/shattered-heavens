import { describe, expect, it } from 'vitest';
import { DEFAULT_GAME_SETTINGS, normalizeSettings } from '../src/game/settings';

describe('settings', () => {
  it('fills in the accessibility options for settings saved before they existed', () => {
    expect(normalizeSettings({ masterVolume: 0.4, reduceMotion: true })).toEqual({ ...DEFAULT_GAME_SETTINGS, masterVolume: 0.4, reduceMotion: true });
  });

  it('only accepts the offered shake and text-size steps', () => {
    expect(normalizeSettings({ screenShake: 0.5, textScale: 1.3 }).screenShake).toBe(0.5);
    expect(normalizeSettings({ screenShake: 7, textScale: 9 })).toMatchObject({ screenShake: 1, textScale: 1 });
    expect(normalizeSettings({ screenShake: 0 }).screenShake).toBe(0);
  });

  it('keeps volumes within range', () => {
    expect(normalizeSettings({ masterVolume: 3, effectsVolume: -1 })).toMatchObject({ masterVolume: 1, effectsVolume: 0 });
  });
});
