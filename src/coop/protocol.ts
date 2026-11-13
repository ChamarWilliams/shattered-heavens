import type { DungeonThemeId } from '../dungeon';
import type { EliteAffix } from '../domain/elites';

/** Version 4: each screen detects hits (its hero's attacks and the enemy attacks it is struck by) and reports them. */
export const COOP_SCHEMA_VERSION = 4 as const;
export const COOP_API_PATH = '/.netlify/functions/game';
/** Parties hold up to three wanderers; any hero may be played more than once. */
export const COOP_MAX_PLAYERS = 3;

export type CoopHeroId = 'li-yunfeng' | 'seo-jiwon' | 'tsukishiro-rei';
export type CoopActionState = 'idle' | 'move' | 'attack' | 'ability' | 'downed';
export type CoopSide = 'N' | 'E' | 'S' | 'W';
/** The party gathers in the Pavilion until the leader leads it through the gate. */
export type CoopPhase = 'gathering' | 'expedition';
export type CoopFacing = 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW';
/** Where a wanderer stands in the Wayfarers' Pavilion. */
export interface CoopHallPresence { readonly x: number; readonly y: number; readonly facing: CoopFacing; readonly moving: boolean }

/** A hit this player's attacks landed on an enemy, numbered so a resent one is applied once. */
export interface CoopHit { readonly seq: number; readonly enemyId: string; readonly damage: number }
export type CoopAttackKind = 'basic' | 'special' | 'signature' | 'charge';

export interface CoopInput {
  readonly sequence: number;
  readonly moveX: number;
  readonly moveY: number;
  readonly aimRadians: number;
  readonly attackSerial: number;
  readonly abilitySerial: number;
  /** Walking into the echo (portal) after a warden falls. */
  readonly interact: boolean;
  /** Held beside a downed ally to revive them. */
  readonly revive: boolean;
  /** Counts presses of Use (F / USE): a press beside the Bell of Trials rings it. A counter, so no press is lost between syncs. */
  readonly useSerial: number;
  /** The player's damage multiplier from relics, Stages and power gained (clamped by the server). */
  readonly power: number;
  /** The player's movement multiplier (clamped by the server). */
  readonly speed: number;
  /** Running totals of hearts restored and max hearts gained or lost from personal loot, shops and the altar. */
  readonly healTotal: number;
  readonly maxHealthTotal: number;
  /** Running total of hearts this player's screen says enemy attacks took. */
  readonly hurtTotal: number;
  /** Hits not yet acknowledged by the server. */
  readonly hits?: readonly CoopHit[];
  /** Counts the party leader's presses at the Realm Gate: starts the expedition. */
  readonly startSerial: number;
  /** Position in the Pavilion while the party gathers. */
  readonly hall?: CoopHallPresence;
  /** The hero picked in the Pavilion (it may change until the expedition starts). */
  readonly heroId?: CoopHeroId;
}

export interface CoopPlayerSnapshot {
  readonly id: string;
  readonly name: string;
  readonly heroId: CoopHeroId;
  readonly x: number;
  readonly y: number;
  readonly aimRadians: number;
  readonly health: number;
  readonly maxHealth: number;
  readonly downed: boolean;
  readonly reviveProgressMs: number;
  readonly damageDealt: number;
  readonly action: CoopActionState;
  readonly acknowledgedInput: number;
  readonly connected: boolean;
  readonly hall?: CoopHallPresence;
  /** The last hit (CoopHit.seq) the server has applied for this player. */
  readonly lastHitSeq: number;
  /** Totals the server has applied for this player (a reconnecting screen resumes from these). */
  readonly loot: { readonly heal: number; readonly maxHealth: number; readonly hurt: number };
}

export type CoopEnemyRole = 'hunter' | 'shooter' | 'sentinel' | 'protector' | 'boss';

export interface CoopZone { readonly x: number; readonly y: number; readonly radius: number }

