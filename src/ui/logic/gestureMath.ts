/**
 * Touch mini-game gesture math — framework-free, unit tested.
 *
 * Screen coordinates: +x right, +y down. The overworld camera faces north, so
 * screen right = world +x and screen down = world +z. World angles use the
 * contracts' `atan2(dz, dx)` convention (0 = east/+x, π/2 = south/+z).
 */

const TAU = Math.PI * 2;
const clamp01 = (v: number): number => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);

/** Wrap any angle into (−π, π]. */
export function wrapAngle(a: number): number {
  if (!Number.isFinite(a)) return 0;
  let r = a % TAU;
  if (r <= -Math.PI) r += TAU;
  else if (r > Math.PI) r -= TAU;
  return r;
}

/* ════════════════════════════════════════════════════════════════════════
 * Hunting: pull-back slingshot aim
 * ════════════════════════════════════════════════════════════════════════ */

export interface AimConfig {
  /** Drag length (px) that gives full draw. */
  readonly maxDrawPx: number;
  /** Radius (px) around the origin that means "no draw" / cancel when released inside it. */
  readonly cancelPx: number;
}

export const DEFAULT_AIM: AimConfig = { maxDrawPx: 120, cancelPx: 18 };

export interface AimReading {
  /** World aim angle, `atan2(dz, dx)`: the shot flies OPPOSITE the drag. */
  readonly angle: number;
  /** Draw strength 0..1 after the power curve. */
  readonly power: number;
  /** Linear draw 0..1 (before the curve) — handy for the draw ring. */
  readonly draw: number;
  /** Finger currently inside the cancel zone. */
  readonly inCancelZone: boolean;
  readonly dragPx: number;
}

/**
 * Draw curve: a gentle ease-out so the first half of the pull already gives a usable shot,
 * the last part refines it. 0 → 0, 1 → 1, monotonic.
 */
export function powerCurve(t: number): number {
  const x = clamp01(t);
  return 1 - (1 - x) * (1 - x);
}

/** World aim angle for a pull-back drag of (dx, dy) screen px from the origin. */
export function aimAngleFromDrag(dx: number, dy: number): number {
  if (dx === 0 && dy === 0) return 0;
  return Math.atan2(-dy, -dx);
}

export function aimFromDrag(dx: number, dy: number, cfg: AimConfig = DEFAULT_AIM): AimReading {
  const dragPx = Math.hypot(dx, dy);
  const safe = Number.isFinite(dragPx) ? dragPx : 0;
  const inCancelZone = safe < cfg.cancelPx;
  const span = Math.max(1, cfg.maxDrawPx - cfg.cancelPx);
  const draw = inCancelZone ? 0 : clamp01((safe - cfg.cancelPx) / span);
  return { angle: aimAngleFromDrag(dx, dy), power: powerCurve(draw), draw, inCancelZone, dragPx: safe };
}

export type AimOutcome = 'tap' | 'fire' | 'cancel';

/**
 * How a released aim gesture resolves.
 *  - never left the cancel zone and was short → `tap` (plain shot, no aim)
 *  - released inside the cancel zone after drawing (dragged back to origin) → `cancel`
 *  - otherwise → `fire` with the aim reading
 */
export function classifyAimRelease(maxDragPx: number, finalDragPx: number, durationMs: number, cfg: AimConfig = DEFAULT_AIM, tapMs = 320): AimOutcome {
  if (maxDragPx < cfg.cancelPx) return durationMs <= tapMs ? 'tap' : 'cancel';
  return finalDragPx < cfg.cancelPx ? 'cancel' : 'fire';
}

/** World angle (atan2(dz, dx)) → CSS rotation clockwise from screen-up. */
export function worldAngleToCss(angle: number): number {
  return angle + Math.PI / 2;
}

export type WindRelation = 'tailwind' | 'headwind' | 'crosswind' | 'calm';

/**
 * Wind relative to the aim. `tailwind` = the wind blows along the shot, i.e. from the
 * hunter toward the quarry: the hunter is upwind and its scent carries (warn).
 */
export function windRelation(aimAngle: number, windDirection: number, windSpeed: number, calmBelow = 0.6): { readonly relation: WindRelation; readonly alignment: number; readonly relative: number } {
  const relative = wrapAngle(windDirection - aimAngle);
  const alignment = Math.cos(relative);
  if (!(windSpeed >= calmBelow)) return { relation: 'calm', alignment, relative };
  const relation: WindRelation = alignment > 0.35 ? 'tailwind' : alignment < -0.35 ? 'headwind' : 'crosswind';
  return { relation, alignment, relative };
}

/* ════════════════════════════════════════════════════════════════════════
 * Fishing: upward flick cast
 * ════════════════════════════════════════════════════════════════════════ */

export interface GesturePoint {
  readonly x: number;
  readonly y: number;
  /** ms */
  readonly t: number;
}

export interface FlickConfig {
  /** Minimum upward travel (px) for a valid cast. */
  readonly minUpPx: number;
  /** Upward speed (px/ms) that earns no speed score / full speed score. */
  readonly minSpeed: number;
  readonly idealSpeed: number;
  /** Speed is measured over the last `windowMs` before release. */
  readonly windowMs: number;
}

export const DEFAULT_FLICK: FlickConfig = { minUpPx: 40, minSpeed: 0.25, idealSpeed: 1.8, windowMs: 160 };

