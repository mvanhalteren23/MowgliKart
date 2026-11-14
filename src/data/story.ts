/**
 * Main story graph, Hollow Covenant clues and endings.
 * Pure ids + conditions so chapter modules can import it without cycles.
 */
import type { ClueDef, Condition, EndingDef, StoryNodeDef } from '@/types/contracts';
import { all, choseIn, flagIs } from './conditions';
import { FLAG, INV, MAIN } from './ids';

export const storyGraph: readonly StoryNodeDef[] = [
  { id: 'node.prologue', act: 1, title: 'Ashfall Hollow', regionId: 'ashfallHollow', questId: MAIN.prologue, next: ['node.ledger'] },
  { id: 'node.ledger', act: 1, title: 'The Lanternwick Ledger', regionId: 'greyfordTithePost', questId: MAIN.ledger, next: ['node.galecrest'] },
  { id: 'node.galecrest', act: 1, title: 'The Chimes of Galecrest', regionId: 'chimeSpire', questId: MAIN.galecrest, next: ['node.marrowgate'] },
  { id: 'node.marrowgate', act: 1, title: 'The Siege of Marrowgate', regionId: 'marrowgate', questId: MAIN.marrowgate, next: ['node.mirefast', 'node.hollowroot'] },
  { id: 'node.mirefast', act: 2, title: 'The Drowned Abbey', regionId: 'sunkenAbbey', questId: MAIN.mirefast, next: ['node.saffrane'] },
  { id: 'node.saffrane', act: 2, title: 'The Ledger Hall of Saffrane', regionId: 'ledgerHall', questId: MAIN.saffrane, next: ['node.emberdeep'] },
  { id: 'node.hollowroot', act: 2, title: 'The Felling of Hollowroot', regionId: 'heartwood', questId: MAIN.hollowroot, next: ['node.rimefold'] },
  { id: 'node.rimefold', act: 2, title: 'The Reliquary of Rime', regionId: 'lanternHall', questId: MAIN.rimefold, next: ['node.emberdeep'] },
  { id: 'node.emberdeep', act: 3, title: 'The Kilnworks', regionId: 'kilnworks', questId: MAIN.emberdeep, next: ['node.greyspire'] },
  { id: 'node.greyspire', act: 3, title: 'The Still Flame', regionId: 'stillFlameSanctum', questId: MAIN.greyspire, next: [] },
];

const clue = (id: string, title: string, text: string, regionId: string, investigationId: string): ClueDef => ({
  id, title, text, regionId, investigationId, foundWhen: flagIs(`clue:${id}`),
});

/** 15 clues, three per investigation, spread across eight chunks. */
export const clues: readonly ClueDef[] = [
  clue('harbourBooks', 'Two Inks', 'Saltmarket\'s harbour tithe-books are kept in two inks: one tally for the town, one for Greyspire.', 'saltmarket', INV.saltLedgers),
  clue('bargeManifest', 'The Barge Manifest', 'The Brinefolk carry sealed crates from Saltmarket to "the Works" — and are paid not to open them.', 'saltmarket', INV.saltLedgers),
  clue('caravanScrip', 'Warden-Weight Scrip', 'Greyspire Works pays for "fuel" by the Warden-weight, countersigned with the Still Flame seal.', 'saffrane', INV.saltLedgers),
  clue('tarnHymn', 'The Tarn Hymn', 'The wisps of Mirror Tarn sing three notes taught them by a cantor — a binding, not a prayer.', 'mirrortarn', INV.stilledChoir),
  clue('chimeCages', 'Voices in Bronze', 'Galecrest\'s chime-cages were cast with spirit voices in the bronze, by sealed order from Greyspire.', 'chimeSpire', INV.stilledChoir),
  clue('silencedGrove', 'Tagged Stags', 'Covenant chimes on Hollowroot\'s stags lead the fellers to spirit-trees.', 'hollowroot', INV.stilledChoir),
  clue('vaultLedger', 'The Night Entry', 'Ashfall\'s vault recorded the burning: a lantern procession under Deacon Corvane, on the Hierophant\'s order.', 'ashfallHollow', INV.ashenRoad),
  clue('garrisonLog', 'The Escort', 'Marrowgate\'s garrison escorted the procession north to Ashfall that night.', 'marrowgate', INV.ashenRoad),
  clue('frozenLantern', 'The Frozen Lantern', 'The lantern-bearers carried a living hearth-spirit north toward Greyspire. The storm took them first.', 'glacierMouth', INV.ashenRoad),
  clue('quarryCarts', 'Humming Carts', 'Sealed carts leave the quarry chapel monthly for the Greyspire Works. They hum.', 'quarryCut', INV.greyspireWorks),
  clue('abbeyDrains', 'Receiving', 'Mirefast\'s drained marsh-lights are caged and shipped to "Greyspire Works, receiving".', 'sunkenAbbey', INV.greyspireWorks),
  clue('kilnManifest', 'The Furnace Manifest', 'The Kilnworks render every stilled Warden into fuel for a furnace under the cathedral.', 'kilnworks', INV.greyspireWorks),
  clue('willowConfession', 'A Title, Not a Name', '"Hierophant" is a title passed with the Flame. The first to hold it was drake-blooded.', 'mirefast', INV.hierophant),
  clue('rapidsShrine', 'The Blinded Drake', 'A century-old Hierophant\'s token shows a drake with its eyes put out.', 'mosswater', INV.hierophant),
  clue('rockfallCache', 'The Courier\'s Letter', 'A letter in the Hierophant\'s hand: "The drake-blood must be stilled before it remembers what it is."', 'greyfordTithePost', INV.hierophant),
];

