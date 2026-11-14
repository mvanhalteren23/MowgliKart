import type { EncounterZoneDef, FishingSpotDef, NpcDef, PropDef, RegionDef, WorldMapDef } from '@/types/contracts';
import {
  all, always, built, defeated, fieldDone, flagIs, liberated, not, obtained, questAtLeast, questIs, recruited,
} from './conditions';
import { BUILDING, ENC, FLAG, MAIN, NPC, QUEST, REGION, SPECIES, SPOT } from './ids';

/*
 * One 250 × 250 m chunk. +x east, +z south.
 *
 *   NW-centre  Lanternwick (home)          N-centre  Mirror Tarn (lake)
 *   E coast    Saltmarket + Cinder Ring    sea along the whole east edge
 *   SW         Bramblemeadow (hunting)     S         Hearthstead (township)
 *   SE inland  Greyford tithe-post (Covenant-occupied)
 */

export const regions: readonly RegionDef[] = [
  { id: REGION.lanternwick, name: 'Lanternwick', biome: 'frontier', center: { x: 80, z: 72 }, radius: 34, occupied: false,
    blurb: 'A lantern-lit frontier town of millers and wardens, tithing more every season.' },
  { id: REGION.tarn, name: 'Mirror Tarn', biome: 'frontier', center: { x: 148, z: 56 }, radius: 30, occupied: false,
    blurb: 'A still, cold lake. The Ashen Drake clan drowned their secrets here.' },
  { id: REGION.saltmarket, name: 'Saltmarket', biome: 'coast', center: { x: 198, z: 124 }, radius: 34, occupied: false,
    blurb: 'Fish-scale port on the eastern sea, home of the Cinder Ring arena.' },
  { id: REGION.bramblemeadow, name: 'Bramblemeadow', biome: 'forest', center: { x: 52, z: 165 }, radius: 38, occupied: false,
    blurb: 'Bracken, birch and game trails. Mind the wind.' },
  { id: REGION.hearthstead, name: 'Hearthstead', biome: 'frontier', center: { x: 112, z: 206 }, radius: 28, occupied: false,
    blurb: 'Three staked plots and a campfire. Someday, a village.' },
  { id: REGION.tithePost, name: 'Greyford Tithe-Post', biome: 'highland', center: { x: 172, z: 200 }, radius: 20, occupied: true,
    blurb: 'A Covenant granary-fort squatting on the ford. Grain goes in; nothing comes out.' },
];

export const water: WorldMapDef['water'] = [
  { center: { x: 148, z: 52 }, radius: 16, kind: 'lake' },
  { center: { x: 305, z: 40 }, radius: 75, kind: 'sea' },
  { center: { x: 300, z: 125 }, radius: 70, kind: 'sea' },
  { center: { x: 305, z: 210 }, radius: 75, kind: 'sea' },
];

export const paths: WorldMapDef['paths'] = [
  // Lanternwick → Mirror Tarn → Saltmarket
  { points: [{ x: 84, z: 74 }, { x: 118, z: 76 }, { x: 140, z: 84 }, { x: 170, z: 94 }, { x: 198, z: 118 }], width: 3.5 },
  // The grain road: Lanternwick → Greyford tithe-post
  { points: [{ x: 90, z: 86 }, { x: 112, z: 102 }, { x: 136, z: 126 }, { x: 150, z: 156 }, { x: 168, z: 192 }], width: 3 },
  // South road: Lanternwick → Hearthstead
  { points: [{ x: 78, z: 92 }, { x: 82, z: 130 }, { x: 96, z: 170 }, { x: 108, z: 200 }], width: 3 },
  // Hearthstead → tithe-post → Saltmarket
  { points: [{ x: 112, z: 206 }, { x: 145, z: 210 }, { x: 170, z: 198 }, { x: 184, z: 170 }, { x: 196, z: 140 }, { x: 198, z: 122 }], width: 3 },
  // Saltmarket pier
  { points: [{ x: 198, z: 118 }, { x: 224, z: 114 }], width: 2.5 },
  // Meadow trail
  { points: [{ x: 82, z: 130 }, { x: 58, z: 148 }, { x: 44, z: 160 }], width: 2 },
  // Chapel lane
  { points: [{ x: 84, z: 74 }, { x: 64, z: 56 }], width: 2.5 },
];

