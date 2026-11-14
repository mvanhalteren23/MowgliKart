import { describe, expect, it } from 'vitest';
import type { CombatAction, CombatState, EncounterSetup, PartyMemberSetup } from '@/types/contracts';
import { HOOK_IDS } from '@/types/contracts';
import { core, eventsSince, get, member, ofType, patch, runEnemies } from '../__fixtures__/helpers';
import { BUILTIN_HOOKS, createHookRegistry, pilferedTargets } from '../hooks';

const KAEL = 'hero:kael';
const TOBIN = 'hero:tobin';
const VESNA = 'hero:vesna';
const ORLA = 'hero:orla';
const DUMMY = 'enemy:0:en.dummy';
const DUMMY2 = 'enemy:1:en.dummy';
const BRUTE = 'enemy:0:en.brute';
const CASTER = 'enemy:0:en.caster';
const RAT0 = 'enemy:0:en.rat';
const RAT1 = 'enemy:1:en.rat';
const MOTH0 = 'enemy:0:en.glass';

const setup = (encounterId: string, party: PartyMemberSetup[], flags?: EncounterSetup['flags']): EncounterSetup => ({
  encounterId,
  party,
  liberatedRegions: 0,
  ...(flags ? { flags } : {}),
});
const wearing = (heroId: PartyMemberSetup['heroId'], gearId: string, o: Partial<PartyMemberSetup> = {}) => member(heroId, { loadout: { signature: gearId }, ...o });
const hooksOf = (before: CombatState, after: CombatState, hookId?: string) =>
  ofType(eventsSince(before, after), 'hook').filter((h) => hookId === undefined || h.hookId === hookId);
const counter = { hookId: HOOK_IDS.counterAttack, params: { chance: 1, power: 1 }, sourceGear: 'test.counter' };

function firstAliveEnemy(s: CombatState): string {
  const e = Object.values(s.combatants).filter((c) => c.side === 'enemy' && c.alive).map((c) => c.id).sort()[0];
  if (e === undefined) throw new Error('no enemy alive');
  return e;
}

/** Heroes basic-attack the first living enemy; enemies use the AI. */
function autoPlay(state: CombatState, maxSteps = 400, heroAction?: (s: CombatState) => CombatAction): CombatState {
  let s = state;
  for (let i = 0; i < maxSteps; i++) {
    if (s.phase === 'enemyTurn') s = core.combat.step(s, core.combat.chooseEnemyAction(s));
    else if (s.phase === 'awaitingInput') s = core.combat.step(s, heroAction ? heroAction(s) : { type: 'attack', targetId: firstAliveEnemy(s) });
    else break;
  }
  return s;
}

describe('hook registry covers every contract hook id', () => {
  it('registers exactly HOOK_IDS, one impl each, with the documented triggers', () => {
    const reg = createHookRegistry();
    expect(reg.list().map((h) => h.id)).toEqual(Object.values(HOOK_IDS));
    expect(BUILTIN_HOOKS).toHaveLength(Object.keys(HOOK_IDS).length);
    const trig = Object.fromEntries(reg.list().map((h) => [h.id, h.trigger]));
    expect(trig).toEqual({
      [HOOK_IDS.counterAttack]: 'onDamaged',
      [HOOK_IDS.dragonSurge]: 'onTurnStart',
      [HOOK_IDS.markedQuarry]: 'onAttackLanded',
      [HOOK_IDS.mendingEcho]: 'onTurnStart',
      [HOOK_IDS.bulwark]: 'onGuard',
      [HOOK_IDS.pilfer]: 'onAttackLanded',
      [HOOK_IDS.spellEcho]: 'onAttackLanded',
      [HOOK_IDS.rootbind]: 'onDamaged',
      [HOOK_IDS.reap]: 'onKill',
    });
    expect(core.gear.hooks()).toEqual(reg.list());
  });
});

