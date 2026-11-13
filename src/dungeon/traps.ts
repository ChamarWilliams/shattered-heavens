/**
 * Trap rules shared by the game (game/TrapSystem.ts draws and runs them) and
 * the co-op server (coop/simulation.ts applies their damage), so both agree on
 * where every trap is and when it is dangerous.
 */
import type { SeededRandom } from '../domain/SeededRandom';

export type TrapKind = 'spikes' | 'vent' | 'pit';

/** Cycle timings (ms). Every trap telegraphs before it hurts. */
export const SPIKES = { down: 1500, warn: 520, up: 650, sink: 200 } as const;
export const VENT = { idle: 1700, warn: 650, fire: 760, cool: 320 } as const;
export const PIT = { crumble: 480, open: 2600 } as const;

export const cycleLength = (kind: 'spikes' | 'vent'): number =>
  kind === 'spikes' ? SPIKES.down + SPIKES.warn + SPIKES.up + SPIKES.sink : VENT.idle + VENT.warn + VENT.fire + VENT.cool;

/** Where a spike plate or fire vent is in its cycle at a given clock. */
export function trapPhase(kind: 'spikes' | 'vent', clock: number): 'idle' | 'warn' | 'danger' | 'cooling' {
  const t = ((clock % cycleLength(kind)) + cycleLength(kind)) % cycleLength(kind);
  if (kind === 'spikes') {
    if (t < SPIKES.down) return 'idle';
    if (t < SPIKES.down + SPIKES.warn) return 'warn';
    if (t < SPIKES.down + SPIKES.warn + SPIKES.up) return 'danger';
    return 'cooling';
  }
  if (t < VENT.idle) return 'idle';
  if (t < VENT.idle + VENT.warn) return 'warn';
  if (t < VENT.idle + VENT.warn + VENT.fire) return 'danger';
  return 'cooling';
}

export interface TrapGrid {
  readonly originX: number;
  readonly originY: number;
  readonly tile: number;
  readonly columns: number;
  readonly rows: number;
}

export interface TrapPlacement {
  readonly kind: TrapKind;
  readonly column: number;
  readonly row: number;
  readonly x: number;
  readonly y: number;
  /** Starting point in the cycle, so neighbouring traps fire at different times. */
  readonly clock: number;
}

/**
 * Lays traps out on whole tiles, away from door lanes, the centre where chests
 * land, any tile in `occupied` (cover) and any point in `keepClear`.
 */
export function trapLayout(
  random: SeededRandom,
  count: number,
  grid: TrapGrid,
  scale: number,
  keepClear: readonly { x: number; y: number }[],
  occupied: ReadonlySet<string> = new Set(),
): TrapPlacement[] {
  const centerColumn = Math.floor(grid.columns / 2);
  const centerRow = Math.floor(grid.rows / 2);
  const candidates: { column: number; row: number }[] = [];
  for (let row = 4; row < grid.rows - 4; row += 1) {
    for (let column = 4; column < grid.columns - 4; column += 1) {
      if (Math.abs(column - centerColumn) <= 1 || Math.abs(row - centerRow) <= 0 || occupied.has(`${column},${row}`)) continue;
      candidates.push({ column, row });
    }
  }
  const kinds: TrapKind[] = ['spikes', 'vent', 'pit'];
  const placements: TrapPlacement[] = [];
  for (let index = 0; index < count && candidates.length > 0; index += 1) {
    const { column, row } = candidates.splice(random.integer(0, candidates.length - 1), 1)[0];
    const x = grid.originX + (column + 0.5) * grid.tile;
    const y = grid.originY + (row + 0.5) * grid.tile;
    if (keepClear.some((point) => Math.hypot(point.x - x, point.y - y) < 90 * scale)) continue;
    const kind = kinds[random.integer(0, kinds.length - 1)];
    placements.push({ kind, column, row, x, y, clock: random.integer(0, 2400) });
  }
  return placements;
}

/** The trap radius for a tile size. A hero's feet within it are on the trap. */
export const trapRadius = (tile: number): number => tile * 0.42;
