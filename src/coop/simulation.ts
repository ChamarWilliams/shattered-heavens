/**
 * The authoritative co-op room. The server runs this on every sync; players'
 * browsers render what it says. It walks the same generated floor as a solo run
 * (same seed, same rooms, same special rooms), and owns everything the party
 * shares: positions, enemies (elites, Dharma Protectors, wardens' second form),
 * traps, cover and urns, the Bell of Trials, and moving between rooms.
 * Loot, the Peddler and the Altar are personal: each browser handles them and
 * reports the resulting heals, max hearts, power and speed in its input.
 */
import { SeededRandom } from '../domain/SeededRandom';
import {
  ELITE_HEALTH, SCORCH, SUNDER_COUNT, SUNDER_HEALTH, SWIFT_RECOVERY, SWIFT_SPEED, WARD_SHARE,
  eliteChance, maxElitesPerRoom, rollEliteAffix, type EliteAffix,
} from '../domain/elites';
import { TRIAL_WAVE_GAP_MS, protectorHealth, trialWaves } from '../domain/specialRooms';
import { DIRECTION_OFFSET, DOOR_BITS, generateDungeon, shuffledDungeonThemes, type DungeonThemeId, type GeneratedDungeon, type GeneratedRoom } from '../dungeon';
import { assignRoomFeatures, coverFootprint, coverLayout, roomLayoutSeed, type CoverPiece, type RoomFeature } from '../dungeon/roomFeatures';
import { PIT, cycleLength, trapLayout, trapPhase, trapRadius, type TrapPlacement } from '../dungeon/traps';
import {
  COOP_MAX_PLAYERS,
  COOP_SCHEMA_VERSION,
  type CoopAttackKind,
  type CoopEnemyRole,
  type CoopEnemySnapshot,
  type CoopFacing,
  type CoopHeroId,
  type CoopInput,
  type CoopPhase,
  type CoopPlayerSnapshot,
  type CoopRoomSnapshot,
  type CoopSide,
  type CoopZone,
} from './protocol';

// ---- Geometry: co-op rooms use the 1x room (19 x 13 tiles of 32 px) centred on (480, 270). ----
export const COOP_ROOM = { left: 176, top: 62, right: 784, bottom: 478, centerX: 480, centerY: 270, tile: 32, columns: 19, rows: 13 } as const;
/** Where a hero's origin may stand: the floor inside the wall band (feet collide at y + 18). */
export const COOP_FLOOR = { left: 285, right: 675, top: 145, bottom: 357 } as const;
const ENEMY_FLOOR = { left: 285, right: 675, top: 147, bottom: 359 } as const;
const GRID = { originX: COOP_ROOM.left, originY: COOP_ROOM.top, tile: COOP_ROOM.tile, columns: COOP_ROOM.columns, rows: COOP_ROOM.rows } as const;
const DOOR_HALF = 40;
const PORTAL = { x: 480, y: 285, radius: 42 } as const;
const BELL = { x: 480, y: 270 - 0.18 * 208, reach: 40 } as const;
/** Where the party appears when entering through each side (matches the solo room at 1x). */
export const ENTRY_POINTS: Readonly<Record<CoopSide, Readonly<{ x: number; y: number }>>> = {
  N: { x: 480, y: COOP_ROOM.top + 145 }, E: { x: COOP_ROOM.right - 140, y: 270 }, S: { x: 480, y: COOP_ROOM.bottom - 150 }, W: { x: COOP_ROOM.left + 140, y: 270 },
};
const OPPOSITE: Readonly<Record<CoopSide, CoopSide>> = { N: 'S', E: 'W', S: 'N', W: 'E' };

// ---- Tuning ----
const HERO_SPEED: Readonly<Record<CoopHeroId, number>> = { 'li-yunfeng': 151, 'seo-jiwon': 162, 'tsukishiro-rei': 144 };
const HERO_HEALTH: Readonly<Record<CoopHeroId, number>> = { 'li-yunfeng': 7, 'seo-jiwon': 6, 'tsukishiro-rei': 8 };
export const REVIVE_DISTANCE = 68;
export const REVIVE_DURATION_MS = 2200;
const DISCONNECT_AFTER_MS = 12_000;
const HIT_GRACE_MS = 700;
// Enemy strikes mark where the target stands and resolve after the windup. Windups cover
// reaction time plus the polling delay before the server sees a dodge.
const STRIKES: Readonly<Record<CoopEnemyRole, Readonly<{ windupMs: number; radius: number; cooldownMs: number; preferred: number; speed: number }>>> = {
  hunter: { windupMs: 620, radius: 30, cooldownMs: 1350, preferred: 48, speed: 58 },
  shooter: { windupMs: 560, radius: 36, cooldownMs: 1750, preferred: 110, speed: 30 },
  sentinel: { windupMs: 520, radius: 36, cooldownMs: 2050, preferred: 145, speed: 22 },
  protector: { windupMs: 560, radius: 40, cooldownMs: 1700, preferred: 130, speed: 32 },
  boss: { windupMs: 560, radius: 44, cooldownMs: 1500, preferred: 175, speed: 25 },
};
const CHARGE = { windupMs: 820, zones: 4, spacing: 50, radius: 34 } as const;
const RAIN = { windupMs: 780, spread: 86, radius: 30 } as const;
/** A player gone this long mid-run leaves the party, so nobody is left waiting on them. */
const DROP_AFTER_MS = 90_000;
/** Sanity limits on what a screen may report per hit and per sync. */
const MAX_HIT_DAMAGE = 600;
const MAX_HITS_PER_SYNC = 64;
const MAX_HURT_PER_SYNC = 3;
const RECOVERY_MS = 300;

type Mutable<T> = { -readonly [Property in keyof T]: T[Property] };

export type AuthoritativePlayer = Mutable<CoopPlayerSnapshot> & {
  token: string;
  input: CoopInput;
  lastSeenAt: number;
  lastAttackSerial: number;
  lastAbilitySerial: number;
  attackCooldownMs: number;
  abilityCooldownMs: number;
  invulnerableMs: number;
  lastUseSerial: number;
  /** A Use press arrived since the last tick. */
  usePending: boolean;
  lastStartSerial: number;
  /** A press at the Realm Gate arrived since the last tick (only the leader's counts). */
  startPending: boolean;
  /** Totals from the player's input already applied (so repeated syncs never double up). */
  healApplied: number;
  maxHealthApplied: number;
  hurtApplied: number;
};

export type AuthoritativeEnemy = Mutable<Omit<CoopEnemySnapshot, 'attack'>> & {
  attack?: { seq: number; kind: CoopAttackKind; angle: number };
  zones?: CoopZone[];
  attackCooldownMs: number;
  phaseRemainingMs: number;
  shieldMs: number;
  strikes: number;
  summoned?: boolean;
  scorchMs?: number;
  chargeTo?: { x: number; y: number };
};

