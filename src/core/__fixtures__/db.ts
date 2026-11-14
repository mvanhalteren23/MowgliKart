/**
 * Self-contained test database for `src/core` (independent of `src/data`).
 * Numbers are chosen for readable assertions, not balance.
 */
import type {
  AssetManifestEntry,
  DragonFormDef,
  ElementalReactionDef,
  HazardDef,
  MountDef,
  StaminaTuning,
  EnemyDef,
  FieldActionDef,
  FieldActionId,
  GameDatabase,
  GearDef,
  HeroDef,
  HeroId,
  QuestDef,
  SkillDef,
  SpiritDef,
  SpiritId,
  Stats,
} from '@/types/contracts';

export const stats = (o: Partial<Stats> = {}): Stats => ({
  maxHp: 100,
  maxAp: 50,
  atk: 20,
  def: 10,
  mag: 15,
  res: 10,
  spd: 10,
  luck: 0,
  ...o,
});

const ZERO: Stats = { maxHp: 0, maxAp: 0, atk: 0, def: 0, mag: 0, res: 0, spd: 0, luck: 0 };

function hero(id: HeroId, o: Partial<HeroDef> = {}): HeroDef {
  return {
    id,
    name: id.charAt(0).toUpperCase() + id.slice(1),
    title: 'Test hero',
    blurb: '',
    playable: false,
    sprite: `hero.${id}`,
    accent: '#ffffff',
    baseStats: stats(),
    growth: ZERO,
    affinities: {},
    skills: [],
    fieldActions: ['none'],
    fusionAffinity: [],
    dragonForms: [],
    ...o,
  };
}

const skills: Record<string, SkillDef> = {
  'skill.claw': { id: 'skill.claw', name: 'Claw', description: '', apCost: 0, target: 'enemy', element: 'physical', kind: 'physical', power: 1.2 },
  'skill.emberBreath': { id: 'skill.emberBreath', name: 'Ember Breath', description: '', apCost: 5, target: 'allEnemies', element: 'fire', kind: 'magical', power: 1.5 },
  'skill.flameLash': {
    id: 'skill.flameLash', name: 'Flame Lash', description: '', apCost: 4, target: 'enemy', element: 'fire', kind: 'magical', power: 1.3,
    inflicts: { status: 'burn', chance: 1, turns: 2, potency: 0.1 },
  },
  'skill.tideWard': {
    id: 'skill.tideWard', name: 'Tide Ward', description: '', apCost: 3, target: 'self', element: 'water', kind: 'support', power: 0,
    inflicts: { status: 'guardUp', chance: 1, turns: 2, potency: 0.5 },
  },
  'skill.mend': { id: 'skill.mend', name: 'Mend', description: '', apCost: 4, target: 'ally', element: 'holy', kind: 'heal', power: 2 },
  'skill.drakeCall': { id: 'skill.drakeCall', name: 'Drake Call', description: '', apCost: 2, target: 'enemy', element: 'physical', kind: 'physical', power: 1, syncGain: 30 },
  'skill.sweep': { id: 'skill.sweep', name: 'Glaive Sweep', description: '', apCost: 3, target: 'allEnemies', element: 'physical', kind: 'physical', power: 0.8 },
  'skill.hex': { id: 'skill.hex', name: 'Hollow Hex', description: '', apCost: 5, target: 'enemy', element: 'shadow', kind: 'magical', power: 1.2 },
  'skill.spark': { id: 'skill.spark', name: 'Wick Spark', description: '', apCost: 2, target: 'enemy', element: 'fire', kind: 'magical', power: 1 },
  'skill.cinderRain': { id: 'skill.cinderRain', name: 'Cinder Rain', description: '', apCost: 3, target: 'allEnemies', element: 'fire', kind: 'magical', power: 0.6 },
  // Phase 3 — elemental skills and quick-time heavy skills.
  'skill.tideBolt': { id: 'skill.tideBolt', name: 'Tide Bolt', description: '', apCost: 0, target: 'enemy', element: 'water', kind: 'magical', power: 1 },
  'skill.stormNeedle': { id: 'skill.stormNeedle', name: 'Storm Needle', description: '', apCost: 0, target: 'enemy', element: 'lightning', kind: 'magical', power: 1 },
  'skill.rimeShard': { id: 'skill.rimeShard', name: 'Rime Shard', description: '', apCost: 0, target: 'enemy', element: 'ice', kind: 'magical', power: 1 },
  'skill.emberDart': { id: 'skill.emberDart', name: 'Ember Dart', description: '', apCost: 0, target: 'enemy', element: 'fire', kind: 'magical', power: 1 },
  'skill.galeCut': { id: 'skill.galeCut', name: 'Gale Cut', description: '', apCost: 0, target: 'enemy', element: 'wind', kind: 'magical', power: 1 },
  'skill.tideWave': { id: 'skill.tideWave', name: 'Tide Wave', description: '', apCost: 0, target: 'allEnemies', element: 'water', kind: 'magical', power: 1 },
  'skill.ringBreaker': {
    id: 'skill.ringBreaker', name: 'Ring Breaker', description: '', apCost: 0, target: 'enemy', element: 'physical', kind: 'physical', power: 2,
    qte: { prompts: 3, windowMs: 600, pool: ['up', 'down', 'left', 'right', 'tap'], goodMultiplier: 1.5, perfectMultiplier: 2, perfectWithin: 0.5, hitStopMs: 90 },
  },
  'skill.cinderStorm': {
    id: 'skill.cinderStorm', name: 'Cinder Storm', description: '', apCost: 0, target: 'allEnemies', element: 'fire', kind: 'magical', power: 1,
    qte: { prompts: 5, windowMs: 500, pool: ['tap', 'up'], goodMultiplier: 1.25, perfectMultiplier: 1.5, perfectWithin: 0.4, hitStopMs: 60 },
  },
  'skill.stunBite': {
    id: 'skill.stunBite', name: 'Numbing Bite', description: '', apCost: 2, target: 'enemy', element: 'physical', kind: 'physical', power: 0.5,
    inflicts: { status: 'stun', chance: 1, turns: 1, potency: 0 },
  },
};

