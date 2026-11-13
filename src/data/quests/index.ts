import type { QuestDef } from '@/types/contracts';
import { debtsOfTheCinderRing, embersOfTheClan } from './companion';
import { ashenRoad, saltLedgers, stilledChoir } from './investigations';
import { lanternwickLedger, theStillFlame } from './main';
import { frontierAnvil, hearthTimber } from './township';

export const quests: readonly QuestDef[] = [
  lanternwickLedger,
  embersOfTheClan,
  debtsOfTheCinderRing,
  hearthTimber,
  frontierAnvil,
  saltLedgers,
  stilledChoir,
  ashenRoad,
  theStillFlame,
];