describe('dragonSurge (onTurnStart while transformed)', () => {
  it('grants Sync and refunds AP each transformed turn, after the drain, before acting', () => {
    let s = core.combat.start(setup('enc.dummy', [wearing('kael', 'gear.surgeScale')]), 3);
    expect(hooksOf({ ...s, log: [] }, s)).toEqual([]); // not transformed at start
    s = patch(s, KAEL, { sync: 50 });
    s = core.combat.step(s, { type: 'transform', formId: 'form.cinderDrake' });
    expect(get(s, KAEL).sync).toBe(50);
    const b = s;
    s = runEnemies(s);
    const ev = eventsSince(b, s);
    const drain = ev.findIndex((e) => e.type === 'apChange' && e.targetId === KAEL && e.amount === -5);
    const hook = ev.findIndex((e) => e.type === 'hook' && e.hookId === HOOK_IDS.dragonSurge);
    expect(drain).toBeGreaterThan(-1);
    expect(hook).toBeGreaterThan(drain);
    expect(ev[hook]).toMatchObject({ ownerId: KAEL, sourceGear: 'gear.surgeScale', note: expect.stringContaining('surges') });
    expect(ev[hook + 1]).toEqual({ type: 'apChange', targetId: KAEL, amount: 4 });
    expect(get(s, KAEL)).toMatchObject({ sync: 60, ap: 50 - 5 + 4 });
    expect(s.activeId).toBe(KAEL);
  });

  it('never fires while untransformed, nor with chance 0, nor for non-wearers', () => {
    let s = core.combat.start(setup('enc.dummy', [wearing('kael', 'gear.surgeScale'), member('tobin')]), 3);
    s = autoPlay(s, 12);
    expect(ofType(s.log, 'hook')).toEqual([]);

    let z = core.combat.start(setup('enc.dummy', [member('kael')]), 3);
    z = patch(z, KAEL, { sync: 50, hooks: [{ hookId: HOOK_IDS.dragonSurge, params: { chance: 0, sync: 10, ap: 4 }, sourceGear: 'x' }] });
    z = runEnemies(core.combat.step(z, { type: 'transform', formId: 'form.cinderDrake' }));
    expect(ofType(z.log, 'hook')).toEqual([]);
  });
});

describe('markedQuarry (onAttackLanded)', () => {
  it('applies defDown to the struck foe with chance 1', () => {
    const s0 = core.combat.start(setup('enc.dummy', [wearing('tobin', 'gear.quarryFletch')]), 4);
    const s1 = core.combat.step(s0, { type: 'attack', targetId: DUMMY });
    const ev = eventsSince(s0, s1);
    const i = ev.findIndex((e) => e.type === 'hook');
    expect(ev[i - 1]).toMatchObject({ type: 'damage', targetId: DUMMY });
    expect(ev[i]).toMatchObject({ type: 'hook', ownerId: TOBIN, hookId: HOOK_IDS.markedQuarry, sourceGear: 'gear.quarryFletch' });
    expect(ev[i + 1]).toEqual({ type: 'status', targetId: DUMMY, status: 'defDown', applied: true });
    expect(get(s1, DUMMY).statuses).toContainEqual({ id: 'defDown', turns: 2, potency: 0.5 });
  });

  it('never with chance 0; only for the wearer; not on hook-generated hits', () => {
    const z0 = core.combat.start(setup('enc.dummy', [wearing('tobin', 'gear.quarryDull')]), 4);
    expect(hooksOf(z0, core.combat.step(z0, { type: 'attack', targetId: DUMMY }))).toEqual([]);

    // vesna (no gear) acts first and hits: nothing
    const w0 = core.combat.start(setup('enc.dummy', [wearing('tobin', 'gear.quarryFletch'), member('vesna')]), 4);
    expect(w0.activeId).toBe(VESNA);
    expect(hooksOf(w0, core.combat.step(w0, { type: 'attack', targetId: DUMMY }))).toEqual([]);

    // the brute hits tobin, tobin's counter lands — the counter must not mark
    let c0 = core.combat.start(setup('enc.brute', [member('tobin')]), 4);
    c0 = patch(c0, TOBIN, { hooks: [counter, { hookId: HOOK_IDS.markedQuarry, params: { chance: 1, turns: 2, potency: 0.5 }, sourceGear: 'q' }] });
    const c1 = core.combat.step(c0, core.combat.chooseEnemyAction(c0));
    expect(hooksOf(c0, c1).map((h) => h.hookId)).toEqual([HOOK_IDS.counterAttack]);
    expect(get(c1, BRUTE).statuses).toEqual([]);
  });
});

