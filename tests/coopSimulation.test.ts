import { describe, expect, it } from 'vitest';
import {
  COOP_FLOOR, ENTRY_POINTS, advanceCoopRoom, applyCoopInput, beginExpedition, coopDungeon, createCoopRoom, currentDungeon, currentFeature, enterRoom,
  joinCoopRoom, layoutOf, roomSnapshot, type CoopRoomRecord,
} from '../src/coop/simulation';
import { emptyCoopInput, type CoopInput } from '../src/coop/protocol';
import { handleCoopRequest, memoryRoomStore } from '../src/coop/server';
import { generateDungeon } from '../src/dungeon';
import { trapPhase, cycleLength } from '../src/dungeon/traps';

const player = (id: string, heroId: 'li-yunfeng' | 'seo-jiwon' | 'tsukishiro-rei' = 'li-yunfeng') => ({ id, token: `${id}-token`, name: id, heroId });
/** A room whose party has already gone through the Realm Gate. */
const startedRoom = (...args: Parameters<typeof createCoopRoom>): CoopRoomRecord => { const room = createCoopRoom(...args); beginExpedition(room); return room; };
let sequence = 0;
const press = (room: CoopRoomRecord, index: number, input: Partial<CoopInput>, now: number): void =>
  applyCoopInput(room.players[index], { ...room.players[index].input, ...input, sequence: ++sequence }, now, room);
const run = (room: CoopRoomRecord, from: number, to: number, step = 100): number => { for (let time = from; time <= to; time += step) advanceCoopRoom(room, time); return to; };
/** A room on the current floor that is not the start, warden or a special room. */
const combatRoom = (room: CoopRoomRecord) => currentDungeon(room).rooms.find((candidate) => candidate.kind === 'combat' && !currentFeatureOf(room, candidate.id))!;
const currentFeatureOf = (room: CoopRoomRecord, id: string) => { const saved = room.roomId; room.roomId = id; const feature = currentFeature(room); room.roomId = saved; return feature; };
const roomWith = (room: CoopRoomRecord, feature: string) => currentDungeon(room).rooms.find((candidate) => currentFeatureOf(room, candidate.id) === feature);

