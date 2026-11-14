import { describe, expect, it } from 'vitest';
import type { Condition, QuestDef, QuestLog, WorldFlags } from '@/types/contracts';
import { chronicleEntries, currentObjective, formatReward, openCounts, questsForTab, trackerMarker, visibleObjectives, type Evaluate, type RewardNames } from './questSelectors';

const always: Condition = { kind: 'always' };
const flag = (key: string): Condition => ({ kind: 'flag', key });
/** Minimal evaluator: supports `always` and truthy `flag`. */
const evaluate: Evaluate = (c, flags) => (c.kind === 'always' ? true : c.kind === 'flag' ? Boolean(flags[c.key]) : false);

const quest = (id: string, kind: QuestDef['kind'], act: 1 | 2 | 3, objectives: QuestDef['objectives'] = []): QuestDef => ({
  id,
  title: id.toUpperCase(),
  kind,
  act,
  summary: '',
  chronicle: { HIDDEN: 'never shown', DISCOVERED: 'Heard a rumour.', ACTIVE: 'Took the job.', COMPLETED: '' },
  discoverWhen: always,
  activateWhen: always,
  objectives,
  rewards: [],
});

const quests: QuestDef[] = [
  quest('m1', 'main', 1),
  quest('m2', 'main', 2),
  quest('m0', 'main', 1),
  quest('c1', 'companion', 1),
  quest('h1', 'main', 1),
];
const log: QuestLog = {
  m1: { status: 'COMPLETED', objectives: {} },
  m2: { status: 'ACTIVE', objectives: {} },
  m0: { status: 'DISCOVERED', objectives: {} },
  c1: { status: 'ACTIVE', objectives: {} },
  h1: { status: 'HIDDEN', objectives: {} },
};

describe('questsForTab', () => {
  it('filters by kind, hides HIDDEN, sorts ACTIVE → DISCOVERED → COMPLETED', () => {
    expect(questsForTab(quests, log, 'main').map((q) => q.id)).toEqual(['m2', 'm0', 'm1']);
    expect(questsForTab(quests, log, 'companion').map((q) => q.id)).toEqual(['c1']);
    expect(questsForTab(quests, log, 'township')).toEqual([]);
  });
  it('puts the tracked quest first', () => {
    expect(questsForTab(quests, log, 'main', 'm1').map((q) => q.id)).toEqual(['m1', 'm2', 'm0']);
  });
  it('sorts by act within a status', () => {
    const l: QuestLog = { m1: { status: 'ACTIVE', objectives: {} }, m2: { status: 'ACTIVE', objectives: {} }, m0: { status: 'ACTIVE', objectives: {} } };
    expect(questsForTab([quests[1]!, quests[0]!, quests[2]!], l, 'main').map((q) => q.id)).toEqual(['m1', 'm0', 'm2']);
  });
  it('treats missing log entries as HIDDEN and counts open quests', () => {
    expect(questsForTab(quests, {}, 'main')).toEqual([]);
    expect(openCounts(quests, log)).toEqual({ main: 2, companion: 1, investigation: 0, township: 0 });
  });
});

describe('objectives', () => {
  const q = quest('q', 'main', 1, [
    { id: 'a', text: 'A', completeWhen: always, marker: { x: 1, z: 1 } },
    { id: 'opt', text: 'Optional', completeWhen: always, optional: true, marker: { x: 9, z: 9 } },
    { id: 'b', text: 'B', completeWhen: always, revealWhen: flag('seen.b'), marker: { x: 2, z: 2 } },
    { id: 'c', text: 'C', completeWhen: always },
  ]);
  const flags: WorldFlags = {};

  it('hides unrevealed objectives unless already done', () => {
    const l: QuestLog = { q: { status: 'ACTIVE', objectives: { a: true } } };
    expect(visibleObjectives(q, l, flags, evaluate).map((o) => [o.def.id, o.done])).toEqual([
      ['a', true],
      ['opt', false],
      ['c', false],
    ]);
    expect(visibleObjectives(q, l, { 'seen.b': true }, evaluate).map((o) => o.def.id)).toEqual(['a', 'opt', 'b', 'c']);
  });

  it('picks the first required open objective, preferring it over optional ones', () => {
    const l: QuestLog = { q: { status: 'ACTIVE', objectives: { a: true } } };
    expect(currentObjective(q, l, flags, evaluate)?.id).toBe('c');
    expect(currentObjective(q, l, { 'seen.b': true }, evaluate)?.id).toBe('b');
  });

  it('tracker marker falls back to any open objective marker', () => {
    const l: QuestLog = { q: { status: 'ACTIVE', objectives: { a: true } } };
    expect(trackerMarker(q, l, flags, evaluate)).toEqual({ x: 9, z: 9 });
    expect(trackerMarker(q, l, { 'seen.b': true }, evaluate)).toEqual({ x: 2, z: 2 });
    const done: QuestLog = { q: { status: 'COMPLETED', objectives: { a: true, opt: true, b: true, c: true } } };
    expect(trackerMarker(q, done, flags, evaluate)).toBeNull();
  });
});

describe('chronicle + rewards', () => {
  it('lists non-empty passages for reached statuses only', () => {
    const q = quest('q', 'main', 1);
    expect(chronicleEntries(q, 'HIDDEN')).toEqual([]);
    expect(chronicleEntries(q, 'ACTIVE').map((e) => e.status)).toEqual(['DISCOVERED', 'ACTIVE']);
    expect(chronicleEntries(q, 'COMPLETED').map((e) => e.status)).toEqual(['DISCOVERED', 'ACTIVE']);
  });

  it('formats rewards with names and skips flags', () => {
    const db = {
      gear: { g: { id: 'g', name: 'Horn', icon: '🐲' } },
      items: { i: { id: 'i', name: 'Salt', icon: '🧂' } },
      spirits: { ashka: { name: 'Ashka' } },
    } as unknown as RewardNames;
    expect(formatReward({ type: 'gear', gearId: 'g' }, db)).toBe('🐲 Horn');
    expect(formatReward({ type: 'item', itemId: 'i', qty: 2 }, db)).toBe('🧂 Salt ×2');
    expect(formatReward({ type: 'item', itemId: 'zz', qty: 1 }, db)).toBe('• zz ×1');
    expect(formatReward({ type: 'coin', amount: 50 }, db)).toBe('◉ 50 coin');
    expect(formatReward({ type: 'xp', amount: 10 }, db)).toBe('✦ 10 XP');
    expect(formatReward({ type: 'spirit', spiritId: 'ashka' }, db)).toBe('✧ Warden Ashka');
    expect(formatReward({ type: 'flag', key: 'k', value: true }, db)).toBeNull();
  });
});
