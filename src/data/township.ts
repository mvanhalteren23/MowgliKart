import type { BuildingUpgradeDef, TownshipDef } from '@/types/contracts';
import { all, defeated, questAtLeast, questIs } from './conditions';
import { BUILDING, ENC, FLAG, MAIN, NPC, QUEST, REGION } from './ids';

const up = (
  level: 2 | 3, building: string, name: string, description: string, coin: number,
  items: readonly (readonly [string, number])[], perk: string, extra: Partial<Pick<BuildingUpgradeDef, 'requires' | 'requirementText'>> = {},
): BuildingUpgradeDef => ({
  level, name, description, perk,
  cost: { coin, items: items.map(([itemId, qty]) => ({ itemId, qty })) },
  unlocksFlag: `${building}.${level}`,
  propScale: level === 2 ? 1.25 : 1.5,
  ...extra,
});

/**
 * Hearthstead grows with the campaign: six residents found across the continent, six workshops,
 * each with two architectural upgrades. Level 3 always waits on a story chapter.
 */
export const township: TownshipDef = {
  name: 'Hearthstead',
  regionId: REGION.hearthstead,
  plots: [
    { id: 'plot.hearthNorth', name: 'North Plot', position: { x: 98, z: 194 }, accepts: [BUILDING.carpentry, BUILDING.smithy, 'building.apothecary'] },
    { id: 'plot.hearthEast', name: 'East Plot (windward)', position: { x: 126, z: 198 }, accepts: [BUILDING.carpentry, BUILDING.smithy, 'building.lodge'] },
    { id: 'plot.hearthSouth', name: 'South Plot', position: { x: 104, z: 222 }, accepts: [BUILDING.carpentry, 'building.fishery'] },
    { id: 'plot.hearthWest', name: 'West Plot', position: { x: 88, z: 216 }, accepts: ['building.apothecary', 'building.lodge', 'building.fishery', 'building.reliquary'] },
    { id: 'plot.hearthMill', name: 'Mill Plot', position: { x: 120, z: 230 }, accepts: ['building.apothecary', 'building.lodge', 'building.reliquary'] },
    { id: 'plot.hearthBrook', name: 'Brook Plot', position: { x: 136, z: 216 }, accepts: ['building.fishery', 'building.reliquary', 'building.lodge'] },
    { id: 'plot.hearthHill', name: 'Hill Plot', position: { x: 96, z: 182 }, accepts: [BUILDING.carpentry, BUILDING.smithy, 'building.apothecary', 'building.lodge', 'building.fishery', 'building.reliquary'] },
  ],
  buildings: [
    {
      id: BUILDING.carpentry, name: 'Carpentry',
      description: 'Bram\'s sawpit and workshop. Every other building in Hearthstead starts here.',
      prop: 'house', requiresRecruit: NPC.bram,
      cost: { coin: 60, items: [{ itemId: 'item.softHide', qty: 2 }, { itemId: 'item.wolfPelt', qty: 1 }] },
      unlocksFlag: FLAG.carpentry,
      perk: 'Bram repairs fences and builds the next workshop at a discount.',
      upgrades: [
        up(2, FLAG.carpentry, 'Timber Yard', 'A covered yard for seasoning beams.', 180, [['item.softHide', 3], ['item.ibexHorn', 2]],
          'Bram\'s crews raise later workshops faster; Hearthstead gains a watchtower.'),
        up(3, FLAG.carpentry, 'Master Joinery', 'Heartwood, given freely, joined without a single nail.', 600, [['item.heartwoodResin', 3], ['item.duneHide', 2]],
          'Hearthstead\'s roofs stand against any storm; the township square gets a covered market.',
          { requires: questIs(MAIN.hollowroot, 'COMPLETED'), requirementText: 'Save the Heartwood of Hollowroot first.' }),
      ],
    },
    {
      id: BUILDING.smithy, name: 'Smithy',
      description: 'Gilda\'s forge, built where the wind feeds the fire.',
      prop: 'house', requiresRecruit: NPC.gilda,
      cost: { coin: 90, items: [{ itemId: 'item.covenantIron', qty: 2 }, { itemId: 'item.boarTusk', qty: 1 }] },
      unlocksFlag: FLAG.smithy,
      perk: 'Gilda reforges Covenant iron into gear for the party.',
      upgrades: [
        up(2, FLAG.smithy, 'Bastion Forge', 'A second hearth and a bellows big enough to sleep in.', 260, [['item.bastionSteel', 3], ['item.cinderglass', 2]],
          'Gilda tempers blades with cinderglass: weapons hold an edge through Act II.'),
        up(3, FLAG.smithy, 'Sunglass Forge', 'Saffrane sunglass focuses the forge into a white point.', 700, [['item.sunGlass', 3], ['item.bogIron', 3]],
          'Gilda can work Covenant plate into armour for the whole party.',
          { requires: questIs(MAIN.saffrane, 'COMPLETED'), requirementText: 'Open the Ledger Hall of Saffrane first.' }),
      ],
    },
    {
      id: 'building.apothecary', name: 'Apothecary',
      description: 'Sorrel\'s stillroom, smelling of galeleaf and good intentions.',
      prop: 'windmill', requiresRecruit: 'npc.herbalistSorrel',
      cost: { coin: 150, items: [{ itemId: 'item.galeFeather', qty: 2 }, { itemId: 'item.mistVelvet', qty: 1 }] },
      unlocksFlag: 'township.apothecary',
      perk: 'Sorrel brews Hearth Tonics for the road.',
      upgrades: [
        up(2, 'township.apothecary', 'Stillroom', 'Copper stills and a drying loft.', 260, [['item.wispDust', 3], ['item.chimeShard', 2]],
          'Strong Hearth Tonics and Ember Draughts come into stock.'),
        up(3, 'township.apothecary', 'Galeleaf Conservatory', 'A glasshouse where spire-herbs grow at frontier altitude.', 650, [['item.frostCrystal', 2], ['item.thornstagAntler', 2]],
          'Sorrel distils Rekindling Ash from frost-crystal and antler.',
          { requires: questIs(MAIN.rimefold, 'COMPLETED'), requirementText: 'Open the Lantern Hall of the Rimefold first.' }),
      ],
    },
    {
      id: 'building.lodge', name: 'Hunting Lodge',
      description: 'Kestrel\'s lodge, with a wind-vane that never lies.',
      prop: 'tent', requiresRecruit: 'npc.trapperKestrel',
      cost: { coin: 180, items: [{ itemId: 'item.ibexHorn', qty: 2 }, { itemId: 'item.heathPlume', qty: 2 }] },
      unlocksFlag: 'township.lodge',
      perk: 'Kestrel posts the day\'s wind and where the herds are grazing.',
      upgrades: [
        up(2, 'township.lodge', 'Wind-Vane Lodge', 'A tall vane and a smoking-shed.', 300, [['item.thornstagAntler', 2], ['item.wolfPelt', 3]],
          'Hunters move more quietly: animals notice the party from a shorter distance.'),
        up(3, 'township.lodge', 'Warden\'s Hall', 'A hall where the frontier\'s wardens swear their oath.', 700, [['item.rimeFur', 3], ['item.duneHide', 2]],
          'Every hunt yields an extra hide; Tobin\'s oath is carved over the door.',
          { requires: questIs(MAIN.rimefold, 'COMPLETED'), requirementText: 'Open the Lantern Hall of the Rimefold first.' }),
      ],
    },
    {
      id: 'building.fishery', name: 'Net-Loft',
      description: 'Tamsin\'s loft of reed-silk nets, lures and patient advice.',
      prop: 'dock', requiresRecruit: 'npc.netweaverTamsin',
      cost: { coin: 200, items: [{ itemId: 'item.reedSilk', qty: 2 }, { itemId: 'item.fish.mireEel', qty: 1 }] },
      unlocksFlag: 'township.fishery',
      perk: 'Tamsin ties Cricket Lures and Silver Spoons.',
      upgrades: [
        up(2, 'township.fishery', 'Lure Workshop', 'A bench of hooks, feathers and tiny brass spinners.', 320, [['item.galeFeather', 2], ['item.fish.skyKoi', 1]],
          'Better lures: Ember Flies come into stock and rarer fish bite more often.'),
        up(3, 'township.fishery', 'Legend Loft', 'Where the trophy fish of nine biomes hang in honour.', 750, [['item.fish.auroraTrout', 1], ['item.frostCrystal', 2]],
          'Tamsin ties a fly that would tempt a legend — and tells you where the legends sleep.',
          { requires: questIs(MAIN.rimefold, 'COMPLETED'), requirementText: 'Open the Lantern Hall of the Rimefold first.' }),
      ],
    },
    {
      id: 'building.reliquary', name: 'Reliquary',
      description: 'Ansel\'s honest chapel of flickering candles, where relics are tempered in true flame.',
      prop: 'chapel', requiresRecruit: 'npc.chandlerAnsel',
      cost: { coin: 260, items: [{ itemId: 'item.marshWax', qty: 2 }, { itemId: 'item.sunGlass', qty: 1 }] },
      unlocksFlag: 'township.reliquary',
      perk: 'Ansel unmakes Covenant wax and frees the warmth inside.',
      upgrades: [
        up(2, 'township.reliquary', 'Tempering Hall', 'A forge of candles for relics that grow with their bearers.', 400, [['item.frostCrystal', 2], ['item.cinderglass', 3]],
          'Relic tempering: Ansel polishes each hero\'s relic until it hums.'),
        up(3, 'township.reliquary', 'Chapel of True Flame', 'A hearth lit from the Banked Flame of Emberdeep. It flickers on purpose.', 900, [['item.obsidianSlag', 3], ['item.heartwoodResin', 2]],
          'Wardens rest here between battles; the township hearth can never be stilled.',
          { requires: questIs(MAIN.emberdeep, 'COMPLETED'), requirementText: 'Douse the Kilnworks of Emberdeep first.' }),
      ],
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
    {
      npcId: 'npc.herbalistSorrel', trade: 'Herbalist',
      requires: questAtLeast('township.highWindHerbs', 'ACTIVE'),
      requirementText: 'Agree to bring Sorrel down from Galecrest.',
      townshipPosition: { x: 104, z: 204 },
      unlocksBuildings: ['building.apothecary'],
    },
    {
      npcId: 'npc.trapperKestrel', trade: 'Trapper',
      requires: questAtLeast('township.highLodge', 'ACTIVE'),
      requirementText: 'Agree to Kestrel\'s lodge on Cairnfield Moor.',
      townshipPosition: { x: 120, z: 214 },
      unlocksBuildings: ['building.lodge'],
    },
    {
      npcId: 'npc.netweaverTamsin', trade: 'Net-weaver',
      requires: questAtLeast('township.mireNets', 'ACTIVE'),
      requirementText: 'Agree to Tamsin\'s net-loft in Mirefast.',
      townshipPosition: { x: 100, z: 230 },
      unlocksBuildings: ['building.fishery'],
    },
    {
      npcId: 'npc.chandlerAnsel', trade: 'Chandler',
      requires: questAtLeast('township.unstilledCandles', 'ACTIVE'),
      requirementText: 'Agree to Ansel\'s reliquary in Saffrane.',
      townshipPosition: { x: 141, z: 202 },
      unlocksBuildings: ['building.reliquary'],
    },
  ],
};
