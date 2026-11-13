import type { DragonFormDef } from '@/types/contracts';

/**
 * Sync gains +12 per action and +8 when hit (~20 per round), so the Whelp
 * (40 Sync) is reachable on turn 2–3; the Ashen Drake (70) is a late-fight payoff.
 * Kael at L3 has 26 AP: Whelp entry 8 + 4/turn leaves room for 1–2 form skills.
 */
export const dragonForms = {
  'form.emberWhelp': {
    id: 'form.emberWhelp',
    name: 'Ember Whelp',
    element: 'fire',
    sprite: 'dragon.emberWhelp',
    syncRequired: 40,
    apCostToEnter: 8,
    apDrainPerTurn: 4,
    maxTurns: 3,
    statMultipliers: { atk: 1.3, mag: 1.3, def: 1.15, spd: 1.1 },
    affinities: { fire: 0.5, water: 1.25 },
    skills: ['skill.whelpFlame', 'skill.ashClaw'],
  },
  'form.ashenDrake': {
    id: 'form.ashenDrake',
    name: 'Ashen Drake',
    element: 'fire',
    sprite: 'dragon.ashenDrake',
    syncRequired: 70,
    apCostToEnter: 14,
    apDrainPerTurn: 6,
    maxTurns: 4,
    statMultipliers: { maxHp: 1.2, atk: 1.6, mag: 1.6, def: 1.35, res: 1.2, spd: 1.15 },
    affinities: { fire: 0, water: 1.2, shadow: 0.75 },
    skills: ['skill.drakeInferno', 'skill.wyrmRend', 'skill.ashClaw'],
  },
} satisfies Record<string, DragonFormDef>;
