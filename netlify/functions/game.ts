import { getStore } from '@netlify/blobs';
import type { Context } from '@netlify/functions';
import type { CoopRequest, CoopResponse } from '../../src/coop/protocol';
import { handleCoopRequest, type CoopRoomStore } from '../../src/coop/server';
import type { CoopRoomRecord } from '../../src/coop/simulation';

const STORE_NAME = 'echoes-coop-rooms-v1';
const ROOM_TTL_MS = 6 * 60 * 60 * 1000;

const blobs = getStore({ name: STORE_NAME, consistency: 'strong' });

/** Netlify Blobs with strong consistency and conditional writes, behind the handler's store interface. */
const store: CoopRoomStore = {
  async read(key) {
    const entry = await blobs.getWithMetadata(key, { type: 'json', consistency: 'strong' });
    if (!entry?.data || !entry.etag) return undefined;
    return { room: entry.data as CoopRoomRecord, etag: entry.etag };
  },
  async createIfNew(key, room) {
    const result = await blobs.setJSON(key, room, { onlyIfNew: true, metadata: { expiresAt: Date.now() + ROOM_TTL_MS } });
    return result.modified;
  },
  async replaceIfMatch(key, room, etag) {
    const result = await blobs.setJSON(key, room, { onlyIfMatch: etag, metadata: { expiresAt: Date.now() + ROOM_TTL_MS } });
    return result.modified;
  },
};

const respond = (body: CoopResponse, status: number): Response => Response.json(body, {
  status,
  headers: {
    'Cache-Control': 'no-store, max-age=0',
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
  },
});

export default async (request: Request, _context: Context): Promise<Response> => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { Allow: 'POST, OPTIONS' } });
  if (request.method !== 'POST') return respond({ ok: false, code: 'METHOD_NOT_ALLOWED', message: 'Use POST.' }, 405);
  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (contentLength > 16_384) return respond({ ok: false, code: 'PAYLOAD_TOO_LARGE', message: 'Request is too large.' }, 413);
  let payload: CoopRequest;
  try {
    payload = await request.json() as CoopRequest;
  } catch {
    return respond({ ok: false, code: 'INVALID_JSON', message: 'Request body must be valid JSON.' }, 400);
  }
  const result = await handleCoopRequest(payload, {
    store,
    now: () => Date.now(),
    randomUint32: () => crypto.getRandomValues(new Uint32Array(1))[0],
    randomId: () => crypto.randomUUID(),
  });
  return respond(result.body, result.status);
};
