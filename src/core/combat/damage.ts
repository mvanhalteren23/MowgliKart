/**
 * Hit resolution, armor break, KO, healing, statuses and hook dispatch.
 *
 * Damage (before armor):
 *   physical: atk × power × 100 / (100 + def)
 *   magical : mag × power × 100 / (100 + res)
 *   × affinity (target, element)  × 0.5 if guarding  × 1.5 on crit  × variance (0.90..1.10)
 *   floored, minimum 1 (0 only when immune).
 * Crit chance = clamp(luck / 200, 0, 0.5). Two rng draws per hit: crit, then variance.
 *
 * Armor Break: a fused, unbroken host with armor > 0 has its armor chipped by
 * the FULL pre-armor damage while taking 70 % (`absorbedByArmor` = the 30 %).
 * Reaching 0 emits `armorBreak` and suppresses fusion for FUSION_BREAK_TURNS.
 */
import type { CombatantId, CombatHookTrigger, CombatState, Element, SkillId, StatusInstance } from '@/types/contracts';
import { FUSION_BREAK_TURNS } from '@/types/contracts';
import type { HitInfo, HookKernel } from '../hooks';
import { clamp } from '../stats';
import { emit, gainSync, patchC, roll, SYNC_ON_HIT, type CombatCtx } from './context';
import { affinitiesFor, basicElementFor, clampVitals, statsFor } from './effective';

export const GUARD_FACTOR = 0.5;
export const CRIT_MULTIPLIER = 1.5;
export const ARMOR_ABSORB = 0.3;

export interface HitSpec {
  readonly kind: 'physical' | 'magical';
  readonly power: number;
  readonly element: Element;
  readonly singleTarget: boolean;
  readonly isCounter: boolean;
  readonly skillId?: SkillId;
}

export function makeKernel(ctx: CombatCtx): HookKernel {
  return {
    roll,
    emit: (s, e) => emit(s, e),
    basicAttack: (s, actorId, targetId, opts) => basicAttack(ctx, s, actorId, targetId, opts),
  };
}

export function runHooks(ctx: CombatCtx, state: CombatState, ownerId: CombatantId, trigger: CombatHookTrigger, hit?: HitInfo): CombatState {
  const owner = state.combatants[ownerId];
  if (!owner || owner.hooks.length === 0) return state;
  let s = state;
  const kernel = makeKernel(ctx);
  for (const h of owner.hooks) {
    const impl = ctx.registry.get(h.hookId);
    if (!impl || impl.info.trigger !== trigger) continue;
    s = impl.run(hit ? { state: s, ownerId, params: h.params, sourceGear: h.sourceGear, kernel, hit } : { state: s, ownerId, params: h.params, sourceGear: h.sourceGear, kernel });
  }
  return s;
}

export function revertForm(ctx: CombatCtx, state: CombatState, id: CombatantId, reason: 'manual' | 'apDepleted' | 'maxTurns' | 'ko'): CombatState {
  const c = state.combatants[id];
  if (!c || c.dragon === null) return state;
  const s = emit(
    patchC(state, id, (x) => ({ ...x, dragon: null, sync: 0 })),
    { type: 'revert', actorId: id, reason },
  );
  return clampVitals(ctx, s, id);
}

export function knockOut(ctx: CombatCtx, state: CombatState, id: CombatantId): CombatState {
  let s = patchC(state, id, (x) => ({ ...x, hp: 0, alive: false, guarding: false, statuses: [] }));
  s = emit(s, { type: 'ko', targetId: id });
  return revertForm(ctx, s, id, 'ko');
}

export function basicAttack(
  ctx: CombatCtx,
  state: CombatState,
  actorId: CombatantId,
  targetId: CombatantId,
  opts: { readonly power: number; readonly isCounter: boolean },
): CombatState {
  const actor = state.combatants[actorId];
  if (!actor) return state;
  return performHit(ctx, state, actorId, targetId, {
    kind: 'physical',
    power: opts.power,
    element: basicElementFor(ctx, actor),
    singleTarget: true,
    isCounter: opts.isCounter,
  });
}

function affinityLabel(m: number): 'weak' | 'resist' | 'neutral' | 'immune' {
  if (m === 0) return 'immune';
  if (m > 1) return 'weak';
  if (m < 1) return 'resist';
  return 'neutral';
}

