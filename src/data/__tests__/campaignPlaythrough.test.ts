import { describe, expect, it } from 'vitest';
import { HERO_IDS, HOOK_IDS, TRAVERSAL_FOR_GATE } from '@/types/contracts';
import type { Condition, HeroId } from '@/types/contracts';
import { gameData as db } from '@/data';
import { CHAIN_FINALS, JOIN_QUESTS, TRUE_ENDING_CLUES } from '@/data/story';
import { createWorldSystems } from '@/systems';
import { Playthrough, evaluate } from './harness';

const fresh = () => new Playthrough(db, createWorldSystems(db));

const SIGNATURE_HOOK: Readonly<Record<HeroId, string>> = {
  kael: HOOK_IDS.dragonSurge, tobin: HOOK_IDS.markedQuarry, vesna: HOOK_IDS.counterAttack, orla: HOOK_IDS.mendingEcho,
  hadrik: HOOK_IDS.bulwark, pim: HOOK_IDS.pilfer, quill: HOOK_IDS.spellEcho, moss: HOOK_IDS.rootbind, sable: HOOK_IDS.reap,
};

/** Gate ids a condition requires crossing (traversal `fieldAction` leaves). */
function gateLeaves(c: Condition): string[] {
  if (c.kind === 'all' || c.kind === 'any' || c.kind === 'count') return c.of.flatMap(gateLeaves);
  if (c.kind === 'not') return gateLeaves(c.of);
  if (c.kind !== 'flag' || !c.key.startsWith('evt:field:')) return [];
  const [, , action, ...t] = c.key.split(':');
  const target = t.join(':');
  const gate = db.world.traversalGates.find((g) => g.id === target);
  return gate && TRAVERSAL_FOR_GATE[gate.kind] === action ? [target] : [];
}

/** Play the main story legally, asserting the Metroidvania gating of every Act II/III chapter. */
function playMainStory(p: Playthrough): void {
  for (const node of db.storyGraph) {
    const quest = db.quests.find((q) => q.id === node.questId)!;
    const gates = gateLeaves(quest.discoverWhen);
    if (node.act >= 2) {
      expect(gates.length, `${node.id} must be gated by a traversal`).toBeGreaterThan(0);
      // Every predecessor is done, but no gate into the chapter has been crossed yet: still hidden.
      for (const pred of db.storyGraph.filter((n) => n.next.includes(node.id))) expect(p.status(pred.questId), pred.id).toBe('COMPLETED');
      expect(gates.some((g) => p.holds({ kind: 'flag', key: `evt:field:${TRAVERSAL_FOR_GATE[db.world.traversalGates.find((x) => x.id === g)!.kind]}:${g}`, atLeast: 1 }))).toBe(false);
      expect(p.status(quest.id), `${node.id} before its gate`).toBe('HIDDEN');
    }
    p.drive(quest.id);
    expect(p.status(quest.id), node.id).toBe('COMPLETED');
  }
}

