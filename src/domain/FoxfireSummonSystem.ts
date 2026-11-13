export interface FoxfireSummonConfig {
  readonly count: number;
  readonly durationMs: number;
  readonly orbitRadius: number;
  readonly orbitSpeedRadiansPerSecond: number;
  readonly attackIntervalMs: number;
  readonly acquisitionRange: number;
}

export interface FoxfireSummonCommand {
  readonly castId: string;
  readonly ownerId: string;
  readonly owner: { readonly x: number; readonly y: number };
  readonly bounds?: FoxfireBounds;
  readonly empowerment?: {
    readonly stacks: number;
    readonly durationBonusMs: number;
    readonly attackIntervalMultiplier: number;
  };
}

export interface FoxfireBounds {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

export interface FoxfireTarget {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly health: number;
}

export interface FoxfireFamiliarSnapshot {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly remainingMs: number;
  readonly facingAngleRadians: number;
  readonly state: 'idle' | 'move' | 'attack';
  readonly stateElapsedMs: number;
  readonly empowermentStacks: number;
}

export interface FoxfireAttack {
  readonly shotId: string;
  readonly familiarId: string;
  readonly targetId: string;
  readonly origin: { readonly x: number; readonly y: number };
  readonly aimRadians: number;
}

interface MutableFamiliar {
  id: string;
  angleRadians: number;
  x: number;
  y: number;
  remainingMs: number;
  attackRemainingMs: number;
  shotSequence: number;
  facingAngleRadians: number;
  attackAnimationRemainingMs: number;
  state: FoxfireFamiliarSnapshot['state'];
  stateElapsedMs: number;
  attackIntervalMs: number;
  empowermentStacks: number;
}

export class FoxfireSummonSystem {
  private readonly familiars = new Map<string, MutableFamiliar>();

  constructor(private readonly config: FoxfireSummonConfig) {}

  summon(command: FoxfireSummonCommand): readonly FoxfireFamiliarSnapshot[] {
    this.clear();
    for (let index = 0; index < this.config.count; index++) {
      const angleRadians = index * Math.PI * 2 / this.config.count;
      const x = command.owner.x + Math.cos(angleRadians) * this.config.orbitRadius;
      const y = command.owner.y + Math.sin(angleRadians) * this.config.orbitRadius * 0.58;
      const familiar: MutableFamiliar = {
        id: `${command.castId}:familiar:${index}`,
        angleRadians,
        x: this.constrain(x, command.bounds?.left, command.bounds?.right),
        y: this.constrain(y, command.bounds?.top, command.bounds?.bottom),
        remainingMs: this.config.durationMs + (command.empowerment?.durationBonusMs ?? 0),
        attackRemainingMs: 220 + index * 150,
        shotSequence: 0,
        facingAngleRadians: angleRadians + Math.PI / 2,
        attackAnimationRemainingMs: 0,
        state: 'idle',
        stateElapsedMs: 0,
        attackIntervalMs: this.config.attackIntervalMs * (command.empowerment?.attackIntervalMultiplier ?? 1),
        empowermentStacks: command.empowerment?.stacks ?? 0,
      };
      this.familiars.set(familiar.id, familiar);
    }
    return this.snapshots();
  }

  update(
    deltaMs: number,
    owner: { readonly x: number; readonly y: number },
    targets: readonly FoxfireTarget[],
    bounds?: FoxfireBounds,
  ): readonly FoxfireAttack[] {
    const attacks: FoxfireAttack[] = [];
    const safeDeltaMs = Math.max(0, deltaMs);
    const seconds = safeDeltaMs / 1000;
    for (const familiar of [...this.familiars.values()]) {
      familiar.remainingMs -= safeDeltaMs;
      if (familiar.remainingMs <= 0) {
        this.familiars.delete(familiar.id);
        continue;
      }
      familiar.angleRadians += this.config.orbitSpeedRadiansPerSecond * seconds;
      const previousX = familiar.x;
      const previousY = familiar.y;
      const targetX = this.constrain(owner.x + Math.cos(familiar.angleRadians) * this.config.orbitRadius, bounds?.left, bounds?.right);
      const targetY = this.constrain(owner.y + Math.sin(familiar.angleRadians) * this.config.orbitRadius * 0.58, bounds?.top, bounds?.bottom);
      const followBlend = 1 - Math.exp(-10 * seconds);
      familiar.x += (targetX - familiar.x) * followBlend;
      familiar.y += (targetY - familiar.y) * followBlend;
      const travelX = familiar.x - previousX;
      const travelY = familiar.y - previousY;
      familiar.attackAnimationRemainingMs = Math.max(0, familiar.attackAnimationRemainingMs - safeDeltaMs);
      familiar.attackRemainingMs -= safeDeltaMs;
      if (familiar.attackRemainingMs <= 0) {
        const target = this.nearestTarget(familiar, targets);
        if (target) {
          familiar.shotSequence += 1;
          familiar.attackRemainingMs += familiar.attackIntervalMs;
          familiar.facingAngleRadians = Math.atan2(target.y - familiar.y, target.x - familiar.x);
          familiar.attackAnimationRemainingMs = 360;
          attacks.push({
            shotId: `${familiar.id}:shot:${familiar.shotSequence}`,
            familiarId: familiar.id,
            targetId: target.id,
            origin: { x: familiar.x, y: familiar.y },
            aimRadians: familiar.facingAngleRadians,
          });
        }
      }
      const nextState: FoxfireFamiliarSnapshot['state'] = familiar.attackAnimationRemainingMs > 0
        ? 'attack'
        : travelX * travelX + travelY * travelY > 0.04 ? 'move' : 'idle';
      if (nextState === familiar.state) familiar.stateElapsedMs += safeDeltaMs;
      else {
        familiar.state = nextState;
        familiar.stateElapsedMs = 0;
      }
      if (nextState !== 'attack' && travelX * travelX + travelY * travelY > 0.04) {
        familiar.facingAngleRadians = Math.atan2(travelY, travelX);
      }
    }
    return attacks;
  }

  snapshots(): readonly FoxfireFamiliarSnapshot[] {
    return [...this.familiars.values()].map(({ id, x, y, remainingMs, facingAngleRadians, state, stateElapsedMs, empowermentStacks }) => ({
      id,
      x,
      y,
      remainingMs,
      facingAngleRadians,
      state,
      stateElapsedMs,
      empowermentStacks,
    }));
  }

  clear(): void { this.familiars.clear(); }

  private constrain(value: number, minimum: number | undefined, maximum: number | undefined): number {
    if (minimum === undefined || maximum === undefined) return value;
    return Math.min(maximum, Math.max(minimum, value));
  }

  private nearestTarget(familiar: MutableFamiliar, targets: readonly FoxfireTarget[]): FoxfireTarget | undefined {
    let nearest: FoxfireTarget | undefined;
    let nearestDistanceSquared = this.config.acquisitionRange * this.config.acquisitionRange;
    for (const target of targets) {
      if (target.health <= 0) continue;
      const dx = target.x - familiar.x;
      const dy = target.y - familiar.y;
      const distanceSquared = dx * dx + dy * dy;
      if (distanceSquared > nearestDistanceSquared) continue;
      nearest = target;
      nearestDistanceSquared = distanceSquared;
    }
    return nearest;
  }
}
