import type { CombatantId, CombatEvent, CombatState } from '@/types/contracts';
import { HOOK_IDS } from '@/types/contracts';
import type { CombatHookImpl, HookContext } from './types';
import { announce, chanceGate, liveOwner, param, positiveInt } from './util';

/**
 * Enemies already robbed, derived purely from the event log: a pilfer `hook`
 * event belongs to the target of the most recent `attack` event by the same
 * owner (pilfer only runs on the owner's own per-hit `onAttackLanded`, right
 * after that hit's `attack`/`damage` events; anything in between is the target's
 * reactions, which are attacks by *other* actors).
 */
export function pilferedTargets(log: readonly CombatEvent[]): ReadonlySet<CombatantId> {
  const lastTarget = new Map<CombatantId, CombatantId>();
  const robbed = new Set<CombatantId>();
  for (const e of log) {
    if (e.type === 'attack') lastTarget.set(e.actorId, e.targetId);
    else if (e.type === 'hook' && e.hookId === HOOK_IDS.pilfer) {
      const t = lastTarget.get(e.ownerId);
      if (t !== undefined) robbed.add(t);
    }
  }
  return robbed;
}

/**
 * Total pilfered coin, derived from the log: each pilfer `hook` event is worth the
 * `coin` param of the owner's hook from that `sourceGear`. Added to victory coin.
 */
export function pilferedCoin(state: CombatState): number {
  let coin = 0;
  for (const e of state.log) {
    if (e.type !== 'hook' || e.hookId !== HOOK_IDS.pilfer) continue;
    const h = state.combatants[e.ownerId]?.hooks.find((x) => x.hookId === HOOK_IDS.pilfer && x.sourceGear === e.sourceGear);
    coin += positiveInt(h?.params['coin'] ?? 0);
  }
  return coin;
}

/**
 * Pilfer — onAttackLanded (per hit), params `chance`, `coin`.
 * When a party owner's own hit lands on an enemy not yet robbed by anyone, roll
 * rng < `chance` → steal `coin`, paid out with the victory rewards (lost on
 * flee/defeat). A killing blow can still pilfer. Ignores hook-generated hits.
 */
export const pilferHook: CombatHookImpl = {
  info: { id: HOOK_IDS.pilfer, trigger: 'onAttackLanded', name: 'Pilfer' },
  run(ctx: HookContext): CombatState {
    const { hit, state } = ctx;
    if (!hit || hit.fromHook || hit.attackerId !== ctx.ownerId) return state;
    const owner = liveOwner(ctx, state);
    const target = state.combatants[hit.targetId];
    if (!owner || owner.side !== 'party' || !target || target.side !== 'enemy') return state;
    const coin = positiveInt(param(ctx, 'coin', 0));
    if (coin === 0 || pilferedTargets(state.log).has(target.id)) return state;
    const g = chanceGate(ctx, state);
    if (!g.fire) return g.state;
    return announce(ctx, g.state, HOOK_IDS.pilfer, `${owner.name} pilfers ${coin} coin from ${target.name}.`);
  },
};
