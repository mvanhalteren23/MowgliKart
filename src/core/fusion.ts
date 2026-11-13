/**
 * Warden fusion — Decorator pattern.
 *
 *   ProfileComponent           (interface)
 *   ├─ BaseHeroProfile         (concrete component: the hero + gear stats)
 *   └─ ProfileDecorator        (abstract decorator: wraps any component)
 *      ├─ SpiritDecorator      (data-driven: one per spirit in the stack)
 *      └─ ResonanceDecorator   (added when both resonance partners are present)
 *
 * Fusing [a, b] yields `Resonance(Spirit(b, Spirit(a, Base)))`: innermost first,
 * each layer applies its multipliers, then its flat bonuses, then floors. Order
 * is therefore observable (and the outermost spirit sets the basic-attack element).
 */
import type {
  CoreServices,
  FusedProfile,
  GameDatabase,
  HeroDef,
  SkillId,
  SpiritDef,
  SpiritId,
  StatBlock,
  Stats,
} from '@/types/contracts';
import { FUSION_MAX_STACK } from '@/types/contracts';
import { STAT_KEYS, addStats, floorStats, mulAffinities, mulStats, unionIds } from './stats';

export interface ProfileComponent {
  resolve(): FusedProfile;
}

function describeBlock(block: StatBlock, mode: 'mul' | 'add'): string {
  const parts: string[] = [];
  for (const k of STAT_KEYS) {
    const v = block[k];
    if (v === undefined) continue;
    if (mode === 'mul') parts.push(`${k} ×${Number(v.toFixed(3))}`);
    else parts.push(`${k} ${v >= 0 ? '+' : ''}${v}`);
  }
  return parts.join(', ');
}

export class BaseHeroProfile implements ProfileComponent {
  constructor(
    private readonly hero: HeroDef,
    private readonly base: Stats,
    private readonly skills: readonly SkillId[],
  ) {}

  resolve(): FusedProfile {
    return {
      heroId: this.hero.id,
      spirits: [],
      title: this.hero.name,
      stats: floorStats(this.base),
      affinities: { ...this.hero.affinities },
      skills: unionIds(this.skills),
      basicAttackElement: 'physical',
      armorMax: 0,
      auraColors: [],
      resonances: [],
      layers: [],
    };
  }
}

export abstract class ProfileDecorator implements ProfileComponent {
  constructor(protected readonly inner: ProfileComponent) {}
  abstract resolve(): FusedProfile;
}

/** Generic data-driven spirit layer. */
export class SpiritDecorator extends ProfileDecorator {
  constructor(
    inner: ProfileComponent,
    private readonly spirit: SpiritDef,
  ) {
    super(inner);
  }

  resolve(): FusedProfile {
    const p = this.inner.resolve();
    const s = this.spirit;
    const spirits = [...p.spirits, s.id];
    const stats = floorStats(addStats(mulStats(p.stats, s.statMultipliers), s.statBonuses));
    const detail = [describeBlock(s.statMultipliers, 'mul'), describeBlock(s.statBonuses, 'add'), `imbue ${s.imbue}`, `armor +${s.armor}`]
      .filter((x) => x.length > 0)
      .join('; ');
    return {
      ...p,
      spirits,
      title: `${p.title} · ${s.name}-bound`,
      stats,
      affinities: mulAffinities(p.affinities, s.affinities),
      skills: unionIds(p.skills, s.grantsSkills),
      basicAttackElement: s.imbue,
      armorMax: p.armorMax + s.armor,
      auraColors: [...p.auraColors, s.auraColor],
      layers: [...p.layers, `${s.name} (${s.element}): ${detail}`],
    };
  }
}

/** Resonance layer: extra multipliers when both partners share the stack. */
export class ResonanceDecorator extends ProfileDecorator {
  constructor(
    inner: ProfileComponent,
    private readonly name: string,
    private readonly partners: readonly [SpiritId, SpiritId],
    private readonly statMultipliers: StatBlock,
  ) {
    super(inner);
  }

  resolve(): FusedProfile {
    const p = this.inner.resolve();
    return {
      ...p,
      stats: floorStats(mulStats(p.stats, this.statMultipliers)),
      resonances: [...p.resonances, this.name],
      layers: [...p.layers, `Resonance «${this.name}» (${this.partners[0]} + ${this.partners[1]}): ${describeBlock(this.statMultipliers, 'mul')}`],
    };
  }
}

/** Build the decorator chain (exposed for inspection/tests). */
export function buildChain(db: GameDatabase, hero: HeroDef, base: Stats, skills: readonly SkillId[], spirits: readonly SpiritId[]): ProfileComponent {
  let component: ProfileComponent = new BaseHeroProfile(hero, base, skills);
  const stack: SpiritId[] = [];
  for (const id of spirits) {
    const def = db.spirits[id];
    if (stack.includes(id)) continue;
    stack.push(id);
    component = new SpiritDecorator(component, def);
  }
  const applied = new Set<string>();
  for (const id of stack) {
    for (const r of db.spirits[id].resonance ?? []) {
      if (!stack.includes(r.with) || applied.has(r.name)) continue;
      applied.add(r.name);
      component = new ResonanceDecorator(component, r.name, [id, r.with], r.statMultipliers);
    }
  }
  return component;
}

export function canFuse(
  db: GameDatabase,
  hero: HeroDef,
  spirits: readonly SpiritId[],
  owned: readonly SpiritId[] | null,
): { readonly ok: boolean; readonly reason?: string } {
  if (spirits.length > FUSION_MAX_STACK) return { ok: false, reason: `At most ${FUSION_MAX_STACK} Wardens can be fused at once.` };
  const seen = new Set<SpiritId>();
  for (const id of spirits) {
    const def = db.spirits[id];
    if (seen.has(id)) return { ok: false, reason: `${def.name} is already in the stack.` };
    seen.add(id);
    if (!hero.fusionAffinity.includes(id)) return { ok: false, reason: `${hero.name} cannot host ${def.name}.` };
    if (!def.awakened) return { ok: false, reason: `${def.name} is still sealed.` };
    if (owned !== null && !owned.includes(id)) return { ok: false, reason: `${def.name} has not been bound yet.` };
  }
  return { ok: true };
}

export function createFusion(db: GameDatabase): CoreServices['fusion'] {
  return {
    canFuse: (hero, spirits, owned) => canFuse(db, hero, spirits, owned),
    compose: (hero, base, skills, spirits) => buildChain(db, hero, base, skills, spirits).resolve(),
  };
}
