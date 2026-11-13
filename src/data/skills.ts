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
