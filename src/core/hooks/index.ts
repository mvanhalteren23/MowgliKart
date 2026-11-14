import type { CombatHookId, CombatHookInfo } from '@/types/contracts';
import { bulwarkHook } from './bulwark';
import { counterAttackHook } from './counterAttack';
import { dragonSurgeHook } from './dragonSurge';
import { markedQuarryHook } from './markedQuarry';
import { mendingEchoHook } from './mendingEcho';
import { pilferHook } from './pilfer';
import { reapHook } from './reap';
import { rootbindHook } from './rootbind';
import { spellEchoHook } from './spellEcho';
import type { CombatHookImpl, HookRegistry } from './types';

export type { CastInfo, CombatHookImpl, HitInfo, HookContext, HookKernel, HookRegistry } from './types';
export { bulwarkHook } from './bulwark';
export { counterAttackHook } from './counterAttack';
export { dragonSurgeHook } from './dragonSurge';
export { markedQuarryHook } from './markedQuarry';
export { mendingEchoHook } from './mendingEcho';
export { pilferHook, pilferedCoin, pilferedTargets } from './pilfer';
export { reapHook } from './reap';
export { rootbindHook } from './rootbind';
export { spellEchoHook } from './spellEcho';

/**
 * Every built-in hook, one per id in `HOOK_IDS` (same order).
 * To add one: create `hooks/<name>.ts` exporting a `CombatHookImpl` and append it here.
 */
export const BUILTIN_HOOKS: readonly CombatHookImpl[] = [
  counterAttackHook,
  dragonSurgeHook,
  markedQuarryHook,
  mendingEchoHook,
  bulwarkHook,
  pilferHook,
  spellEchoHook,
  rootbindHook,
  reapHook,
];

export function createHookRegistry(impls: readonly CombatHookImpl[] = BUILTIN_HOOKS): HookRegistry {
  const byId = new Map<CombatHookId, CombatHookImpl>();
  for (const impl of impls) byId.set(impl.info.id, impl);
  const infos: readonly CombatHookInfo[] = [...byId.values()].map((h) => h.info);
  return {
    get: (id) => byId.get(id),
    list: () => infos,
  };
}
