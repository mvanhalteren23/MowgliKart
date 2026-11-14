import type { MountDef, StaminaTuning } from '@/types/contracts';
import { ASSET } from '@/assets/manifests';
import { flagIs, questIs } from './conditions';
import { QUEST } from './ids';

/** Flag set by the Hunting Lodge's level-2 upgrade (Wind-Vane Lodge): Kestrel breaks in a strider. */
export const LODGE_LEVEL2_FLAG = 'township.lodge.2';

export const MOUNT = {
  drakeFlight: 'mount.drakeFlight',
  thornbackStrider: 'mount.thornbackStrider',
} as const;

/**
 * On foot the overworld camera sits at ~34 m / 35°. Flight pulls it back and up so the
 * continent reads as a map; the strider only eases it back a little for speed.
 */
export const mounts = {
  [MOUNT.drakeFlight]: {
    id: MOUNT.drakeFlight,
    name: 'Drake Flight',
    description: 'Kael lets the drake-blood run all the way out and takes wing, the party clinging on. Flies over walls, water and cliffs to any waypoint you have discovered.',
    kind: 'flight',
    hero: 'kael',
    speed: 22,
    boostSpeed: 34,
    staminaDrainPerSec: 2,
    boostDrainPerSec: 14,
    ignoresCollision: true,
    altitude: 14,
    camera: { distance: 48, pitchDeg: 52, lookHeight: 12 },
    // Embers of the Clan: the Wyrm's Lament rises from Mirror Tarn and Ashka remembers the clan's wings.
    unlockWhen: questIs(QUEST.embers, 'COMPLETED'),
    unlockText: 'Kael\'s wings are still banked. Finish "Embers of the Clan" to wake them.',
    assetId: ASSET.drakeFlightRiderKael,
    iconAssetId: ASSET.drakeFlightIcon,
  },
  [MOUNT.thornbackStrider]: {
    id: MOUNT.thornbackStrider,
    name: 'Thornback Strider',
    description: 'A long-legged frontier beast broken to the saddle at Hearthstead\'s hunting lodge. Fast on roads and meadows, but it goes around walls like anyone else.',
    kind: 'beast',
    speed: 11,
    boostSpeed: 16,
    staminaDrainPerSec: 0,
    boostDrainPerSec: 15,
    ignoresCollision: false,
    altitude: 1.6,
    camera: { distance: 38, pitchDeg: 33, lookHeight: 2 },
    unlockWhen: flagIs(LODGE_LEVEL2_FLAG, true),
    unlockText: 'Raise the Hunting Lodge to the Wind-Vane Lodge and Kestrel will break in a strider for you.',
    assetId: ASSET.strider,
    iconAssetId: ASSET.striderIcon,
  },
} satisfies Record<string, MountDef>;

/**
 * Sprint: 100 / 14 per s ≈ 7.1 s from full. Regeneration waits 0.8 s, then refills in ~4.5 s;
 * running dry locks sprint until 35 % is back (~1.6 s after the delay).
 */
export const stamina: StaminaTuning = {
  max: 100,
  regenPerSec: 22,
  regenDelaySec: 0.8,
  sprintDrainPerSec: 14,
  sprintSpeedMultiplier: 1.6,
  recoverFraction: 0.35,
};
