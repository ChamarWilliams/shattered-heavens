import { sweptCircleIntersectsCircle } from './collision';

export interface FlyingSwordConfig {
  readonly count: number;
  readonly spreadDegrees: readonly number[];
  readonly speed: number;
  readonly damage: number;
  readonly lifetimeMs: number;
  readonly collisionRadius: number;
}

export interface FlyingSwordCastCommand {
  readonly castId: string;
  readonly casterId: string;
  readonly origin: { readonly x: number; readonly y: number };
  readonly aimRadians: number;
}

export interface FlyingSwordSnapshot {
  readonly id: string;
  readonly castId: string;
  readonly x: number;
  readonly y: number;
  readonly angleRadians: number;
  readonly collisionRadius: number;
  readonly remainingMs: number;
}

export interface ProjectileHit {
  readonly projectileId: string;
  readonly targetId: string;
  readonly damage: number;
  readonly x: number;
  readonly y: number;
  readonly angleRadians: number;
}

interface MutableSword {
  id: string;
  castId: string;
  x: number;
  y: number;
  previousX: number;
  previousY: number;
  velocityX: number;
  velocityY: number;
  angleRadians: number;
  collisionRadius: number;
  damage: number;
  remainingMs: number;
}

export class FlyingSwordSystem {
  private readonly swords = new Map<string, MutableSword>();

  constructor(
    private readonly config: FlyingSwordConfig,
    readonly authority: 'local-prototype' | 'server' = 'local-prototype',
  ) {
    if (config.count !== config.spreadDegrees.length) {
      throw new Error('Projectile count must match the configured spread angle count.');
    }
  }

  spawn(command: FlyingSwordCastCommand): readonly FlyingSwordSnapshot[] {
    const created: FlyingSwordSnapshot[] = [];
    for (let index = 0; index < this.config.count; index++) {
      const angleRadians = command.aimRadians + this.config.spreadDegrees[index] * Math.PI / 180;
      const id = `${command.castId}:${index}`;
      const sword: MutableSword = {
        id,
        castId: command.castId,
        x: command.origin.x,
        y: command.origin.y,
        previousX: command.origin.x,
        previousY: command.origin.y,
        velocityX: Math.cos(angleRadians) * this.config.speed,
        velocityY: Math.sin(angleRadians) * this.config.speed,
        angleRadians,
        collisionRadius: this.config.collisionRadius,
        damage: this.config.damage,
        remainingMs: this.config.lifetimeMs,
      };
      this.swords.set(id, sword);
      created.push(this.toSnapshot(sword));
    }
    return created;
  }

  update(deltaMs: number): void {
    const seconds = Math.max(0, deltaMs) / 1000;
    for (const sword of this.swords.values()) {
      sword.previousX = sword.x;
      sword.previousY = sword.y;
      sword.x += sword.velocityX * seconds;
      sword.y += sword.velocityY * seconds;
      sword.remainingMs -= Math.max(0, deltaMs);
      if (sword.remainingMs <= 0) this.swords.delete(sword.id);
    }
  }

  collideCircle(target: { id: string; x: number; y: number; radius: number }): readonly ProjectileHit[] {
    const hits: ProjectileHit[] = [];
    for (const sword of [...this.swords.values()]) {
      if (!sweptCircleIntersectsCircle(
        { x: sword.previousX, y: sword.previousY },
        sword,
        sword.collisionRadius,
        target,
        target.radius,
      )) continue;
      hits.push({
        projectileId: sword.id,
        targetId: target.id,
        damage: sword.damage,
        x: sword.x,
        y: sword.y,
        angleRadians: sword.angleRadians,
      });
      this.swords.delete(sword.id);
    }
    return hits;
  }

  removeOutside(bounds: { left: number; right: number; top: number; bottom: number }): void {
    for (const sword of this.swords.values()) {
      if (sword.x < bounds.left || sword.x > bounds.right || sword.y < bounds.top || sword.y > bounds.bottom) {
        this.swords.delete(sword.id);
      }
    }
  }

  /** Removes every projectile the predicate accepts (e.g. ones that struck cover). */
  removeWhere(predicate: (sword: Readonly<{ id: string; x: number; y: number; collisionRadius: number; angleRadians: number }>) => boolean): void {
    for (const sword of [...this.swords.values()]) if (predicate(sword)) this.swords.delete(sword.id);
  }

  snapshots(): readonly FlyingSwordSnapshot[] {
    return [...this.swords.values()].map((sword) => this.toSnapshot(sword));
  }

  clear(): void { this.swords.clear(); }

  private toSnapshot(sword: MutableSword): FlyingSwordSnapshot {
    return {
      id: sword.id,
      castId: sword.castId,
      x: sword.x,
      y: sword.y,
      angleRadians: sword.angleRadians,
      collisionRadius: sword.collisionRadius,
      remainingMs: sword.remainingMs,
    };
  }
}
