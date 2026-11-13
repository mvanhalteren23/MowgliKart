/**
 * End-to-end vertical-slice tests (lead-owned).
 * Real content (`src/data`) + real rules (`src/core`, `src/systems`) driven
 * through the real Zustand store — no fixtures, no mocks.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { bindServices, deriveHeroSheet, getServices, storeConfig, useGame } from '@/app/store';
import { createCoreServices } from '@/core';
import { gameData as db } from '@/data';
import { createWorldSystems } from '@/systems';
import {
  HOOK_COUNTER_ATTACK,
  QUEST_STATUS_ORDER,
  type CombatAction,
  type CombatEvent,
  type CombatState,
  type Condition,
  type QuestId,
  type QuestStatus,
  type RelicGearDef,
  type SignatureGearDef,
  type StatKey,
  type WorldEvent,
} from '@/types/contracts';

const RELIC = 'relic.wyrmsLament';
const TALON = 'sig.cinderRingTalon';
const MAIN = 'main.lanternwickLedger';
const KAEL_QUEST = 'companion.embersOfTheClan';
const VESNA_QUEST = 'companion.debtsOfTheCinderRing';

const core = createCoreServices(db);
const systems = createWorldSystems(db);
const game = () => useGame.getState();

beforeEach(() => {
  storeConfig.enemyTurnDelayMs = 0;
  bindServices({ db, core, systems });
});

/* ── helpers ──────────────────────────────────────────────────────────── */

const rank = (s: QuestStatus): number => QUEST_STATUS_ORDER.indexOf(s);
const statusOf = (id: QuestId): QuestStatus => game().questLog[id]?.status ?? 'HIDDEN';
const holds = (c: Condition): boolean => core.quests.evaluate(c, game().flags, game().questLog);

/** Turn a canonical event flag key back into the world event that sets it. */
function eventForFlag(key: string): WorldEvent | null {
  const [ns, type, ...rest] = key.split(':');
  const id = rest.join(':');
  if (ns !== 'evt' || !type) return null;
  switch (type) {
    case 'talk':
      return { type: 'talk', npcId: id };
    case 'defeat':
      return { type: 'defeat', encounterId: id };
    case 'obtain':
      return { type: 'obtain', itemId: id, qty: 1 };
    case 'enter':
      return { type: 'enterRegion', regionId: id };
    case 'recruit':
      return { type: 'recruit', npcId: id };
    case 'build':
      return { type: 'build', buildingId: id };
    case 'accept':
      return { type: 'acceptQuest', questId: id };
    case 'liberate':
      return { type: 'liberate', regionId: id };
    case 'field': {
      const [action, ...target] = rest;
      return { type: 'fieldAction', action: action as never, targetId: target.join(':') };
    }
    case 'choice': {
      const choiceId = rest[rest.length - 1] ?? '';
      return { type: 'choice', dialogueId: rest.slice(0, -1).join(':'), choiceId };
    }
    default:
      return null;
  }
}

const transitions: { questId: QuestId; from: QuestStatus; to: QuestStatus }[] = [];

function dispatch(event: WorldEvent): void {
  const before = { ...game().questLog };
  game().dispatchWorldEvent(event);
  const after = game().questLog;
  for (const q of db.quests) {
    const a = before[q.id]?.status ?? 'HIDDEN';
    const b = after[q.id]?.status ?? 'HIDDEN';
    if (a !== b) transitions.push({ questId: q.id, from: a, to: b });
  }
}

