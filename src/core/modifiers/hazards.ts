/**
 * Hazard lifecycle.
 *
 *  - `afterStart` initialises `hazards: []`, `hazardSeq: 0`.
 *  - Walking the step's log slice in order, at every `turnStart`:
 *      a. if its `round` is greater than the last round seen (starting at
 *         `prev.round`), every hazard's `roundsLeft` drops by the difference and
 *         hazards reaching 0 emit `hazardExpire` and are removed;
 *      b. if the actor is alive, each hazard on the actor's side (by instance id)
 *         ticks: DoT = floor(fraction × effective maxHp × affinity[element]),
 *         at least 1 unless immune, capped so the victim keeps ≥ 1 HP (hazards
 *         never KO), emitted as `hazardTick`; then `inflicts` rolls the rng.
 *    Tick events are inserted right after their `turnStart`.
 *  - A hazard spawned during round r with `durationRounds = N` therefore expires
 *    at the start of round r + N.
 *  - Statuses a hazard inflicts at a turn start apply after the core already
 *    ran that turn's status phase, so e.g. a stun skips the victim's NEXT turn.
 */
import type { CombatEvent, CombatModifierHandler, CombatState, CombatantId } from '@/types/contracts';
import type { CombatCtx } from '../combat/context';
import { affinitiesFor, statsFor } from '../combat/effective';
import { hazardsOf, patchCombatant, rollStatus, withSlice } from './util';

export function createHazards(ctx: CombatCtx): CombatModifierHandler {
  const { db } = ctx;

  function decay(s: CombatState, out: CombatEvent[], rounds: number): CombatState {
    const list = hazardsOf(s);
    if (list.length === 0 || rounds <= 0) return s;
    const kept = [];
    for (const h of list) {
      const roundsLeft = h.roundsLeft - rounds;
      if (roundsLeft <= 0) out.push({ type: 'hazardExpire', hazardId: h.hazardId, instanceId: h.instanceId, side: h.side });
      else kept.push({ ...h, roundsLeft });
    }
    return { ...s, hazards: kept };
  }

  function tick(s0: CombatState, out: CombatEvent[], actorId: CombatantId): CombatState {
    let s = s0;
    const c0 = s.combatants[actorId];
    if (!c0 || !c0.alive) return s;
    const here = hazardsOf(s).filter((h) => h.side === c0.side).sort((a, b) => a.instanceId - b.instanceId);
    for (const h of here) {
      const def = db.hazards[h.hazardId];
      const c = s.combatants[actorId];
      if (!def || !c || !c.alive) continue;
      if (def.dot) {
        const aff = affinitiesFor(ctx, c)[def.dot.element] ?? 1;
        const maxHp = statsFor(ctx, c).maxHp;
        const raw = aff <= 0 ? 0 : Math.max(1, Math.floor(def.dot.fraction * maxHp * aff));
        const amount = Math.max(0, Math.min(raw, c.hp - 1));
        out.push({ type: 'hazardTick', hazardId: h.hazardId, instanceId: h.instanceId, targetId: actorId, amount, element: def.dot.element });
        if (amount > 0) s = patchCombatant(s, actorId, (x) => ({ ...x, hp: x.hp - amount }));
      }
      if (def.inflicts) s = rollStatus(s, out, actorId, def.inflicts);
    }
    return s;
  }

  return {
    id: 'hazards',
    afterStart: (state) => ({ ...state, hazards: state.hazards ?? [], hazardSeq: state.hazardSeq ?? 0 }),
    afterStep(prev, next) {
      const slice = next.log.slice(prev.log.length);
      if (hazardsOf(next).length === 0 || !slice.some((e) => e.type === 'turnStart')) return next;
      let s = next;
      const out: CombatEvent[] = [];
      let round = prev.round;
      for (const e of slice) {
        out.push(e);
        if (e.type !== 'turnStart') continue;
        if (e.round > round) {
          s = decay(s, out, e.round - round);
          round = e.round;
        }
        s = tick(s, out, e.actorId);
      }
      return withSlice(s, prev.log, out);
    },
  };
}
