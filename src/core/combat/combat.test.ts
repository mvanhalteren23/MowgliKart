import { describe, expect, it } from 'vitest';
import type { CombatAction, CombatState, EncounterSetup } from '@/types/contracts';
import { core, eventsSince, get, member, ofType, patch, runEnemies } from '../__fixtures__/helpers';

const KAEL = 'hero:kael';
const VESNA = 'hero:vesna';
const TOBIN = 'hero:tobin';
const RAT0 = 'enemy:0:en.rat';
const RAT1 = 'enemy:1:en.rat';
const DUMMY = 'enemy:0:en.dummy';

function setup(encounterId: string, party = [member('kael')]): EncounterSetup {
  return { encounterId, party, liberatedRegions: 0 };
}

/** Heroes basic-attack the first living enemy; enemies use the AI. */
function autoplay(state: CombatState, maxSteps = 400): CombatState {
  let s = state;
  for (let i = 0; i < maxSteps; i++) {
    if (s.phase === 'enemyTurn') s = core.combat.step(s, core.combat.chooseEnemyAction(s));
    else if (s.phase === 'awaitingInput') {
      const target = Object.values(s.combatants).find((c) => c.side === 'enemy' && c.alive);
      if (!target) break;
      s = core.combat.step(s, { type: 'attack', targetId: target.id });
    } else break;
  }
  return s;
}

describe('combat start & turn order', () => {
  it('fields heroes and enemies with contract ids and clamps vitals', () => {
    const s = core.combat.start(setup('enc.rats', [member('kael', { hp: 99999, ap: -5 }), member('vesna')]), 1);
    expect(Object.keys(s.combatants).sort()).toEqual([RAT0, RAT1, KAEL, VESNA].sort());
    expect(get(s, KAEL).hp).toBe(120);
    expect(get(s, KAEL).ap).toBe(0);
    expect(get(s, RAT0).hp).toBe(40);
    expect(s.round).toBe(1);
    expect(s.rewards).toBeNull();
  });

  it('orders by effective spd desc with id tiebreak', () => {
    const s = core.combat.start(setup('enc.rats', [member('kael'), member('vesna'), member('tobin')]), 1);
    expect(s.order).toEqual([VESNA, KAEL, TOBIN, RAT0, RAT1]);
    expect(s.activeId).toBe(VESNA);
    expect(s.phase).toBe('awaitingInput');
    expect(s.log[0]).toEqual({ type: 'turnStart', actorId: VESNA, round: 1 });
  });

  it('starts in enemyTurn when an enemy is fastest and advances to the hero after', () => {
    const s = core.combat.start(setup('enc.fast'), 3);
    expect(s.phase).toBe('enemyTurn');
    expect(s.activeId).toBe('enemy:0:en.fast');
    const after = runEnemies(s);
    expect(after.phase).toBe('awaitingInput');
    expect(after.activeId).toBe(KAEL);
  });

  it('recomputes order each round (status changes to spd)', () => {
    let s = core.combat.start(setup('enc.rats', [member('kael'), member('tobin')]), 1);
    expect(s.order[0]).toBe(KAEL);
    s = patch(s, KAEL, { statuses: [{ id: 'soak', turns: 9, potency: 0.9 }] });
    s = autoplay(s, 6); // finish round 1
    const r2 = s.log.filter((e) => e.type === 'turnStart' && e.round === 2);
    expect(r2.length).toBeGreaterThan(0);
    expect(s.order[0]).toBe(TOBIN);
  });

  it('applies party loadouts and fusion at start', () => {
    const s = core.combat.start(setup('enc.dummy', [member('kael', { loadout: { weapon: 'gear.ironSword' }, fusion: ['ashka'] })]), 1);
    const k = get(s, KAEL);
    expect(k.baseStats.atk).toBe(25);
    expect(k.fusion).toEqual({ spirits: ['ashka'], armor: 60, armorMax: 60, broken: false, brokenTurns: 0 });
    expect(core.combat.effectiveStats(s, KAEL).atk).toBe(Math.floor(25 * 1.5 + 10));
    expect(core.combat.availableSkills(s, KAEL)).toContain('skill.flameLash');
  });

  it('drops an invalid fusion stack (sealed spirit) instead of crashing', () => {
    const s = core.combat.start(setup('enc.dummy', [member('kael', { fusion: ['zephra'] })]), 1);
    expect(get(s, KAEL).fusion).toBeNull();
  });
});

