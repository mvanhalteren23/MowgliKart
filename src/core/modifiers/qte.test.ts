import { describe, expect, it } from 'vitest';
import type { CombatAction, CombatState, EncounterSetup, QteInputResult, QteWindow } from '@/types/contracts';
import { core, eventsSince, get, member, ofType, patch, runEnemies } from '../__fixtures__/helpers';
import { drawQteSequence, gradeQte } from './qte';

const HADRIK = 'hero:hadrik';
const DUMMY = 'enemy:0:en.dummy';
const DUMMY2 = 'enemy:1:en.dummy';
const WISP = 'enemy:0:en.wisp';
const WISP_DUMMY = 'enemy:1:en.dummy';

const setup = (encounterId: string): EncounterSetup => ({ encounterId, party: [member('hadrik')], liberatedRegions: 0 });
const breaker: CombatAction = { type: 'skill', skillId: 'skill.ringBreaker', targetId: DUMMY };
const answer = (w: QteWindow, ms: number): QteInputResult[] => w.sequence.map((input) => ({ input, ms }));
const win = (s: CombatState): QteWindow => {
  if (!s.qte) throw new Error('no window');
  return s.qte;
};

describe('gradeQte', () => {
  const w = { sequence: ['up', 'tap', 'left'] as const, windowMs: 600, perfectWithin: 0.5 };
  const ok = (ms: number) => w.sequence.map((input) => ({ input, ms }));
  it.each<[string, QteInputResult[], string]>([
    ['all fast', ok(100), 'perfect'],
    ['exactly at the perfect edge', ok(300), 'perfect'],
    ['one prompt slower than perfect', [...ok(100).slice(0, 2), { input: 'left', ms: 301 }], 'good'],
    ['exactly at the window edge', ok(600), 'good'],
    ['one timed out (late)', [...ok(100).slice(0, 2), { input: 'left', ms: 601 }], 'miss'],
    ['one timed out (null)', [...ok(100).slice(0, 2), { input: null, ms: 600 }], 'miss'],
    ['wrong input', [{ input: 'down', ms: 50 }, ...ok(100).slice(1)], 'miss'],
    ['too few answers', ok(100).slice(0, 2), 'miss'],
    ['too many answers', [...ok(100), { input: 'tap', ms: 1 }], 'miss'],
    ['negative time', [{ input: 'up', ms: -1 }, ...ok(100).slice(1)], 'miss'],
  ])('%s → %s', (_l, results, grade) => {
    expect(gradeQte(w, results)).toBe(grade);
  });
});

describe('QTE window', () => {
  const s0 = core.combat.start(setup('enc.dummy'), 21);

  it('opens for a qte skill on a hero turn without calling the core', () => {
    const s1 = core.combat.step(s0, breaker);
    expect(eventsSince(s0, s1)).toEqual([
      { type: 'qteStart', actorId: HADRIK, skillId: 'skill.ringBreaker', sequence: win(s1).sequence, windowMs: 600 },
    ]);
    expect(win(s1)).toMatchObject({ actorId: HADRIK, skillId: 'skill.ringBreaker', targetId: DUMMY, windowMs: 600, perfectWithin: 0.5 });
    expect(win(s1).sequence).toHaveLength(3);
    expect(s1.rng).not.toBe(s0.rng);
    expect(s1.combatants).toEqual(s0.combatants);
    expect(s1.activeId).toBe(HADRIK);
  });

  it('does not open for non-qte skills or invalid qte skill actions', () => {
    const claw = core.combat.step(s0, { type: 'skill', skillId: 'skill.claw', targetId: DUMMY });
    expect(claw.qte ?? null).toBeNull();
    expect(ofType(eventsSince(s0, claw), 'damage').length).toBeGreaterThan(0);
    const noTarget = core.combat.step(s0, { type: 'skill', skillId: 'skill.ringBreaker' });
    expect(noTarget.qte ?? null).toBeNull();
    expect(eventsSince(s0, noTarget).map((e) => e.type)).toEqual(['invalid']);
  });

  it('rejects every other action while open, and a qte answer when none is open', () => {
    const open = core.combat.step(s0, breaker);
    for (const a of [{ type: 'guard' }, { type: 'attack', targetId: DUMMY }, breaker] as CombatAction[]) {
      const r = core.combat.step(open, a);
      expect(eventsSince(open, r).map((e) => e.type)).toEqual(['invalid']);
      expect({ ...r, log: open.log }).toEqual(open);
    }
    const stray = core.combat.step(s0, { type: 'qte', results: [] });
    expect(eventsSince(s0, stray).map((e) => e.type)).toEqual(['invalid']);
  });

  it('enemy actions never open windows', () => {
    const e0 = core.combat.start(setup('enc.smasher'), 3);
    expect(e0.phase).toBe('enemyTurn');
    const action = core.combat.chooseEnemyAction(e0);
    expect(action).toMatchObject({ type: 'skill', skillId: 'skill.ringBreaker' });
    const e1 = core.combat.step(e0, action);
    expect(e1.qte ?? null).toBeNull();
    expect(ofType(eventsSince(e0, e1), 'qteStart')).toEqual([]);
    expect(ofType(eventsSince(e0, e1), 'damage')[0]?.targetId).toBe(HADRIK);
  });

  it('draws a deterministic sequence per seed from the pool', () => {
    const a = core.combat.step(core.combat.start(setup('enc.dummy'), 77), breaker);
    const b = core.combat.step(core.combat.start(setup('enc.dummy'), 77), breaker);
    expect(win(a).sequence).toEqual(win(b).sequence);
    const seqs = new Set([1, 2, 3, 4, 5, 6, 7, 8].map((seed) => win(core.combat.step(core.combat.start(setup('enc.dummy'), seed), breaker)).sequence.join()));
    expect(seqs.size).toBeGreaterThan(1);
    const spec = { prompts: 9, windowMs: 1, pool: ['left'] as const, goodMultiplier: 1, perfectMultiplier: 1, perfectWithin: 1, hitStopMs: 0 };
    expect(drawQteSequence(spec, 5).sequence).toEqual(['left', 'left', 'left', 'left', 'left']);
  });
});