describe('co-op room: the party', () => {
  it('holds three wanderers, heroes may repeat, and toughens enemies for the party', () => {
    const room = startedRoom('ABC234', 42, player('host'), 1000);
    enterRoom(room, combatRoom(room).id, 'S');
    const soloHealth = room.enemies[0].maxHealth;
    joinCoopRoom(room, player('guest', 'seo-jiwon'), 1000);
    joinCoopRoom(room, player('third', 'seo-jiwon'), 1000);
    expect(room.players).toHaveLength(3);
    expect(room.enemies[0].maxHealth).toBe(Math.round(Math.round(soloHealth * 1.4) * (1.8 / 1.4)));
    expect(() => joinCoopRoom(room, player('fourth', 'li-yunfeng'), 1000)).toThrow('ROOM_FULL');
  });

  it('starts in the same start room a solo run generates, and never leaks tokens', () => {
    const room = startedRoom('ABC234', 42, player('host'), 1000);
    joinCoopRoom(room, player('guest', 'seo-jiwon'), 1000);
    const snapshot = roomSnapshot(room, 1000);
    const solo = generateDungeon({ seed: 42, themeId: room.themeOrder[0], roomCount: 9, maxRadius: 5 });
    expect(snapshot.roomId).toBe(solo.rooms.find((candidate) => candidate.kind === 'start')!.id);
    expect(snapshot.roomCleared).toBe(true);
    expect(snapshot.enemies).toHaveLength(0);
    expect(JSON.stringify(snapshot)).not.toContain('host-token');
  });

  it('normalizes movement, acknowledges input and keeps feet out of pillars', () => {
    const room = startedRoom('ABC234', 42, player('host'), 1000);
    const host = room.players[0];
    press(room, 0, { moveX: 10, moveY: 0 }, 1100);
    advanceCoopRoom(room, 1200);
    expect(host.acknowledgedInput).toBe(sequence);
    expect(host.x).toBeGreaterThan(ENTRY_POINTS.S.x);
    expect(host.x).toBeLessThanOrEqual(COOP_FLOOR.right);
    // Walk straight at a pillar: the hero stops at it.
    for (const candidate of currentDungeon(room).rooms) {
      if (candidate.kind === 'start' || candidate.kind === 'boss') continue;
      enterRoom(room, candidate.id, 'S');
      const layout = layoutOf(room);
      const index = layout.cover.findIndex((piece) => piece.kind === 'pillar');
      if (index < 0) continue;
      const rect = layout.coverRects[index];
      room.enemies = [];
      host.x = (rect.left + rect.right) / 2;
      host.y = rect.bottom - 18 + 30;
      press(room, 0, { moveX: 0, moveY: -1 }, 2000);
      run(room, 2100, 3000);
      expect(host.y + 18 + 5).toBeGreaterThanOrEqual(rect.bottom - 0.5);
      return;
    }
    throw new Error('no room with a pillar');
  });

  it('requires a nearby living player to make revive progress', () => {
    const room = startedRoom('ABC234', 42, player('host'), 1000);
    const guest = joinCoopRoom(room, player('guest', 'seo-jiwon'), 1000);
    const host = room.players[0];
    guest.downed = true;
    guest.health = 0;
    guest.x = host.x + 20;
    guest.y = host.y;
    press(room, 0, { revive: true }, 1100);
    run(room, 1250, 3500, 250);
    expect(guest.downed).toBe(false);
    expect(guest.health).toBeGreaterThan(0);
  });

  it('keeps real time when syncs arrive slowly, without letting anyone pass through cover', () => {
    const room = startedRoom('ABC234', 42, player('host'), 1000);
    const guest = joinCoopRoom(room, player('guest'), 1000);
    const host = room.players[0];
    guest.downed = true;
    guest.health = 0;
    guest.x = host.x + 20;
    guest.y = host.y;
    press(room, 0, { revive: true }, 1000);
    // One sync after 800 ms counts all 800 ms; a 5 s gap counts at most a second.
    advanceCoopRoom(room, 1800);
    expect(guest.reviveProgressMs).toBe(800);
    advanceCoopRoom(room, 6800);
    expect(guest.reviveProgressMs).toBe(1800);
    advanceCoopRoom(room, 7300);
    expect(guest.downed).toBe(false);
    // A whole second of walking at a pillar in one sync still stops at the pillar.
    for (const candidate of currentDungeon(room).rooms) {
      if (candidate.kind === 'start' || candidate.kind === 'boss') continue;
      enterRoom(room, candidate.id, 'S');
      const layout = layoutOf(room);
      const index = layout.cover.findIndex((piece) => piece.kind === 'pillar');
      if (index < 0) continue;
      const rect = layout.coverRects[index];
      room.enemies = [];
      host.x = (rect.left + rect.right) / 2;
      host.y = rect.bottom - 18 + 30;
      press(room, 0, { moveX: 0, moveY: -1, revive: false }, 8000);
      room.updatedAt = 8000;
      advanceCoopRoom(room, 9000);
      expect(host.y + 18 + 5).toBeGreaterThanOrEqual(rect.bottom - 0.5);
      return;
    }
    throw new Error('no pillar on this floor');
  });

  it('applies personal heals and max hearts once each, however often they are re-sent', () => {
    const room = startedRoom('ABC234', 42, player('host'), 1000);
    const host = room.players[0];
    host.health = 3;
    press(room, 0, { healTotal: 2, maxHealthTotal: 1 }, 1100);
    press(room, 0, { healTotal: 2, maxHealthTotal: 1 }, 1200);
    expect(host.maxHealth).toBe(8);
    expect(host.health).toBe(5);
    press(room, 0, { healTotal: 2, maxHealthTotal: 0 }, 1300);
    expect(host.maxHealth).toBe(7);
  });
});

