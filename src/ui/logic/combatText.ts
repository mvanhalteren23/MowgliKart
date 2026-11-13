/** Combat helpers for the HUD — framework-free, unit tested. */
import type { CombatEvent, CombatantId, SkillTarget } from '@/types/contracts';

export type TargetMode = 'enemy' | 'ally' | 'none';

/** What the player must pick after choosing a skill. */
export function targetModeFor(target: SkillTarget): TargetMode {
  switch (target) {
    case 'enemy':
      return 'enemy';
    case 'ally':
      return 'ally';
    case 'self':
    case 'allEnemies':
    case 'allAllies':
      return 'none';
  }
}

export type NameOf = (id: CombatantId) => string;
export type SkillNameOf = (id: string) => string;

/** One floating combat-log line per meaningful event; `null` for bookkeeping events. */
export function formatCombatEvent(ev: CombatEvent, nameOf: NameOf, skillName: SkillNameOf, formName: SkillNameOf = (id) => id): string | null {
  switch (ev.type) {
    case 'turnStart':
      return null;
    case 'attack':
      return ev.skillId ? `${nameOf(ev.actorId)} uses ${skillName(ev.skillId)}` : `${nameOf(ev.actorId)} attacks ${nameOf(ev.targetId)}`;
    case 'damage': {
      const tag = ev.affinity === 'weak' ? ' — weak!' : ev.affinity === 'resist' ? ' — resisted' : ev.affinity === 'immune' ? ' — immune' : '';
      const crit = ev.crit ? 'Critical! ' : '';
      const armor = ev.absorbedByArmor > 0 ? ` (${ev.absorbedByArmor} to armor)` : '';
      return `${crit}${nameOf(ev.targetId)} takes ${ev.amount}${armor}${tag}`;
    }
    case 'heal':
      return `${nameOf(ev.targetId)} recovers ${ev.amount} HP`;
    case 'apChange':
      return null;
    case 'status':
      return ev.applied ? `${nameOf(ev.targetId)}: ${ev.status}` : null;
    case 'guard':
      return `${nameOf(ev.actorId)} guards`;
    case 'transform':
      return `${nameOf(ev.actorId)} becomes ${formName(ev.formId)}!`;
    case 'revert':
      return `${nameOf(ev.actorId)} reverts${ev.reason === 'manual' ? '' : ev.reason === 'apDepleted' ? ' (AP spent)' : ev.reason === 'maxTurns' ? ' (form exhausted)' : ''}`;
    case 'armorBreak':
      return `${nameOf(ev.targetId)}'s fusion BREAKS!`;
    case 'armorRestore':
      return `${nameOf(ev.targetId)}'s fusion re-forms`;
    case 'hook':
      return ev.note || `${nameOf(ev.ownerId)} triggers a passive`;
    case 'ko':
      return `${nameOf(ev.targetId)} falls`;
    case 'flee':
      return ev.success ? 'The party escapes!' : 'Could not escape!';
    case 'invalid':
      return ev.reason;
    case 'end':
      return ev.outcome === 'victory' ? 'Victory!' : ev.outcome === 'defeat' ? 'Defeat…' : 'Escaped.';
  }
}

/** Split a fusion armor pool into at most `maxPips` pips; returns [filled, total]. */
export function armorPips(armor: number, armorMax: number, maxPips = 6): readonly [number, number] {
  if (armorMax <= 0) return [0, 0];
  const total = Math.min(maxPips, Math.max(1, Math.round(armorMax)));
  const filled = armor <= 0 ? 0 : Math.max(1, Math.ceil((Math.min(armor, armorMax) / armorMax) * total));
  return [filled, total];
}

/** Combatant ids are `hero:<HeroId>` or `enemy:<index>:<EnemyId>`. */
export const isHeroId = (id: CombatantId): boolean => id.startsWith('hero:');
