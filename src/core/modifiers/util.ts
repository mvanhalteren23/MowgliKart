/**
 * Shared helpers for combat modifiers (Phase 3).
 *
 * Modifiers post-process the slice of log events a core `step` appended. They
 * rebuild that slice into a local array (`out`) — events are inserted right
 * after the event that caused them — and write it back once at the end, so
 * the log stays append-only relative to the state the step started from.
 * All randomness is a mulberry32 step of `state.rng`.
 */
import type {
  Combatant,
  CombatantId,
  CombatEvent,
  CombatSide,
  CombatState,
  Element,
  GameDatabase,
  HazardId,
  HazardInstance,
  StatusId,
} from '@/types/contracts';
import { next as rngNext } from '../rng';

export type Inflict = { readonly status: StatusId; readonly chance: number; readonly turns: number; readonly potency: number };
export type AffinityLabel = 'weak' | 'resist' | 'neutral' | 'immune';

export function hazardsOf(s: CombatState): readonly HazardInstance[] {
  return s.hazards ?? [];
}

export function hazardsOnSide(s: CombatState, side: CombatSide): readonly HazardInstance[] {
  return hazardsOf(s).filter((h) => h.side === side);
}

export function hasHazard(s: CombatState, side: CombatSide, hazardId: HazardId): boolean {
  return hazardsOf(s).some((h) => h.side === side && h.hazardId === hazardId);
}

export function patchCombatant(s: CombatState, id: CombatantId, f: (c: Combatant) => Combatant): CombatState {
  const c = s.combatants[id];
  if (!c) return s;
  return { ...s, combatants: { ...s.combatants, [id]: f(c) } };
}

export function rollRng(s: CombatState): { readonly value: number; readonly state: CombatState } {
  const r = rngNext(s.rng);
  return { value: r.value, state: { ...s, rng: r.rng } };
}

export function affinityLabel(m: number): AffinityLabel {
  if (m === 0) return 'immune';
  if (m > 1) return 'weak';
  if (m < 1) return 'resist';
  return 'neutral';
}

/**
 * Spawn `hazardId` on `side`. If an instance of it already exists there its
 * `roundsLeft` is refreshed (no duplicate) and `hazardSpawn` is re-emitted with
 * the existing instance id. New ids come from `hazardSeq` (first id is 1).
 */
export function spawnHazard(
  db: GameDatabase,
  s: CombatState,
  out: CombatEvent[],
  hazardId: HazardId,
  side: CombatSide,
  sourceId: CombatantId | null,
): CombatState {
  const def = db.hazards[hazardId];
  if (!def) return s;
  const list = hazardsOf(s);
  const existing = list.find((h) => h.side === side && h.hazardId === hazardId);
  if (existing) {
    out.push({ type: 'hazardSpawn', hazardId, instanceId: existing.instanceId, side });
    return {
      ...s,
      hazards: list.map((h) => (h === existing ? { ...h, roundsLeft: def.durationRounds, sourceId } : h)),
    };
  }
  const instanceId = (s.hazardSeq ?? 0) + 1;
  out.push({ type: 'hazardSpawn', hazardId, instanceId, side });
  return {
    ...s,
    hazardSeq: instanceId,
    hazards: [...list, { instanceId, hazardId, side, roundsLeft: Math.max(1, def.durationRounds), sourceId }],
  };
}

/** Remove every instance of `hazardId` on `side`, emitting `hazardExpire`. */
export function removeHazard(s: CombatState, out: CombatEvent[], hazardId: HazardId, side: CombatSide): CombatState {
  const list = hazardsOf(s);
  const gone = list.filter((h) => h.side === side && h.hazardId === hazardId);
  if (gone.length === 0) return s;
  for (const h of gone) out.push({ type: 'hazardExpire', hazardId: h.hazardId, instanceId: h.instanceId, side: h.side });
  return { ...s, hazards: list.filter((h) => !gone.includes(h)) };
}

/** Extra damage that never knocks out: leaves the target at ≥ 1 HP. Bypasses fusion armor. */
export function damageNoKo(
  s: CombatState,
  out: CombatEvent[],
  targetId: CombatantId,
  amount: number,
  element: Element,
  affinity: AffinityLabel,
  crit = false,
): CombatState {
  const c = s.combatants[targetId];
  if (!c || !c.alive) return s;
  const actual = Math.max(0, Math.min(Math.floor(amount), c.hp - 1));
  if (actual <= 0) return s;
  out.push({ type: 'damage', targetId, amount: actual, element, crit, affinity, absorbedByArmor: 0 });
  return patchCombatant(s, targetId, (x) => ({ ...x, hp: x.hp - actual }));
}

/** Roll `inf.chance` against the rng and apply (replace, never stack) the status. */
export function rollStatus(s: CombatState, out: CombatEvent[], targetId: CombatantId, inf: Inflict): CombatState {
  const c = s.combatants[targetId];
  if (!c || !c.alive || inf.turns <= 0) return s;
  const r = rollRng(s);
  if (r.value >= inf.chance) return r.state;
  out.push({ type: 'status', targetId, status: inf.status, applied: true });
  return patchCombatant(r.state, targetId, (x) => ({
    ...x,
    statuses: [...x.statuses.filter((st) => st.id !== inf.status), { id: inf.status, turns: inf.turns, potency: inf.potency }],
  }));
}

/** Remove a status if present, emitting `status{applied:false}`. */
export function removeStatus(s: CombatState, out: CombatEvent[], targetId: CombatantId, status: StatusId): CombatState {
  const c = s.combatants[targetId];
  if (!c || !c.statuses.some((st) => st.id === status)) return s;
  out.push({ type: 'status', targetId, status, applied: false });
  return patchCombatant(s, targetId, (x) => ({ ...x, statuses: x.statuses.filter((st) => st.id !== status) }));
}

/** Write a rebuilt slice back onto the log that existed before the step. */
export function withSlice(s: CombatState, prevLog: readonly CombatEvent[], out: readonly CombatEvent[]): CombatState {
  return { ...s, log: [...prevLog, ...out] };
}
