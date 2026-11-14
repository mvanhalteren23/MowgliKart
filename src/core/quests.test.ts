import { describe, expect, it } from 'vitest';
import type { QuestLog, WorldEvent, WorldFlags } from '@/types/contracts';
import { core } from './__fixtures__/helpers';
import { foldEvent } from './quests';

const { evaluate, dispatch, initialLog } = core.quests;

function play(events: readonly WorldEvent[], flags: WorldFlags = {}, log: QuestLog = initialLog()) {
  let f = flags;
  let l = log;
  const notes: string[] = [];
  const rewards: unknown[] = [];
  for (const e of events) {
    const r = dispatch(f, l, e);
    f = r.flags;
    l = r.log;
    notes.push(...r.notifications.map((n) => `${n.questId}:${n.kind}`));
    rewards.push(...r.rewards);
  }
  return { flags: f, log: l, notes, rewards };
}

describe('flag folding', () => {
  it('uses the canonical evt:* count keys', () => {
    let f: WorldFlags = {};
    const events: WorldEvent[] = [
      { type: 'talk', npcId: 'n' },
      { type: 'talk', npcId: 'n' },
      { type: 'defeat', encounterId: 'e' },
      { type: 'obtain', itemId: 'i', qty: 3 },
      { type: 'obtain', itemId: 'i', qty: 2 },
      { type: 'enterRegion', regionId: 'r' },
      { type: 'fieldAction', action: 'fish', targetId: 'spot' },
      { type: 'recruit', npcId: 'smith' },
      { type: 'build', buildingId: 'b' },
      { type: 'acceptQuest', questId: 'q' },
      { type: 'liberate', regionId: 'r' },
      { type: 'choice', dialogueId: 'd', choiceId: 'yes' },
      { type: 'setFlag', key: 'custom', value: 'hello' },
    ];
    for (const e of events) f = foldEvent(f, e);
    expect(f).toEqual({
      'evt:talk:n': 2,
      'evt:defeat:e': 1,
      'evt:obtain:i': 5,
      'evt:enter:r': 1,
      'evt:field:fish:spot': 1,
      'evt:recruit:smith': 1,
      'evt:build:b': 1,
      'evt:accept:q': 1,
      'evt:liberate:r': 1,
      'evt:choice:d:yes': 1,
      custom: 'hello',
    });
  });
});

describe('condition evaluation', () => {
  const flags: WorldFlags = { n: 3, t: true, f: false, s: 'gold' };
  const log: QuestLog = { q: { status: 'ACTIVE', objectives: {} } };
  it('handles flag equals / atLeast / truthiness', () => {
    expect(evaluate({ kind: 'always' }, flags, log)).toBe(true);
    expect(evaluate({ kind: 'flag', key: 'n', atLeast: 3 }, flags, log)).toBe(true);
    expect(evaluate({ kind: 'flag', key: 'n', atLeast: 4 }, flags, log)).toBe(false);
    expect(evaluate({ kind: 'flag', key: 't', atLeast: 1 }, flags, log)).toBe(true);
    expect(evaluate({ kind: 'flag', key: 'missing', atLeast: 1 }, flags, log)).toBe(false);
    expect(evaluate({ kind: 'flag', key: 's', equals: 'gold' }, flags, log)).toBe(true);
    expect(evaluate({ kind: 'flag', key: 's', equals: 'lead' }, flags, log)).toBe(false);
    expect(evaluate({ kind: 'flag', key: 'missing', equals: false }, flags, log)).toBe(true);
    expect(evaluate({ kind: 'flag', key: 'f' }, flags, log)).toBe(false);
    expect(evaluate({ kind: 'flag', key: 't' }, flags, log)).toBe(true);
    expect(evaluate({ kind: 'flag', key: 'missing' }, flags, log)).toBe(false);
  });
  it('handles quest status and combinators', () => {
    expect(evaluate({ kind: 'quest', questId: 'q', status: 'ACTIVE' }, flags, log)).toBe(true);
    expect(evaluate({ kind: 'questAtLeast', questId: 'q', status: 'DISCOVERED' }, flags, log)).toBe(true);
    expect(evaluate({ kind: 'questAtLeast', questId: 'q', status: 'COMPLETED' }, flags, log)).toBe(false);
    expect(evaluate({ kind: 'quest', questId: 'unknown', status: 'HIDDEN' }, flags, log)).toBe(true);
    const yes = { kind: 'always' } as const;
    const no = { kind: 'not', of: yes } as const;
    expect(evaluate({ kind: 'all', of: [yes, yes] }, flags, log)).toBe(true);
    expect(evaluate({ kind: 'all', of: [yes, no] }, flags, log)).toBe(false);
    expect(evaluate({ kind: 'any', of: [no, yes] }, flags, log)).toBe(true);
    expect(evaluate({ kind: 'any', of: [] }, flags, log)).toBe(false);
  });
});