interface PitRecord { state: 0 | 1 | 2; ms: number }
interface BurnRecord { x: number; y: number; armMs: number; lifeMs: number; hit: string[] }

export interface CoopRoomRecord {
  schemaVersion: typeof COOP_SCHEMA_VERSION;
  roomCode: string;
  revision: number;
  updatedAt: number;
  seed: number;
  themeOrder: readonly DungeonThemeId[];
  themeIndex: number;
  phase: CoopPhase;
  hostId: string;
  expedition: number;
  roomId: string;
  entrySide: CoopSide;
  cleared: string[];
  visited: string[];
  roomCleared: boolean;
  roomClockMs: number;
  pits: (PitRecord | null)[];
  /** `${trapIndex}:${playerId}` → the cycle in which that trap last hurt that player. */
  trapHits: Record<string, number>;
  brokenUrns: number[];
  burns: BurnRecord[];
  trial?: { roomId: string; state: 'running' | 'done'; wave: number; waves: number[]; gapMs: number };
  trialsDone: string[];
  portalOpen: boolean;
  /** Players who have stood outside the echo since it opened (so arriving on top of it never pulls anyone through). */
  portalArmed: string[];
  completed: boolean;
  failed: boolean;
  objective: string;
  players: AuthoritativePlayer[];
  enemies: AuthoritativeEnemy[];
  nextEnemyId: number;
}

export interface NewPlayer {
  readonly id: string;
  readonly token: string;
  readonly name: string;
  readonly heroId: CoopHeroId;
}

const clamp = (value: number, minimum: number, maximum: number): number => Math.min(maximum, Math.max(minimum, value));
const finite = (value: unknown, fallback: number): number => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);

// ---- The floor the party walks: identical to the solo run's for the same seed ----
const dungeonCache = new Map<string, GeneratedDungeon>();
export function coopDungeon(seed: number, themeIndex: number, themeId: DungeonThemeId): GeneratedDungeon {
  const key = `${seed}:${themeIndex}:${themeId}`;
  let dungeon = dungeonCache.get(key);
  if (!dungeon) {
    dungeon = generateDungeon({ seed: seed + themeIndex * 7919, themeId, roomCount: 9 + themeIndex * 2, maxRadius: 5 });
    if (dungeonCache.size > 64) dungeonCache.clear();
    dungeonCache.set(key, dungeon);
  }
  return dungeon;
}

const featureCache = new Map<GeneratedDungeon, ReadonlyMap<string, RoomFeature>>();
function featuresOf(dungeon: GeneratedDungeon): ReadonlyMap<string, RoomFeature> {
  let features = featureCache.get(dungeon);
  if (!features) { features = assignRoomFeatures(dungeon); featureCache.set(dungeon, features); }
  return features;
}

export const currentDungeon = (room: CoopRoomRecord): GeneratedDungeon => coopDungeon(room.seed, room.themeIndex, room.themeOrder[room.themeIndex]);
const currentRoom = (room: CoopRoomRecord): GeneratedRoom => {
  const dungeon = currentDungeon(room);
  return dungeon.rooms.find((candidate) => candidate.id === room.roomId) ?? dungeon.rooms[0];
};
export const currentFeature = (room: CoopRoomRecord): RoomFeature | undefined => featuresOf(currentDungeon(room)).get(room.roomId);

export interface CoopRoomLayout {
  readonly traps: readonly TrapPlacement[];
  readonly cover: readonly CoverPiece[];
  readonly coverRects: readonly { left: number; top: number; right: number; bottom: number }[];
}

/** Traps and cover for a room, exactly as a solo run lays them out at 1x scale. The game uses this too. */
export function coopRoomLayout(seed: number, generated: GeneratedRoom, feature: RoomFeature | undefined, entrySide: CoopSide, themeIndex: number): CoopRoomLayout {
  if (generated.kind === 'start' || generated.kind === 'boss') return { traps: [], cover: [], coverRects: [] };
  const hash = roomLayoutSeed(seed, generated.id);
  const cover = coverLayout(new SeededRandom(hash ^ 0xc0de), feature);
  const calm = feature === 'merchant' || feature === 'altar' || feature === 'trial' || feature === 'protector';
  const traps = calm ? [] : trapLayout(new SeededRandom(hash), Math.min(11, 2 + themeIndex + (feature === 'vault' ? 3 : 0)), GRID, 1,
    [ENTRY_POINTS[entrySide], { x: COOP_ROOM.centerX, y: COOP_ROOM.centerY }], new Set(cover.map((piece) => `${piece.column},${piece.row}`)));
  const coverRects = cover.map((piece) => {
    const foot = coverFootprint(piece, GRID);
    return { left: foot.left, top: foot.top, right: foot.left + foot.width, bottom: foot.top + foot.height };
  });
  return { traps, cover, coverRects };
}

export const layoutOf = (room: CoopRoomRecord): CoopRoomLayout => coopRoomLayout(room.seed, currentRoom(room), currentFeature(room), room.entrySide, room.themeIndex);

/** Whether a footprint centred at (x, y) overlaps intact cover. */
function blocked(room: CoopRoomRecord, layout: CoopRoomLayout, x: number, y: number, halfWidth: number, halfHeight: number): boolean {
  return layout.coverRects.some((rect, index) => !room.brokenUrns.includes(index)
    && rect.right > x - halfWidth && rect.left < x + halfWidth && rect.bottom > y - halfHeight && rect.top < y + halfHeight);
}

// ---- Players ----
function createPlayer(player: NewPlayer, now: number): AuthoritativePlayer {
  const maxHealth = HERO_HEALTH[player.heroId];
  return {
    id: player.id, token: player.token, name: player.name, heroId: player.heroId,
    x: ENTRY_POINTS.S.x, y: ENTRY_POINTS.S.y, aimRadians: -Math.PI / 2,
    health: maxHealth, maxHealth, downed: false, reviveProgressMs: 0, damageDealt: 0, action: 'idle', acknowledgedInput: 0, connected: true,
    input: { sequence: 0, moveX: 0, moveY: 0, aimRadians: -Math.PI / 2, attackSerial: 0, abilitySerial: 0, interact: false, revive: false, useSerial: 0, power: 1, speed: 1, healTotal: 0, maxHealthTotal: 0, hurtTotal: 0, startSerial: 0 },
    lastSeenAt: now, lastAttackSerial: 0, lastAbilitySerial: 0, attackCooldownMs: 0, abilityCooldownMs: 0, invulnerableMs: 0, healApplied: 0, maxHealthApplied: 0, lastUseSerial: 0, usePending: false,
    lastStartSerial: 0, startPending: false, hurtApplied: 0, lastHitSeq: 0, loot: { heal: 0, maxHealth: 0, hurt: 0 },
  };
}

