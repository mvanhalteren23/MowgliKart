/**
 * Effective-value layering for a combatant:
 *
 *   baseStats (level + gear)  →  fusion (unless broken OR transformed)  →  dragon form  →  statuses
 *
 * Transformation SUPPRESSES fusion bonuses (stats, affinities, granted skills,
 * imbue) while active — the dragon form replaces the hero's kit — but the
 * fusion's armor pool keeps absorbing damage.
 *
 * Status potencies are fractions: atkUp atk×(1+p), guardUp def×(1+p),
 * defDown def×(1−p), soak spd×(1−p); burn / regen tick p × maxHp.
 */
import type { Affinities, Combatant, CombatantId, CombatState, DragonFormDef, Element, FusedProfile, SkillId, Stats } from '@/types/contracts';
import { buildChain } from '../fusion';
import { clamp, floorStats, makeStats, mulAffinities, mulStats } from '../stats';
import type { CombatCtx } from './context';

export function dragonForm(ctx: CombatCtx, c: Combatant): DragonFormDef | undefined {
  return c.dragon ? ctx.db.dragonForms[c.dragon.formId] : undefined;
}

export function fusionActive(c: Combatant): boolean {
  return c.heroId !== undefined && c.fusion !== null && !c.fusion.broken && c.dragon === null && c.fusion.spirits.length > 0;
}

export function fusedProfile(ctx: CombatCtx, c: Combatant): FusedProfile | null {
  if (!fusionActive(c) || c.heroId === undefined || c.fusion === null) return null;
  return buildChain(ctx.db, ctx.db.heroes[c.heroId], c.baseStats, c.baseSkills, c.fusion.spirits).resolve();
}

/** Stats with fusion + dragon layers, before statuses. */
export function layeredStats(ctx: CombatCtx, c: Combatant): Stats {
  let s = fusedProfile(ctx, c)?.stats ?? c.baseStats;
  const form = dragonForm(ctx, c);
  if (form) s = mulStats(s, form.statMultipliers);
  return floorStats(s);
}

export function statsFor(ctx: CombatCtx, c: Combatant): Stats {
  const s = layeredStats(ctx, c);
  let atkMul = 1;
  let defMul = 1;
  let spdMul = 1;
  for (const st of c.statuses) {
    const p = st.potency;
    if (st.id === 'atkUp') atkMul *= 1 + Math.max(0, p);
    else if (st.id === 'guardUp') defMul *= 1 + Math.max(0, p);
    else if (st.id === 'defDown') defMul *= 1 - clamp(p, 0, 0.9);
    else if (st.id === 'soak') spdMul *= 1 - clamp(p, 0, 0.9);
  }
  return floorStats(makeStats((k) => (k === 'atk' ? s.atk * atkMul : k === 'def' ? s.def * defMul : k === 'spd' ? s.spd * spdMul : s[k])));
}

export function effectiveStats(ctx: CombatCtx, state: CombatState, id: CombatantId): Stats {
  const c = state.combatants[id];
  if (!c) throw new Error(`Unknown combatant ${id}`);
  return statsFor(ctx, c);
}

export function affinitiesFor(ctx: CombatCtx, c: Combatant): Affinities {
  let a = fusedProfile(ctx, c)?.affinities ?? c.baseAffinities;
  const form = dragonForm(ctx, c);
  if (form) a = mulAffinities(a, form.affinities);
  return a;
}

export function skillsFor(ctx: CombatCtx, c: Combatant): readonly SkillId[] {
  const form = dragonForm(ctx, c);
  if (form) return form.skills;
  return fusedProfile(ctx, c)?.skills ?? c.baseSkills;
}

export function basicElementFor(ctx: CombatCtx, c: Combatant): Element {
  const form = dragonForm(ctx, c);
  if (form) return form.element;
  return fusedProfile(ctx, c)?.basicAttackElement ?? 'physical';
}

/** Keep hp/ap within the (possibly changed) effective maxima. */
export function clampVitals(ctx: CombatCtx, state: CombatState, id: CombatantId): CombatState {
  const c = state.combatants[id];
  if (!c) return state;
  const s = statsFor(ctx, c);
  const hp = Math.min(c.hp, s.maxHp);
  const ap = Math.min(c.ap, s.maxAp);
  if (hp === c.hp && ap === c.ap) return state;
  return { ...state, combatants: { ...state.combatants, [id]: { ...c, hp, ap } } };
}