const dragonForms: Record<string, DragonFormDef> = {
  'form.cinderDrake': {
    id: 'form.cinderDrake', name: 'Cinder Drake', element: 'fire', sprite: 'drake.cinder',
    syncRequired: 50, apCostToEnter: 10, apDrainPerTurn: 5, maxTurns: 3,
    statMultipliers: { atk: 2, mag: 1.5 }, affinities: { fire: 0, water: 2 },
    skills: ['skill.claw', 'skill.emberBreath'],
  },
  'form.elderDrake': {
    id: 'form.elderDrake', name: 'Elder Drake', element: 'fire', sprite: 'drake.elder',
    syncRequired: 100, apCostToEnter: 30, apDrainPerTurn: 10, maxTurns: 2,
    statMultipliers: { atk: 3 }, affinities: {}, skills: ['skill.claw'],
  },
  'form.ashenSovereign': {
    id: 'form.ashenSovereign', name: 'Ashen Sovereign', element: 'fire', sprite: 'drake.sovereign',
    syncRequired: 50, apCostToEnter: 10, apDrainPerTurn: 5, maxTurns: 3,
    requiresFlag: 'story.emberOath', apex: true,
    statMultipliers: { atk: 4 }, affinities: { fire: 0 }, skills: ['skill.claw', 'skill.emberBreath'],
  },
};

const spirit = (id: SpiritId, o: Partial<SpiritDef>): SpiritDef => ({
  id,
  name: id.charAt(0).toUpperCase() + id.slice(1),
  element: 'physical',
  epithet: '',
  description: '',
  awakened: false,
  auraColor: '#888888',
  statMultipliers: {},
  statBonuses: {},
  affinities: {},
  grantsSkills: [],
  imbue: 'physical',
  armor: 0,
  ...o,
});

const spirits: Record<SpiritId, SpiritDef> = {
  ashka: spirit('ashka', {
    element: 'fire', awakened: true, auraColor: '#ff6a2a',
    statMultipliers: { atk: 1.5 }, statBonuses: { atk: 10, mag: 5 },
    affinities: { fire: 0.5, water: 1.5 }, grantsSkills: ['skill.flameLash'], imbue: 'fire', armor: 60,
    resonance: [{ with: 'mirelle', name: 'Steamheart', statMultipliers: { mag: 1.2 } }],
  }),
  mirelle: spirit('mirelle', {
    element: 'water', awakened: true, auraColor: '#3aa6ff',
    statMultipliers: { atk: 1.1, res: 1.2 }, statBonuses: { atk: 4, def: 6 },
    affinities: { water: 0.5, fire: 0.8 }, grantsSkills: ['skill.tideWard', 'skill.flameLash'], imbue: 'water', armor: 40,
  }),
  zephra: spirit('zephra', { element: 'wind', imbue: 'wind', armor: 30 }),
  tor: spirit('tor', { element: 'earth' }),
  lumen: spirit('lumen', { element: 'holy' }),
  nyx: spirit('nyx', { element: 'shadow' }),
};

