/** (−2,0) — Act II: Mirefast, the stilt-village of the marshes. Pim joins. */
import type { ChapterContent } from '../dsl';
import { acceptChoice, byId, catchItem, chron, chunkAt, dlg, foe, gate, material, npc, obj, prop, setFlag } from '../dsl';
import { accepted, all, always, any, built, crossed, defeated, fieldDone, flagIs, liberated, not, questAtLeast, questIs, recruited, talked } from '../conditions';
import { CHAIN, GATE, MAIN } from '../ids';

const P = chunkAt(-2, 0);
const R = { village: 'mirefast', abbey: 'sunkenAbbey', meres: 'heronMeres' } as const;
const ORLA2 = 'companion.orla.bellLoft';
const MOSS2 = 'companion.moss.willowKnot';
const PIM3 = 'companion.pim.clockworkHulk';
const TQ = 'township.mireNets';

export const mirefast: ChapterContent = {
  chunk: { cx: -2, cz: 0, name: 'The Mirefast Marshes', biome: 'marsh', act: 2, scatterProps: ['mangrove', 'stiltHouse', 'lantern'], foliageDensity: 0.9 },
  regions: [
    { id: R.village, name: 'Mirefast', biome: 'marsh', center: P(165, 115), radius: 34, occupied: false,
      blurb: 'A village on stilts and rope-bridges. Its marsh-lights used to guide boats home.' },
    { id: R.abbey, name: 'The Drowned Abbey', biome: 'marsh', center: P(70, 70), radius: 30, occupied: true,
      blurb: 'A Covenant abbey sinking into the mire. Its sluices drink the marsh-lights dry.' },
    { id: R.meres, name: 'Heron Meres', biome: 'marsh', center: P(110, 200), radius: 32, occupied: false,
      blurb: 'Reed-beds, herons and bog boar, under a sky the colour of pewter.' },
  ],
  water: [
    { center: P(105, 170), radius: 16, kind: 'lake' },
    { center: P(205, 45), radius: 14, kind: 'lake' },
    { center: P(55, 95), radius: 10, kind: 'lake' },
  ],
  paths: [
    { points: [P(250, 130), P(200, 125), P(165, 115)], width: 3 },
    { points: [P(165, 115), P(140, 185), P(120, 250)], width: 3 },
    { points: [P(165, 115), P(110, 95), P(78, 76)], width: 3 },
    { points: [P(110, 95), P(42, 116)], width: 2 },
    { points: [P(78, 76), P(90, 40)], width: 2 },
  ],
  props: [
    prop('stiltHouse', P(150, 100)), prop('stiltHouse', P(178, 100)), prop('stiltHouse', P(160, 132)),
    prop('stiltHouse', P(190, 120), { tint: '#8a7a5a' }), prop('dock', P(185, 140)), prop('bridge', P(168, 150), { rotation: 0.8 }),
    prop('mangrove', P(130, 140)), prop('mangrove', P(80, 140)), prop('mangrove', P(220, 90)), prop('mangrove', P(30, 160)),
    prop('chapel', P(70, 62), { tint: '#7d8a80', scale: 1.4 }), prop('ruin', P(88, 58)), prop('tower', P(80, 32)),
    prop('lantern', P(140, 115), { tint: '#c8ff9a' }), prop('lantern', P(120, 100), { tint: '#c8ff9a' }),
    prop('shrine', P(18, 125), { tint: '#9ac8a0' }), prop('sign', P(235, 128)), prop('campfire', P(170, 160)),
    prop('mangrove', P(140, 230)), prop('stall', P(172, 124), { tint: '#d9c74f' }),
  ],
  gates: [
    gate(GATE.mireFord, 'river', 'The Mire Ford', P(120, 250), [P(120, 243), P(120, 257)], { width: 14, depth: 6 }),
    gate(GATE.willowKnot, 'grove', 'The Willow-Knot', P(30, 116), [P(37, 116), P(23, 116)], { width: 8, depth: 4, rotation: 1.57 }),
    gate(GATE.abbeyGap, 'chasm', 'Collapsed Bell-Loft Stair', P(90, 32), [P(90, 40), P(90, 24)], { width: 8, depth: 5 }),
  ],
  npcs: [
    npc('npc.reeveHalm', 'Reeve Halm', 'Reeve of Mirefast', 'npc.reeve', P(165, 108), [
      [questIs(MAIN.mirefast, 'COMPLETED'), 'dlg.halm.after'],
      [questIs(MAIN.mirefast, 'ACTIVE'), 'dlg.halm.hint'],
      [questIs(MAIN.mirefast, 'DISCOVERED'), 'dlg.halm.offer'],
      [always, 'dlg.halm.idle'],
    ]),
    npc('npc.pim', 'Pim', 'Spring-wound tinker', 'hero.pim', P(152, 122), [
      [flagIs('mirefast.sluiceJammed'), 'dlg.pim.ready'],
      [always, 'dlg.pim.meet'],
    ], { presentWhen: not(questIs(MAIN.mirefast, 'COMPLETED')) }),
    npc('npc.lockkeeperGide', 'Gide', 'Abbey lock-keeper', 'npc.lockkeeper', P(74, 102), [
      [all(fieldDone('fish', 'spot.abbeySluice'), not(flagIs('mirefast.sluiceJammed'))), 'dlg.gide.sluice'],
      [always, 'dlg.gide.idle'],
    ]),
    npc('npc.netweaverTamsin', 'Tamsin', 'Net-weaver', 'npc.netweaver', P(196, 132), [
      [recruited('npc.netweaverTamsin'), 'dlg.tamsin.township'],
      [questAtLeast(TQ, 'ACTIVE'), 'dlg.tamsin.ready'],
      [always, 'dlg.tamsin.offer'],
    ]),
    npc('npc.willowHermitMab', 'Mother Mab', 'Hermit inside the willow-knot', 'npc.hermit', P(14, 112), [
      [all(questIs(MOSS2, 'ACTIVE'), not(flagIs('moss.willowHeard'))), 'dlg.mab.moss'],
      [not(flagIs('clue:willowConfession')), 'dlg.mab.clue'],
      [always, 'dlg.mab.after'],
    ], { presentWhen: crossed('commune', GATE.willowKnot) }),
    npc('npc.bellRingerOsk', 'Osk', 'Bell-ringer of the drowned loft', 'npc.monk', P(96, 16), [
      [all(questIs(ORLA2, 'ACTIVE'), not(flagIs('orla.bellRung'))), 'dlg.osk.orla'],
      [always, 'dlg.osk.idle'],
    ], { presentWhen: crossed('glide', GATE.abbeyGap) }),
    npc('npc.cogmerchantDell', 'Dell', 'Cog-merchant', 'npc.merchant', P(178, 160), [
      [all(questIs(PIM3, 'ACTIVE'), defeated('enc.clockworkHulk')), 'dlg.dell.won'],
      [questIs(PIM3, 'ACTIVE'), 'dlg.dell.hint'],
      [always, 'dlg.dell.idle'],
    ]),
  ],
  zones: [
    { id: 'zone.bogLurkers', encounterId: 'enc.bogLurkers', position: P(60, 200), radius: 6, sprite: 'enemy.beast.bogLurker', once: false },
    { id: 'zone.mireLights', encounterId: 'enc.mireLights', position: P(130, 70), radius: 6, sprite: 'enemy.wisp.mireLight', once: false },
    { id: 'zone.abbeyPenitents', encounterId: 'enc.abbeyPenitents', position: P(100, 80), radius: 6, sprite: 'enemy.humanoid.abbeyPenitent', once: false },
    { id: 'zone.abbessMorrow', encounterId: 'enc.abbessMorrow', position: P(66, 52), radius: 7, sprite: 'enemy.humanoid.abbessMorrow', once: true,
      presentWhen: flagIs('mirefast.sluiceJammed') },
    { id: 'zone.clockworkHulk', encounterId: 'enc.clockworkHulk', position: P(215, 175), radius: 7, sprite: 'enemy.beast.clockworkHulk', once: true,
      presentWhen: questIs(PIM3, 'ACTIVE') },
  ],
  spots: [
    { id: 'spot.abbeySluice', name: 'The Abbey Sluice', position: P(55, 107), fish: ['fish.reedBream', 'fish.mireEel', 'fish.marshlightGar'] },
    { id: 'spot.heronMere', name: 'Heron Mere', position: P(105, 188), fish: ['fish.reedBream', 'fish.mireEel', 'fish.marshlightGar'] },
  ],
  enemies: {
    bogLurker: foe('bogLurker', 'Bog Lurker', 'enemy.beast.bogLurker', 11, 'brute', {
      affinities: { water: 0.5, fire: 1.3 }, skills: ['skill.enemy.bogDrag'], drops: [{ itemId: 'item.bogIron', chance: 0.4 }],
    }),
    mireLight: foe('mireLight', 'Captive Mire-Light', 'enemy.wisp.mireLight', 12, 'caster', {
      affinities: { physical: 0.7, water: 0.6, earth: 1.4 }, skills: ['skill.enemy.stillChill'],
      drops: [{ itemId: 'item.wispDust', chance: 0.7 }, { itemId: 'item.marshWax', chance: 0.4 }],
    }),
    abbeyPenitent: foe('abbeyPenitent', 'Abbey Penitent', 'enemy.humanoid.abbeyPenitent', 12, 'caster', {
      affinities: { holy: 0.6, shadow: 1.3 }, skills: ['skill.enemy.stillingHymn', 'skill.enemy.acolyteMend'],
      drops: [{ itemId: 'item.marshWax', chance: 0.5 }, { itemId: 'item.bogIron', chance: 0.3 }],
    }),
    sluiceGuard: foe('sluiceGuard', 'Sluice Guard', 'enemy.humanoid.sluiceGuard', 13, 'tank', {
      affinities: { holy: 0.8 }, skills: ['skill.enemy.shieldWall', 'skill.enemy.titheStrike'], drops: [{ itemId: 'item.bogIron', chance: 0.6 }],
    }),
    abbessMorrow: foe('abbessMorrow', 'Abbess Morrow of the Mire', 'enemy.humanoid.abbessMorrow', 14, 'bossCaster', {
      affinities: { holy: 0.5, water: 0.7, shadow: 1.4 }, skills: ['skill.enemy.stillingHymn', 'skill.enemy.bogDrag', 'skill.enemy.stillMend'],
      drops: [{ itemId: 'item.marshWax', chance: 1 }, { itemId: 'item.hiTonic', chance: 0.6 }],
    }),
    clockworkHulk: foe('clockworkHulk', 'Covenant Clockwork Hulk', 'enemy.beast.clockworkHulk', 20, 'boss', {
      affinities: { water: 1.4, wind: 0.8, earth: 0.7 }, skills: ['skill.enemy.gnash', 'skill.enemy.shieldWall'], drops: [{ itemId: 'item.bogIron', chance: 1 }],
    }),
  },
  encounters: {
    'enc.bogLurkers': { id: 'enc.bogLurkers', name: 'Bog Lurkers', enemies: ['bogLurker', 'bogLurker'], canFlee: true },
    'enc.mireLights': { id: 'enc.mireLights', name: 'Captive Mire-Lights', enemies: ['mireLight', 'mireLight', 'mireLight'], canFlee: true },
    'enc.abbeyPenitents': { id: 'enc.abbeyPenitents', name: 'Abbey Penitents', enemies: ['abbeyPenitent', 'sluiceGuard', 'abbeyPenitent'], canFlee: true },
    'enc.abbessMorrow': { id: 'enc.abbessMorrow', name: 'Abbess Morrow', enemies: ['abbessMorrow', 'sluiceGuard', 'mireLight'], canFlee: false, boss: true, liberatesRegion: R.abbey },
    'enc.clockworkHulk': { id: 'enc.clockworkHulk', name: 'The Clockwork Hulk', enemies: ['clockworkHulk', 'mireLight'], canFlee: false, boss: true },
  },
  species: {
    marshHeron: { id: 'marshHeron', name: 'Marsh Heron', sprite: 'animal.bird.marshHeron', speed: 9, wanderSpeed: 0.6, alertRadius: 16, scentSensitivity: 0.3,
      drops: [{ itemId: 'item.reedSilk', chance: 0.85 }], herd: { min: 2, max: 2 }, habitat: [{ center: P(205, 205), radius: 14 }] },
    bogBoar: { id: 'bogBoar', name: 'Bog Boar', sprite: 'animal.boar.bog', speed: 6, wanderSpeed: 0.7, alertRadius: 8, scentSensitivity: 5,
      drops: [{ itemId: 'item.bogTusk', chance: 0.8 }, { itemId: 'item.boarHide', chance: 0.6 }], herd: { min: 2, max: 3 }, habitat: [{ center: P(30, 210), radius: 12 }] },
  },
  fish: {
    'fish.reedBream': { id: 'fish.reedBream', name: 'Reed Bream', itemId: 'item.fish.reedBream', rarity: 'common', fight: 0.24, weight: 40, preferredLure: 'item.lure.cricket' },
    'fish.mireEel': { id: 'fish.mireEel', name: 'Mire Eel', itemId: 'item.fish.mireEel', rarity: 'uncommon', fight: 0.5, weight: 16 },
    'fish.marshlightGar': { id: 'fish.marshlightGar', name: 'Marshlight Gar', itemId: 'item.fish.marshlightGar', rarity: 'rare', fight: 0.68, weight: 6, preferredLure: 'item.lure.emberFly' },
  },
  items: {
    'item.reedSilk': material('item.reedSilk', 'Reed Silk', 'Heron down spun with reed fibre. Tamsin weaves nets from it.', '🧵', 16),
    'item.bogTusk': material('item.bogTusk', 'Bog Tusk', 'Black, polished by peat.', '🦷', 18),
    'item.bogIron': material('item.bogIron', 'Bog Iron', 'Rust-red lumps from the mire. Soft, but it takes an edge.', '🟥', 20),
    'item.marshWax': material('item.marshWax', 'Marsh Wax', 'The abbey\'s candle-wax, rendered from stilled lights. Ansel can unmake it.', '🕯️', 22),
    'item.fish.reedBream': catchItem('item.fish.reedBream', 'Reed Bream', 'Flat, bronze and placid.', 26, 8),
    'item.fish.mireEel': catchItem('item.fish.mireEel', 'Mire Eel', 'Slippery in every sense.', 40, 22),
    'item.fish.marshlightGar': catchItem('item.fish.marshlightGar', 'Marshlight Gar', 'Its scales glow like the lights it hunts.', 60, 80, '🐠'),
  },
  dialogues: byId([
    dlg('dlg.halm.idle', [
      ['Reeve Halm', 'Mind the planks. Half are rotten, the other half are worse.'],
      ['Reeve Halm', 'The abbey\'s bells ring every hour now. Every hour, another light goes out.'],
    ]),
    dlg('dlg.halm.offer', [
      ['Reeve Halm', 'You came through the Fallen Pass? Then you\'re the ones who freed Marrowgate.'],
      ['Reeve Halm', 'Our marsh-lights guided every boat home for three hundred years. The abbess built sluices that drink them. Boats are drowning.'],
      ['Reeve Halm', 'Pim — our tinker — swears she can jam the sluices. Help her, and help us.'],
    ], { choices: acceptChoice(MAIN.mirefast, 'We\'ll bring the lights back.') }),
    dlg('dlg.halm.hint', [
      ['Reeve Halm', 'Pim\'s workshop is the stilt-house with the springs on the roof.'],
      ['Reeve Halm', 'The sluice is by the abbey moat. Gide the lock-keeper hates it as much as we do.'],
    ]),
    dlg('dlg.halm.after', [
      ['Reeve Halm', 'Look at the meres tonight. Every light, home.'],
      ['Reeve Halm', 'The ford south runs too fast for boats. Pim can bound across it; that\'s the desert road.'],
    ]),
    dlg('dlg.pim.meet', [
      ['Pim', 'Oh! Customers. Or rescuers. Either way, hold this spring. Don\'t let go. Don\'t let GO.'],
      ['Pim', 'The abbey sluice pulls lights through a cage-grate. If somebody hooks the grate from the moat side, it jams.'],
      ['Pim', 'Somebody with a fishing line. And a strong arm. And a death wish. You look qualified.'],
    ]),
    dlg('dlg.pim.ready', [
      ['Pim', 'Sluice jammed, lights backing up, abbess furious. Perfect!'],
      ['Pim', 'Let\'s go ruin her whole day. Then I\'m coming with you — I\'ve never seen a desert.'],
    ]),
    dlg('dlg.gide.idle', [
      ['Gide', 'I keep the locks. The abbess keeps the keys. Funny old world.'],
      ['Gide', 'If you ever hook the sluice grate from the moat, come tell me what\'s on it.'],
    ]),
    dlg('dlg.gide.sluice', [
      ['Gide', 'You hooked the grate! And look — a lamp-cage, stamped "Greyspire Works, receiving".'],
      ['Gide', 'So that\'s where the lights go. Every drained light, shipped to Greyspire.'],
      ['Gide', 'Grate\'s jammed now. The abbess will come down herself.'],
    ], { onEnd: [setFlag('mirefast.sluiceJammed'), setFlag('clue:abbeyDrains')] }),
    dlg('dlg.tamsin.offer', [
      ['Tamsin', 'I weave nets that hold eels and let the minnows go. Fair nets.'],
      ['Tamsin', 'A frontier village with a lake and no net-loft? That\'s a crime. Take me with you.'],
    ], { choices: acceptChoice(TQ, 'Hearthstead needs a net-loft.', 'Maybe later.') }),
    dlg('dlg.tamsin.ready', [
      ['Tamsin', 'Write my name in the Hearthstead ledger.'],
      ['Tamsin', 'Reed silk for the nets, eels for the bait trade.'],
    ]),
    dlg('dlg.tamsin.township', [
      ['Tamsin', 'Every lure in Hearthstead goes through my hands now.'],
      ['Tamsin', 'Expand the loft and I\'ll tie flies that would tempt a legend.'],
    ]),
    dlg('dlg.mab.clue', [
      ['Mother Mab', 'The willow let you in. It hasn\'t in forty years.'],
      ['Mother Mab', 'I was a novice in Greyspire. The Hierophant\'s name is not a name — it is a title passed down with the Flame. The first to hold it was a drake-blood.'],
    ], { onEnd: [setFlag('clue:willowConfession')] }),
    dlg('dlg.mab.moss', [
      ['Moss', 'Mab. You\'ve grown roots.'],
      ['Mother Mab', 'And you\'ve grown older, druid. The willow remembers you planting it.'],
      ['Mother Mab', 'The first Hierophant was drake-blooded. The Flame needs that blood to stay still. Tell the boy.'],
    ], { onEnd: [setFlag('moss.willowHeard'), setFlag('clue:willowConfession')] }),
    dlg('dlg.mab.after', [
      ['Mother Mab', 'Go on. The willow will close behind you.'],
      ['Mother Mab', 'It always does.'],
    ]),
    dlg('dlg.osk.orla', [
      ['Osk', 'A chanter, gliding into my loft! Sing with me — the abbess forbade it, and she\'s gone.'],
      ['Orla', 'One verse, Osk. The one about the boats coming home.'],
      ['Osk', 'The bells haven\'t sounded that sweet in years.'],
    ], { onEnd: [setFlag('orla.bellRung')] }),
    dlg('dlg.osk.idle', [
      ['Osk', 'Bells are only as cruel as the hand on the rope.'],
      ['Osk', 'Mine is a kind hand now.'],
    ]),
    dlg('dlg.dell.idle', [
      ['Dell', 'Cogs, springs, escapements. Pim buys half my stock and pays in compliments.'],
      ['Dell', 'There\'s a Covenant clockwork thing stomping round the east meres. Not one of mine.'],
    ]),
    dlg('dlg.dell.hint', [
      ['Dell', 'The hulk\'s in the east meres. Pim says she can bound the ford and flank it.'],
      ['Dell', 'Bring me its mainspring. Please. Professional curiosity.'],
    ]),
    dlg('dlg.dell.won', [
      ['Dell', 'The hulk\'s mainspring! And it\'s… stamped with Pim\'s maker\'s mark?'],
      ['Pim', 'They stole my designs. Of course they did. They steal everything.'],
      ['Dell', 'Then have these back. Little brass hands. They know the way to a purse.'],
    ], { onEnd: [setFlag('pim.hulkUnwound')] }),
  ]),
  quests: [
    {
      id: MAIN.mirefast, title: 'The Drowned Abbey', kind: 'main', act: 2, giver: 'npc.reeveHalm',
      summary: 'Beyond the Fallen Pass, the stilt-village of Mirefast is losing its marsh-lights to the abbey\'s sluices.',
      chronicle: chron(
        'Past the Fallen Pass, the marsh-lights of Mirefast are going out one by one.',
        'Meet the tinker Pim, jam the abbey sluice from the moat, and face Abbess Morrow.',
        'The sluice is broken and the lights are home. Pim is coming along, mostly to see a desert.',
      ),
      discoverWhen: all(questIs(MAIN.marrowgate, 'COMPLETED'), crossed('roll', GATE.fallenPass)),
      activateWhen: accepted(MAIN.mirefast),
      objectives: [
        obj('meetPim', 'Meet Pim in her stilt-house workshop.', talked('npc.pim'), P(152, 122)),
        obj('hookSluice', 'Fish the abbey sluice from the moat (Kael).', fieldDone('fish', 'spot.abbeySluice'), P(55, 107), talked('npc.pim')),
        obj('tellGide', 'Show Gide what came up on the line.', flagIs('mirefast.sluiceJammed'), P(74, 102), fieldDone('fish', 'spot.abbeySluice')),
        obj('abbess', 'Defeat Abbess Morrow and liberate the Drowned Abbey.', liberated(R.abbey), P(66, 52), flagIs('mirefast.sluiceJammed')),
      ],
      rewards: [{ type: 'hero', heroId: 'pim' }, { type: 'gear', gearId: 'relic.mirelightCharm' }, { type: 'xp', amount: 1100 }, { type: 'coin', amount: 300 }],
    },
    {
      id: ORLA2, chain: { id: CHAIN.orla, stage: 2, of: 3, title: 'The Unsung Hymn' }, title: 'The Drowned Bell-Loft', kind: 'companion', act: 2, companion: 'orla', giver: 'npc.bellRingerOsk',
      summary: 'The abbey\'s bell-loft stair collapsed into the mire. Orla wants to sing from it anyway.',
      chronicle: chron('Orla keeps humming along with the abbey bells.', 'Glide to the drowned bell-loft and ring the boats home with Osk.', 'Orla sang from the bell-loft and the marsh sang back.'),
      discoverWhen: all(questIs('companion.orla.updraft', 'COMPLETED'), questIs(MAIN.mirefast, 'COMPLETED')),
      activateWhen: crossed('glide', GATE.abbeyGap),
      objectives: [
        obj('glideLoft', 'Glide across the collapsed stair (Orla).', crossed('glide', GATE.abbeyGap), P(90, 32)),
        obj('ring', 'Ring the boats home with Osk.', flagIs('orla.bellRung'), P(96, 16), crossed('glide', GATE.abbeyGap)),
      ],
      rewards: [{ type: 'xp', amount: 900 }, { type: 'item', itemId: 'item.emberDraught', qty: 3 }],
    },
    {
      id: MOSS2, chain: { id: CHAIN.moss, stage: 2, of: 3, title: 'Old as the Bramble' }, title: 'The Willow-Knot', kind: 'companion', act: 2, companion: 'moss', giver: 'npc.willowHermitMab',
      summary: 'Moss planted a willow in the marsh before Mirefast had a name. Someone has been living inside it.',
      chronicle: chron('Moss says a willow in the marsh is calling him.', 'Commune with the Willow-Knot and hear its keeper out.', 'Mother Mab told Moss what the first Hierophant was. He has not said much since.'),
      discoverWhen: questIs('companion.moss.heartGrove', 'COMPLETED'),
      activateWhen: crossed('commune', GATE.willowKnot),
      objectives: [
        obj('open', 'Commune with the Willow-Knot (Moss).', crossed('commune', GATE.willowKnot), P(30, 116)),
        obj('hear', 'Hear Mother Mab.', flagIs('moss.willowHeard'), P(14, 112), crossed('commune', GATE.willowKnot)),
      ],
      rewards: [{ type: 'xp', amount: 1100 }],
    },
    {
      id: PIM3, chain: { id: CHAIN.pim, stage: 3, of: 3, title: 'Spring-Wound' }, title: 'The Clockwork Hulk', kind: 'companion', act: 2, companion: 'pim', giver: 'npc.cogmerchantDell',
      summary: 'A Covenant war-machine stomps the east meres. Pim recognises the gait.',
      chronicle: chron('Dell says something clockwork is loose in the meres.', 'Bound back across the Mire Ford and unwind the Clockwork Hulk.', 'The hulk ran on Pim\'s stolen designs. Dell gave her the Pocketful of Cogs.'),
      discoverWhen: questIs('companion.pim.rapids', 'COMPLETED'),
      activateWhen: crossed('leap', GATE.mireFord),
      objectives: [
        obj('ford', 'Spring-leap the Mire Ford (Pim).', crossed('leap', GATE.mireFord), P(120, 250)),
        obj('hulk', 'Unwind the Clockwork Hulk.', defeated('enc.clockworkHulk'), P(215, 175)),
        obj('dell', 'Bring Dell the mainspring.', flagIs('pim.hulkUnwound'), P(178, 160), defeated('enc.clockworkHulk')),
      ],
      rewards: [{ type: 'gear', gearId: 'sig.pocketfulOfCogs' }, { type: 'xp', amount: 1500 }],
    },
    {
      id: TQ, title: 'Nets for Hearthstead', kind: 'township', act: 2, giver: 'npc.netweaverTamsin',
      summary: 'Tamsin the net-weaver could give Hearthstead a net-loft — and better lures.',
      chronicle: chron('A Mirefast net-weaver eyed Kael\'s tackle and sniffed.', 'Recruit Tamsin and raise the Net-Loft.', 'The Net-Loft hangs heavy with reed-silk nets. Hearthstead\'s lures have never been better.'),
      discoverWhen: any(talked('npc.netweaverTamsin'), accepted(TQ)),
      activateWhen: accepted(TQ),
      objectives: [
        obj('recruitTamsin', 'Invite Tamsin to Hearthstead (Hearthstead ledger).', recruited('npc.netweaverTamsin'), P(196, 132)),
        obj('buildLoft', 'Build the Net-Loft on a Hearthstead plot.', built('building.fishery'), undefined, recruited('npc.netweaverTamsin')),
      ],
      rewards: [{ type: 'item', itemId: 'item.lure.emberFly', qty: 4 }, { type: 'item', itemId: 'item.lure.silverSpoon', qty: 4 }, { type: 'xp', amount: 300 }],
    },
  ],
};
