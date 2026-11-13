import type { QuestDef } from '@/types/contracts';
import { accepted, all, flagIs, never, questAtLeast } from '../conditions';
import { FLAG, NPC, QUEST } from '../ids';

/**
 * Act II — non-linear Hollow Covenant investigations. Defined as data; they stay
 * HIDDEN in the slice because nothing sets `act2.open`.
 */
const act2Gate = all(flagIs(FLAG.act2Open), questAtLeast(QUEST.ledger, 'COMPLETED'));

export const saltLedgers: QuestDef = {
  id: QUEST.saltLedgers,
  title: 'Salt in the Ledgers',
  kind: 'investigation',
  act: 2,
  giver: NPC.thessaly,
  summary: 'Saltmarket\'s harbour tithes are recorded in two different inks. Someone is skimming twice.',
  chronicle: {
    HIDDEN: '',
    DISCOVERED: 'Thessaly heard the harbour clerk weeping over his own ledgers.',
    ACTIVE: 'Compare the harbour tithe-books against the Brinefolk manifests.',
    COMPLETED: 'The Covenant\'s skim funds something called the Greyspire Works.',
  },
  discoverWhen: act2Gate,
  activateWhen: accepted(QUEST.saltLedgers),
  objectives: [
    { id: 'harbourBooks', text: 'Get a look at the harbour tithe-books.', completeWhen: never },
    { id: 'bargeManifest', text: 'Trade for a Brinefolk barge manifest.', completeWhen: never },
  ],
  rewards: [{ type: 'xp', amount: 150 }],
};

export const stilledChoir: QuestDef = {
  id: QUEST.stilledChoir,
  title: 'The Stilled Choir',
  kind: 'investigation',
  act: 2,
  summary: 'Every wisp in Mirror Tarn sings the same three notes — a Covenant hymn. Spirits do not sing hymns.',
  chronicle: {
    HIDDEN: '',
    DISCOVERED: 'Mirelle refuses to speak near the tarn wisps.',
    ACTIVE: 'Trace the hymn the stilled wisps repeat back to whoever taught it.',
    COMPLETED: 'The hymn is a binding. The Covenant does not worship spirits; it harvests them.',
  },
  discoverWhen: act2Gate,
  activateWhen: accepted(QUEST.stilledChoir),
  objectives: [
    { id: 'recordHymn', text: 'Listen to the wisps under Drake-Sight.', completeWhen: never },
    { id: 'findCantor', text: 'Find the cantor who wrote the hymn.', completeWhen: never },
  ],
  rewards: [{ type: 'xp', amount: 150 }],
};

export const ashenRoad: QuestDef = {
  id: QUEST.ashenRoad,
  title: 'The Ashen Road',
  kind: 'investigation',
  act: 2,
  companion: 'kael',
  summary: 'The night the Ashen Drake clan burned, a Covenant procession was seen on the old highland road.',
  chronicle: {
    HIDDEN: '',
    DISCOVERED: 'Isolde remembers lanterns on the highland road that night.',
    ACTIVE: 'Walk the Ashen Road and find who carried those lanterns.',
    COMPLETED: 'The fire that took Kael\'s clan was lit by a Deacon\'s hand — on the Hierophant\'s word.',
  },
  discoverWhen: never,
  activateWhen: accepted(QUEST.ashenRoad),
  objectives: [
    { id: 'walkRoad', text: 'Walk the Ashen Road to the burned hall.', completeWhen: never },
  ],
  rewards: [{ type: 'xp', amount: 180 }],
};
