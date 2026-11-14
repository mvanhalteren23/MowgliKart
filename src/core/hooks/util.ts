import type { Combatant, CombatHookId, CombatState } from '@/types/contracts';
import type { HookContext } from './types';

/**
 * Shared hook helpers.
 *
 * `chanceGate`: when the hook has a `chance` param, draw ONE rng value and fire
 * when `value < chance`; without a `chance` param the hook always fires and no
 * rng is consumed. Hooks call it only after all deterministic preconditions hold,
 * so a hook that cannot apply never perturbs the rng stream.
 */
export function chanceGate(ctx: HookContext, state: CombatState): { readonly fire: boolean; readonly state: CombatState } {
  const chance = ctx.params['chance'];
  if (chance === undefined) return { fire: true, state };
  const r = ctx.kernel.roll(state);
  return { fire: r.value < chance, state: r.state };
}

export function param(ctx: HookContext, key: string, fallback: number): number {
  const v = ctx.params[key];
  return v === undefined || !Number.isFinite(v) ? fallback : v;
}

/** The living owner, or undefined (dead owners never act on hooks). */
export function liveOwner(ctx: HookContext, state: CombatState): Combatant | undefined {
  const o = state.combatants[ctx.ownerId];
  return o && o.alive ? o : undefined;
}

/** Emit the mandatory `hook` event announcing the effect that follows. */
export function announce(ctx: HookContext, state: CombatState, hookId: CombatHookId, note: string): CombatState {
  return ctx.kernel.emit(state, { type: 'hook', ownerId: ctx.ownerId, hookId, sourceGear: ctx.sourceGear, note });
}

export function positiveInt(n: number): number {
  return Math.max(0, Math.floor(n));
}
