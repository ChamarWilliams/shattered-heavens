import {
  COOP_API_PATH,
  emptyCoopInput,
  type CoopHallPresence,
  type CoopHit,
  type CoopHeroId,
  type CoopInput,
  type CoopMembership,
  type CoopPlayerSnapshot,
  type CoopRequest,
  type CoopResponse,
  type CoopRoomSnapshot,
} from './protocol';

const POLL_MS = 140;
const SESSION_KEY = 'echoes.coopMembership';

export type CoopConnectionState = 'offline' | 'connecting' | 'connected' | 'reconnecting' | 'error';

export class CoopClient {
  private membership?: CoopMembership;
  private snapshot?: CoopRoomSnapshot;
  private previousSnapshot?: CoopRoomSnapshot;
  private input: CoopInput = emptyCoopInput();
  /** Hits this screen saw land that the server has not acknowledged yet (resent until it does). */
  private pendingHits: CoopHit[] = [];
  private hitSeq = 0;
  private pollTimer?: number;
  private polling = false;
  private stopped = true;
  private backoffMs = POLL_MS;
  private receivedAt = 0;
  private readonly snapshotListeners = new Set<(snapshot: CoopRoomSnapshot) => void>();
  private readonly stateListeners = new Set<(state: CoopConnectionState, message?: string) => void>();

  get currentSnapshot(): CoopRoomSnapshot | undefined { return this.snapshot; }
  get currentMembership(): CoopMembership | undefined { return this.membership; }
  get connected(): boolean { return Boolean(this.membership && !this.stopped); }

  async host(name: string, heroId: CoopHeroId): Promise<CoopRoomSnapshot> {
    this.emitState('connecting');
    const result = await this.request({ action: 'host', name, heroId });
    if (!result.ok || !('membership' in result)) throw new Error(result.ok ? 'Room membership was missing.' : result.message);
    this.acceptMembership(result.membership, result.snapshot);
    return result.snapshot;
  }

  async join(roomCode: string, name: string, heroId: CoopHeroId): Promise<CoopRoomSnapshot> {
    this.emitState('connecting');
    const result = await this.request({ action: 'join', roomCode, name, heroId });
    if (!result.ok || !('membership' in result)) throw new Error(result.ok ? 'Room membership was missing.' : result.message);
    this.acceptMembership(result.membership, result.snapshot);
    return result.snapshot;
  }

  async reconnect(): Promise<boolean> {
    let membership: CoopMembership | undefined;
    try {
      const value = sessionStorage.getItem(SESSION_KEY);
      if (value) membership = JSON.parse(value) as CoopMembership;
    } catch { /* Session storage is optional. */ }
    if (!membership) return false;
    this.membership = membership;
    this.stopped = false;
    this.emitState('reconnecting');
    try {
      await this.sync();
      this.schedule(0);
      return true;
    } catch {
      this.clearMembership();
      return false;
    }
  }

  async leave(): Promise<void> {
    const membership = this.membership;
    this.stopPolling();
    this.clearMembership();
    if (!membership) return;
    try { await this.request({ action: 'leave', membership }); } catch { /* Best effort. */ }
  }

  updateInput(
    moveX: number, moveY: number, aimRadians: number, revive = false, interact = false,
    extras: Partial<Pick<CoopInput, 'power' | 'speed' | 'healTotal' | 'maxHealthTotal' | 'hurtTotal'>> = {},
  ): void {
    this.input = { ...this.input, ...extras, sequence: this.input.sequence + 1, moveX, moveY, aimRadians, revive, interact };
  }

  attack(): void {
    this.input = { ...this.input, sequence: this.input.sequence + 1, attackSerial: this.input.attackSerial + 1 };
  }

  /** A hit this screen saw land on an enemy: the server applies it once. */
  hit(enemyId: string, damage: number): void {
    this.hitSeq += 1;
    this.pendingHits.push({ seq: this.hitSeq, enemyId, damage: Math.max(0, Math.round(damage)) });
    if (this.pendingHits.length > 64) this.pendingHits.splice(0, this.pendingHits.length - 64);
  }

  /** Damage this screen has dealt to an enemy that the server has not counted yet (for predicted health bars). */
  pendingDamage(enemyId: string): number {
    let total = 0;
    for (const hit of this.pendingHits) if (hit.enemyId === enemyId) total += hit.damage;
    return total;
  }

  /** A press of Use (F / USE): the server rings the Bell if this player is beside it. */
  use(): void {
    this.input = { ...this.input, sequence: this.input.sequence + 1, useSerial: this.input.useSerial + 1 };
  }

  /** The party leader walks into the Realm Gate: the server starts the expedition for everyone. */
  start(): void {
    this.input = { ...this.input, sequence: this.input.sequence + 1, startSerial: this.input.startSerial + 1 };
  }