describe('mendingEcho (onTurnStart)', () => {
  it('heals the lowest-HP-fraction living ally by fraction × owner maxHp', () => {
    let s = core.combat.start(setup('enc.dummy', [member('kael'), wearing('tobin', 'gear.mendBell')]), 5);
    expect(ofType(s.log, 'hook')).toEqual([]); // everyone at full HP: silent, no rng
    expect(s.activeId).toBe(KAEL);
    s = patch(s, KAEL, { hp: 60 }); // 60/140 = 0.43
    s = patch(s, TOBIN, { hp: 50 }); // 50/100 = 0.50
    const b = s;
    s = core.combat.step(s, { type: 'guard' });
    expect(s.activeId).toBe(TOBIN);
    const ev = eventsSince(b, s);
    const i = ev.findIndex((e) => e.type === 'hook');
    expect(ev[i]).toMatchObject({ ownerId: TOBIN, hookId: HOOK_IDS.mendingEcho, sourceGear: 'gear.mendBell' });
    expect(ev[i + 1]).toEqual({ type: 'heal', targetId: KAEL, amount: 10 });
    expect(get(s, KAEL).hp).toBe(70);
  });

  it('only for the wearer, and never from a KO’d owner', () => {
    let s = core.combat.start(setup('enc.dummy', [member('kael'), wearing('tobin', 'gear.mendBell')]), 5);
    s = patch(s, TOBIN, { hp: 0, alive: false });
    s = patch(s, KAEL, { hp: 10 });
    s = autoPlay(s, 10);
    expect(ofType(s.log, 'hook')).toEqual([]);
  });
});

describe('bulwark (onGuard)', () => {
  it('refills fusion armor and grants guardUp to every living ally', () => {
    let s = core.combat.start(setup('enc.dummy', [wearing('kael', 'gear.bulwarkPlate', { fusion: ['ashka'] }), member('tobin')]), 6);
    expect(s.activeId).toBe(KAEL);
    const f = get(s, KAEL).fusion;
    if (!f) throw new Error('not fused');
    s = patch(s, KAEL, { fusion: { ...f, armor: 30 } });
    const b = s;
    s = core.combat.step(s, { type: 'guard' });
    const ev = eventsSince(b, s);
    const i = ev.findIndex((e) => e.type === 'hook');
    expect(ev[i - 1]).toEqual({ type: 'guard', actorId: KAEL });
    expect(ev[i]).toMatchObject({ ownerId: KAEL, hookId: HOOK_IDS.bulwark, sourceGear: 'gear.bulwarkPlate' });
    expect(get(s, KAEL).fusion?.armor).toBe(50);
    expect(get(s, KAEL).statuses).toContainEqual({ id: 'guardUp', turns: 2, potency: 0.5 });
    expect(get(s, TOBIN).statuses).toContainEqual({ id: 'guardUp', turns: 2, potency: 0.5 });
    expect(get(s, DUMMY).statuses).toEqual([]);
  });

  it('never with chance 0; never on attacks; only for the wearer', () => {
    const z = core.combat.start(setup('enc.dummy', [wearing('kael', 'gear.bulwarkDull')]), 6);
    expect(hooksOf(z, core.combat.step(z, { type: 'guard' }))).toEqual([]);
    const a = core.combat.start(setup('enc.dummy', [wearing('kael', 'gear.bulwarkPlate')]), 6);
    expect(hooksOf(a, core.combat.step(a, { type: 'attack', targetId: DUMMY }))).toEqual([]);
    let w = core.combat.start(setup('enc.dummy', [wearing('kael', 'gear.bulwarkPlate'), member('tobin')]), 6);
    w = core.combat.step(w, { type: 'attack', targetId: DUMMY }); // kael attacks; tobin is up
    expect(w.activeId).toBe(TOBIN);
    expect(hooksOf(w, core.combat.step(w, { type: 'guard' }))).toEqual([]);
  });
});