export interface CoopEnemySnapshot {
  readonly id: string;
  readonly role: CoopEnemyRole;
  readonly x: number;
  readonly y: number;
  readonly health: number;
  readonly maxHealth: number;
  readonly targetPlayerId?: string;
  readonly attackPhase: 'idle' | 'windup' | 'active' | 'recovery';
  /** The enemy's latest attack: every screen plays it, aimed this way, and checks only its own hero. */
  readonly attack?: { readonly seq: number; readonly kind: CoopAttackKind; readonly angle: number };
  readonly elite?: EliteAffix;
  readonly ward?: number;
  readonly wardMax?: number;
  /** Wardens: the second form has begun. Protectors: enraged at half health. */
  readonly phaseTwo?: boolean;
  /** Immune while changing form. */
  readonly shielded?: boolean;
  /** Smaller copies a Sundering elite split into. */
  readonly small?: boolean;
}

export interface CoopBurn { readonly x: number; readonly y: number; readonly armed: boolean }

export interface CoopTrialState {
  readonly state: 'idle' | 'running' | 'done';
  readonly wave: number;
  readonly waves: number;
}

export interface CoopRoomSnapshot {
  readonly schemaVersion: typeof COOP_SCHEMA_VERSION;
  readonly roomCode: string;
  readonly revision: number;
  readonly serverTime: number;
  readonly seed: number;
  readonly themeOrder: readonly DungeonThemeId[];
  readonly themeIndex: number;
  readonly phase: CoopPhase;
  /** The party leader: only they can lead the party through the Realm Gate. */
  readonly hostId: string;
  /** Counts expeditions started in this room (a new one begins after a run ends). */
  readonly expedition: number;
  /** The generated room the party stands in (an id from generateDungeon), and the side they came in by. */
  readonly roomId: string;
  readonly entrySide: CoopSide;
  /** Rooms sealed on this floor. */
  readonly cleared: readonly string[];
  readonly roomCleared: boolean;
  /** Milliseconds since the party entered the room: drives trap cycles on every screen. */
  readonly roomClockMs: number;
  /** Per trap (layout order): pit state 0 intact, 1 crumbling, 2 open; -1 for spikes and vents. */
  readonly pits: readonly number[];
  /** Indices (layout order) of urns that have been broken. */
  readonly brokenUrns: readonly number[];
  readonly burns: readonly CoopBurn[];
  readonly trial?: CoopTrialState;
  /** The echo (portal) is open in the warden's room. */
  readonly portalOpen: boolean;
  readonly completed: boolean;
  /** Every wanderer fell. */
  readonly failed: boolean;
  readonly objective: string;
  readonly players: readonly CoopPlayerSnapshot[];
  readonly enemies: readonly CoopEnemySnapshot[];
}

export interface CoopMembership {
  readonly roomCode: string;
  readonly playerId: string;
  readonly playerToken: string;
}

export type CoopRequest =
  | { readonly action: 'host'; readonly name: string; readonly heroId: CoopHeroId }
  | { readonly action: 'join'; readonly roomCode: string; readonly name: string; readonly heroId: CoopHeroId }
  | { readonly action: 'sync'; readonly membership: CoopMembership; readonly baseRevision: number; readonly input: CoopInput }
  | { readonly action: 'leave'; readonly membership: CoopMembership };

export type CoopResponse =
  | { readonly ok: true; readonly membership: CoopMembership; readonly snapshot: CoopRoomSnapshot }
  | { readonly ok: true; readonly snapshot: CoopRoomSnapshot }
  | { readonly ok: true; readonly left: true }
  | { readonly ok: false; readonly code: string; readonly message: string; readonly retryable?: boolean };

export const emptyCoopInput = (): CoopInput => ({
  sequence: 0,
  moveX: 0,
  moveY: 0,
  aimRadians: 0,
  attackSerial: 0,
  abilitySerial: 0,
  interact: false,
  revive: false,
  useSerial: 0,
  power: 1,
  speed: 1,
  healTotal: 0,
  maxHealthTotal: 0,
  hurtTotal: 0,
  startSerial: 0,
});

export function normalizeRoomCode(value: string): string {
  return value.toUpperCase().replace(/[^A-Z2-9]/g, '').slice(0, 6);
}
