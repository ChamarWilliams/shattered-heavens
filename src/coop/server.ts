/**
 * The co-op request handler, independent of where rooms are stored. Netlify's
 * function (netlify/functions/game.ts) runs it over Netlify Blobs; tests and the
 * local two-player harness run it over an in-memory store.
 */
import {
  COOP_MAX_PLAYERS,
  COOP_SCHEMA_VERSION,
  normalizeRoomCode,
  type CoopHeroId,
  type CoopMembership,
  type CoopRequest,
  type CoopResponse,
} from './protocol';
import {
  advanceCoopRoom,
  applyCoopInput,
  authenticatePlayer,
  createCoopRoom,
  joinCoopRoom,
  roomSnapshot,
  type CoopRoomRecord,
  type NewPlayer,
} from './simulation';

/** Strongly consistent storage with conditional writes (Netlify Blobs or a Map). */
export interface CoopRoomStore {
  read(key: string): Promise<{ room: CoopRoomRecord; etag: string } | undefined>;
  /** Writes only if nothing is stored under the key; false if something already is. */
  createIfNew(key: string, room: CoopRoomRecord): Promise<boolean>;
  /** Writes only if the stored version still matches `etag`; false on a conflict. */
  replaceIfMatch(key: string, room: CoopRoomRecord, etag: string): Promise<boolean>;
}

export interface CoopServerEnvironment {
  readonly store: CoopRoomStore;
  readonly now: () => number;
  readonly randomUint32: () => number;
  readonly randomId: () => string;
}

export interface CoopHttpResult { readonly status: number; readonly body: CoopResponse }

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const HERO_IDS: readonly CoopHeroId[] = ['li-yunfeng', 'seo-jiwon', 'tsukishiro-rei'];
const roomKey = (code: string): string => `room-${code}`;
const cleanName = (value: unknown): string => String(value ?? '').replace(/[<>\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 18) || 'Wanderer';
const ok = (body: CoopResponse): CoopHttpResult => ({ status: 200, body });
const failure = (code: string, message: string, status = 400, retryable = false): CoopHttpResult => ({ status, body: { ok: false, code, message, retryable } });
const validHero = (heroId: unknown): heroId is CoopHeroId => HERO_IDS.includes(heroId as CoopHeroId);

export async function handleCoopRequest(payload: CoopRequest, env: CoopServerEnvironment): Promise<CoopHttpResult> {
  try {
    if (payload.action === 'host') return await host(payload, env);
    if (payload.action === 'join') return await join(payload, env);
    if (payload.action === 'sync') return await sync(payload, env);
    if (payload.action === 'leave') return await leave(payload, env);
    return failure('INVALID_ACTION', 'Unknown room action.');
  } catch (error) {
    if (error instanceof Error && error.message === 'ROOM_FULL') return failure('ROOM_FULL', 'This expedition already has three wanderers.');
    console.error('Co-op request failure', error);
    return failure('INTERNAL_ERROR', 'The realm connection failed. Retry shortly.', 500, true);
  }
}

function newPlayer(env: CoopServerEnvironment, name: unknown, heroId: CoopHeroId): NewPlayer {
  return { id: env.randomId(), token: env.randomId() + env.randomId(), name: cleanName(name), heroId };
}

function newCode(env: CoopServerEnvironment): string {
  return Array.from({ length: 6 }, () => CODE_ALPHABET[env.randomUint32() % CODE_ALPHABET.length]).join('');
}

async function host(request: Extract<CoopRequest, { action: 'host' }>, env: CoopServerEnvironment): Promise<CoopHttpResult> {
  if (!validHero(request.heroId)) return failure('INVALID_HERO', 'Choose a valid hero.');
  const player = newPlayer(env, request.name, request.heroId);
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = newCode(env);
    const now = env.now();
    const room = createCoopRoom(code, env.randomUint32(), player, now);
    if (!await env.store.createIfNew(roomKey(code), room)) continue;
    const membership: CoopMembership = { roomCode: code, playerId: player.id, playerToken: player.token };
    return ok({ ok: true, membership, snapshot: roomSnapshot(room, now) });
  }
  return failure('CODE_EXHAUSTED', 'Could not reserve a room code. Try again.', 503, true);
}

