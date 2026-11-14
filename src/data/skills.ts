import type { SkillDef } from '@/types/contracts';

/**
 * Balance reference (combat lives in core):
 *   physical ≈ atk × power × 100/(100+def); magical ≈ mag × power × 100/(100+res).
 * Slice heroes sit at atk/mag ~16–23, enemies at def/res ~6–16, so a 1.0 hit lands ~15–20.
 */
export const skills = {
  /* ── Kael (Ashen Drake) ───────────────────────────────────────────── */
  'skill.cinderSlash': {
    id: 'skill.cinderSlash', name: 'Cinder Slash', description: 'A blade drawn through banked coals. Builds Sync.',
    apCost: 4, target: 'enemy', element: 'fire', kind: 'physical', power: 1.35, syncGain: 10,
  },
  'skill.drakeRoar': {
    id: 'skill.drakeRoar', name: 'Drake Roar', description: 'The clan-cry. Raises attack for 3 turns and stokes Sync.',
    apCost: 5, target: 'self', element: 'physical', kind: 'support', power: 0,
    inflicts: { status: 'atkUp', chance: 1, turns: 3, potency: 0.25 }, syncGain: 18,
  },
  'skill.emberBrand': {
    id: 'skill.emberBrand', name: 'Ember Brand', description: 'Sears a drake-sigil into the foe. May burn.',
    apCost: 7, target: 'enemy', element: 'fire', kind: 'magical', power: 1.6,
    inflicts: { status: 'burn', chance: 0.6, turns: 3, potency: 5 }, syncGain: 8,
  },

  /* ── Tobin Marsh ──────────────────────────────────────────────────── */
  'skill.pinningShot': {
    id: 'skill.pinningShot', name: 'Pinning Shot', description: 'An arrow through the joint. Lowers defence.',
    apCost: 4, target: 'enemy', element: 'physical', kind: 'physical', power: 1.25,
    inflicts: { status: 'defDown', chance: 0.7, turns: 3, potency: 0.25 },
  },
  'skill.windVolley': {
    id: 'skill.windVolley', name: 'Wind Volley', description: 'Loose five shafts on the breeze. Hits all foes.',
    apCost: 7, target: 'allEnemies', element: 'wind', kind: 'physical', power: 0.8,
  },
  'skill.fieldDressing': {
    id: 'skill.fieldDressing', name: 'Field Dressing', description: 'Warden\'s poultice and a tight wrap. Heals one ally.',
    apCost: 5, target: 'ally', element: 'physical', kind: 'heal', power: 2.4,
  },

  /* ── Vesna ────────────────────────────────────────────────────────── */
  'skill.glaiveArc': {
    id: 'skill.glaiveArc', name: 'Glaive Arc', description: 'A wide Cinder Ring sweep across every foe.',
    apCost: 5, target: 'allEnemies', element: 'physical', kind: 'physical', power: 0.85,
  },
  'skill.riposteStance': {
    id: 'skill.riposteStance', name: 'Riposte Stance', description: 'Plant the glaive and dare them. Guard up for 2 turns.',
    apCost: 3, target: 'self', element: 'physical', kind: 'support', power: 0,
    inflicts: { status: 'guardUp', chance: 1, turns: 2, potency: 0.35 },
  },
  'skill.cinderLunge': {
    id: 'skill.cinderLunge', name: 'Cinder Lunge', description: 'A crowd-roaring thrust wreathed in arena-fire.',
    apCost: 7, target: 'enemy', element: 'fire', kind: 'physical', power: 1.7,
  },

  /* ── Locked roster ────────────────────────────────────────────────── */
  'skill.tideMend': {
    id: 'skill.tideMend', name: 'Tide Mend', description: 'Orla\'s hymn of the turning tide. Heals all allies.',
    apCost: 8, target: 'allAllies', element: 'water', kind: 'heal', power: 1.2,
  },
  'skill.undertow': {
    id: 'skill.undertow', name: 'Undertow', description: 'Drag a foe under. May soak.',
    apCost: 5, target: 'enemy', element: 'water', kind: 'magical', power: 1.3,
    inflicts: { status: 'soak', chance: 0.6, turns: 2, potency: 0.2 },
  },
  'skill.stoneWard': {
    id: 'skill.stoneWard', name: 'Stone Ward', description: 'Hadrik roots himself like a menhir.',
    apCost: 4, target: 'self', element: 'earth', kind: 'support', power: 0,
    inflicts: { status: 'guardUp', chance: 1, turns: 3, potency: 0.5 },
  },
  'skill.quakeHammer': {
    id: 'skill.quakeHammer', name: 'Quake Hammer', description: 'The ground answers the maul. Hits all foes.',
    apCost: 8, target: 'allEnemies', element: 'earth', kind: 'physical', power: 1.0,
  },
  'skill.galeBolt': {
    id: 'skill.galeBolt', name: 'Gale Bolt', description: 'Pim\'s spring-wound crossbow, overwound.',
    apCost: 4, target: 'enemy', element: 'wind', kind: 'physical', power: 1.3,
  },
  'skill.cogSnare': {
    id: 'skill.cogSnare', name: 'Cog Snare', description: 'A clockwork trap. May stun.',
    apCost: 6, target: 'enemy', element: 'physical', kind: 'physical', power: 0.7,
    inflicts: { status: 'stun', chance: 0.45, turns: 1, potency: 1 },
  },
  'skill.lumenLance': {
    id: 'skill.lumenLance', name: 'Lumen Lance', description: 'Quill reads a burning verse aloud.',
    apCost: 6, target: 'enemy', element: 'holy', kind: 'magical', power: 1.5,
  },
  'skill.vowOfLight': {
    id: 'skill.vowOfLight', name: 'Vow of Light', description: 'A scholar\'s oath that steadies the party.',
    apCost: 7, target: 'allAllies', element: 'holy', kind: 'support', power: 0,
    inflicts: { status: 'regen', chance: 1, turns: 3, potency: 6 },
  },
  'skill.mossBloom': {
    id: 'skill.mossBloom', name: 'Moss Bloom', description: 'Soft green over every wound.',
    apCost: 6, target: 'ally', element: 'earth', kind: 'heal', power: 1.8,
  },
  'skill.thornLash': {
    id: 'skill.thornLash', name: 'Thorn Lash', description: 'Briar whips from the soil.',
    apCost: 4, target: 'enemy', element: 'earth', kind: 'magical', power: 1.2,
  },
  'skill.nightCut': {
    id: 'skill.nightCut', name: 'Night Cut', description: 'Sable strikes from the blind side.',
    apCost: 4, target: 'enemy', element: 'shadow', kind: 'physical', power: 1.45,
  },
  'skill.veilStep': {
    id: 'skill.veilStep', name: 'Veil Step', description: 'Fade a step sideways from the world.',
    apCost: 3, target: 'self', element: 'shadow', kind: 'support', power: 0,
    inflicts: { status: 'guardUp', chance: 1, turns: 2, potency: 0.3 },
  },

  /* ── Dragon-form skills ───────────────────────────────────────────── */
  'skill.whelpFlame': {
    id: 'skill.whelpFlame', name: 'Whelp Flame', description: 'A young drake\'s gout of fire over every foe.',
    apCost: 4, target: 'allEnemies', element: 'fire', kind: 'magical', power: 1.0,
    inflicts: { status: 'burn', chance: 0.3, turns: 2, potency: 4 },
  },
  'skill.ashClaw': {
    id: 'skill.ashClaw', name: 'Ash Claw', description: 'Talons black with old soot.',
    apCost: 3, target: 'enemy', element: 'fire', kind: 'physical', power: 1.6,
  },
  'skill.drakeInferno': {
    id: 'skill.drakeInferno', name: 'Drake Inferno', description: 'The Ashen Drake remembers how a sky burns.',
    apCost: 8, target: 'allEnemies', element: 'fire', kind: 'magical', power: 1.7,
    inflicts: { status: 'burn', chance: 0.5, turns: 3, potency: 6 },
  },
  'skill.wyrmRend': {
    id: 'skill.wyrmRend', name: 'Wyrm Rend', description: 'Jaw and claw together. Ignores guard.',
    apCost: 6, target: 'enemy', element: 'fire', kind: 'physical', power: 2.2,
  },

  /* ── Warden-granted skills ────────────────────────────────────────── */
  'skill.ashkaFlare': {
    id: 'skill.ashkaFlare', name: 'Ashka\'s Flare', description: 'The Warden of the Banked Hearth breathes through you. Burns.',
    apCost: 6, target: 'enemy', element: 'fire', kind: 'magical', power: 1.55,
    inflicts: { status: 'burn', chance: 0.75, turns: 3, potency: 6 }, syncGain: 6,
  },
  'skill.mirelleSpring': {
    id: 'skill.mirelleSpring', name: 'Mirelle\'s Spring', description: 'Cold spring water rises under the party. Heals all and grants regen.',
    apCost: 8, target: 'allAllies', element: 'water', kind: 'heal', power: 1.1,
    inflicts: { status: 'regen', chance: 1, turns: 2, potency: 5 },
  },
  'skill.zephraGust': {
    id: 'skill.zephraGust', name: 'Zephra\'s Gust', description: 'A sealed Warden\'s breath (locked in the slice).',
    apCost: 5, target: 'allEnemies', element: 'wind', kind: 'magical', power: 0.9,
  },
  'skill.torBulwark': {
    id: 'skill.torBulwark', name: 'Tor\'s Bulwark', description: 'Granite skin for the whole party (locked in the slice).',
    apCost: 7, target: 'allAllies', element: 'earth', kind: 'support', power: 0,
    inflicts: { status: 'guardUp', chance: 1, turns: 2, potency: 0.3 },
  },
  'skill.lumenGrace': {
    id: 'skill.lumenGrace', name: 'Lumen\'s Grace', description: 'Clean dawnlight (locked in the slice).',
    apCost: 7, target: 'ally', element: 'holy', kind: 'heal', power: 2.2,
  },
  'skill.nyxShroud': {
    id: 'skill.nyxShroud', name: 'Nyx\'s Shroud', description: 'A hush of moonless shadow (locked in the slice).',
    apCost: 6, target: 'enemy', element: 'shadow', kind: 'magical', power: 1.5,
  },

  /* ── Campaign hero kits ───────────────────────────────────────────── */
  'skill.wyrmfireArc': {
    id: 'skill.wyrmfireArc', name: 'Wyrmfire Arc', description: 'Kael sweeps a crescent of drake-fire across every foe.',
    apCost: 9, target: 'allEnemies', element: 'fire', kind: 'magical', power: 1.25, syncGain: 12,
    inflicts: { status: 'burn', chance: 0.35, turns: 2, potency: 8 },
  },
  'skill.lamentCall': {
    id: 'skill.lamentCall', name: 'Lament Call', description: 'A breath of the clan horn: the whole party steels itself.',
    apCost: 10, target: 'allAllies', element: 'fire', kind: 'support', power: 0, syncGain: 20,
    inflicts: { status: 'atkUp', chance: 1, turns: 3, potency: 0.2 },
  },
  'skill.huntersMark': {
    id: 'skill.huntersMark', name: 'Hunter\'s Mark', description: 'Tobin reads the herd and names the weak one. Lowers defence.',
    apCost: 6, target: 'enemy', element: 'wind', kind: 'physical', power: 1.4,
    inflicts: { status: 'defDown', chance: 0.9, turns: 3, potency: 0.3 },
  },
  'skill.galeLongshot': {
    id: 'skill.galeLongshot', name: 'Gale Longshot', description: 'One arrow, aimed for an hour, loosed in a heartbeat.',
    apCost: 9, target: 'enemy', element: 'wind', kind: 'physical', power: 2.3,
  },
  'skill.crowdPleaser': {
    id: 'skill.crowdPleaser', name: 'Crowd-Pleaser', description: 'Vesna plays to the stands. Attack up, guard up.',
    apCost: 5, target: 'self', element: 'physical', kind: 'support', power: 0,
    inflicts: { status: 'atkUp', chance: 1, turns: 3, potency: 0.3 },
  },
  'skill.ashenWhirl': {
    id: 'skill.ashenWhirl', name: 'Ashen Whirl', description: 'The glaive spins until the air catches fire.',
    apCost: 9, target: 'allEnemies', element: 'fire', kind: 'physical', power: 1.3,
    inflicts: { status: 'burn', chance: 0.3, turns: 2, potency: 8 },
  },
  'skill.galeHymn': {
    id: 'skill.galeHymn', name: 'Gale Hymn', description: 'Orla sings and the wind answers, cutting every foe.',
    apCost: 5, target: 'allEnemies', element: 'wind', kind: 'magical', power: 0.85,
  },
  'skill.skysongCanticle': {
    id: 'skill.skysongCanticle', name: 'Skysong Canticle', description: 'A spire hymn that lifts every heart. Regen for the party.',
    apCost: 9, target: 'allAllies', element: 'wind', kind: 'support', power: 0,
    inflicts: { status: 'regen', chance: 1, turns: 3, potency: 10 },
  },
  'skill.cycloneAria': {
    id: 'skill.cycloneAria', name: 'Cyclone Aria', description: 'The final verse of the Galecrest chimes, sung free.',
    apCost: 12, target: 'allEnemies', element: 'wind', kind: 'magical', power: 1.6,
  },
  'skill.shieldSlam': {
    id: 'skill.shieldSlam', name: 'Shield Slam', description: 'A quarry-slab of a shield to the face. May stun.',
    apCost: 4, target: 'enemy', element: 'earth', kind: 'physical', power: 1.15,
    inflicts: { status: 'stun', chance: 0.3, turns: 1, potency: 1 },
  },
  'skill.bastionCall': {
    id: 'skill.bastionCall', name: 'Bastion Call', description: '"Behind me." Guard up for the whole party.',
    apCost: 8, target: 'allAllies', element: 'earth', kind: 'support', power: 0,
    inflicts: { status: 'guardUp', chance: 1, turns: 2, potency: 0.35 },
  },
  'skill.landslide': {
    id: 'skill.landslide', name: 'Landslide', description: 'Hadrik brings the hillside down on them.',
    apCost: 11, target: 'allEnemies', element: 'earth', kind: 'physical', power: 1.55,
  },
  'skill.springVolley': {
    id: 'skill.springVolley', name: 'Spring Volley', description: 'Pim overwinds the magazine and lets it all go.',
    apCost: 7, target: 'allEnemies', element: 'wind', kind: 'physical', power: 0.9,
  },
  'skill.overwind': {
    id: 'skill.overwind', name: 'Overwind', description: 'Crank everything to eleven. Attack up.',
    apCost: 4, target: 'self', element: 'physical', kind: 'support', power: 0,
    inflicts: { status: 'atkUp', chance: 1, turns: 3, potency: 0.35 },
  },
  'skill.clockworkTempest': {
    id: 'skill.clockworkTempest', name: 'Clockwork Tempest', description: 'A swarm of spring-darts that never seems to run down.',
    apCost: 11, target: 'allEnemies', element: 'wind', kind: 'physical', power: 1.45,
    inflicts: { status: 'defDown', chance: 0.4, turns: 2, potency: 0.2 },
  },
  'skill.redaction': {
    id: 'skill.redaction', name: 'Redaction', description: 'Quill strikes a line through the foe\'s defences.',
    apCost: 4, target: 'enemy', element: 'holy', kind: 'magical', power: 1.0,
    inflicts: { status: 'defDown', chance: 0.7, turns: 3, potency: 0.25 },
  },
  'skill.illuminatedVerse': {
    id: 'skill.illuminatedVerse', name: 'Illuminated Verse', description: 'A margin note that burns gold across every foe.',
    apCost: 9, target: 'allEnemies', element: 'holy', kind: 'magical', power: 1.2,
  },
  'skill.errata': {
    id: 'skill.errata', name: 'Errata', description: '"Correction: you are not wounded." Heals one ally a great deal.',
    apCost: 8, target: 'ally', element: 'holy', kind: 'heal', power: 2.8,
  },
  'skill.brambleWall': {
    id: 'skill.brambleWall', name: 'Bramble Wall', description: 'Thorns rise around the party. Guard up for all.',
    apCost: 8, target: 'allAllies', element: 'earth', kind: 'support', power: 0,
    inflicts: { status: 'guardUp', chance: 1, turns: 2, potency: 0.3 },
  },
  'skill.verdantSurge': {
    id: 'skill.verdantSurge', name: 'Verdant Surge', description: 'Spring comes all at once. Heals every ally.',
    apCost: 10, target: 'allAllies', element: 'earth', kind: 'heal', power: 1.4,
    inflicts: { status: 'regen', chance: 1, turns: 2, potency: 8 },
  },
  'skill.rootquake': {
    id: 'skill.rootquake', name: 'Rootquake', description: 'The roots of Hollowroot heave up through the enemy line.',
    apCost: 11, target: 'allEnemies', element: 'earth', kind: 'magical', power: 1.5,
    inflicts: { status: 'stun', chance: 0.2, turns: 1, potency: 1 },
  },
  'skill.lanternSnuff': {
    id: 'skill.lanternSnuff', name: 'Lantern Snuff', description: 'Pinch out the light behind their eyes. May stun.',
    apCost: 6, target: 'enemy', element: 'shadow', kind: 'magical', power: 1.3,
    inflicts: { status: 'stun', chance: 0.35, turns: 1, potency: 1 },
  },
  'skill.hundredCuts': {
    id: 'skill.hundredCuts', name: 'Hundred Cuts', description: 'Sable is everywhere at once, briefly.',
    apCost: 9, target: 'allEnemies', element: 'shadow', kind: 'physical', power: 1.2,
  },
  'skill.eclipseStrike': {
    id: 'skill.eclipseStrike', name: 'Eclipse Strike', description: 'One cut from the unlit side of the world.',
    apCost: 10, target: 'enemy', element: 'shadow', kind: 'physical', power: 2.4,
  },

  /* ── Campaign dragon forms ────────────────────────────────────────── */
  'skill.rimeBreath': {
    id: 'skill.rimeBreath', name: 'Rime Breath', description: 'A glacier exhaled. Soaks every foe.',
    apCost: 6, target: 'allEnemies', element: 'water', kind: 'magical', power: 1.35,
    inflicts: { status: 'soak', chance: 0.5, turns: 2, potency: 0.25 },
  },
  'skill.glacierFang': {
    id: 'skill.glacierFang', name: 'Glacier Fang', description: 'Teeth of old ice.',
    apCost: 5, target: 'enemy', element: 'water', kind: 'physical', power: 1.9,
  },
  'skill.thunderclap': {
    id: 'skill.thunderclap', name: 'Thunderclap', description: 'Wings meet overhead. May stun everyone it reaches.',
    apCost: 8, target: 'allEnemies', element: 'wind', kind: 'magical', power: 1.5,
    inflicts: { status: 'stun', chance: 0.25, turns: 1, potency: 1 },
  },
  'skill.stormTalon': {
    id: 'skill.stormTalon', name: 'Storm Talon', description: 'A dive from the cloud-roof.',
    apCost: 6, target: 'enemy', element: 'wind', kind: 'physical', power: 2.3,
  },
  'skill.sovereignFlame': {
    id: 'skill.sovereignFlame', name: 'Sovereign Flame', description: 'The fire that chooses to flicker. Nothing stilled survives it.',
    apCost: 12, target: 'allEnemies', element: 'fire', kind: 'magical', power: 2.2,
    inflicts: { status: 'burn', chance: 0.6, turns: 3, potency: 14 },
  },
  'skill.crownOfEmbers': {
    id: 'skill.crownOfEmbers', name: 'Crown of Embers', description: 'Every Warden-bound heart burns brighter.',
    apCost: 8, target: 'allAllies', element: 'fire', kind: 'support', power: 0,
    inflicts: { status: 'atkUp', chance: 1, turns: 3, potency: 0.35 },
  },

  /* ── Campaign enemies ─────────────────────────────────────────────── */
  'skill.enemy.gnash': {
    id: 'skill.enemy.gnash', name: 'Gnash', description: 'A beast\'s full-weight bite.',
    apCost: 3, target: 'enemy', element: 'physical', kind: 'physical', power: 1.35,
  },
  'skill.enemy.emberSpit': {
    id: 'skill.enemy.emberSpit', name: 'Ember Spit', description: 'Molten glass, flicked. May burn.',
    apCost: 4, target: 'enemy', element: 'fire', kind: 'magical', power: 1.2,
    inflicts: { status: 'burn', chance: 0.4, turns: 2, potency: 5 },
  },
  'skill.enemy.galeRake': {
    id: 'skill.enemy.galeRake', name: 'Gale Rake', description: 'Talons on a crosswind.',
    apCost: 4, target: 'enemy', element: 'wind', kind: 'physical', power: 1.3,
  },
  'skill.enemy.chimeToll': {
    id: 'skill.enemy.chimeToll', name: 'Chime Toll', description: 'A stilling bell rings through every bone.',
    apCost: 6, target: 'allEnemies', element: 'holy', kind: 'magical', power: 0.85,
    inflicts: { status: 'stun', chance: 0.12, turns: 1, potency: 1 },
  },
  'skill.enemy.shieldWall': {
    id: 'skill.enemy.shieldWall', name: 'Shield Wall', description: 'Locked shields.',
    apCost: 3, target: 'self', element: 'physical', kind: 'support', power: 0,
    inflicts: { status: 'guardUp', chance: 1, turns: 2, potency: 0.4 },
  },
  'skill.enemy.bogDrag': {
    id: 'skill.enemy.bogDrag', name: 'Bog Drag', description: 'Something pulls from below. May soak.',
    apCost: 4, target: 'enemy', element: 'water', kind: 'physical', power: 1.3,
    inflicts: { status: 'soak', chance: 0.5, turns: 2, potency: 0.2 },
  },
  'skill.enemy.sandLash': {
    id: 'skill.enemy.sandLash', name: 'Sand Lash', description: 'A whip of hot grit across the line.',
    apCost: 5, target: 'allEnemies', element: 'earth', kind: 'physical', power: 0.8,
  },
  'skill.enemy.auditorsGaze': {
    id: 'skill.enemy.auditorsGaze', name: 'Auditor\'s Gaze', description: 'You are found wanting. Defence down.',
    apCost: 5, target: 'enemy', element: 'holy', kind: 'magical', power: 1.1,
    inflicts: { status: 'defDown', chance: 0.6, turns: 3, potency: 0.25 },
  },
  'skill.enemy.fellingAxe': {
    id: 'skill.enemy.fellingAxe', name: 'Felling Axe', description: 'A woodsman\'s overhead chop.',
    apCost: 4, target: 'enemy', element: 'physical', kind: 'physical', power: 1.5,
  },
  'skill.enemy.sapBind': {
    id: 'skill.enemy.sapBind', name: 'Sap Bind', description: 'Amber sap hardens around the limbs. May stun.',
    apCost: 5, target: 'enemy', element: 'earth', kind: 'magical', power: 1.0,
    inflicts: { status: 'stun', chance: 0.3, turns: 1, potency: 1 },
  },
  'skill.enemy.frostBite': {
    id: 'skill.enemy.frostBite', name: 'Frost Bite', description: 'The cold gets its teeth in. May soak.',
    apCost: 4, target: 'enemy', element: 'water', kind: 'physical', power: 1.35,
    inflicts: { status: 'soak', chance: 0.35, turns: 2, potency: 0.2 },
  },
  'skill.enemy.reliquaryLight': {
    id: 'skill.enemy.reliquaryLight', name: 'Reliquary Light', description: 'A caged spirit\'s light, turned into a weapon.',
    apCost: 6, target: 'allEnemies', element: 'holy', kind: 'magical', power: 1.0,
  },
  'skill.enemy.slagHurl': {
    id: 'skill.enemy.slagHurl', name: 'Slag Hurl', description: 'A ladle of glowing slag. May burn.',
    apCost: 5, target: 'enemy', element: 'fire', kind: 'physical', power: 1.5,
    inflicts: { status: 'burn', chance: 0.5, turns: 3, potency: 10 },
  },
  'skill.enemy.kilnBlast': {
    id: 'skill.enemy.kilnBlast', name: 'Kiln Blast', description: 'The furnace doors swing open.',
    apCost: 8, target: 'allEnemies', element: 'fire', kind: 'magical', power: 1.15,
  },
  'skill.enemy.stillingVerdict': {
    id: 'skill.enemy.stillingVerdict', name: 'Stilling Verdict', description: 'The Hierophant\'s word. A spirit goes quiet.',
    apCost: 9, target: 'allEnemies', element: 'holy', kind: 'magical', power: 1.3,
    inflicts: { status: 'stun', chance: 0.15, turns: 1, potency: 1 },
  },
  'skill.enemy.ossuaryHowl': {
    id: 'skill.enemy.ossuaryHowl', name: 'Ossuary Howl', description: 'A hound that should be dead calls the pack.',
    apCost: 4, target: 'self', element: 'shadow', kind: 'support', power: 0,
    inflicts: { status: 'atkUp', chance: 1, turns: 2, potency: 0.25 },
  },
  'skill.enemy.stillMend': {
    id: 'skill.enemy.stillMend', name: 'Still Mend', description: 'Stolen spirit-warmth knits a wound.',
    apCost: 6, target: 'ally', element: 'holy', kind: 'heal', power: 2.0,
  },

  /* ── Enemy skills ─────────────────────────────────────────────────── */
  'skill.enemy.rend': {
    id: 'skill.enemy.rend', name: 'Rend', description: 'Teeth and thorn-hackles.',
    apCost: 3, target: 'enemy', element: 'physical', kind: 'physical', power: 1.3,
  },
  'skill.enemy.packHowl': {
    id: 'skill.enemy.packHowl', name: 'Pack Howl', description: 'The pack bays together.',
    apCost: 4, target: 'self', element: 'physical', kind: 'support', power: 0,
    inflicts: { status: 'atkUp', chance: 1, turns: 2, potency: 0.2 },
  },
  'skill.enemy.stillChill': {
    id: 'skill.enemy.stillChill', name: 'Still Chill', description: 'The cold of a spirit forced quiet. May soak.',
    apCost: 4, target: 'enemy', element: 'water', kind: 'magical', power: 1.2,
    inflicts: { status: 'soak', chance: 0.4, turns: 2, potency: 0.2 },
  },
  'skill.enemy.stillingHymn': {
    id: 'skill.enemy.stillingHymn', name: 'Stilling Hymn', description: 'A Covenant chant that presses on every chest.',
    apCost: 6, target: 'allEnemies', element: 'holy', kind: 'magical', power: 0.75,
  },
  'skill.enemy.titheStrike': {
    id: 'skill.enemy.titheStrike', name: 'Tithe Strike', description: 'A cudgel blow \"for the Flame\". Lowers defence.',
    apCost: 4, target: 'enemy', element: 'physical', kind: 'physical', power: 1.35,
    inflicts: { status: 'defDown', chance: 0.4, turns: 2, potency: 0.2 },
  },
  'skill.enemy.acolyteMend': {
    id: 'skill.enemy.acolyteMend', name: 'Acolyte\'s Mend', description: 'Borrowed warmth, poured into an ally.',
    apCost: 5, target: 'ally', element: 'holy', kind: 'heal', power: 1.6,
  },
  'skill.enemy.pinch': {
    id: 'skill.enemy.pinch', name: 'Brine Pinch', description: 'A claw like a shut door.',
    apCost: 3, target: 'enemy', element: 'water', kind: 'physical', power: 1.25,
  },
  'skill.enemy.shellUp': {
    id: 'skill.enemy.shellUp', name: 'Shell Up', description: 'Withdraws behind barnacled plate.',
    apCost: 3, target: 'self', element: 'physical', kind: 'support', power: 0,
    inflicts: { status: 'guardUp', chance: 1, turns: 2, potency: 0.4 },
  },
  'skill.enemy.ringFlourish': {
    id: 'skill.enemy.ringFlourish', name: 'Ring Flourish', description: 'A showman\'s spinning cut for the stands.',
    apCost: 4, target: 'enemy', element: 'physical', kind: 'physical', power: 1.5,
  },
  'skill.enemy.crowdRoar': {
    id: 'skill.enemy.crowdRoar', name: 'Crowd Roar', description: 'The stands stamp; the champion swells.',
    apCost: 4, target: 'self', element: 'physical', kind: 'support', power: 0,
    inflicts: { status: 'atkUp', chance: 1, turns: 2, potency: 0.25 },
  },
  'skill.enemy.judgement': {
    id: 'skill.enemy.judgement', name: 'Still Judgement', description: 'The Deacon names your sin. May stun.',
    apCost: 6, target: 'enemy', element: 'holy', kind: 'magical', power: 1.55,
    inflicts: { status: 'stun', chance: 0.25, turns: 1, potency: 1 },
  },
} satisfies Record<string, SkillDef>;
