/**
 * Canonical ids the app / engine / tests may reference by name.
 * Content modules use these constants so a typo is a compile error.
 */
export const NPC = {
  maren: 'npc.elderMaren',
  caul: 'npc.brotherCaul',
  wenna: 'npc.wennaMiller',
  pell: 'npc.pellWitness',
  bram: 'npc.carpenterBram',
  isolde: 'npc.hermitIsolde',
  nell: 'npc.fisherNell',
  drava: 'npc.ringmasterDrava',
  odo: 'npc.harbormasterOdo',
  gilda: 'npc.smithGilda',
  barge: 'npc.brinefolkMerchant',
  lark: 'npc.surveyorLark',
  thessaly: 'npc.wayfarerThessaly',
} as const;

export const REGION = {
  lanternwick: 'lanternwick',
  saltmarket: 'saltmarket',
  hearthstead: 'hearthstead',
  bramblemeadow: 'bramblemeadow',
  tarn: 'mirrortarn',
  tithePost: 'greyfordTithePost',
} as const;

export const ENC = {
  thornwolves: 'enc.thornwolfPack',
  wisps: 'enc.stilledWisps',
  shoreclaws: 'enc.shoreclaws',
  wagon: 'enc.titheWagonGuards',
  tithePost: 'enc.tithePostDeacon',
  cinderRing: 'enc.cinderRingBout',
} as const;

export const QUEST = {
  ledger: 'main.lanternwickLedger',
  embers: 'companion.embersOfTheClan',
  debts: 'companion.debtsOfTheCinderRing',
  timber: 'township.hearthTimber',
  anvil: 'township.frontierAnvil',
  saltLedgers: 'investigation.saltLedgers',
  stilledChoir: 'investigation.stilledChoir',
  ashenRoad: 'investigation.ashenRoad',
  stillFlame: 'main.theStillFlame',
} as const;

export const SPOT = {
  tarnShore: 'spot.tarnShore',
  pier: 'spot.saltmarketPier',
  drownedShrine: 'spot.drownedShrine',
} as const;

export const SPECIES = {
  deer: 'ashdeer',
  boar: 'bristleboar',
  hare: 'thistlehare',
  grouse: 'reedgrouse',
} as const;

export const BUILDING = {
  carpentry: 'building.carpentry',
  smithy: 'building.smithy',
} as const;

/** Flags set by authored dialogue (`setFlag`) or building completion. */
export const FLAG = {
  millerHeard: 'ledger.millerHeard',
  caulQuestioned: 'ledger.caulQuestioned',
  witnessHeard: 'ledger.witnessHeard',
  embersReturned: 'embers.returned',
  ashkaRemembers: 'lore.ashkaRemembers',
  debtsPaid: 'debts.bloodPricePaid',
  debtsCleared: 'debts.cleared',
  carpentry: 'township.carpentry',
  smithy: 'township.smithy',
  act1Complete: 'act1.complete',
  act2Open: 'act2.open',
} as const;