/** Read, change and conditionally write a room, retrying when another sync got there first. */
async function mutate(code: string, env: CoopServerEnvironment, change: (room: CoopRoomRecord, now: number) => CoopResponse | undefined): Promise<CoopHttpResult> {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const current = await env.store.read(roomKey(code));
    // Rooms made by an older version of the game cannot be continued.
    if (!current || current.room.schemaVersion !== COOP_SCHEMA_VERSION) return failure('ROOM_NOT_FOUND', 'That room does not exist or has expired.', 404);
    const now = env.now();
    const result = change(current.room, now);
    if (result?.ok === false) return { status: result.code === 'UNAUTHORIZED' ? 401 : 400, body: result };
    if (!await env.store.replaceIfMatch(roomKey(code), current.room, current.etag)) continue;
    return ok(result ?? { ok: true, snapshot: roomSnapshot(current.room, now) });
  }
  return failure('WRITE_CONFLICT', 'The room changed while processing this request. Retry.', 409, true);
}

async function join(request: Extract<CoopRequest, { action: 'join' }>, env: CoopServerEnvironment): Promise<CoopHttpResult> {
  const code = normalizeRoomCode(String(request.roomCode ?? ''));
  if (code.length !== 6) return failure('INVALID_ROOM_CODE', 'Enter the six-character room code.');
  if (!validHero(request.heroId)) return failure('INVALID_HERO', 'Choose a valid hero.');
  const guest = newPlayer(env, request.name, request.heroId);
  return mutate(code, env, (room, now) => {
    if (room.players.length >= COOP_MAX_PLAYERS) return { ok: false, code: 'ROOM_FULL', message: 'This expedition already has three wanderers.' };
    advanceCoopRoom(room, now);
    joinCoopRoom(room, guest, now);
    return { ok: true, membership: { roomCode: code, playerId: guest.id, playerToken: guest.token }, snapshot: roomSnapshot(room, now) };
  });
}

async function sync(request: Extract<CoopRequest, { action: 'sync' }>, env: CoopServerEnvironment): Promise<CoopHttpResult> {
  const code = normalizeRoomCode(String(request.membership?.roomCode ?? ''));
  return mutate(code, env, (room, now) => {
    const player = authenticatePlayer(room, request.membership.playerId, request.membership.playerToken);
    if (!player) return { ok: false, code: 'UNAUTHORIZED', message: 'This player session is not valid.' };
    applyCoopInput(player, request.input, now, room);
    advanceCoopRoom(room, now);
    return { ok: true, snapshot: roomSnapshot(room, now) };
  });
}

async function leave(request: Extract<CoopRequest, { action: 'leave' }>, env: CoopServerEnvironment): Promise<CoopHttpResult> {
  const code = normalizeRoomCode(String(request.membership?.roomCode ?? ''));
  return mutate(code, env, (room) => {
    const player = authenticatePlayer(room, request.membership.playerId, request.membership.playerToken);
    if (!player) return { ok: false, code: 'UNAUTHORIZED', message: 'This player session is not valid.' };
    room.players = room.players.filter((entry) => entry.id !== player.id);
    // The next wanderer leads if the leader leaves.
    if (room.hostId === player.id) room.hostId = room.players[0]?.id ?? '';
    room.revision += 1;
    return { ok: true, left: true };
  });
}

/** A store kept in memory: for tests and the local two-player harness. */
export function memoryRoomStore(): CoopRoomStore {
  const rooms = new Map<string, { json: string; etag: number }>();
  return {
    async read(key) {
      const entry = rooms.get(key);
      return entry ? { room: JSON.parse(entry.json) as CoopRoomRecord, etag: String(entry.etag) } : undefined;
    },
    async createIfNew(key, room) {
      if (rooms.has(key)) return false;
      rooms.set(key, { json: JSON.stringify(room), etag: 1 });
      return true;
    },
    async replaceIfMatch(key, room, etag) {
      const entry = rooms.get(key);
      if (!entry || String(entry.etag) !== etag) return false;
      rooms.set(key, { json: JSON.stringify(room), etag: entry.etag + 1 });
      return true;
    },
  };
}
