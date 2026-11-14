/**
 * Full-campaign end-to-end tests (lead-owned): real content, real rules, real store.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { runtime } from '@/app/runtime';
import { bindServices, combatParty, foundClues, resolveEnding, storeConfig, useGame } from '@/app/store';
import { createDriver } from '@/app/testing/driver';
import { createCoreServices } from '@/core';
import { gameData as db } from '@/data';
import { createWorldSystems } from '@/systems';
import {
  CHUNK_SIZE,
  COMBAT_PARTY_SIZE,
  HERO_IDS,
  HOOK_IDS,
  TRAVERSAL_FOR_GATE,
  type HeroId,
  type RelicGearDef,
  type SignatureGearDef,
} from '@/types/contracts';

const core = createCoreServices(db);
const systems = createWorldSystems(db);
let d = createDriver(db, core);
const game = () => useGame.getState();

beforeEach(() => {
  storeConfig.enemyTurnDelayMs = 0;
  bindServices({ db, core, systems });
  d = createDriver(db, core);
});

const SIGNATURE_HOOK: Readonly<Record<HeroId, string>> = {
  kael: HOOK_IDS.dragonSurge,
  tobin: HOOK_IDS.markedQuarry,
  vesna: HOOK_IDS.counterAttack,
  orla: HOOK_IDS.mendingEcho,
  hadrik: HOOK_IDS.bulwark,
  pim: HOOK_IDS.pilfer,
  quill: HOOK_IDS.spellEcho,
  moss: HOOK_IDS.rootbind,
  sable: HOOK_IDS.reap,
};

const TRAVERSAL: Readonly<Partial<Record<HeroId, string>>> = { hadrik: 'roll', orla: 'glide', sable: 'grapple', pim: 'leap', moss: 'commune', quill: 'unseal' };

const mainQuestsInOrder = (): string[] => db.storyGraph.map((n) => n.questId);
const sumStats = (s: object): number => Object.values(s as Record<string, number>).reduce((a, b) => a + b, 0);

/* ── roster ──────────────────────────────────────────────────────────── */

describe('the nine-hero roster', () => {
  it('defines all nine heroes as playable with their traversal', () => {
    for (const id of HERO_IDS) expect(db.heroes[id].playable, id).toBe(true);
    for (const [hero, action] of Object.entries(TRAVERSAL)) {
      expect(db.heroes[hero as HeroId].fieldActions, hero).toContain(action);
      expect(db.fieldActions[action as keyof typeof db.fieldActions].clears).toBeDefined();
    }
    for (const [gate, action] of Object.entries(TRAVERSAL_FOR_GATE)) expect(db.fieldActions[action].clears).toBe(gate);
  });

  it('recruits each newcomer when their join quest completes', () => {
    for (const id of HERO_IDS) {
      if (db.start.party.includes(id)) continue;
      const joinQuest = db.heroes[id].joinQuest;
      expect(joinQuest, `${id} joinQuest`).toBeDefined();
      expect(game().party).not.toContain(id);
      d.driveQuest(joinQuest!);
      expect(game().party, `${id} joins`).toContain(id);
      expect(game().roster[id]?.hp).toBeGreaterThan(0);
    }
    expect(game().party).toHaveLength(9);
  });

  it('fields at most four heroes, leader first', () => {
    useGame.setState({ party: [...HERO_IDS], roster: Object.fromEntries(HERO_IDS.map((h) => [h, { level: 20, xp: 0, hp: 999, ap: 999, loadout: {}, fusion: [] }])) });
    game().setLeader('quill');
    const fielded = combatParty(game());
    expect(fielded).toHaveLength(COMBAT_PARTY_SIZE);
    expect(fielded[0]).toBe('quill');
    game().startEncounter(Object.keys(db.encounters)[0]!);
    const heroes = Object.values(game().combat!.combatants).filter((c) => c.side === 'party');
    expect(heroes).toHaveLength(COMBAT_PARTY_SIZE);
  });
});

/* ── personal gear ───────────────────────────────────────────────────── */

