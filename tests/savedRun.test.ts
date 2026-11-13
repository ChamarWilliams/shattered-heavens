import { describe, expect, it } from 'vitest';
import { SAVED_RUN_KEY, readSavedRun } from '../src/domain/savedRun';

const storageWith = (value: unknown) => ({ getItem: (key: string) => (key === SAVED_RUN_KEY && value !== undefined ? (typeof value === 'string' ? value : JSON.stringify(value)) : null) });
const valid = {
  version: 1, heroId: 'seo-jiwon', seed: 77, resonance: 1, themeIndex: 2, roomId: 'room-4', cleared: ['room-0'], visited: ['room-0', 'room-4'],
  health: 5, maxHealth: 7, power: 1.25, relics: [['crane-feather', 2]], infusionLevel: 1, phoenixSpent: false, blessings: [], blessingSpeed: 1, runShards: 3,
};

describe('saved run', () => {
  it('reads a well-formed run', () => {
    expect(readSavedRun(storageWith(valid))?.roomId).toBe('room-4');
  });

  it('ignores missing, malformed or incompatible saves', () => {
    expect(readSavedRun(storageWith(undefined))).toBeUndefined();
    expect(readSavedRun(storageWith('{broken'))).toBeUndefined();
    expect(readSavedRun(storageWith({ ...valid, version: 2 }))).toBeUndefined();
    expect(readSavedRun(storageWith({ ...valid, heroId: 'villain' }))).toBeUndefined();
    expect(readSavedRun(storageWith({ ...valid, relics: 'no' }))).toBeUndefined();
  });
});