describe('pilfer (onAttackLanded, once per enemy, coin on victory)', () => {
  it('steals once per enemy and adds the coin to victory rewards', () => {
    const s = autoPlay(core.combat.start(setup('enc.rats', [wearing('vesna', 'gear.pilferGlove')]), 8));
    expect(s.phase).toBe('victory');
    const hooks = ofType(s.log, 'hook');
    expect(hooks).toHaveLength(2);
    expect(hooks.every((h) => h.hookId === HOOK_IDS.pilfer && h.ownerId === VESNA && h.sourceGear === 'gear.pilferGlove')).toBe(true);
    expect(hooks[0]?.note).toMatch(/pilfers 15 coin from Gloam Rat/);
    expect(pilferedTargets(s.log)).toEqual(new Set([RAT0, RAT1]));
    expect(ofType(s.log, 'attack').filter((a) => a.actorId === VESNA).length).toBeGreaterThan(2); // more hits than steals
    expect(s.rewards?.coin).toBe(4 + 4 + 15 + 15);
  });

  it('never with chance 0; only the wearer’s hits; not from counters', () => {
    const z = autoPlay(core.combat.start(setup('enc.rats', [wearing('vesna', 'gear.pilferDull')]), 8));
    expect(ofType(z.log, 'hook')).toEqual([]);
    expect(z.rewards?.coin).toBe(8);

    let w = core.combat.start(setup('enc.rats', [wearing('tobin', 'gear.pilferGlove'), member('vesna')]), 8);
    expect(w.activeId).toBe(VESNA);
    const w1 = core.combat.step(w, { type: 'attack', targetId: RAT0 });
    expect(hooksOf(w, w1)).toEqual([]);
    w = core.combat.step(w1, { type: 'attack', targetId: RAT0 }); // tobin
    expect(hooksOf(w1, w).map((h) => h.ownerId)).toEqual([TOBIN]);

    let c = core.combat.start(setup('enc.brute', [member('vesna')]), 8);
    c = patch(c, VESNA, { hooks: [counter, { hookId: HOOK_IDS.pilfer, params: { chance: 1, coin: 15 }, sourceGear: 'p' }] });
    const c1 = core.combat.step(c, core.combat.chooseEnemyAction(c));
    expect(hooksOf(c, c1).map((h) => h.hookId)).toEqual([HOOK_IDS.counterAttack]);
  });
});

describe('spellEcho (onAttackLanded, once per magical cast)', () => {
  it('repeats a single-target magical skill at reduced power without spending AP', () => {
    const s0 = core.combat.start(setup('enc.dummy', [wearing('orla', 'gear.echoLens')]), 9);
    expect(s0.activeId).toBe(ORLA);
    const s1 = core.combat.step(s0, { type: 'skill', skillId: 'skill.spark', targetId: DUMMY });
    const ev = eventsSince(s0, s1);
    expect(ofType(ev, 'apChange')).toEqual([{ type: 'apChange', targetId: ORLA, amount: -2 }]);
    const i = ev.findIndex((e) => e.type === 'hook');
    expect(ev[i]).toMatchObject({ ownerId: ORLA, hookId: HOOK_IDS.spellEcho, sourceGear: 'gear.echoLens' });
    expect(ev[i + 1]).toEqual({ type: 'attack', actorId: ORLA, targetId: DUMMY, skillId: 'skill.spark', element: 'fire' });
    const dmg = ofType(ev, 'damage');
    expect(dmg).toHaveLength(2);
    const [first, echo] = dmg;
    expect(echo?.amount ?? 0).toBeLessThan(first?.amount ?? 0);
    expect(echo?.amount ?? 0).toBeGreaterThanOrEqual(Math.floor((first?.amount ?? 0) * 0.5 * 0.8));
    expect(ofType(ev, 'hook')).toHaveLength(1); // the echo never echoes
  });

  it('echoes an AoE cast once (all targets again), not once per target', () => {
    const s0 = core.combat.start(setup('enc.pair', [wearing('orla', 'gear.echoLens')]), 9);
    const s1 = core.combat.step(s0, { type: 'skill', skillId: 'skill.cinderRain' });
    const ev = eventsSince(s0, s1);
    expect(ofType(ev, 'hook')).toHaveLength(1);
    expect(ofType(ev, 'damage').map((d) => d.targetId)).toEqual([DUMMY, DUMMY2, DUMMY, DUMMY2]);
    expect(ofType(ev, 'apChange')).toEqual([{ type: 'apChange', targetId: ORLA, amount: -3 }]);
  });

  it('never with chance 0, never on basic attacks, only for the wearer', () => {
    const z = core.combat.start(setup('enc.dummy', [wearing('orla', 'gear.echoDull')]), 9);
    expect(hooksOf(z, core.combat.step(z, { type: 'skill', skillId: 'skill.spark', targetId: DUMMY }))).toEqual([]);
    const a = core.combat.start(setup('enc.dummy', [wearing('orla', 'gear.echoLens')]), 9);
    expect(hooksOf(a, core.combat.step(a, { type: 'attack', targetId: DUMMY }))).toEqual([]);
    let w = core.combat.start(setup('enc.dummy', [wearing('orla', 'gear.echoLens'), member('kael', { level: 5 })]), 9);
    w = core.combat.step(w, { type: 'guard' }); // orla
    expect(w.activeId).toBe(KAEL);
    expect(hooksOf(w, core.combat.step(w, { type: 'skill', skillId: 'skill.flameLash', targetId: DUMMY }))).toEqual([]);
  });

  it('does not echo a physical skill', () => {
    let s = core.combat.start(setup('enc.pair', [member('vesna')]), 9);
    s = patch(s, VESNA, { hooks: [{ hookId: HOOK_IDS.spellEcho, params: { chance: 1, power: 0.5 }, sourceGear: 'e' }] });
    expect(hooksOf(s, core.combat.step(s, { type: 'skill', skillId: 'skill.sweep' }))).toEqual([]);
  });
});

