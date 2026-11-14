import { describe, expect, it } from 'vitest';
import type { BuildingDef, ClueDef, Condition, EndingDef, HeroDef, HeroId, QuestDef, QuestLog, StoryNodeDef, WorldFlags } from '@/types/contracts';
import { HERO_IDS } from '@/types/contracts';
import {
  HIDDEN_TITLE,
  chainStageLabel,
  clueBoard,
  costView,
  endingProgress,
  groupChains,
  isHeroLocked,
  layoutStoryGraph,
  maxLevelOf,
  neededOfKind,
  newlyJoined,
  performerFor,
  propScaleAt,
  railEntries,
  requirementLines,
  trueEndingOf,
  upgradeTimeline,
  visibleChains,
  type CampaignData,
} from './campaign';

/* ── A tiny evaluator mirroring core semantics (enough for these tests) ── */
const ORDER = ['HIDDEN', 'DISCOVERED', 'ACTIVE', 'COMPLETED'];
function evaluate(c: Condition, flags: WorldFlags, log: QuestLog): boolean {
  switch (c.kind) {
    case 'always':
      return true;
    case 'flag': {
      const v = flags[c.key];
      if (c.atLeast !== undefined) return typeof v === 'number' && v >= c.atLeast;
      if (c.equals !== undefined) return v === c.equals;
      return !!v;
    }
    case 'quest':
      return (log[c.questId]?.status ?? 'HIDDEN') === c.status;
    case 'questAtLeast':
      return ORDER.indexOf(log[c.questId]?.status ?? 'HIDDEN') >= ORDER.indexOf(c.status);
    case 'all':
      return c.of.every((x) => evaluate(x, flags, log));
    case 'any':
      return c.of.some((x) => evaluate(x, flags, log));
    case 'not':
      return !evaluate(c.of, flags, log);
    case 'count':
      return c.of.filter((x) => evaluate(x, flags, log)).length >= c.atLeast;
  }
}

const q = (id: string, extra: Partial<QuestDef> = {}): QuestDef => ({
  id,
  title: `T ${id}`,
  kind: 'main',
  act: 1,
  summary: '',
  chronicle: { HIDDEN: '', DISCOVERED: '', ACTIVE: '', COMPLETED: '' },
  discoverWhen: { kind: 'always' },
  activateWhen: { kind: 'always' },
  objectives: [],
  rewards: [],
  ...extra,
});
const log = (entries: Record<string, 'HIDDEN' | 'DISCOVERED' | 'ACTIVE' | 'COMPLETED'>): QuestLog =>
  Object.fromEntries(Object.entries(entries).map(([k, status]) => [k, { status, objectives: {} }]));

describe('rail lock rule', () => {
  it('locks exactly the heroes outside the party, members first in party order', () => {
    const rail = railEntries(HERO_IDS, ['vesna', 'kael', 'orla'], 'kael');
    expect(rail).toHaveLength(9);
    expect(rail.slice(0, 3).map((e) => e.heroId)).toEqual(['vesna', 'kael', 'orla']);
    expect(rail.filter((e) => !e.locked).map((e) => e.heroId)).toEqual(['vesna', 'kael', 'orla']);
    expect(rail.filter((e) => e.leader).map((e) => e.heroId)).toEqual(['kael']);
    expect(rail.find((e) => e.heroId === 'tobin')?.locked).toBe(true);
    expect(isHeroLocked('sable', ['kael'])).toBe(true);
    expect(isHeroLocked('kael', ['kael'])).toBe(false);
  });

  it('a full party has nothing locked; duplicates are ignored', () => {
    const rail = railEntries(HERO_IDS, [...HERO_IDS, 'kael'], 'sable');
    expect(rail).toHaveLength(9);
    expect(rail.every((e) => !e.locked)).toBe(true);
  });

  it('detects newly joined heroes', () => {
    expect(newlyJoined(['kael', 'tobin'], ['kael', 'tobin', 'pim'])).toEqual(['pim']);
    expect(newlyJoined(['kael'], ['kael'])).toEqual([]);
  });

  it('finds who performs a traversal action', () => {
    const heroes = { kael: { fieldActions: ['fish'] }, tobin: { fieldActions: ['huntShot', 'grapple'] }, vesna: { fieldActions: ['roll'] } } as unknown as Record<HeroId, Pick<HeroDef, 'fieldActions'>>;
    expect(performerFor('grapple', 'kael', ['kael', 'tobin', 'vesna'], heroes)).toBe('tobin');
    expect(performerFor('fish', 'kael', ['kael', 'tobin'], heroes)).toBe('kael');
    expect(performerFor('glide', 'kael', ['kael', 'tobin'], heroes)).toBeNull();
  });
});

