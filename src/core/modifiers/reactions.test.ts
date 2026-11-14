import { describe, expect, it } from 'vitest';
import type { CombatSide, CombatState, EncounterSetup, HazardInstance } from '@/types/contracts';
import { core, eventsSince, get, member, ofType, patch, runEnemies } from '../__fixtures__/helpers';

const PIM = 'hero:pim';
const DUMMY = 'enemy:0:en.dummy';
const DUMMY2 = 'enemy:1:en.dummy';

const setup = (encounterId: string, heroes: Parameters<typeof member>[0][] = ['pim']): EncounterSetup => ({
  encounterId,
  party: heroes.map((h) => member(h)),
  liberatedRegions: 0,
});

const withHazard = (s: CombatState, hazardId: string, side: CombatSide, roundsLeft = 3): CombatState => {
  const seq = (s.hazardSeq ?? 0) + 1;
  const h: HazardInstance = { instanceId: seq, hazardId, side, roundsLeft, sourceId: null };
  return { ...s, hazards: [...(s.hazards ?? []), h], hazardSeq: seq };
};

const bolt = (s: CombatState, skillId: string, targetId = DUMMY) => core.combat.step(s, { type: 'skill', skillId, targetId });
const hazardIds = (s: CombatState, side: CombatSide) => (s.hazards ?? []).filter((h) => h.side === side).map((h) => h.hazardId);

describe('start', () => {
  it('initialises hazards, hazardSeq and qte', () => {
    const s = core.combat.start(setup('enc.dummy'), 1);
    expect(s.hazards).toEqual([]);
    expect(s.hazardSeq).toBe(0);
    expect(s.qte).toBeNull();
  });
});

