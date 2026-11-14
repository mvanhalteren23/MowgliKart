import { describe, expect, it } from 'vitest';
import type { CombatAction, CombatState, CoreServices, EncounterSetup } from '@/types/contracts';
import { createCombat } from '../combat';
import { createHookRegistry } from '../hooks';
import { fixtureDb } from '../__fixtures__/db';
import { core, member } from '../__fixtures__/helpers';

const PIM_SKILLS = ['skill.tideBolt', 'skill.stormNeedle', 'skill.emberDart', 'skill.rimeShard', 'skill.galeCut', 'skill.tideWave'];

/** Scripted policy mixing elemental chains and QTEs; timing derived from the step index. */
function play(svc: CoreServices['combat'], seed: number, maxSteps = 300): CombatState {
  const setup: EncounterSetup = { encounterId: 'enc.pair', party: [member('pim'), member('hadrik')], liberatedRegions: 0 };
  let s = svc.start(setup, seed);
  for (let i = 0; i < maxSteps; i++) {
    if (s.phase === 'enemyTurn') {
      s = svc.step(s, svc.chooseEnemyAction(s));
      continue;
    }
    if (s.phase !== 'awaitingInput') break;
    if (s.qte) {
      const w = s.qte;
      s = svc.step(s, { type: 'qte', results: w.sequence.map((input, k) => ({ input: (i + k) % 7 === 0 ? null : input, ms: (i * 97 + k * 31) % 650 })) });
      continue;
    }
    const target = Object.values(s.combatants).find((c) => c.side === 'enemy' && c.alive);
    if (!target) break;
    const action: CombatAction =
      s.activeId === 'hero:pim'
        ? { type: 'skill', skillId: PIM_SKILLS[i % PIM_SKILLS.length] ?? 'skill.tideBolt', targetId: target.id }
        : { type: 'skill', skillId: i % 3 === 0 ? 'skill.cinderStorm' : 'skill.ringBreaker', targetId: target.id };
    s = svc.step(s, action);
  }
  return s;
}

describe('deterministic replay with hazards and QTEs', () => {
  it('same seed + actions ⇒ deep-equal states; different seed ⇒ differs', () => {
    const a = play(core.combat, 1234);
    const b = play(core.combat, 1234);
    expect(a).toEqual(b);
    expect(a.phase).toBe('victory');
    const types = new Set(a.log.map((e) => e.type));
    for (const t of ['qteStart', 'qteResult', 'hitStop', 'reaction', 'hazardSpawn', 'hazardTick', 'hazardExpire'] as const) expect(types.has(t), t).toBe(true);
    expect(play(core.combat, 4321)).not.toEqual(a);
  });
});

describe('decorated service vs the bare core', () => {
  const raw = createCombat(fixtureDb, createHookRegistry());
  const strip = (s: CombatState) => {
    const { hazards: _h, hazardSeq: _q, qte: _w, ...rest } = s;
    return rest;
  };
  function autoplay(svc: CoreServices['combat'], setup: EncounterSetup, seed: number): CombatState {
    let s = svc.start(setup, seed);
    for (let i = 0; i < 400; i++) {
      if (s.phase === 'enemyTurn') s = svc.step(s, svc.chooseEnemyAction(s));
      else if (s.phase === 'awaitingInput') {
        const t = Object.values(s.combatants).find((c) => c.side === 'enemy' && c.alive);
        if (!t) break;
        s = svc.step(s, i % 4 === 3 ? { type: 'guard' } : { type: 'attack', targetId: t.id });
      } else break;
    }
    return s;
  }

  it.each([
    ['enc.rats', [member('kael'), member('vesna', { loadout: { signature: 'gear.talon' } })]],
    ['enc.caster', [member('kael', { fusion: ['ashka'] })]],
    ['enc.sweeper', [member('vesna'), member('tobin')]],
  ] as const)('produces the same battle as the core when nothing reacts (%s)', (encounterId, party) => {
    const setup: EncounterSetup = { encounterId, party: [...party], liberatedRegions: 0 };
    const d = autoplay(core.combat, setup, 9);
    const r = autoplay(raw, setup, 9);
    expect(strip(d)).toEqual(strip(r));
    expect(d.hazards).toEqual([]);
  });

  it('passes queries through', () => {
    const s = core.combat.start({ encounterId: 'enc.dummy', party: [member('kael')], liberatedRegions: 0 }, 1);
    expect(core.combat.effectiveStats(s, 'hero:kael')).toEqual(raw.effectiveStats(s, 'hero:kael'));
    expect(core.combat.availableSkills(s, 'hero:kael')).toEqual(raw.availableSkills(s, 'hero:kael'));
    expect(core.combat.availableForms(s, 'hero:kael')).toEqual(raw.availableForms(s, 'hero:kael'));
    expect(core.combat.chooseEnemyAction(s)).toEqual(raw.chooseEnemyAction(s));
  });
});
