/** Hazard HUD helpers — framework-free, unit tested. */
import type { CombatEvent, CombatSide, CombatantId, HazardInstance } from '@/types/contracts';

/** Active hazards for one side, longest-lasting first (stable by instance id). */
export function hazardsForSide(hazards: readonly HazardInstance[] | undefined, side: CombatSide): readonly HazardInstance[] {
  return (hazards ?? []).filter((h) => h.side === side && h.roundsLeft > 0).sort((a, b) => b.roundsLeft - a.roundsLeft || a.instanceId - b.instanceId);
}

export interface TickNumber {
  /** Index of the event in the combat log (unique key). */
  readonly key: number;
  readonly targetId: CombatantId;
  readonly amount: number;
  readonly hazardId: string;
}

/** Hazard tick numbers emitted in `log[from..]`. */
export function hazardTicksSince(log: readonly CombatEvent[], from: number): readonly TickNumber[] {
  const out: TickNumber[] = [];
  for (let i = Math.max(0, from); i < log.length; i++) {
    const ev = log[i];
    if (ev?.type === 'hazardTick') out.push({ key: i, targetId: ev.targetId, amount: ev.amount, hazardId: ev.hazardId });
  }
  return out;
}

export const roundsLabel = (n: number): string => (n === 1 ? '1 rd' : `${n} rds`);