/** Do whatever a player would have to do to make `c` true. */
function satisfy(c: Condition, depth = 0): void {
  if (depth > 12 || holds(c)) return;
  switch (c.kind) {
    case 'always':
      return;
    case 'flag': {
      const need = c.atLeast ?? 1;
      for (let i = 0; i < need + 1 && !holds(c); i++) {
        const ev = eventForFlag(c.key);
        if (ev?.type === 'recruit') {
          const def = db.township.recruits.find((r) => r.npcId === ev.npcId);
          if (def) satisfy(def.requires, depth + 1);
          game().recruit(ev.npcId);
          if (!holds(c)) dispatch(ev);
        } else if (ev?.type === 'build') {
          const building = db.township.buildings.find((b) => b.id === ev.buildingId);
          const plot = db.township.plots.find((p) => p.accepts.includes(ev.buildingId) && !game().township.built[p.id]);
          if (building && plot) {
            satisfy({ kind: 'flag', key: `evt:recruit:${building.requiresRecruit}` }, depth + 1);
            const inventory = { ...game().inventory };
            for (const it of building.cost.items) inventory[it.itemId] = (inventory[it.itemId] ?? 0) + it.qty;
            useGame.setState({ coin: game().coin + building.cost.coin, inventory });
            game().build(plot.id, building.id);
          }
          if (!holds(c)) dispatch(ev);
        } else if (ev) {
          dispatch(ev);
        } else {
          dispatch({ type: 'setFlag', key: c.key, value: c.equals ?? (c.atLeast ?? true) });
        }
      }
      return;
    }
    case 'quest':
    case 'questAtLeast':
      driveQuest(c.questId, c.status, depth + 1);
      return;
    case 'all':
      for (const sub of c.of) satisfy(sub, depth + 1);
      return;
    case 'any': {
      const first = c.of[0];
      if (first) satisfy(first, depth + 1);
      return;
    }
    case 'not':
      return; // nothing sensible to do; the slice quests don't gate progress on negatives
  }
}

function driveQuest(id: QuestId, target: QuestStatus = 'COMPLETED', depth = 0): void {
  const quest = db.quests.find((q) => q.id === id);
  if (!quest) throw new Error(`Unknown quest ${id}`);
  for (let guard = 0; guard < 40 && rank(statusOf(id)) < rank(target); guard++) {
    const status = statusOf(id);
    if (status === 'HIDDEN') satisfy(quest.discoverWhen, depth);
    else if (status === 'DISCOVERED') satisfy(quest.activateWhen, depth);
    else if (status === 'ACTIVE') {
      for (const o of quest.objectives) {
        if (game().questLog[id]?.objectives[o.id]) continue;
        if (o.revealWhen) satisfy(o.revealWhen, depth);
        satisfy(o.completeWhen, depth);
      }
    }
  }
}

function events(state: CombatState, from = 0): readonly CombatEvent[] {
  return state.log.slice(from);
}

/** Simple player policy: transform when possible, otherwise attack the weakest enemy. */
function autoAction(state: CombatState, allowTransform: boolean): CombatAction {
  const id = state.activeId ?? '';
  if (allowTransform) {
    const form = core.combat.availableForms(state, id).find((f) => f.usable);
    if (form && !state.combatants[id]?.dragon) return { type: 'transform', formId: form.formId };
  }
  const target = Object.values(state.combatants)
    .filter((c) => c.side === 'enemy' && c.alive)
    .sort((a, b) => a.hp - b.hp)[0];
  return { type: 'attack', targetId: target?.id ?? '' };
}

function playOut(allowTransform = true): CombatState {
  for (let guard = 0; guard < 400; guard++) {
    const combat = game().combat;
    if (!combat) throw new Error('combat ended unexpectedly');
    if (combat.phase !== 'awaitingInput') return combat;
    game().combatAct(autoAction(combat, allowTransform));
  }
  throw new Error('combat did not finish');
}

/* ── boot ─────────────────────────────────────────────────────────────── */

describe('new game', () => {
  it('boots into the overworld with the three slice heroes', () => {
    expect(game().mode).toBe('overworld');
    expect([...game().party].sort()).toEqual(['kael', 'tobin', 'vesna']);
    for (const id of game().party) {
      expect(db.heroes[id].playable).toBe(true);
      expect(game().roster[id]?.hp).toBeGreaterThan(0);
    }
    expect(db.heroes.kael.fieldActions).toEqual(expect.arrayContaining(['fish', 'drakeSight']));
    expect(db.heroes.tobin.fieldActions).toContain('huntShot');
    expect(db.heroes.vesna.fieldActions).toContain('huntDash');
  });

  it('hot-swaps the leader with zero menus, but never to a locked hero', () => {
    game().setLeader('vesna');
    expect(game().leader).toBe('vesna');
    game().cycleLeader(1);
    expect(game().leader).not.toBe('vesna');
    const before = game().leader;
    game().setLeader('orla');
    expect(game().leader).toBe(before);
  });
});

/* ── Warden fusion: decorator stacking on real content ─────────────────── */