describe('rootbind (onDamaged)', () => {
  it('stuns the attacker (physical or magical); the stunned foe loses its next turn', () => {
    const s0 = core.combat.start(setup('enc.brute', [wearing('tobin', 'gear.rootCharm')]), 10);
    const s1 = core.combat.step(s0, core.combat.chooseEnemyAction(s0));
    const ev = eventsSince(s0, s1);
    const i = ev.findIndex((e) => e.type === 'hook');
    expect(ev[i - 1]).toMatchObject({ type: 'damage', targetId: TOBIN });
    expect(ev[i]).toMatchObject({ ownerId: TOBIN, hookId: HOOK_IDS.rootbind, sourceGear: 'gear.rootCharm' });
    expect(ev[i + 1]).toEqual({ type: 'status', targetId: BRUTE, status: 'stun', applied: true });
    expect(s1.activeId).toBe(TOBIN);
    const s2 = core.combat.step(s1, { type: 'guard' });
    expect(s2.activeId).toBe(TOBIN); // brute's turn skipped
    expect(ofType(eventsSince(s1, s2), 'attack')).toEqual([]);

    const m0 = core.combat.start(setup('enc.caster', [wearing('tobin', 'gear.rootCharm')]), 10);
    const m1 = core.combat.step(m0, core.combat.chooseEnemyAction(m0));
    expect(hooksOf(m0, m1).map((h) => h.hookId)).toEqual([HOOK_IDS.rootbind]);
    expect(get(m1, CASTER).statuses.map((x) => x.id)).toEqual(['stun']);
  });

  it('never with chance 0; only for the wearer; not from counter hits; not when KO’d', () => {
    const z0 = core.combat.start(setup('enc.brute', [wearing('tobin', 'gear.rootDull')]), 10);
    expect(hooksOf(z0, core.combat.step(z0, core.combat.chooseEnemyAction(z0)))).toEqual([]);

    const w0 = core.combat.start(setup('enc.brute', [member('tobin'), wearing('vesna', 'gear.rootCharm')]), 10);
    const w1 = core.combat.step(w0, core.combat.chooseEnemyAction(w0));
    expect(ofType(eventsSince(w0, w1), 'damage')[0]?.targetId).toBe(TOBIN);
    expect(hooksOf(w0, w1)).toEqual([]);

    let c0 = core.combat.start(setup('enc.dummy', [wearing('tobin', 'gear.rootCharm')]), 10);
    c0 = patch(c0, DUMMY, { hooks: [counter] });
    const c1 = core.combat.step(c0, { type: 'attack', targetId: DUMMY });
    expect(hooksOf(c0, c1).map((h) => h.hookId)).toEqual([HOOK_IDS.counterAttack]);
    expect(get(c1, DUMMY).statuses).toEqual([]);

    const k0 = core.combat.start(setup('enc.brute', [wearing('tobin', 'gear.rootCharm', { hp: 1 })]), 10);
    const k1 = core.combat.step(k0, core.combat.chooseEnemyAction(k0));
    expect(k1.phase).toBe('defeat');
    expect(hooksOf(k0, k1)).toEqual([]);
  });
});