export const props: readonly PropDef[] = [
  // Lanternwick
  { kind: 'chapel', position: { x: 62, z: 50 }, tint: '#d8d2c4' },
  { kind: 'house', position: { x: 95, z: 62 } },
  { kind: 'house', position: { x: 66, z: 72 }, rotation: 0.3 },
  { kind: 'house', position: { x: 72, z: 96 }, rotation: -0.2 },
  { kind: 'house', position: { x: 108, z: 95 }, tint: '#c9a46b', scale: 1.2 }, // the mill
  { kind: 'well', position: { x: 82, z: 78 } },
  { kind: 'lantern', position: { x: 76, z: 82 } },
  { kind: 'lantern', position: { x: 92, z: 82 } },
  { kind: 'sign', position: { x: 100, z: 78 } },
  { kind: 'stall', position: { x: 78, z: 62 } },
  { kind: 'fence', position: { x: 50, z: 86 }, rotation: 1.57 },
  // Mirror Tarn
  { kind: 'shrine', position: { x: 126, z: 34 }, tint: '#8a6a5a' }, // the drowned clan shrine's shore-stone
  { kind: 'campfire', position: { x: 166, z: 76 } }, // Isolde's camp
  { kind: 'sign', position: { x: 138, z: 82 } },
  // Saltmarket
  { kind: 'dock', position: { x: 224, z: 114 }, rotation: 0.1 },
  { kind: 'dock', position: { x: 226, z: 130 }, rotation: -0.1 },
  { kind: 'house', position: { x: 190, z: 103 } },
  { kind: 'house', position: { x: 206, z: 95 }, tint: '#b8c4cc' },
  { kind: 'house', position: { x: 214, z: 136 } },
  { kind: 'stall', position: { x: 196, z: 118 }, tint: '#d96c4f' },
  { kind: 'stall', position: { x: 205, z: 123 }, tint: '#4f8fd9' },
  { kind: 'arena', position: { x: 196, z: 164 }, scale: 2.2 },
  { kind: 'lantern', position: { x: 186, z: 128 } },
  { kind: 'well', position: { x: 201, z: 110 } },
  // Hearthstead
  { kind: 'campfire', position: { x: 112, z: 208 } },
  { kind: 'fence', position: { x: 88, z: 206 }, rotation: 1.57 },
  { kind: 'fence', position: { x: 136, z: 206 }, rotation: 1.57 },
  { kind: 'sign', position: { x: 114, z: 186 } },
  { kind: 'ruin', position: { x: 130, z: 226 } },
  // Greyford tithe-post
  { kind: 'chapel', position: { x: 180, z: 208 }, tint: '#9aa0a6', scale: 1.3 },
  { kind: 'fence', position: { x: 162, z: 188 } },
  { kind: 'lantern', position: { x: 184, z: 192 }, tint: '#e8f0ff' },
  // Bramblemeadow
  { kind: 'ruin', position: { x: 28, z: 140 } },
  { kind: 'campfire', position: { x: 70, z: 168 } },
  { kind: 'shrine', position: { x: 38, z: 212 }, tint: '#b8f0c8' }, // Zephra's sealed shrine
  // Grain road
  { kind: 'sign', position: { x: 132, z: 120 } },
  { kind: 'ruin', position: { x: 160, z: 142 } },
];