/** Lines the party up at the door they came through. */
function placeParty(room: CoopRoomRecord): void {
  const entry = ENTRY_POINTS[room.entrySide];
  const across = room.entrySide === 'N' || room.entrySide === 'S';
  room.players.forEach((player, slot) => {
    const offset = [0, -44, 44][slot] ?? 0;
    player.x = clamp(entry.x + (across ? offset : 0), COOP_FLOOR.left, COOP_FLOOR.right);
    player.y = clamp(entry.y + (across ? 0 : offset), COOP_FLOOR.top, COOP_FLOOR.bottom);
    player.input = { ...player.input, moveX: 0, moveY: 0, interact: false };
    player.usePending = false;
  });
}

/** Difficulty for the party: each wanderer beyond the first adds 40% enemy health. */
export function partyScale(room: Pick<CoopRoomRecord, 'players'>): number {
  return 1 + 0.4 * Math.max(0, room.players.length - 1);
}

export function createCoopRoom(roomCode: string, seed: number, host: NewPlayer, now: number): CoopRoomRecord {
  const room: CoopRoomRecord = {
    schemaVersion: COOP_SCHEMA_VERSION, roomCode, revision: 1, updatedAt: now, seed: seed >>> 0,
    themeOrder: shuffledDungeonThemes(seed >>> 0), themeIndex: 0, phase: 'gathering', hostId: host.id, expedition: 0, roomId: '', entrySide: 'S', cleared: [], visited: [],
    roomCleared: true, roomClockMs: 0, pits: [], trapHits: {}, brokenUrns: [], burns: [], trialsDone: [], portalOpen: false, portalArmed: [],
    completed: false, failed: false, objective: '', players: [createPlayer(host, now)], enemies: [], nextEnemyId: 1,
  };
  startFloor(room, 0);
  return room;
}

export function joinCoopRoom(room: CoopRoomRecord, player: NewPlayer, now: number): AuthoritativePlayer {
  if (room.players.length >= COOP_MAX_PLAYERS) throw new Error('ROOM_FULL');
  const before = partyScale(room);
  const created = createPlayer(player, now);
  room.players.push(created);
  // Enemies already in the room toughen up for the bigger party.
  const ratio = partyScale(room) / before;
  for (const enemy of room.enemies) {
    enemy.maxHealth = Math.round(enemy.maxHealth * ratio);
    enemy.health = Math.round(enemy.health * ratio);
  }
  const entry = ENTRY_POINTS[room.entrySide];
  created.x = entry.x;
  created.y = entry.y;
  room.revision += 1;
  return created;
}

export function authenticatePlayer(room: CoopRoomRecord, playerId: string, token: string): AuthoritativePlayer | undefined {
  return room.players.find((player) => player.id === playerId && player.token === token);
}

export function applyCoopInput(player: AuthoritativePlayer, input: CoopInput, now: number, room?: CoopRoomRecord): void {
  player.lastSeenAt = now;
  player.connected = true;
  if (!Number.isFinite(input.sequence) || input.sequence <= player.acknowledgedInput) return;
  const moveX = finite(input.moveX, 0);
  const moveY = finite(input.moveY, 0);
  const length = Math.hypot(moveX, moveY);
  player.input = {
    sequence: Math.max(0, Math.floor(input.sequence)),
    moveX: length > 1 ? moveX / length : clamp(moveX, -1, 1),
    moveY: length > 1 ? moveY / length : clamp(moveY, -1, 1),
    aimRadians: finite(input.aimRadians, player.aimRadians),
    attackSerial: Math.max(0, Math.floor(finite(input.attackSerial, 0))),
    abilitySerial: Math.max(0, Math.floor(finite(input.abilitySerial, 0))),
    interact: Boolean(input.interact),
    revive: Boolean(input.revive),
    useSerial: Math.max(0, Math.floor(finite(input.useSerial, 0))),
    power: clamp(finite(input.power, 1), 1, 4),
    speed: clamp(finite(input.speed, 1), 0.8, 1.6),
    healTotal: Math.max(0, Math.floor(finite(input.healTotal, 0))),
    maxHealthTotal: Math.floor(finite(input.maxHealthTotal, 0)),
    hurtTotal: Math.max(0, Math.floor(finite(input.hurtTotal, 0))),
    startSerial: Math.max(0, Math.floor(finite(input.startSerial, 0))),
    ...(validHero(input.heroId) ? { heroId: input.heroId } : {}),
  };
  player.acknowledgedInput = player.input.sequence;
  if (player.input.useSerial > player.lastUseSerial) { player.usePending = true; player.lastUseSerial = player.input.useSerial; }
  if (player.input.startSerial > player.lastStartSerial) { player.startPending = true; player.lastStartSerial = player.input.startSerial; }
  const hall = input.hall;
  if (hall && typeof hall === 'object') {
    player.hall = {
      x: Math.round(clamp(finite(hall.x, 480), 0, 960)),
      y: Math.round(clamp(finite(hall.y, 430), 0, 540)),
      facing: FACINGS.includes(hall.facing) ? hall.facing : 'S',
      moving: Boolean(hall.moving),
    };
  }
  // Personal loot and shrines: apply only what is new since the last sync, with sane caps.
  const healDelta = clamp(player.input.healTotal - player.healApplied, 0, 4);
  player.healApplied = Math.max(player.healApplied, player.input.healTotal);
  const maxDelta = clamp(player.input.maxHealthTotal - player.maxHealthApplied, -2, 2);
  player.maxHealthApplied = player.input.maxHealthTotal;
  if (maxDelta !== 0) {
    player.maxHealth = clamp(player.maxHealth + maxDelta, 1, 20);
    player.health = Math.min(player.health, player.maxHealth);
  }
  if (healDelta > 0 && !player.downed) player.health = Math.min(player.maxHealth, player.health + healDelta);
  // Enemy attacks are dodged (or not) on the player's own screen; it reports what landed.
  const hurtDelta = clamp(player.input.hurtTotal - player.hurtApplied, 0, MAX_HURT_PER_SYNC);
  player.hurtApplied = Math.max(player.hurtApplied, player.input.hurtTotal);
  if (hurtDelta > 0 && room?.phase === 'expedition' && !room.completed && !player.downed) {
    player.health = Math.max(0, player.health - hurtDelta);
    if (player.health === 0) { player.downed = true; player.reviveProgressMs = 0; }
  }
  if (room) applyHits(room, player, input.hits);
}

/** Hits the player's screen saw land: applied once each, in order, with sane limits. */
function applyHits(room: CoopRoomRecord, player: AuthoritativePlayer, hits: unknown): void {
  if (!Array.isArray(hits) || room.phase !== 'expedition' || room.completed) return;
  const fresh = hits
    .filter((hit): hit is { seq: number; enemyId: string; damage: number } => Boolean(hit) && typeof hit.enemyId === 'string' && Number.isFinite(hit.seq) && Number.isFinite(hit.damage))
    .filter((hit) => hit.seq > player.lastHitSeq)
    .sort((a, b) => a.seq - b.seq)
    .slice(0, MAX_HITS_PER_SYNC);
  for (const hit of fresh) {
    player.lastHitSeq = Math.floor(hit.seq);
    const enemy = room.enemies.find((candidate) => candidate.id === hit.enemyId && candidate.health > 0);
    if (enemy) player.damageDealt += damageEnemy(room, enemy, Math.round(clamp(hit.damage, 0, MAX_HIT_DAMAGE)));
  }
  room.enemies = room.enemies.filter((enemy) => enemy.health > 0);
}

