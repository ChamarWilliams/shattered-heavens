export type UnlockableHeroId = 'li-yunfeng' | 'seo-jiwon' | 'tsukishiro-rei';
export type UnlockThemeId = 'sectless-temple' | 'nightfold-crypt' | 'foxfire-shrine';

/** Li starts unlocked; the others join after their home realm's warden falls. */
export const HERO_UNLOCK_REALM: Readonly<Record<UnlockableHeroId, UnlockThemeId | undefined>> = {
  'li-yunfeng': undefined,
  'seo-jiwon': 'nightfold-crypt',
  'tsukishiro-rei': 'foxfire-shrine',
};

export const HERO_UNLOCK_HINT: Readonly<Record<UnlockableHeroId, string>> = {
  'li-yunfeng': '',
  'seo-jiwon': 'Defeat the Eclipse Regent in the Nightfold Shadow Crypt to unlock Seo Jiwon.',
  'tsukishiro-rei': 'Defeat the Nine-Tailed Calamity in the Moonlit Foxfire Shrine to unlock Tsukishiro Rei.',
};

/** What a locked hero says in the Pavilion when you talk to them. */
export const HERO_UNLOCK_SPEECH: Readonly<Record<UnlockableHeroId, string>> = {
  'li-yunfeng': '',
  'seo-jiwon': 'Cut down the Eclipse Regent in the Nightfold Crypt. Then my blade is yours.',
  'tsukishiro-rei': 'Quell the Nine-Tailed Calamity at the Foxfire Shrine, and the moonfox will follow you.',
};

const STORAGE_KEY = 'echoes.unlockedHeroes';
const DEFAULT_UNLOCKED: readonly UnlockableHeroId[] = ['li-yunfeng'];

interface UnlockStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const browserStorage = (): UnlockStorage | undefined => {
  try { return globalThis.localStorage; } catch { return undefined; }
};

const isHeroId = (value: unknown): value is UnlockableHeroId =>
  value === 'li-yunfeng' || value === 'seo-jiwon' || value === 'tsukishiro-rei';

export function loadUnlockedHeroes(storage = browserStorage()): Set<UnlockableHeroId> {
  const unlocked = new Set<UnlockableHeroId>(DEFAULT_UNLOCKED);
  try {
    const stored: unknown = JSON.parse(storage?.getItem(STORAGE_KEY) ?? '[]');
    if (Array.isArray(stored)) for (const id of stored) if (isHeroId(id)) unlocked.add(id);
  } catch { /* Malformed saves fall back to the starting hero. */ }
  return unlocked;
}

export function isHeroUnlocked(id: UnlockableHeroId, storage = browserStorage()): boolean {
  return loadUnlockedHeroes(storage).has(id);
}

/**
 * Records a warden defeat. Returns the hero it unlocked, or undefined when the
 * realm unlocks nobody or its hero was already unlocked.
 */
export function unlockHeroForRealm(themeId: string, storage = browserStorage()): UnlockableHeroId | undefined {
  const hero = (Object.keys(HERO_UNLOCK_REALM) as UnlockableHeroId[]).find((id) => HERO_UNLOCK_REALM[id] === themeId);
  if (!hero) return undefined;
  const unlocked = loadUnlockedHeroes(storage);
  if (unlocked.has(hero)) return undefined;
  unlocked.add(hero);
  try { storage?.setItem(STORAGE_KEY, JSON.stringify([...unlocked])); } catch { /* Storage is optional. */ }
  return hero;
}