describe('co-op room: the floor', () => {
  it('replays the floor, encounters and traps from the same seed', () => {
    const first = startedRoom('ABC234', 9182, player('host-a'), 1000);
    const second = startedRoom('XYZ567', 9182, player('host-b'), 1000);
    const target = combatRoom(first).id;
    enterRoom(first, target, 'W');
    enterRoom(second, target, 'W');
    expect(first.enemies.map(({ role, x, y, elite }) => ({ role, x, y, elite }))).toEqual(second.enemies.map(({ role, x, y, elite }) => ({ role, x, y, elite })));
    expect(layoutOf(first)).toEqual(layoutOf(second));
  });

  it('takes the party through an open door together and seals the next room until it is cleared', () => {
    const room = startedRoom('ABC234', 42, player('host'), 1000);
    joinCoopRoom(room, player('guest', 'seo-jiwon'), 1000);
    const start = currentDungeon(room).rooms.find((candidate) => candidate.id === room.roomId)!;
    const side = (['N', 'E', 'S', 'W'] as const).find((candidate) => (start.doorMask & { N: 1, E: 2, S: 4, W: 8 }[candidate]) !== 0)!;
    const host = room.players[0];
    const push = { N: { x: 480, y: COOP_FLOOR.top, moveX: 0, moveY: -1 }, S: { x: 480, y: COOP_FLOOR.bottom, moveX: 0, moveY: 1 }, E: { x: COOP_FLOOR.right, y: 270, moveX: 1, moveY: 0 }, W: { x: COOP_FLOOR.left, y: 270, moveX: -1, moveY: 0 } }[side];
    host.x = push.x; host.y = push.y;
    press(room, 0, { moveX: push.moveX, moveY: push.moveY }, 1100);
    advanceCoopRoom(room, 1200);
    expect(room.roomId).not.toBe(start.id);
    const opposite = { N: 'S', S: 'N', E: 'W', W: 'E' } as const;
    expect(room.entrySide).toBe(opposite[side]);
    // Both wanderers arrive at the door they came through.
    for (const member of room.players) expect(Math.hypot(member.x - ENTRY_POINTS[room.entrySide].x, member.y - ENTRY_POINTS[room.entrySide].y)).toBeLessThan(50);
    if (room.enemies.length > 0) {
      expect(room.roomCleared).toBe(false);
      const here = room.roomId;
      host.x = ENTRY_POINTS[room.entrySide].x; host.y = COOP_FLOOR.top;
      press(room, 0, { moveX: 0, moveY: -1 }, 1300);
      advanceCoopRoom(room, 1400);
      expect(room.roomId).toBe(here);
    }
  });

  it('runs traps on the shared clock: spikes hurt once per cycle, pits drop you back at the door', () => {
    const room = startedRoom('ABC234', 77, player('host'), 1000);
    for (const candidate of currentDungeon(room).rooms) {
      if (candidate.kind !== 'combat') continue;
      enterRoom(room, candidate.id, 'S');
      const traps = layoutOf(room).traps;
      const spike = traps.findIndex((trap) => trap.kind === 'spikes');
      if (spike < 0) continue;
      room.enemies = [];
      const host = room.players[0];
      const trap = traps[spike];
      host.x = trap.x; host.y = trap.y - 18;
      const health = host.health;
      let now = 1000;
      // Advance one full cycle while standing on it.
      for (let elapsed = 0; elapsed <= cycleLength('spikes'); elapsed += 50) { now += 50; advanceCoopRoom(room, now); }
      expect(host.health).toBe(health - 1);
      expect(trapPhase('spikes', trap.clock + room.roomClockMs)).toBeDefined();
      return;
    }
    throw new Error('no combat room with spikes');
  });
});

