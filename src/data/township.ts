import type { TownshipDef } from '@/types/contracts';
import { all, defeated, questAtLeast } from './conditions';
import { BUILDING, ENC, FLAG, NPC, QUEST, REGION } from './ids';

export const township: TownshipDef = {
  name: 'Hearthstead',
  regionId: REGION.hearthstead,
  plots: [
    { id: 'plot.hearthNorth', name: 'North Plot', position: { x: 98, z: 194 }, accepts: [BUILDING.carpentry, BUILDING.smithy] },
    { id: 'plot.hearthEast', name: 'East Plot (windward)', position: { x: 126, z: 198 }, accepts: [BUILDING.carpentry, BUILDING.smithy] },
    { id: 'plot.hearthSouth', name: 'South Plot', position: { x: 104, z: 222 }, accepts: [BUILDING.carpentry] },
  ],
  buildings: [
    {
      id: BUILDING.carpentry, name: 'Carpentry',
      description: 'Bram\'s sawpit and workshop. Every other building in Hearthstead starts here.',
      prop: 'house', requiresRecruit: NPC.bram,
      cost: { coin: 60, items: [{ itemId: 'item.softHide', qty: 2 }, { itemId: 'item.wolfPelt', qty: 1 }] },
      unlocksFlag: FLAG.carpentry,
      perk: 'Bram repairs fences and builds the next workshop at a discount.',
    },
    {
      id: BUILDING.smithy, name: 'Smithy',
      description: 'Gilda\'s forge, built where the wind feeds the fire.',
      prop: 'house', requiresRecruit: NPC.gilda,
      cost: { coin: 90, items: [{ itemId: 'item.covenantIron', qty: 2 }, { itemId: 'item.boarTusk', qty: 1 }] },
      unlocksFlag: FLAG.smithy,
      perk: 'Gilda reforges Covenant iron into gear for the party.',
    },
  ],
  recruits: [
    {
      npcId: NPC.bram, trade: 'Carpenter',
      requires: questAtLeast(QUEST.timber, 'ACTIVE'),
      requirementText: 'Accept Lark\'s call to raise Hearthstead.',
      townshipPosition: { x: 92, z: 198 },
      unlocksBuildings: [BUILDING.carpentry],
    },
    {
      npcId: NPC.gilda, trade: 'Blacksmith',
      requires: all(questAtLeast(QUEST.anvil, 'ACTIVE'), defeated(ENC.wagon)),
      requirementText: 'Accept Lark\'s call and break the Covenant tithe wagon on the grain road.',
      townshipPosition: { x: 132, z: 192 },
      unlocksBuildings: [BUILDING.smithy],
    },
  ],
};
