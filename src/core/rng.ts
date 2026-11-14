/**
 * Deterministic PRNG for the simulation.
 *
 * The whole generator state is a single uint32 carried explicitly in state
 * objects (`CombatState.rng`). There is no module-level state: callers thread
 * the returned `rng` into the next call.
 */

export interface RngStep {
  /** Uniform in [0, 1). */
  readonly value: number;
  /** Next generator state (uint32). */
  readonly rng: number;
}

/** Normalise any number into a valid uint32 seed. */
export function seed(n: number): number {
  return Number.isFinite(n) ? Math.trunc(n) >>> 0 : 0;
}

/** One mulberry32 step: `next(rng) → { value: 0..1, rng }`. */
export function next(rng: number): RngStep {
  const s = (rng + 0x6d2b79f5) >>> 0;
  let t = s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { value, rng: s };
}

/**
 * Stateless hash of a few integers into [0, 1). Used where a decision must be
 * deterministic from state *without* consuming the rng (enemy AI).
 */
export function hash01(...parts: readonly number[]): number {
  let h = 0x811c9dc5;
  for (const p of parts) {
    h = Math.imul(h ^ (p >>> 0), 0x01000193) >>> 0;
    h = (h ^ (h >>> 13)) >>> 0;
  }
  return next(h).value;
}
