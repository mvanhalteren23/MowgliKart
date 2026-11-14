import type { ElementalReactionDef } from '@/types/contracts';
import { HAZARD } from './hazards';

/**
 * Elemental interaction matrix. A hit of `element` checks reactions in ascending `priority`
 * and fires the first whose `when` matches (at most one per hit and target), so terrain
 * transformations (side hazards) beat status reactions, and the unconditional water splash
 * comes last.
 *
 * | Pri | Reaction          | Hit       | When (target status / side hazard) | Spawns            | Consumes          | Bonus | Inflicts      |
 * |-----|-------------------|-----------|------------------------------------|-------------------|-------------------|-------|---------------|
 * |  10 | Thaw              | fire      | hazard Frozen Lake                 | Steam Vent        | Frozen Lake       | +25 % | —             |
 * |  11 | Smother           | fire      | hazard Steam Vent                  | Smoke Cloud       | Steam Vent        | +10 % | —             |
 * |  12 | Boil Off          | fire      | hazard Water Puddle                | Steam Vent        | Water Puddle      | +10 % | —             |
 * |  13 | Scald             | fire      | status soak                        | Steam Vent        | soak              | +20 % | —             |
 * |  14 | Kindle            | fire      | status burn                        | Ember Field       | —                 | +15 % | —             |
 * |  20 | Quench            | water     | status burn                        | Steam Vent        | burn              | +20 % | —             |
 * |  21 | Douse             | water     | hazard Ember Field                 | Steam Vent        | Ember Field       | —     | —             |
 * |  29 | Splash            | water     | (any)                              | Water Puddle      | —                 | —     | —             |
 * |  30 | Live Current      | lightning | hazard Water Puddle                | Electrified Water | Water Puddle      | +25 % | —             |
 * |  31 | Conduction        | lightning | status soak                        | —                 | —                 | +30 % | stun 30 %     |
 * |  32 | Charged Mist      | lightning | hazard Steam Vent                  | —                 | —                 | +20 % | stun 20 %     |
 * |  40 | Flash Freeze      | ice       | hazard Water Puddle                | Frozen Lake       | Water Puddle      | +20 % | —             |
 * |  41 | Ground Out        | ice       | hazard Electrified Water           | Frozen Lake       | Electrified Water | —     | —             |
 * |  42 | Rime Lock         | ice       | status soak                        | Frozen Lake       | soak              | +30 % | —             |
 * |  43 | Condense          | ice       | hazard Steam Vent                  | Water Puddle      | Steam Vent        | —     | —             |
 * |  44 | Temper            | ice       | status burn                        | —                 | burn              | +20 % | —             |
 * |  50 | Fan the Embers    | wind      | hazard Ember Field                 | Smoke Cloud       | Ember Field       | —     | —             |
 * |  51 | Clear the Air     | wind      | hazard Smoke Cloud                 | —                 | Smoke Cloud       | —     | —             |
 * |  52 | Disperse          | wind      | hazard Steam Vent                  | —                 | Steam Vent        | —     | —             |
 * |  60 | Smoulder          | earth     | hazard Ember Field                 | Smoke Cloud       | Ember Field       | —     | —             |
 * |  61 | Earthing          | earth     | hazard Electrified Water           | —                 | Electrified Water | +10 % | —             |
 *
 * Canonical chains: water→burning ⇒ Steam Vent; lightning→puddle ⇒ Electrified Water;
 * ice→puddle ⇒ Frozen Lake; fire→steam (or wind/earth on embers) ⇒ Smoke Cloud;
 * fire on a Frozen Lake melts it back into steam, closing the loop.
 */