// ---- Moving between rooms and floors ----
const FACINGS: readonly CoopFacing[] = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const validHero = (id: unknown): id is CoopHeroId => typeof id === 'string' && id in HERO_HEALTH;

/** The leader leads the party through the Realm Gate: a fresh run (a new floor seed after the first). */
export function beginExpedition(room: CoopRoomRecord): void {
  if (room.expedition > 0) room.seed = (Math.imul(room.seed ^ 0x9e3779b9, 1664525) + 1013904223) >>> 0;
  room.themeOrder = shuffledDungeonThemes(room.seed);
  room.phase = 'expedition';
  room.expedition += 1;
  room.completed = false;
  room.failed = false;
  for (const player of room.players) {
    player.maxHealth = HERO_HEALTH[player.heroId];
    player.health = player.maxHealth;
    player.downed = false;
    player.reviveProgressMs = 0;
    player.damageDealt = 0;
    player.action = 'idle';
    player.attackCooldownMs = 0;
    player.abilityCooldownMs = 0;
    player.invulnerableMs = 0;
    // Loot totals keep counting across runs; only what comes after this counts.
    player.healApplied = player.input.healTotal;
    player.maxHealthApplied = player.input.maxHealthTotal;
    player.hurtApplied = player.input.hurtTotal;
  }
  startFloor(room, 0);
}

function startFloor(room: CoopRoomRecord, themeIndex: number): void {
  room.themeIndex = themeIndex;
  room.cleared = [];
  room.visited = [];
  room.trialsDone = [];
  const start = currentDungeon(room).rooms.find((candidate) => candidate.kind === 'start') ?? currentDungeon(room).rooms[0];
  enterRoom(room, start.id, 'S');
}

/** Moves the party into a room of the current floor (also used by tests to set up a situation). */
export function enterRoom(room: CoopRoomRecord, roomId: string, side: CoopSide): void {
  room.roomId = roomId;
  room.entrySide = side;
  if (!room.visited.includes(roomId)) room.visited.push(roomId);
  room.roomClockMs = 0;
  room.trapHits = {};
  room.brokenUrns = [];
  room.burns = [];
  room.portalOpen = false;
  room.portalArmed = [];
  room.enemies = [];
  room.trial = undefined;
  placeParty(room);
  const generated = currentRoom(room);
  const feature = currentFeature(room);
  const layout = layoutOf(room);
  room.pits = layout.traps.map((trap) => (trap.kind === 'pit' ? { state: 0, ms: 0 } : null));
  const peaceful = generated.kind === 'start' || feature === 'merchant' || feature === 'altar' || feature === 'trial' || feature === 'vault';
  if (peaceful && !room.cleared.includes(roomId)) room.cleared.push(roomId);
  if (!room.cleared.includes(roomId)) spawnEncounter(room, generated, feature, layout);
  room.roomCleared = room.cleared.includes(roomId) && room.enemies.length === 0;
  if (generated.kind === 'boss' && room.roomCleared) room.portalOpen = true;
  room.objective = objectiveFor(room);
}

function objectiveFor(room: CoopRoomRecord): string {
  if (room.phase === 'gathering') return 'Gathering in the Pavilion';
  if (room.failed) return 'The party has fallen';
  if (room.completed) return 'Expedition complete';
  if (room.trial?.state === 'running') return `Bell of Trials: wave ${Math.max(1, room.trial.wave)} of ${room.trial.waves.length}`;
  if (!room.roomCleared) {
    if (currentRoom(room).kind === 'boss') return 'Defeat the realm warden';
    if (currentFeature(room) === 'protector') return 'Defeat the Dharma Protector';
    return 'Seal the room';
  }
  if (room.portalOpen) return 'Walk into the echo together';
  return 'Room clear: choose a door';
}

/** A player at the floor's edge, in a door lane, pushing outward, takes the whole party through. */
function doorTaken(room: CoopRoomRecord, player: AuthoritativePlayer): CoopSide | undefined {
  const generated = currentRoom(room);
  const { moveX, moveY } = player.input;
  const lanes: [CoopSide, boolean][] = [
    ['N', player.y <= COOP_FLOOR.top + 1 && Math.abs(player.x - COOP_ROOM.centerX) < DOOR_HALF && moveY < -0.4],
    ['S', player.y >= COOP_FLOOR.bottom - 1 && Math.abs(player.x - COOP_ROOM.centerX) < DOOR_HALF && moveY > 0.4],
    ['E', player.x >= COOP_FLOOR.right - 1 && Math.abs(player.y - COOP_ROOM.centerY) < DOOR_HALF && moveX > 0.4],
    ['W', player.x <= COOP_FLOOR.left + 1 && Math.abs(player.y - COOP_ROOM.centerY) < DOOR_HALF && moveX < -0.4],
  ];
  for (const [side, pushing] of lanes) if (pushing && (generated.doorMask & DOOR_BITS[side]) !== 0) return side;
  return undefined;
}

function goThroughDoor(room: CoopRoomRecord, side: CoopSide): boolean {
  const generated = currentRoom(room);
  const offset = DIRECTION_OFFSET[side];
  const next = currentDungeon(room).rooms.find((candidate) => candidate.x === generated.x + offset.x && candidate.y === generated.y + offset.y);
  if (!next) return false;
  enterRoom(room, next.id, OPPOSITE[side]);
  return true;
}

// ---- Encounters ----
function spawnEncounter(room: CoopRoomRecord, generated: GeneratedRoom, feature: RoomFeature | undefined, layout: CoopRoomLayout): void {
  const random = new SeededRandom((roomLayoutSeed(room.seed, generated.id) ^ 0xe11e) >>> 0);
  const scale = partyScale(room);
  if (generated.kind === 'boss') { room.enemies.push(makeEnemy(room, 'boss', COOP_ROOM.centerX, 240, scale)); return; }
  if (feature === 'protector') { room.enemies.push(makeEnemy(room, 'protector', COOP_ROOM.centerX, 225, scale)); return; }
  const count = Math.min(9, 2 + room.themeIndex + Math.floor(room.visited.length / 4)) + (room.players.length - 1);
  spawnWave(room, random, layout, count, false, 0);
}