describe('reaction chains', () => {
  it('water on a burning target → Steam Burst: consumes burn, steam vent on the target side, bonus damage', () => {
    const s0 = patch(core.combat.start(setup('enc.dummy'), 3), DUMMY, { statuses: [{ id: 'burn', turns: 3, potency: 0.01 }] });
    const s1 = bolt(s0, 'skill.tideBolt');
    const ev = eventsSince(s0, s1);
    // priority: rx.puddle is listed first in data but priority 90 → steam (10) wins.
    expect(ofType(ev, 'reaction')).toEqual([{ type: 'reaction', reactionId: 'rx.steam', targetId: DUMMY, element: 'water' }]);
    expect(ofType(ev, 'status')).toContainEqual({ type: 'status', targetId: DUMMY, status: 'burn', applied: false });
    expect(ofType(ev, 'hazardSpawn')).toEqual([{ type: 'hazardSpawn', hazardId: 'hz.steamVent', instanceId: 1, side: 'enemy' }]);
    expect(hazardIds(s1, 'enemy')).toEqual(['hz.steamVent']);
    expect(hazardIds(s1, 'party')).toEqual([]);
    const dmg = ofType(ev, 'damage').filter((d) => d.targetId === DUMMY && d.element === 'water');
    expect(dmg).toHaveLength(2);
    const [hit, bonus] = dmg;
    expect(bonus?.amount).toBe(Math.round((hit?.amount ?? 0) * 0.5));
    // Inserted right after the hit, before the dummy's turn starts.
    const iReaction = ev.findIndex((e) => e.type === 'reaction');
    const iTurn = ev.findIndex((e) => e.type === 'turnStart');
    expect(iReaction).toBeGreaterThan(-1);
    expect(iReaction).toBeLessThan(iTurn);
    // The vent ticks at the dummy's turn start in the same step.
    expect(ofType(ev, 'hazardTick')).toEqual([{ type: 'hazardTick', hazardId: 'hz.steamVent', instanceId: 1, targetId: DUMMY, amount: 250, element: 'water' }]);
  });

  it('lightning into a side with a water puddle → electrified water, puddle consumed, amplified, stun', () => {
    let s = core.combat.start(setup('enc.dummy'), 4);
    s = bolt(s, 'skill.tideBolt');
    expect(hazardIds(s, 'enemy')).toEqual(['hz.waterPuddle']);
    s = runEnemies(s);
    const before = s;
    s = bolt(s, 'skill.stormNeedle');
    const ev = eventsSince(before, s);
    expect(ofType(ev, 'reaction').map((r) => r.reactionId)).toEqual(['rx.electro']);
    expect(ofType(ev, 'hazardExpire')).toEqual([{ type: 'hazardExpire', hazardId: 'hz.waterPuddle', instanceId: 1, side: 'enemy' }]);
    expect(ofType(ev, 'hazardSpawn')).toEqual([{ type: 'hazardSpawn', hazardId: 'hz.electrifiedWater', instanceId: 2, side: 'enemy' }]);
    expect(hazardIds(s, 'enemy')).toEqual(['hz.electrifiedWater']);
    const dmg = ofType(ev, 'damage').filter((d) => d.element === 'lightning');
    const hit = dmg[0]?.amount ?? 0;
    // hit, amplification (puddle ×1.5 present at hit time), reaction bonus ×0.25
    expect(dmg.map((d) => d.amount)).toEqual([hit, Math.round(hit * 0.5), Math.round(hit * 0.25)]);
    expect(ofType(ev, 'status')).toContainEqual({ type: 'status', targetId: DUMMY, status: 'stun', applied: true });
    expect(s.hazardSeq).toBe(2);
  });

  it('ice on a puddle → frozen lake (consumes the puddle)', () => {
    let s = core.combat.start(setup('enc.dummy'), 5);
    s = runEnemies(bolt(s, 'skill.tideBolt'));
    const before = s;
    s = bolt(s, 'skill.rimeShard');
    const ev = eventsSince(before, s);
    expect(ofType(ev, 'reaction').map((r) => r.reactionId)).toEqual(['rx.freeze']);
    expect(hazardIds(s, 'enemy')).toEqual(['hz.frozenLake']);
    // frozen lake inflicts soak (chance 1) when the dummy's turn starts
    expect(get(s, DUMMY).statuses.map((x) => x.id)).toContain('soak');
  });

  it('ice with no puddle does nothing', () => {
    const s0 = core.combat.start(setup('enc.dummy'), 5);
    const s1 = bolt(s0, 'skill.rimeShard');
    expect(ofType(eventsSince(s0, s1), 'reaction')).toEqual([]);
    expect(s1.hazards).toEqual([]);
  });

  it('fire into a steam vent → smoke cloud (vent consumed)', () => {
    const s0 = withHazard(core.combat.start(setup('enc.dummy'), 6), 'hz.steamVent', 'enemy');
    const s1 = bolt(s0, 'skill.emberDart');
    const ev = eventsSince(s0, s1);
    expect(ofType(ev, 'reaction').map((r) => r.reactionId)).toEqual(['rx.smokeSteam']);
    expect(hazardIds(s1, 'enemy')).toEqual(['hz.smokeCloud']);
  });

  it('fire on wind-scarred terrain → smoke cloud (wind scar kept); wind spawns the scar', () => {
    let s = core.combat.start(setup('enc.dummy'), 7);
    s = runEnemies(bolt(s, 'skill.galeCut'));
    expect(hazardIds(s, 'enemy')).toEqual(['hz.galeScar']);
    s = bolt(s, 'skill.emberDart');
    expect(hazardIds(s, 'enemy')).toEqual(['hz.galeScar', 'hz.smokeCloud']);
  });

  it('enemy hits spawn hazards on the PARTY side', () => {
    const s0 = withHazard(core.combat.start(setup('enc.storm'), 2), 'hz.waterPuddle', 'party');
    expect(s0.phase).toBe('enemyTurn');
    const s1 = core.combat.step(s0, core.combat.chooseEnemyAction(s0));
    const ev = eventsSince(s0, s1);
    expect(ofType(ev, 'reaction')).toEqual([{ type: 'reaction', reactionId: 'rx.electro', targetId: PIM, element: 'lightning' }]);
    expect(hazardIds(s1, 'party')).toEqual(['hz.electrifiedWater']);
    expect(hazardIds(s1, 'enemy')).toEqual([]);
  });

  it('AoE hits react per target, and a hazard already on the side is refreshed, not duplicated', () => {
    const s0 = core.combat.start(setup('enc.pair'), 8);
    const s1 = core.combat.step(s0, { type: 'skill', skillId: 'skill.tideWave' });
    const ev = eventsSince(s0, s1);
    expect(ofType(ev, 'reaction').map((r) => r.targetId)).toEqual([DUMMY, DUMMY2]);
    expect(ofType(ev, 'hazardSpawn').map((h) => h.instanceId)).toEqual([1, 1]);
    expect(s1.hazards).toHaveLength(1);
  });

  it('refresh resets roundsLeft to the full duration', () => {
    let s = core.combat.start(setup('enc.dummy'), 9);
    s = runEnemies(bolt(s, 'skill.tideBolt'));
    expect(s.round).toBe(2);
    expect(s.hazards?.[0]?.roundsLeft).toBe(2);
    s = bolt(s, 'skill.tideBolt');
    expect(s.hazards).toEqual([{ instanceId: 1, hazardId: 'hz.waterPuddle', side: 'enemy', roundsLeft: 3, sourceId: PIM }]);
  });

  it('non-reacting hits leave the step exactly as the core produced it', () => {
    const s0 = core.combat.start(setup('enc.dummy', ['kael']), 1);
    const s1 = core.combat.step(s0, { type: 'attack', targetId: DUMMY });
    expect(ofType(eventsSince(s0, s1), 'reaction')).toEqual([]);
    expect(s1.hazards).toEqual([]);
  });
});