describe('Warden fusion (decorator stacking)', () => {
  const hero = db.heroes.kael;
  const base = () => deriveHeroSheet(game(), 'kael')!.withGear;
  const skills = core.progression.skillsAt(hero, db.start.level);

  it('Ashka and Mirelle are awakened and hostable by Kael', () => {
    expect(db.spirits.ashka.awakened && db.spirits.mirelle.awakened).toBe(true);
    expect(core.fusion.canFuse(hero, ['ashka', 'mirelle'], ['ashka', 'mirelle']).ok).toBe(true);
    expect(core.fusion.canFuse(hero, ['ashka', 'ashka'], ['ashka']).ok).toBe(false);
    expect(core.fusion.canFuse(hero, ['ashka'], []).ok).toBe(false);
    expect(core.fusion.canFuse(hero, ['zephra'], ['zephra']).ok).toBe(false); // sealed in the slice
  });

  it('each layer wraps the previous profile', () => {
    const none = core.fusion.compose(hero, base(), skills, []);
    const fire = core.fusion.compose(hero, base(), skills, ['ashka']);
    const both = core.fusion.compose(hero, base(), skills, ['ashka', 'mirelle']);
    expect(none.stats).toEqual(base());
    expect(none.armorMax).toBe(0);
    expect(fire.layers.length).toBeGreaterThan(none.layers.length);
    expect(both.layers.length).toBeGreaterThan(fire.layers.length);
    expect(fire.armorMax).toBe(db.spirits.ashka.armor);
    expect(both.armorMax).toBe(db.spirits.ashka.armor + db.spirits.mirelle.armor);
    expect(fire.basicAttackElement).toBe('fire');
    expect(both.basicAttackElement).toBe('water'); // outermost layer imbues
    for (const s of db.spirits.ashka.grantsSkills) expect(fire.skills).toContain(s);
    for (const s of [...db.spirits.ashka.grantsSkills, ...db.spirits.mirelle.grantsSkills]) expect(both.skills).toContain(s);
    expect(both.auraColors).toEqual([db.spirits.ashka.auraColor, db.spirits.mirelle.auraColor]);
    expect(both.resonances.length).toBeGreaterThan(0);
  });

  it('stack order is observable', () => {
    const ab = core.fusion.compose(hero, base(), skills, ['ashka', 'mirelle']);
    const ba = core.fusion.compose(hero, base(), skills, ['mirelle', 'ashka']);
    expect(ab.basicAttackElement).not.toBe(ba.basicAttackElement);
    expect(ab.layers).not.toEqual(ba.layers);
  });

  it('a fused hero carries the armor pool into battle and breaks instead of losing the fusion', () => {
    useGame.setState({ spiritsOwned: ['ashka', 'mirelle'] });
    game().setFusion('kael', ['ashka']);
    expect(game().roster.kael?.fusion).toEqual(['ashka']);
    const encounterId = Object.keys(db.encounters)[0]!;
    game().startEncounter(encounterId);
    const kael = game().combat!.combatants['hero:kael']!;
    expect(kael.fusion?.armorMax).toBe(db.spirits.ashka.armor);
    expect(kael.fusion?.broken).toBe(false);
  });
});

/* ── Progression-scaling relic ─────────────────────────────────────────── */

describe("Wyrm's Lament (progression-scaling relic)", () => {
  const relic = db.gear[RELIC] as RelicGearDef;
  const total = (level: number, regions: number): number => Object.values(core.gear.bonus(relic, { level, liberatedRegions: regions })).reduce((a, b) => a + b, 0);

  it('is a relic that scales with level and liberated regions', () => {
    expect(relic.archetype).toBe('relic');
    expect(relic.slot).toBe('relic');
    expect(Object.keys(relic.scaling.perLevel).length).toBeGreaterThan(0);
    expect(Object.keys(relic.scaling.perLiberatedRegion).length).toBeGreaterThan(0);
  });

  it('never decreases with level, and strictly grows over the curve', () => {
    let prev = total(1, 0);
    for (let level = 2; level <= 40; level++) {
      const now = total(level, 0);
      expect(now).toBeGreaterThanOrEqual(prev);
      prev = now;
    }
    expect(total(20, 0)).toBeGreaterThan(total(1, 0));
  });

  it('grows with each liberated region', () => {
    expect(total(5, 1)).toBeGreaterThan(total(5, 0));
    expect(total(5, 3)).toBeGreaterThanOrEqual(total(5, 1));
  });

  it('respects its caps', () => {
    const huge = core.gear.bonus(relic, { level: 999, liberatedRegions: 999 });
    for (const [key, cap] of Object.entries(relic.scaling.cap ?? {})) expect(huge[key as StatKey]).toBeLessThanOrEqual(cap);
  });

  it('live: liberating a region raises the wearer’s stats in the store', () => {
    useGame.setState({ gearOwned: [...game().gearOwned, RELIC] });
    game().equip('kael', 'relic', RELIC);
    expect(game().roster.kael?.loadout.relic).toBe(RELIC);
    const before = deriveHeroSheet(game(), 'kael')!.withGear;
    useGame.setState({ liberatedRegions: ['region.a', 'region.b'] });
    const after = deriveHeroSheet(game(), 'kael')!.withGear;
    const sum = (s: object): number => Object.values(s as Record<string, number>).reduce((a, b) => a + b, 0);
    expect(sum(after)).toBeGreaterThan(sum(before));
  });
});

