/** Stamina gauge + sprint gesture maths — framework-free, unit tested. */
import type { StaminaState } from '@/types/contracts';

export type GaugeMode = 'hidden' | 'idle' | 'draining' | 'exhausted';

/** Seconds the pool must sit full and undrained before the gauge fades away. */
export const GAUGE_FADE_IDLE_SEC = 1.5;

export function staminaFraction(s: Pick<StaminaState, 'current' | 'max'>): number {
  if (!Number.isFinite(s.current) || !Number.isFinite(s.max) || s.max <= 0) return 0;
  return Math.min(1, Math.max(0, s.current / s.max));
}

/**
 * Visual state of the gauge:
 *  - exhausted → pulses (always visible)
 *  - actively spending (sprint/boost/mounted) or recently drained → 'draining'
 *  - full and idle long enough → 'hidden' (faded out)
 *  - otherwise → 'idle' (refilling)
 */
export function gaugeMode(s: StaminaState, spending: boolean, fadeAfterSec = GAUGE_FADE_IDLE_SEC): GaugeMode {
  if (s.exhausted) return 'exhausted';
  if (spending) return 'draining';
  const full = staminaFraction(s) >= 0.999;
  if (full && s.idleSec >= fadeAfterSec) return 'hidden';
  if (s.idleSec < 0.25 && !full) return 'draining';
  return 'idle';
}

/** Rounded percentage label (stable text, avoids per-frame DOM churn). */
export function staminaPercent(s: Pick<StaminaState, 'current' | 'max'>): number {
  return Math.round(staminaFraction(s) * 100);
}

/* ── Double-tap-and-hold on the stick zone = sprint ───────────────────── */

export const DOUBLE_TAP_MS = 300;
export const DOUBLE_TAP_SLOP_PX = 48;

export interface TapMark {
  readonly t: number;
  readonly x: number;
  readonly y: number;
}

/** A pointer-down at `now` that lands close (in time and space) to the previous release starts a sprint hold. */
export function isDoubleTapHold(prevUp: TapMark | null, down: TapMark, maxGapMs = DOUBLE_TAP_MS, slopPx = DOUBLE_TAP_SLOP_PX): boolean {
  if (!prevUp) return false;
  const gap = down.t - prevUp.t;
  if (gap < 0 || gap > maxGapMs) return false;
  return Math.hypot(down.x - prevUp.x, down.y - prevUp.y) <= slopPx;
}