describe('story graph layout', () => {
  const nodes: StoryNodeDef[] = [
    { id: 'a', act: 1, title: 'Ledger', regionId: 'r1', questId: 'q1', next: ['b', 'c'] },
    { id: 'b', act: 1, title: 'Tithe', regionId: 'r1', questId: 'q2', next: ['d'] },
    { id: 'c', act: 2, title: 'Harbor', regionId: 'r2', questId: 'q3', next: ['d', 'zz'] },
    { id: 'd', act: 3, title: 'Still Flame', regionId: 'r3', questId: 'q4', next: [] },
  ];

  it('places nodes in act columns with rows in authored order', () => {
    const g = layoutStoryGraph(nodes, log({ q1: 'COMPLETED', q2: 'ACTIVE', q3: 'DISCOVERED' }));
    expect(g.acts).toEqual([1, 2, 3]);
    expect(g.rows).toBe(2);
    const at = (id: string) => g.nodes.find((n) => n.id === id);
    expect(at('a')).toMatchObject({ col: 0, row: 0, status: 'COMPLETED', title: 'Ledger' });
    expect(at('b')).toMatchObject({ col: 0, row: 1, status: 'ACTIVE', current: true });
    expect(at('c')).toMatchObject({ col: 1, row: 0, status: 'DISCOVERED' });
    expect(at('d')).toMatchObject({ col: 2, row: 0, status: 'HIDDEN', title: HIDDEN_TITLE });
  });

  it('builds edges, drops dangling ones and lights completed sources', () => {
    const g = layoutStoryGraph(nodes, log({ q1: 'COMPLETED' }));
    expect(g.edges).toHaveLength(4);
    expect(g.edges.find((e) => e.to === 'zz')).toBeUndefined();
    expect(g.edges.filter((e) => e.lit).map((e) => e.to)).toEqual(['b', 'c']);
  });

  it('compacts column indices when an act has no nodes', () => {
    const g = layoutStoryGraph([nodes[0]!, nodes[3]!], {});
    expect(g.acts).toEqual([1, 3]);
    expect(g.nodes.map((n) => n.col)).toEqual([0, 1]);
  });
});

describe('personal chains', () => {
  const chain = (id: string, stage: number, of: number) => ({ id, stage, of, title: `Chain ${id}` });
  const quests = [
    q('k2', { chain: chain('kael', 2, 3), companion: 'kael', kind: 'companion' }),
    q('k1', { chain: chain('kael', 1, 3), companion: 'kael', kind: 'companion' }),
    q('k3', { chain: chain('kael', 3, 3), companion: 'kael', kind: 'companion' }),
    q('v1', { chain: chain('vesna', 1, 2), kind: 'companion' }),
    q('v2', { chain: chain('vesna', 2, 2), kind: 'companion' }),
    q('plain', { kind: 'companion' }),
  ];

  it('groups by chain id with ascending stages and x/of labels', () => {
    const chains = groupChains(quests, log({ k1: 'COMPLETED', k2: 'ACTIVE', v1: 'COMPLETED', v2: 'COMPLETED' }));
    expect(chains.map((c) => c.chainId)).toEqual(['kael', 'vesna']);
    const kael = chains[0]!;
    expect(kael.stages.map((s) => s.stage)).toEqual([1, 2, 3]);
    expect(kael.current?.stage).toBe(2);
    expect(kael.companion).toBe('kael');
    expect(chainStageLabel(kael)).toBe('Stage 2/3');
    expect(kael.complete).toBe(false);
    const vesna = chains[1]!;
    expect(vesna.complete).toBe(true);
    expect(chainStageLabel(vesna)).toBe('Complete · 2/2');
  });

  it('hides chains with no visible stage', () => {
    const chains = groupChains(quests, log({ k1: 'DISCOVERED' }));
    expect(visibleChains(chains).map((c) => c.chainId)).toEqual(['kael']);
  });
});