describe('amplification and obscuring', () => {
  const firstHit = (before: CombatState, after: CombatState, element: string) =>
    ofType(eventsSince(before, after), 'damage').find((d) => d.element === element)?.amount ?? 0;

  it('a hazard amplifies matching elements only', () => {
    const base = core.combat.start(setup('enc.dummy', ['kael']), 11);
    const frozen = withHazard(base, 'hz.frozenLake', 'enemy');
    const plain = core.combat.step(base, { type: 'attack', targetId: DUMMY });
    const amped = core.combat.step(frozen, { type: 'attack', targetId: DUMMY });
    const hit = firstHit(base, plain, 'physical');
    const dmg = ofType(eventsSince(frozen, amped), 'damage').filter((d) => d.element === 'physical');
    expect(dmg.map((d) => d.amount)).toEqual([hit, Math.round(hit * 0.25)]);
    const magic = core.combat.step(withHazard(core.combat.start(setup('enc.dummy'), 11), 'hz.frozenLake', 'enemy'), { type: 'skill', skillId: 'skill.emberDart', targetId: DUMMY });
    expect(ofType(magic.log, 'damage').filter((d) => d.element === 'fire')).toHaveLength(1);
  });

  it('smoke obscures single-target hits (refunding HP) but not AoE hits', () => {
    const base = core.combat.start(setup('enc.pair'), 12);
    const smoky = withHazard(base, 'hz.smokeCloud', 'enemy');
    const plain = bolt(base, 'skill.emberDart');
    const hit = firstHit(base, plain, 'fire');
    const reduced = bolt(smoky, 'skill.emberDart');
    const hitEv = ofType(eventsSince(smoky, reduced), 'damage')[0];
    expect(hitEv?.amount).toBe(hit - Math.floor(hit * 0.5));
    const ticks = ofType(eventsSince(smoky, reduced), 'hazardTick').filter((t) => t.targetId === DUMMY).reduce((n, t) => n + t.amount, 0);
    expect(get(reduced, DUMMY).hp).toBe(5000 - (hitEv?.amount ?? 0) - ticks);

    const aoePlain = core.combat.step(base, { type: 'skill', skillId: 'skill.tideWave' });
    const aoeSmoky = core.combat.step(smoky, { type: 'skill', skillId: 'skill.tideWave' });
    const amounts = (a: CombatState, b: CombatState) => ofType(eventsSince(a, b), 'damage').filter((d) => d.element === 'water').slice(0, 2).map((d) => d.amount);
    expect(amounts(smoky, aoeSmoky)).toEqual(amounts(base, aoePlain));
  });
});

