import type { FishDef, SpeciesDef } from '@/types/contracts';
import { SPECIES } from './ids';

/**
 * Distinct profiles:
 *  - Ashdeer: wary eyes, keen nose, fast — stalk from downwind.
 *  - Bristleboar: short sight, very keen nose, slow — perfect for Vesna's dash if downwind.
 *  - Thistlehare: jumpy at close range, poor nose, quick.
 *  - Reedgrouse: sharp eyes, almost no nose — wind barely matters, stealth does.
 */
export const species = {
  [SPECIES.deer]: {
    id: SPECIES.deer, name: 'Ashdeer', sprite: 'animal.deer.ash',
    speed: 9, wanderSpeed: 1.1, alertRadius: 16, scentSensitivity: 3.2,
    drops: [{ itemId: 'item.softHide', chance: 0.9 }, { itemId: 'item.smokedVenison', chance: 0.6 }, { itemId: 'item.antlerVelvet', chance: 0.2 }],
    herd: { min: 3, max: 5 },
    habitat: [{ center: { x: 42, z: 150 }, radius: 22 }],
  },
  [SPECIES.boar]: {
    id: SPECIES.boar, name: 'Bristleboar', sprite: 'animal.boar.bristle',
    speed: 6.5, wanderSpeed: 0.8, alertRadius: 9, scentSensitivity: 4.5,
    drops: [{ itemId: 'item.boarTusk', chance: 0.8 }, { itemId: 'item.boarHide', chance: 0.7 }, { itemId: 'item.softHide', chance: 0.4 }],
    herd: { min: 2, max: 3 },
    habitat: [{ center: { x: 62, z: 190 }, radius: 16 }],
  },
  [SPECIES.hare]: {
    id: SPECIES.hare, name: 'Thistlehare', sprite: 'animal.hare.thistle',
    speed: 10, wanderSpeed: 1.4, alertRadius: 7, scentSensitivity: 1.2,
    drops: [{ itemId: 'item.hareFoot', chance: 0.8 }, { itemId: 'item.smokedVenison', chance: 0.2 }],
    herd: { min: 2, max: 4 },
    habitat: [{ center: { x: 78, z: 152 }, radius: 14 }, { center: { x: 135, z: 228 }, radius: 10 }],
  },
  [SPECIES.grouse]: {
    id: SPECIES.grouse, name: 'Reedgrouse', sprite: 'animal.bird.reedgrouse',
    speed: 11, wanderSpeed: 0.9, alertRadius: 13, scentSensitivity: 0.4,
    drops: [{ itemId: 'item.grouseFeather', chance: 0.95 }],
    herd: { min: 3, max: 6 },
    habitat: [{ center: { x: 128, z: 82 }, radius: 10 }],
  },
} satisfies Record<string, SpeciesDef>;

export const fish = {
  'fish.tarnPerch': { id: 'fish.tarnPerch', name: 'Tarn Perch', itemId: 'item.fish.tarnPerch', rarity: 'common', fight: 0.25, weight: 40, preferredLure: 'item.lure.cricket' },
  'fish.reedPike': { id: 'fish.reedPike', name: 'Reed Pike', itemId: 'item.fish.reedPike', rarity: 'uncommon', fight: 0.45, weight: 18, preferredLure: 'item.lure.silverSpoon' },
  'fish.ashfinKoi': { id: 'fish.ashfinKoi', name: 'Ashfin Koi', itemId: 'item.fish.ashfinKoi', rarity: 'rare', fight: 0.62, weight: 8, preferredLure: 'item.lure.emberFly' },
  'fish.silverHerring': { id: 'fish.silverHerring', name: 'Silver Herring', itemId: 'item.fish.silverHerring', rarity: 'common', fight: 0.2, weight: 45 },
  'fish.brineSnapper': { id: 'fish.brineSnapper', name: 'Brine Snapper', itemId: 'item.fish.brineSnapper', rarity: 'uncommon', fight: 0.48, weight: 18, preferredLure: 'item.lure.silverSpoon' },
  'fish.lanternEel': { id: 'fish.lanternEel', name: 'Lantern Eel', itemId: 'item.fish.lanternEel', rarity: 'rare', fight: 0.6, weight: 7, preferredLure: 'item.lure.emberFly' },
  'fish.cinderwyrmGar': { id: 'fish.cinderwyrmGar', name: 'Cinderwyrm Gar', itemId: 'item.fish.cinderwyrmGar', rarity: 'legend', fight: 0.9, weight: 2, preferredLure: 'item.lure.emberFly' },
} satisfies Record<string, FishDef>;