describe('co-op room: enemies', () => {
  it('announces each enemy attack for every screen to play, and hurts only by what the target reports', () => {
    const room = startedRoom('ABC234', 42, player('host'), 1000);
    enterRoom(room, combatRoom(room).id, 'S');
    const host = room.players[0];
    const hunter = room.enemies[0];
    Object.assign(hunter, { role: 'hunter', elite: undefined, ward: undefined, wardMax: undefined, attackCooldownMs: 0, x: host.x + 40, y: host.y });
    room.enemies = [hunter];
    const startHealth = host.health;
    advanceCoopRoom(room, 1100);
    const attack = roomSnapshot(room, 1100).enemies[0].attack;
    expect(attack).toMatchObject({ seq: 1, kind: 'basic' });
    expect(Math.abs(attack!.angle - Math.PI)).toBeLessThan(0.01);
    // The server itself no longer lands enemy blows: standing still in the old zone costs nothing.
    run(room, 1200, 2000, 100);
    expect(host.health).toBe(startHealth);
    // The target's screen reports what landed: applied once, however often it is resent, at most 3 per sync.
    press(room, 0, { hurtTotal: 1 }, 2100);
    press(room, 0, { hurtTotal: 1 }, 2200);
    expect(host.health).toBe(startHealth - 1);
    press(room, 0, { hurtTotal: 40 }, 2300);
    expect(host.health).toBe(startHealth - 4);
    // Anything beyond the cap is dropped, not carried over.
    press(room, 0, { hurtTotal: 40 }, 2400);
    expect(host.health).toBe(startHealth - 4);
    press(room, 0, { hurtTotal: 43 }, 2500);
    expect(host.downed).toBe(true);
    expect(host.health).toBe(0);
  });

  it('applies the hits a screen reports once each: barriers soak them and Sundering elites split', () => {
    const room = startedRoom('ABC234', 42, player('host'), 1000);
    enterRoom(room, combatRoom(room).id, 'S');
    const host = room.players[0];
    const enemy = room.enemies[0];
    Object.assign(enemy, { elite: 'warded', ward: 20, wardMax: 20, health: 50, maxHealth: 50, x: host.x + 300, y: host.y });
    room.enemies = [enemy];
    // Hits count however far away the enemy is on the server: the screen saw them land.
    press(room, 0, { hits: [{ seq: 1, enemyId: enemy.id, damage: 14 }] }, 1100);
    press(room, 0, { hits: [{ seq: 1, enemyId: enemy.id, damage: 14 }, { seq: 2, enemyId: enemy.id, damage: 10 }] }, 1150);
    expect(enemy.ward).toBe(0);
    expect(enemy.health).toBe(46);
    expect(roomSnapshot(room, 1150).players[0].lastHitSeq).toBe(2);
    expect(host.damageDealt).toBe(4);
    // Absurd damage is capped, and the last hit kills: a Sundering elite splits in two.
    Object.assign(enemy, { elite: 'sundering', ward: undefined, wardMax: undefined, health: 5000, maxHealth: 5000 });
    press(room, 0, { hits: [{ seq: 3, enemyId: enemy.id, damage: 1e9 }] }, 1200);
    expect(enemy.health).toBe(4400);
    enemy.health = 5;
    press(room, 0, { hits: [{ seq: 4, enemyId: enemy.id, damage: 9 }] }, 1250);
    expect(room.enemies.filter((candidate) => candidate.small)).toHaveLength(2);
    expect(room.enemies.some((candidate) => candidate.id === enemy.id)).toBe(false);
  });

  it('lets a run fail when everyone still connected is down, and drops players gone for 90 seconds', () => {
    const room = startedRoom('ABC234', 42, player('host'), 1000);
    joinCoopRoom(room, player('guest'), 1000);
    const [host, guest] = room.players;
    host.downed = true; host.health = 0;
    // The guest's connection drops: after 12 s they no longer hold the run open.
    for (let time = 1100; time <= 14000; time += 300) { press(room, 0, {}, time); advanceCoopRoom(room, time); }
    expect(guest.connected).toBe(false);
    expect(room.failed).toBe(true);
    const later = startedRoom('XYZ567', 42, player('host'), 1000);
    joinCoopRoom(later, player('guest'), 1000);
    for (let time = 1100; time <= 93000; time += 1000) { press(later, 0, {}, time); advanceCoopRoom(later, time); }
    expect(later.players.map((member) => member.id)).toEqual(['host']);
  });

  it('runs the Dharma Protector: a charge every third attack and two echoes at half health', () => {
    const room = startedRoom('ABC234', 42, player('host'), 1000);
    const protectorRoom = roomWith(room, 'protector');
    expect(protectorRoom).toBeDefined();
    enterRoom(room, protectorRoom!.id, 'S');
    const protector = room.enemies[0];
    expect(protector.role).toBe('protector');
    protector.strikes = 2;
    protector.attackCooldownMs = 0;
    advanceCoopRoom(room, 1100);
    expect(protector.zones).toHaveLength(4);
    expect(roomSnapshot(room, 1100).enemies[0].attack?.kind).toBe('charge');
    protector.health = Math.floor(protector.maxHealth / 2);
    protector.attackPhase = 'idle';
    advanceCoopRoom(room, 1200);
    expect(protector.phaseTwo).toBe(true);
    expect(room.enemies).toHaveLength(3);
  });

  it("runs the warden's second form: a brief shield, then a rain of zones", () => {
    const room = startedRoom('ABC234', 42, player('host'), 1000);
    enterRoom(room, currentDungeon(room).rooms.find((candidate) => candidate.kind === 'boss')!.id, 'S');
    const boss = room.enemies[0];
    boss.health = Math.floor(boss.maxHealth / 2);
    advanceCoopRoom(room, 1100);
    expect(boss.phaseTwo).toBe(true);
    expect(boss.shieldMs).toBeGreaterThan(0);
    const health = boss.health;
    room.players[0].x = boss.x + 30; room.players[0].y = boss.y;
    press(room, 0, { aimRadians: 0, attackSerial: 1 }, 1150);
    advanceCoopRoom(room, 1200);
    expect(boss.health).toBe(health);
    boss.shieldMs = 0; boss.strikes = 1; boss.attackCooldownMs = 0; boss.attackPhase = 'idle'; boss.phaseRemainingMs = 0;
    room.players[0].x = boss.x; room.players[0].y = boss.y + 60;
    advanceCoopRoom(room, 1300);
    expect(boss.zones).toHaveLength(5);
  });
});