describe('hazard lifecycle', () => {
  it('DoT never knocks out (affinity applies, min 1 HP)', () => {
    let s = withHazard(core.combat.start(setup('enc.dummy'), 13), 'hz.cinderPyre', 'enemy', 5);
    s = patch(s, DUMMY, { hp: 7 });
    const s1 = core.combat.step(s, { type: 'guard' });
    const tick = ofType(eventsSince(s, s1), 'hazardTick');
    expect(tick).toEqual([{ type: 'hazardTick', hazardId: 'hz.cinderPyre', instanceId: 1, targetId: DUMMY, amount: 6, element: 'fire' }]);
    expect(get(s1, DUMMY)).toMatchObject({ hp: 1, alive: true });
    const s2 = runEnemies(core.combat.step(s1, { type: 'guard' }));
    expect(get(s2, DUMMY)).toMatchObject({ hp: 1, alive: true });
    expect(ofType(s2.log, 'ko')).toEqual([]);
  });

  it('an immune victim takes 0 from the DoT', () => {
    const s = withHazard(core.combat.start(setup('enc.wisps'), 14), 'hz.steamVent', 'enemy');
    const s1 = runEnemies(core.combat.step(s, { type: 'guard' }));
    const t = ofType(eventsSince(s, s1), 'hazardTick');
    expect(t.find((x) => x.targetId === 'enemy:0:en.wisp')?.amount).toBe(0);
    expect(t.find((x) => x.targetId === 'enemy:1:en.dummy')?.amount).toBe(250);
  });

  it('hazards only tick on their own side', () => {
    const s = withHazard(core.combat.start(setup('enc.dummy'), 15), 'hz.cinderPyre', 'enemy');
    const s1 = runEnemies(core.combat.step(s, { type: 'guard' }));
    expect(ofType(s1.log, 'hazardTick').every((t) => t.targetId === DUMMY)).toBe(true);
  });

  it('expires after durationRounds round boundaries', () => {
    let s = core.combat.start(setup('enc.dummy'), 16);
    s = runEnemies(bolt(s, 'skill.tideBolt')); // puddle spawned in round 1, duration 3
    const rounds: number[] = [];
    for (let i = 0; i < 4; i++) {
      rounds.push(s.hazards?.[0]?.roundsLeft ?? 0);
      s = runEnemies(core.combat.step(s, { type: 'guard' }));
    }
    expect(rounds).toEqual([2, 1, 0, 0]);
    const exp = s.log.findIndex((e) => e.type === 'hazardExpire');
    const prevTurn = s.log.slice(0, exp).reverse().find((e) => e.type === 'turnStart');
    expect(prevTurn).toMatchObject({ round: 4 });
    expect(s.hazards).toEqual([]);
  });
});

describe('killing blows', () => {
  it('a reaction on a downed target still transforms terrain, without bonus damage or statuses', () => {
    const s0 = patch(core.combat.start(setup('enc.pair'), 3), DUMMY, { hp: 1 });
    const s1 = bolt(s0, 'skill.tideBolt');
    const ev = eventsSince(s0, s1);
    expect(get(s1, DUMMY).alive).toBe(false);
    expect(ofType(ev, 'reaction').map((r) => r.reactionId)).toEqual(['rx.puddle']);
    expect(hazardIds(s1, 'enemy')).toEqual(['hz.waterPuddle']);
    expect(ofType(ev, 'damage')).toHaveLength(1);
    // reaction events sit between the hit and the KO
    expect(ev.findIndex((e) => e.type === 'hazardSpawn')).toBeLessThan(ev.findIndex((e) => e.type === 'ko'));
  });
});
