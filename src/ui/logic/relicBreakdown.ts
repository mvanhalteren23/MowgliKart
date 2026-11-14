/**
 * Progression-Scaling Relic breakdown for the Synergy Inspector — framework-free, unit tested.
 * All numbers come from the injected `bonus` function (`core.gear.bonus` bound to the relic),
 * so the UI never re-implements the scaling rules; it only decomposes them.
 */
import type { ProgressionContext, RelicGearDef, ScalingCurve, Stats, StatKey } from '@/types/contracts';
import { STAT_KEYS, STAT_LABELS } from './statFormat';

export type BonusAt = (ctx: ProgressionContext) => Stats;

export interface RelicTermRow {
  readonly key: StatKey;
  readonly label: string;
  /** Flat base stat of the relic (bonus at Lv 1, no regions). */
  readonly base: number;
  /** Added by level scaling (after cap). */
  readonly levelTerm: number;
  /** Added by liberated regions (after cap). */
  readonly regionTerm: number;
  readonly total: number;
  readonly cap: number | null;
  readonly capped: boolean;
  readonly perLevel: number;
  readonly perRegion: number;
}

export interface RelicBreakdown {
  readonly rows: readonly RelicTermRow[];
  readonly curve: ScalingCurve;
  readonly formula: string;
}

export const CURVE_TEXT: Readonly<Record<ScalingCurve, string>> = {
  linear: '(Lv − 1)',
  sqrt: '√(Lv − 1)',
  log: 'ln(Lv)',
};

/** Stats the relic touches at all (base, per-level, per-region or cap). */
export function relicStatKeys(def: RelicGearDef): StatKey[] {
  const { scaling } = def;
  return STAT_KEYS.filter(
    (k) => (def.stats[k] ?? 0) !== 0 || (scaling.perLevel[k] ?? 0) !== 0 || (scaling.perLiberatedRegion[k] ?? 0) !== 0 || scaling.cap?.[k] !== undefined,
  );
}

export function relicBreakdown(def: RelicGearDef, ctx: ProgressionContext, bonusAt: BonusAt): RelicBreakdown {
  const b0 = bonusAt({ level: 1, liberatedRegions: 0 });
  const bL = bonusAt({ level: ctx.level, liberatedRegions: 0 });
  const bLR = bonusAt(ctx);
  const rows = relicStatKeys(def).map((key): RelicTermRow => {
    const cap = def.scaling.cap?.[key] ?? null;
    const total = bLR[key];
    return {
      key,
      label: STAT_LABELS[key],
      base: b0[key],
      levelTerm: bL[key] - b0[key],
      regionTerm: total - bL[key],
      total,
      cap,
      capped: cap !== null && total >= cap,
      perLevel: def.scaling.perLevel[key] ?? 0,
      perRegion: def.scaling.perLiberatedRegion[key] ?? 0,
    };
  });
  return {
    rows,
    curve: def.scaling.levelCurve,
    formula: `base + perLevel × curve${CURVE_TEXT[def.scaling.levelCurve]} + perRegion × regions, capped`,
  };
}

export interface SparkSeries {
  readonly key: StatKey;
  readonly label: string;
  readonly values: readonly number[];
}

export interface Sparkline {
  readonly levels: readonly number[];
  readonly series: readonly SparkSeries[];
  readonly max: number;
}

/** Evenly spaced sample levels from 1 to `maxLevel` (inclusive), always including `current`. */
export function sampleLevels(maxLevel: number, samples: number, current?: number): number[] {
  const top = Math.max(2, Math.round(maxLevel));
  const n = Math.max(2, Math.round(samples));
  const set = new Set<number>();
  for (let i = 0; i < n; i++) set.add(Math.round(1 + ((top - 1) * i) / (n - 1)));
  if (current !== undefined && current >= 1 && current <= top) set.add(Math.round(current));
  return [...set].sort((a, b) => a - b);
}

/** Bonus vs level (regions held fixed) for each scaling stat. */
export function relicSparkline(def: RelicGearDef, liberatedRegions: number, levels: readonly number[], bonusAt: BonusAt): Sparkline {
  const keys = STAT_KEYS.filter((k) => (def.scaling.perLevel[k] ?? 0) !== 0);
  const samples = levels.map((level) => bonusAt({ level, liberatedRegions }));
  const series = keys.map((key) => ({ key, label: STAT_LABELS[key], values: samples.map((s) => s[key]) }));
  const max = Math.max(1, ...series.flatMap((s) => s.values));
  return { levels, series, max };
}

/** SVG polyline `points` attribute for one series in a w×h box (y up). */
export function sparkPoints(values: readonly number[], max: number, w: number, h: number, pad = 2): string {
  if (values.length === 0) return '';
  const step = values.length > 1 ? (w - pad * 2) / (values.length - 1) : 0;
  const top = max > 0 ? max : 1;
  return values
    .map((v, i) => {
      const x = pad + i * step;
      const y = h - pad - (Math.min(Math.max(0, v), top) / top) * (h - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}