export const npcs: readonly NpcDef[] = [
  {
    id: NPC.maren, name: 'Elder Maren', role: 'Reeve of Lanternwick', sprite: 'npc.elder', position: { x: 88, z: 71 },
    dialogues: [
      { when: questIs(QUEST.ledger, 'COMPLETED'), dialogueId: 'dlg.maren.done' },
      { when: questIs(QUEST.ledger, 'ACTIVE'), dialogueId: 'dlg.maren.active' },
      { when: questIs(MAIN.prologue, 'DISCOVERED'), dialogueId: 'dlg.maren.prologue' },
      { when: questIs(MAIN.prologue, 'ACTIVE'), dialogueId: 'dlg.maren.prologueHint' },
      { when: always, dialogueId: 'dlg.maren.offer' },
    ],
  },
  {
    id: NPC.wenna, name: 'Wenna', role: 'Miller', sprite: 'npc.miller', position: { x: 102, z: 89 },
    dialogues: [
      { when: all(questIs(QUEST.ledger, 'ACTIVE'), not(flagIs(FLAG.millerHeard))), dialogueId: 'dlg.wenna.ledger' },
      { when: flagIs(FLAG.millerHeard), dialogueId: 'dlg.wenna.after' },
      { when: always, dialogueId: 'dlg.wenna.idle' },
    ],
  },
  {
    id: NPC.caul, name: 'Brother Caul', role: 'Covenant tithe-collector', sprite: 'npc.covenantMonk', position: { x: 66, z: 58 },
    dialogues: [
      { when: liberated(REGION.tithePost), dialogueId: 'dlg.caul.humbled' },
      { when: all(questIs(QUEST.ledger, 'ACTIVE'), flagIs(FLAG.millerHeard), not(flagIs(FLAG.caulQuestioned))), dialogueId: 'dlg.caul.ledger' },
      { when: always, dialogueId: 'dlg.caul.sermon' },
    ],
  },
  {
    id: NPC.pell, name: 'Pell', role: 'Missing carter', sprite: 'npc.carter', position: { x: 124, z: 110 },
    hiddenUntilDrakeSight: true,
    presentWhen: all(flagIs(FLAG.caulQuestioned), not(liberated(REGION.tithePost))),
    dialogues: [
      { when: flagIs(FLAG.witnessHeard), dialogueId: 'dlg.pell.after' },
      { when: always, dialogueId: 'dlg.pell.confess' },
    ],
  },
  {
    id: NPC.bram, name: 'Bram', role: 'Carpenter', sprite: 'npc.carpenter', position: { x: 58, z: 80 },
    dialogues: [
      { when: recruited(NPC.bram), dialogueId: 'dlg.bram.township' },
      { when: questAtLeast(QUEST.timber, 'ACTIVE'), dialogueId: 'dlg.bram.ready' },
      { when: always, dialogueId: 'dlg.bram.idle' },
    ],
  },
  {
    id: NPC.isolde, name: 'Isolde', role: 'Hermit of the tarn', sprite: 'npc.hermit', position: { x: 161, z: 70 },
    dialogues: [
      { when: questIs(QUEST.embers, 'COMPLETED'), dialogueId: 'dlg.isolde.after' },
      { when: all(questIs(QUEST.embers, 'ACTIVE'), fieldDone('fish', SPOT.drownedShrine)), dialogueId: 'dlg.isolde.return' },
      { when: questIs(QUEST.embers, 'ACTIVE'), dialogueId: 'dlg.isolde.hint' },
      { when: always, dialogueId: 'dlg.isolde.offer' },
    ],
  },
  {
    id: NPC.nell, name: 'Nell', role: 'Tarn fisher', sprite: 'npc.fisher', position: { x: 140, z: 72 },
    dialogues: [
      { when: questIs(QUEST.embers, 'ACTIVE'), dialogueId: 'dlg.nell.shrine' },
      { when: always, dialogueId: 'dlg.nell.tips' },
    ],
  },
  {
    id: NPC.drava, name: 'Drava', role: 'Ringmaster of the Cinder Ring', sprite: 'npc.ringmaster', position: { x: 182, z: 148 },
    dialogues: [
      { when: questIs(QUEST.debts, 'COMPLETED'), dialogueId: 'dlg.drava.after' },
      { when: all(questIs(QUEST.debts, 'ACTIVE'), defeated(ENC.cinderRing)), dialogueId: 'dlg.drava.burn' },
      { when: all(questIs(QUEST.debts, 'ACTIVE'), flagIs(FLAG.debtsPaid)), dialogueId: 'dlg.drava.rematch' },
      { when: all(questIs(QUEST.debts, 'ACTIVE'), fieldDone('huntDash', SPECIES.boar)), dialogueId: 'dlg.drava.tribute' },
      { when: questIs(QUEST.debts, 'ACTIVE'), dialogueId: 'dlg.drava.hint' },
      { when: always, dialogueId: 'dlg.drava.offer' },
    ],
  },
  {
    id: NPC.odo, name: 'Odo', role: 'Harbormaster', sprite: 'npc.harbormaster', position: { x: 212, z: 110 },
    dialogues: [
      { when: all(questIs(QUEST.ledger, 'COMPLETED'), not(flagIs('clue:harbourBooks'))), dialogueId: 'dlg.odo.books' },
      { when: obtained('item.fish.lanternEel'), dialogueId: 'dlg.odo.barge' },
      { when: always, dialogueId: 'dlg.odo.harbour' },
    ],
  },
  {
    id: NPC.gilda, name: 'Gilda', role: 'Blacksmith', sprite: 'npc.smith', position: { x: 186, z: 114 },
    dialogues: [
      { when: recruited(NPC.gilda), dialogueId: 'dlg.gilda.township' },
      { when: all(questAtLeast(QUEST.anvil, 'ACTIVE'), defeated(ENC.wagon)), dialogueId: 'dlg.gilda.ready' },
      { when: questAtLeast(QUEST.anvil, 'ACTIVE'), dialogueId: 'dlg.gilda.wary' },
      { when: always, dialogueId: 'dlg.gilda.idle' },
    ],
  },
  {
    id: NPC.barge, name: 'Brinefolk Trader', role: 'Barge merchant', sprite: 'npc.brinefolk', position: { x: 226, z: 100 },
    presentWhen: obtained('item.fish.lanternEel'),
    dialogues: [
      { when: not(flagIs('clue:bargeManifest')), dialogueId: 'dlg.barge.manifest' },
      { when: always, dialogueId: 'dlg.barge.hello' },
    ],
  },
  {
    id: NPC.lark, name: 'Lark', role: 'Surveyor of Hearthstead', sprite: 'npc.surveyor', position: { x: 112, z: 196 },
    dialogues: [
      { when: all(built(BUILDING.carpentry), built(BUILDING.smithy)), dialogueId: 'dlg.lark.built' },
      { when: questAtLeast(QUEST.timber, 'ACTIVE'), dialogueId: 'dlg.lark.progress' },
      { when: always, dialogueId: 'dlg.lark.offer' },
    ],
  },
  {
    id: NPC.thessaly, name: 'Thessaly', role: 'Wayfarer', sprite: 'npc.wayfarer', position: { x: 196, z: 133 },
    dialogues: [
      { when: flagIs(FLAG.act1Complete), dialogueId: 'dlg.thessaly.act2' },
      { when: always, dialogueId: 'dlg.thessaly.idle' },
    ],
  },
];