const enemy = (id: string, o: Partial<EnemyDef>): EnemyDef => ({
  id, name: id, sprite: `enemy.${id}`, level: 1, stats: stats(), affinities: {}, skills: [], xp: 10, coin: 5, drops: [], skillBias: 0, ...o,
});

const enemies: Record<string, EnemyDef> = {
  'en.rat': enemy('en.rat', { name: 'Gloam Rat', stats: stats({ maxHp: 40, atk: 18, def: 5, spd: 5 }), xp: 12, coin: 4, drops: [{ itemId: 'item.tonic', chance: 1 }, { itemId: 'item.never', chance: 0 }] }),
  'en.fast': enemy('en.fast', { name: 'Quickling', stats: stats({ maxHp: 60, atk: 25, def: 5, spd: 99 }) }),
  'en.dummy': enemy('en.dummy', { name: 'Straw Dummy', stats: stats({ maxHp: 5000, atk: 1, def: 0, res: 0, spd: 1 }), affinities: { fire: 2, shadow: 0 } }),
  'en.brute': enemy('en.brute', { name: 'Stillguard Brute', stats: stats({ maxHp: 5000, atk: 60, def: 0, spd: 50 }) }),
  'en.caster': enemy('en.caster', { name: 'Covenant Acolyte', stats: stats({ maxHp: 5000, mag: 40, spd: 50, maxAp: 999 }), skills: ['skill.hex'], skillBias: 1 }),
  'en.sweeper': enemy('en.sweeper', { name: 'Chain Warden', stats: stats({ maxHp: 5000, atk: 40, spd: 50, maxAp: 999 }), skills: ['skill.sweep'], skillBias: 1 }),
  'en.glass': enemy('en.glass', { name: 'Glass Moth', stats: stats({ maxHp: 1, def: 0, spd: 1 }), xp: 3, coin: 2 }),
  'en.mage': enemy('en.mage', { name: 'Stillflame Cantor', stats: stats({ maxHp: 5000, mag: 40, spd: 50, maxAp: 999 }), skills: ['skill.cinderRain'], skillBias: 1 }),
  'en.smasher': enemy('en.smasher', { name: 'Ring Bruiser', stats: stats({ maxHp: 5000, atk: 30, spd: 50, maxAp: 999 }), skills: ['skill.ringBreaker'], skillBias: 1 }),
  'en.stormcaller': enemy('en.stormcaller', { name: 'Tempest Vicar', stats: stats({ maxHp: 5000, mag: 30, spd: 50, maxAp: 999 }), skills: ['skill.stormNeedle'], skillBias: 1 }),
  'en.wisp': enemy('en.wisp', { name: 'Ash Wisp', stats: stats({ maxHp: 200, def: 0, res: 0, spd: 1 }), affinities: { water: 0 } }),
  'en.biter': enemy('en.biter', { name: 'Numbing Eel', stats: stats({ maxHp: 5000, atk: 10, spd: 50, maxAp: 999 }), skills: ['skill.stunBite'], skillBias: 1 }),
};