function spawnWave(room: CoopRoomRecord, random: SeededRandom, layout: CoopRoomLayout, count: number, forceElite: boolean, graceMs: number): void {
  const scale = partyScale(room);
  const entry = ENTRY_POINTS[room.entrySide];
  const chance = eliteChance(room.themeIndex, 0, room.visited.length);
  const cap = maxElitesPerRoom(room.themeIndex, 0);
  let elites = room.enemies.filter((enemy) => enemy.elite).length;
  const placed: { x: number; y: number }[] = [];
  for (let index = 0; index < count; index += 1) {
    const role: CoopEnemyRole = (['hunter', 'shooter', 'sentinel'] as const)[(index + room.visited.length + room.themeIndex) % 3];
    let spot: { x: number; y: number } = { x: COOP_ROOM.centerX, y: 200 };
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const candidate = { x: random.integer(ENEMY_FLOOR.left, ENEMY_FLOOR.right), y: random.integer(ENEMY_FLOOR.top, ENEMY_FLOOR.bottom - 40) };
      spot = candidate;
      const clear = Math.hypot(candidate.x - entry.x, candidate.y - entry.y) > 150
        && room.players.every((player) => Math.hypot(candidate.x - player.x, candidate.y - player.y) > 130)
        && placed.every((other) => Math.hypot(candidate.x - other.x, candidate.y - other.y) > 50)
        && layout.traps.every((trap) => Math.hypot(candidate.x - trap.x, candidate.y - trap.y) > 40)
        && !blocked(room, layout, candidate.x, candidate.y + 14, 14, 8);
      if (clear) break;
    }
    placed.push(spot);
    const enemy = makeEnemy(room, role, spot.x, spot.y, scale);
    const mustBeElite = forceElite && index === count - 1 && elites < cap + 1;
    const affix = elites < cap || mustBeElite ? rollEliteAffix(random, role as 'hunter' | 'shooter' | 'sentinel', mustBeElite ? 1 : chance) : undefined;
    if (affix) { makeElite(enemy, affix); elites += 1; }
    enemy.attackCooldownMs += graceMs + 400 + index * 260;
    room.enemies.push(enemy);
  }
}

function makeEnemy(room: CoopRoomRecord, role: CoopEnemyRole, x: number, y: number, scale: number): AuthoritativeEnemy {
  const base = role === 'boss' ? 280 + room.themeIndex * 120
    : role === 'protector' ? protectorHealth(room.themeIndex, 1)
      : 36 + room.themeIndex * 12 + (role === 'sentinel' ? 16 : 0);
  const maxHealth = Math.round(base * scale);
  return {
    id: `t${room.themeIndex}-${room.roomId}-e${room.nextEnemyId++}`,
    role, x, y, health: maxHealth, maxHealth, attackPhase: 'idle',
    attackCooldownMs: role === 'boss' || role === 'protector' ? 1200 : 700, phaseRemainingMs: 0, shieldMs: 0, strikes: 0,
  };
}

function makeElite(enemy: AuthoritativeEnemy, affix: EliteAffix): void {
  enemy.elite = affix;
  enemy.maxHealth = Math.round(enemy.maxHealth * ELITE_HEALTH);
  enemy.health = enemy.maxHealth;
  if (affix === 'warded') { enemy.wardMax = Math.round(enemy.maxHealth * WARD_SHARE); enemy.ward = enemy.wardMax; }
  if (affix === 'scorching') enemy.scorchMs = SCORCH.intervalMs;
}

// ---- The tick ----
/** The longest gap between syncs the room catches up on, and the size of each catch-up step. */
const MAX_CATCH_UP_MS = 1000;
const STEP_MS = 100;

export function advanceCoopRoom(room: CoopRoomRecord, now: number): void {
  const elapsedMs = clamp(now - room.updatedAt, 0, MAX_CATCH_UP_MS);
  room.updatedAt = now;
  dropVanishedPlayers(room, now);
  if (room.phase === 'gathering' || room.completed) {
    // Between runs the party waits in the Pavilion; heroes may still change.
    for (const player of room.players) {
      player.connected = now - player.lastSeenAt <= DISCONNECT_AFTER_MS;
      const wanted = player.input.heroId;
      if (wanted && wanted !== player.heroId) {
        player.heroId = wanted;
        player.maxHealth = HERO_HEALTH[wanted];
        player.health = player.maxHealth;
      }
    }
    // A leader who has gone quiet hands the gate to someone still here.
    const leader = room.players.find((player) => player.id === room.hostId);
    if (!leader?.connected) room.hostId = room.players.find((player) => player.connected)?.id ?? leader?.id ?? room.players[0]?.id ?? '';
    const leaderPressed = room.players.some((player) => player.id === room.hostId && player.startPending);
    for (const player of room.players) player.startPending = false;
    if (leaderPressed) beginExpedition(room);
    else { room.objective = objectiveFor(room); room.revision += 1; return; }
  }
  for (const player of room.players) player.startPending = false;
  // Catch up on the time since the last sync in short steps, so a slow connection
  // never puts the room in slow motion and nothing moves far enough to pass through cover.
  let remaining = elapsedMs;
  do {
    const step = Math.min(STEP_MS, remaining);
    stepRoom(room, now, step);
    remaining -= step;
  } while (remaining > 0 && !room.completed);
  room.objective = objectiveFor(room);
  room.revision += 1;
}

/** Someone gone for a minute and a half leaves the party; the next wanderer leads if it was the leader. */
function dropVanishedPlayers(room: CoopRoomRecord, now: number): void {
  const staying = room.players.filter((player) => now - player.lastSeenAt <= DROP_AFTER_MS);
  if (staying.length === room.players.length || staying.length === 0) return;
  room.players = staying;
  if (!staying.some((player) => player.id === room.hostId)) room.hostId = staying[0].id;
}

/** One short step of the expedition. */
function stepRoom(room: CoopRoomRecord, now: number, deltaMs: number): void {
  room.roomClockMs += deltaMs;
  const layout = layoutOf(room);
  for (const player of room.players) {
    player.connected = now - player.lastSeenAt <= DISCONNECT_AFTER_MS;
    player.attackCooldownMs = Math.max(0, player.attackCooldownMs - deltaMs);
    player.abilityCooldownMs = Math.max(0, player.abilityCooldownMs - deltaMs);
    player.invulnerableMs = Math.max(0, player.invulnerableMs - deltaMs);
    if (player.downed) { player.action = 'downed'; continue; }
    movePlayer(room, layout, player, deltaMs / 1000);
    player.aimRadians = player.input.aimRadians;
    player.action = Math.hypot(player.input.moveX, player.input.moveY) > 0.05 ? 'move' : 'idle';
    resolvePlayerActions(room, layout, player);
  }
  resolveRevives(room, deltaMs);
  updateEnemies(room, layout, deltaMs);
  updateTraps(room, layout, deltaMs);
  updateBurns(room, deltaMs);
  updateTrial(room, layout, deltaMs);
  for (const player of room.players) player.usePending = false;
  checkRoomCleared(room);
  // The run fails when everyone still connected is down (a vanished player cannot hold it open).
  const present = room.players.filter((player) => player.connected);
  if (present.length > 0 && present.every((player) => player.downed)) {
    room.failed = true;
    room.completed = true;
  }
  if (!room.completed) {
    const open = room.roomCleared && room.trial?.state !== 'running';
    if (open && !room.portalOpen) {
      for (const player of room.players) {
        if (player.downed) continue;
        const side = doorTaken(room, player);
        if (side && goThroughDoor(room, side)) break;
      }
    }
    if (room.portalOpen) updatePortal(room);
  }
}

