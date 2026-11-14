/**
 * Stamina pool (sprint / mounts). Pure, frame-rate independent.
 *
 *  - Draining (`drainPerSec > 0`): current −= drain × dt, `idleSec` resets to 0.
 *    Hitting 0 sets `exhausted`. Draining is applied even while exhausted (forced
 *    drains such as flight); callers gate voluntary drains with `canDrain`.
 *  - Resting: `idleSec` += dt; only the part of dt past `regenDelaySec` regenerates
 *    at `regenPerSec`. Clamped to [0, max].
 *  - `exhausted` clears once current ≥ `recoverFraction` × max.
 */
import type { CoreServices, StaminaState, StaminaTuning } from '@/types/contracts';

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

export function staminaInitial(t: StaminaTuning): StaminaState {
  const max = Math.max(0, t.max);
  return { current: max, max, exhausted: false, idleSec: 0 };
}

export function staminaTick(state: StaminaState, drainPerSec: number, dt: number, t: StaminaTuning): StaminaState {
  const max = Math.max(0, t.max);
  if (!(dt > 0)) return state.max === max ? state : { ...state, max, current: clamp(state.current, 0, max) };
  if (drainPerSec > 0) {
    const current = clamp(state.current - drainPerSec * dt, 0, max);
    return { current, max, exhausted: state.exhausted || current <= 0, idleSec: 0 };
  }
  const idleSec = state.idleSec + dt;
  const regenSec = Math.max(0, idleSec - Math.max(state.idleSec, t.regenDelaySec));
  const current = clamp(state.current + Math.max(0, t.regenPerSec) * regenSec, 0, max);
  const exhausted = state.exhausted && current < t.recoverFraction * max;
  return { current, max, exhausted, idleSec };
}

export function staminaCanDrain(state: StaminaState): boolean {
  return !state.exhausted && state.current > 0;
}

export function createStamina(): CoreServices['stamina'] {
  return { initial: staminaInitial, tick: staminaTick, canDrain: staminaCanDrain };
}
