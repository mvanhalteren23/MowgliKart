import type { QuestDef } from '@/types/contracts';
import { accepted, defeated, fieldDone, flagIs, liberated, obtained, questIs } from '../conditions';
import { ENC, FLAG, MAIN, NPC, QUEST, REGION } from '../ids';

export const lanternwickLedger: QuestDef = {
  id: QUEST.ledger,
  title: 'The Lanternwick Ledger',
  kind: 'main',
  act: 1,
  giver: NPC.maren,
  summary:
    'Forty sacks of tithe-grain left Lanternwick and never reached the Covenant. Now Brother Caul says the settlers owe it twice. Elder Maren wants the truth before winter does.',
  chronicle: {
    HIDDEN: '',
    DISCOVERED: 'Elder Maren has been watching the road south for three days. Something about the tithe is wrong.',
    ACTIVE: 'The tithe-grain vanished between Lanternwick and the Greyford post. Kael has agreed to follow the ledger wherever it leads.',
    COMPLETED:
      'The true ledger page named the thief: the Covenant itself. Deacon Vash is broken, the Greyford tithe-post is free, and the grain is coming home. The Still Flame will not forgive it.',
  },
  // Chapter 2 of the story graph: opens once the Ashfall prologue is done.
  discoverWhen: questIs(MAIN.prologue, 'COMPLETED'),
  activateWhen: accepted(QUEST.ledger),
  objectives: [
    {
      id: 'askMiller',
      text: 'Ask Wenna the miller what happened to the tithe-grain.',
      completeWhen: flagIs(FLAG.millerHeard),
      marker: { x: 102, z: 90 },
    },
    {
      id: 'questionCaul',
      text: 'Question Brother Caul at the Covenant chapel about the ledger.',
      revealWhen: flagIs(FLAG.millerHeard),
      completeWhen: flagIs(FLAG.caulQuestioned),
      marker: { x: 64, z: 58 },
    },
    {
      id: 'revealWitness',
      text: 'Use Kael\'s Drake-Sight along the grain road to find whoever is hiding there.',
      revealWhen: flagIs(FLAG.caulQuestioned),
      completeWhen: fieldDone('drakeSight', NPC.pell),
      marker: { x: 124, z: 110 },
    },
    {
      id: 'hearWitness',
      text: 'Hear out the frightened carter.',
      revealWhen: fieldDone('drakeSight', NPC.pell),
      completeWhen: flagIs(FLAG.witnessHeard),
      marker: { x: 124, z: 110 },
    },
    {
      id: 'stopWagon',
      text: 'Stop the Covenant tithe wagon on the grain road.',
      revealWhen: flagIs(FLAG.witnessHeard),
      completeWhen: defeated(ENC.wagon),
      marker: { x: 150, z: 154 },
    },
    {
      id: 'recoverPage',
      text: 'Recover the true ledger page from the wagon-captain.',
      revealWhen: flagIs(FLAG.witnessHeard),
      completeWhen: obtained('item.trueLedgerPage'),
      marker: { x: 150, z: 154 },
    },
    {
      id: 'liberatePost',
      text: 'Confront Deacon Vash and liberate the Greyford tithe-post.',
      revealWhen: obtained('item.trueLedgerPage'),
      completeWhen: liberated(REGION.tithePost),
      marker: { x: 170, z: 196 },
    },
  ],
  rewards: [
    { type: 'xp', amount: 220 },
    { type: 'coin', amount: 150 },
    { type: 'item', itemId: 'item.hiTonic', qty: 2 },
    { type: 'flag', key: FLAG.act1Complete, value: true },
  ],
};
