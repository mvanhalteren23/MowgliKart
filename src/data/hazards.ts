import type { HazardDef } from '@/types/contracts';
import { HAZARD_ASSET } from '@/assets/manifests';

/** Canonical hazard ids. */
export const HAZARD = {
  waterPuddle: 'hazard.waterPuddle',
  steamVent: 'hazard.steamVent',
  electrifiedWater: 'hazard.electrifiedWater',
  frozenLake: 'hazard.frozenLake',
  smokeCloud: 'hazard.smokeCloud',
  emberField: 'hazard.emberField',
} as const;

/**
 * Battlefield terrain hazards (one side of the field each). Tuning notes:
 *  - DoT fractions are of max HP per victim turn; 3–6 % keeps a 3–6 round fight readable
 *    without hazards out-damaging skills (and hazard damage never KOs).
 *  - Amplifiers sit at ×1.25–1.5 so a set-up chain pays off on the next hit, not the whole fight.
 *  - Obscure 0.25–0.45: steam hides a little, smoke hides a lot (single-target hits only).
 *
 * | Hazard            | Rounds | DoT (elem, %HP) | Inflicts             | Amplifies               | Obscures |
 * |-------------------|--------|-----------------|----------------------|-------------------------|----------|
 * | Water Puddle      | 2      | —               | —                    | lightning ×1.5, ice ×1.25 | —      |
 * | Steam Vent        | 2      | water 4 %       | —                    | —                       | 0.25     |
 * | Electrified Water | 2      | lightning 6 %   | stun 25 % (1 turn)   | —                       | —        |
 * | Frozen Lake       | 3      | ice 3 %         | soak 50 % (2 turns)  | physical ×1.3           | —        |
 * | Smoke Cloud       | 2      | physical 2 %    | —                    | —                       | 0.45     |
 * | Ember Field       | 2      | fire 4 %        | burn 30 % (2 turns)  | —                       | —        |
 */
export const hazards = {
  [HAZARD.waterPuddle]: {
    id: HAZARD.waterPuddle, name: 'Water Puddle',
    description: 'Standing water from a hard splash. Lightning runs through it; frost grips it.',
    durationRounds: 2,
    amplifies: { lightning: 1.5, ice: 1.25 },
    iconAssetId: HAZARD_ASSET.waterPuddle.icon, fxAssetId: HAZARD_ASSET.waterPuddle.fx,
  },
  [HAZARD.steamVent]: {
    id: HAZARD.steamVent, name: 'Steam Vent',
    description: 'Water thrown on fire, hissing up through the ground. Scalds, and blurs every silhouette.',
    durationRounds: 2,
    dot: { element: 'water', fraction: 0.04 },
    obscures: 0.25,
    iconAssetId: HAZARD_ASSET.steamVent.icon, fxAssetId: HAZARD_ASSET.steamVent.fx,
  },
  [HAZARD.electrifiedWater]: {
    id: HAZARD.electrifiedWater, name: 'Electrified Water',
    description: 'A puddle with a storm in it. Anyone standing in it jolts, and may lock up.',
    durationRounds: 2,
    dot: { element: 'lightning', fraction: 0.06 },
    inflicts: { status: 'stun', chance: 0.25, turns: 1, potency: 1 },
    iconAssetId: HAZARD_ASSET.electrifiedWater.icon, fxAssetId: HAZARD_ASSET.electrifiedWater.fx,
  },
  [HAZARD.frozenLake]: {
    id: HAZARD.frozenLake, name: 'Frozen Lake',
    description: 'The puddle is now a sheet of ice. Cold soaks into the bones; brittle guards crack under a blade.',
    durationRounds: 3,
    dot: { element: 'ice', fraction: 0.03 },
    inflicts: { status: 'soak', chance: 0.5, turns: 2, potency: 0.2 },
    amplifies: { physical: 1.3 },
    iconAssetId: HAZARD_ASSET.frozenLake.icon, fxAssetId: HAZARD_ASSET.frozenLake.fx,
  },
  [HAZARD.smokeCloud]: {
    id: HAZARD.smokeCloud, name: 'Smoke Cloud',
    description: 'Thick choking smoke. Aimed blows go wide; a stiff wind will clear it.',
    durationRounds: 2,
    dot: { element: 'physical', fraction: 0.02 },
    obscures: 0.45,
    iconAssetId: HAZARD_ASSET.smokeCloud.icon, fxAssetId: HAZARD_ASSET.smokeCloud.fx,
  },
  [HAZARD.emberField]: {
    id: HAZARD.emberField, name: 'Ember Field',
    description: 'Fire on something already burning scatters live coals underfoot.',
    durationRounds: 2,
    dot: { element: 'fire', fraction: 0.04 },
    inflicts: { status: 'burn', chance: 0.3, turns: 2, potency: 5 },
    iconAssetId: HAZARD_ASSET.emberField.icon, fxAssetId: HAZARD_ASSET.emberField.fx,
  },
} satisfies Record<string, HazardDef>;
