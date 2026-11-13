import type { GameDatabase } from '@/types/contracts';
import { acts } from './acts';
import { dialogues } from './dialogues';
import { dragonForms } from './dragonForms';
import { encounters, enemies } from './enemies';
import { gear } from './gear';
import { fieldActions, heroes } from './heroes';
import { items } from './items';
import { quests } from './quests';
import { skills } from './skills';
import { spirits } from './spirits';
import { township } from './township';
import { fish, species } from './wildlife';
import { world } from './world';

export * as ids from './ids';
export { BUILDING, ENC, FLAG, NPC, QUEST, REGION, SPECIES, SPOT } from './ids';

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

const database: GameDatabase = {
  title: 'Emberwake: The Hollow Covenant',
  heroes,
  fieldActions,
  spirits,
  dragonForms,
  skills,
  enemies,
  encounters,
  gear,
  items,
  quests,
  dialogues,
  acts,
  world,
  township,
  species,
  fish,
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
    ],
    loadouts: {
      kael: { weapon: 'weapon.ashenBlade', armor: 'armor.travelLeathers' },
      tobin: { weapon: 'weapon.wardenLongbow', armor: 'armor.wardenCloak', relic: 'relic.tarnCharm' },
      vesna: { weapon: 'weapon.duelistGlaive', armor: 'armor.ringWraps' },
    },
    spirits: ['ashka', 'mirelle'],
    flags: {},
  },
};

export const gameData: GameDatabase = deepFreeze(database);
export default gameData;
