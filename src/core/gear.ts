import type {
  CoreServices,
  GameDatabase,
  GearDef,
  GearSlot,
  HeroDef,
  HeroId,
  Loadout,
  ProgressionContext,
  RelicGearDef,
  ScalingCurve,
  Stats,
} from '@/types/contracts';
import type { HookRegistry } from './hooks';
import { statsAt } from './progression';
import { addStats, fromBlock, makeStats } from './stats';

/**
 * Relic level curves, evaluated at n = level − 1 (so every curve is 0 at Lv 1):
 *   linear : n             — steady, uncapped growth
 *   sqrt   : √n × 3        — strong early, flattening late (n=1 → 3, n=9 → 9, n=25 → 15)
 *   log    : ln(1 + n) × 4 — front-loaded, very flat late (n=1 → 2.77, n=9 → 9.21)
 */
export function relicCurve(curve: ScalingCurve, n: number): number {
  const x = Math.max(0, n);
  switch (curve) {
    case 'linear':
      return x;
    case 'sqrt':
      return Math.sqrt(x) * 3;
    case 'log':
      return Math.log(1 + x) * 4;
  }
}

/** `stats + perLevel × curve(level − 1) + perLiberatedRegion × regions`, floored, then clamped by `cap`. */
export function relicBonus(gear: RelicGearDef, ctx: ProgressionContext): Stats {
  const c = relicCurve(gear.scaling.levelCurve, Math.floor(ctx.level) - 1);
  const regions = Math.max(0, Math.floor(ctx.liberatedRegions));
  return makeStats((k) => {
    const raw = (gear.stats[k] ?? 0) + (gear.scaling.perLevel[k] ?? 0) * c + (gear.scaling.perLiberatedRegion[k] ?? 0) * regions;
    const floored = Math.floor(raw);
    const cap = gear.scaling.cap?.[k];
    return cap === undefined ? floored : Math.min(floored, cap);
  });
}

export function gearBonus(gear: GearDef, ctx: ProgressionContext): Stats {
  return gear.archetype === 'relic' ? relicBonus(gear, ctx) : fromBlock(gear.stats);
}

export function canEquip(heroId: HeroId, gear: GearDef): boolean {
  return gear.boundHero === undefined || gear.boundHero === heroId;
}

/** Resolve a loadout to gear defs: unknown ids, slot mismatches and unequippable pieces are ignored. */
export function equippedGear(db: GameDatabase, heroId: HeroId, loadout: Loadout): readonly GearDef[] {
  const out: GearDef[] = [];
  for (const [slot, gearId] of Object.entries(loadout) as [GearSlot, string | undefined][]) {
    if (gearId === undefined) continue;
    const g = db.gear[gearId];
    if (!g || g.slot !== slot || !canEquip(heroId, g)) continue;
    out.push(g);
  }
  return out;
}

export function statsWithLoadout(db: GameDatabase, hero: HeroDef, loadout: Loadout, ctx: ProgressionContext): Stats {
  let s = statsAt(hero, ctx.level);
  for (const g of equippedGear(db, hero.id, loadout)) s = addStats(s, gearBonus(g, ctx));
  return s;
}

export function createGear(db: GameDatabase, registry: HookRegistry): CoreServices['gear'] {
  return {
    bonus: gearBonus,
    statsWithLoadout: (hero, loadout, ctx) => statsWithLoadout(db, hero, loadout, ctx),
    canEquip,
    hooks: () => registry.list(),
  };
}
