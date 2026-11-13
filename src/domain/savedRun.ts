import type { UnlockableHeroId } from './heroUnlocks';
import type { ItemId } from './runItems';

export const SAVED_RUN_KEY = 'echoes.savedRun';

/** Enough to rebuild a solo run at the start of the room the hero last entered. */
export interface SavedRun {
  readonly version: 1;
  readonly heroId: UnlockableHeroId;
  readonly seed: number;
  readonly resonance: number;
  readonly themeIndex: number;
  readonly roomId: string;
  readonly cleared: readonly string[];
  readonly visited: readonly string[];
  readonly health: number;
  readonly maxHealth: number;
  readonly power: number;
  readonly relics: readonly [ItemId, number][];
  readonly infusion?: ItemId;
  readonly infusionLevel: number;
  readonly phoenixSpent: boolean;
  readonly blessings: readonly UnlockableHeroId[];
  readonly blessingSpeed: number;
  readonly runShards: number;
  /** One-time things used up in special rooms on this floor (wares bought, altar offered, bell rung, vault opened). */
  readonly used?: readonly string[];
}

interface SavedRunStorage { getItem(key: string): string | null }
const browserStorage = (): SavedRunStorage | undefined => { try { return globalThis.localStorage; } catch { return undefined; } };
const HEROES: readonly string[] = ['li-yunfeng', 'seo-jiwon', 'tsukishiro-rei'];

/** The saved run, or undefined when there is none or it does not look like one. */
export function readSavedRun(storage = browserStorage()): SavedRun | undefined {
  try {
    const raw = storage?.getItem(SAVED_RUN_KEY);
    if (!raw) return undefined;
    const run = JSON.parse(raw) as Partial<SavedRun>;
    const valid = run.version === 1 && HEROES.includes(String(run.heroId)) && Number.isFinite(run.seed) && typeof run.roomId === 'string'
      && Array.isArray(run.cleared) && Array.isArray(run.visited) && Array.isArray(run.relics)
      && Number.isFinite(run.health) && Number.isFinite(run.maxHealth) && Number.isFinite(run.themeIndex) && Number.isFinite(run.resonance);
    return valid ? (run as SavedRun) : undefined;
  } catch { return undefined; }
}
