/**
 * mulberry32 as an explicit state machine: the caller owns the uint32 state.
 * `next(state)` returns a float in [0, 1) plus the advanced state.
 */
export interface RngStep {
  readonly value: number;
  readonly state: number;
}

export function next(state: number): RngStep {
  const s = (state + 0x6d2b79f5) >>> 0;
  let t = s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { value, state: s };
}

/** Small mutable cursor for local, pure-from-the-outside use. */
export class RngCursor {
  state: number;
  constructor(state: number) {
    this.state = state >>> 0;
  }
  float(): number {
    const step = next(this.state);
    this.state = step.state;
    return step.value;
  }
  range(min: number, max: number): number {
    return min + (max - min) * this.float();
  }
  int(minInclusive: number, maxInclusive: number): number {
    return minInclusive + Math.floor(this.float() * (maxInclusive - minInclusive + 1));
  }
}

/** Derive a well-mixed uint32 from a seed and a salt (stable hash). */
export function mix(seed: number, salt: number): number {
  let h = (seed ^ Math.imul(salt + 0x9e3779b9, 0x85ebca6b)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  return (h ^ (h >>> 16)) >>> 0;
}