const gear: Record<string, GearDef> = {
  'gear.ironSword': { id: 'gear.ironSword', name: 'Iron Sword', slot: 'weapon', description: '', stats: { atk: 5 }, icon: '/', archetype: 'standard' },
  'gear.leather': { id: 'gear.leather', name: 'Leather Coat', slot: 'armor', description: '', stats: { def: 4, maxHp: 10 }, icon: '#', archetype: 'standard' },
  'gear.relicLinear': {
    id: 'gear.relicLinear', name: 'Linear Relic', slot: 'relic', description: '', stats: { atk: 2 }, icon: '*', archetype: 'relic', boundHero: 'kael',
    scaling: { perLevel: { atk: 2, mag: 1 }, levelCurve: 'linear', perLiberatedRegion: { atk: 3 }, cap: { atk: 40 } },
  },
  'gear.relicSqrt': {
    id: 'gear.relicSqrt', name: 'Sqrt Relic', slot: 'relic', description: '', stats: {}, icon: '*', archetype: 'relic',
    scaling: { perLevel: { atk: 2 }, levelCurve: 'sqrt', perLiberatedRegion: { def: 2 } },
  },
  'gear.relicLog': {
    id: 'gear.relicLog', name: 'Log Relic', slot: 'relic', description: '', stats: {}, icon: '*', archetype: 'relic',
    scaling: { perLevel: { atk: 2 }, levelCurve: 'log', perLiberatedRegion: {} },
  },
  'gear.talon': {
    id: 'gear.talon', name: 'Test Talon', slot: 'signature', description: '', stats: { atk: 3 }, icon: '!', archetype: 'signature', boundHero: 'vesna',
    hookId: 'hook.counterAttack', hookParams: { chance: 1, power: 1 }, hookText: 'Always counters.',
  },
  'gear.surgeScale': { id: 'gear.surgeScale', name: 'Surge Scale', slot: 'signature', description: '', stats: {}, icon: '!', archetype: 'signature', hookId: 'hook.dragonSurge', hookParams: { sync: 10, ap: 4 }, hookText: '' },
  'gear.quarryFletch': { id: 'gear.quarryFletch', name: 'Quarry Fletching', slot: 'signature', description: '', stats: {}, icon: '!', archetype: 'signature', hookId: 'hook.markedQuarry', hookParams: { chance: 1, turns: 2, potency: 0.5 }, hookText: '' },
  'gear.quarryDull': { id: 'gear.quarryDull', name: 'Blunt Fletching', slot: 'signature', description: '', stats: {}, icon: '!', archetype: 'signature', hookId: 'hook.markedQuarry', hookParams: { chance: 0, turns: 2, potency: 0.5 }, hookText: '' },
  'gear.mendBell': { id: 'gear.mendBell', name: 'Mending Bell', slot: 'signature', description: '', stats: {}, icon: '!', archetype: 'signature', hookId: 'hook.mendingEcho', hookParams: { fraction: 0.1 }, hookText: '' },
  'gear.bulwarkPlate': { id: 'gear.bulwarkPlate', name: 'Bulwark Plate', slot: 'signature', description: '', stats: {}, icon: '!', archetype: 'signature', hookId: 'hook.bulwark', hookParams: { armor: 20, turns: 2, potency: 0.5 }, hookText: '' },
  'gear.bulwarkDull': { id: 'gear.bulwarkDull', name: 'Cracked Plate', slot: 'signature', description: '', stats: {}, icon: '!', archetype: 'signature', hookId: 'hook.bulwark', hookParams: { chance: 0, armor: 20, turns: 2, potency: 0.5 }, hookText: '' },
  'gear.pilferGlove': { id: 'gear.pilferGlove', name: 'Quickfinger Glove', slot: 'signature', description: '', stats: {}, icon: '!', archetype: 'signature', hookId: 'hook.pilfer', hookParams: { chance: 1, coin: 15 }, hookText: '' },
  'gear.pilferDull': { id: 'gear.pilferDull', name: 'Clumsy Glove', slot: 'signature', description: '', stats: {}, icon: '!', archetype: 'signature', hookId: 'hook.pilfer', hookParams: { chance: 0, coin: 15 }, hookText: '' },
  'gear.echoLens': { id: 'gear.echoLens', name: 'Echo Lens', slot: 'signature', description: '', stats: {}, icon: '!', archetype: 'signature', hookId: 'hook.spellEcho', hookParams: { chance: 1, power: 0.5 }, hookText: '' },
  'gear.echoDull': { id: 'gear.echoDull', name: 'Fogged Lens', slot: 'signature', description: '', stats: {}, icon: '!', archetype: 'signature', hookId: 'hook.spellEcho', hookParams: { chance: 0, power: 0.5 }, hookText: '' },
  'gear.rootCharm': { id: 'gear.rootCharm', name: 'Rootbind Charm', slot: 'signature', description: '', stats: {}, icon: '!', archetype: 'signature', hookId: 'hook.rootbind', hookParams: { chance: 1, turns: 1 }, hookText: '' },
  'gear.rootDull': { id: 'gear.rootDull', name: 'Withered Charm', slot: 'signature', description: '', stats: {}, icon: '!', archetype: 'signature', hookId: 'hook.rootbind', hookParams: { chance: 0, turns: 1 }, hookText: '' },
  'gear.reapSickle': { id: 'gear.reapSickle', name: 'Reaping Sickle', slot: 'signature', description: '', stats: {}, icon: '!', archetype: 'signature', hookId: 'hook.reap', hookParams: { ap: 6, potency: 0.5, turns: 2 }, hookText: '' },
  'gear.reapDull': { id: 'gear.reapDull', name: 'Rusted Sickle', slot: 'signature', description: '', stats: {}, icon: '!', archetype: 'signature', hookId: 'hook.reap', hookParams: { chance: 0, ap: 6, potency: 0.5, turns: 2 }, hookText: '' },
  'gear.talonNever': {
    id: 'gear.talonNever', name: 'Dull Talon', slot: 'signature', description: '', stats: {}, icon: '!', archetype: 'signature',
    hookId: 'hook.counterAttack', hookParams: { chance: 0, power: 1 }, hookText: 'Never counters.',
  },
};

