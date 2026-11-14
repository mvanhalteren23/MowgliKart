import type { DragonFormDef } from '@/types/contracts';
import { FLAG } from './ids';

/**
 * Sustained transformations (see `DragonFormDef`). Sync builds ~20 per round, so:
 *   Ember Whelp (hatchling, L1)   40 Sync · 8 AP + 4/turn  — turn 2–3 at the slice start.
 *   Ashen Cinderdrake (fire, L6)  70 Sync · 14 + 6/turn    — the late-fight payoff of Act I.
 *   Rimehorn Wyrm (ice, L11)      65 Sync · 16 + 7/turn    — sustain/defence, Act II opener.
 *   Thunderhide Drake (L16)       75 Sync · 18 + 8/turn    — burst, mid Act II.
 *   Sovereign Wyrm (apex, L24)    90 Sync · 26 + 10/turn   — story-gated by the Act III caldera.
 * Kael's AP pool (20 + 3/level) always covers entry + 2–3 drains, never the full max turns
 * without Ember Draughts or the Drakeheart Sigil — forms are sustained, not free.
 */
export const dragonForms = {
  'form.emberWhelp': {
    id: 'form.emberWhelp', name: 'Ember Whelp', element: 'fire', sprite: 'dragon.emberwhelp',
    syncRequired: 40, apCostToEnter: 8, apDrainPerTurn: 4, maxTurns: 3,
    statMultipliers: { atk: 1.3, mag: 1.3, def: 1.15, spd: 1.1 },
    affinities: { fire: 0.5, water: 1.25 },
    skills: ['skill.whelpFlame', 'skill.ashClaw'],
  },
  'form.ashenDrake': {
    id: 'form.ashenDrake', name: 'Ashen Cinderdrake', element: 'fire', sprite: 'dragon.cinderDrake',
    syncRequired: 70, apCostToEnter: 14, apDrainPerTurn: 6, maxTurns: 4,
    statMultipliers: { maxHp: 1.2, atk: 1.6, mag: 1.6, def: 1.35, res: 1.2, spd: 1.15 },
    affinities: { fire: 0, water: 1.2, shadow: 0.75 },
    skills: ['skill.drakeInferno', 'skill.wyrmRend', 'skill.ashClaw'],
  },
  'form.rimeWyrm': {
    id: 'form.rimeWyrm', name: 'Rimehorn Wyrm', element: 'water', sprite: 'dragon.rimeWyrm',
    syncRequired: 65, apCostToEnter: 16, apDrainPerTurn: 7, maxTurns: 4,
    statMultipliers: { maxHp: 1.3, def: 1.6, res: 1.5, mag: 1.35, atk: 1.2 },
    affinities: { water: 0, fire: 1.2, wind: 0.8 },
    skills: ['skill.rimeBreath', 'skill.glacierFang'],
  },
  'form.thunderDrake': {
    id: 'form.thunderDrake', name: 'Thunderhide Drake', element: 'wind', sprite: 'dragon.thunderDrake',
    syncRequired: 75, apCostToEnter: 18, apDrainPerTurn: 8, maxTurns: 4,
    statMultipliers: { atk: 1.75, mag: 1.5, spd: 1.5, def: 1.2 },
    affinities: { wind: 0, earth: 1.25 },
    skills: ['skill.thunderclap', 'skill.stormTalon'],
  },
  'form.sovereignWyrm': {
    id: 'form.sovereignWyrm', name: 'Sovereign of the Banked Flame', element: 'fire', sprite: 'dragon.sovereignWyrm',
    syncRequired: 90, apCostToEnter: 26, apDrainPerTurn: 10, maxTurns: 5,
    requiresFlag: FLAG.sovereign, apex: true,
    statMultipliers: { maxHp: 1.5, atk: 2, mag: 2, def: 1.6, res: 1.6, spd: 1.3 },
    affinities: { fire: 0, water: 0.9, holy: 0.75, shadow: 0.75 },
    skills: ['skill.sovereignFlame', 'skill.crownOfEmbers', 'skill.wyrmRend'],
  },
} satisfies Record<string, DragonFormDef>;
