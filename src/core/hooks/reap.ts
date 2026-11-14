import type { CombatState } from '@/types/contracts';
import { HOOK_IDS } from '@/types/contracts';
import type { CombatHookImpl, HookContext } from './types';
import { announce, chanceGate, liveOwner, param, positiveInt } from './util';

/**
 * Reap — onKill, params `ap`, `potency`, `turns` (optional `chance`).
 * When one of the owner's own hits knocks out a foe: restore `ap` AP and gain
 * `atkUp` (`turns`, `potency`). Kills by hook-generated hits don't count.
 */
export const reapHook: CombatHookImpl = {
  info: { id: HOOK_IDS.reap, trigger: 'onKill', name: 'Reap' },
  run(ctx: HookContext): CombatState {
    const { hit, state } = ctx;
    if (!hit || hit.fromHook || hit.attackerId !== ctx.ownerId) return state;
    const owner = liveOwner(ctx, state);
    const victim = state.combatants[hit.targetId];
    if (!owner || !victim || victim.alive || victim.side === owner.side) return state;
    const g = chanceGate(ctx, state);
    if (!g.fire) return g.state;
    let s = announce(ctx, g.state, HOOK_IDS.reap, `${owner.name} reaps strength from ${victim.name}.`);
    const ap = positiveInt(param(ctx, 'ap', 0));
    if (ap > 0) s = ctx.kernel.changeAp(s, owner.id, ap);
    const turns = positiveInt(param(ctx, 'turns', 2));
    if (turns > 0) s = ctx.kernel.applyStatus(s, owner.id, { id: 'atkUp', turns, potency: param(ctx, 'potency', 0.25) });
    return s;
  },
};