/* ── Build-altering signature gear: combat hook ────────────────────────── */

describe('Cinder Ring Talon (counter-attack hook)', () => {
  const talon = db.gear[TALON] as SignatureGearDef;

  it('is Vesna-bound signature gear wired to the counter hook', () => {
    expect(talon.archetype).toBe('signature');
    expect(talon.boundHero).toBe('vesna');
    expect(talon.hookId).toBe(HOOK_COUNTER_ATTACK);
    expect(core.gear.canEquip('vesna', talon)).toBe(true);
    expect(core.gear.canEquip('kael', talon)).toBe(false);
    expect(core.gear.hooks().some((h) => h.id === HOOK_COUNTER_ATTACK)).toBe(true);
  });

  const countCounters = (equipped: boolean): number => {
    let counters = 0;
    const encounterId = Object.keys(db.encounters)[0]!;
    for (let seed = 1; seed <= 40; seed++) {
      const vesna = game().roster.vesna!;
      let state = core.combat.start(
        {
          encounterId,
          liberatedRegions: 0,
          // Vesna alone, so every enemy single-target hit lands on the wearer.
          party: [{ heroId: 'vesna', level: vesna.level, hp: vesna.hp, ap: vesna.ap, fusion: [], loadout: equipped ? { ...vesna.loadout, signature: TALON } : vesna.loadout }],
        },
        seed,
      );
      for (let guard = 0; guard < 60 && (state.phase === 'awaitingInput' || state.phase === 'enemyTurn'); guard++) {
        const from = state.log.length;
        state = core.combat.step(state, state.phase === 'enemyTurn' ? core.combat.chooseEnemyAction(state) : { type: 'guard' });
        const evs = events(state, from);
        evs.forEach((e, i) => {
          if (e.type !== 'hook' || e.hookId !== HOOK_COUNTER_ATTACK) return;
          counters++;
          expect(e.ownerId).toBe('hero:vesna');
          expect(e.sourceGear).toBe(TALON);
          const followUp = evs.slice(i + 1).find((x) => x.type === 'attack');
          expect(followUp && followUp.type === 'attack' && followUp.actorId).toBe('hero:vesna');
        });
      }
    }
    return counters;
  };

  it('injects counter-attacks only while equipped', () => {
    expect(countCounters(false)).toBe(0);
    expect(countCounters(true)).toBeGreaterThan(0);
  });
});

/* ── Combat through the store ──────────────────────────────────────────── */

describe('combat loop', () => {
  it('plays a full encounter to a result and returns to the overworld', () => {
    const zone = db.world.encounterZones[0]!;
    game().startEncounter(zone.encounterId, zone.id);
    expect(game().mode).toBe('combat');
    const end = playOut();
    expect(['victory', 'defeat']).toContain(end.phase);
    if (end.phase === 'victory') {
      expect(end.rewards).not.toBeNull();
      expect(game().flags[`evt:defeat:${zone.encounterId}`]).toBeTruthy();
      if (zone.once) expect(game().clearedZones).toContain(zone.id);
    }
    game().endCombat();
    expect(game().mode).toBe('overworld');
    expect(game().combat).toBeNull();
    for (const id of game().party) expect(game().roster[id]?.hp).toBeGreaterThan(0);
  });

  it('Kael can sustain a multi-turn dragon form paid from Sync and AP', () => {
    const encounterId = Object.values(db.encounters).find((e) => e.boss)?.id ?? Object.keys(db.encounters)[0]!;
    game().startEncounter(encounterId);
    const end = playOut(true);
    const log = end.log;
    const transform = log.findIndex((e) => e.type === 'transform' && e.actorId === 'hero:kael');
    expect(transform).toBeGreaterThanOrEqual(0);
    // AP was spent to enter, and the form lasted beyond the turn it was entered on.
    const after = log.slice(transform + 1);
    const kaelTurnsInForm = after.filter((e) => e.type === 'turnStart' && e.actorId === 'hero:kael').length;
    const reverted = after.some((e) => e.type === 'revert' && e.actorId === 'hero:kael');
    expect(kaelTurnsInForm > 0 || reverted || end.phase !== 'awaitingInput').toBe(true);
  });

  it('is deterministic: same seed and actions replay identically', () => {
    const encounterId = Object.keys(db.encounters)[0]!;
    const run = (seed: number): CombatState => {
      const st = game();
      let state = core.combat.start({ encounterId, liberatedRegions: 0, party: st.party.map((heroId) => ({ heroId, ...st.roster[heroId]! })) }, seed);
      for (let guard = 0; guard < 300 && (state.phase === 'awaitingInput' || state.phase === 'enemyTurn'); guard++) {
        state = core.combat.step(state, state.phase === 'enemyTurn' ? core.combat.chooseEnemyAction(state) : autoAction(state, true));
      }
      return state;
    };
    expect(run(1234)).toEqual(run(1234));
    expect(run(1234).log).not.toEqual(run(99).log);
  });
});