describe('invalid actions', () => {
  const base = core.combat.start(setup('enc.rats', [member('kael', { ap: 0 }), member('vesna')]), 5);

  const cases: [string, CombatAction][] = [
    ['attack an ally', { type: 'attack', targetId: KAEL }],
    ['attack unknown', { type: 'attack', targetId: 'enemy:9:x' }],
    ['unknown skill', { type: 'skill', skillId: 'skill.nope', targetId: RAT0 }],
    ['skill not known', { type: 'skill', skillId: 'skill.hex', targetId: RAT0 }],
    ['transform without forms', { type: 'transform', formId: 'form.cinderDrake' }],
    ['revert while not transformed', { type: 'revert' }],
    ['item that is a material', { type: 'item', itemId: 'item.herb', targetId: VESNA }],
    ['revive a living ally', { type: 'item', itemId: 'item.phoenix', targetId: KAEL }],
  ];

  it.each(cases)('rejects: %s', (_label, action) => {
    expect(base.activeId).toBe(VESNA);
    const s = core.combat.step(base, action);
    expect(s.log).toHaveLength(base.log.length + 1);
    expect(s.log.at(-1)?.type).toBe('invalid');
    expect({ ...s, log: base.log }).toEqual(base);
  });

  it('rejects attacking a downed foe, unaffordable skills and fleeing a boss', () => {
    const dead = patch(base, RAT0, { alive: false, hp: 0 });
    expect(core.combat.step(dead, { type: 'attack', targetId: RAT0 }).log.at(-1)?.type).toBe('invalid');
    const broke = patch(base, VESNA, { ap: 0 });
    expect(core.combat.step(broke, { type: 'skill', skillId: 'skill.sweep' }).log.at(-1)).toMatchObject({ type: 'invalid', reason: expect.stringMatching(/AP/) });
    const boss = core.combat.start(setup('enc.boss'), 1);
    expect(core.combat.step(boss, { type: 'flee' }).log.at(-1)).toMatchObject({ type: 'invalid', reason: expect.stringMatching(/escape/) });
  });

  it('rejects transform without enough Sync and actions after the battle', () => {
    const s = core.combat.start(setup('enc.dummy'), 1);
    expect(core.combat.step(s, { type: 'transform', formId: 'form.cinderDrake' }).log.at(-1)).toMatchObject({ type: 'invalid', reason: expect.stringMatching(/Sync/) });
    const over = { ...s, phase: 'victory' as const, activeId: null };
    expect(core.combat.step(over, { type: 'guard' }).log.at(-1)?.type).toBe('invalid');
  });

  it('never mutates the input state', () => {
    const frozen = JSON.parse(JSON.stringify(base)) as CombatState;
    core.combat.step(base, { type: 'attack', targetId: RAT0 });
    core.combat.step(base, { type: 'attack', targetId: KAEL });
    expect(base).toEqual(frozen);
  });
});

