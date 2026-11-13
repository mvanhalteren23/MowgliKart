import { describe, expect, it } from 'vitest';
import type { CombatState, EncounterSetup, PartyMemberSetup } from '@/types/contracts';
import { FUSION_BREAK_TURNS } from '@/types/contracts';
import { core, eventsSince, get, member, ofType, patch, runEnemies } from '../__fixtures__/helpers';

const KAEL = 'hero:kael';
const DUMMY = 'enemy:0:en.dummy';
const BRUTE = 'enemy:0:en.brute';
const setup = (encounterId: string, party: PartyMemberSetup[]): EncounterSetup => ({ encounterId, party, liberatedRegions: 0 });

function fusion(s: CombatState) {
  const f = get(s, KAEL).fusion;
  if (!f) throw new Error('not fused');
  return f;
}

describe('Armor Break', () => {
  it('chips armor by full damage, host takes 70 %, breaks → suppresses → restores', () => {
    let s = core.combat.start(setup('enc.brute', [member('kael', { level: 3, fusion: ['ashka'] })]), 21);
    const fusedAtk = core.combat.effectiveStats(s, KAEL).atk;
    expect(fusedAtk).toBe(46); // 24 × 1.5 + 10
    expect(fusion(s).armor).toBe(60);

    // first hit: partially absorbed
    const before = s;
    s = runEnemies(s);
    const d1 = ofType(eventsSince(before, s), 'damage').find((d) => d.targetId === KAEL);
    if (!d1) throw new Error('no hit');
    const full = d1.amount + d1.absorbedByArmor;
    expect(d1.absorbedByArmor).toBe(Math.floor(full * 0.3));
    expect(d1.absorbedByArmor).toBeGreaterThan(0);
    expect(fusion(s).armor).toBe(60 - full);
    expect(get(s, KAEL).hp).toBe(140 - d1.amount);

    // keep guarding until the armor breaks
    let guard = 0;
    while (!s.log.some((e) => e.type === 'armorBreak') && guard++ < 5) s = runEnemies(core.combat.step(s, { type: 'guard' }));
    const brk = s.log.findIndex((e) => e.type === 'armorBreak');
    expect(brk).toBeGreaterThan(0);
    expect(s.log[brk - 1]).toMatchObject({ type: 'damage', targetId: KAEL });
    expect(s.log[brk]).toEqual({ type: 'armorBreak', targetId: KAEL });

    // Kael's turn start has already ticked once: still suppressed.
    expect(s.activeId).toBe(KAEL);
    expect(fusion(s)).toMatchObject({ armor: 0, broken: true, brokenTurns: FUSION_BREAK_TURNS - 1, spirits: ['ashka'] });
    expect(core.combat.effectiveStats(s, KAEL).atk).toBe(get(s, KAEL).baseStats.atk);
    expect(core.combat.availableSkills(s, KAEL)).not.toContain('skill.flameLash');

    // hits while broken are not absorbed
    const b2 = s;
    s = runEnemies(core.combat.step(s, { type: 'guard' }));
    const d2 = ofType(eventsSince(b2, s), 'damage').find((d) => d.targetId === KAEL);
    expect(d2?.absorbedByArmor).toBe(0);

    // next host turn start: restored with full armor
    expect(eventsSince(b2, s)).toContainEqual({ type: 'armorRestore', targetId: KAEL });
    expect(fusion(s)).toEqual({ spirits: ['ashka'], armor: 60, armorMax: 60, broken: false, brokenTurns: 0 });
    expect(core.combat.effectiveStats(s, KAEL).atk).toBe(fusedAtk);
    expect(core.combat.availableSkills(s, KAEL)).toContain('skill.flameLash');
  });

  it('double-stack armor pool is the sum of layers', () => {
    const s = core.combat.start(setup('enc.dummy', [member('kael', { fusion: ['ashka', 'mirelle'] })]), 1);
    expect(fusion(s)).toMatchObject({ armor: 100, armorMax: 100 });
  });
});

