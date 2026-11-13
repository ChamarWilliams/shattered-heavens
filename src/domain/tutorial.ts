/**
 * The tutorial. The first expedition opens with a short practice in the start
 * room (move, strike the training dummy, use your technique, step out of a
 * warning ring); everything else is a one-time tip shown the first time it
 * matters. Text uses {tokens} that the UI swaps for keyboard keys or touch
 * buttons, so one line serves both.
 */

export type ControlToken = 'move' | 'attack' | 'ability' | 'interact' | 'talk' | 'pause' | 'leave';

export const CONTROL_LABELS: Readonly<Record<'desktop' | 'touch', Readonly<Record<ControlToken, string>>>> = {
  desktop: { move: 'WASD', attack: 'Space', ability: 'E', interact: 'F', talk: 'E', pause: 'P', leave: 'Esc twice' },
  touch: { move: 'the arrow pad', attack: 'ATTACK', ability: 'ABILITY', interact: 'USE', talk: 'TALK', pause: 'the pause button', leave: 'the back button' },
};

export interface TutorialHint {
  readonly id: string;
  readonly title: string;
  readonly text: string;
  /** Practice steps close themselves when done; tips wait for "Got it". */
  readonly kind: 'step' | 'tip';
}

const step = (id: string, title: string, text: string): TutorialHint => ({ id, title, text, kind: 'step' });
const tip = (id: string, title: string, text: string): TutorialHint => ({ id, title, text, kind: 'tip' });

/** The practice in the first room, in order. */
export const PRACTICE_STEPS: readonly TutorialHint[] = [
  step('practice-move', 'Find your footing', 'Move with {move}.'),
  step('practice-attack', 'Strike', 'Attack the training dummy with {attack}. Aim with the mouse or the way you face.'),
  step('practice-ability', 'Your technique', 'Use your signature technique with {ability}. It recharges over a few seconds.'),
  step('practice-dodge', 'Read the warning', 'A ring marks where a blow will land. Step out of it before it closes.'),
  step('practice-leave', 'The way is open', 'Walk through a door to enter the next room. The map at the top right shows the floor.'),
];

export const TIPS: readonly TutorialHint[] = [
  tip('pavilion-move', "Wayfarers' Pavilion", 'Walk with {move}. Press {talk} beside a wanderer to talk; a wanderer you have unlocked will join you as your hero.'),
  tip('pavilion-gate', 'The echo gate', 'When you are ready, walk into the glowing gate at the top of the Pavilion to begin an expedition.'),
  tip('pavilion-shops', 'Spend your Spirit Stones', 'The Spirit Forge, Alchemy Table and Treasure Cabinet trade Spirit Stones for lasting upgrades. Walk up and press {talk}.'),
  tip('pavilion-shrine', 'Ascension Shrine', 'You have Dao Insight to spend. Visit the Ascension Shrine to unlock techniques and heart methods for your wanderer.'),
  tip('seal', 'Sealed in', 'The doors stay shut until every echo in the room falls. A cleared room restores a heart.'),
  tip('traps', 'Traps', 'Spikes, fire vents and cracked floors flash before they strike. Watch their rhythm and cross between bursts.'),
  tip('chest', 'Treasure', 'Walk into a chest to open it, then walk over what spills out to take it.'),
  tip('relic', 'Relics', 'Relics last for the whole expedition and stack. Your current relics are listed on the stat card.'),
  tip('elite', 'Elite echoes', 'A glyph and a gold-edged bar mark an elite. Ring: a barrier. Chevrons: faster. Split: divides when it falls. Flame: leaves fire behind.'),
  tip('cover', 'Cover', 'Pillars block shots from both sides. Urns break when struck and sometimes hide Spirit Stones.'),
  tip('merchant', 'Wandering Peddler', 'Stand by a ware and press {interact} to buy it with Spirit Stones found on this expedition.'),
  tip('altar', 'Heart-Blood Altar', 'Press {interact} to give up one max heart for a relic. It refuses wanderers with fewer than three.'),
  tip('trial', 'Bell of Trials', 'Press {interact} to ring the bell: three waves of echoes, then a gilded chest. The doors seal until you finish.'),
  tip('vault', 'Hidden vault', 'A chest waits here, guarded by extra traps.'),
  tip('protector', 'Dharma Protector', 'A guardian bars the way. It warns before every attack: a ring, a fan of shots, and a charge along a marked line.'),
  tip('warden', 'Realm warden', 'Each realm ends with a warden. At half health it takes a second form with a new signature move.'),
  tip('portal', 'The echo', 'Walk into the echo to travel to the next realm. Your hearts are restored and your power grows.'),
  tip('low-health', 'Low on hearts', 'Clearing a room restores a heart, and Spirit Peaches restore two. Leaving the run costs everything found on it.'),
];

export const ALL_HINTS: readonly TutorialHint[] = [...PRACTICE_STEPS, ...TIPS];
export const HINTS_BY_ID: ReadonlyMap<string, TutorialHint> = new Map(ALL_HINTS.map((hint) => [hint.id, hint]));
/** Recorded when the practice is finished or skipped. */
export const PRACTICE_DONE = 'practice';

/** Splits hint text into plain text and control chips for the given input mode. */
export function renderHint(text: string, mode: 'desktop' | 'touch'): readonly ({ text: string } | { key: string })[] {
  const parts: ({ text: string } | { key: string })[] = [];
  let last = 0;
  for (const match of text.matchAll(/\{(\w+)\}/g)) {
    if (match.index > last) parts.push({ text: text.slice(last, match.index) });
    const token = match[1] as ControlToken;
    parts.push(token in CONTROL_LABELS[mode] ? { key: CONTROL_LABELS[mode][token] } : { text: match[0] });
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}

/** Keeps only ids the tutorial knows, once each (for loading saves). */
export function sanitizeTutorial(saved: unknown): string[] {
  if (!Array.isArray(saved)) return [];
  return saved.filter((id, index, all): id is string => typeof id === 'string' && (id === PRACTICE_DONE || HINTS_BY_ID.has(id)) && all.indexOf(id) === index);
}

/** Whether a hint should show now: hints on, not seen, and known. */
export const shouldShow = (id: string, seen: readonly string[], enabled: boolean): boolean => enabled && HINTS_BY_ID.has(id) && !seen.includes(id);