describe('co-op room: special rooms and the echo', () => {
  it('rings the Bell of Trials, runs every wave, then unseals', () => {
    for (let seed = 1; seed < 40; seed += 1) {
      const room = startedRoom('ABC234', seed, player('host'), 1000);
      const bell = roomWith(room, 'trial');
      if (!bell) continue;
      enterRoom(room, bell.id, 'S');
      const host = room.players[0];
      host.x = 480; host.y = 270 - 0.18 * 208 - 6 - 18;
      press(room, 0, { useSerial: 1 }, 1100);
      advanceCoopRoom(room, 1200);
      expect(room.trial?.state).toBe('running');
      let now = 1200;
      for (let guard = 0; guard < 400 && room.trial?.state === 'running'; guard += 1) {
        for (const enemy of room.enemies) enemy.health = 0;
        now += 200;
        advanceCoopRoom(room, now);
      }
      expect(room.trial?.state).toBe('done');
      expect(room.roomCleared).toBe(true);
      return;
    }
    throw new Error('no floor with a Bell of Trials');
  });

  it('opens the echo when the warden falls and moves the party to the next realm only after stepping out and back in', () => {
    const room = startedRoom('ABC234', 42, player('host'), 1000);
    enterRoom(room, currentDungeon(room).rooms.find((candidate) => candidate.kind === 'boss')!.id, 'S');
    room.enemies = [];
    const host = room.players[0];
    host.x = 480; host.y = 285;
    advanceCoopRoom(room, 1100);
    expect(room.portalOpen).toBe(true);
    expect(room.themeIndex).toBe(0);
    host.x = 300; host.y = 300;
    advanceCoopRoom(room, 1200);
    host.x = 480; host.y = 285;
    advanceCoopRoom(room, 1300);
    expect(room.themeIndex).toBe(1);
    expect(currentDungeon(room)).toBe(coopDungeon(room.seed, 1, room.themeOrder[1]));
  });

  it('ends the expedition when every wanderer has fallen', () => {
    const room = startedRoom('ABC234', 42, player('host'), 1000);
    room.players[0].downed = true;
    advanceCoopRoom(room, 1100);
    expect(room.failed).toBe(true);
    expect(roomSnapshot(room, 1100).failed).toBe(true);
  });
});

describe('co-op request handler', () => {
  const env = () => {
    let id = 0;
    return { store: memoryRoomStore(), now: () => 5000, randomUint32: () => 123456 + id++, randomId: () => `id-${id++}` };
  };

  it('hosts, joins and syncs through the store', async () => {
    const environment = env();
    const hosted = await handleCoopRequest({ action: 'host', name: 'Ann', heroId: 'li-yunfeng' }, environment);
    expect(hosted.status).toBe(200);
    if (!hosted.body.ok || !('membership' in hosted.body)) throw new Error('no membership');
    const code = hosted.body.membership.roomCode;
    const joined = await handleCoopRequest({ action: 'join', roomCode: code, name: 'Bo', heroId: 'seo-jiwon' }, environment);
    expect(joined.status).toBe(200);
    const twin = await handleCoopRequest({ action: 'join', roomCode: code, name: 'Cy', heroId: 'seo-jiwon' }, environment);
    expect(twin.status).toBe(200);
    const synced = await handleCoopRequest({ action: 'sync', membership: hosted.body.membership, baseRevision: 0, input: { ...emptyCoopInput(), sequence: 1, moveX: 1 } }, environment);
    expect(synced.status).toBe(200);
    if (!synced.body.ok || !('snapshot' in synced.body)) throw new Error('no snapshot');
    expect(synced.body.snapshot.players).toHaveLength(3);
    const bad = await handleCoopRequest({ action: 'sync', membership: { ...hosted.body.membership, playerToken: 'nope' }, baseRevision: 0, input: emptyCoopInput() }, environment);
    expect(bad.status).toBe(401);
  });
});