describe('clue board', () => {
  const clues: ClueDef[] = [
    { id: 'c1', title: 'Ash ledger', text: '…', regionId: 'r1', investigationId: 'i1', foundWhen: { kind: 'flag', key: 'clue:c1' } },
    { id: 'c2', title: 'Wax seal', text: '…', regionId: 'r2', investigationId: 'i1', foundWhen: { kind: 'flag', key: 'clue:c2' } },
    { id: 'c3', title: 'Cold censer', text: '…', regionId: 'r3', investigationId: 'i2', foundWhen: { kind: 'flag', key: 'clue:c3' } },
  ];
  it('counts found/total and orders found first with region names', () => {
    const b = clueBoard(clues, new Set(['c3']), (id) => ({ r1: 'Lanternwick', r2: 'Saltmarket' })[id] ?? 'Unknown');
    expect(b.found).toBe(1);
    expect(b.total).toBe(3);
    expect(b.cards.map((c) => c.clue.id)).toEqual(['c3', 'c1', 'c2']);
    expect(b.cards[1]).toMatchObject({ found: false, regionName: 'Lanternwick' });
    expect(b.cards[0]?.regionName).toBe('Unknown');
  });
});

describe('ending progress', () => {
  const clues: ClueDef[] = ['a', 'b', 'c', 'd'].map((id) => ({ id, title: id, text: '', regionId: 'r', investigationId: 'inv', foundWhen: { kind: 'flag', key: `clue:${id}` } }));
  const hero = (id: HeroId, joinQuest?: string): HeroDef => ({ id, name: id.toUpperCase(), fieldActions: [], ...(joinQuest ? { joinQuest } : {}) }) as unknown as HeroDef;
  const heroes = Object.fromEntries(HERO_IDS.map((id) => [id, hero(id, id === 'kael' ? undefined : `join.${id}`)])) as Record<HeroId, HeroDef>;
  const quests = [
    q('main.final'),
    q('kc1', { chain: { id: 'kc', stage: 1, of: 2, title: 'Embers' } }),
    q('kc2', { chain: { id: 'kc', stage: 2, of: 2, title: 'Embers' } }),
    q('vc1', { chain: { id: 'vc', stage: 1, of: 1, title: 'Debts' } }),
    ...HERO_IDS.map((id) => q(`join.${id}`)),
  ];
  const trueWhen: Condition = {
    kind: 'all',
    of: [
      { kind: 'quest', questId: 'main.final', status: 'COMPLETED' },
      { kind: 'count', atLeast: 3, of: clues.map((c) => ({ kind: 'flag', key: `clue:${c.id}` }) as Condition) },
      { kind: 'count', atLeast: 2, of: ['tobin', 'vesna', 'orla'].map((h) => ({ kind: 'quest', questId: `join.${h}`, status: 'COMPLETED' }) as Condition) },
      { kind: 'quest', questId: 'kc2', status: 'COMPLETED' },
      { kind: 'quest', questId: 'vc1', status: 'COMPLETED' },
    ],
  };
  const endings: EndingDef[] = [
    { id: 'grey', title: 'Grey Dawn', summary: '', priority: 1, when: { kind: 'quest', questId: 'main.final', status: 'COMPLETED' } },
    { id: 'true', title: 'Wake of Embers', summary: '', priority: 10, when: trueWhen },
  ];
  const data: CampaignData = { endings, clues, quests, heroes };

  it('picks the highest-priority ending as the true ending', () => {
    expect(trueEndingOf(endings)?.id).toBe('true');
    expect(trueEndingOf([])).toBeNull();
  });

  it('derives needed counts from the true ending condition', () => {
    expect(neededOfKind(trueWhen, 'clue', data)).toBe(3);
    expect(neededOfKind(trueWhen, 'hero', data)).toBe(2);
    expect(neededOfKind(trueWhen, 'chain', data)).toBe(2);
    expect(neededOfKind({ kind: 'flag', key: 'clues.found', atLeast: 5 }, 'clue', data)).toBe(5);
    expect(neededOfKind({ kind: 'always' }, 'clue', data)).toBeNull();
  });

  it('reports metrics and a checklist against current state', () => {
    const flags: WorldFlags = { 'clue:a': true, 'clue:b': true };
    const l = log({ 'main.final': 'COMPLETED', 'join.tobin': 'COMPLETED', kc1: 'COMPLETED', kc2: 'COMPLETED' });
    const p = endingProgress(data, { flags, log: l, party: ['kael', 'tobin'] }, 2, evaluate);
    expect(p.trueEnding?.title).toBe('Wake of Embers');
    expect(p.met).toBe(false);
    expect(p.metrics).toEqual([
      { id: 'clues', label: 'Clues', have: 2, need: 3, total: 4 },
      { id: 'heroes', label: 'Heroes', have: 2, need: 2, total: 9 },
      { id: 'chains', label: 'Chains', have: 1, need: 2, total: 2 },
    ]);
    expect(p.requirements).toHaveLength(5);
    expect(p.requirements[0]).toMatchObject({ kind: 'quest', met: true, text: 'Complete “T main.final”' });
    expect(p.requirements[1]).toMatchObject({ kind: 'clue', met: false, have: 2, need: 3, text: '3 of 4 clues found' });
    expect(p.requirements[2]).toMatchObject({ kind: 'hero', met: false, have: 1, need: 2 });
    expect(p.requirements[3]).toMatchObject({ kind: 'chain', met: true, text: 'Complete “Embers”' });
    expect(p.requirements[4]).toMatchObject({ kind: 'chain', met: false });
  });

  it('describes hero recruitment leaves by hero name', () => {
    const lines = requirementLines({ kind: 'quest', questId: 'join.orla', status: 'COMPLETED' }, data, {}, {}, evaluate);
    expect(lines[0]).toMatchObject({ kind: 'hero', text: 'Recruit ORLA', met: false });
  });

  it('falls back to totals when there are no endings', () => {
    const p = endingProgress({ ...data, endings: [] }, { flags: {}, log: {}, party: ['kael'] }, 0, evaluate);
    expect(p.trueEnding).toBeNull();
    expect(p.requirements).toEqual([]);
    expect(p.metrics.map((m) => m.need)).toEqual([4, 9, 2]);
  });
});

