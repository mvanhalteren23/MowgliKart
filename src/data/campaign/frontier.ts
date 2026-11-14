/** (0,0) — campaign additions to the Lanternwick frontier (the slice content lives in `world.ts`). */
import type { ChapterContent } from '../dsl';
import { byId, chron, dlg, gate, npc, obj, setFlag } from '../dsl';
import { all, always, crossed, fieldDone, flagIs, not, questIs, talked } from '../conditions';
import { CHAIN, GATE, QUEST, SPECIES } from '../ids';

const TOBIN1 = 'companion.tobin.oath';
const HADRIK2 = 'companion.hadrik.rockfall';

export const frontier: ChapterContent = {
  chunk: { cx: 0, cz: 0, name: 'The Lanternwick Frontier', biome: 'frontier', act: 1, scatterProps: ['fence', 'lantern', 'campfire'], foliageDensity: 1 },
  regions: [], props: [], zones: [], spots: [], water: [], enemies: {}, encounters: {}, species: {}, fish: {}, items: {},
  paths: [
    { points: [{ x: 84, z: 74 }, { x: 92, z: 48 }, { x: 98, z: 20 }, { x: 100, z: 0 }], width: 3 },
    { points: [{ x: 78, z: 92 }, { x: 40, z: 104 }, { x: 0, z: 110 }], width: 3 },
    { points: [{ x: 108, z: 200 }, { x: 110, z: 230 }, { x: 110, z: 250 }], width: 3 },
  ],
  gates: [
    gate(GATE.greyfordRockfall, 'boulder', 'Greyford Rockfall', { x: 200, z: 186 }, [{ x: 195, z: 191 }, { x: 205, z: 181 }], { width: 7, depth: 4, rotation: 0.79 }),
  ],
  npcs: [
    npc('npc.wardenHolt', 'Old Holt', 'Retired frontier warden', 'npc.warden', { x: 66, z: 150 }, [
      [all(questIs(TOBIN1, 'ACTIVE'), fieldDone('huntShot', SPECIES.deer), fieldDone('huntShot', SPECIES.grouse)), 'dlg.holt.oath'],
      [questIs(TOBIN1, 'ACTIVE'), 'dlg.holt.hint'],
      [always, 'dlg.holt.idle'],
    ]),
    npc('npc.tarnEcho', 'The Tarn Cantor\'s Echo', 'Glamoured memory', 'npc.shade', { x: 108, z: 38 }, [
      [not(flagIs('clue:tarnHymn')), 'dlg.tarnEcho.clue'],
      [always, 'dlg.tarnEcho.after'],
    ], { hiddenUntilDrakeSight: true, presentWhen: questIs(QUEST.ledger, 'COMPLETED') }),
    npc('npc.courierDunmore', 'Dunmore', 'Pinned Covenant courier', 'npc.courier', { x: 210, z: 176 }, [
      [not(flagIs('clue:rockfallCache')), 'dlg.dunmore.letter'],
      [always, 'dlg.dunmore.after'],
    ], { presentWhen: crossed('roll', GATE.greyfordRockfall) }),
  ],
  dialogues: byId([
    dlg('dlg.holt.idle', [
      ['Old Holt', 'Forty years a warden. Now I watch the bracken and argue with deer.'],
      ['Old Holt', 'Tell Tobin his old man is proud. I mean me. I\'m the old man.'],
    ]),
    dlg('dlg.holt.hint', [
      ['Old Holt', 'The oath\'s simple: one ashdeer, one reedgrouse, both shot from downwind, both clean.'],
      ['Tobin', 'I know the oath, Holt.'],
      ['Old Holt', 'Then go and say it with your bow.'],
    ]),
    dlg('dlg.holt.oath', [
      ['Old Holt', 'Deer and grouse, both clean. You swore the oath again, lad, and you meant it.'],
      ['Old Holt', 'Now go up to the high moor. Ash Corrie has my compass. I told her to make you earn it.'],
    ], { onEnd: [setFlag('tobin.oathSworn')] }),
    dlg('dlg.tarnEcho.clue', [
      ['Tarn Cantor\'s Echo', 'Three notes. Low, lower, still. Teach them to the wisps until they forget their own song.'],
      ['Tarn Cantor\'s Echo', 'By order of Greyspire: a spirit that sings the hymn can be carried.'],
    ], { onEnd: [setFlag('clue:tarnHymn')] }),
    dlg('dlg.tarnEcho.after', [
      ['Tarn Cantor\'s Echo', 'Low, lower…'],
      ['Tarn Cantor\'s Echo', 'I have forgotten the third note. Good.'],
    ]),
    dlg('dlg.dunmore.letter', [
      ['Dunmore', 'Thank the — no, not the Flame. Thank you. The rocks came down on my horse and my satchel both.'],
      ['Dunmore', 'Read it. I never did. "The drake-blood must be stilled before it remembers what it is." Signed with the Hierophant\'s own seal.'],
    ], { onEnd: [setFlag('clue:rockfallCache')] }),
    dlg('dlg.dunmore.after', [
      ['Dunmore', 'I\'m done carrying Covenant letters.'],
      ['Dunmore', 'I\'ll carry grain instead. Grain never threatens anyone.'],
    ]),
  ]),
  quests: [
    {
      id: TOBIN1, chain: { id: CHAIN.tobin, stage: 1, of: 3, title: 'The Warden\'s Oath' }, title: 'Wardens of the Frontier', kind: 'companion', act: 1, companion: 'tobin', giver: 'npc.wardenHolt',
      summary: 'Old Holt, the warden who raised Tobin, wants to hear him swear the warden\'s oath again — with his bow.',
      chronicle: chron('Old Holt has been asking after Tobin.', 'Shoot an ashdeer and a reedgrouse cleanly, then return to Holt.', 'Tobin swore the warden\'s oath again. Holt sent him to the high moor for his compass.'),
      discoverWhen: questIs(QUEST.ledger, 'COMPLETED'),
      activateWhen: fieldDone('huntShot', SPECIES.deer),
      objectives: [
        obj('deer', 'Take an ashdeer with Tobin\'s bowshot.', fieldDone('huntShot', SPECIES.deer), { x: 42, z: 150 }),
        obj('grouse', 'Take a reedgrouse with Tobin\'s bowshot.', fieldDone('huntShot', SPECIES.grouse), { x: 128, z: 82 }),
        obj('holt', 'Swear the oath to Old Holt.', flagIs('tobin.oathSworn'), { x: 66, z: 150 }, all(fieldDone('huntShot', SPECIES.deer), fieldDone('huntShot', SPECIES.grouse))),
      ],
      rewards: [{ type: 'xp', amount: 250 }, { type: 'item', itemId: 'item.lure.silverSpoon', qty: 2 }],
    },
    {
      id: HADRIK2, chain: { id: CHAIN.hadrik, stage: 2, of: 3, title: 'Quarry-Shield' }, title: 'The Greyford Rockfall', kind: 'companion', act: 2, companion: 'hadrik', giver: 'npc.courierDunmore',
      summary: 'A rockfall above Greyford trapped a Covenant courier. Hadrik says stone is stone, whoever is under it.',
      chronicle: chron('Hadrik heard someone shouting under the Greyford rocks.', 'Roll through the Greyford Rockfall and dig out the courier.', 'Hadrik dug Dunmore out — and found the first stone he ever cut set in the rockfall\'s keystone. He keeps it now: the Quarry-Heart.'),
      discoverWhen: questIs('companion.hadrik.trappedCrew', 'COMPLETED'),
      activateWhen: crossed('roll', GATE.greyfordRockfall),
      objectives: [
        obj('roll', 'Roll through the Greyford Rockfall (Hadrik).', crossed('roll', GATE.greyfordRockfall), { x: 200, z: 186 }),
        obj('courier', 'Dig out the courier.', talked('npc.courierDunmore'), { x: 210, z: 176 }, crossed('roll', GATE.greyfordRockfall)),
      ],
      rewards: [{ type: 'gear', gearId: 'relic.quarryHeart' }, { type: 'xp', amount: 700 }],
    },
  ],
};