describe('co-op room: gathering in the Pavilion', () => {
  it('waits in the Pavilion, shares where everyone stands and lets heroes change', () => {
    const room = createCoopRoom('ABC234', 42, player('host'), 1000);
    joinCoopRoom(room, player('guest'), 1000);
    expect(room.phase).toBe('gathering');
    press(room, 1, { moveX: 1, hall: { x: 300, y: 400, facing: 'E', moving: true }, heroId: 'tsukishiro-rei' }, 1100);
    const before = { x: room.players[1].x, y: room.players[1].y };
    run(room, 1100, 2000);
    const snapshot = roomSnapshot(room, 2000);
    expect(snapshot.phase).toBe('gathering');
    expect(snapshot.hostId).toBe('host');
    expect(snapshot.players[1].hall).toEqual({ x: 300, y: 400, facing: 'E', moving: true });
    expect(snapshot.players[1].heroId).toBe('tsukishiro-rei');
    expect(snapshot.players[1].maxHealth).toBe(8);
    // No dungeon simulation runs while the party gathers.
    expect({ x: room.players[1].x, y: room.players[1].y }).toEqual(before);
  });

  it('starts only when the party leader walks into the gate', () => {
    const room = createCoopRoom('ABC234', 42, player('host'), 1000);
    joinCoopRoom(room, player('guest'), 1000);
    press(room, 1, { startSerial: 1 }, 1100);
    run(room, 1100, 1300);
    expect(room.phase).toBe('gathering');
    press(room, 0, { startSerial: 1 }, 1400);
    run(room, 1400, 1500);
    expect(room.phase).toBe('expedition');
    expect(room.expedition).toBe(1);
    expect(room.seed).toBe(42);
    expect(currentDungeon(room).rooms.find((candidate) => candidate.id === room.roomId)?.kind).toBe('start');
  });

  it('hands the gate to another wanderer when the leader leaves or goes quiet', async () => {
    const quiet = createCoopRoom('ABC234', 42, player('host'), 1000);
    joinCoopRoom(quiet, player('guest'), 1000);
    for (let time = 1000; time <= 15000; time += 500) { press(quiet, 1, {}, time); advanceCoopRoom(quiet, time); }
    expect(quiet.hostId).toBe('guest');

    let id = 0;
    const environment = { store: memoryRoomStore(), now: () => 1000, randomUint32: () => 99, randomId: () => `id-${id++}` };
    const hosted = await handleCoopRequest({ action: 'host', name: 'Ann', heroId: 'li-yunfeng' }, environment);
    if (!hosted.body.ok || !('membership' in hosted.body)) throw new Error('no membership');
    const joined = await handleCoopRequest({ action: 'join', roomCode: hosted.body.membership.roomCode, name: 'Bo', heroId: 'li-yunfeng' }, environment);
    if (!joined.body.ok || !('membership' in joined.body)) throw new Error('no membership');
    await handleCoopRequest({ action: 'leave', membership: hosted.body.membership }, environment);
    const synced = await handleCoopRequest({ action: 'sync', membership: joined.body.membership, baseRevision: 0, input: { ...emptyCoopInput(), sequence: 1 } }, environment);
    if (!synced.body.ok || !('snapshot' in synced.body)) throw new Error('no snapshot');
    expect(synced.body.snapshot.hostId).toBe(joined.body.membership.playerId);
  });

  it('starts a fresh run with a new floor after an expedition ends, without replaying old loot', () => {
    const room = startedRoom('ABC234', 42, player('host'), 1000);
    press(room, 0, { healTotal: 6, maxHealthTotal: 2 }, 1100);
    room.completed = true;
    room.failed = true;
    run(room, 1100, 1300);
    expect(room.phase).toBe('expedition');
    press(room, 0, { startSerial: 2 }, 1400);
    run(room, 1400, 1500);
    expect(room.expedition).toBe(2);
    expect(room.completed).toBe(false);
    expect(room.seed).not.toBe(42);
    expect(room.players[0].maxHealth).toBe(7);
    expect(room.players[0].health).toBe(7);
    // The same totals re-sent change nothing; only new loot counts.
    press(room, 0, { healTotal: 6, maxHealthTotal: 2 }, 1600);
    expect(room.players[0].maxHealth).toBe(7);
    press(room, 0, { maxHealthTotal: 3 }, 1700);
    expect(room.players[0].maxHealth).toBe(8);
  });
});
