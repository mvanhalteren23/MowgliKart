import type { GameDatabase, WorldMapDef } from '@/types/contracts';
import { acts } from './acts';
import { chapters, merge, mergeRecord } from './campaign';
import { dialogues } from './dialogues';
import { dragonForms } from './dragonForms';
import { encounters, enemies } from './enemies';
import { gear } from './gear';
import { fieldActions, heroes } from './heroes';
import { items } from './items';
import { investigations, sliceQuests } from './quests';
import { skills } from './skills';
import { spirits } from './spirits';
import { clues, endings, storyGraph } from './story';
import { township } from './township';
import { fish, species } from './wildlife';
import { sliceWorld } from './world';

export * as ids from './ids';
export { BUILDING, CHAIN, ENC, FLAG, GATE, INV, MAIN, NPC, QUEST, REGION, SPECIES, SPOT } from './ids';

/** Recursively freezes authored content so nobody can mutate the shared database at runtime. */
function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
  }
  return value;
}

const world: WorldMapDef = {
  seed: sliceWorld.seed,
  playerStart: sliceWorld.playerStart,
  regions: [...sliceWorld.regions, ...merge((c) => c.regions)],
  props: [...sliceWorld.props, ...merge((c) => c.props)],
  npcs: [...sliceWorld.npcs, ...merge((c) => c.npcs)],
  encounterZones: [...sliceWorld.encounterZones, ...merge((c) => c.zones)],
  fishingSpots: [...sliceWorld.fishingSpots, ...merge((c) => c.spots)],
  paths: [...sliceWorld.paths, ...merge((c) => c.paths)],
  water: [...sliceWorld.water, ...merge((c) => c.water)],
  chunks: chapters.map((c) => c.chunk),
  traversalGates: merge((c) => c.gates),
};

const quests = [...sliceQuests, ...merge((c) => c.quests), ...investigations];

const database: GameDatabase = {
  title: 'Emberwake: The Hollow Covenant',
  heroes,
  fieldActions,
  spirits,
  dragonForms,
  skills,
  enemies: { ...enemies, ...mergeRecord((c) => c.enemies) },
  // Slice encounters first: the first boss in insertion order stays the Greyford tithe-post.
  encounters: { ...encounters, ...mergeRecord((c) => c.encounters) },
  gear,
  items: { ...items, ...mergeRecord((c) => c.items) },
  quests,
  dialogues: { ...dialogues, ...mergeRecord((c) => c.dialogues) },
  acts: acts.map((a) => ({ ...a, questIds: quests.filter((q) => q.act === a.act).map((q) => q.id) })),
  storyGraph,
  clues,
  endings,
  world,
  township,
  species: { ...species, ...mergeRecord((c) => c.species) },
  fish: { ...fish, ...mergeRecord((c) => c.fish) },
  start: {
    party: ['kael', 'tobin', 'vesna'],
    leader: 'kael',
    level: 3,
    coin: 120,
    inventory: {
      'item.tonic': 4,
      'item.emberDraught': 2,
      'item.phoenixAsh': 1,
      'item.lure.cricket': 5,
      'item.lure.silverSpoon': 2,
      'item.lure.emberFly': 2,
      'item.ringMarker': 1,
    },
    gearOwned: [
      'weapon.ashenBlade', 'weapon.wardenLongbow', 'weapon.duelistGlaive',
      'armor.travelLeathers', 'armor.wardenCloak', 'armor.ringWraps', 'relic.tarnCharm',
      // Newcomers' bound starter kits, so each recruit arrives equipped.
      'weapon.sailcloakStaff', 'armor.chanterSilks', 'weapon.quarryMaul', 'armor.slabPlate',
      'weapon.springCrossbow', 'armor.tinkerApron', 'weapon.ledgerBlade', 'armor.archivistRobe',
      'weapon.thornstaff', 'armor.barkMantle', 'weapon.lanternHook', 'armor.nightLeathers',
    ],
    loadouts: {
      kael: { weapon: 'weapon.ashenBlade', armor: 'armor.travelLeathers' },
      tobin: { weapon: 'weapon.wardenLongbow', armor: 'armor.wardenCloak', relic: 'relic.tarnCharm' },
      vesna: { weapon: 'weapon.duelistGlaive', armor: 'armor.ringWraps' },
      orla: { weapon: 'weapon.sailcloakStaff', armor: 'armor.chanterSilks' },
      hadrik: { weapon: 'weapon.quarryMaul', armor: 'armor.slabPlate' },
      pim: { weapon: 'weapon.springCrossbow', armor: 'armor.tinkerApron' },
      quill: { weapon: 'weapon.ledgerBlade', armor: 'armor.archivistRobe' },
      moss: { weapon: 'weapon.thornstaff', armor: 'armor.barkMantle' },
      sable: { weapon: 'weapon.lanternHook', armor: 'armor.nightLeathers' },
    },
    spirits: ['ashka', 'mirelle'],
    flags: {},
  },
};

export const gameData: GameDatabase = deepFreeze(database);
export default gameData;
