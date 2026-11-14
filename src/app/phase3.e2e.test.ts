/**
 * Phase 3 end-to-end tests (lead-owned): QTEs, elemental hazards, stamina,
 * mounts / fast travel and the asset manifest — real content, rules and store.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { runtime } from '@/app/runtime';
import { availableMounts, bindServices, discoveredWaypoints, storeConfig, useGame } from '@/app/store';
import { createDriver } from '@/app/testing/driver';
import { createCoreServices } from '@/core';
import { gameData as db } from '@/data';
import { createWorldSystems } from '@/systems';
import { HERO_IDS, type CombatAction, type CombatState, type HeroId } from '@/types/contracts';

const core = createCoreServices(db);
const systems = createWorldSystems(db);
let d = createDriver(db, core);
const game = () => useGame.getState();

beforeEach(() => {
  storeConfig.enemyTurnDelayMs = 0;
  bindServices({ db, core, systems });
  d = createDriver(db, core);
});

function strongParty(heroes: readonly HeroId[]): void {
  useGame.setState({
    party: [...heroes],
    leader: heroes[0]!,
    roster: Object.fromEntries(heroes.map((h) => [h, { level: 40, xp: 0, hp: 9999, ap: 9999, loadout: {}, fusion: [] }])),
  });
}

const qteSkills = Object.values(db.skills).filter((s) => s.qte);

/** Play hero turns with `pick` until it returns an action or the fight ends. */
function playUntil(pick: (s: CombatState) => CombatAction | null, maxTurns = 60): CombatState {
  for (let i = 0; i < maxTurns; i++) {
    const c = game().combat!;
    if (c.phase !== 'awaitingInput') return c;
    const chosen = pick(c);
    if (chosen) {
      game().combatAct(chosen);
      return game().combat!;
    }
    game().combatAct({ type: 'guard' });
  }
  return game().combat!;
}

describe('quick-time events on heavy skills', () => {
  it('heavy skills exist for the party and every dragon form finisher', () => {
    expect(qteSkills.length).toBeGreaterThan(0);
    for (const s of qteSkills) {
      expect(s.qte!.prompts).toBeGreaterThanOrEqual(1);
      expect(s.qte!.perfectMultiplier).toBeGreaterThan(s.qte!.goodMultiplier);
      expect(s.qte!.goodMultiplier).toBeGreaterThan(1);
    }
  });

  it.each(['perfect', 'miss'] as const)('a %s answer resolves the skill with the right grade', (outcome) => {
    strongParty([...HERO_IDS]);
    const encounterId = Object.keys(db.encounters)[0]!;
    game().startEncounter(encounterId);
    const state = playUntil((c) => {
      const id = c.activeId ?? '';
      const skill = core.combat.availableSkills(c, id).find((s) => db.skills[s]?.qte);
      if (!skill) return null;
      const def = db.skills[skill]!;
      const target = Object.values(c.combatants).find((x) => (def.target === 'ally' ? x.side === 'party' : x.side === 'enemy') && x.alive);
      return { type: 'skill', skillId: skill, targetId: def.target === 'enemy' || def.target === 'ally' ? target?.id : undefined };
    });
    expect(state.qte, 'a QTE window opened').toBeTruthy();
    expect(state.log.at(-1)?.type).toBe('qteStart');
    // Any other action is rejected while the window is open.
    game().combatAct({ type: 'guard' });
    expect(game().combat!.qte).toBeTruthy();
    expect(game().combat!.log.at(-1)?.type).toBe('invalid');

    const w = game().combat!.qte!;
    const results =
      outcome === 'perfect'
        ? w.sequence.map((input) => ({ input, ms: Math.floor(w.windowMs * w.perfectWithin * 0.5) }))
        : w.sequence.map(() => ({ input: null, ms: w.windowMs + 1 }));
    const before = game().combat!.log.length;
    game().combatAct({ type: 'qte', results });
    const after = game().combat!;
    expect(after.qte ?? null).toBeNull();
    const evs = after.log.slice(before);
    const result = evs.find((e) => e.type === 'qteResult');
    expect(result && result.type === 'qteResult' && result.grade).toBe(outcome);
    expect(evs.some((e) => e.type === 'hitStop')).toBe(outcome === 'perfect');
  });
});

