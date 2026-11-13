import { HOOK_COUNTER_ATTACK } from '@/types/contracts';
import type { GearDef } from '@/types/contracts';

export const gear = {
  /* ── Starters ─────────────────────────────────────────────────────── */
  'weapon.ashenBlade': {
    id: 'weapon.ashenBlade', name: 'Ashen Blade', slot: 'weapon', archetype: 'standard', icon: '🗡️',
    description: 'Kael\'s father\'s sword, reforged from what the fire left.', stats: { atk: 5, mag: 1 },
  },
  'weapon.wardenLongbow': {
    id: 'weapon.wardenLongbow', name: 'Warden\'s Longbow', slot: 'weapon', archetype: 'standard', icon: '🏹',
    description: 'Yew, horn and patience.', stats: { atk: 5, spd: 1 },
  },
  'weapon.duelistGlaive': {
    id: 'weapon.duelistGlaive', name: 'Duelist\'s Glaive', slot: 'weapon', archetype: 'standard', icon: '🔱',
    description: 'Arena-balanced, scarred by a hundred bouts.', stats: { atk: 6 },
  },
  'armor.travelLeathers': {
    id: 'armor.travelLeathers', name: 'Travel Leathers', slot: 'armor', archetype: 'standard', icon: '🧥',
    description: 'Road-worn and comfortable.', stats: { def: 3, maxHp: 6 },
  },
  'armor.wardenCloak': {
    id: 'armor.wardenCloak', name: 'Warden\'s Cloak', slot: 'armor', archetype: 'standard', icon: '🧣',
    description: 'Green-grey wool that smells of nothing at all — a hunter\'s best trick.', stats: { def: 2, res: 2, luck: 1 },
  },
  'armor.ringWraps': {
    id: 'armor.ringWraps', name: 'Ring Wraps', slot: 'armor', archetype: 'standard', icon: '🥋',
    description: 'Bound tight for footwork.', stats: { def: 2, spd: 2, maxHp: 4 },
  },

  /* ── Extras for the Synergy Inspector ─────────────────────────────── */
  'weapon.saltIronSaber': {
    id: 'weapon.saltIronSaber', name: 'Salt-Iron Saber', slot: 'weapon', archetype: 'standard', icon: '⚔️',
    description: 'Forged in Saltmarket from melted tithe-iron.', stats: { atk: 8, spd: 1 },
  },
  'armor.tithebreakerMail': {
    id: 'armor.tithebreakerMail', name: 'Tithebreaker Mail', slot: 'armor', archetype: 'standard', icon: '🛡️',
    description: 'Covenant links, re-riveted by Hearthstead\'s smith.', stats: { def: 6, res: 2, maxHp: 10 },
  },
  'relic.tarnCharm': {
    id: 'relic.tarnCharm', name: 'Tarn-Glass Charm', slot: 'relic', archetype: 'standard', icon: '🔮',
    description: 'A drop of Mirror Tarn sealed in glass.', stats: { res: 3, mag: 2 },
  },

  /* ── Progression-scaling relic ────────────────────────────────────── */
  'relic.wyrmsLament': {
    id: 'relic.wyrmsLament', name: 'Wyrm\'s Lament', slot: 'relic', archetype: 'relic', icon: '🐲',
    boundHero: 'kael',
    description: 'The Ashen Drake clan\'s mourning-horn. It grows louder with every year Kael survives and every hearth he frees.',
    flavor: '"Sound it when the last of us falls." — It has not been sounded yet.',
    stats: { atk: 2, mag: 2, maxHp: 5 },
    scaling: {
      perLevel: { atk: 2, mag: 2, maxHp: 6 },
      levelCurve: 'sqrt',
      perLiberatedRegion: { atk: 1, mag: 1, maxHp: 4, res: 1 },
      cap: { atk: 14, mag: 14, maxHp: 40, res: 5 },
    },
  },

  /* ── Build-altering signature ─────────────────────────────────────── */
  'sig.cinderRingTalon': {
    id: 'sig.cinderRingTalon', name: 'Cinder Ring Talon', slot: 'signature', archetype: 'signature', icon: '🪝',
    boundHero: 'vesna',
    description: 'A champion\'s hook-blade from the Cinder Ring. Vesna earned it twice.',
    flavor: 'The crowd never cheers the first blow. They cheer the answer.',
    stats: { atk: 2, spd: 1 },
    hookId: HOOK_COUNTER_ATTACK,
    hookParams: { chance: 0.5, power: 1.1 },
    hookText: 'When struck by a single-target physical hit, 50 % chance to counter for 110 % of a basic attack.',
  },
} satisfies Record<string, GearDef>;
