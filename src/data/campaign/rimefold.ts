/** (−1,−2) — Act II: the Rimefold, the frozen reach. Sable joins. */
import type { ChapterContent } from '../dsl';
import { acceptChoice, byId, catchItem, chron, chunkAt, dlg, foe, gate, material, npc, obj, prop, setFlag } from '../dsl';
import { accepted, all, always, crossed, defeated, fieldDone, flagIs, liberated, not, questIs, talked } from '../conditions';
import { CHAIN, GATE, MAIN } from '../ids';

const P = chunkAt(-1, -2);
const R = { town: 'hoarfrostLanding', hall: 'lanternHall', glacier: 'glacierMouth' } as const;
const SABLE1 = 'companion.sable.crevasse';
const TOBIN3 = 'companion.tobin.lastHunt';
const MOSS3 = 'companion.moss.frostblight';

export const rimefold: ChapterContent = {
  chunk: { cx: -1, cz: -2, name: 'The Rimefold', biome: 'tundra', act: 2, scatterProps: ['iceSpire', 'crystal', 'basalt'], foliageDensity: 0.25 },
  regions: [
    { id: R.town, name: 'Hoarfrost Landing', biome: 'tundra', center: P(125, 170), radius: 32, occupied: false,
      blurb: 'Whalebone halls and smokehouses on the edge of the ice. Everyone here is related, and everyone is cold.' },
    { id: R.hall, name: 'The Lantern Hall', biome: 'tundra', center: P(60, 80), radius: 26, occupied: true,
      blurb: 'The Covenant\'s northern reliquary. A thousand lanterns, and something trapped in every one.' },
    { id: R.glacier, name: 'The Glacier Mouth', biome: 'tundra', center: P(190, 60), radius: 30, occupied: false,
      blurb: 'Where the ice meets the caldera\'s heat and weeps.' },
  ],
  water: [{ center: P(180, 180), radius: 14, kind: 'lake' }, { center: P(205, 25), radius: 10, kind: 'lake' }],
  paths: [
    { points: [P(110, 250), P(118, 200), P(125, 170)], width: 3 },
    { points: [P(125, 170), P(90, 120), P(65, 85)], width: 3 },
    { points: [P(125, 170), P(180, 130), P(250, 130)], width: 3 },
    { points: [P(90, 120), P(38, 140)], width: 2 },
    { points: [P(125, 170), P(90, 215)], width: 2 },
  ],
  props: [
    prop('house', P(110, 160), { tint: '#d8e0e8' }), prop('house', P(140, 158), { tint: '#d8e0e8' }), prop('house', P(118, 185), { tint: '#c8d0d8' }),
    prop('campfire', P(130, 175)), prop('dock', P(165, 190), { rotation: 0.4 }), prop('iceSpire', P(170, 100)), prop('iceSpire', P(220, 80)),
    prop('iceSpire', P(30, 40)), prop('cathedral', P(55, 70), { scale: 0.9, tint: '#c8d8e8' }), prop('lantern', P(72, 92), { tint: '#e8f0ff' }),
    prop('lantern', P(45, 92), { tint: '#e8f0ff' }), prop('crystal', P(150, 40), { tint: '#a8e0ff' }), prop('basalt', P(230, 160)),
    prop('statue', P(95, 120), { tint: '#a0b0c0' }), prop('sign', P(112, 236)), prop('tent', P(80, 222), { tint: '#8a6a4a' }),
    prop('fence', P(140, 200), { rotation: 0.3 }), prop('ruin', P(200, 110)),
  ],
  gates: [
    gate(GATE.frostScarp, 'cliff', 'The Frost Scarp', P(250, 130), [P(243, 130), P(257, 130)], { width: 12, depth: 5, rotation: 1.57 }),
    gate(GATE.crevasse, 'cliff', 'The Reliquary Crevasse', P(30, 140), [P(37, 140), P(23, 140)], { width: 8, depth: 4, rotation: 1.57 }),
  ],
  npcs: [
    npc('npc.thaneHalvi', 'Thane Halvi', 'Thane of Hoarfrost Landing', 'npc.thane', P(126, 162), [
      [questIs(MAIN.rimefold, 'COMPLETED'), 'dlg.halvi.after'],
      [questIs(MAIN.rimefold, 'ACTIVE'), 'dlg.halvi.hint'],
      [questIs(MAIN.rimefold, 'DISCOVERED'), 'dlg.halvi.offer'],
      [always, 'dlg.halvi.idle'],
    ]),
    npc('npc.sable', 'Sable', 'Lantern-thief', 'hero.sable', P(98, 140), [
      [flagIs('rimefold.reliquaryOpen'), 'dlg.sable.ready'],
      [defeated('enc.reliquaryEscort'), 'dlg.sable.open'],
      [always, 'dlg.sable.meet'],
    ], { presentWhen: not(questIs(MAIN.rimefold, 'COMPLETED')) }),
    npc('npc.frozenBearer', 'The Frozen Lantern-Bearer', 'Covenant pilgrim, twenty winters dead', 'npc.shade', P(200, 122), [
      [not(flagIs('clue:frozenLantern')), 'dlg.bearer.clue'],
      [always, 'dlg.bearer.after'],
    ], { hiddenUntilDrakeSight: true }),
    npc('npc.fenceMira', 'Mira', 'Fence for stolen reliquaries', 'npc.thief', P(16, 143), [
      [all(questIs(SABLE1, 'ACTIVE'), not(flagIs('sable.fenceMet'))), 'dlg.mira.sable'],
      [always, 'dlg.mira.idle'],
    ], { presentWhen: crossed('grapple', GATE.crevasse) }),
    npc('npc.whiteHunterSkadi', 'Skadi', 'White hunter', 'npc.trapper', P(92, 228), [
      [all(questIs(TOBIN3, 'ACTIVE'), defeated('enc.whiteStag')), 'dlg.skadi.done'],
      [questIs(TOBIN3, 'ACTIVE'), 'dlg.skadi.hint'],
      [always, 'dlg.skadi.idle'],
    ]),
    npc('npc.frostDruidEira', 'Eira', 'Druid of the rime-pines', 'npc.druid', P(100, 238), [
      [all(questIs(MOSS3, 'ACTIVE'), defeated('enc.frostblight')), 'dlg.eira.planted'],
      [questIs(MOSS3, 'ACTIVE'), 'dlg.eira.hint'],
      [always, 'dlg.eira.idle'],
    ]),
  ],
  zones: [
    { id: 'zone.rimeWolves', encounterId: 'enc.rimeWolves', position: P(220, 210), radius: 6, sprite: 'enemy.beast.rimeWolf', once: false },
    { id: 'zone.frostWisps', encounterId: 'enc.frostWisps', position: P(160, 70), radius: 6, sprite: 'enemy.wisp.frostWisp', once: false },
    { id: 'zone.reliquaryEscort', encounterId: 'enc.reliquaryEscort', position: P(85, 110), radius: 6, sprite: 'enemy.humanoid.reliquaryKnight', once: true,
      presentWhen: talked('npc.sable') },
    { id: 'zone.reliquarian', encounterId: 'enc.reliquarian', position: P(58, 64), radius: 7, sprite: 'enemy.humanoid.reliquarianHalloran', once: true,
      presentWhen: flagIs('rimefold.reliquaryOpen') },
    { id: 'zone.whiteStag', encounterId: 'enc.whiteStag', position: P(40, 225), radius: 7, sprite: 'enemy.beast.whiteStag', once: true,
      presentWhen: questIs(TOBIN3, 'ACTIVE') },
    { id: 'zone.frostblight', encounterId: 'enc.frostblight', position: P(150, 230), radius: 7, sprite: 'enemy.wisp.frostblight', once: true,
      presentWhen: questIs(MOSS3, 'ACTIVE') },
  ],
  spots: [{ id: 'spot.frozenMere', name: 'Ice-Hole on the Frozen Mere', position: P(180, 196), fish: ['fish.icefinCod', 'fish.frostChar', 'fish.auroraTrout'] }],
  enemies: {
    rimeWolf: foe('rimeWolf', 'Rime Wolf', 'enemy.beast.rimeWolf', 18, 'skirmisher', {
      affinities: { water: 0.5, ice: 0.3, fire: 1.4, lightning: 1.15 }, skills: ['skill.enemy.frostBite', 'skill.enemy.packHowl'], drops: [{ itemId: 'item.rimeFur', chance: 0.6 }],
    }),
    reliquaryKnight: foe('reliquaryKnight', 'Reliquary Knight', 'enemy.humanoid.reliquaryKnight', 19, 'tank', {
      affinities: { holy: 0.6, shadow: 1.3 }, skills: ['skill.enemy.shieldWall', 'skill.enemy.titheStrike'], drops: [{ itemId: 'item.frostCrystal', chance: 0.5 }],
    }),
    frostWisp: foe('frostWisp', 'Stilled Frost-Wisp', 'enemy.wisp.frostWisp', 19, 'caster', {
      affinities: { physical: 0.7, water: 0.4, ice: 0, fire: 1.6 }, skills: ['skill.enemy.stillChill', 'skill.enemy.frostBite'], drops: [{ itemId: 'item.frostCrystal', chance: 0.5 }],
    }),
    lanternBearer: foe('lanternBearer', 'Lantern-Bearer', 'enemy.humanoid.lanternBearer', 20, 'caster', {
      affinities: { holy: 0.5, shadow: 1.4 }, skills: ['skill.enemy.reliquaryLight', 'skill.enemy.stillMend'], drops: [{ itemId: 'item.frostCrystal', chance: 0.4 }],
    }),
    reliquarianHalloran: foe('reliquarianHalloran', 'Reliquarian Halloran', 'enemy.humanoid.reliquarianHalloran', 22, 'bossCaster', {
      affinities: { holy: 0.5, water: 0.7, shadow: 1.4 }, skills: ['skill.enemy.reliquaryLight', 'skill.enemy.stillingHymn', 'skill.enemy.stillMend'],
      drops: [{ itemId: 'item.frostCrystal', chance: 1 }, { itemId: 'item.hiTonic', chance: 0.7 }],
    }),
    whiteStag: foe('whiteStag', 'The White Stag of Rime', 'enemy.beast.whiteStag', 23, 'boss', {
      affinities: { water: 0.5, ice: 0.4, fire: 1.3 }, skills: ['skill.enemy.gnash', 'skill.enemy.frostBite'], drops: [{ itemId: 'item.rimeFur', chance: 1 }],
    }),
    frostblight: foe('frostblight', 'Frostblight', 'enemy.wisp.frostblight', 23, 'bossCaster', {
      affinities: { physical: 0.6, water: 0.4, ice: 0.2, fire: 1.6, earth: 1.2 }, skills: ['skill.enemy.stillChill', 'skill.enemy.sapBind'], drops: [{ itemId: 'item.frostCrystal', chance: 1 }],
    }),
  },
  encounters: {
    'enc.rimeWolves': { id: 'enc.rimeWolves', name: 'Rime Wolves', enemies: ['rimeWolf', 'rimeWolf', 'rimeWolf'], canFlee: true },
    'enc.frostWisps': { id: 'enc.frostWisps', name: 'Stilled Frost-Wisps', enemies: ['frostWisp', 'frostWisp'], canFlee: true },
    'enc.reliquaryEscort': { id: 'enc.reliquaryEscort', name: 'Reliquary Escort', enemies: ['reliquaryKnight', 'lanternBearer', 'reliquaryKnight'], canFlee: true },
    'enc.reliquarian': { id: 'enc.reliquarian', name: 'Reliquarian Halloran', enemies: ['reliquarianHalloran', 'reliquaryKnight', 'frostWisp'], canFlee: false, boss: true, liberatesRegion: R.hall },
    'enc.whiteStag': { id: 'enc.whiteStag', name: 'The White Stag', enemies: ['whiteStag', 'rimeWolf'], canFlee: false, boss: true },
    'enc.frostblight': { id: 'enc.frostblight', name: 'The Frostblight', enemies: ['frostblight', 'frostWisp'], canFlee: false, boss: true },
  },
  species: {
    rimeElk: { id: 'rimeElk', name: 'Rime Elk', sprite: 'animal.deer.rimeElk', speed: 8, wanderSpeed: 0.8, alertRadius: 19, scentSensitivity: 3,
      drops: [{ itemId: 'item.rimeFur', chance: 0.7 }, { itemId: 'item.smokedVenison', chance: 0.6 }], herd: { min: 2, max: 3 }, habitat: [{ center: P(55, 205), radius: 14 }] },
    snowHare: { id: 'snowHare', name: 'Snow Hare', sprite: 'animal.hare.snow', speed: 11, wanderSpeed: 1.3, alertRadius: 6, scentSensitivity: 1,
      drops: [{ itemId: 'item.rimeFur', chance: 0.6 }, { itemId: 'item.hareFoot', chance: 0.5 }], herd: { min: 2, max: 2 }, habitat: [{ center: P(215, 225), radius: 12 }] },
  },
  fish: {
    'fish.icefinCod': { id: 'fish.icefinCod', name: 'Icefin Cod', itemId: 'item.fish.icefinCod', rarity: 'common', fight: 0.28, weight: 40 },
    'fish.frostChar': { id: 'fish.frostChar', name: 'Frost Char', itemId: 'item.fish.frostChar', rarity: 'uncommon', fight: 0.54, weight: 15, preferredLure: 'item.lure.silverSpoon' },
    'fish.auroraTrout': { id: 'fish.auroraTrout', name: 'Aurora Trout', itemId: 'item.fish.auroraTrout', rarity: 'rare', fight: 0.72, weight: 5, preferredLure: 'item.lure.emberFly' },
  },
  items: {
    'item.rimeFur': material('item.rimeFur', 'Rime Fur', 'Thick white fur that sheds snow.', '🤍', 28),
    'item.frostCrystal': material('item.frostCrystal', 'Frost Crystal', 'Ice that will not melt. It hums a cold note.', '❄️', 34),
    'item.fish.icefinCod': catchItem('item.fish.icefinCod', 'Icefin Cod', 'Translucent fins, sweet flesh.', 32, 10),
    'item.fish.frostChar': catchItem('item.fish.frostChar', 'Frost Char', 'Red belly under silver ice.', 48, 28),
    'item.fish.auroraTrout': catchItem('item.fish.auroraTrout', 'Aurora Trout', 'Its flanks shimmer green and violet like the northern sky.', 66, 100, '🐠'),
  },
  dialogues: byId([
    dlg('dlg.halvi.idle', [
      ['Thane Halvi', 'Shut the door, you\'re letting the cold out. That\'s a joke. It\'s colder in here.'],
      ['Thane Halvi', 'The Lantern Hall up the ridge takes our dead. Says it keeps their light.'],
    ]),
    dlg('dlg.halvi.offer', [
      ['Thane Halvi', 'Moss opened the Rimepine? Then the old pact holds, and I owe you.'],
      ['Thane Halvi', 'Our dead go to the Lantern Hall, and their light never comes home. A thief named Sable has been stealing the lanterns back. The Covenant wants her hanged. I want her helped.'],
    ], { choices: acceptChoice(MAIN.rimefold, 'We\'ll help the thief.') }),
    dlg('dlg.halvi.hint', [
      ['Thane Halvi', 'Sable hides in the ice-caves west of the road. She\'ll find you first.'],
      ['Thane Halvi', 'Bring our lights home.'],
    ]),
    dlg('dlg.halvi.after', [
      ['Thane Halvi', 'A thousand lanterns opened. The aurora last night was brighter than I\'ve ever seen.'],
      ['Thane Halvi', 'East, past the scarp, the sky glows red. The caldera. Whatever the Covenant does with stolen light, it does there.'],
    ]),
    dlg('dlg.sable.meet', [
      ['Sable', 'Behind you. No — the other behind.'],
      ['Sable', 'A reliquary escort brings fresh lanterns up the ridge at dusk. Hit it, and I get their keys.'],
    ]),
    dlg('dlg.sable.open', [
      ['Sable', 'Keys. Lovely, heavy, stupid keys.'],
      ['Sable', 'The Hall\'s open. Halloran\'s inside, polishing his collection. Let\'s ruin his evening.'],
    ], { onEnd: [setFlag('rimefold.reliquaryOpen')] }),
    dlg('dlg.sable.ready', [
      ['Sable', 'Lantern Hall. Halloran. Every lantern opens.'],
      ['Sable', 'After that? I\'ve never stolen from a cathedral. First time for everything.'],
    ]),
    dlg('dlg.bearer.clue', [
      ['Lantern-Bearer\'s Shade', 'We carried lanterns north from Ashfall. Twenty winters, still carrying.'],
      ['Lantern-Bearer\'s Shade', 'Inside the lantern: a hearth-spirit, still burning. The Deacon said the Hierophant wanted it "un-flickered". The storm took us before Greyspire.'],
    ], { onEnd: [setFlag('clue:frozenLantern')] }),
    dlg('dlg.bearer.after', [
      ['Lantern-Bearer\'s Shade', 'Set the lantern down for us, drake-child.'],
      ['Lantern-Bearer\'s Shade', 'We are so tired of carrying it.'],
    ]),
    dlg('dlg.mira.sable', [
      ['Mira', 'Sable! You grappled the crevasse? I thought you\'d given up honest crime.'],
      ['Sable', 'The first reliquary I ever emptied. You kept it.'],
      ['Mira', 'Of course I kept it. It\'s the only lamp I\'ve ever seen shine darker.'],
    ], { onEnd: [setFlag('sable.fenceMet')] }),
    dlg('dlg.mira.idle', [
      ['Mira', 'Buying, selling, never asking.'],
      ['Mira', 'Mostly selling back to the people they were stolen from.'],
    ]),
    dlg('dlg.skadi.idle', [
      ['Skadi', 'White hunter. I take only what the ice can spare.'],
      ['Skadi', 'Rime elk graze south-west. Downwind or nothing.'],
    ]),
    dlg('dlg.skadi.hint', [
      ['Skadi', 'Holt\'s boy wants the White Stag? It wears Covenant chimes. It hunts hunters now.'],
      ['Skadi', 'Take a rime elk first. Show the ice you\'re a hunter, not a butcher.'],
    ]),
    dlg('dlg.skadi.done', [
      ['Skadi', 'The White Stag is down and its chimes are broken.'],
      ['Tobin', 'Its feathers — the snow-owls nest in its antlers. Fletching fit for a warden.'],
      ['Skadi', 'Holt would be proud. I am.'],
    ], { onEnd: [setFlag('tobin.lastHuntDone')] }),
    dlg('dlg.eira.idle', [
      ['Eira', 'The rime-pines sleep for nine months a year. Lucky things.'],
      ['Eira', 'There is a blight on the south slope. Not ice. Something stilled.'],
    ]),
    dlg('dlg.eira.hint', [
      ['Eira', 'The Frostblight is a stilled spirit gone rotten. It sits on the south slope.'],
      ['Moss', 'Then the oak\'s seed goes where it falls.'],
    ]),
    dlg('dlg.eira.planted', [
      ['Eira', 'The blight is gone. And — a sapling? In this cold?'],
      ['Moss', 'An oak that has waited nine hundred years does not mind a little frost.'],
      ['Eira', 'Take this torc. The rime-pines grew it for you overnight.'],
    ], { onEnd: [setFlag('moss.seedPlanted')] }),
  ]),
  quests: [
    {
      id: MAIN.rimefold, title: 'The Reliquary of Rime', kind: 'main', act: 2, giver: 'npc.thaneHalvi',
      summary: 'Past the Rimepine, Hoarfrost Landing\'s dead go to the Covenant\'s Lantern Hall — and their light never comes home.',
      chronicle: chron(
        'Beyond the Rimepine, the Thane of Hoarfrost Landing needs a favour.',
        'Find the thief Sable, raid the reliquary escort for its keys, and confront Reliquarian Halloran.',
        'The Lantern Hall stands open and a thousand lights went home. Sable has joined the party, to steal from a cathedral.',
      ),
      discoverWhen: all(questIs(MAIN.hollowroot, 'COMPLETED'), crossed('commune', GATE.rimepineGrove)),
      activateWhen: accepted(MAIN.rimefold),
      objectives: [
        obj('findSable', 'Find Sable in the ice-caves.', talked('npc.sable'), P(98, 140)),
        obj('escort', 'Raid the reliquary escort.', defeated('enc.reliquaryEscort'), P(85, 110), talked('npc.sable')),
        obj('keys', 'Bring the keys to Sable.', flagIs('rimefold.reliquaryOpen'), P(98, 140), defeated('enc.reliquaryEscort')),
        obj('halloran', 'Defeat Reliquarian Halloran and liberate the Lantern Hall.', liberated(R.hall), P(58, 64), flagIs('rimefold.reliquaryOpen')),
      ],
      rewards: [{ type: 'hero', heroId: 'sable' }, { type: 'gear', gearId: 'weapon.rimeforgedBlade' }, { type: 'xp', amount: 2200 }, { type: 'coin', amount: 500 }],
    },
    {
      id: SABLE1, chain: { id: CHAIN.sable, stage: 1, of: 3, title: 'Lantern-Thief' }, title: 'The First Lantern', kind: 'companion', act: 2, companion: 'sable', giver: 'npc.fenceMira',
      summary: 'Sable\'s fence lives at the bottom of a crevasse. She has kept something of Sable\'s.',
      chronicle: chron('Sable wants to drop in on an old friend.', 'Grapple down the Reliquary Crevasse and find Mira.', 'Mira returned the Moonless Lantern — the first reliquary Sable ever emptied.'),
      discoverWhen: questIs(MAIN.rimefold, 'COMPLETED'),
      activateWhen: crossed('grapple', GATE.crevasse),
      objectives: [
        obj('crevasse', 'Grapple the Reliquary Crevasse (Sable).', crossed('grapple', GATE.crevasse), P(30, 140)),
        obj('mira', 'Find Mira.', flagIs('sable.fenceMet'), P(16, 143), crossed('grapple', GATE.crevasse)),
      ],
      rewards: [{ type: 'gear', gearId: 'relic.moonlessLantern' }, { type: 'xp', amount: 1400 }],
    },
    {
      id: TOBIN3, chain: { id: CHAIN.tobin, stage: 3, of: 3, title: 'The Warden\'s Oath' }, title: 'The Last Hunt', kind: 'companion', act: 2, companion: 'tobin', giver: 'npc.whiteHunterSkadi',
      summary: 'The White Stag of the Rimefold wears Covenant chimes and hunts the hunters. Holt always said it was Tobin\'s to take.',
      chronicle: chron('Tobin has heard of the White Stag.', 'Take a rime elk, then bring down the White Stag with Skadi.', 'The White Stag fell. Its snow-owl feathers became the Quarry-Mark Fletching.'),
      discoverWhen: all(questIs('companion.tobin.highMoor', 'COMPLETED'), questIs(MAIN.rimefold, 'COMPLETED')),
      activateWhen: fieldDone('huntShot', 'rimeElk'),
      objectives: [
        obj('elk', 'Take a rime elk with a bowshot.', fieldDone('huntShot', 'rimeElk'), P(55, 205)),
        obj('stag', 'Bring down the White Stag.', defeated('enc.whiteStag'), P(40, 225), fieldDone('huntShot', 'rimeElk')),
        obj('skadi', 'Tell Skadi.', flagIs('tobin.lastHuntDone'), P(92, 228), defeated('enc.whiteStag')),
      ],
      rewards: [{ type: 'gear', gearId: 'sig.quarryMarkFletch' }, { type: 'xp', amount: 1800 }],
    },
    {
      id: MOSS3, chain: { id: CHAIN.moss, stage: 3, of: 3, title: 'Old as the Bramble' }, title: 'Seed in the Frost', kind: 'companion', act: 2, companion: 'moss', giver: 'npc.frostDruidEira',
      summary: 'The Eldest Oak asked Moss to plant its seed where the last of its children fell. A stilled blight sits on the rime-pine slope.',
      chronicle: chron('Moss is looking north.', 'Commune with the Rimepine, purge the Frostblight, and plant the oak\'s seed.', 'An oak sapling grows in the frost. The rime-pines grew Moss a Thornheart Torc overnight.'),
      discoverWhen: all(questIs('companion.moss.willowKnot', 'COMPLETED'), questIs(MAIN.rimefold, 'COMPLETED')),
      activateWhen: crossed('commune', GATE.rimepineGrove),
      objectives: [
        obj('rimepine', 'Commune with the Rimepine Thicket (Moss).', crossed('commune', GATE.rimepineGrove), P(110, 250)),
        obj('blight', 'Purge the Frostblight.', defeated('enc.frostblight'), P(150, 230)),
        obj('plant', 'Plant the seed with Eira.', flagIs('moss.seedPlanted'), P(100, 238), defeated('enc.frostblight')),
      ],
      rewards: [{ type: 'gear', gearId: 'sig.thornheartTorc' }, { type: 'xp', amount: 1800 }],
    },
  ],
};
