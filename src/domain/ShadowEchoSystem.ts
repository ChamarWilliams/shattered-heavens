export interface ShadowEchoConfig {
  readonly distance: number;
  readonly delayMs: number;
  readonly durationMs: number;
  readonly damage: number;
  readonly collisionRadius: number;
}

export interface ShadowEchoSnapshot {
  readonly active: boolean;
  readonly phase: 'waiting' | 'striking';
  readonly x: number;
  readonly y: number;
  readonly startX: number;
  readonly startY: number;
  readonly angleRadians: number;
  readonly progress: number;
}

interface MutableShadowEcho {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  angleRadians: number;
  elapsedMs: number;
}

export class ShadowEchoSystem {
  private state?: MutableShadowEcho;

  constructor(private readonly config: ShadowEchoConfig) {}

  start(origin: { readonly x: number; readonly y: number }, angleRadians: number): ShadowEchoSnapshot {
    this.state = {
      startX: origin.x,
      startY: origin.y,
      endX: origin.x + Math.cos(angleRadians) * this.config.distance,
      endY: origin.y + Math.sin(angleRadians) * this.config.distance,
      angleRadians,
      elapsedMs: 0,
    };
    return this.snapshot(true);
  }

  update(deltaMs: number): ShadowEchoSnapshot | undefined {
    if (!this.state) return undefined;
    this.state.elapsedMs += Math.max(0, deltaMs);
    const finished = this.state.elapsedMs >= this.config.delayMs + this.config.durationMs;
    const snapshot = this.snapshot(!finished);
    if (finished) this.state = undefined;
    return snapshot;
  }

  clear(): void { this.state = undefined; }

  private snapshot(active: boolean): ShadowEchoSnapshot {
    const state = this.state!;
    const phase = state.elapsedMs < this.config.delayMs ? 'waiting' : 'striking';
    const rawProgress = phase === 'waiting' ? 0 : (state.elapsedMs - this.config.delayMs) / this.config.durationMs;
    const progress = Math.min(1, Math.max(0, rawProgress));
    const eased = 1 - Math.pow(1 - progress, 2);
    return {
      active,
      phase,
      x: state.startX + (state.endX - state.startX) * eased,
      y: state.startY + (state.endY - state.startY) * eased,
      startX: state.startX,
      startY: state.startY,
      angleRadians: state.angleRadians,
      progress,
    };
  }
}
