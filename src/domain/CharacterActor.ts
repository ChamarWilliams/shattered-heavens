import { direction8FromAngle, type Direction8, type HeroOrientation } from '../characters/directions';
import type { CharacterConfig, CharacterState } from '../characters/types';

export interface ActorSnapshot {
  readonly characterId: string;
  readonly state: CharacterState;
  readonly orientation: HeroOrientation;
  readonly health: number;
  readonly stateElapsedMs: number;
  readonly stateDurationMs: number;
  readonly actionPhase: 'free' | 'windup' | 'active' | 'recovery' | 'disabled';
}

export class CharacterActor {
  private state: CharacterState = 'idle';
  private movementDirection: Direction8 = 'S';
  private facingDirection: Direction8 = 'S';
  private aimAngle = Math.PI / 2;
  private health: number;
  private elapsedMs = 0;

  constructor(private readonly config: CharacterConfig) {
    this.health = config.maxHealth;
  }

  move(direction: Direction8, preserveAimFacing = false): void {
    this.movementDirection = direction;
    if (!preserveAimFacing) this.facingDirection = direction;
    if (!this.isLocked()) this.enter('move');
  }

  aim(angleRadians: number): void {
    this.aimAngle = angleRadians;
    this.facingDirection = direction8FromAngle(angleRadians);
  }

  stop(): void {
    if (!this.isLocked()) this.enter('idle');
  }

  attack(): void {
    if (this.canStartAction()) this.enter('attack');
  }

  useAbility(): void {
    if (this.canStartAction()) this.enter('ability');
  }

  canStartAction(): boolean {
    if (this.state === 'death' || this.state === 'hurt') return false;
    if (!this.isLocked()) return true;
    return (this.state === 'attack' || this.state === 'ability')
      && this.elapsedMs >= this.config.animations[this.state].durationMs * 0.78;
  }

  hurt(damage: number): void {
    if (this.state === 'death') return;
    this.health = Math.max(0, this.health - Math.max(0, damage));
    this.enter(this.health === 0 ? 'death' : 'hurt');
  }

  kill(): void {
    this.health = 0;
    this.enter('death');
  }

  reset(): void {
    this.health = this.config.maxHealth;
    this.enter('idle');
  }

  update(deltaMs: number): void {
    this.elapsedMs += Math.max(0, deltaMs);
    const animation = this.config.animations[this.state];
    if (!animation.loop && this.elapsedMs >= animation.durationMs && this.state !== 'death') {
      this.enter('idle');
    }
  }

  snapshot(): ActorSnapshot {
    return {
      characterId: this.config.id,
      state: this.state,
      orientation: {
        movementDirection: this.movementDirection,
        facingDirection: this.facingDirection,
        aimAngle: this.aimAngle,
      },
      health: this.health,
      stateElapsedMs: this.elapsedMs,
      stateDurationMs: this.config.animations[this.state].durationMs,
      actionPhase: this.actionPhase(),
    };
  }

  private actionPhase(): ActorSnapshot['actionPhase'] {
    if (this.state === 'idle' || this.state === 'move') return 'free';
    if (this.state === 'hurt' || this.state === 'death') return 'disabled';
    const animation = this.config.animations[this.state];
    const releaseTime = animation.events?.[0]?.normalizedTime ?? 0.45;
    const normalized = animation.durationMs > 0 ? this.elapsedMs / animation.durationMs : 1;
    if (normalized < releaseTime) return 'windup';
    if (normalized < Math.min(0.78, releaseTime + 0.14)) return 'active';
    return 'recovery';
  }

  private isLocked(): boolean {
    return !this.config.animations[this.state].interruptible;
  }

  private enter(next: CharacterState): void {
    if (this.state === next && (next === 'idle' || next === 'move')) return;
    this.state = next;
    this.elapsedMs = 0;
  }
}