function movePlayer(room: CoopRoomRecord, layout: CoopRoomLayout, player: AuthoritativePlayer, seconds: number): void {
  const step = HERO_SPEED[player.heroId] * player.input.speed * seconds;
  const nextX = clamp(player.x + player.input.moveX * step, COOP_FLOOR.left, COOP_FLOOR.right);
  const nextY = clamp(player.y + player.input.moveY * step, COOP_FLOOR.top, COOP_FLOOR.bottom);
  // Feet collide with cover, sliding along it like the solo hero.
  if (!blocked(room, layout, nextX, nextY + 18, 11, 5)) { player.x = nextX; player.y = nextY; return; }
  if (!blocked(room, layout, nextX, player.y + 18, 11, 5)) player.x = nextX;
  else if (!blocked(room, layout, player.x, nextY + 18, 11, 5)) player.y = nextY;
}

/**
 * Attacks and abilities: the player's own screen works out which enemies they hit
 * (with the hero's full kit) and reports those hits. Here they set the hero's
 * pose for the others, move Seo on her dash, and shatter urns in reach.
 */
function resolvePlayerActions(room: CoopRoomRecord, layout: CoopRoomLayout, player: AuthoritativePlayer): void {
  if (player.input.attackSerial > player.lastAttackSerial && player.attackCooldownMs <= 0) {
    player.lastAttackSerial = player.input.attackSerial;
    player.attackCooldownMs = player.heroId === 'seo-jiwon' ? 300 : 320;
    player.action = 'attack';
    breakUrnsInArc(room, layout, player, player.heroId === 'tsukishiro-rei' ? 330 : 82, 0.95);
  }
  if (player.input.abilitySerial > player.lastAbilitySerial && player.abilityCooldownMs <= 0) {
    player.lastAbilitySerial = player.input.abilitySerial;
    player.abilityCooldownMs = 5200;
    player.action = 'ability';
    if (player.heroId === 'seo-jiwon') {
      const dash = 150;
      for (let travelled = 0; travelled < dash; travelled += 10) {
        const x = clamp(player.x + Math.cos(player.aimRadians) * 10, COOP_FLOOR.left, COOP_FLOOR.right);
        const y = clamp(player.y + Math.sin(player.aimRadians) * 10, COOP_FLOOR.top, COOP_FLOOR.bottom);
        if (blocked(room, layout, x, y + 18, 11, 5)) break;
        player.x = x; player.y = y;
      }
      breakUrnsInArc(room, layout, player, 80, Math.PI);
    } else {
      breakUrnsInArc(room, layout, player, 120, Math.PI);
    }
  }
}

function breakUrnsInArc(room: CoopRoomRecord, layout: CoopRoomLayout, player: AuthoritativePlayer, range: number, halfAngle: number): void {
  const within = (x: number, y: number): boolean => {
    const dx = x - player.x;
    const dy = y - player.y;
    const angle = Math.atan2(dy, dx);
    const delta = Math.abs(Math.atan2(Math.sin(angle - player.aimRadians), Math.cos(angle - player.aimRadians)));
    return Math.hypot(dx, dy) <= range && delta <= halfAngle;
  };
  // Urns in reach shatter.
  layout.cover.forEach((piece, index) => {
    if (piece.kind !== 'urn' || room.brokenUrns.includes(index)) return;
    const rect = layout.coverRects[index];
    if (within((rect.left + rect.right) / 2, (rect.top + rect.bottom) / 2 - 18)) room.brokenUrns.push(index);
  });
}

/** Applies damage through barriers and second-form shields; returns the health actually removed. */
function damageEnemy(room: CoopRoomRecord, enemy: AuthoritativeEnemy, amount: number): number {
  if (enemy.shieldMs > 0) return 0;
  if (enemy.ward && enemy.ward > 0) {
    const soaked = Math.min(enemy.ward, amount);
    enemy.ward -= soaked;
    amount -= soaked;
  }
  const dealt = Math.min(enemy.health, Math.max(0, amount));
  enemy.health -= dealt;
  if (enemy.health <= 0 && enemy.elite === 'sundering') sunder(room, enemy);
  return dealt;
}

function sunder(room: CoopRoomRecord, enemy: AuthoritativeEnemy): void {
  for (let index = 0; index < SUNDER_COUNT; index += 1) {
    const side = index === 0 ? -1 : 1;
    const child = makeEnemy(room, enemy.role, clamp(enemy.x + side * 30, ENEMY_FLOOR.left, ENEMY_FLOOR.right), enemy.y, 1);
    child.maxHealth = Math.max(1, Math.round((enemy.maxHealth / ELITE_HEALTH) * SUNDER_HEALTH));
    child.health = child.maxHealth;
    child.small = true;
    child.attackCooldownMs = 1000;
    room.enemies.push(child);
  }
}

function hurtPlayer(player: AuthoritativePlayer, amount = 1): void {
  if (player.downed || player.invulnerableMs > 0) return;
  player.health = Math.max(0, player.health - amount);
  player.invulnerableMs = HIT_GRACE_MS;
  if (player.health === 0) { player.downed = true; player.reviveProgressMs = 0; }
}

function resolveRevives(room: CoopRoomRecord, deltaMs: number): void {
  for (const downed of room.players.filter((player) => player.downed)) {
    const rescuer = room.players.find((player) => !player.downed && player.input.revive && Math.hypot(player.x - downed.x, player.y - downed.y) <= REVIVE_DISTANCE);
    downed.reviveProgressMs = rescuer ? downed.reviveProgressMs + deltaMs : Math.max(0, downed.reviveProgressMs - deltaMs * 0.6);
    if (downed.reviveProgressMs < REVIVE_DURATION_MS) continue;
    downed.downed = false;
    downed.health = Math.max(1, Math.ceil(downed.maxHealth * 0.5));
    downed.reviveProgressMs = 0;
    downed.invulnerableMs = 1500;
    downed.action = 'idle';
  }
}