describe('township upgrades', () => {
  const smithy: BuildingDef = {
    id: 'b.smithy',
    name: 'Smithy',
    description: 'Hammer and tongs.',
    prop: 'house',
    requiresRecruit: 'npc.smith',
    cost: { coin: 100, items: [] },
    unlocksFlag: 'township.smithy',
    perk: 'Repairs',
    upgrades: [
      { level: 3, name: 'Foundry', description: '', cost: { coin: 400, items: [{ itemId: 'ore', qty: 5 }] }, unlocksFlag: 'township.smithy.3', perk: 'Masterwork', propScale: 1.6, requirementText: 'After Act II' },
      { level: 2, name: 'Forge', description: '', cost: { coin: 200, items: [{ itemId: 'ore', qty: 2 }, { itemId: 'timber', qty: 3 }] }, unlocksFlag: 'township.smithy.2', perk: 'Tempering', propScale: 1.25 },
    ],
  };

  it('builds a 1 → 2 → 3 timeline with states', () => {
    const t = upgradeTimeline(smithy, 2);
    expect(t.map((s) => [s.level, s.name, s.state])).toEqual([
      [1, 'Smithy', 'done'],
      [2, 'Forge', 'current'],
      [3, 'Foundry', 'next'],
    ]);
    expect(t[2]?.requirementText).toBe('After Act II');
    expect(upgradeTimeline(smithy, 1).map((s) => s.state)).toEqual(['current', 'next', 'future']);
    expect(maxLevelOf(smithy)).toBe(3);
    expect(propScaleAt(smithy, 1)).toBe(1);
    expect(propScaleAt(smithy, 2)).toBe(1.25);
    expect(propScaleAt(smithy, 5)).toBe(1.6);
  });

  it('formats cost affordability per part', () => {
    const names = (id: string) => ({ ore: 'Iron Ore', timber: 'Timber' })[id] ?? id;
    const v = costView(smithy.upgrades[1]!.cost, 250, { ore: 1, timber: 3 }, names);
    expect(v.parts).toEqual([
      { key: 'coin', label: '◉', have: 250, need: 200, ok: true },
      { key: 'ore', label: 'Iron Ore', have: 1, need: 2, ok: false },
      { key: 'timber', label: 'Timber', have: 3, need: 3, ok: true },
    ]);
    expect(v.affordable).toBe(false);
    expect(v.text).toBe('◉ 250/200 · Iron Ore 1/2 · Timber 3/3');
    expect(costView({ coin: 0, items: [] }, 0, {}, names)).toEqual({ parts: [], affordable: true, text: 'Free' });
    expect(costView({ coin: 50, items: [] }, 10, {}, names).affordable).toBe(false);
  });
});
