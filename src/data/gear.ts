import { HOOK_COUNTER_ATTACK, HOOK_IDS } from '@/types/contracts';
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
  /* ── Newcomer starters (bound, so nobody else hoards them) ────────── */
  'weapon.sailcloakStaff': {
    id: 'weapon.sailcloakStaff', name: 'Sail-Spar Staff', slot: 'weapon', archetype: 'standard', icon: '🪄', boundHero: 'orla',
    description: 'A spar from a wrecked sky-barge, strung with chime-wire.', stats: { mag: 6, atk: 2 },
  },
  'armor.chanterSilks': {
    id: 'armor.chanterSilks', name: 'Chanter\'s Silks', slot: 'armor', archetype: 'standard', icon: '👘', boundHero: 'orla',
    description: 'Wind-blue, salt-stained.', stats: { res: 4, def: 2, maxAp: 4 },
  },
  'weapon.quarryMaul': {
    id: 'weapon.quarryMaul', name: 'Quarry Maul', slot: 'weapon', archetype: 'standard', icon: '🔨', boundHero: 'hadrik',
    description: 'Stamped with a Covenant tally-mark Hadrik has since chiselled off.', stats: { atk: 7, def: 1 },
  },
  'armor.slabPlate': {
    id: 'armor.slabPlate', name: 'Slab Plate', slot: 'armor', archetype: 'standard', icon: '🧱', boundHero: 'hadrik',
    description: 'More rock than armour.', stats: { def: 6, maxHp: 12 },
  },
  'weapon.springCrossbow': {
    id: 'weapon.springCrossbow', name: 'Spring Crossbow', slot: 'weapon', archetype: 'standard', icon: '🏹', boundHero: 'pim',
    description: 'Mostly springs. Some optimism.', stats: { atk: 6, spd: 2 },
  },
  'armor.tinkerApron': {
    id: 'armor.tinkerApron', name: 'Tinker\'s Apron', slot: 'armor', archetype: 'standard', icon: '🦺', boundHero: 'pim',
    description: 'Forty pockets, thirty-nine full.', stats: { def: 3, luck: 3, spd: 1 },
  },
  'weapon.ledgerBlade': {
    id: 'weapon.ledgerBlade', name: 'Ledger-Knife', slot: 'weapon', archetype: 'standard', icon: '🖋️', boundHero: 'quill',
    description: 'A scraping knife for erasing entries. She erases other things now.', stats: { mag: 7, atk: 1 },
  },
  'armor.archivistRobe': {
    id: 'armor.archivistRobe', name: 'Archivist\'s Robe', slot: 'armor', archetype: 'standard', icon: '🥼', boundHero: 'quill',
    description: 'Ink-dark, with the Covenant badge unpicked.', stats: { res: 5, def: 2 },
  },
  'weapon.thornstaff': {
    id: 'weapon.thornstaff', name: 'Thornstaff', slot: 'weapon', archetype: 'standard', icon: '🌿', boundHero: 'moss',
    description: 'Still growing.', stats: { mag: 6, atk: 2 },
  },
  'armor.barkMantle': {
    id: 'armor.barkMantle', name: 'Bark Mantle', slot: 'armor', archetype: 'standard', icon: '🍂', boundHero: 'moss',
    description: 'Shed by a willing oak.', stats: { def: 4, res: 3, maxHp: 6 },
  },
  'weapon.lanternHook': {
    id: 'weapon.lanternHook', name: 'Lantern-Hook Knives', slot: 'weapon', archetype: 'standard', icon: '🔪', boundHero: 'sable',
    description: 'For cutting reliquary chains, mostly.', stats: { atk: 7, spd: 2 },
  },
  'armor.nightLeathers': {
    id: 'armor.nightLeathers', name: 'Night Leathers', slot: 'armor', archetype: 'standard', icon: '🧥', boundHero: 'sable',
    description: 'They do not creak. Ever.', stats: { def: 3, spd: 3, luck: 2 },
  },

  /* ── Campaign progression (chapter rewards) ───────────────────────── */
  'weapon.galecrestSaber': {
    id: 'weapon.galecrestSaber', name: 'Galecrest Saber', slot: 'weapon', archetype: 'standard', icon: '⚔️',
    description: 'Light as a gull, cut from a spire-guard\'s honour blade.', stats: { atk: 12, spd: 3 },
  },
  'armor.bastionHauberk': {
    id: 'armor.bastionHauberk', name: 'Bastion Hauberk', slot: 'armor', archetype: 'standard', icon: '🛡️',
    description: 'Marrowgate mail, re-riveted for people who are not marching anywhere they don\'t choose.', stats: { def: 11, maxHp: 24 },
  },
  'relic.mirelightCharm': {
    id: 'relic.mirelightCharm', name: 'Mirelight Charm', slot: 'relic', archetype: 'standard', icon: '🕯️',
    description: 'A marsh-light set free and grateful.', stats: { mag: 8, res: 6 },
  },
  'weapon.sunglassGlaive': {
    id: 'weapon.sunglassGlaive', name: 'Sunglass Glaive', slot: 'weapon', archetype: 'standard', icon: '🔱',
    description: 'Fused desert glass on an iron haft.', stats: { atk: 20, luck: 2 },
  },
  'armor.heartwoodMail': {
    id: 'armor.heartwoodMail', name: 'Heartwood Mail', slot: 'armor', archetype: 'standard', icon: '🌳',
    description: 'Scales of resin-hardened heartwood, given, not felled.', stats: { def: 16, res: 8, maxHp: 30 },
  },
  'weapon.rimeforgedBlade': {
    id: 'weapon.rimeforgedBlade', name: 'Rimeforged Blade', slot: 'weapon', archetype: 'standard', icon: '🗡️',
    description: 'Quenched in glacier-melt; never quite warm.', stats: { atk: 28, mag: 8 },
  },
  'armor.kilnwardenPlate': {
    id: 'armor.kilnwardenPlate', name: 'Kilnwarden Plate', slot: 'armor', archetype: 'standard', icon: '🛡️',
    description: 'Plate from the Covenant\'s own furnace-guards. Fireproof, finally on the right side.', stats: { def: 24, res: 14, maxHp: 50 },
  },

  /* ── Personal relics (progression-scaling, bound) ─────────────────── */
  'relic.hearthwoodCompass': {
    id: 'relic.hearthwoodCompass', name: 'Hearthwood Compass', slot: 'relic', archetype: 'relic', icon: '🧭', boundHero: 'tobin',
    description: 'A warden\'s compass whose needle points into the wind. It learns every road he walks.',
    flavor: 'Old Holt\'s, and his mentor\'s before him.',
    stats: { spd: 2, luck: 2 },
    scaling: { perLevel: { spd: 1, luck: 1, atk: 1 }, levelCurve: 'linear', perLiberatedRegion: { spd: 1, luck: 1 }, cap: { spd: 24, luck: 24, atk: 20 } },
  },
  'relic.ashenLaurel': {
    id: 'relic.ashenLaurel', name: 'Ashen Laurel', slot: 'relic', archetype: 'relic', icon: '🏵️', boundHero: 'vesna',
    description: 'The Sunken Ring\'s champion crown, woven of fire-blackened bay. It remembers every crowd that chanted her name.',
    stats: { atk: 3, def: 2 },
    scaling: { perLevel: { atk: 2, def: 1.5, maxHp: 6 }, levelCurve: 'log', perLiberatedRegion: { atk: 1, maxHp: 4 }, cap: { atk: 40, def: 30, maxHp: 120 } },
  },
  'relic.galeHymnal': {
    id: 'relic.galeHymnal', name: 'Hymnal of the High Wind', slot: 'relic', archetype: 'relic', icon: '📖', boundHero: 'orla',
    description: 'Every verse the Covenant tried to silence, written down at last. Each freed region adds a stanza.',
    stats: { mag: 3, maxAp: 3 },
    scaling: { perLevel: { mag: 1.5, res: 1, maxAp: 1.5 }, levelCurve: 'sqrt', perLiberatedRegion: { mag: 1, maxAp: 1 }, cap: { mag: 40, res: 30, maxAp: 40 } },
  },
  'relic.quarryHeart': {
    id: 'relic.quarryHeart', name: 'Quarry-Heart Stone', slot: 'relic', archetype: 'relic', icon: '🪨', boundHero: 'hadrik',
    description: 'The first stone Hadrik ever cut, warm as a hand. It gets heavier — and he gets steadier.',
    stats: { def: 3, maxHp: 10 },
    scaling: { perLevel: { def: 1, maxHp: 5 }, levelCurve: 'linear', perLiberatedRegion: { def: 1, maxHp: 5 }, cap: { def: 30, maxHp: 160 } },
  },
  'relic.everwoundMainspring': {
    id: 'relic.everwoundMainspring', name: 'Everwound Mainspring', slot: 'relic', archetype: 'relic', icon: '⚙️', boundHero: 'pim',
    description: 'A spring that winds itself on every step. Pim swears it has opinions.',
    stats: { spd: 2, atk: 2 },
    scaling: { perLevel: { spd: 1, luck: 1.5, atk: 1.5 }, levelCurve: 'log', perLiberatedRegion: { luck: 1, spd: 1 }, cap: { spd: 30, luck: 36, atk: 30 } },
  },
  'relic.unburnedLedger': {
    id: 'relic.unburnedLedger', name: 'The Unburned Ledger', slot: 'relic', archetype: 'relic', icon: '📕', boundHero: 'quill',
    description: 'The one true copy of the Covenant\'s accounts. Every freed region balances another page.',
    stats: { mag: 4, res: 2 },
    scaling: { perLevel: { mag: 4, maxAp: 2 }, levelCurve: 'sqrt', perLiberatedRegion: { mag: 1, res: 1 }, cap: { mag: 30, maxAp: 18, res: 12 } },
  },
  'relic.seedOfFirstGrove': {
    id: 'relic.seedOfFirstGrove', name: 'Seed of the First Grove', slot: 'relic', archetype: 'relic', icon: '🌰', boundHero: 'moss',
    description: 'It has been about to sprout for nine hundred years. Moss is patient.',
    stats: { res: 2, maxHp: 6 },
    scaling: { perLevel: { res: 1, mag: 1, maxHp: 3 }, levelCurve: 'linear', perLiberatedRegion: { res: 1, maxHp: 3 }, cap: { res: 26, mag: 22, maxHp: 110 } },
  },
  'relic.moonlessLantern': {
    id: 'relic.moonlessLantern', name: 'Moonless Lantern', slot: 'relic', archetype: 'relic', icon: '🏮', boundHero: 'sable',
    description: 'An empty reliquary — the first she ever emptied. It shines darker every time she frees another.',
    stats: { atk: 2, luck: 3 },
    scaling: { perLevel: { atk: 1.5, luck: 1.5, res: 1 }, levelCurve: 'log', perLiberatedRegion: { luck: 1, atk: 1 }, cap: { atk: 36, luck: 40, res: 24 } },
  },

  /* ── Personal signatures (build-altering hooks, bound) ────────────── */
  'sig.drakeheartSigil': {
    id: 'sig.drakeheartSigil', name: 'Drakeheart Sigil', slot: 'signature', archetype: 'signature', icon: '🔥', boundHero: 'kael',
    description: 'The clan-elder\'s ember, set in iron. It beats when Kael takes wing.',
    stats: { mag: 3, maxAp: 4 },
    hookId: HOOK_IDS.dragonSurge, hookParams: { sync: 15, ap: 4 },
    hookText: 'While transformed: +15 Sync and 4 AP refunded at the start of each of Kael\'s turns.',
  },
  'sig.quarryMarkFletch': {
    id: 'sig.quarryMarkFletch', name: 'Quarry-Mark Fletching', slot: 'signature', archetype: 'signature', icon: '🪶', boundHero: 'tobin',
    description: 'White-stag feathers. Whatever they strike stays marked.',
    stats: { atk: 3, luck: 2 },
    hookId: HOOK_IDS.markedQuarry, hookParams: { chance: 0.4, turns: 3, potency: 0.25 },
    hookText: 'Hits have a 40 % chance to mark the target: defence −25 % for 3 turns.',
  },
  'sig.echoingConch': {
    id: 'sig.echoingConch', name: 'Echoing Conch', slot: 'signature', archetype: 'signature', icon: '🐚', boundHero: 'orla',
    description: 'A Brinefolk conch that keeps singing whatever Orla last sang.',
    stats: { res: 3, maxAp: 3 },
    hookId: HOOK_IDS.mendingEcho, hookParams: { fraction: 0.08 },
    hookText: 'At the start of Orla\'s turn, heal the most wounded ally for 8 % of her max HP.',
  },
  'sig.bastionPauldron': {
    id: 'sig.bastionPauldron', name: 'Bastion Pauldron', slot: 'signature', archetype: 'signature', icon: '🛡️', boundHero: 'hadrik',
    description: 'The Marrowgate gate-ward\'s shoulder plate. When Hadrik plants his feet, everyone feels it.',
    stats: { def: 4, maxHp: 10 },
    hookId: HOOK_IDS.bulwark, hookParams: { armor: 10, turns: 2, potency: 0.3 },
    hookText: 'Guarding grants Guard Up (30 %) to the whole party for 2 turns.',
  },
  'sig.pocketfulOfCogs': {
    id: 'sig.pocketfulOfCogs', name: 'Pocketful of Cogs', slot: 'signature', archetype: 'signature', icon: '🪙', boundHero: 'pim',
    description: 'Little brass hands that find their way into other people\'s purses.',
    stats: { luck: 4, spd: 1 },
    hookId: HOOK_IDS.pilfer, hookParams: { chance: 0.35, coin: 12 },
    hookText: 'Hits have a 35 % chance to pilfer 12 coin (once per enemy).',
  },
  'sig.marginaliaQuill': {
    id: 'sig.marginaliaQuill', name: 'Marginalia Quill', slot: 'signature', archetype: 'signature', icon: '🪶', boundHero: 'quill',
    description: 'It writes a second copy of every spell in the margin.',
    stats: { mag: 4 },
    hookId: HOOK_IDS.spellEcho, hookParams: { chance: 0.3, power: 0.5 },
    hookText: 'Magical skills have a 30 % chance to echo once at 50 % power.',
  },
  'sig.thornheartTorc': {
    id: 'sig.thornheartTorc', name: 'Thornheart Torc', slot: 'signature', archetype: 'signature', icon: '🌹', boundHero: 'moss',
    description: 'A torc of living briar. Strike its wearer and it strikes back — slowly, and holding on.',
    stats: { def: 2, res: 2 },
    hookId: HOOK_IDS.rootbind, hookParams: { chance: 0.3, turns: 1 },
    hookText: 'When struck, 30 % chance to root the attacker (stun, 1 turn).',
  },
  'sig.reapersHook': {
    id: 'sig.reapersHook', name: 'Reaper\'s Hook', slot: 'signature', archetype: 'signature', icon: '🌙', boundHero: 'sable',
    description: 'The Reliquarian\'s own hook, now cutting chains instead of tying them.',
    stats: { atk: 4, spd: 1 },
    hookId: HOOK_IDS.reap, hookParams: { ap: 6, potency: 0.2, turns: 2 },
    hookText: 'On a kill: restore 6 AP and gain Attack Up (20 %) for 2 turns.',
  },
} satisfies Record<string, GearDef>;