const quest = (o: Partial<QuestDef> & Pick<QuestDef, 'id'>): QuestDef => ({
  title: o.id, kind: 'main', act: 1, summary: '',
  chronicle: { HIDDEN: '', DISCOVERED: `${o.id} discovered`, ACTIVE: `${o.id} active`, COMPLETED: `${o.id} completed` },
  discoverWhen: { kind: 'always' }, activateWhen: { kind: 'always' }, objectives: [], rewards: [],
  ...o,
});

const quests: QuestDef[] = [
  quest({
    id: 'q.ledger',
    discoverWhen: { kind: 'flag', key: 'evt:talk:npc.elder', atLeast: 1 },
    activateWhen: { kind: 'flag', key: 'evt:accept:q.ledger', atLeast: 1 },
    objectives: [
      { id: 'o.rats', text: 'Clear the rats', completeWhen: { kind: 'flag', key: 'evt:defeat:enc.rats', atLeast: 1 } },
      { id: 'o.herbs', text: 'Gather 3 herbs (optional)', optional: true, completeWhen: { kind: 'flag', key: 'evt:obtain:item.herb', atLeast: 3 } },
      {
        id: 'o.report', text: 'Report back',
        revealWhen: { kind: 'flag', key: 'evt:defeat:enc.rats', atLeast: 1 },
        completeWhen: { kind: 'flag', key: 'evt:talk:npc.elder', atLeast: 2 },
      },
    ],
    rewards: [{ type: 'coin', amount: 100 }, { type: 'flag', key: 'ledger.done', value: true }],
  }),
  // Cascade: discovered + activated + completed by the ledger's flag reward in one dispatch.
  quest({
    id: 'q.chain',
    discoverWhen: { kind: 'flag', key: 'ledger.done', equals: true },
    activateWhen: { kind: 'always' },
    objectives: [{ id: 'o.free', text: 'Free objective', completeWhen: { kind: 'always' } }],
    rewards: [{ type: 'xp', amount: 50 }, { type: 'flag', key: 'chain.done', value: 1 }],
  }),
  quest({
    id: 'q.after',
    discoverWhen: { kind: 'questAtLeast', questId: 'q.chain', status: 'COMPLETED' },
    activateWhen: { kind: 'flag', key: 'evt:accept:q.after', atLeast: 1 },
    objectives: [{ id: 'o.never', text: 'Never', completeWhen: { kind: 'not', of: { kind: 'always' } } }],
  }),
  // Investigation driven by `count` conditions over clue flags; recruits a hero.
  quest({
    id: 'q.inquiry',
    kind: 'investigation',
    discoverWhen: { kind: 'count', atLeast: 1, of: [{ kind: 'flag', key: 'clue:tithe' }, { kind: 'flag', key: 'clue:ash' }, { kind: 'flag', key: 'clue:bell' }] },
    activateWhen: { kind: 'always' },
    objectives: [
      {
        id: 'o.two', text: 'Find two clues',
        completeWhen: { kind: 'count', atLeast: 2, of: [{ kind: 'flag', key: 'clue:tithe' }, { kind: 'flag', key: 'clue:ash' }, { kind: 'flag', key: 'clue:bell' }] },
      },
    ],
    rewards: [{ type: 'hero', heroId: 'orla' }, { type: 'flag', key: 'inquiry.done', value: true }],
  }),
];

/* ── Phase 3: hazards, reactions, stamina, mounts, asset requests ─────── */

const hz = (o: Omit<HazardDef, 'name' | 'description' | 'iconAssetId' | 'fxAssetId'>): HazardDef => ({
  name: o.id, description: '', iconAssetId: `icon.${o.id}`, fxAssetId: `fx.${o.id}`, ...o,
});

