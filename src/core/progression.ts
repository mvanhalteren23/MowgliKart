import type { CoreServices, HeroDef, SkillId, Stats } from '@/types/contracts';
import { floorStats, makeStats, unionIds } from './stats';

export const MAX_LEVEL = 99;

/** Level-scaled base stats: `base + growth × (level − 1)`, floored. */
export function statsAt(hero: HeroDef, level: number): Stats {
  const n = Math.max(0, Math.floor(level) - 1);
  return floorStats(makeStats((k) => hero.baseStats[k] + hero.growth[k] * n));
}

/**
 * XP needed to go from `level` to `level + 1`:
 *   `floor(40 × level^1.5) + 20 × level`
 * (L1→2: 60, L2→3: 153, L5→6: 547, L10→11: 1464). Infinity at MAX_LEVEL.
 */
export function xpToNext(level: number): number {
  const l = Math.max(1, Math.floor(level));
  if (l >= MAX_LEVEL) return Number.POSITIVE_INFINITY;
  return Math.floor(40 * Math.pow(l, 1.5)) + 20 * l;
}

/** Apply `gained` xp to (level, xp); carries leftover across multiple level-ups. */
export function grantXp(level: number, xp: number, gained: number): { readonly level: number; readonly xp: number; readonly levelsGained: number } {
  let lv = Math.max(1, Math.floor(level));
  let pool = Math.max(0, Math.floor(xp)) + Math.max(0, Math.floor(gained));
  const start = lv;
  while (lv < MAX_LEVEL && pool >= xpToNext(lv)) {
    pool -= xpToNext(lv);
    lv += 1;
  }
  if (lv >= MAX_LEVEL) pool = 0;
  return { level: lv, xp: pool, levelsGained: lv - start };
}

/** Skills learned at or below `level`, in definition order, de-duplicated. */
export function skillsAt(hero: HeroDef, level: number): readonly SkillId[] {
  return unionIds(hero.skills.filter((s) => s.level <= level).map((s) => s.skillId));
}

export function createProgression(): CoreServices['progression'] {
  return { statsAt, xpToNext, grantXp, skillsAt };
}
