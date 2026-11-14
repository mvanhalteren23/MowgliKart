import type { CombatState } from '@/types/contracts';
import { HOOK_IDS } from '@/types/contracts';
import type { CombatHookImpl, HookContext } from './types';
import { announce, chanceGate, liveOwner, param, positiveInt } from './util';

/**
 * Dragon Surge — onTurnStart, params `sync`, `ap` (optional `chance`).
 * While the owner is transformed (checked after the turn's AP drain, so a form
 * that just auto-reverted gets nothing): +`sync` Sync and refund `ap` AP.
 */
export const dragonSurgeHook: CombatHookImpl = {
  info: { id: HOOK_IDS.dragonSurge, trigger: 'onTurnStart', name: 'Dragon Surge' },
  run(ctx: HookContext): CombatState {
    const owner = liveOwner(ctx, ctx.state);
    if (!owner || owner.dragon === null) return ctx.state;
    const sync = positiveInt(param(ctx, 'sync', 0));
    const ap = positiveInt(param(ctx, 'ap', 0));
    if (sync === 0 && ap === 0) return ctx.state;
    const g = chanceGate(ctx, ctx.state);
    if (!g.fire) return g.state;
    let s = announce(ctx, g.state, HOOK_IDS.dragonSurge, `${owner.name}'s draconic blood surges (+${sync} Sync, +${ap} AP).`);
    s = ctx.kernel.gainSync(s, owner.id, sync);
    return ctx.kernel.changeAp(s, owner.id, ap);
  },
};