describe('damage, guard, statuses, items', () => {
  it('physical damage follows atk × 100/(100+def) within variance; min 1', () => {
    const s = core.combat.start(setup('enc.rats'), 11);
    const after = core.combat.step(s, { type: 'attack', targetId: RAT0 });
    const dmg = ofType(eventsSince(s, after), 'damage')[0];
    const expected = 20 * (100 / 105);
    expect(dmg?.amount).toBeGreaterThanOrEqual(Math.floor(expected * 0.9));
    expect(dmg?.amount).toBeLessThanOrEqual(Math.floor(expected * 1.1));
    expect(dmg?.affinity).toBe('neutral');
  });

  it('applies weakness and immunity affinities', () => {
    let s = core.combat.start(setup('enc.dummy', [member('kael', { fusion: ['ashka'] })]), 2);
    const fire = core.combat.step(s, { type: 'attack', targetId: DUMMY }); // ashka imbues fire, dummy weak ×2
    expect(ofType(eventsSince(s, fire), 'damage')[0]).toMatchObject({ element: 'fire', affinity: 'weak' });
    s = core.combat.start(setup('enc.dummy'), 2);
    s = patch(s, KAEL, { baseSkills: ['skill.hex'] });
    const shadow = core.combat.step(s, { type: 'skill', skillId: 'skill.hex', targetId: DUMMY });
    expect(ofType(eventsSince(s, shadow), 'damage')[0]).toMatchObject({ amount: 0, affinity: 'immune' });
  });

  it('guard halves damage until the guard holder’s next turn', () => {
    const run = (guard: boolean) => {
      let s = core.combat.start(setup('enc.brute', [member('kael', { level: 5 })]), 9);
      s = runEnemies(s);
      const before = s;
      s = core.combat.step(s, guard ? { type: 'guard' } : { type: 'attack', targetId: 'enemy:0:en.brute' });
      s = runEnemies(s);
      return { s, dmg: ofType(eventsSince(before, s), 'damage').filter((d) => d.targetId === KAEL) };
    };
    const g = run(true);
    expect(ofType(g.s.log, 'guard')).toHaveLength(1);
    expect(get(g.s, KAEL).guarding).toBe(false); // cleared at its turn start
    const n = run(false);
    expect(g.dmg[0]?.amount ?? 0).toBeLessThan((n.dmg[0]?.amount ?? 0) * 0.65);
  });

  it('burn ticks at the owner’s turn start and expires', () => {
    let s = core.combat.start(setup('enc.dummy', [member('kael', { level: 5 })]), 4);
    s = core.combat.step(s, { type: 'skill', skillId: 'skill.flameLash', targetId: DUMMY });
    expect(get(s, DUMMY).statuses.some((x) => x.id === 'burn')).toBe(true);
    const burns = s.log.filter((e) => e.type === 'damage' && e.targetId === DUMMY && e.amount === 500);
    expect(burns).toHaveLength(1); // 10 % of 5000 at the dummy's turn start
    s = autoplay(s, 4);
    expect(get(s, DUMMY).statuses).toEqual([]);
    expect(s.log).toContainEqual({ type: 'status', targetId: DUMMY, status: 'burn', applied: false });
  });

  it('stun skips the victim’s turn', () => {
    let s = core.combat.start(setup('enc.biter'), 1);
    expect(s.activeId).toBe('enemy:0:en.biter');
    const before = s;
    s = core.combat.step(s, core.combat.chooseEnemyAction(s));
    const ev = eventsSince(before, s);
    expect(ev).toContainEqual({ type: 'status', targetId: KAEL, status: 'stun', applied: true });
    expect(ev).toContainEqual({ type: 'turnStart', actorId: KAEL, round: 1 });
    expect(ev).toContainEqual({ type: 'status', targetId: KAEL, status: 'stun', applied: false });
    expect(s.activeId).toBe('enemy:0:en.biter');
    expect(s.round).toBe(2);
  });

  it('support skills apply buffs that change effective stats; heals restore HP', () => {
    let s = core.combat.start(setup('enc.dummy', [member('kael', { fusion: ['mirelle'] })]), 1);
    const def0 = core.combat.effectiveStats(s, KAEL).def;
    s = core.combat.step(s, { type: 'skill', skillId: 'skill.tideWard' });
    expect(core.combat.effectiveStats(s, KAEL).def).toBe(Math.floor(def0 * 1.5));
    let h = core.combat.start(setup('enc.dummy', [member('kael'), member('tobin', { hp: 10 })]), 1);
    h = core.combat.step(h, { type: 'skill', skillId: 'skill.mend', targetId: TOBIN });
    expect(get(h, TOBIN).hp).toBe(40); // 10 + mag 15 × 2
  });

  it('items heal, restore AP and revive', () => {
    const s = core.combat.start(setup('enc.dummy', [member('kael', { hp: 10, ap: 1 }), member('tobin', { hp: 0 })]), 1);
    expect(get(s, TOBIN).alive).toBe(false);
    expect(s.order).not.toContain(TOBIN);
    let t = core.combat.step(s, { type: 'item', itemId: 'item.tonic', targetId: KAEL });
    expect(get(t, KAEL).hp).toBe(60);
    t = core.combat.step(s, { type: 'item', itemId: 'item.ether', targetId: KAEL });
    expect(get(t, KAEL).ap).toBe(21);
    t = core.combat.step(s, { type: 'item', itemId: 'item.phoenix', targetId: TOBIN });
    expect(get(t, TOBIN)).toMatchObject({ alive: true, hp: 50 });
  });
});

