export interface SectlessSealConfig {
  readonly maxStacksPerTarget: number;
  readonly durationMs: number;
  readonly recallDamagePerStack: number;
  readonly expireDamagePerStack: number;
  readonly detonationRadius: number;
}

export interface SectlessSealSnapshot {
  readonly targetId: string;
  readonly x: number;
  readonly y: number;
  readonly stacks: number;
  readonly remainingMs: number;
}

export interface SectlessDetonation {
  readonly targetId: string;
  readonly x: number;
  readonly y: number;
  readonly stacks: number;
  readonly damage: number;
  readonly radius: number;
  readonly reason: 'recalled' | 'expired';
}

interface MutableSeal {
  targetId: string;
  x: number;
  y: number;
  stacks: number;
  remainingMs: number;
}

export class SectlessSealSystem {
  private readonly seals = new Map<string, MutableSeal>();

  constructor(private readonly config: SectlessSealConfig) {}

  apply(target: { id: string; x: number; y: number }): SectlessSealSnapshot {
    const existing = this.seals.get(target.id);
    const seal: MutableSeal = existing ?? {
      targetId: target.id,
      x: target.x,
      y: target.y,
      stacks: 0,
      remainingMs: this.config.durationMs,
    };
    seal.x = target.x;
    seal.y = target.y;
    seal.stacks = Math.min(this.config.maxStacksPerTarget, seal.stacks + 1);
    seal.remainingMs = this.config.durationMs;
    this.seals.set(target.id, seal);
    return this.toSnapshot(seal);
  }

  update(deltaMs: number): readonly SectlessDetonation[] {
    const detonations: SectlessDetonation[] = [];
    for (const seal of [...this.seals.values()]) {
      seal.remainingMs -= Math.max(0, deltaMs);
      if (seal.remainingMs > 0) continue;
      detonations.push(this.createDetonation(seal, 'expired'));
      this.seals.delete(seal.targetId);
    }
    return detonations;
  }

  recall(targetId: string): SectlessDetonation | undefined {
    const seal = this.seals.get(targetId);
    if (!seal) return undefined;
    this.seals.delete(targetId);
    return this.createDetonation(seal, 'recalled');
  }

  snapshots(): readonly SectlessSealSnapshot[] {
    return [...this.seals.values()].map((seal) => this.toSnapshot(seal));
  }

  clear(): void { this.seals.clear(); }

  private createDetonation(seal: MutableSeal, reason: SectlessDetonation['reason']): SectlessDetonation {
    const damagePerStack = reason === 'recalled' ? this.config.recallDamagePerStack : this.config.expireDamagePerStack;
    return {
      targetId: seal.targetId,
      x: seal.x,
      y: seal.y,
      stacks: seal.stacks,
      damage: seal.stacks * damagePerStack,
      radius: this.config.detonationRadius,
      reason,
    };
  }

  private toSnapshot(seal: MutableSeal): SectlessSealSnapshot {
    return { ...seal };
  }
}
