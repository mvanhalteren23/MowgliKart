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

/** Personal chain ids (`QuestDef.chain.id`). */
export const CHAIN = {
  kael: 'chain.kael', tobin: 'chain.tobin', vesna: 'chain.vesna', orla: 'chain.orla', hadrik: 'chain.hadrik',
  pim: 'chain.pim', quill: 'chain.quill', moss: 'chain.moss', sable: 'chain.sable',
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
  prologueDone: 'act1.prologue',
  shadeHeard: 'prologue.shadeHeard',
  /** Set by the Act III caldera chapter: unlocks Kael's apex dragon form. */
  sovereign: 'story.sovereignAwakened',
  finale: 'story.stillFlameFallen',
} as const;

/** Main story chapters, one per story-graph node, in play order. */
export const MAIN = {
  prologue: 'main.ashfallHollow',
  ledger: 'main.lanternwickLedger',
  galecrest: 'main.chimesOfGalecrest',
  marrowgate: 'main.siegeOfMarrowgate',
  mirefast: 'main.drownedAbbey',
  saffrane: 'main.ledgerHallOfSaffrane',
  hollowroot: 'main.fellingOfHollowroot',
  rimefold: 'main.reliquaryOfRime',
  emberdeep: 'main.kilnworks',
  greyspire: 'main.theStillFlame',
} as const;

/** Investigation quests (Act II, non-linear). */
export const INV = {
  saltLedgers: 'investigation.saltLedgers',
  stilledChoir: 'investigation.stilledChoir',
  ashenRoad: 'investigation.ashenRoad',
  greyspireWorks: 'investigation.greyspireWorks',
  hierophant: 'investigation.hierophantsName',
} as const;

/** Traversal gates the engine / UI may reference. */
export const GATE = {
  fallenPass: 'gate.fallenPass',
  mireFord: 'gate.mireFord',
  sunderedGorge: 'gate.sunderedGorge',
  dustGorge: 'gate.dustGorge',
  rimepineGrove: 'gate.rimepineGrove',
  calderaSeal: 'gate.calderaSeal',
  frostScarp: 'gate.frostScarp',
  hierophantVeil: 'gate.hierophantVeil',
  greyfordRockfall: 'gate.greyfordRockfall',
  ashfallVault: 'gate.ashfallVault',
  galecrestUpdraft: 'gate.galecrestUpdraft',
  galecrestLedge: 'gate.galecrestLedge',
  quarryRubble: 'gate.quarryRubble',
  willowKnot: 'gate.willowKnot',
  abbeyGap: 'gate.abbeyGap',
  duneVault: 'gate.duneVault',
  oasisChannel: 'gate.oasisChannel',
  foamRapids: 'gate.foamRapids',
  heartGrove: 'gate.heartGrove',
  crevasse: 'gate.crevasse',
} as const;
