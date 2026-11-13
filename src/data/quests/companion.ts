import type { QuestDef } from '@/types/contracts';
import { accepted, any, defeated, fieldDone, flagIs, talked } from '../conditions';
import { ENC, FLAG, NPC, QUEST, SPECIES, SPOT } from '../ids';

export const embersOfTheClan: QuestDef = {
  id: QUEST.embers,
  title: 'Embers of the Clan',
  kind: 'companion',
  act: 1,
  companion: 'kael',
  giver: NPC.isolde,
  summary:
    'Old Isolde kept the Ashen Drake clan\'s hearth before the burning. She swears the clan sank its mourning-horn in Mirror Tarn — somewhere only drake-eyes can find.',
  chronicle: {
    HIDDEN: '',
    DISCOVERED: 'A hermit by Mirror Tarn knew Kael\'s mother. She asked him to come back when he was ready to listen.',
    ACTIVE: 'The clan\'s drowned shrine lies in Mirror Tarn, glamoured from ordinary sight. Kael must see it, then fish what the clan left there.',
    COMPLETED:
      'From the drowned shrine Kael drew an ember-scale and, behind it, the Wyrm\'s Lament. Ashka spoke his mother\'s name for the first time in twenty years.',
  },
  discoverWhen: any(talked(NPC.isolde), accepted(QUEST.embers)),
  activateWhen: accepted(QUEST.embers),
  objectives: [
    {
      id: 'seeShrine',
      text: 'Use Drake-Sight on the west shore of Mirror Tarn to reveal the drowned shrine.',
      completeWhen: fieldDone('drakeSight', SPOT.drownedShrine),
      marker: { x: 131, z: 44 },
    },
    {
      id: 'fishShrine',
      text: 'Fish at the drowned shrine (Kael).',
      revealWhen: fieldDone('drakeSight', SPOT.drownedShrine),
      completeWhen: fieldDone('fish', SPOT.drownedShrine),
      marker: { x: 131, z: 44 },
    },
    {
      id: 'returnIsolde',
      text: 'Bring what you found back to Isolde.',
      revealWhen: fieldDone('fish', SPOT.drownedShrine),
      completeWhen: flagIs(FLAG.embersReturned),
      marker: { x: 161, z: 70 },
    },
  ],
  rewards: [
    { type: 'gear', gearId: 'relic.wyrmsLament' },
    { type: 'item', itemId: 'item.emberScale', qty: 1 },
    { type: 'xp', amount: 120 },
    { type: 'flag', key: FLAG.ashkaRemembers, value: true },
  ],
};

export const debtsOfTheCinderRing: QuestDef = {
  id: QUEST.debts,
  title: 'Debts of the Cinder Ring',
  kind: 'companion',
  act: 1,
  companion: 'vesna',
  giver: NPC.drava,
  summary:
    'Ringmaster Drava holds Vesna\'s marker: one more bout, plus a blood-price in fresh game for the arena kitchens. Pay both and the debt is ash.',
  chronicle: {
    HIDDEN: '',
    DISCOVERED: 'Ringmaster Drava has been asking around Saltmarket for Vesna.',
    ACTIVE: 'Drava wants a bristleboar run down by hand — no arrows — and then one last bout in the Cinder Ring.',
    COMPLETED: 'Vesna beat Halvard the Unbowed in front of half of Saltmarket. Drava burned the marker and threw in the Cinder Ring Talon.',
  },
  discoverWhen: any(talked(NPC.drava), accepted(QUEST.debts)),
  activateWhen: accepted(QUEST.debts),
  objectives: [
    {
      id: 'dashBoar',
      text: 'Run down a bristleboar in Bramblemeadow with Vesna\'s Glaive Dash.',
      completeWhen: fieldDone('huntDash', SPECIES.boar),
      marker: { x: 62, z: 190 },
    },
    {
      id: 'payBloodPrice',
      text: 'Deliver the blood-price to Ringmaster Drava.',
      revealWhen: fieldDone('huntDash', SPECIES.boar),
      completeWhen: flagIs(FLAG.debtsPaid),
      marker: { x: 182, z: 148 },
    },
    {
      id: 'winBout',
      text: 'Win the bout in the Cinder Ring.',
      revealWhen: flagIs(FLAG.debtsPaid),
      completeWhen: defeated(ENC.cinderRing),
      marker: { x: 196, z: 162 },
    },
    {
      id: 'burnMarker',
      text: 'Watch Drava burn the marker.',
      revealWhen: defeated(ENC.cinderRing),
      completeWhen: flagIs(FLAG.debtsCleared),
      marker: { x: 182, z: 148 },
    },
  ],
  rewards: [
    { type: 'gear', gearId: 'sig.cinderRingTalon' },
    { type: 'coin', amount: 80 },
    { type: 'xp', amount: 100 },
  ],
};
