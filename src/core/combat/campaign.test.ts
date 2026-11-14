import { describe, expect, it } from 'vitest';
import type { CombatAction, CombatState, EncounterSetup, HeroId, PartyMemberSetup } from '@/types/contracts';
import { COMBAT_PARTY_SIZE } from '@/types/contracts';
import { core, get, member, ofType, patch } from '../__fixtures__/helpers';

const KAEL = 'hero:kael';
const APEX = 'form.ashenSovereign';
const setup = (encounterId: string, party: PartyMemberSetup[], flags?: EncounterSetup['flags']): EncounterSetup => ({
  encounterId,
  party,
  liberatedRegions: 0,
  ...(flags ? { flags } : {}),
});

function firstAliveEnemy(s: CombatState): string {
  const e = Object.values(s.combatants).filter((c) => c.side === 'enemy' && c.alive).map((c) => c.id).sort()[0];
  if (e === undefined) throw new Error('no enemy alive');
  return e;
}
function autoPlay(state: CombatState, maxSteps = 600, heroAction?: (s: CombatState) => CombatAction): CombatState {
  let s = state;
  for (let i = 0; i < maxSteps; i++) {
    if (s.phase === 'enemyTurn') s = core.combat.step(s, core.combat.chooseEnemyAction(s));
    else if (s.phase === 'awaitingInput') s = core.combat.step(s, heroAction ? heroAction(s) : { type: 'attack', targetId: firstAliveEnemy(s) });
    else break;
  }
  return s;
}

describe('apex dragon form gating', () => {
  it('without the story flag the apex form is sealed (clear reason) and listed last', () => {
    let s = core.combat.start(setup('enc.dummy', [member('kael')]), 1);
    s = patch(s, KAEL, { sync: 60 });
    const forms = core.combat.availableForms(s, KAEL);
    expect(forms.map((f) => f.formId)).toEqual(['form.cinderDrake', 'form.elderDrake', APEX]);
    expect(forms.at(-1)).toEqual({ formId: APEX, usable: false, reason: 'Ashen Sovereign is still sealed (needs story flag "story.emberOath").' });
    const r = core.combat.step(s, { type: 'transform', formId: APEX });
    expect(r.log.at(-1)).toEqual({ type: 'invalid', reason: 'Ashen Sovereign is still sealed (needs story flag "story.emberOath").' });
    expect(get(r, KAEL).dragon).toBeNull();
  });

  it('falsy flag values still seal it', () => {
    for (const v of [false, 0, ''] as const) {
      const s = patch(core.combat.start(setup('enc.dummy', [member('kael')], { 'story.emberOath': v }), 1), KAEL, { sync: 60 });
      expect(core.combat.availableForms(s, KAEL).at(-1)?.usable).toBe(false);
    }
  });

  it('with the flag it is usable and transform succeeds (other gates still apply)', () => {
    let s = core.combat.start(setup('enc.dummy', [member('kael')], { 'story.emberOath': true }), 1);
    expect(core.combat.availableForms(s, KAEL).at(-1)).toEqual({ formId: APEX, usable: false, reason: 'Needs 50 Sync (have 0).' });
    s = patch(s, KAEL, { sync: 60 });
    expect(core.combat.availableForms(s, KAEL).at(-1)).toEqual({ formId: APEX, usable: true });
    const t = core.combat.step(s, { type: 'transform', formId: APEX });
    expect(ofType(t.log, 'transform')).toEqual([{ type: 'transform', actorId: KAEL, formId: APEX }]);
    expect(get(t, KAEL).dragon).toEqual({ formId: APEX, turnsInForm: 0 });
    // flags survive reducer steps
    expect(core.combat.availableForms(t, KAEL).at(-1)?.reason).toBe('Already transformed.');
  });
});

describe('party sizes and roster coverage', () => {
  const four = (): PartyMemberSetup[] => [member('kael', { fusion: ['ashka'] }), member('tobin'), member('vesna'), member('orla')];

  it(`fields 1..${COMBAT_PARTY_SIZE} heroes; extra and duplicate members are dropped`, () => {
    for (let n = 1; n <= COMBAT_PARTY_SIZE; n++) {
      const s = core.combat.start(setup('enc.rats', four().slice(0, n)), 1);
      expect(Object.values(s.combatants).filter((c) => c.side === 'party')).toHaveLength(n);
    }
    const s = core.combat.start(setup('enc.rats', [...four(), member('hadrik'), member('kael')]), 1);
    expect(Object.keys(s.combatants).filter((id) => id.startsWith('hero:')).sort()).toEqual(['hero:kael', 'hero:orla', 'hero:tobin', 'hero:vesna']);
  });

  it('any of the nine heroes can fight; no forms / no fusion affinity behave correctly', () => {
    const rest: HeroId[] = ['hadrik', 'pim', 'quill', 'moss'];
    let s = core.combat.start(setup('enc.rats', rest.map((h) => member(h, { fusion: ['ashka'] }))), 3);
    for (const h of rest) {
      const c = get(s, `hero:${h}`);
      expect(c.fusion).toBeNull(); // no affinity → unfused
      expect(core.combat.availableForms(s, c.id)).toEqual([]);
    }
    s = autoPlay(s);
    expect(s.phase).toBe('victory');
    for (const h of rest) expect(get(s, `hero:${h}`).sync).toBe(0);
    const sable = autoPlay(core.combat.start(setup('enc.glass', [member('sable')]), 3));
    expect(sable.phase).toBe('victory');
  });

  it('4-hero and 1-hero combats replay deterministically', () => {
    const policy = (s: CombatState): CombatAction =>
      s.activeId === 'hero:orla' && get(s, 'hero:orla').ap >= 3 ? { type: 'skill', skillId: 'skill.cinderRain' } : { type: 'attack', targetId: firstAliveEnemy(s) };
    for (const party of [four(), [member('vesna')]]) {
      const run = (seed: number) => autoPlay(core.combat.start(setup('enc.rats', party), seed), 600, policy);
      const a = run(2024);
      expect(a).toEqual(run(2024));
      expect(['victory', 'defeat']).toContain(a.phase);
      expect(run(2025).log).not.toEqual(a.log);
    }
  });
});
