import type { Combatant, CombatantId, CombatEvent, CombatState, GameDatabase } from '@/types/contracts';
import type { HookRegistry } from '../hooks';
import { next } from '../rng';

/** Immutable dependencies shared by every combat function. */
export interface CombatCtx {
  readonly db: GameDatabase;
  readonly registry: HookRegistry;
}

export function emit(state: CombatState, ...events: readonly CombatEvent[]): CombatState {
  return { ...state, log: [...state.log, ...events] };
}

export function roll(state: CombatState): { readonly value: number; readonly state: CombatState } {
  const r = next(state.rng);
  return { value: r.value, state: { ...state, rng: r.rng } };
}

export function getC(state: CombatState, id: CombatantId): Combatant | undefined {
  return state.combatants[id];
}

/** Replace one combatant via an updater. No-op if the id is unknown. */
export function patchC(state: CombatState, id: CombatantId, f: (c: Combatant) => Combatant): CombatState {
  const c = state.combatants[id];
  if (!c) return state;
  return { ...state, combatants: { ...state.combatants, [id]: f(c) } };
}

export function allCombatants(state: CombatState): readonly Combatant[] {
  return Object.values(state.combatants);
}

export function aliveOnSide(state: CombatState, side: Combatant['side']): readonly Combatant[] {
  return allCombatants(state)
    .filter((c) => c.side === side && c.alive)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** Drake-blooded heroes (any dragon forms) gain/track Sync. */
export function isDrakeBlooded(ctx: CombatCtx, c: Combatant): boolean {
  return c.heroId !== undefined && ctx.db.heroes[c.heroId].dragonForms.length > 0;
}

export const SYNC_ON_ACT = 12;
export const SYNC_ON_HIT = 8;
export const SYNC_MAX = 100;

export function gainSync(ctx: CombatCtx, state: CombatState, id: CombatantId, amount: number): CombatState {
  const c = state.combatants[id];
  if (!c || !c.alive || amount <= 0 || !isDrakeBlooded(ctx, c)) return state;
  return patchC(state, id, (x) => ({ ...x, sync: Math.min(SYNC_MAX, x.sync + amount) }));
}