export const reactions = [
  /* fire */
  { id: 'reaction.thaw', name: 'Thaw', element: 'fire', when: { sideHazard: HAZARD.frozenLake }, spawns: HAZARD.steamVent, consumes: { hazard: HAZARD.frozenLake }, bonusDamage: 0.25, priority: 10 },
  { id: 'reaction.smother', name: 'Smother', element: 'fire', when: { sideHazard: HAZARD.steamVent }, spawns: HAZARD.smokeCloud, consumes: { hazard: HAZARD.steamVent }, bonusDamage: 0.1, priority: 11 },
  { id: 'reaction.boilOff', name: 'Boil Off', element: 'fire', when: { sideHazard: HAZARD.waterPuddle }, spawns: HAZARD.steamVent, consumes: { hazard: HAZARD.waterPuddle }, bonusDamage: 0.1, priority: 12 },
  { id: 'reaction.scald', name: 'Scald', element: 'fire', when: { targetStatus: 'soak' }, spawns: HAZARD.steamVent, consumes: { status: 'soak' }, bonusDamage: 0.2, priority: 13 },
  { id: 'reaction.kindle', name: 'Kindle', element: 'fire', when: { targetStatus: 'burn' }, spawns: HAZARD.emberField, bonusDamage: 0.15, priority: 14 },
  /* water */
  { id: 'reaction.quench', name: 'Quench', element: 'water', when: { targetStatus: 'burn' }, spawns: HAZARD.steamVent, consumes: { status: 'burn' }, bonusDamage: 0.2, priority: 20 },
  { id: 'reaction.douse', name: 'Douse', element: 'water', when: { sideHazard: HAZARD.emberField }, spawns: HAZARD.steamVent, consumes: { hazard: HAZARD.emberField }, priority: 21 },
  { id: 'reaction.splash', name: 'Splash', element: 'water', when: {}, spawns: HAZARD.waterPuddle, priority: 29 },
  /* lightning */
  { id: 'reaction.liveCurrent', name: 'Live Current', element: 'lightning', when: { sideHazard: HAZARD.waterPuddle }, spawns: HAZARD.electrifiedWater, consumes: { hazard: HAZARD.waterPuddle }, bonusDamage: 0.25, priority: 30 },
  { id: 'reaction.conduction', name: 'Conduction', element: 'lightning', when: { targetStatus: 'soak' }, bonusDamage: 0.3, inflicts: { status: 'stun', chance: 0.3, turns: 1, potency: 1 }, priority: 31 },
  { id: 'reaction.chargedMist', name: 'Charged Mist', element: 'lightning', when: { sideHazard: HAZARD.steamVent }, bonusDamage: 0.2, inflicts: { status: 'stun', chance: 0.2, turns: 1, potency: 1 }, priority: 32 },
  /* ice */
  { id: 'reaction.flashFreeze', name: 'Flash Freeze', element: 'ice', when: { sideHazard: HAZARD.waterPuddle }, spawns: HAZARD.frozenLake, consumes: { hazard: HAZARD.waterPuddle }, bonusDamage: 0.2, priority: 40 },
  { id: 'reaction.groundOut', name: 'Ground Out', element: 'ice', when: { sideHazard: HAZARD.electrifiedWater }, spawns: HAZARD.frozenLake, consumes: { hazard: HAZARD.electrifiedWater }, priority: 41 },
  { id: 'reaction.rimeLock', name: 'Rime Lock', element: 'ice', when: { targetStatus: 'soak' }, spawns: HAZARD.frozenLake, consumes: { status: 'soak' }, bonusDamage: 0.3, priority: 42 },
  { id: 'reaction.condense', name: 'Condense', element: 'ice', when: { sideHazard: HAZARD.steamVent }, spawns: HAZARD.waterPuddle, consumes: { hazard: HAZARD.steamVent }, priority: 43 },
  { id: 'reaction.temper', name: 'Temper', element: 'ice', when: { targetStatus: 'burn' }, consumes: { status: 'burn' }, bonusDamage: 0.2, priority: 44 },
  /* wind */
  { id: 'reaction.fanEmbers', name: 'Fan the Embers', element: 'wind', when: { sideHazard: HAZARD.emberField }, spawns: HAZARD.smokeCloud, consumes: { hazard: HAZARD.emberField }, priority: 50 },
  { id: 'reaction.clearAir', name: 'Clear the Air', element: 'wind', when: { sideHazard: HAZARD.smokeCloud }, consumes: { hazard: HAZARD.smokeCloud }, priority: 51 },
  { id: 'reaction.disperse', name: 'Disperse', element: 'wind', when: { sideHazard: HAZARD.steamVent }, consumes: { hazard: HAZARD.steamVent }, priority: 52 },
  /* earth */
  { id: 'reaction.smoulder', name: 'Smoulder', element: 'earth', when: { sideHazard: HAZARD.emberField }, spawns: HAZARD.smokeCloud, consumes: { hazard: HAZARD.emberField }, priority: 60 },
  { id: 'reaction.earthing', name: 'Earthing', element: 'earth', when: { sideHazard: HAZARD.electrifiedWater }, consumes: { hazard: HAZARD.electrifiedWater }, bonusDamage: 0.1, priority: 61 },
] as const satisfies readonly ElementalReactionDef[];