/** Personal-chain final stages (all nine) and newcomer join quests (six). */
export const CHAIN_FINALS = [
  'companion.kael.sovereignEmber', 'companion.tobin.lastHunt', 'companion.vesna.sunkenRing', 'companion.orla.dustGorge',
  'companion.hadrik.overseer', 'companion.pim.clockworkHulk', 'companion.quill.margins', 'companion.moss.frostblight',
  'companion.sable.kilnReliquary',
] as const;
export const JOIN_QUESTS = [MAIN.galecrest, MAIN.marrowgate, MAIN.mirefast, MAIN.saffrane, MAIN.hollowroot, MAIN.rimefold] as const;
export const TRUE_ENDING_CLUES = 12;

/** Everything the true ending needs besides the final choice (also gates that choice in the last dialogue). */
export const trueEndingReady: Condition = all(
  { kind: 'count', atLeast: TRUE_ENDING_CLUES, of: clues.map((c) => ({ kind: 'flag', key: `clue:${c.id}` }) as const) },
  { kind: 'count', atLeast: JOIN_QUESTS.length, of: JOIN_QUESTS.map((questId) => ({ kind: 'quest', questId, status: 'COMPLETED' }) as const) },
  { kind: 'count', atLeast: CHAIN_FINALS.length, of: CHAIN_FINALS.map((questId) => ({ kind: 'quest', questId, status: 'COMPLETED' }) as const) },
);

const FINAL = 'dlg.flameHeart.choice';

export const endings: readonly EndingDef[] = [
  {
    id: 'ending.quenched', title: 'Ash and Silence', priority: 1,
    summary: 'The Hierophant is dead and the Still Flame is quenched — and every Warden it held goes dark with it. The frontier is free, and much quieter than it should be.',
    when: flagIs(FLAG.finale),
  },
  {
    id: 'ending.emberInTheDark', title: 'An Ember in the Dark', priority: 2,
    summary: 'Kael gives the Still Flame his drake-blood. It flickers once and lets the Wardens go. Ashka burns on; the last of the Ashen Drake does not take wing again.',
    when: all(flagIs(FLAG.finale), choseIn(FINAL, 'sacrifice')),
  },
  {
    id: 'ending.wakeOfEmbers', title: 'The Wake of Embers', priority: 3,
    summary: 'With every thread of the Covenant\'s lie in hand and all nine at his side, Kael sounds the Wyrm\'s Lament. Every stilled Warden hears its name and comes home. The Still Flame flickers, and goes out on its own.',
    when: all(trueEndingReady, flagIs(FLAG.finale), choseIn(FINAL, 'unbind')),
  },
];
