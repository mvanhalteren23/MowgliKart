/**
 * Turn sequencing: round order, turn-start ticks, end detection and rewards.
 *
 * Turn start for the actor (in this order):
 *   1. `turnStart` event; guard from its previous turn ends.
 *   2. Broken fusion: `brokenTurns` −1; on reaching 0 → `armorRestore`, armor refilled.
 *   3. Dragon form: if `turnsInForm ≥ maxTurns` → revert('maxTurns'); else if AP
 *      can't pay `apDrainPerTurn` → revert('apDepleted'); else pay and turnsInForm +1.
 *      A reverted actor still acts this turn in base form.
 *   4. Statuses: burn (p × maxHp, ignores armor/affinity), regen (p × maxHp);
 *      every status' `turns` −1, expiring ones emit `status{applied:false}`.
 *      A stun present at turn start skips the turn.
 *   5. `onTurnStart` hooks.
 */
import type { Combatant, CombatantId, CombatRewards, CombatState, ItemId } from '@/types/contracts';
import { aliveOnSide, allCombatants, emit, patchC, roll, type CombatCtx } from './context';
import { changeAp, heal, knockOut, revertForm, runHooks } from './damage';
import { statsFor } from './effective';

export function computeOrder(ctx: CombatCtx, state: CombatState): readonly CombatantId[] {
  return allCombatants(state)
    .filter((c) => c.alive)
    .map((c) => ({ id: c.id, spd: statsFor(ctx, c).spd }))
    .sort((a, b) => b.spd - a.spd || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((x) => x.id);
}

export function isOver(state: CombatState): boolean {
  return state.phase === 'victory' || state.phase === 'defeat' || state.phase === 'fled';
}

function computeRewards(ctx: CombatCtx, state: CombatState): { readonly rewards: CombatRewards; readonly state: CombatState } {
  let s = state;
  let xp = 0;
  let coin = 0;
  const qty = new Map<ItemId, number>();
  for (const c of allCombatants(state)) {
    if (c.side !== 'enemy' || c.enemyId === undefined) continue;
    const def = ctx.db.enemies[c.enemyId];
    if (!def) continue;
    xp += def.xp;
    coin += def.coin;
    for (const d of def.drops) {
      const r = roll(s);
      s = r.state;
      if (r.value < d.chance) qty.set(d.itemId, (qty.get(d.itemId) ?? 0) + 1);
    }
  }
  const enc = ctx.db.encounters[state.encounterId];
  const rewards: CombatRewards = {
    xp,
    coin,
    items: [...qty.entries()].map(([itemId, n]) => ({ itemId, qty: n })),
    ...(enc?.liberatesRegion !== undefined ? { liberatesRegion: enc.liberatesRegion } : {}),
  };
  return { rewards, state: s };
}

/** Victory/defeat detection; returns the state unchanged when the battle continues. */
export function checkEnd(ctx: CombatCtx, state: CombatState): CombatState {
  if (isOver(state)) return state;
  if (aliveOnSide(state, 'enemy').length === 0) {
    const r = computeRewards(ctx, state);
    return emit({ ...r.state, phase: 'victory', activeId: null, rewards: r.rewards }, { type: 'end', outcome: 'victory' });
  }
  if (aliveOnSide(state, 'party').length === 0) {
    return emit({ ...state, phase: 'defeat', activeId: null }, { type: 'end', outcome: 'defeat' });
  }
  return state;
}

function tickFusion(state: CombatState, c: Combatant): CombatState {
  const f = c.fusion;
  if (f === null || !f.broken) return state;
  const left = f.brokenTurns - 1;
  if (left > 0) return patchC(state, c.id, (x) => ({ ...x, fusion: { ...f, brokenTurns: left } }));
  const s = patchC(state, c.id, (x) => ({ ...x, fusion: { ...f, broken: false, brokenTurns: 0, armor: f.armorMax } }));
  return emit(s, { type: 'armorRestore', targetId: c.id });
}

function tickDragon(ctx: CombatCtx, state: CombatState, id: CombatantId): CombatState {
  const c = state.combatants[id];
  if (!c || c.dragon === null) return state;
  const form = ctx.db.dragonForms[c.dragon.formId];
  if (!form) return revertForm(ctx, state, id, 'manual');
  if (c.dragon.turnsInForm >= form.maxTurns) return revertForm(ctx, state, id, 'maxTurns');
  if (c.ap < form.apDrainPerTurn) return revertForm(ctx, state, id, 'apDepleted');
  const dragon = { ...c.dragon, turnsInForm: c.dragon.turnsInForm + 1 };
  const s = patchC(state, id, (x) => ({ ...x, dragon }));
  return form.apDrainPerTurn > 0 ? changeAp(ctx, s, id, -form.apDrainPerTurn) : s;
}

function tickStatuses(ctx: CombatCtx, state: CombatState, id: CombatantId): { readonly state: CombatState; readonly stunned: boolean } {
  const c0 = state.combatants[id];
  if (!c0) return { state, stunned: false };
  const stunned = c0.statuses.some((st) => st.id === 'stun');
  let s = state;
  for (const st of c0.statuses) {
    const c = s.combatants[id];
    if (!c || !c.alive) break;
    const maxHp = statsFor(ctx, c).maxHp;
    if (st.id === 'burn') {
      const amount = Math.min(c.hp, Math.max(1, Math.floor(maxHp * st.potency)));
      s = patchC(s, id, (x) => ({ ...x, hp: x.hp - amount }));
      s = emit(s, { type: 'damage', targetId: id, amount, element: 'fire', crit: false, affinity: 'neutral', absorbedByArmor: 0 });
      if (c.hp - amount <= 0) return { state: knockOut(ctx, s, id), stunned };
    } else if (st.id === 'regen') {
      s = heal(ctx, s, id, Math.max(1, Math.floor(maxHp * st.potency)));
    }
  }
  const c = s.combatants[id];
  if (!c) return { state: s, stunned };
  const kept = c.statuses.map((st) => ({ ...st, turns: st.turns - 1 }));
  s = patchC(s, id, (x) => ({ ...x, statuses: kept.filter((st) => st.turns > 0) }));
  for (const st of kept) if (st.turns <= 0) s = emit(s, { type: 'status', targetId: id, status: st.id, applied: false });
  return { state: s, stunned };
}

/** Process the start of `id`'s turn. `canAct` is false when it was KO'd or stunned. */
export function beginTurn(ctx: CombatCtx, state: CombatState, id: CombatantId): { readonly state: CombatState; readonly canAct: boolean } {
  const c = state.combatants[id];
  if (!c || !c.alive) return { state, canAct: false };
  let s = emit(state, { type: 'turnStart', actorId: id, round: state.round });
  s = patchC(s, id, (x) => ({ ...x, guarding: false }));
  s = tickFusion(s, c);
  s = tickDragon(ctx, s, id);
  const st = tickStatuses(ctx, s, id);
  s = st.state;
  if (!s.combatants[id]?.alive) return { state: checkEnd(ctx, s), canAct: false };
  s = runHooks(ctx, s, id, 'onTurnStart');
  s = checkEnd(ctx, s);
  const alive = s.combatants[id]?.alive ?? false;
  return { state: s, canAct: alive && !st.stunned };
}

/** Move to the next combatant that can act (starting new rounds as needed). */
export function advance(ctx: CombatCtx, state: CombatState): CombatState {
  let s = checkEnd(ctx, state);
  let idx = s.turnIndex + 1;
  for (let guard = 0; guard < 100000; guard++) {
    if (isOver(s)) return s;
    if (idx >= s.order.length) {
      s = { ...s, round: s.round + 1 };
      s = { ...s, order: computeOrder(ctx, s) };
      idx = 0;
      if (s.order.length === 0) return checkEnd(ctx, s);
    }
    const id = s.order[idx];
    const c = id === undefined ? undefined : s.combatants[id];
    if (id === undefined || !c || !c.alive) {
      idx += 1;
      continue;
    }
    s = { ...s, turnIndex: idx, activeId: id };
    const r = beginTurn(ctx, s, id);
    s = r.state;
    if (isOver(s)) return s;
    if (r.canAct) return { ...s, phase: c.side === 'party' ? 'awaitingInput' : 'enemyTurn' };
    idx += 1;
  }
  throw new Error('combat: advance did not converge');
}