function updateEnemies(room: CoopRoomRecord, layout: CoopRoomLayout, deltaMs: number): void {
  const targets = room.players.filter((player) => !player.downed && player.connected);
  for (const enemy of [...room.enemies]) {
    if (enemy.health <= 0 || targets.length === 0) continue;
    const swift = enemy.elite === 'swift';
    const enraged = Boolean(enemy.phaseTwo);
    enemy.attackCooldownMs = Math.max(0, enemy.attackCooldownMs - deltaMs / (swift ? SWIFT_RECOVERY : 1) * (enraged ? 1.33 : 1));
    enemy.phaseRemainingMs = Math.max(0, enemy.phaseRemainingMs - deltaMs);
    enemy.shieldMs = Math.max(0, enemy.shieldMs - deltaMs);
    // Half health: wardens take a second form, Protectors call two echoes and press harder.
    if (!enemy.phaseTwo && (enemy.role === 'boss' || enemy.role === 'protector') && enemy.health <= enemy.maxHealth / 2) {
      enemy.phaseTwo = true;
      enemy.attackPhase = 'idle';
      enemy.zones = undefined;
      if (enemy.role === 'boss') { enemy.shieldMs = 1500; enemy.attackCooldownMs = 1900; }
      if (enemy.role === 'protector' && !enemy.summoned) {
        enemy.summoned = true;
        const scale = partyScale(room);
        for (const [role, dx] of [['hunter', -60], ['shooter', 60]] as const) {
          const add = makeEnemy(room, role, clamp(enemy.x + dx, ENEMY_FLOOR.left, ENEMY_FLOOR.right), enemy.y, scale);
          add.attackCooldownMs = 1100;
          room.enemies.push(add);
        }
      }
      continue;
    }
    if (enemy.shieldMs > 0) continue;
    const target = targets.reduce((nearest, player) => (Math.hypot(player.x - enemy.x, player.y - enemy.y) < Math.hypot(nearest.x - enemy.x, nearest.y - enemy.y) ? player : nearest), targets[0]);
    enemy.targetPlayerId = target.id;
    const strike = STRIKES[enemy.role];
    const dx = target.x - enemy.x;
    const dy = target.y - enemy.y;
    const distance = Math.max(0.001, Math.hypot(dx, dy));
    if (enemy.attackPhase === 'windup') {
      if (enemy.phaseRemainingMs > 0) continue;
      // Each screen resolves the attack against its own hero and reports what landed.
      if (enemy.chargeTo) {
        enemy.x = clamp(enemy.chargeTo.x, ENEMY_FLOOR.left, ENEMY_FLOOR.right);
        enemy.y = clamp(enemy.chargeTo.y, ENEMY_FLOOR.top, ENEMY_FLOOR.bottom);
        enemy.chargeTo = undefined;
      }
      enemy.zones = undefined;
      enemy.attackPhase = 'recovery';
      enemy.phaseRemainingMs = RECOVERY_MS;
      continue;
    }
    if (distance > strike.preferred) {
      const speed = strike.speed * (swift ? SWIFT_SPEED : 1);
      const stepX = dx / distance * speed * deltaMs / 1000;
      const stepY = dy / distance * speed * deltaMs / 1000;
      const nextX = clamp(enemy.x + stepX, ENEMY_FLOOR.left, ENEMY_FLOOR.right);
      const nextY = clamp(enemy.y + stepY, ENEMY_FLOOR.top, ENEMY_FLOOR.bottom);
      if (!blocked(room, layout, nextX, nextY + 14, 12, 6)) { enemy.x = nextX; enemy.y = nextY; }
      else if (!blocked(room, layout, nextX, enemy.y + 14, 12, 6)) enemy.x = nextX;
      else if (!blocked(room, layout, enemy.x, nextY + 14, 12, 6)) enemy.y = nextY;
      if (enemy.elite === 'scorching') {
        enemy.scorchMs = (enemy.scorchMs ?? SCORCH.intervalMs) - deltaMs;
        if (enemy.scorchMs <= 0 && room.burns.length < SCORCH.maxPatches * 2) {
          enemy.scorchMs = SCORCH.intervalMs;
          room.burns.push({ x: Math.round(enemy.x), y: Math.round(enemy.y + 14), armMs: SCORCH.armMs, lifeMs: SCORCH.burnMs, hit: [] });
        }
      }
    }
    if (enemy.phaseRemainingMs > 0) continue;
    if (enemy.attackCooldownMs > 0 || distance > strike.preferred + 28 + (enemy.role === 'protector' ? 120 : 0)) { enemy.attackPhase = 'idle'; continue; }
    enemy.strikes += 1;
    enemy.attackPhase = 'windup';
    enemy.attackCooldownMs = strike.cooldownMs;
    const kind: CoopAttackKind = enemy.role === 'protector' && enemy.strikes % 3 === 0 ? 'charge'
      : enemy.role === 'boss' && enemy.phaseTwo && enemy.strikes % 2 === 0 ? 'signature'
        : enemy.role === 'boss' && enemy.strikes % 3 === 0 ? 'special'
          : 'basic';
    enemy.attack = { seq: enemy.strikes, kind, angle: Math.round(Math.atan2(dy, dx) * 1000) / 1000 };
    if (enemy.role === 'protector' && enemy.strikes % 3 === 0) {
      // Charge: a marked line of zones, then it crashes to the far end.
      const angle = Math.atan2(dy, dx);
      enemy.zones = Array.from({ length: CHARGE.zones }, (_, step) => ({
        x: Math.round(enemy.x + Math.cos(angle) * (40 + step * CHARGE.spacing)),
        y: Math.round(enemy.y + Math.sin(angle) * (40 + step * CHARGE.spacing)),
        radius: CHARGE.radius,
      }));
      const end = enemy.zones[enemy.zones.length - 1];
      enemy.chargeTo = { x: end.x, y: end.y };
      enemy.phaseRemainingMs = CHARGE.windupMs;
    } else if (enemy.role === 'boss' && enemy.phaseTwo && enemy.strikes % 2 === 0) {
      // Second form: a rain of blows on and around the target; step out between them.
      const turn = (enemy.strikes * 0.7) % (Math.PI * 2);
      enemy.zones = [{ x: Math.round(target.x), y: Math.round(target.y), radius: RAIN.radius }, ...[0, 1, 2, 3].map((index) => ({
        x: Math.round(target.x + Math.cos(turn + index * Math.PI / 2) * RAIN.spread),
        y: Math.round(target.y + Math.sin(turn + index * Math.PI / 2) * RAIN.spread),
        radius: RAIN.radius,
      }))];
      enemy.phaseRemainingMs = RAIN.windupMs;
    } else {
      enemy.zones = [{ x: Math.round(target.x), y: Math.round(target.y), radius: strike.radius * (enemy.small ? 0.8 : 1) }];
      enemy.phaseRemainingMs = strike.windupMs;
    }
  }
  room.enemies = room.enemies.filter((enemy) => enemy.health > 0);
}