describe('Dragon transformation (Sync/AP)', () => {
  it('builds Sync from acting (+12, +skill syncGain) and being hit (+8)', () => {
    let s = core.combat.start(setup('enc.dummy', [member('kael')]), 1);
    expect(core.combat.availableForms(s, KAEL)).toEqual([
      { formId: 'form.cinderDrake', usable: false, reason: 'Needs 50 Sync (have 0).' },
      { formId: 'form.elderDrake', usable: false, reason: 'Unlocks at Lv 10.' },
    ]);
    s = core.combat.step(s, { type: 'skill', skillId: 'skill.drakeCall', targetId: DUMMY });
    expect(get(s, KAEL).sync).toBe(42);
    s = runEnemies(s);
    expect(get(s, KAEL).sync).toBe(50);
    expect(core.combat.availableForms(s, KAEL)[0]).toEqual({ formId: 'form.cinderDrake', usable: true });
  });

  it('transforms (consuming the turn), drains AP each turn, and auto-reverts at maxTurns', () => {
    let s = core.combat.start(setup('enc.dummy', [member('kael')]), 1);
    s = patch(s, KAEL, { sync: 50 });
    const base = core.combat.effectiveStats(s, KAEL);
    const t0 = s;
    s = core.combat.step(s, { type: 'transform', formId: 'form.cinderDrake' });
    expect(eventsSince(t0, s)).toContainEqual({ type: 'transform', actorId: KAEL, formId: 'form.cinderDrake' });
    expect(eventsSince(t0, s)).toContainEqual({ type: 'apChange', targetId: KAEL, amount: -10 });
    expect(s.phase).toBe('enemyTurn');
    expect(get(s, KAEL)).toMatchObject({ ap: 50, dragon: { formId: 'form.cinderDrake', turnsInForm: 0 } });
    expect(core.combat.effectiveStats(s, KAEL).atk).toBe(base.atk * 2);
    expect(core.combat.availableSkills(s, KAEL)).toEqual(['skill.claw', 'skill.emberBreath']);

    for (let turn = 1; turn <= 3; turn++) {
      s = runEnemies(s);
      expect(get(s, KAEL)).toMatchObject({ ap: 50 - 5 * turn, dragon: { turnsInForm: turn } });
      s = core.combat.step(s, { type: 'skill', skillId: 'skill.claw', targetId: DUMMY });
    }
    const r = s;
    s = runEnemies(s);
    expect(eventsSince(r, s)).toContainEqual({ type: 'revert', actorId: KAEL, reason: 'maxTurns' });
    expect(get(s, KAEL)).toMatchObject({ dragon: null, sync: 0, ap: 35 });
    expect(s.phase).toBe('awaitingInput'); // still acts this turn, in base form
    expect(s.activeId).toBe(KAEL);
    expect(core.combat.effectiveStats(s, KAEL).atk).toBe(base.atk);
  });

  it('auto-reverts when AP cannot pay the drain', () => {
    let s = core.combat.start(setup('enc.dummy', [member('kael')]), 1);
    s = patch(s, KAEL, { sync: 60, ap: 12 });
    s = core.combat.step(s, { type: 'transform', formId: 'form.cinderDrake' });
    expect(get(s, KAEL).ap).toBe(2);
    const r = s;
    s = runEnemies(s);
    expect(eventsSince(r, s)).toContainEqual({ type: 'revert', actorId: KAEL, reason: 'apDepleted' });
    expect(get(s, KAEL)).toMatchObject({ dragon: null, sync: 0, ap: 2 });
    expect(s.phase).toBe('awaitingInput');
  });

  it('rejects transform without AP, and manual revert consumes the turn', () => {
    let s = core.combat.start(setup('enc.dummy', [member('kael')]), 1);
    const poor = patch(s, KAEL, { sync: 50, ap: 9 });
    expect(core.combat.step(poor, { type: 'transform', formId: 'form.cinderDrake' }).log.at(-1)).toMatchObject({ type: 'invalid', reason: expect.stringMatching(/AP/) });
    s = core.combat.step(patch(s, KAEL, { sync: 50 }), { type: 'transform', formId: 'form.cinderDrake' });
    s = runEnemies(s);
    expect(core.combat.step(s, { type: 'transform', formId: 'form.cinderDrake' }).log.at(-1)?.type).toBe('invalid');
    const r = s;
    s = core.combat.step(s, { type: 'revert' });
    expect(eventsSince(r, s)).toContainEqual({ type: 'revert', actorId: KAEL, reason: 'manual' });
    expect(get(s, KAEL)).toMatchObject({ dragon: null, sync: 0 });
    expect(s.phase).toBe('enemyTurn');
  });

  it('suppresses fusion bonuses while transformed but keeps the armor pool', () => {
    let s = core.combat.start(setup('enc.brute', [member('kael', { fusion: ['ashka'] })]), 5);
    s = runEnemies(s);
    s = patch(s, KAEL, { sync: 50 });
    const armorBefore = fusion(s).armor;
    s = core.combat.step(s, { type: 'transform', formId: 'form.cinderDrake' });
    const k = get(s, KAEL);
    expect(core.combat.effectiveStats(s, KAEL).atk).toBe(k.baseStats.atk * 2); // not (fused atk) × 2
    expect(core.combat.availableSkills(s, KAEL)).not.toContain('skill.flameLash');
    const b = s;
    s = core.combat.step(s, core.combat.chooseEnemyAction(s));
    const d = ofType(eventsSince(b, s), 'damage').find((x) => x.targetId === KAEL);
    expect(d?.absorbedByArmor).toBeGreaterThan(0);
    expect(fusion(s).armor).toBeLessThan(armorBefore);
  });

  it('KO reverts the form', () => {
    let s = core.combat.start(setup('enc.brute', [member('kael')]), 5);
    s = runEnemies(s);
    s = core.combat.step(patch(s, KAEL, { sync: 50 }), { type: 'transform', formId: 'form.cinderDrake' });
    s = patch(s, KAEL, { hp: 1 });
    const b = s;
    s = runEnemies(s);
    const ev = eventsSince(b, s);
    const ko = ev.findIndex((e) => e.type === 'ko');
    expect(ev[ko + 1]).toEqual({ type: 'revert', actorId: KAEL, reason: 'ko' });
    expect(get(s, KAEL)).toMatchObject({ alive: false, dragon: null, sync: 0 });
    expect(s.phase).toBe('defeat');
  });

  it('caps Sync at 100', () => {
    let s = core.combat.start(setup('enc.dummy', [member('kael')]), 1);
    s = patch(s, KAEL, { sync: 95 });
    s = core.combat.step(s, { type: 'skill', skillId: 'skill.drakeCall', targetId: DUMMY });
    expect(get(s, KAEL).sync).toBe(100);
  });

  it('lists forms only for drake-blooded heroes', () => {
    const s = core.combat.start(setup('enc.brute', [member('vesna')]), 1);
    expect(core.combat.availableForms(s, 'hero:vesna')).toEqual([]);
    expect(core.combat.availableForms(s, BRUTE)).toEqual([]);
    expect(get(runEnemies(s), 'hero:vesna').sync).toBe(0);
  });
});