export const hazards: Record<string, HazardDef> = {
  'hz.waterPuddle': hz({ id: 'hz.waterPuddle', durationRounds: 3, amplifies: { lightning: 1.5 } }),
  'hz.steamVent': hz({ id: 'hz.steamVent', durationRounds: 2, dot: { element: 'water', fraction: 0.05 }, obscures: 0.3 }),
  'hz.electrifiedWater': hz({ id: 'hz.electrifiedWater', durationRounds: 2, dot: { element: 'lightning', fraction: 0.1 }, inflicts: { status: 'stun', chance: 0, turns: 1, potency: 0 } }),
  'hz.frozenLake': hz({ id: 'hz.frozenLake', durationRounds: 2, inflicts: { status: 'soak', chance: 1, turns: 2, potency: 0.3 }, amplifies: { physical: 1.25 } }),
  'hz.smokeCloud': hz({ id: 'hz.smokeCloud', durationRounds: 2, dot: { element: 'fire', fraction: 0.02 }, obscures: 0.5 }),
  'hz.galeScar': hz({ id: 'hz.galeScar', durationRounds: 3 }),
  'hz.cinderPyre': hz({ id: 'hz.cinderPyre', durationRounds: 1, dot: { element: 'fire', fraction: 0.5 } }),
};

export const reactions: ElementalReactionDef[] = [
  // Listed out of priority order on purpose: the resolver must sort by priority.
  { id: 'rx.puddle', name: 'Puddle', element: 'water', when: {}, spawns: 'hz.waterPuddle', priority: 90 },
  { id: 'rx.steam', name: 'Steam Burst', element: 'water', when: { targetStatus: 'burn' }, consumes: { status: 'burn' }, spawns: 'hz.steamVent', bonusDamage: 0.5, priority: 10 },
  { id: 'rx.electro', name: 'Galvanic Surge', element: 'lightning', when: { sideHazard: 'hz.waterPuddle' }, consumes: { hazard: 'hz.waterPuddle' }, spawns: 'hz.electrifiedWater', bonusDamage: 0.25, inflicts: { status: 'stun', chance: 1, turns: 1, potency: 0 }, priority: 10 },
  { id: 'rx.freeze', name: 'Flash Freeze', element: 'ice', when: { sideHazard: 'hz.waterPuddle' }, consumes: { hazard: 'hz.waterPuddle' }, spawns: 'hz.frozenLake', priority: 10 },
  { id: 'rx.smokeSteam', name: 'Smother', element: 'fire', when: { sideHazard: 'hz.steamVent' }, consumes: { hazard: 'hz.steamVent' }, spawns: 'hz.smokeCloud', priority: 20 },
  { id: 'rx.smokeGale', name: 'Wind-fed Smoke', element: 'fire', when: { sideHazard: 'hz.galeScar' }, spawns: 'hz.smokeCloud', priority: 30 },
  { id: 'rx.gale', name: 'Gale Scar', element: 'wind', when: {}, spawns: 'hz.galeScar', priority: 50 },
];

export const staminaTuning: StaminaTuning = {
  max: 100, regenPerSec: 20, regenDelaySec: 1, sprintDrainPerSec: 25, sprintSpeedMultiplier: 1.6, recoverFraction: 0.5,
};

const mounts: Record<string, MountDef> = {
  'mount.emberwing': {
    id: 'mount.emberwing', name: 'Emberwing', description: '', kind: 'flight', hero: 'kael', speed: 20, boostSpeed: 30,
    staminaDrainPerSec: 2, boostDrainPerSec: 10, ignoresCollision: true, altitude: 30,
    camera: { distance: 20, pitchDeg: 30, lookHeight: 2 }, unlockWhen: { kind: 'always' }, unlockText: '',
    assetId: 'mount.emberwing.sheet', iconAssetId: 'icon.mount.emberwing',
  },
};

const assetRequests: AssetManifestEntry[] = [{
  asset_id: 'mount.emberwing.sheet', type: 'spritesheet', target_path: 'public/assets/generated/mounts/emberwing.png',
  resolution: { width: 512, height: 512 }, grid: { columns: 4, rows: 4, frame_width: 128, frame_height: 128 }, fps: 8, loop: true,
  alpha_channel: true, prompt_spec: 'Fixture-only request: a small ember-scaled wyrm mount, original design.', status: 'pending', category: 'mount',
}];

const CLUE_FLAGS = ['clue:tithe', 'clue:ash', 'clue:bell'].map((key) => ({ kind: 'flag' as const, key }));

