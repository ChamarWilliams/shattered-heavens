export interface ShadowDashConfig {
  readonly distance: number;
  readonly durationMs: number;
  readonly damage: number;
  readonly collisionRadius: number;
}

export interface ShadowDashSnapshot {
  readonly active: boolean;
  readonly x: number;
  readonly y: number;
  readonly angleRadians: number;
  readonly progress: number;
}

export class ShadowDashSystem {
  private state?: {
    startX: number;
    startY: number;
    endX: number;
    endY: number;
    angleRadians: number;
    elapsedMs: number;
  };

  constructor(private readonly config: ShadowDashConfig) {}

  start(origin: { x: number; y: number }, angleRadians: number): ShadowDashSnapshot {
    this.state = {
      startX: origin.x,
      startY: origin.y,
      endX: origin.x + Math.cos(angleRadians) * this.config.distance,
      endY: origin.y + Math.sin(angleRadians) * this.config.distance,
      angleRadians,
      elapsedMs: 0,
    };
    return this.snapshot()!;
  }

  update(deltaMs: number): ShadowDashSnapshot | undefined {
    if (!this.state) return undefined;
    this.state.elapsedMs = Math.min(this.config.durationMs, this.state.elapsedMs + Math.max(0, deltaMs));
    const snapshot = this.snapshot();
    if (this.state.elapsedMs >= this.config.durationMs) this.state = undefined;
    return snapshot;
  }

  clear(): void { this.state = undefined; }

  private snapshot(): ShadowDashSnapshot | undefined {
    if (!this.state) return undefined;
    const progress = Math.min(1, this.state.elapsedMs / this.config.durationMs);
    const eased = 1 - Math.pow(1 - progress, 3);
    return {
      active: progress < 1,
      x: this.state.startX + (this.state.endX - this.state.startX) * eased,
      y: this.state.startY + (this.state.endY - this.state.startY) * eased,
      angleRadians: this.state.angleRadians,
      progress,
    };
  }
}
