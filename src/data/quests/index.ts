import type { QuestDef } from '@/types/contracts';
import { debtsOfTheCinderRing, embersOfTheClan } from './companion';
import { investigations } from './investigations';
import { lanternwickLedger } from './main';
import { frontierAnvil, hearthTimber } from './township';

/** Slice-era quests (frontier chunk). Campaign chapters contribute the rest via `src/data/campaign`. */
export const sliceQuests: readonly QuestDef[] = [lanternwickLedger, embersOfTheClan, debtsOfTheCinderRing, hearthTimber, frontierAnvil];
export { investigations };