describe('elemental chaining', () => {
  it('the matrix defines the four required hazards and their chains', () => {
    for (const id of Object.keys(db.hazards)) {
      const h = db.hazards[id]!;
      expect(db.assetRequests.some((a) => a.asset_id === h.iconAssetId), h.iconAssetId).toBe(true);
      expect(db.assetRequests.some((a) => a.asset_id === h.fxAssetId), h.fxAssetId).toBe(true);
    }
    const spawns = (element: string) => db.reactions.filter((r) => r.element === element).map((r) => r.spawns ?? '');
    const has = (re: RegExp) => Object.keys(db.hazards).find((k) => re.test(k));
    const steam = has(/steam/i)!;
    const electrified = has(/electri/i)!;
    const frozen = has(/frozen|frost|ice/i)!;
    const smoke = has(/smoke/i)!;
    for (const h of [steam, electrified, frozen, smoke]) expect(h).toBeDefined();
    expect(spawns('water')).toContain(steam);
    expect(spawns('lightning')).toContain(electrified);
    expect(spawns('ice')).toContain(frozen);
    expect(db.reactions.some((r) => r.spawns === smoke)).toBe(true);
    expect(db.reactions.find((r) => r.spawns === electrified)?.when.sideHazard).toBeTruthy();
  });

  it('hazards appear in real battles and never knock anyone out', () => {
    strongParty([...HERO_IDS]);
    let sawHazard = false;
    for (const encounterId of Object.keys(db.encounters).slice(0, 12)) {
      game().startEncounter(encounterId);
      for (let i = 0; i < 80; i++) {
        const c = game().combat!;
        if (c.phase !== 'awaitingInput') break;
        if (c.qte) {
          game().combatAct({ type: 'qte', results: c.qte.sequence.map((input) => ({ input, ms: 100 })) });
          continue;
        }
        const id = c.activeId ?? '';
        const skills = core.combat.availableSkills(c, id).filter((s) => db.skills[s]?.target === 'enemy' && db.skills[s]?.element !== 'physical');
        const target = Object.values(c.combatants).find((x) => x.side === 'enemy' && x.alive);
        const skill = skills[i % Math.max(1, skills.length)];
        game().combatAct(skill && target ? { type: 'skill', skillId: skill, targetId: target.id } : { type: 'attack', targetId: target?.id ?? '' });
      }
      const log = game().combat!.log;
      if (log.some((e) => e.type === 'hazardSpawn')) sawHazard = true;
      for (let k = 0; k < log.length; k++) {
        const e = log[k]!;
        if (e.type === 'hazardTick') expect(log[k + 1]?.type === 'ko' && (log[k + 1] as { targetId: string }).targetId === e.targetId).toBe(false);
      }
      game().endCombat();
      useGame.setState({ combat: null, mode: 'overworld' });
    }
    expect(sawHazard).toBe(true);
  });
});

describe('stamina', () => {
  it('sprint lasts several seconds from full, then exhausts and recovers', () => {
    const t = db.stamina;
    let s = core.stamina.initial(t);
    let secs = 0;
    while (core.stamina.canDrain(s) && secs < 60) {
      s = core.stamina.tick(s, t.sprintDrainPerSec, 0.1, t);
      secs += 0.1;
    }
    expect(secs).toBeGreaterThan(5);
    expect(secs).toBeLessThan(10);
    expect(s.exhausted).toBe(true);
    for (let i = 0; i < 600 && s.exhausted; i++) s = core.stamina.tick(s, 0, 0.1, t);
    expect(s.exhausted).toBe(false);
    expect(s.current).toBeGreaterThanOrEqual(t.max * t.recoverFraction);
  });
});

