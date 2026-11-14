import type { QuestDef } from '@/types/contracts';
import { any, questIs } from '../conditions';
import { chron, obj } from '../dsl';
import { INV, MAIN, QUEST } from '../ids';
import { clues } from '../story';

/**
 * Act II — non-linear Hollow Covenant investigations. Each discovers on a story beat OR the first
 * of its clues, activates at once, and completes when all three of its clues are found (in any order).
 */
function investigation(id: string, title: string, act: 1 | 2 | 3, summary: string, story: string, text: { d: string; a: string; c: string }, xp: number): QuestDef {
  const mine = clues.filter((c) => c.investigationId === id);
  return {
    id, title, kind: 'investigation', act, summary,
    chronicle: chron(text.d, text.a, text.c),
    discoverWhen: any(questIs(story, 'COMPLETED'), ...mine.map((c) => c.foundWhen)),
    activateWhen: any(...mine.map((c) => c.foundWhen)),
    objectives: mine.map((c) => obj(c.id, c.title, c.foundWhen)),
    rewards: [{ type: 'xp', amount: xp }, { type: 'coin', amount: Math.round(xp / 4) }, { type: 'flag', key: `${id}.solved`, value: true }],
  };
}

export const saltLedgers = investigation(INV.saltLedgers, 'Salt in the Ledgers', 2,
  'Saltmarket\'s harbour tithes are recorded in two different inks. Someone is skimming twice.', QUEST.ledger,
  { d: 'Thessaly says the harbour clerk weeps over his own books.', a: 'Follow the tithe money: harbour books, Brinefolk manifests, caravan scrip.', c: 'The skim pays for "fuel" at the Greyspire Works — by the Warden-weight.' }, 1200);

export const stilledChoir = investigation(INV.stilledChoir, 'The Stilled Choir', 2,
  'Every stilled spirit sings the same three notes — a Covenant hymn. Spirits do not sing hymns.', MAIN.galecrest,
  { d: 'Mirelle refuses to speak near stilled wisps.', a: 'Trace the hymn: the tarn wisps, Galecrest\'s chime-cages, Hollowroot\'s tagged stags.', c: 'The hymn is a binding. A spirit that sings it can be carried — to Greyspire.' }, 1400);

export const ashenRoad = investigation(INV.ashenRoad, 'The Ashen Road', 2,
  'The night the Ashen Drake clan burned, a Covenant procession was seen on the highland road.', MAIN.prologue,
  { d: 'Keeper Aldra spoke of lanterns that did not flicker.', a: 'Find who carried those lanterns: Ashfall\'s vault, Marrowgate\'s log, the frozen north.', c: 'Deacon Corvane lit the fire on the Hierophant\'s order — and carried Ashka\'s hearth north in a lantern.' }, 1600);

export const greyspireWorks = investigation(INV.greyspireWorks, 'The Greyspire Works', 2,
  'Carts, cages and crates all ship to something called the Greyspire Works. Nobody has seen it and come back.', MAIN.marrowgate,
  { d: 'Quarrymen talk about carts that hum.', a: 'Follow the shipments: the quarry carts, the abbey sluice, the caldera kilns.', c: 'The Works are furnaces. They render stilled Wardens into fuel for the Still Flame.' }, 2000);

export const hierophantsName = investigation(INV.hierophant, 'The Hierophant\'s Name', 2,
  'Nobody alive has seen the Hierophant\'s face. Nobody remembers a name.', MAIN.mirefast,
  { d: 'Ashka grows quiet whenever the Hierophant is mentioned.', a: 'Find out who — or what — the Hierophant is.', c: 'The first Hierophant was drake-blooded, and the Flame needs that blood to stay still.' }, 2000);

export const investigations: readonly QuestDef[] = [saltLedgers, stilledChoir, ashenRoad, greyspireWorks, hierophantsName];
