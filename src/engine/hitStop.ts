/**
 * Hit-stop clock (pure): `hitStop` combat events freeze combat-actor animation and
 * lunges for `ms`, with a tiny decaying camera shake.
 */
export const SHAKE_METRES = 0.07;

export class HitStopClock {
  private start = -Infinity;
  private until = -Infinity;

  /** Freeze from `now` for `ms` (extends an active freeze, never shortens it). */
  trigger(now: number, ms: number): void {
    const end = now + Math.max(0, ms) / 1000;
    if (now >= this.until) this.start = now;
    this.until = Math.max(this.until, end);
  }

  frozen(now: number): boolean {
    return now >= this.start && now < this.until;
  }

  /** Remaining frozen seconds at `now` (0 when free). */
  remaining(now: number): number {
    return this.frozen(now) ? this.until - now : 0;
  }

  /** The part of the frame (now − dt, now] that is not frozen. */
  effectiveDt(now: number, dt: number): number {
    const a = Math.max(now - dt, this.start);
    const b = Math.min(now, this.until);
    return Math.max(0, dt - Math.max(0, b - a));
  }

  /** Camera shake amplitude in metres (0 when free), decaying across the freeze. */
  shake(now: number): number {
    if (!this.frozen(now)) return 0;
    const len = Math.max(1e-3, this.until - this.start);
    return SHAKE_METRES * (1 - (now - this.start) / len);
  }

  reset(): void {
    this.start = -Infinity;
    this.until = -Infinity;
  }
}

/** Deterministic shake offset for a time (no rng): small x/y jitter scaled by amplitude. */
export function shakeOffset(now: number, amplitude: number): { x: number; y: number } {
  if (amplitude <= 0) return { x: 0, y: 0 };
  return { x: Math.sin(now * 97.3) * amplitude, y: Math.cos(now * 83.1) * amplitude * 0.6 };
}
