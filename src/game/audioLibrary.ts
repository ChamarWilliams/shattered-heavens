/**
 * Finds the audio files that exist (at build time, so nothing is fetched just
 * to discover it is missing) and picks the right one for this browser.
 */
const FILES = import.meta.glob('../assets/audio/**/*.{ogg,mp3,m4a,wav}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

export interface AudioIndexEntry {
  /** One URL per take (hit, hit-2, hit-3 …), in the best format this browser plays. */
  readonly takes: readonly string[];
}

const FORMAT_TYPES: Readonly<Record<string, string>> = {
  ogg: 'audio/ogg; codecs="vorbis"', m4a: 'audio/mp4; codecs="mp4a.40.2"', mp3: 'audio/mpeg', wav: 'audio/wav',
};

/** Builds the index from a list of file paths. Exported for tests. */
export function buildAudioIndex(
  files: Readonly<Record<string, string>>,
  canPlay: (mime: string) => boolean,
): { sfx: Map<string, AudioIndexEntry>; music: Map<string, AudioIndexEntry> } {
  const groups = { sfx: new Map<string, Map<string, Map<string, string>>>(), music: new Map<string, Map<string, Map<string, string>>>() };
  for (const [path, url] of Object.entries(files)) {
    const match = /\/(sfx|music)\/([a-z0-9-]+?)(?:-(\d+))?\.(ogg|mp3|m4a|wav)$/.exec(path);
    if (!match) continue;
    const [, folder, id, take = '1', extension] = match;
    const byId = groups[folder as 'sfx' | 'music'];
    const takes = byId.get(id) ?? new Map<string, Map<string, string>>();
    const formats = takes.get(take) ?? new Map<string, string>();
    formats.set(extension, url);
    takes.set(take, formats);
    byId.set(id, takes);
  }
  const preference = ['ogg', 'm4a', 'mp3', 'wav'].filter((extension) => extension === 'wav' || canPlay(FORMAT_TYPES[extension]));
  const resolve = (byId: Map<string, Map<string, Map<string, string>>>): Map<string, AudioIndexEntry> => {
    const index = new Map<string, AudioIndexEntry>();
    for (const [id, takes] of byId) {
      const urls = [...takes.entries()]
        .sort(([a], [b]) => Number(a) - Number(b))
        .map(([, formats]) => preference.map((extension) => formats.get(extension)).find(Boolean))
        .filter((url): url is string => Boolean(url));
      if (urls.length > 0) index.set(id, { takes: urls });
    }
    return index;
  };
  return { sfx: resolve(groups.sfx), music: resolve(groups.music) };
}

const browserCanPlay = (mime: string): boolean => {
  try { return typeof document !== 'undefined' && document.createElement('audio').canPlayType(mime) !== ''; } catch { return false; }
};

let cachedIndex: ReturnType<typeof buildAudioIndex> | undefined;
export const audioIndex = (): ReturnType<typeof buildAudioIndex> => (cachedIndex ??= buildAudioIndex(FILES, browserCanPlay));

let sharedContext: AudioContext | undefined;
/** One AudioContext for the whole page (browsers cap how many may exist). */
export function audioContext(): AudioContext | undefined {
  const Constructor = globalThis.AudioContext;
  if (!Constructor) return undefined;
  sharedContext ??= new Constructor();
  if (sharedContext.state === 'suspended') void sharedContext.resume().catch(() => undefined);
  return sharedContext;
}

const buffers = new Map<string, Promise<AudioBuffer | undefined>>();
/** Decodes a file once; later calls reuse it. Resolves undefined if it cannot be decoded. */
export function loadBuffer(url: string): Promise<AudioBuffer | undefined> {
  let pending = buffers.get(url);
  if (!pending) {
    pending = (async () => {
      const context = audioContext();
      if (!context) return undefined;
      try {
        const response = await fetch(url);
        return await context.decodeAudioData(await response.arrayBuffer());
      } catch { return undefined; }
    })();
    buffers.set(url, pending);
  }
  return pending;
}
