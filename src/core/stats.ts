import type { Affinities, Element, StatBlock, StatKey, Stats } from '@/types/contracts';
import { ELEMENTS } from '@/types/contracts';

export const STAT_KEYS: readonly StatKey[] = ['maxHp', 'maxAp', 'atk', 'def', 'mag', 'res', 'spd', 'luck'];

export function makeStats(f: (k: StatKey) => number): Stats {
  const out = {} as Record<StatKey, number>;
  for (const k of STAT_KEYS) out[k] = f(k);
  return out;
}

export const ZERO_STATS: Stats = makeStats(() => 0);

/** Fill a partial block with zeros. */
export function fromBlock(b: StatBlock): Stats {
  return makeStats((k) => b[k] ?? 0);
}

/** a + b (missing keys of b count as 0). */
export function addStats(a: Stats, b: StatBlock): Stats {
  return makeStats((k) => a[k] + (b[k] ?? 0));
}

/** a × m (missing keys of m count as 1). */
export function mulStats(a: Stats, m: StatBlock): Stats {
  return makeStats((k) => a[k] * (m[k] ?? 1));
}

/** Floor every stat and keep it non-negative; maxHp is at least 1. */
export function floorStats(a: Stats): Stats {
  return makeStats((k) => Math.max(k === 'maxHp' ? 1 : 0, Math.floor(a[k])));
}

/** Multiply two affinity tables (missing = 1); keys present in neither stay absent. */
export function mulAffinities(a: Affinities, b: Affinities): Affinities {
  const out: Partial<Record<Element, number>> = {};
  for (const e of ELEMENTS) {
    const x = a[e];
    const y = b[e];
    if (x === undefined && y === undefined) continue;
    out[e] = (x ?? 1) * (y ?? 1);
  }
  return out;
}

/** Stable de-duplicating union of id lists. */
export function unionIds<T>(...lists: readonly (readonly T[])[]): readonly T[] {
  const seen = new Set<T>();
  const out: T[] = [];
  for (const list of lists) {
    for (const id of list) {
      if (!seen.has(id)) {
        seen.add(id);
        out.push(id);
      }
    }
  }
  return out;
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