export function performHit(ctx: CombatCtx, state: CombatState, actorId: CombatantId, targetId: CombatantId, spec: HitSpec): CombatState {
  let s = emit(state, spec.skillId !== undefined
    ? { type: 'attack', actorId, targetId, skillId: spec.skillId, element: spec.element }
    : { type: 'attack', actorId, targetId, element: spec.element });

  const baseHit: HitInfo = {
    attackerId: actorId,
    targetId,
    kind: spec.kind,
    element: spec.element,
    singleTarget: spec.singleTarget,
    isCounter: spec.isCounter,
    amount: 0,
    ...(spec.skillId !== undefined ? { skillId: spec.skillId } : {}),
  };
  s = runHooks(ctx, s, targetId, 'onBeforeDamage', baseHit);

  const attacker = s.combatants[actorId];
  const target = s.combatants[targetId];
  if (!attacker || !target || !target.alive) return s;

  const as = statsFor(ctx, attacker);
  const ds = statsFor(ctx, target);
  const raw = spec.kind === 'physical'
    ? as.atk * spec.power * (100 / (100 + ds.def))
    : as.mag * spec.power * (100 / (100 + ds.res));
  const aff = affinitiesFor(ctx, target)[spec.element] ?? 1;
  const guard = target.guarding ? GUARD_FACTOR : 1;

  const critRoll = roll(s);
  s = critRoll.state;
  const crit = aff !== 0 && critRoll.value < clamp(as.luck / 200, 0, 0.5);
  const varRoll = roll(s);
  s = varRoll.state;
  const variance = 0.9 + varRoll.value * 0.2;

  const dmg = aff === 0 ? 0 : Math.max(1, Math.floor(raw * aff * guard * (crit ? CRIT_MULTIPLIER : 1) * variance));

  let amount = dmg;
  let absorbed = 0;
  let broke = false;
  let fusion = target.fusion;
  if (fusion !== null && !fusion.broken && fusion.armor > 0 && dmg > 0) {
    absorbed = Math.floor(dmg * ARMOR_ABSORB);
    amount = dmg - absorbed;
    const armor = Math.max(0, fusion.armor - dmg);
    broke = armor === 0;
    fusion = broke ? { ...fusion, armor: 0, broken: true, brokenTurns: FUSION_BREAK_TURNS } : { ...fusion, armor };
  }
  const hp = Math.max(0, target.hp - amount);
  s = patchC(s, targetId, (x) => ({ ...x, hp, fusion }));
  s = emit(s, { type: 'damage', targetId, amount, element: spec.element, crit, affinity: affinityLabel(aff), absorbedByArmor: absorbed });
  if (broke) {
    s = emit(s, { type: 'armorBreak', targetId });
    s = clampVitals(ctx, s, targetId);
  }
  const killed = hp === 0;
  if (killed) s = knockOut(ctx, s, targetId);
  else s = gainSync(ctx, s, targetId, SYNC_ON_HIT);

  const hit: HitInfo = { ...baseHit, amount };
  s = runHooks(ctx, s, targetId, 'onDamaged', hit);
  s = runHooks(ctx, s, actorId, 'onAttackLanded', hit);
  if (killed) s = runHooks(ctx, s, actorId, 'onKill', hit);
  return s;
}

export function heal(ctx: CombatCtx, state: CombatState, targetId: CombatantId, amount: number): CombatState {
  const c = state.combatants[targetId];
  if (!c || !c.alive) return state;
  const max = statsFor(ctx, c).maxHp;
  const actual = Math.max(0, Math.min(Math.floor(amount), max - c.hp));
  const s = patchC(state, targetId, (x) => ({ ...x, hp: x.hp + actual }));
  return emit(s, { type: 'heal', targetId, amount: actual });
}

export function changeAp(ctx: CombatCtx, state: CombatState, targetId: CombatantId, delta: number): CombatState {
  const c = state.combatants[targetId];
  if (!c) return state;
  const max = statsFor(ctx, c).maxAp;
  const ap = clamp(c.ap + Math.trunc(delta), 0, max);
  if (ap === c.ap) return state;
  return emit(patchC(state, targetId, (x) => ({ ...x, ap })), { type: 'apChange', targetId, amount: ap - c.ap });
}

/** Apply (or refresh) a status. Same-id statuses are replaced, never stacked. */
export function applyStatus(state: CombatState, targetId: CombatantId, inst: StatusInstance): CombatState {
  const c = state.combatants[targetId];
  if (!c || !c.alive || inst.turns <= 0) return state;
  const s = patchC(state, targetId, (x) => ({ ...x, statuses: [...x.statuses.filter((st) => st.id !== inst.id), inst] }));
  return emit(s, { type: 'status', targetId, status: inst.id, applied: true });
}
