/** Stat table + delta formatting — framework-free, unit tested. */
import type { Stats, StatKey } from '@/types/contracts';

export const STAT_KEYS: readonly StatKey[] = ['maxHp', 'maxAp', 'atk', 'def', 'mag', 'res', 'spd', 'luck'];

export const STAT_LABELS: Readonly<Record<StatKey, string>> = {
  maxHp: 'HP',
  maxAp: 'AP',
  atk: 'ATK',
  def: 'DEF',
  mag: 'MAG',
  res: 'RES',
  spd: 'SPD',
  luck: 'LCK',
};

/** "+3", "−2", "" for zero. Uses a true minus sign. */
export function formatDelta(delta: number): string {
  const d = Math.round(delta);
  if (d === 0) return '';
  return d > 0 ? `+${d}` : `−${Math.abs(d)}`;
}

export type DeltaTone = 'up' | 'down' | 'flat';
export const deltaTone = (delta: number): DeltaTone => (Math.round(delta) > 0 ? 'up' : Math.round(delta) < 0 ? 'down' : 'flat');

export interface StatRow {
  readonly key: StatKey;
  readonly label: string;
  readonly base: number;
  readonly gear: number;
  readonly fused: number;
  /** gear − base */
  readonly gearDelta: string;
  readonly gearTone: DeltaTone;
  /** fused − gear */
  readonly fusionDelta: string;
  readonly fusionTone: DeltaTone;
}

export function statRows(base: Stats, withGear: Stats, fused: Stats): StatRow[] {
  return STAT_KEYS.map((key) => {
    const g = withGear[key] - base[key];
    const f = fused[key] - withGear[key];
    return {
      key,
      label: STAT_LABELS[key],
      base: Math.round(base[key]),
      gear: Math.round(withGear[key]),
      fused: Math.round(fused[key]),
      gearDelta: formatDelta(g),
      gearTone: deltaTone(g),
      fusionDelta: formatDelta(f),
      fusionTone: deltaTone(f),
    };
  });
}

/** Compact one-line summary of a partial stat block, e.g. "ATK +2 · HP +5". */
export function formatStatBlock(block: Partial<Stats>): string {
  const parts: string[] = [];
  for (const key of STAT_KEYS) {
    const v = block[key];
    if (v === undefined || v === 0) continue;
    parts.push(`${STAT_LABELS[key]} ${formatDelta(v)}`);
  }
  return parts.join(' · ');
}

/** Multiplier block, e.g. { atk: 1.2 } → "ATK ×1.2". */
export function formatMultipliers(block: Partial<Stats>): string {
  const parts: string[] = [];
  for (const key of STAT_KEYS) {
    const v = block[key];
    if (v === undefined || v === 1) continue;
    parts.push(`${STAT_LABELS[key]} ×${Number(v.toFixed(2))}`);
  }
  return parts.join(' · ');
}