export interface FlickReading {
  readonly valid: boolean;
  readonly quality: number;
  /** Upward speed px/ms over the release window. */
  readonly speed: number;
  /** 0..1 — path efficiency × vertical alignment. */
  readonly straightness: number;
  readonly label: string;
}

export function castLabel(q: number): string {
  if (q >= 0.92) return 'Perfect';
  if (q >= 0.75) return 'Great';
  if (q >= 0.5) return 'Good';
  if (q >= 0.25) return 'Fair';
  return 'Flop';
}

const INVALID_FLICK: FlickReading = { valid: false, quality: 0, speed: 0, straightness: 0, label: 'Flick upward' };

/** Flick quality from the pointer path (press → release). */
export function flickQuality(points: readonly GesturePoint[], cfg: FlickConfig = DEFAULT_FLICK): FlickReading {
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last || points.length < 2) return INVALID_FLICK;
  const up = first.y - last.y;
  if (up < cfg.minUpPx) return INVALID_FLICK;

  let path = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (a && b) path += Math.hypot(b.x - a.x, b.y - a.y);
  }
  const net = Math.hypot(last.x - first.x, last.y - first.y);
  const efficiency = path > 0 ? net / path : 0;
  const vertical = net > 0 ? Math.max(0, up / net) : 0;
  const straightness = clamp01(efficiency * vertical);

  // Speed over the trailing window (the "snap" of the flick).
  const cutoff = last.t - cfg.windowMs;
  let start = first;
  for (const p of points) {
    if (p.t >= cutoff) {
      start = p;
      break;
    }
  }
  if (start === last) start = points[points.length - 2] ?? first;
  const dt = Math.max(1, last.t - start.t);
  const speed = Math.max(0, (start.y - last.y) / dt);
  const speedScore = clamp01((speed - cfg.minSpeed) / Math.max(1e-6, cfg.idealSpeed - cfg.minSpeed));

  const quality = clamp01(0.6 * speedScore + 0.4 * straightness * straightness);
  return { valid: true, quality, speed, straightness, label: castLabel(quality) };
}

/* ════════════════════════════════════════════════════════════════════════
 * Fishing: circular crank
 * ════════════════════════════════════════════════════════════════════════ */

export interface CrankConfig {
  /** Touches closer than this to the centre (px) carry no angle. */
  readonly minRadiusPx: number;
  /** Smoothing time constant (ms) for the angular velocity. */
  readonly tauMs: number;
  /** |rad/s| at or above which the crank counts as holding the reel. */
  readonly holdThreshold: number;
}

export const DEFAULT_CRANK: CrankConfig = { minRadiusPx: 14, tauMs: 140, holdThreshold: 4.5 };

export interface CrankState {
  /** Last finger angle (screen atan2(dy, dx); clockwise positive) or null when not tracking. */
  readonly angle: number | null;
  /** ms timestamp of the last sample. */
  readonly t: number;
  /** Smoothed angular velocity, rad/s (clockwise on screen is positive). */
  readonly velocity: number;
  /** Accumulated rotation (rad, signed). */
  readonly total: number;
  /** True once any rotation has been observed since `crankStart`. */
  readonly moved: boolean;
}

export const CRANK_IDLE: CrankState = { angle: null, t: 0, velocity: 0, total: 0, moved: false };

/** Begin tracking at a finger position relative to the crank centre. */
export function crankStart(dx: number, dy: number, t: number, cfg: CrankConfig = DEFAULT_CRANK): CrankState {
  const angle = Math.hypot(dx, dy) >= cfg.minRadiusPx ? Math.atan2(dy, dx) : null;
  return { angle, t, velocity: 0, total: 0, moved: false };
}

/** Fold one pointer sample into the crank (handles the ±π wrap-around). */
export function crankStep(state: CrankState, dx: number, dy: number, t: number, cfg: CrankConfig = DEFAULT_CRANK): CrankState {
  if (Math.hypot(dx, dy) < cfg.minRadiusPx) return { ...state, angle: null, t, velocity: crankVelocityAt(state, t, cfg) };
  const angle = Math.atan2(dy, dx);
  if (state.angle === null) return { ...state, angle, t };
  const dtMs = t - state.t;
  if (!(dtMs > 0)) return { ...state, angle };
  const delta = wrapAngle(angle - state.angle);
  const instant = delta / (dtMs / 1000);
  const alpha = 1 - Math.exp(-dtMs / cfg.tauMs);
  const velocity = state.velocity + (instant - state.velocity) * alpha;
  return { angle, t, velocity, total: state.total + delta, moved: state.moved || Math.abs(delta) > 0.02 };
}

/** Velocity decayed for idle time since the last sample (a still finger stops reeling). */
export function crankVelocityAt(state: CrankState, now: number, cfg: CrankConfig = DEFAULT_CRANK): number {
  const idle = Math.max(0, now - state.t);
  return state.velocity * Math.exp(-idle / cfg.tauMs);
}

/** Crank fast enough (either direction) to count as holding the reel. */
export function crankHolding(state: CrankState, now: number, cfg: CrankConfig = DEFAULT_CRANK): boolean {
  return Math.abs(crankVelocityAt(state, now, cfg)) >= cfg.holdThreshold;
}

export function crankDirection(velocity: number): 'cw' | 'ccw' | 'still' {
  if (Math.abs(velocity) < 0.05) return 'still';
  return velocity > 0 ? 'cw' : 'ccw';
}
