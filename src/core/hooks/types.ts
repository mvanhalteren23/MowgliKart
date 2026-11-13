import type {
  CombatEvent,
  CombatHookId,
  CombatHookInfo,
  CombatantId,
  CombatState,
  Element,
  GearId,
  SkillId,
} from '@/types/contracts';

/** Description of a single damaging hit, passed to hit-related hooks. */
export interface HitInfo {
  readonly attackerId: CombatantId;
  readonly targetId: CombatantId;
  /** Scaling kind: physical = atk vs def, magical = mag vs res. */
  readonly kind: 'physical' | 'magical';
  readonly element: Element;
  /** False for AoE (`allEnemies`) hits. */
  readonly singleTarget: boolean;
  /** True when this hit is itself a hook-triggered counter (prevents chains). */
  readonly isCounter: boolean;
  /** HP actually lost by the target (0 for `onBeforeDamage`). */
  readonly amount: number;
  readonly skillId?: SkillId;
}

/**
 * The narrow slice of the combat machine a hook may use. Supplied by the
 * combat module at call time so hook files never import combat internals.
 */
export interface HookKernel {
  roll(state: CombatState): { readonly value: number; readonly state: CombatState };
  emit(state: CombatState, event: CombatEvent): CombatState;
  /** A full basic attack (attack + damage events, armor, KO, hooks). */
  basicAttack(state: CombatState, actorId: CombatantId, targetId: CombatantId, opts: { readonly power: number; readonly isCounter: boolean }): CombatState;
}

export interface HookContext {
  readonly state: CombatState;
  readonly ownerId: CombatantId;
  readonly params: Readonly<Record<string, number>>;
  readonly sourceGear: GearId;
  readonly kernel: HookKernel;
  /** Present for onBeforeDamage / onDamaged / onAttackLanded / onKill. */
  readonly hit?: HitInfo;
}

/**
 * One combat hook = one file exporting a `CombatHookImpl`, listed in
 * `hooks/index.ts`. `run` is pure: it returns the next state (or the same one
 * when it does nothing).
 */
export interface CombatHookImpl {
  readonly info: CombatHookInfo;
  run(ctx: HookContext): CombatState;
}

export interface HookRegistry {
  get(id: CombatHookId): CombatHookImpl | undefined;
  list(): readonly CombatHookInfo[];
}
