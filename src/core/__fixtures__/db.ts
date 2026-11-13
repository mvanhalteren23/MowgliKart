/**
 * Self-contained test database for `src/core` (independent of `src/data`).
 * Numbers are chosen for readable assertions, not balance.
 */
import type {
  DragonFormDef,
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
];

const fieldActions = Object.fromEntries(
  (['fish', 'drakeSight', 'huntShot', 'huntDash', 'none'] as const).map((id) => [id, { id, label: id, glyph: '?', description: '', cooldownSec: 0, range: 0 }]),
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
      dragonForms: [{ formId: 'form.cinderDrake', level: 1 }, { formId: 'form.elderDrake', level: 10 }],
    }),
    tobin: hero('tobin', { playable: true, baseStats: stats({ spd: 11 }), fusionAffinity: ['mirelle'] }),
    vesna: hero('vesna', { playable: true, baseStats: stats({ maxHp: 200, atk: 30, spd: 14 }), skills: [{ skillId: 'skill.sweep', level: 1 }], fusionAffinity: ['ashka'] }),
    orla: hero('orla'),
    hadrik: hero('hadrik'),
    pim: hero('pim'),
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
  acts: [],
  world: { seed: 1, playerStart: { x: 0, z: 0 }, regions: [], props: [], npcs: [], encounterZones: [], fishingSpots: [], paths: [], water: [] },
  township: { name: 'Test', regionId: 'region.test', plots: [], buildings: [], recruits: [] },
  species: {},
  fish: {},
  start: { party: ['kael'], leader: 'kael', level: 1, coin: 0, inventory: {}, gearOwned: [], loadouts: {}, spirits: ['ashka', 'mirelle'], flags: {} },
};