describe('QTE resolution', () => {
  const s0 = core.combat.start(setup('enc.dummy'), 31);
  const open = core.combat.step(s0, breaker);
  // The skill's own hit is identical for every grade (same rng after the window).
  const coreHit = (s: CombatState) => ofType(eventsSince(open, s), 'damage')[0]?.amount ?? 0;

  it.each([
    ['perfect', 100, 2],
    ['good', 400, 1.5],
    ['miss', 700, 1],
  ] as const)('%s answer → multiplier %d', (grade, ms, mult) => {
    const s = core.combat.step(open, { type: 'qte', results: answer(win(open), ms) });
    const ev = eventsSince(open, s);
    expect(s.qte).toBeNull();
    expect(ev[0]).toEqual({ type: 'qteResult', actorId: HADRIK, grade, multiplier: mult });
    const dmg = ofType(ev, 'damage');
    const hit = coreHit(s);
    if (grade === 'miss') {
      expect(dmg).toHaveLength(1);
      expect(ofType(ev, 'hitStop')).toEqual([]);
    } else {
      expect(dmg[1]).toEqual({ type: 'damage', targetId: DUMMY, amount: Math.round((mult - 1) * hit), element: 'physical', crit: true, affinity: 'neutral', absorbedByArmor: 0 });
      expect(ofType(ev, 'hitStop')).toEqual([{ type: 'hitStop', targetId: DUMMY, ms: 90 }]);
      // extra damage lands before the next actor's turn starts
      expect(ev.findIndex((e) => e.type === 'hitStop')).toBeLessThan(ev.findIndex((e) => e.type === 'turnStart'));
    }
    const total = dmg.reduce((n, d) => n + d.amount, 0);
    expect(get(s, DUMMY).hp).toBe(5000 - total);
    expect(s.phase).toBe('enemyTurn');
  });

  it('AoE qte skills multiply and hit-stop every damaged target', () => {
    const p0 = core.combat.start(setup('enc.pair'), 5);
    const p1 = core.combat.step(p0, { type: 'skill', skillId: 'skill.cinderStorm' });
    const p2 = core.combat.step(p1, { type: 'qte', results: answer(win(p1), 10) });
    const ev = eventsSince(p1, p2);
    expect(ev[0]).toMatchObject({ type: 'qteResult', grade: 'perfect', multiplier: 1.5 });
    expect(ofType(ev, 'hitStop').map((h) => h.targetId)).toEqual([DUMMY, DUMMY2]);
    expect(ofType(ev, 'damage').filter((d) => d.crit && d.absorbedByArmor === 0).length).toBeGreaterThanOrEqual(2);
  });

  it('extra damage can knock out; the turn advances past a fallen active combatant', () => {
    let w0 = core.combat.start({ encounterId: 'enc.wisps', party: [member('hadrik')], liberatedRegions: 0 }, 2);
    w0 = patch(w0, WISP, { hp: 100 });
    const w1 = core.combat.step(w0, { type: 'skill', skillId: 'skill.ringBreaker', targetId: WISP });
    const w2 = core.combat.step(w1, { type: 'qte', results: answer(win(w1), 10) });
    const ev = eventsSince(w1, w2);
    expect(ofType(ev, 'damage')[0]?.amount).toBeLessThan(100);
    expect(ofType(ev, 'ko')).toEqual([{ type: 'ko', targetId: WISP }]);
    expect(get(w2, WISP).alive).toBe(false);
    expect(w2.activeId).toBe(WISP_DUMMY);
    expect(w2.phase).toBe('enemyTurn');
  });

  it('a killing QTE blow ends the battle with rewards', () => {
    let w0 = core.combat.start({ encounterId: 'enc.wisps', party: [member('hadrik')], liberatedRegions: 0 }, 2);
    w0 = patch(patch(w0, WISP, { hp: 100 }), WISP_DUMMY, { alive: false, hp: 0 });
    const w1 = core.combat.step(w0, { type: 'skill', skillId: 'skill.ringBreaker', targetId: WISP });
    const w2 = core.combat.step(w1, { type: 'qte', results: answer(win(w1), 10) });
    expect(w2.phase).toBe('victory');
    expect(w2.rewards).not.toBeNull();
    expect(w2.log.at(-1)).toEqual({ type: 'end', outcome: 'victory' });
    expect(core.combat.step(w2, { type: 'guard' }).log.at(-1)?.type).toBe('invalid');
  });

  it('is deterministic', () => {
    const a = core.combat.step(open, { type: 'qte', results: answer(win(open), 100) });
    const b = core.combat.step(open, { type: 'qte', results: answer(win(open), 100) });
    expect(a).toEqual(b);
    expect(runEnemies(a)).toEqual(runEnemies(b));
  });
});
