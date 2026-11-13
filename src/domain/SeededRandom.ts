/** Small deterministic PRNG suitable for replayable gameplay decisions. */
export class SeededRandom {
  private state: number;

  constructor(seed: number) {
    this.state = (seed >>> 0) || 0x6d2b79f5;
  }

  next(): number {
    let value = this.state += 0x6d2b79f5;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 0x100000000;
  }

  integer(minimum: number, maximum: number): number {
    const low = Math.ceil(Math.min(minimum, maximum));
    const high = Math.floor(Math.max(minimum, maximum));
    return low + Math.floor(this.next() * (high - low + 1));
  }
}