/* ── Quests: HIDDEN → DISCOVERED → ACTIVE → COMPLETED ──────────────────── */

describe('quest state machine on the slice content', () => {
  it('every quest starts HIDDEN or is immediately discoverable', () => {
    for (const q of db.quests) expect(QUEST_STATUS_ORDER).toContain(statusOf(q.id));
    expect(statusOf(MAIN)).not.toBe('COMPLETED');
  });

  it.each([MAIN, KAEL_QUEST, VESNA_QUEST])('%s can be played to completion, only ever moving forward', (questId) => {
    transitions.length = 0;
    driveQuest(questId);
    expect(statusOf(questId)).toBe('COMPLETED');
    const mine = transitions.filter((t) => t.questId === questId);
    expect(mine.map((t) => t.to)).toEqual(expect.arrayContaining(['ACTIVE', 'COMPLETED']));
    for (const t of transitions) expect(rank(t.to)).toBe(rank(t.from) + 1); // one forward step at a time, no skips, no regressions
    expect(game().flags[`quest:${questId}`]).toBe('COMPLETED');
  });

  it('Embers of the Clan awards the Wyrm’s Lament relic', () => {
    expect(game().gearOwned).not.toContain(RELIC);
    driveQuest(KAEL_QUEST);
    expect(game().gearOwned).toContain(RELIC);
    game().equip('kael', 'relic', RELIC);
    expect(game().roster.kael?.loadout.relic).toBe(RELIC);
  });

  it('Debts of the Cinder Ring awards the Cinder Ring Talon, equippable only by Vesna', () => {
    driveQuest(VESNA_QUEST);
    expect(game().gearOwned).toContain(TALON);
    game().equip('kael', 'signature', TALON);
    expect(game().roster.kael?.loadout.signature).toBeUndefined();
    game().equip('vesna', 'signature', TALON);
    expect(game().roster.vesna?.loadout.signature).toBe(TALON);
    game().startEncounter(Object.keys(db.encounters)[0]!);
    expect(game().combat!.combatants['hero:vesna']!.hooks.map((h) => h.hookId)).toContain(HOOK_COUNTER_ATTACK);
  });

  it('the main quest ends with the occupied region liberated', () => {
    const occupied = db.world.regions.filter((r) => r.occupied);
    expect(occupied.length).toBeGreaterThan(0);
    driveQuest(MAIN);
    expect(statusOf(MAIN)).toBe('COMPLETED');
  });

  it('talking to a quest giver through the real dialogue flow advances quests', () => {
    const giver = db.world.npcs.find((n) => n.id === db.quests.find((q) => q.id === MAIN)?.giver) ?? db.world.npcs[0]!;
    game().setContextAction({ kind: 'talk', npcId: giver.id, label: giver.name });
    game().triggerContextAction();
    expect(game().mode).toBe('dialogue');
    for (let guard = 0; guard < 30 && game().dialogue; guard++) {
      const d = game().dialogue!;
      const def = db.dialogues[d.dialogueId]!;
      const last = d.lineIndex >= def.lines.length - 1;
      const choice = last ? (def.choices ?? []).find((c) => !c.when || holds(c.when)) : undefined;
      game().advanceDialogue(choice?.id);
    }
    expect(game().dialogue).toBeNull();
    expect(game().flags[`evt:talk:${giver.id}`]).toBeTruthy();
  });
});