describe('quest state machine', () => {
  it('starts with every quest HIDDEN and no objectives complete', () => {
    expect(initialLog()).toEqual({
      'q.ledger': { status: 'HIDDEN', objectives: { 'o.rats': false, 'o.herbs': false, 'o.report': false } },
      'q.chain': { status: 'HIDDEN', objectives: { 'o.free': false } },
      'q.after': { status: 'HIDDEN', objectives: { 'o.never': false } },
      'q.inquiry': { status: 'HIDDEN', objectives: { 'o.two': false } },
    });
  });

  it('walks HIDDEN → DISCOVERED → ACTIVE → COMPLETED with notifications and quest:<id> flags', () => {
    let r = play([{ type: 'talk', npcId: 'npc.elder' }]);
    expect(r.log['q.ledger']?.status).toBe('DISCOVERED');
    expect(r.flags['quest:q.ledger']).toBe('DISCOVERED');
    expect(r.notes).toEqual(['q.ledger:discovered']);

    r = play([{ type: 'acceptQuest', questId: 'q.ledger' }], r.flags, r.log);
    expect(r.log['q.ledger']?.status).toBe('ACTIVE');
    expect(r.flags['quest:q.ledger']).toBe('ACTIVE');

    r = play([{ type: 'defeat', encounterId: 'enc.rats' }], r.flags, r.log);
    expect(r.log['q.ledger']).toEqual({ status: 'ACTIVE', objectives: { 'o.rats': true, 'o.herbs': false, 'o.report': false } });
    expect(r.notes).toEqual(['q.ledger:objective']);

    r = play([{ type: 'talk', npcId: 'npc.elder' }], r.flags, r.log);
    expect(r.log['q.ledger']?.status).toBe('COMPLETED');
    expect(r.flags['quest:q.ledger']).toBe('COMPLETED');
    // optional herbs objective did not gate completion
    expect(r.log['q.ledger']?.objectives['o.herbs']).toBe(false);
  });

  it('only advances one status step per pass but chains across passes; flag rewards cascade', () => {
    const pre = play([
      { type: 'talk', npcId: 'npc.elder' },
      { type: 'acceptQuest', questId: 'q.ledger' },
      { type: 'defeat', encounterId: 'enc.rats' },
    ]);
    const r = dispatch(pre.flags, pre.log, { type: 'talk', npcId: 'npc.elder' });
    expect(r.notifications.map((n) => `${n.questId}:${n.kind}`)).toEqual([
      'q.ledger:objective',
      'q.ledger:completed',
      'q.chain:discovered',
      'q.chain:activated',
      'q.chain:objective',
      'q.chain:completed',
      'q.after:discovered',
    ]);
    expect(r.rewards).toEqual([
      { type: 'coin', amount: 100 },
      { type: 'flag', key: 'ledger.done', value: true },
      { type: 'xp', amount: 50 },
      { type: 'flag', key: 'chain.done', value: 1 },
    ]);
    expect(r.flags).toMatchObject({ 'ledger.done': true, 'chain.done': 1, 'quest:q.chain': 'COMPLETED', 'quest:q.after': 'DISCOVERED' });
    expect(r.log['q.after']?.status).toBe('DISCOVERED'); // needs its own accept
  });

  it('objectives require revealWhen and are sticky once complete', () => {
    // talk twice before the rats are cleared: "report back" is not yet revealed
    const a = play([
      { type: 'talk', npcId: 'npc.elder' },
      { type: 'acceptQuest', questId: 'q.ledger' },
      { type: 'talk', npcId: 'npc.elder' },
      { type: 'obtain', itemId: 'item.herb', qty: 3 },
    ]);
    expect(a.log['q.ledger']?.objectives).toEqual({ 'o.rats': false, 'o.herbs': true, 'o.report': false });
    // drop the herb count: sticky objective stays complete
    const b = play([{ type: 'setFlag', key: 'evt:obtain:item.herb', value: 0 }], a.flags, a.log);
    expect(b.log['q.ledger']?.objectives['o.herbs']).toBe(true);
    // now clearing rats reveals and completes the report at once → quest completes
    const c = play([{ type: 'defeat', encounterId: 'enc.rats' }], b.flags, b.log);
    expect(c.log['q.ledger']?.status).toBe('COMPLETED');
  });

  it('never goes backwards', () => {
    const done = play([
      { type: 'talk', npcId: 'npc.elder' },
      { type: 'acceptQuest', questId: 'q.ledger' },
      { type: 'defeat', encounterId: 'enc.rats' },
      { type: 'talk', npcId: 'npc.elder' },
    ]);
    const r = play(
      [
        { type: 'setFlag', key: 'evt:talk:npc.elder', value: 0 },
        { type: 'setFlag', key: 'ledger.done', value: false },
        { type: 'setFlag', key: 'quest:q.ledger', value: 'HIDDEN' },
      ],
      done.flags,
      done.log,
    );
    expect(r.log['q.ledger']?.status).toBe('COMPLETED');
    expect(r.log['q.chain']?.status).toBe('COMPLETED');
    expect(r.notes).toEqual([]);
    expect(r.rewards).toEqual([]);
    // an ACTIVE quest whose activation condition no longer holds stays ACTIVE
    const active = play([{ type: 'talk', npcId: 'npc.elder' }, { type: 'acceptQuest', questId: 'q.ledger' }]);
    const stays = play([{ type: 'setFlag', key: 'evt:accept:q.ledger', value: 0 }], active.flags, active.log);
    expect(stays.log['q.ledger']?.status).toBe('ACTIVE');
  });

  it('is pure: inputs are not mutated and results are deterministic', () => {
    const flags: WorldFlags = {};
    const log = initialLog();
    const snapshot = JSON.stringify({ flags, log });
    const a = dispatch(flags, log, { type: 'talk', npcId: 'npc.elder' });
    const b = dispatch(flags, log, { type: 'talk', npcId: 'npc.elder' });
    expect(a).toEqual(b);
    expect(JSON.stringify({ flags, log })).toBe(snapshot);
  });

  it('tolerates a log missing quests (treated as HIDDEN)', () => {
    const r = dispatch({}, {}, { type: 'talk', npcId: 'npc.elder' });
    expect(r.log['q.ledger']?.status).toBe('DISCOVERED');
    expect(r.log['q.chain']?.status).toBe('HIDDEN');
  });
});