describe('personal relics and signature items', () => {
  const gear = Object.values(db.gear);

  it.each([...HERO_IDS])('%s has one bound scaling relic and one bound signature with the right hook', (hero) => {
    const relics = gear.filter((g) => g.archetype === 'relic' && g.boundHero === hero) as RelicGearDef[];
    const sigs = gear.filter((g) => g.archetype === 'signature' && g.boundHero === hero) as SignatureGearDef[];
    expect(relics).toHaveLength(1);
    expect(sigs).toHaveLength(1);
    expect(sigs[0]!.hookId).toBe(SIGNATURE_HOOK[hero]);
    expect(core.gear.hooks().map((h) => h.id)).toContain(sigs[0]!.hookId);
    const relic = relics[0]!;
    const at = (level: number, regions: number) => sumStats(core.gear.bonus(relic, { level, liberatedRegions: regions }));
    for (let level = 2; level <= 50; level++) expect(at(level, 0)).toBeGreaterThanOrEqual(at(level - 1, 0));
    expect(at(30, 0)).toBeGreaterThan(at(1, 0));
    expect(at(10, 4)).toBeGreaterThan(at(10, 0));
    const other = HERO_IDS.find((h) => h !== hero)!;
    expect(core.gear.canEquip(other, relic)).toBe(false);
    expect(core.gear.canEquip(hero, sigs[0]!)).toBe(true);
  });

  it.each([...HERO_IDS])("%s's personal chain is multi-stage and awards both items", (hero) => {
    const chainId = db.heroes[hero].personalChain;
    expect(chainId).toBeDefined();
    const stages = db.quests.filter((q) => q.chain?.id === chainId).sort((a, b) => a.chain!.stage - b.chain!.stage);
    expect(stages.length).toBeGreaterThanOrEqual(2);
    if (!db.start.party.includes(hero)) d.driveQuest(db.heroes[hero].joinQuest!);
    for (const q of stages) d.driveQuest(q.id);
    for (const q of stages) expect(d.statusOf(q.id)).toBe('COMPLETED');
    const owned = game().gearOwned.map((id) => db.gear[id]).filter((g) => g?.boundHero === hero);
    expect(owned.some((g) => g?.archetype === 'relic')).toBe(true);
    expect(owned.some((g) => g?.archetype === 'signature')).toBe(true);
  });
});

/* ── dragon forms ────────────────────────────────────────────────────── */

describe("Kael's dragon forms", () => {
  const forms = db.heroes.kael.dragonForms.map((f) => db.dragonForms[f.formId]!);

  it('has a hatchling, fire/ice/lightning forms and a story-gated apex', () => {
    expect(forms.filter((f) => /pup|hatch|whelp|kit/.test(f.sprite))).not.toHaveLength(0);
    for (const kind of [/cinder|ember/, /rime|frost/, /storm|thunder/]) expect(forms.some((f) => kind.test(f.sprite)), String(kind)).toBe(true);
    expect(forms.find((f) => /rime|frost/.test(f.sprite))?.element).toBe('ice');
    expect(forms.find((f) => /cinder|ember/.test(f.sprite))?.element).toBe('fire');
    const apex = forms.filter((f) => f.apex);
    expect(apex).toHaveLength(1);
    expect(apex[0]!.requiresFlag).toBeTruthy();
  });

  it('the apex form is locked until its story flag is set', () => {
    const apex = forms.find((f) => f.apex)!;
    useGame.setState({ roster: { ...game().roster, kael: { ...game().roster.kael!, level: 99, ap: 999 } } });
    game().startEncounter(Object.keys(db.encounters)[0]!);
    const locked = core.combat.availableForms(game().combat!, 'hero:kael').find((f) => f.formId === apex.id);
    expect(locked?.usable).toBe(false);
    game().endCombat();
    useGame.setState({ combat: null, mode: 'overworld' });
    d.dispatch({ type: 'setFlag', key: apex.requiresFlag!, value: true });
    game().startEncounter(Object.keys(db.encounters)[0]!);
    const state = game().combat!;
    const entry = core.combat.availableForms(state, 'hero:kael').find((f) => f.formId === apex.id);
    expect(entry).toBeDefined();
    expect(entry?.reason ?? '').not.toMatch(/story|flag|locked/i);
  });
});

/* ── continent & traversal ───────────────────────────────────────────── */

describe('the continent', () => {
  it('has ten connected authored chunks, one per story chapter region', () => {
    const chunks = db.world.chunks;
    expect(chunks.length).toBeGreaterThanOrEqual(10);
    expect(chunks.some((c) => c.cx === 0 && c.cz === 0)).toBe(true);
    const key = (x: number, z: number) => `${x},${z}`;
    const set = new Set(chunks.map((c) => key(c.cx, c.cz)));
    const seen = new Set<string>([key(0, 0)]);
    const queue: [number, number][] = [[0, 0]];
    while (queue.length) {
      const [x, z] = queue.shift()!;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const k = key(x + dx, z + dz);
        if (set.has(k) && !seen.has(k)) {
          seen.add(k);
          queue.push([x + dx, z + dz]);
        }
      }
    }
    expect(seen.size).toBe(set.size);
    for (const node of db.storyGraph) {
      const region = db.world.regions.find((r) => r.id === node.regionId);
      expect(region, node.id).toBeDefined();
      expect(set.has(key(Math.floor(region!.center.x / CHUNK_SIZE), Math.floor(region!.center.z / CHUNK_SIZE))), node.id).toBe(true);
    }
  });

  it('traversal is zero-menu: the right companion steps forward and the crossing is recorded', () => {
    const gate = db.world.traversalGates[0]!;
    const action = TRAVERSAL_FOR_GATE[gate.kind];
    const hero = HERO_IDS.find((h) => db.heroes[h].fieldActions.includes(action))!;
    useGame.setState({ party: [...game().party, hero], roster: { ...game().roster, [hero]: game().roster[hero] ?? { level: 10, xp: 0, hp: 100, ap: 40, loadout: {}, fusion: [] } } });
    game().setLeader('kael');
    game().setContextAction({ kind: 'traverse', gateId: gate.id, action, label: gate.label });
    game().triggerContextAction();
    expect(game().leader).toBe(hero);
    expect(runtime.requests.traverseGate).toBe(gate.id);
    expect(runtime.requests.fieldAction).toBe(action);
    expect(game().flags[`evt:field:${action}:${gate.id}`]).toBeTruthy();
  });

  it('a drag-aimed hunting shot hands its aim to the engine', () => {
    game().setLeader('tobin');
    game().performFieldAction('huntShot', { aimAngle: 1.2, aimPower: 0.8 });
    expect(runtime.requests.huntAim).toEqual({ angle: 1.2, power: 0.8 });
    expect(runtime.requests.fieldAction).toBe('huntShot');
  });

  it('a good cast bites sooner than a poor one', () => {
    const spot = db.world.fishingSpots[0]!;
    let poor = 0;
    let good = 0;
    for (let seed = 1; seed <= 60; seed++) {
      poor += systems.fishing.cast(spot.id, null, seed, 0).biteAt;
      good += systems.fishing.cast(spot.id, null, seed, 1).biteAt;
    }
    expect(good).toBeLessThan(poor);
  });
});