const fieldActions = Object.fromEntries(
  (['fish', 'drakeSight', 'huntShot', 'huntDash', 'roll', 'glide', 'grapple', 'leap', 'commune', 'unseal', 'none'] as const).map((id) => [id, { id, label: id, glyph: '?', description: '', cooldownSec: 0, range: 0 }]),
) as Record<FieldActionId, FieldActionDef>;

export const fixtureDb: GameDatabase = {
  title: 'Core Fixture',
  heroes: {
    kael: hero('kael', {
      playable: true,
      baseStats: stats({ maxHp: 120, maxAp: 60, atk: 20, def: 10, mag: 15, spd: 12 }),
      growth: { maxHp: 10, maxAp: 3, atk: 2, def: 1, mag: 1.5, res: 1, spd: 0.5, luck: 0 },
      affinities: { fire: 0.5 },
      skills: [{ skillId: 'skill.drakeCall', level: 1 }, { skillId: 'skill.mend', level: 1 }, { skillId: 'skill.flameLash', level: 5 }],
      fusionAffinity: ['ashka', 'mirelle', 'zephra'],
      // Apex form listed first on purpose: `availableForms` must still sort it last.
      dragonForms: [{ formId: 'form.ashenSovereign', level: 1 }, { formId: 'form.cinderDrake', level: 1 }, { formId: 'form.elderDrake', level: 10 }],
    }),
    tobin: hero('tobin', { playable: true, baseStats: stats({ spd: 11 }), fusionAffinity: ['mirelle'] }),
    vesna: hero('vesna', { playable: true, baseStats: stats({ maxHp: 200, atk: 30, spd: 14 }), skills: [{ skillId: 'skill.sweep', level: 1 }], fusionAffinity: ['ashka'] }),
    orla: hero('orla', { baseStats: stats({ mag: 30, spd: 13 }), skills: [{ skillId: 'skill.spark', level: 1 }, { skillId: 'skill.cinderRain', level: 1 }], joinQuest: 'q.inquiry' }),
    hadrik: hero('hadrik', {
      baseStats: stats({ maxHp: 300, atk: 40, spd: 20 }),
      skills: [{ skillId: 'skill.ringBreaker', level: 1 }, { skillId: 'skill.cinderStorm', level: 1 }, { skillId: 'skill.claw', level: 1 }],
    }),
    pim: hero('pim', {
      baseStats: stats({ maxHp: 300, mag: 30, spd: 21 }),
      skills: ['skill.tideBolt', 'skill.stormNeedle', 'skill.rimeShard', 'skill.emberDart', 'skill.galeCut', 'skill.tideWave', 'skill.flameLash'].map((skillId) => ({ skillId, level: 1 })),
    }),
    quill: hero('quill'),
    moss: hero('moss'),
    sable: hero('sable'),
  },
  fieldActions,
  spirits,
  dragonForms,
  skills,
  enemies,
  encounters: {
    'enc.rats': { id: 'enc.rats', name: 'Rats', enemies: ['en.rat', 'en.rat'], canFlee: true },
    'enc.boss': { id: 'enc.boss', name: 'Boss', enemies: ['en.dummy'], canFlee: false, boss: true, liberatesRegion: 'region.saltmarket' },
    'enc.dummy': { id: 'enc.dummy', name: 'Dummy', enemies: ['en.dummy'], canFlee: true },
    'enc.brute': { id: 'enc.brute', name: 'Brute', enemies: ['en.brute'], canFlee: true },
    'enc.caster': { id: 'enc.caster', name: 'Caster', enemies: ['en.caster'], canFlee: true },
    'enc.sweeper': { id: 'enc.sweeper', name: 'Sweeper', enemies: ['en.sweeper'], canFlee: true },
    'enc.biter': { id: 'enc.biter', name: 'Biter', enemies: ['en.biter'], canFlee: true },
    'enc.glass': { id: 'enc.glass', name: 'Moths', enemies: ['en.glass', 'en.glass'], canFlee: true },
    'enc.mage': { id: 'enc.mage', name: 'Cantor', enemies: ['en.mage'], canFlee: true },
    'enc.pair': { id: 'enc.pair', name: 'Pair', enemies: ['en.dummy', 'en.dummy'], canFlee: true },
    'enc.smasher': { id: 'enc.smasher', name: 'Bruiser', enemies: ['en.smasher'], canFlee: true },
    'enc.storm': { id: 'enc.storm', name: 'Vicar', enemies: ['en.stormcaller'], canFlee: true },
    'enc.wisps': { id: 'enc.wisps', name: 'Wisps', enemies: ['en.wisp', 'en.dummy'], canFlee: true },
    'enc.fast': { id: 'enc.fast', name: 'Fast', enemies: ['en.fast'], canFlee: true },
  },
  gear,
  items: {
    'item.tonic': { id: 'item.tonic', name: 'Tonic', description: '', icon: '+', kind: 'heal', potency: 50, value: 10 },
    'item.ether': { id: 'item.ether', name: 'Ether', description: '', icon: '~', kind: 'ap', potency: 20, value: 10 },
    'item.phoenix': { id: 'item.phoenix', name: 'Ash Feather', description: '', icon: '^', kind: 'revive', potency: 0.5, value: 50 },
    'item.herb': { id: 'item.herb', name: 'Herb', description: '', icon: 'h', kind: 'material', potency: 0, value: 1 },
    'item.never': { id: 'item.never', name: 'Never', description: '', icon: 'x', kind: 'material', potency: 0, value: 0 },
  },
  quests,
  dialogues: {},
  acts: [{ act: 1, title: 'Act I', synopsis: '', beats: [], questIds: ['q.ledger', 'q.chain'] }],
  storyGraph: [
    { id: 'node.ledger', act: 1, title: 'The Ledger', regionId: 'region.lanternwick', questId: 'q.ledger', next: ['node.chain'] },
    { id: 'node.chain', act: 1, title: 'The Chain', regionId: 'region.saltmarket', questId: 'q.chain', next: [] },
  ],
  clues: [
    { id: 'tithe', title: 'Tithe Ledger', text: '', regionId: 'region.lanternwick', investigationId: 'q.inquiry', foundWhen: { kind: 'flag', key: 'clue:tithe' } },
    { id: 'ash', title: 'Ash Sigil', text: '', regionId: 'region.saltmarket', investigationId: 'q.inquiry', foundWhen: { kind: 'flag', key: 'clue:ash' } },
    { id: 'bell', title: 'Silent Bell', text: '', regionId: 'region.saltmarket', investigationId: 'q.inquiry', foundWhen: { kind: 'flag', key: 'clue:bell' } },
  ],
  endings: [
    { id: 'end.dawn', title: 'Dawn Unstilled', summary: '', priority: 2, when: { kind: 'count', atLeast: 3, of: CLUE_FLAGS } },
    { id: 'end.ember', title: 'A Banked Ember', summary: '', priority: 1, when: { kind: 'count', atLeast: 2, of: CLUE_FLAGS } },
    { id: 'end.still', title: 'The Still Flame', summary: '', priority: 0, when: { kind: 'always' } },
  ],
  hazards,
  reactions,
  mounts,
  stamina: staminaTuning,
  assetRequests,
  world: {
    seed: 1, playerStart: { x: 0, z: 0 }, regions: [], props: [], npcs: [], encounterZones: [], fishingSpots: [], paths: [], water: [],
    chunks: [{ cx: 0, cz: 0, name: 'Frontier', biome: 'frontier', act: 1, scatterProps: ['lantern'], foliageDensity: 0.5 }],
    traversalGates: [
      { id: 'gate.boulder', kind: 'boulder', label: 'Fallen boulder', position: { x: 10, z: 10 }, width: 4, depth: 2, sides: [{ x: 10, z: 8 }, { x: 10, z: 12 }], clearsPermanently: true },
    ],
  },
  township: {
    name: 'Test', regionId: 'region.test', plots: [{ id: 'plot.a', name: 'Plot A', position: { x: 0, z: 0 }, accepts: ['bld.forge'] }],
    buildings: [{
      id: 'bld.forge', name: 'Forge', description: '', prop: 'house', requiresRecruit: 'npc.smith', cost: { coin: 10, items: [] }, unlocksFlag: 'township.forge', perk: '',
      upgrades: [{ level: 2, name: 'Forge II', description: '', cost: { coin: 20, items: [] }, unlocksFlag: 'township.forge.2', perk: '', propScale: 1.2 }],
    }],
    recruits: [{ npcId: 'npc.smith', trade: 'smith', requires: { kind: 'always' }, requirementText: '', townshipPosition: { x: 1, z: 1 }, unlocksBuildings: ['bld.forge'] }],
  },
  species: {},
  fish: {},
  start: { party: ['kael'], leader: 'kael', level: 1, coin: 0, inventory: {}, gearOwned: [], loadouts: {}, spirits: ['ashka', 'mirelle'], flags: {} },
};