function updateTraps(room: CoopRoomRecord, layout: CoopRoomLayout, deltaMs: number): void {
  const radius = trapRadius(COOP_ROOM.tile);
  const standing = room.players.filter((player) => !player.downed);
  layout.traps.forEach((trap, index) => {
    const on = standing.filter((player) => Math.hypot(player.x - trap.x, player.y + 18 - trap.y) < radius);
    if (trap.kind === 'pit') {
      const pit = room.pits[index];
      if (!pit) return;
      if (pit.state === 0) { if (on.length > 0) { pit.state = 1; pit.ms = 0; } return; }
      pit.ms += deltaMs;
      if (pit.state === 1 && pit.ms >= PIT.crumble) { pit.state = 2; pit.ms = 0; for (const player of on) fall(room, player); return; }
      if (pit.state === 2) {
        if (pit.ms > 120) for (const player of on) fall(room, player);
        if (pit.ms >= PIT.open) { pit.state = 0; pit.ms = 0; }
      }
      return;
    }
    const clock = trap.clock + room.roomClockMs;
    if (trapPhase(trap.kind, clock) !== 'danger') return;
    const cycle = Math.floor(clock / cycleLength(trap.kind));
    for (const player of on) {
      const key = `${index}:${player.id}`;
      if (room.trapHits[key] === cycle) continue;
      room.trapHits[key] = cycle;
      hurtPlayer(player);
    }
  });
}

/** Falling into a pit costs a heart and returns you to the door you came in by. */
function fall(room: CoopRoomRecord, player: AuthoritativePlayer): void {
  player.invulnerableMs = 0;
  hurtPlayer(player);
  const entry = ENTRY_POINTS[room.entrySide];
  player.x = entry.x;
  player.y = entry.y;
}

function updateBurns(room: CoopRoomRecord, deltaMs: number): void {
  for (const burn of room.burns) {
    if (burn.armMs > 0) { burn.armMs -= deltaMs; continue; }
    burn.lifeMs -= deltaMs;
    for (const player of room.players) {
      if (player.downed || burn.hit.includes(player.id)) continue;
      if (Math.hypot(player.x - burn.x, player.y + 18 - burn.y) < SCORCH.radius) { burn.hit.push(player.id); hurtPlayer(player); }
    }
  }
  room.burns = room.burns.filter((burn) => burn.lifeMs > 0);
}

function updateTrial(room: CoopRoomRecord, layout: CoopRoomLayout, deltaMs: number): void {
  if (currentFeature(room) !== 'trial') return;
  if (!room.trial && !room.trialsDone.includes(room.roomId)) {
    const ringer = room.players.find((player) => !player.downed && player.usePending && Math.hypot(player.x - BELL.x, player.y + 18 - (BELL.y - 6)) < BELL.reach);
    if (!ringer) return;
    const extra = room.players.length - 1;
    room.trial = { roomId: room.roomId, state: 'running', wave: 0, waves: trialWaves(room.themeIndex, 0).map((count) => count + extra), gapMs: 700 };
    room.roomCleared = false;
    return;
  }
  const trial = room.trial;
  if (!trial || trial.state !== 'running' || room.enemies.length > 0) return;
  trial.gapMs -= deltaMs;
  if (trial.gapMs > 0) return;
  if (trial.wave < trial.waves.length) {
    trial.wave += 1;
    trial.gapMs = TRIAL_WAVE_GAP_MS;
    const random = new SeededRandom((roomLayoutSeed(room.seed, room.roomId) ^ (0x7e1a + trial.wave)) >>> 0);
    spawnWave(room, random, layout, trial.waves[trial.wave - 1], trial.wave === trial.waves.length, 700);
    return;
  }
  trial.state = 'done';
  room.trialsDone.push(room.roomId);
  room.roomCleared = true;
}

function checkRoomCleared(room: CoopRoomRecord): void {
  if (room.roomCleared || room.enemies.length > 0 || room.trial?.state === 'running') return;
  room.roomCleared = true;
  if (!room.cleared.includes(room.roomId)) room.cleared.push(room.roomId);
  // A sealed room restores a heart to everyone still standing.
  for (const player of room.players) if (!player.downed) player.health = Math.min(player.maxHealth, player.health + 1);
  room.burns = [];
  if (currentRoom(room).kind === 'boss') room.portalOpen = true;
}

function updatePortal(room: CoopRoomRecord): void {
  for (const player of room.players) {
    if (player.downed) continue;
    const inside = Math.hypot(player.x - PORTAL.x, player.y - PORTAL.y) <= PORTAL.radius;
    if (!inside) { if (!room.portalArmed.includes(player.id)) room.portalArmed.push(player.id); continue; }
    if (!room.portalArmed.includes(player.id)) continue;
    if (room.themeIndex < room.themeOrder.length - 1) {
      startFloor(room, room.themeIndex + 1);
      for (const member of room.players) member.health = member.downed ? member.health : member.maxHealth;
    } else {
      room.completed = true;
    }
    return;
  }
}

export function roomSnapshot(room: CoopRoomRecord, now: number): CoopRoomSnapshot {
  return {
    schemaVersion: room.schemaVersion,
    roomCode: room.roomCode,
    revision: room.revision,
    serverTime: now,
    seed: room.seed,
    themeOrder: room.themeOrder,
    themeIndex: room.themeIndex,
    phase: room.phase,
    hostId: room.hostId,
    expedition: room.expedition,
    roomId: room.roomId,
    entrySide: room.entrySide,
    cleared: [...room.cleared],
    roomCleared: room.roomCleared,
    roomClockMs: Math.round(room.roomClockMs),
    pits: room.pits.map((pit) => (pit ? pit.state : -1)),
    brokenUrns: [...room.brokenUrns],
    burns: room.burns.map((burn) => ({ x: burn.x, y: burn.y, armed: burn.armMs <= 0 })),
    trial: currentFeature(room) === 'trial'
      ? { state: room.trial?.state ?? (room.trialsDone.includes(room.roomId) ? 'done' : 'idle'), wave: room.trial?.wave ?? 0, waves: room.trial?.waves.length ?? 3 }
      : undefined,
    portalOpen: room.portalOpen,
    completed: room.completed,
    failed: room.failed,
    objective: room.objective,
    players: room.players.map(({ token: _token, input: _input, lastSeenAt: _seen, lastAttackSerial: _a, lastAbilitySerial: _b, attackCooldownMs: _c, abilityCooldownMs: _d, invulnerableMs: _e, healApplied, maxHealthApplied, lastUseSerial: _h, usePending: _i, lastStartSerial: _j, startPending: _k, hurtApplied, ...snapshot }) => ({ ...snapshot, loot: { heal: healApplied, maxHealth: maxHealthApplied, hurt: hurtApplied } })),
    enemies: room.enemies.filter((enemy) => enemy.health > 0).map((enemy) => ({
      id: enemy.id, role: enemy.role, x: Math.round(enemy.x), y: Math.round(enemy.y), health: enemy.health, maxHealth: enemy.maxHealth,
      targetPlayerId: enemy.targetPlayerId, attackPhase: enemy.attackPhase,
      ...(enemy.attack ? { attack: enemy.attack } : {}),
      ...(enemy.elite ? { elite: enemy.elite } : {}),
      ...(enemy.wardMax ? { ward: enemy.ward ?? 0, wardMax: enemy.wardMax } : {}),
      ...(enemy.phaseTwo ? { phaseTwo: true } : {}),
      ...(enemy.shieldMs > 0 ? { shielded: true } : {}),
      ...(enemy.small ? { small: true } : {}),
    })),
  };
}
