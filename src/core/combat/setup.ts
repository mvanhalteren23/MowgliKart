import type { Combatant, CombatantId, CombatState, EncounterSetup, PartyMemberSetup } from '@/types/contracts';
import { COMBAT_PARTY_SIZE } from '@/types/contracts';
import { canFuse, buildChain } from '../fusion';
import { equippedGear, statsWithLoadout } from '../gear';
import { skillsAt } from '../progression';
import { seed as toSeed } from '../rng';
import { clamp } from '../stats';
import type { CombatCtx, CoreCombatState } from './context';
import { statsFor } from './effective';
import { advance, computeOrder } from './turns';

export function heroCombatantId(heroId: string): CombatantId {
  return `hero:${heroId}`;
}
export function enemyCombatantId(index: number, enemyId: string): CombatantId {
  return `enemy:${index}:${enemyId}`;
}

function heroCombatant(ctx: CombatCtx, m: PartyMemberSetup, liberatedRegions: number): Combatant {
  const hero = ctx.db.heroes[m.heroId];
  if (hero === undefined) throw new Error(`Unknown hero ${m.heroId}`);
  const level = Math.max(1, Math.floor(m.level));
  const baseStats = statsWithLoadout(ctx.db, hero, m.loadout, { level, liberatedRegions });
  const baseSkills = skillsAt(hero, level);
  // Spirits that fail validation (sealed, wrong host, duplicates, over the cap) are dropped.
  const spirits = m.fusion.length > 0 && canFuse(ctx.db, hero, m.fusion, null).ok ? m.fusion : [];
  const armorMax = spirits.length > 0 ? buildChain(ctx.db, hero, baseStats, baseSkills, spirits).resolve().armorMax : 0;
  const hooks = equippedGear(ctx.db, hero.id, m.loadout).flatMap((g) =>
    g.archetype === 'signature' && ctx.registry.get(g.hookId) ? [{ hookId: g.hookId, params: g.hookParams, sourceGear: g.id }] : [],
  );
  const draft: Combatant = {
    id: heroCombatantId(hero.id),
    side: 'party',
    name: hero.name,
    sprite: hero.sprite,
    heroId: hero.id,
    level,
    baseStats,
    baseAffinities: hero.affinities,
    baseSkills,
    hp: m.hp,
    ap: m.ap,
    sync: 0,
    alive: true,
    guarding: false,
    statuses: [],
    fusion: spirits.length > 0 ? { spirits, armor: armorMax, armorMax, broken: false, brokenTurns: 0 } : null,
    dragon: null,
    hooks,
  };
  const eff = statsFor(ctx, draft);
  const hp = clamp(Math.floor(m.hp), 0, eff.maxHp);
  return { ...draft, hp, ap: clamp(Math.floor(m.ap), 0, eff.maxAp), alive: hp > 0 };
}

/**
 * The heroes actually fielded: party order, duplicates dropped (first wins),
 * at most COMBAT_PARTY_SIZE. Any of the nine heroes may be fielded; heroes with
 * no dragon forms simply never gain Sync, heroes with no fusion affinity fight unfused.
 */
export function fieldedParty(party: readonly PartyMemberSetup[]): readonly PartyMemberSetup[] {
  const seen = new Set<string>();
  const out: PartyMemberSetup[] = [];
  for (const m of party) {
    if (seen.has(m.heroId) || out.length >= COMBAT_PARTY_SIZE) continue;
    seen.add(m.heroId);
    out.push(m);
  }
  return out;
}

/** Combat start. `setup.flags` is captured on the state (see `CoreCombatState`). */
export function startCombat(ctx: CombatCtx, setup: EncounterSetup, seed: number): CombatState {
  const enc = ctx.db.encounters[setup.encounterId];
  if (!enc) throw new Error(`Unknown encounter ${setup.encounterId}`);
  const combatants: Record<CombatantId, Combatant> = {};
  for (const m of fieldedParty(setup.party)) {
    const c = heroCombatant(ctx, m, setup.liberatedRegions);
    combatants[c.id] = c;
  }
  enc.enemies.forEach((enemyId, i) => {
    const def = ctx.db.enemies[enemyId];
    if (!def) throw new Error(`Unknown enemy ${enemyId} in ${enc.id}`);
    const id = enemyCombatantId(i, enemyId);
    combatants[id] = {
      id,
      side: 'enemy',
      name: def.name,
      sprite: def.sprite,
      enemyId,
      level: def.level,
      baseStats: def.stats,
      baseAffinities: def.affinities,
      baseSkills: def.skills,
      hp: def.stats.maxHp,
      ap: def.stats.maxAp,
      sync: 0,
      alive: true,
      guarding: false,
      statuses: [],
      fusion: null,
      dragon: null,
      hooks: [],
    };
  });
  const initial: CoreCombatState = {
    encounterId: enc.id,
    phase: 'awaitingInput',
    round: 1,
    order: [],
    turnIndex: -1,
    activeId: null,
    combatants,
    log: [],
    rng: toSeed(seed),
    canFlee: enc.canFlee,
    liberatedRegions: setup.liberatedRegions,
    rewards: null,
    flags: setup.flags ?? {},
  };
  return advance(ctx, { ...initial, order: computeOrder(ctx, initial) });
}
