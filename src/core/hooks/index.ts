import type { CombatHookId, CombatHookInfo } from '@/types/contracts';
import { counterAttackHook } from './counterAttack';
import type { CombatHookImpl, HookRegistry } from './types';

export type { CombatHookImpl, HitInfo, HookContext, HookKernel, HookRegistry } from './types';
export { counterAttackHook } from './counterAttack';

/** Every built-in hook. To add one: create `hooks/<name>.ts` and append it here. */
export const BUILTIN_HOOKS: readonly CombatHookImpl[] = [counterAttackHook];

export function createHookRegistry(impls: readonly CombatHookImpl[] = BUILTIN_HOOKS): HookRegistry {
  const byId = new Map<CombatHookId, CombatHookImpl>();
  for (const impl of impls) byId.set(impl.info.id, impl);
  const infos: readonly CombatHookInfo[] = [...byId.values()].map((h) => h.info);
  return {
    get: (id) => byId.get(id),
    list: () => infos,
  };
}