describe('mounts and fast travel', () => {
  const flight = Object.values(db.mounts).find((m) => m.kind === 'flight')!;
  const beast = Object.values(db.mounts).find((m) => m.kind === 'beast')!;

  it('defines a flight mount and a beast mount with delivered-or-pending art requests', () => {
    expect(flight.ignoresCollision).toBe(true);
    expect(beast.ignoresCollision).toBe(false);
    for (const m of [flight, beast]) for (const id of [m.assetId, m.iconAssetId]) expect(db.assetRequests.some((a) => a.asset_id === id), id).toBe(true);
  });

  it('flight is locked at the start and unlocks through the story', () => {
    expect(availableMounts(game()).some((m) => m.id === flight.id)).toBe(false);
    game().mount(flight.id);
    expect(game().mountedOn).toBeNull();
    d.satisfy(flight.unlockWhen);
    expect(availableMounts(game()).some((m) => m.id === flight.id)).toBe(true);
    game().mount(flight.id);
    expect(game().mountedOn).toBe(flight.id);
    game().dismount();
    expect(game().mountedOn).toBeNull();
  });

  it('fast travel flies only to discovered regions and lands on arrival', () => {
    d.satisfy(flight.unlockWhen);
    const far = db.world.regions[db.world.regions.length - 1]!;
    game().flyTo(far.id);
    if (!discoveredWaypoints(game()).some((r) => r.id === far.id)) expect(runtime.requests.flyTo).toBeNull();
    d.dispatch({ type: 'enterRegion', regionId: far.id });
    game().flyTo(far.id);
    expect(game().mountedOn).toBe(flight.id);
    expect(game().flightTarget).toBe(far.id);
    expect(runtime.requests.flyTo).toEqual({ x: far.center.x, z: far.center.z });
    game().arrive('arrived');
    expect(game().mountedOn).toBeNull();
    expect(game().flightTarget).toBeNull();
    expect(runtime.requests.flyTo).toBeNull();
  });
});

describe('asset manifest', () => {
  const KEYS = ['asset_id', 'type', 'target_path', 'resolution', 'grid', 'fps', 'loop', 'alpha_channel', 'prompt_spec', 'status', 'category', 'animation_states'];

  it('every request matches the shared schema and is unique', () => {
    expect(db.assetRequests.length).toBeGreaterThan(20);
    const ids = new Set<string>();
    for (const a of db.assetRequests) {
      expect(ids.has(a.asset_id), a.asset_id).toBe(false);
      ids.add(a.asset_id);
      for (const k of Object.keys(a)) expect(KEYS, `${a.asset_id}.${k}`).toContain(k);
      expect(a.target_path.startsWith('public/assets/generated/'), a.asset_id).toBe(true);
      expect(/\.(png|webp)$/.test(a.target_path)).toBe(true);
      if (a.grid) {
        expect(a.grid.columns * a.grid.frame_width).toBe(a.resolution.width);
        expect(a.grid.rows * a.grid.frame_height).toBe(a.resolution.height);
      }
      expect(a.prompt_spec.length).toBeGreaterThan(40);
    }
  });

  it('covers mounts, hazards and QTE prompts', () => {
    const cats = new Set(db.assetRequests.map((a) => a.category));
    for (const c of ['mount', 'hazard', 'qte']) expect(cats.has(c as never), c).toBe(true);
    for (const dir of ['up', 'down', 'left', 'right', 'tap']) expect(db.assetRequests.some((a) => a.category === 'qte' && a.asset_id.includes(dir)), dir).toBe(true);
  });

  it('prompts describe an original style', () => {
    const deny = /breath of fire|capcom|square ?enix|octopath|nintendo|zelda|final fantasy|pok[eé]mon|studio ghibli|ghibli|chrono|dragon quest|toriyama/i;
    for (const a of db.assetRequests) expect(deny.test(a.prompt_spec), a.asset_id).toBe(false);
  });
});