/* ── story graph, investigations, endings ────────────────────────────── */

describe('the main story', () => {
  it('has ten chapters across three acts, wired as a graph from the prologue', () => {
    expect(db.storyGraph).toHaveLength(10);
    expect(new Set(db.storyGraph.map((n) => n.act))).toEqual(new Set([1, 2, 3]));
    const ids = new Set(db.storyGraph.map((n) => n.id));
    for (const n of db.storyGraph) for (const next of n.next) expect(ids.has(next), `${n.id} → ${next}`).toBe(true);
    const targets = new Set(db.storyGraph.flatMap((n) => n.next));
    expect(db.storyGraph.filter((n) => !targets.has(n.id))).toHaveLength(1); // a single root
    expect(db.storyGraph.includes(db.storyGraph.find((n) => n.questId === 'main.lanternwickLedger')!)).toBe(true);
  });

  it('later chapters stay hidden until their predecessors are done', () => {
    const last = db.storyGraph[db.storyGraph.length - 1]!;
    expect(d.statusOf(last.questId)).toBe('HIDDEN');
  });

  it('plays from the prologue to the finale, moving forward only, and resolves an ending', () => {
    d.transitions.length = 0;
    for (const q of mainQuestsInOrder()) d.driveQuest(q);
    for (const q of mainQuestsInOrder()) expect(d.statusOf(q), q).toBe('COMPLETED');
    for (const t of d.transitions) expect(d.rank(t.to)).toBe(d.rank(t.from) + 1);
    const ending = resolveEnding(game());
    expect(ending).not.toBeNull();
    const trueEnding = [...db.endings].sort((a, b) => b.priority - a.priority)[0]!;
    expect(ending!.id).not.toBe(trueEnding.id); // the true ending needs more than the main path
  });

  it('the true ending needs the investigation, every hero and every personal chain', () => {
    expect(db.clues.length).toBeGreaterThanOrEqual(12);
    const trueEnding = [...db.endings].sort((a, b) => b.priority - a.priority)[0]!;
    for (const inv of db.quests.filter((q) => q.kind === 'investigation')) d.driveQuest(inv.id);
    for (const c of db.clues) d.satisfy(c.foundWhen);
    expect(foundClues(game())).toHaveLength(db.clues.length);
    for (const id of HERO_IDS) if (!db.start.party.includes(id)) d.driveQuest(db.heroes[id].joinQuest!);
    for (const q of db.quests.filter((x) => x.chain)) d.driveQuest(q.id);
    for (const q of mainQuestsInOrder()) d.driveQuest(q);
    d.satisfy(trueEnding.when);
    expect(resolveEnding(game())?.id).toBe(trueEnding.id);
  });
});

/* ── township ────────────────────────────────────────────────────────── */

describe('Hearthstead upgrades', () => {
  it('every building has two architectural upgrades that raise its level and set flags', () => {
    expect(db.township.buildings.length).toBeGreaterThanOrEqual(6);
    for (const b of db.township.buildings) {
      expect(b.upgrades.map((u) => u.level)).toEqual([2, 3]);
      d.upgradeTo(b.id, 3);
      const plot = Object.entries(game().township.built).find(([, id]) => id === b.id)?.[0];
      expect(plot, b.id).toBeDefined();
      expect(game().township.levels[plot!]).toBe(3);
      for (const u of b.upgrades) expect(game().flags[u.unlocksFlag], u.unlocksFlag).toBe(true);
    }
  });

  it('refuses an upgrade the town cannot afford', () => {
    const b = db.township.buildings[0]!;
    d.satisfy({ kind: 'flag', key: `evt:build:${b.id}` });
    const plot = Object.entries(game().township.built).find(([, id]) => id === b.id)![0];
    useGame.setState({ coin: 0, inventory: {} });
    game().upgradeBuilding(plot);
    expect(game().township.levels[plot]).toBe(1);
  });
});