export const encounterZones: readonly EncounterZoneDef[] = [
  { id: 'zone.meadowWolves', encounterId: ENC.thornwolves, position: { x: 36, z: 126 }, radius: 7, sprite: 'enemy.beast.thornwolf', once: false },
  { id: 'zone.tarnWisps', encounterId: ENC.wisps, position: { x: 118, z: 24 }, radius: 6, sprite: 'enemy.wisp.stilled', once: false },
  { id: 'zone.shoreclaws', encounterId: ENC.shoreclaws, position: { x: 220, z: 160 }, radius: 6, sprite: 'enemy.beast.shoreclaw', once: false },
  {
    id: 'zone.titheWagon', encounterId: ENC.wagon, position: { x: 150, z: 154 }, radius: 6, sprite: 'enemy.humanoid.wagonCaptain', once: true,
    presentWhen: flagIs(FLAG.witnessHeard),
  },
  {
    id: 'zone.tithePost', encounterId: ENC.tithePost, position: { x: 170, z: 196 }, radius: 7, sprite: 'enemy.humanoid.deaconVash', once: true,
    presentWhen: obtained('item.trueLedgerPage'),
  },
];

export const fishingSpots: readonly FishingSpotDef[] = [
  { id: SPOT.tarnShore, name: 'Mirror Tarn — east shore', position: { x: 154, z: 70 }, fish: ['fish.tarnPerch', 'fish.reedPike', 'fish.ashfinKoi'] },
  {
    id: SPOT.pier, name: 'Saltmarket Pier', position: { x: 229, z: 114 },
    fish: ['fish.silverHerring', 'fish.brineSnapper', 'fish.lanternEel'], merchantFish: 'fish.lanternEel',
  },
  {
    id: SPOT.drownedShrine, name: 'The Drowned Shrine', position: { x: 131, z: 44 }, hiddenUntilDrakeSight: true,
    fish: ['fish.tarnPerch', 'fish.ashfinKoi', 'fish.cinderwyrmGar'],
  },
];

/** The Lanternwick frontier chunk (0, 0) as authored for the slice; `src/data/campaign` adds the rest of the continent. */
export const sliceWorld = { seed: 0x4e6b_3a17, playerStart: { x: 82, z: 86 }, regions, props, npcs, encounterZones, fishingSpots, paths, water } as const;