  /** Where this player stands in the Pavilion, and the hero they have picked. */
  updateHall(hall: CoopHallPresence, heroId: CoopHeroId): void {
    const previous = this.input.hall;
    if (previous && previous.x === hall.x && previous.y === hall.y && previous.facing === hall.facing && previous.moving === hall.moving && this.input.heroId === heroId) return;
    this.input = { ...this.input, sequence: this.input.sequence + 1, hall, heroId };
  }

  ability(): void {
    this.input = { ...this.input, sequence: this.input.sequence + 1, abilitySerial: this.input.abilitySerial + 1 };
  }

  onSnapshot(listener: (snapshot: CoopRoomSnapshot) => void): () => void {
    this.snapshotListeners.add(listener);
    if (this.snapshot) listener(this.snapshot);
    return () => this.snapshotListeners.delete(listener);
  }

  onState(listener: (state: CoopConnectionState, message?: string) => void): () => void {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  samplePlayer(playerId: string, now = performance.now()): CoopPlayerSnapshot | undefined {
    const current = this.snapshot?.players.find((player) => player.id === playerId);
    if (!current) return undefined;
    const previous = this.previousSnapshot?.players.find((player) => player.id === playerId);
    if (!previous) return current;
    const t = Math.min(1, Math.max(0, (now - this.receivedAt) / POLL_MS));
    return { ...current, x: previous.x + (current.x - previous.x) * t, y: previous.y + (current.y - previous.y) * t };
  }

  private acceptMembership(membership: CoopMembership, snapshot: CoopRoomSnapshot): void {
    this.membership = membership;
    this.stopped = false;
    this.acceptSnapshot(snapshot);
    try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(membership)); } catch { /* Optional. */ }
    this.emitState('connected');
    this.schedule(POLL_MS);
  }

  private async sync(): Promise<void> {
    if (!this.membership) return;
    const input = this.pendingHits.length > 0 ? { ...this.input, hits: this.pendingHits.slice(0, 64) } : this.input;
    const result = await this.request({ action: 'sync', membership: this.membership, baseRevision: this.snapshot?.revision ?? 0, input });
    if (!result.ok || !('snapshot' in result)) throw new Error(result.ok ? 'Snapshot missing.' : result.message);
    this.acceptSnapshot(result.snapshot);
    this.backoffMs = POLL_MS;
    this.emitState('connected');
  }

  private schedule(delay: number): void {
    if (this.stopped) return;
    if (this.pollTimer !== undefined) window.clearTimeout(this.pollTimer);
    this.pollTimer = window.setTimeout(() => void this.poll(), delay);
  }

  private async poll(): Promise<void> {
    if (this.polling || this.stopped) return;
    this.polling = true;
    try {
      await this.sync();
      this.schedule(POLL_MS);
    } catch (error) {
      this.emitState('reconnecting', error instanceof Error ? error.message : 'Connection interrupted.');
      this.backoffMs = Math.min(2400, Math.max(POLL_MS, this.backoffMs * 1.7));
      this.schedule(this.backoffMs);
    } finally {
      this.polling = false;
    }
  }

  private stopPolling(): void {
    this.stopped = true;
    if (this.pollTimer !== undefined) window.clearTimeout(this.pollTimer);
    this.pollTimer = undefined;
  }

  private clearMembership(): void {
    this.membership = undefined;
    this.snapshot = undefined;
    this.previousSnapshot = undefined;
    try { sessionStorage.removeItem(SESSION_KEY); } catch { /* Optional. */ }
    this.emitState('offline');
  }

  private acceptSnapshot(snapshot: CoopRoomSnapshot): void {
    if (this.snapshot && snapshot.revision < this.snapshot.revision) return;
    this.previousSnapshot = this.snapshot;
    this.snapshot = snapshot;
    // Drop hits the server has applied; after a reload, continue numbering from where it left off.
    const local = snapshot.players.find((player) => player.id === this.membership?.playerId);
    if (local) {
      this.pendingHits = this.pendingHits.filter((hit) => hit.seq > local.lastHitSeq);
      this.hitSeq = Math.max(this.hitSeq, local.lastHitSeq);
    }
    this.receivedAt = performance.now();
    for (const listener of this.snapshotListeners) listener(snapshot);
  }

  private emitState(state: CoopConnectionState, message?: string): void {
    for (const listener of this.stateListeners) listener(state, message);
  }

  private async request(payload: CoopRequest): Promise<CoopResponse> {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 7000);
    try {
      const result = await fetch(COOP_API_PATH, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      const body = await result.json() as CoopResponse;
      if (!result.ok && body.ok) throw new Error(`Room service returned ${result.status}.`);
      return body;
    } finally {
      window.clearTimeout(timeout);
    }
  }
}
