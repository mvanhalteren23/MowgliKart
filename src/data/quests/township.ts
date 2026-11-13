import type { QuestDef } from '@/types/contracts';
import { accepted, any, built, entered, recruited, talked } from '../conditions';
import { BUILDING, NPC, QUEST, REGION } from '../ids';

export const hearthTimber: QuestDef = {
  id: QUEST.timber,
  title: 'Timber for Hearthstead',
  kind: 'township',
  act: 1,
  giver: NPC.lark,
  summary: 'Hearthstead is a cleared field and a promise. Bram the carpenter could make it a village — if he believed it would last.',
  chronicle: {
    HIDDEN: '',
    DISCOVERED: 'Surveyor Lark has staked out three plots south of Lanternwick and needs hands to fill them.',
    ACTIVE: 'Persuade Bram the carpenter to move to Hearthstead, then raise his carpentry.',
    COMPLETED: 'The carpentry\'s first beam went up to cheers. Hearthstead has its first roof.',
  },
  discoverWhen: any(talked(NPC.lark), entered(REGION.hearthstead), accepted(QUEST.timber)),
  activateWhen: accepted(QUEST.timber),
  objectives: [
    {
      id: 'recruitBram',
      text: 'Invite Bram the carpenter to Hearthstead (Hearthstead ledger).',
      completeWhen: recruited(NPC.bram),
      marker: { x: 58, z: 82 },
    },
    {
      id: 'buildCarpentry',
      text: 'Build the Carpentry on a Hearthstead plot.',
      revealWhen: recruited(NPC.bram),
      completeWhen: built(BUILDING.carpentry),
      marker: { x: 98, z: 194 },
    },
  ],
  rewards: [
    { type: 'coin', amount: 40 },
    { type: 'xp', amount: 60 },
  ],
};

export const frontierAnvil: QuestDef = {
  id: QUEST.anvil,
  title: 'An Anvil on the Frontier',
  kind: 'township',
  act: 1,
  giver: NPC.lark,
  summary: 'Gilda is the best smith in Saltmarket and the Covenant\'s least favourite. She will not move inland while tithe-wagons own the road.',
  chronicle: {
    HIDDEN: '',
    DISCOVERED: 'Lark wants a smith for Hearthstead. Gilda of Saltmarket is the only one worth asking.',
    ACTIVE: 'Clear the Covenant\'s tithe wagon off the grain road, invite Gilda, and build her smithy.',
    COMPLETED: 'The smithy\'s chimney smokes over Hearthstead. Covenant iron is being beaten into ploughshares.',
  },
  discoverWhen: any(talked(NPC.lark), entered(REGION.hearthstead), accepted(QUEST.anvil)),
  activateWhen: accepted(QUEST.anvil),
  objectives: [
    {
      id: 'recruitGilda',
      text: 'Invite Gilda the blacksmith to Hearthstead (Hearthstead ledger).',
      completeWhen: recruited(NPC.gilda),
      marker: { x: 186, z: 114 },
    },
    {
      id: 'buildSmithy',
      text: 'Build the Smithy on a Hearthstead plot.',
      revealWhen: recruited(NPC.gilda),
      completeWhen: built(BUILDING.smithy),
      marker: { x: 126, z: 198 },
    },
  ],
  rewards: [
    { type: 'gear', gearId: 'armor.tithebreakerMail' },
    { type: 'xp', amount: 80 },
  ],
};