describe('campaign playthrough (legal moves only)', () => {
  it('Act II/III gates cannot be crossed before their hero has joined', () => {
    const p = fresh();
    for (const id of ['gate.fallenPass', 'gate.mireFord', 'gate.sunderedGorge', 'gate.rimepineGrove', 'gate.calderaSeal', 'gate.frostScarp', 'gate.hierophantVeil']) {
      expect(p.canTraverse(id), id).toBe(false);
    }
    expect(() => p.traverse('gate.fallenPass')).toThrow(/cannot cross/);
    // Act II chunks are unreachable on foot at the start; Act I chunks are open.
    const reach = p.reachableChunks();
    for (const c of db.world.chunks) expect(reach.has(`${c.cx},${c.cz}`), `${c.cx},${c.cz}`).toBe(c.act === 1);
  });

  it('walks the story graph from the prologue to the true ending', () => {
    const p = fresh();
    p.dispatch({ type: 'enterRegion', regionId: 'lanternwick' }); // the store announces the start region at boot
    playMainStory(p);
    expect([...p.party].sort()).toEqual([...HERO_IDS].sort());

    // Hollow Covenant investigations: every clue, non-linearly, via real dialogue/reveals/fights.
    for (const inv of db.quests.filter((q) => q.kind === 'investigation')) p.drive(inv.id);
    for (const clue of db.clues) expect(p.holds(clue.foundWhen), clue.id).toBe(true);

    // Every personal chain, every stage.
    for (const q of db.quests.filter((x) => x.chain)) p.drive(q.id);
    for (const id of CHAIN_FINALS) expect(p.status(id)).toBe('COMPLETED');
    for (const hero of HERO_IDS) {
      const owned = p.gear.map((g) => db.gear[g]).filter((g) => g?.boundHero === hero);
      const relics = owned.filter((g) => g?.archetype === 'relic');
      const sigs = owned.filter((g) => g?.archetype === 'signature');
      expect(relics, `${hero} relic`).toHaveLength(1);
      expect(sigs, `${hero} signature`).toHaveLength(1);
      const sig = sigs[0];
      expect(sig?.archetype === 'signature' && sig.hookId, hero).toBe(SIGNATURE_HOOK[hero]);
    }

    // The finale's last choice: the true ending is now on offer.
    const finale = db.endings.reduce((a, b) => (b.priority > a.priority ? b : a));
    expect(db.storyGraph.at(-1) && p.status(db.storyGraph.at(-1)!.questId)).toBe('COMPLETED');
    expect(p.dialogueFor('npc.flameHeart').id).toBe('dlg.flameHeart.after'); // the main path already answered (quench)
    const q = fresh();
    q.dispatch({ type: 'enterRegion', regionId: 'lanternwick' });
    for (const node of db.storyGraph.slice(0, -1)) q.drive(node.questId);
    for (const inv of db.quests.filter((x) => x.kind === 'investigation')) q.drive(inv.id);
    for (const s of db.quests.filter((x) => x.chain)) q.drive(s.id);
    const last = db.quests.find((x) => x.id === db.storyGraph.at(-1)!.questId)!;
    q.drive(last.id, 'ACTIVE');
    for (const o of last.objectives.slice(0, -1)) q.achieve(o.completeWhen);
    const choices = q.dialogueFor('npc.flameHeart').choices ?? [];
    const unbind = choices.find((c) => c.id === 'unbind');
    expect(unbind?.when && q.holds(unbind.when)).toBe(true);
    q.talk('npc.flameHeart', 'unbind');
    expect(q.status(last.id)).toBe('COMPLETED');
    const reached = db.endings.filter((e) => evaluate(e.when, q.flags, q.log)).sort((a, b) => b.priority - a.priority)[0];
    expect(reached?.id).toBe(finale.id);
  });

  it('the main path alone reaches an ending, but not the true one', () => {
    const p = fresh();
    p.dispatch({ type: 'enterRegion', regionId: 'lanternwick' });
    playMainStory(p);
    const reached = db.endings.filter((e) => p.holds(e.when)).sort((a, b) => b.priority - a.priority);
    expect(reached.length).toBeGreaterThan(0);
    const best = db.endings.reduce((a, b) => (b.priority > a.priority ? b : a));
    expect(reached[0]?.id).not.toBe(best.id);
    // The "unbind" choice is not even offered without the investigation and the chains.
    expect(p.dialogueFor('npc.flameHeart').id).toBe('dlg.flameHeart.after');
  });

  it('true-ending thresholds are explicit counts', () => {
    expect(db.clues.length).toBeGreaterThanOrEqual(TRUE_ENDING_CLUES);
    expect(JOIN_QUESTS).toHaveLength(6);
    expect(CHAIN_FINALS).toHaveLength(9);
  });

  it.each(db.quests.map((q) => q.id))('%s is reachable and completable by legal play', (id) => {
    const p = fresh();
    p.dispatch({ type: 'enterRegion', regionId: 'lanternwick' });
    p.drive(id);
    expect(p.status(id)).toBe('COMPLETED');
  });

  it.each(db.township.buildings.map((b) => b.id))('%s can be raised to level 3 with biome materials', (id) => {
    const p = fresh();
    p.dispatch({ type: 'enterRegion', regionId: 'lanternwick' });
    p.upgradeTo(id, 3);
    const plot = Object.entries(p.township.built).find(([, b]) => b === id)?.[0];
    expect(plot && p.township.levels[plot]).toBe(3);
  });
});

describe('Phase 3 mounts unlock through play', () => {
  it('drake flight unlocks with the Act I story and the strider through Hearthstead', () => {
    const p = fresh();
    p.dispatch({ type: 'enterRegion', regionId: 'lanternwick' });
    for (const m of Object.values(db.mounts)) expect(p.holds(m.unlockWhen), m.id).toBe(false);
    const flight = Object.values(db.mounts).find((m) => m.kind === 'flight')!;
    const beast = Object.values(db.mounts).find((m) => m.kind === 'beast')!;
    // Play the story in order until flight opens: it must happen inside Act I.
    let unlockedIn: number | null = null;
    for (const node of db.storyGraph) {
      p.drive(node.questId);
      if (p.holds(flight.unlockWhen)) { unlockedIn = node.act; break; }
      for (const q of db.quests.filter((x) => x.act === node.act && x.kind === 'companion' && x.companion === 'kael')) {
        if (p.status(q.id) !== 'COMPLETED') p.drive(q.id);
      }
      if (p.holds(flight.unlockWhen)) { unlockedIn = node.act; break; }
    }
    expect(unlockedIn).toBe(1);
    // The strider: raise the Hunting Lodge to its second level by legal play.
    p.upgradeTo('building.lodge', 2);
    expect(p.holds(beast.unlockWhen)).toBe(true);
  });
});
