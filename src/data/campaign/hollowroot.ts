/** (−1,1) — Act II: Hollowroot Weald, the great forest. Moss joins. */
import type { ChapterContent } from '../dsl';
import { acceptChoice, byId, catchItem, chron, chunkAt, dlg, foe, gate, material, npc, obj, prop, setFlag } from '../dsl';
import { accepted, all, always, any, crossed, defeated, fieldDone, flagIs, liberated, not, questIs, talked } from '../conditions';
import { CHAIN, GATE, MAIN } from '../ids';

const P = chunkAt(-1, 1);
const R = { weald: 'hollowroot', heart: 'heartwood', mosswater: 'mosswater' } as const;
const MOSS1 = 'companion.moss.heartGrove';
const PIM2 = 'companion.pim.rapids';

export const hollowroot: ChapterContent = {
  chunk: { cx: -1, cz: 1, name: 'Hollowroot Weald', biome: 'forest', act: 2, scatterProps: ['shrine', 'statue', 'campfire'], foliageDensity: 1 },
  regions: [
    { id: R.weald, name: 'Hollowroot Weald', biome: 'forest', center: P(130, 110), radius: 36, occupied: false,
      blurb: 'The great forest. Its oldest trees were saplings when the drakes still flew.' },
    { id: R.heart, name: 'The Heartwood', biome: 'forest', center: P(185, 195), radius: 28, occupied: true,
      blurb: 'The Covenant\'s fellers are cutting the spirit-trees into beams for Greyspire.' },
    { id: R.mosswater, name: 'Mosswater', biome: 'forest', center: P(60, 195), radius: 30, occupied: false,
      blurb: 'A green pool under a green roof. Even the light is mossy.' },
  ],
  water: [
    { center: P(80, 55), radius: 14, kind: 'lake' },
    { center: P(60, 200), radius: 12, kind: 'lake' },
  ],
  paths: [
    { points: [P(140, 0), P(135, 60), P(130, 110)], width: 3 },
    { points: [P(0, 120), P(60, 118), P(130, 110)], width: 3 },
    { points: [P(130, 110), P(160, 160), P(182, 192)], width: 3 },
    { points: [P(130, 110), P(90, 160), P(70, 180)], width: 2.5 },
    { points: [P(130, 110), P(200, 75), P(212, 62)], width: 2 },
    { points: [P(90, 160), P(48, 150)], width: 2 },
  ],
  props: [
    prop('house', P(120, 100), { tint: '#7a6040' }), prop('house', P(145, 95), { tint: '#7a6040' }), prop('campfire', P(132, 122)),
    prop('shrine', P(110, 130), { tint: '#9fd08a' }), prop('statue', P(160, 130), { tint: '#6a8a5a' }), prop('well', P(126, 88)),
    prop('tent', P(200, 180), { tint: '#9aa0a6' }), prop('tent', P(172, 210), { tint: '#9aa0a6' }), prop('fence', P(190, 165)),
    prop('ruin', P(30, 60)), prop('obelisk', P(225, 120)), prop('shrine', P(232, 50), { tint: '#c8f0a0', scale: 1.3 }),
    prop('bridge', P(65, 118), { rotation: 0.1 }), prop('sign', P(140, 30)), prop('campfire', P(100, 210)),
    prop('statue', P(20, 152), { tint: '#7ab0c8' }), prop('ruin', P(210, 230)), prop('lantern', P(176, 182), { tint: '#e8f0ff' }),
  ],
  gates: [
    gate(GATE.foamRapids, 'river', 'The Foam Rapids', P(40, 150), [P(46, 150), P(33, 150)], { width: 9, depth: 5, rotation: 1.57 }),
    gate(GATE.heartGrove, 'grove', 'The Eldest Grove', P(220, 60), [P(213, 60), P(227, 60)], { width: 8, depth: 4, rotation: 1.57 }),
  ],
  npcs: [
    npc('npc.woodwardBrann', 'Woodward Brann', 'Keeper of the Weald', 'npc.woodward', P(138, 104), [
      [questIs(MAIN.hollowroot, 'COMPLETED'), 'dlg.brann.after'],
      [questIs(MAIN.hollowroot, 'ACTIVE'), 'dlg.brann.hint'],
      [questIs(MAIN.hollowroot, 'DISCOVERED'), 'dlg.brann.offer'],
      [always, 'dlg.brann.idle'],
    ]),
    npc('npc.moss', 'Moss', 'Hedge-druid', 'hero.moss', P(108, 145), [
      [flagIs('hollowroot.grovePact'), 'dlg.moss.ready'],
      [always, 'dlg.moss.meet'],
    ], { presentWhen: not(questIs(MAIN.hollowroot, 'COMPLETED')) }),
    npc('npc.dryadSilla', 'Silla', 'Dryad of the felled grove', 'npc.dryad', P(165, 175), [
      [flagIs('hollowroot.grovePact'), 'dlg.silla.after'],
      [always, 'dlg.silla.pact'],
    ], { hiddenUntilDrakeSight: true, presentWhen: defeated('enc.fellingCrew') }),
    npc('npc.eldestOak', 'The Eldest Oak', 'Spirit of the first grove', 'npc.treeSpirit', P(236, 64), [
      [all(questIs(MOSS1, 'ACTIVE'), not(flagIs('moss.oakSpoke'))), 'dlg.oak.moss'],
      [always, 'dlg.oak.idle'],
    ], { presentWhen: crossed('commune', GATE.heartGrove) }),
    npc('npc.rapidsKeeperWyn', 'Wyn', 'Keeper of the rapids shrine', 'npc.monk', P(24, 160), [
      [all(questIs(PIM2, 'ACTIVE'), fieldDone('huntShot', 'thornstag'), not(flagIs('pim.rapidsDone'))), 'dlg.wyn.pim'],
      [not(flagIs('clue:rapidsShrine')), 'dlg.wyn.clue'],
      [always, 'dlg.wyn.after'],
    ], { presentWhen: crossed('leap', GATE.foamRapids) }),
    npc('npc.huntsmanFael', 'Fael', 'Weald huntsman', 'npc.trapper', P(95, 205), [
      [all(fieldDone('huntShot', 'thornstag'), not(flagIs('clue:silencedGrove'))), 'dlg.fael.clue'],
      [always, 'dlg.fael.idle'],
    ]),
    npc('npc.beekeeperJuniper', 'Juniper', 'Beekeeper', 'npc.villager', P(150, 88), [[always, 'dlg.juniper.idle']]),
  ],
  zones: [
    { id: 'zone.fellHounds', encounterId: 'enc.fellHounds', position: P(60, 90), radius: 6, sprite: 'enemy.beast.fellHound', once: false },
    { id: 'zone.rootWisps', encounterId: 'enc.rootWisps', position: P(200, 120), radius: 6, sprite: 'enemy.wisp.rootWisp', once: false },
    { id: 'zone.fellingCrew', encounterId: 'enc.fellingCrew', position: P(160, 160), radius: 6, sprite: 'enemy.humanoid.axeMonk', once: true,
      presentWhen: talked('npc.moss') },
    { id: 'zone.fellwarden', encounterId: 'enc.fellwarden', position: P(188, 200), radius: 7, sprite: 'enemy.humanoid.fellwardenGrath', once: true,
      presentWhen: flagIs('hollowroot.grovePact') },
  ],
  spots: [
    { id: 'spot.mosswater', name: 'Mosswater Pool', position: P(60, 214), fish: ['fish.mossPerch', 'fish.rootSalmon', 'fish.greenwoodGrayling'] },
    { id: 'spot.foamPool', name: 'Foam Pool', position: P(80, 71), fish: ['fish.mossPerch', 'fish.rootSalmon'] },
  ],
  enemies: {
    fellHound: foe('fellHound', 'Fell Hound', 'enemy.beast.fellHound', 12, 'skirmisher', {
      affinities: { fire: 1.3, earth: 0.8 }, skills: ['skill.enemy.gnash', 'skill.enemy.packHowl'], drops: [{ itemId: 'item.wolfPelt', chance: 0.6 }],
    }),
    axeMonk: foe('axeMonk', 'Axe-Monk', 'enemy.humanoid.axeMonk', 13, 'brute', {
      affinities: { holy: 0.8, earth: 1.2 }, skills: ['skill.enemy.fellingAxe'], drops: [{ itemId: 'item.heartwoodResin', chance: 0.5 }],
    }),
    rootWisp: foe('rootWisp', 'Stilled Root-Wisp', 'enemy.wisp.rootWisp', 13, 'caster', {
      affinities: { physical: 0.7, earth: 0.5, fire: 1.5 }, skills: ['skill.enemy.sapBind'], drops: [{ itemId: 'item.heartwoodResin', chance: 0.4 }, { itemId: 'item.wispDust', chance: 0.4 }],
    }),
    sawyer: foe('sawyer', 'Covenant Sawyer', 'enemy.humanoid.sawyer', 14, 'tank', {
      affinities: { holy: 0.8 }, skills: ['skill.enemy.shieldWall', 'skill.enemy.fellingAxe'], drops: [{ itemId: 'item.heartwoodResin', chance: 0.6 }],
    }),
    fellwardenGrath: foe('fellwardenGrath', 'Fellwarden Grath', 'enemy.humanoid.fellwardenGrath', 16, 'boss', {
      affinities: { holy: 0.7, fire: 1.2 }, skills: ['skill.enemy.fellingAxe', 'skill.enemy.crowdRoar', 'skill.enemy.sapBind'],
      drops: [{ itemId: 'item.heartwoodResin', chance: 1 }, { itemId: 'item.hiTonic', chance: 0.6 }],
    }),
  },
  encounters: {
    'enc.fellHounds': { id: 'enc.fellHounds', name: 'Fell Hounds', enemies: ['fellHound', 'fellHound', 'fellHound'], canFlee: true },
    'enc.rootWisps': { id: 'enc.rootWisps', name: 'Stilled Root-Wisps', enemies: ['rootWisp', 'rootWisp'], canFlee: true },
    'enc.fellingCrew': { id: 'enc.fellingCrew', name: 'The Felling Crew', enemies: ['axeMonk', 'sawyer', 'axeMonk'], canFlee: true },
    'enc.fellwarden': { id: 'enc.fellwarden', name: 'Fellwarden Grath', enemies: ['fellwardenGrath', 'sawyer', 'rootWisp'], canFlee: false, boss: true, liberatesRegion: R.heart },
  },
  species: {
    thornstag: { id: 'thornstag', name: 'Thornstag', sprite: 'animal.deer.thornstag', speed: 9.5, wanderSpeed: 1, alertRadius: 15, scentSensitivity: 3.6,
      drops: [{ itemId: 'item.thornstagAntler', chance: 0.7 }, { itemId: 'item.softHide', chance: 0.7 }], herd: { min: 2, max: 3 }, habitat: [{ center: P(110, 225), radius: 12 }] },
    mossBoar: { id: 'mossBoar', name: 'Moss Boar', sprite: 'animal.boar.moss', speed: 6.8, wanderSpeed: 0.8, alertRadius: 10, scentSensitivity: 4.2,
      drops: [{ itemId: 'item.boarTusk', chance: 0.7 }, { itemId: 'item.boarHide', chance: 0.7 }], herd: { min: 2, max: 2 }, habitat: [{ center: P(215, 150), radius: 12 }] },
  },
  fish: {
    'fish.mossPerch': { id: 'fish.mossPerch', name: 'Moss Perch', itemId: 'item.fish.mossPerch', rarity: 'common', fight: 0.25, weight: 40, preferredLure: 'item.lure.cricket' },
    'fish.rootSalmon': { id: 'fish.rootSalmon', name: 'Root Salmon', itemId: 'item.fish.rootSalmon', rarity: 'uncommon', fight: 0.52, weight: 16, preferredLure: 'item.lure.silverSpoon' },
    'fish.greenwoodGrayling': { id: 'fish.greenwoodGrayling', name: 'Greenwood Grayling', itemId: 'item.fish.greenwoodGrayling', rarity: 'rare', fight: 0.7, weight: 5, preferredLure: 'item.lure.emberFly' },
  },
  items: {
    'item.thornstagAntler': material('item.thornstagAntler', 'Thornstag Antler', 'Branching like a briar. Kestrel hangs them over the lodge door.', '🦌', 26),
    'item.heartwoodResin': material('item.heartwoodResin', 'Heartwood Resin', 'Amber from the felled spirit-trees. Bram will only take it given, not cut.', '🍯', 30),
    'item.fish.mossPerch': catchItem('item.fish.mossPerch', 'Moss Perch', 'Green-gold and lazy.', 28, 9),
    'item.fish.rootSalmon': catchItem('item.fish.rootSalmon', 'Root Salmon', 'Runs up streams that run under trees.', 44, 26),
    'item.fish.greenwoodGrayling': catchItem('item.fish.greenwoodGrayling', 'Greenwood Grayling', 'Its sail-fin is patterned like leaves.', 62, 90, '🐠'),
  },
  dialogues: byId([
    dlg('dlg.brann.idle', [
      ['Woodward Brann', 'Hollowroot doesn\'t care for visitors. It tolerates me.'],
      ['Woodward Brann', 'Listen. You hear the saws?'],
    ]),
    dlg('dlg.brann.offer', [
      ['Woodward Brann', 'You glided the gorge. Then you\'ve the nerve for this.'],
      ['Woodward Brann', 'Covenant fellers are cutting the Heartwood — spirit-trees, every one — into beams for Greyspire. Old Moss won\'t leave them, and he can\'t stop them alone.'],
    ], { choices: acceptChoice(MAIN.hollowroot, 'We\'ll stop the felling.') }),
    dlg('dlg.brann.hint', [
      ['Woodward Brann', 'Moss is at the shrine south of the village. He\'ll want to see you swing first.'],
      ['Woodward Brann', 'The grove\'s dryad hides from Covenant eyes. Maybe not from drake ones.'],
    ]),
    dlg('dlg.brann.after', [
      ['Woodward Brann', 'The saws are quiet. The Weald is… humming.'],
      ['Woodward Brann', 'North past Galecrest the Rimepine grows so thick only a druid can pass. Moss could open it.'],
    ]),
    dlg('dlg.moss.meet', [
      ['Moss', 'Drake-blood. I smelled you three valleys off.'],
      ['Moss', 'The felling crew works the eastern stand. Break them, and the grove\'s dryad may show herself. She does not trust anyone I have not seen fight.'],
    ]),
    dlg('dlg.moss.ready', [
      ['Moss', 'Silla has made her pact. The Heartwood will fight with us.'],
      ['Moss', 'After Grath is gone I will walk with you. The trees can spare me; you cannot.'],
    ]),
    dlg('dlg.silla.pact', [
      ['Silla', 'The drake-child sees me. And the crew is broken. Then hear the grove\'s word.'],
      ['Silla', 'Every felled tree held a sleeping spirit. Grath stills them before the saw. Stop him, and the Heartwood is yours to walk forever.'],
    ], { onEnd: [setFlag('hollowroot.grovePact')] }),
    dlg('dlg.silla.after', [
      ['Silla', 'Grow, little drake.'],
      ['Silla', 'The grove will remember the shape of your shadow.'],
    ]),
    dlg('dlg.oak.moss', [
      ['The Eldest Oak', 'Little Moss. You are older. I am the same.'],
      ['Moss', 'They have been cutting your children, eldest.'],
      ['The Eldest Oak', 'Then carry my seed. Plant it where the last of them falls.'],
    ], { onEnd: [setFlag('moss.oakSpoke')] }),
    dlg('dlg.oak.idle', [
      ['The Eldest Oak', '…'],
      ['The Eldest Oak', 'The wind tells me you are kind. Go on.'],
    ]),
    dlg('dlg.wyn.clue', [
      ['Wyn', 'Across the rapids! You must have springs in your boots.'],
      ['Wyn', 'This shrine holds a Hierophant\'s pilgrim-token, a hundred years old. Its face is a drake with its eyes put out.'],
    ], { onEnd: [setFlag('clue:rapidsShrine')] }),
    dlg('dlg.wyn.pim', [
      ['Wyn', 'A thornstag, brought down clean. The shrine accepts your offering, tinker.'],
      ['Pim', 'Uncle Tib said you keep the old spring-pattern here.'],
      ['Wyn', 'Carved on the token\'s back. Copy it — and look at the face on the front, while you\'re at it.'],
    ], { onEnd: [setFlag('pim.rapidsDone'), setFlag('clue:rapidsShrine')] }),
    dlg('dlg.wyn.after', [
      ['Wyn', 'The rapids keep the shrine. I just dust it.'],
      ['Wyn', 'Mind the foam on the way back.'],
    ]),
    dlg('dlg.fael.clue', [
      ['Fael', 'A thornstag! And look at its antlers — Covenant tags, wired in. A tracking chime.'],
      ['Fael', 'They tag the stags to find the spirit-trees. Every tree a stag beds under gets "stilled" and felled.'],
    ], { onEnd: [setFlag('clue:silencedGrove')] }),
    dlg('dlg.fael.idle', [
      ['Fael', 'Thornstags bed down south of the pool. They smell you before you see them.'],
      ['Fael', 'Stay downwind and you might get a look.'],
    ]),
    dlg('dlg.juniper.idle', [
      ['Juniper', 'The bees went quiet when the saws started.'],
      ['Juniper', 'Bees know things.'],
    ]),
  ]),
  quests: [
    {
      id: MAIN.hollowroot, title: 'The Felling of Hollowroot', kind: 'main', act: 2, giver: 'npc.woodwardBrann',
      summary: 'Below the Sundered Gorge, Covenant fellers are cutting Hollowroot\'s spirit-trees into beams for Greyspire.',
      chronicle: chron(
        'Beyond the Sundered Gorge, Hollowroot\'s woodward begs for help.',
        'Meet Moss, break the felling crew, find the grove\'s dryad with Drake-Sight, and stop Fellwarden Grath.',
        'The Heartwood stands. Moss walks with the party now, and the forest hums behind him.',
      ),
      discoverWhen: all(questIs(MAIN.marrowgate, 'COMPLETED'), any(crossed('glide', GATE.sunderedGorge), crossed('glide', GATE.dustGorge))),
      activateWhen: accepted(MAIN.hollowroot),
      objectives: [
        obj('meetMoss', 'Meet Moss at the weald shrine.', talked('npc.moss'), P(108, 145)),
        obj('crew', 'Break the felling crew.', defeated('enc.fellingCrew'), P(160, 160), talked('npc.moss')),
        obj('dryad', 'Find the grove\'s dryad with Drake-Sight.', fieldDone('drakeSight', 'npc.dryadSilla'), P(165, 175), defeated('enc.fellingCrew')),
        obj('pact', 'Hear Silla\'s pact.', flagIs('hollowroot.grovePact'), P(165, 175), fieldDone('drakeSight', 'npc.dryadSilla')),
        obj('grath', 'Defeat Fellwarden Grath and liberate the Heartwood.', liberated(R.heart), P(188, 200), flagIs('hollowroot.grovePact')),
      ],
      rewards: [{ type: 'hero', heroId: 'moss' }, { type: 'gear', gearId: 'armor.heartwoodMail' }, { type: 'xp', amount: 1500 }, { type: 'coin', amount: 350 }],
    },
    {
      id: MOSS1, chain: { id: CHAIN.moss, stage: 1, of: 3, title: 'Old as the Bramble' }, title: 'The Eldest Grove', kind: 'companion', act: 2, companion: 'moss', giver: 'npc.eldestOak',
      summary: 'Behind a wall of living wood stands the first oak of Hollowroot. Moss has not visited in a century.',
      chronicle: chron('Moss wants to pay a visit.', 'Commune with the Eldest Grove and speak with the first oak.', 'The Eldest Oak gave Moss its seed. He carries it next to his heart.'),
      discoverWhen: questIs(MAIN.hollowroot, 'COMPLETED'),
      activateWhen: crossed('commune', GATE.heartGrove),
      objectives: [
        obj('open', 'Commune with the Eldest Grove (Moss).', crossed('commune', GATE.heartGrove), P(220, 60)),
        obj('oak', 'Speak with the Eldest Oak.', flagIs('moss.oakSpoke'), P(236, 64), crossed('commune', GATE.heartGrove)),
      ],
      rewards: [{ type: 'gear', gearId: 'relic.seedOfFirstGrove' }, { type: 'xp', amount: 1000 }],
    },
    {
      id: PIM2, chain: { id: CHAIN.pim, stage: 2, of: 3, title: 'Spring-Wound' }, title: 'Across the Foam', kind: 'companion', act: 2, companion: 'pim', giver: 'npc.rapidsKeeperWyn',
      summary: 'Tib says the original spring-pattern is carved on a token in a shrine beyond Hollowroot\'s rapids.',
      chronicle: chron('Pim has a sketch of a shrine in the woods.', 'Bring down a thornstag, bound the Foam Rapids, and copy the spring-pattern at Wyn\'s shrine.', 'Pim copied the spring-pattern — and noticed whose face was on the token.'),
      discoverWhen: questIs('companion.pim.oasis', 'COMPLETED'),
      activateWhen: fieldDone('huntShot', 'thornstag'),
      objectives: [
        obj('stag', 'Bring down a thornstag with a bowshot (Pim or Tobin).', fieldDone('huntShot', 'thornstag'), P(110, 225)),
        obj('rapids', 'Spring-leap the Foam Rapids (Pim).', crossed('leap', GATE.foamRapids), P(40, 150)),
        obj('wyn', 'Copy the spring-pattern at the shrine.', flagIs('pim.rapidsDone'), P(24, 160), all(crossed('leap', GATE.foamRapids), fieldDone('huntShot', 'thornstag'))),
      ],
      rewards: [{ type: 'xp', amount: 1300 }, { type: 'item', itemId: 'item.emberDraught', qty: 3 }],
    },
  ],
};
