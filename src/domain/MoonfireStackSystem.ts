export interface MoonfireStackConfig {
  readonly maxStacks: number;
  readonly stackDurationMs: number;
  readonly movementSpeedPctPerStack: number;
  readonly basicDamagePerStack: number;
  readonly summonDurationPerStackMs: number;
  readonly summonAttackSpeedPctPerStack: number;
}

export interface MoonfireStackSnapshot {
  readonly stacks: number;
  readonly remainingMs: number;
  readonly movementSpeedMultiplier: number;
  readonly basicDamageBonus: number;
}

export interface MoonfireEmpowerment {
  readonly stacks: number;
  readonly durationBonusMs: number;
  readonly attackIntervalMultiplier: number;
}

export class MoonfireStackSystem {
  private stacks = 0;
  private remainingMs = 0;

  constructor(private readonly config: MoonfireStackConfig) {}

  gain(amount = 1): MoonfireStackSnapshot {
    this.stacks = Math.min(this.config.maxStacks, this.stacks + Math.max(0, Math.floor(amount)));
    if (this.stacks > 0) this.remainingMs = this.config.stackDurationMs;
    return this.snapshot();
  }

  update(deltaMs: number): MoonfireStackSnapshot {
    if (this.stacks === 0) return this.snapshot();
    this.remainingMs = Math.max(0, this.remainingMs - Math.max(0, deltaMs));
    if (this.remainingMs === 0) this.stacks = 0;
    return this.snapshot();
  }

  consumeForSummon(): MoonfireEmpowerment {
    const stacks = this.stacks;
    this.clear();
    return {
      stacks,
      durationBonusMs: stacks * this.config.summonDurationPerStackMs,
      attackIntervalMultiplier: Math.max(0.5, 1 - stacks * this.config.summonAttackSpeedPctPerStack),
    };
  }

  snapshot(): MoonfireStackSnapshot {
    return {
      stacks: this.stacks,
      remainingMs: this.remainingMs,
      movementSpeedMultiplier: 1 + this.stacks * this.config.movementSpeedPctPerStack,
      basicDamageBonus: this.stacks * this.config.basicDamagePerStack,
    };
  }

  clear(): void {
    this.stacks = 0;
    this.remainingMs = 0;
  }
}
