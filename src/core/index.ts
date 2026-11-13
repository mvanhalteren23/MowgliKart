/**
 * EMBERWAKE core — pure, deterministic simulation.
 * Only depends on `@/types/contracts`; content arrives via the injected `GameDatabase`.
 */
import type { CoreServices, GameDatabase } from '@/types/contracts';
import { createCombat } from './combat';
import { createFusion } from './fusion';
import { createGear } from './gear';
import { createHookRegistry } from './hooks';
import { createProgression } from './progression';
import { createQuests } from './quests';

export function createCoreServices(db: GameDatabase): CoreServices {
  const registry = createHookRegistry();
  return {
    progression: createProgression(),
    gear: createGear(db, registry),
    fusion: createFusion(db),
    combat: createCombat(db, registry),
    quests: createQuests(db),
  };
}

export { next as rngNext, seed as rngSeed, hash01 } from './rng';
export { relicCurve } from './gear';
export { BaseHeroProfile, ProfileDecorator, ResonanceDecorator, SpiritDecorator, buildChain, type ProfileComponent } from './fusion';
export { BUILTIN_HOOKS, createHookRegistry, type CombatHookImpl, type HookContext, type HookKernel, type HitInfo } from './hooks';
export { heroCombatantId, enemyCombatantId } from './combat';
export { foldEvent } from './quests';