describe('end states, rewards, flee', () => {
  it('victory computes xp, coin, rolled drops and emits end', () => {
    let s = core.combat.start(setup('enc.rats', [member('kael', { level: 10 })]), 8);
    s = patch(s, RAT0, { hp: 1 });
    s = patch(s, RAT1, { hp: 1 });
    s = autoplay(s);
    expect(s.phase).toBe('victory');
    expect(s.activeId).toBeNull();
    expect(s.rewards).toEqual({ xp: 24, coin: 8, items: [{ itemId: 'item.tonic', qty: 2 }] });
    expect(s.log.at(-1)).toEqual({ type: 'end', outcome: 'victory' });
  });

  it('boss victory liberates its region', () => {
    let s = core.combat.start(setup('enc.boss'), 1);
    s = patch(s, DUMMY, { hp: 1 });
    s = core.combat.step(s, { type: 'attack', targetId: DUMMY });
    expect(s.phase).toBe('victory');
    expect(s.rewards?.liberatesRegion).toBe('region.saltmarket');
  });

  it('defeat when the whole party falls', () => {
    let s = core.combat.start(setup('enc.brute', [member('tobin', { hp: 5 })]), 1);
    s = runEnemies(s);
    expect(s.phase).toBe('defeat');
    expect(s.rewards).toBeNull();
    expect(s.log.slice(-2)).toEqual([{ type: 'ko', targetId: TOBIN }, { type: 'end', outcome: 'defeat' }]);
  });

  it('flee is deterministic per seed and can both succeed and fail', () => {
    const outcomes = new Set<string>();
    for (let seed = 0; seed < 40; seed++) {
      const s = core.combat.start(setup('enc.rats'), seed);
      const a = core.combat.step(s, { type: 'flee' });
      const b = core.combat.step(s, { type: 'flee' });
      expect(a).toEqual(b);
      const flee = ofType(eventsSince(s, a), 'flee')[0];
      expect(flee).toBeDefined();
      if (flee?.success) {
        expect(a.phase).toBe('fled');
        expect(a.log.at(-1)).toEqual({ type: 'end', outcome: 'fled' });
      } else expect(a.phase).not.toBe('fled');
      outcomes.add(String(flee?.success));
    }
    expect(outcomes).toEqual(new Set(['true', 'false']));
  });
});

describe('enemy AI', () => {
  it('targets the lowest HP-fraction hero and does not consume rng', () => {
    let s = core.combat.start(setup('enc.brute', [member('kael'), member('vesna'), member('tobin')]), 1);
    s = patch(s, VESNA, { hp: 100 }); // 50 %
    s = patch(s, KAEL, { hp: 70 }); // 58 %
    const rng = s.rng;
    expect(core.combat.chooseEnemyAction(s)).toEqual({ type: 'attack', targetId: VESNA });
    expect(s.rng).toBe(rng);
  });

  it('uses skills when skillBias allows and AP suffices', () => {
    const s = core.combat.start(setup('enc.caster'), 1);
    expect(core.combat.chooseEnemyAction(s)).toEqual({ type: 'skill', skillId: 'skill.hex', targetId: KAEL });
    const poor = patch(s, 'enemy:0:en.caster', { ap: 0 });
    expect(core.combat.chooseEnemyAction(poor)).toEqual({ type: 'attack', targetId: KAEL });
  });

  it('every AI choice over a long fight is a valid action', () => {
    const s = autoplay(core.combat.start(setup('enc.sweeper', [member('kael'), member('vesna')]), 3), 40);
    expect(ofType(s.log, 'invalid')).toEqual([]);
    expect(s.log.some((e) => e.type === 'attack' && e.skillId === 'skill.sweep')).toBe(true);
  });
});

describe('deterministic replay', () => {
  const party = [member('kael', { level: 3, fusion: ['ashka'], loadout: { weapon: 'gear.ironSword' } }), member('vesna', { loadout: { signature: 'gear.talon' } })];

  it('same seed + same actions ⇒ deep-equal states', () => {
    const a = autoplay(core.combat.start(setup('enc.rats', party), 1234));
    const b = autoplay(core.combat.start(setup('enc.rats', party), 1234));
    expect(a.phase).toBe('victory');
    expect(a).toEqual(b);
    expect(a.log.length).toBeGreaterThan(10);
  });

  it('different seed ⇒ different outcome', () => {
    const a = autoplay(core.combat.start(setup('enc.rats', party), 1234));
    const b = autoplay(core.combat.start(setup('enc.rats', party), 98765));
    expect(a).not.toEqual(b);
    expect(a.rng).not.toBe(b.rng);
  });
});