describe('reap (onKill)', () => {
  it('restores AP and grants atkUp on the owner’s kill', () => {
    let s = core.combat.start(setup('enc.glass', [wearing('vesna', 'gear.reapSickle')]), 11);
    s = patch(s, VESNA, { ap: 0 });
    const b = s;
    s = core.combat.step(s, { type: 'attack', targetId: MOTH0 });
    const ev = eventsSince(b, s);
    const ko = ev.findIndex((e) => e.type === 'ko');
    const i = ev.findIndex((e) => e.type === 'hook');
    expect(i).toBeGreaterThan(ko);
    expect(ev[i]).toMatchObject({ ownerId: VESNA, hookId: HOOK_IDS.reap, sourceGear: 'gear.reapSickle', note: expect.stringContaining('Glass Moth') });
    expect(ev[i + 1]).toEqual({ type: 'apChange', targetId: VESNA, amount: 6 });
    expect(get(s, VESNA).statuses).toContainEqual({ id: 'atkUp', turns: 2, potency: 0.5 });
  });

  it('never with chance 0; not on non-lethal hits; only the wearer’s kills; not counter kills', () => {
    const z0 = core.combat.start(setup('enc.glass', [wearing('vesna', 'gear.reapDull')]), 11);
    expect(hooksOf(z0, core.combat.step(z0, { type: 'attack', targetId: MOTH0 }))).toEqual([]);

    const n0 = core.combat.start(setup('enc.dummy', [wearing('vesna', 'gear.reapSickle')]), 11);
    expect(hooksOf(n0, core.combat.step(n0, { type: 'attack', targetId: DUMMY }))).toEqual([]);

    let w = core.combat.start(setup('enc.glass', [wearing('vesna', 'gear.reapSickle'), member('tobin')]), 11);
    w = core.combat.step(w, { type: 'guard' }); // vesna
    expect(w.activeId).toBe(TOBIN);
    const w1 = core.combat.step(w, { type: 'attack', targetId: MOTH0 });
    expect(get(w1, MOTH0).alive).toBe(false);
    expect(hooksOf(w, w1)).toEqual([]);

    let c = core.combat.start(setup('enc.glass', [member('vesna')]), 11);
    c = patch(c, VESNA, { hooks: [counter, { hookId: HOOK_IDS.reap, params: { ap: 6, potency: 0.5, turns: 2 }, sourceGear: 'r' }] });
    c = core.combat.step(c, { type: 'guard' });
    const c1 = core.combat.step(c, core.combat.chooseEnemyAction(c)); // moth hits → counter kills it
    expect(ofType(eventsSince(c, c1), 'ko').length).toBeGreaterThan(0);
    expect(hooksOf(c, c1).map((h) => h.hookId)).toEqual([HOOK_IDS.counterAttack]);
  });
});

describe('hooks replay deterministically', () => {
  const party = (): PartyMemberSetup[] => [
    wearing('kael', 'gear.surgeScale', { fusion: ['ashka'] }),
    wearing('tobin', 'gear.quarryFletch'),
    wearing('vesna', 'gear.pilferGlove'),
    wearing('orla', 'gear.echoLens'),
  ];
  const policy = (s: CombatState): CombatAction => {
    if (s.activeId === ORLA && get(s, ORLA).ap >= 3) return { type: 'skill', skillId: 'skill.cinderRain' };
    if (s.activeId === KAEL && get(s, KAEL).dragon === null && core.combat.availableForms(s, KAEL).some((f) => f.formId === 'form.cinderDrake' && f.usable)) {
      return { type: 'transform', formId: 'form.cinderDrake' };
    }
    return { type: 'attack', targetId: firstAliveEnemy(s) };
  };
  it('same seed ⇒ deep-equal; different seed ⇒ differs', () => {
    const run = (seed: number) => autoPlay(core.combat.start(setup('enc.rats', party()), seed), 400, policy);
    const a = run(77);
    const b = run(77);
    expect(a).toEqual(b);
    expect(a.phase).toBe('victory');
    expect(ofType(a.log, 'hook').length).toBeGreaterThan(0);
    expect(run(78).log).not.toEqual(a.log);
  });
});