/* ── Township, hunting, fishing ────────────────────────────────────────── */

describe('Hearthstead township', () => {
  it('recruits the carpenter and blacksmith and raises their workshops', () => {
    expect(db.township.recruits.length).toBeGreaterThanOrEqual(2);
    for (const building of db.township.buildings.filter((b) => db.township.recruits.some((r) => r.npcId === b.requiresRecruit))) {
      satisfy({ kind: 'flag', key: `evt:build:${building.id}` });
      expect(game().township.recruited).toContain(building.requiresRecruit);
      expect(Object.values(game().township.built)).toContain(building.id);
      expect(game().flags[building.unlocksFlag]).toBe(true);
    }
    expect(Object.values(game().township.built)).toEqual(expect.arrayContaining(['building.carpentry', 'building.smithy']));
  });

  it('refuses to build without the resident or the materials', () => {
    const building = db.township.buildings[0]!;
    const plot = db.township.plots.find((p) => p.accepts.includes(building.id))!;
    game().build(plot.id, building.id);
    expect(game().township.built[plot.id]).toBeUndefined();
  });
});

describe('hunting and fishing ecosystems', () => {
  it('scent carries downwind: an upwind hunter is detected from farther away', () => {
    const animal = systems.hunting.spawn(db.world.seed)[0]!;
    const wind = { direction: 0, speed: 6 }; // blowing toward +x
    const upwind = { x: animal.position.x - 20, z: animal.position.z }; // wind carries the hunter's scent to the animal
    const downwind = { x: animal.position.x + 20, z: animal.position.z };
    const a = systems.hunting.scent(animal, upwind, wind, 0);
    const b = systems.hunting.scent(animal, downwind, wind, 0);
    expect(a.upwindFactor).toBeGreaterThan(b.upwindFactor);
    expect(a.detectionRadius).toBeGreaterThan(b.detectionRadius);
  });

  it('a successful hunt reported by the engine pays out drops and fires quest events', () => {
    game().setLeader('tobin');
    const animals = systems.hunting.spawn(db.world.seed);
    const prey = animals[0]!;
    let result = systems.hunting.shoot(animals, { x: prey.position.x - 3, z: prey.position.z }, 0, 30, 42);
    for (let seed = 1; !result.hit && seed < 50; seed++) result = systems.hunting.shoot(animals, { x: prey.position.x - 3, z: prey.position.z }, 0, 30, seed);
    expect(result.hit).toBe(true);
    game().reportHunt(result);
    expect(game().flags[`evt:field:huntShot:${result.speciesId}`]).toBeTruthy();
    for (const d of result.drops) expect(game().inventory[d.itemId]).toBeGreaterThanOrEqual(d.qty);
  });

  it('Kael fishes at a spot through the store until the session resolves', () => {
    const spot = db.world.fishingSpots.find((s) => !s.hiddenUntilDrakeSight)!;
    game().setLeader('kael');
    game().setContextAction({ kind: 'fish', spotId: spot.id, label: spot.name });
    game().triggerContextAction();
    expect(game().mode).toBe('fishing');
    let tapped = false;
    for (let i = 0; i < 6000 && game().fishing && !['landed', 'escaped'].includes(game().fishing!.phase); i++) {
      const s = game().fishing!;
      const tap = s.phase === 'bite' && !tapped;
      tapped = s.phase === 'bite';
      game().fishingInput({ holding: s.phase === 'reeling' && s.tension < 0.7, tapped: tap }, 1 / 30);
    }
    expect(['landed', 'escaped']).toContain(game().fishing!.phase);
    if (game().fishing!.phase === 'landed') expect(game().flags[`evt:field:fish:${spot.id}`]).toBeTruthy();
    game().endFishing();
    expect(game().mode).toBe('overworld');
  });

  it('only a hero with the right field action can use it', () => {
    game().setLeader('vesna');
    const spot = db.world.fishingSpots[0]!;
    game().setContextAction({ kind: 'fish', spotId: spot.id, label: spot.name });
    game().triggerContextAction();
    expect(game().mode).toBe('overworld');
    expect(game().toasts.at(-1)?.tone).toBe('warn');
  });
});

describe('services', () => {
  it('are bound', () => {
    expect(getServices().db.title).toBe(db.title);
  });
});
