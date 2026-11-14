/** (−1,0) — Act I: Marrowgate Bastion, the border fortress. Hadrik joins. */
import type { ChapterContent } from '../dsl';
import { acceptChoice, byId, catchItem, chron, chunkAt, dlg, foe, gate, material, npc, obj, prop, setFlag } from '../dsl';
import { accepted, all, always, any, built, crossed, defeated, fieldDone, flagIs, liberated, not, questAtLeast, questIs, recruited, talked } from '../conditions';
import { CHAIN, GATE, MAIN, QUEST } from '../ids';

const P = chunkAt(-1, 0);
const R = { fort: 'marrowgate', moor: 'cairnfield', quarry: 'quarryCut' } as const;
const TOBIN2 = 'companion.tobin.highMoor';
const VESNA2 = 'companion.vesna.ringSister';
const HADRIK1 = 'companion.hadrik.trappedCrew';
const HADRIK3 = 'companion.hadrik.overseer';
const TQ = 'township.highLodge';

export const marrowgate: ChapterContent = {
  chunk: { cx: -1, cz: 0, name: 'The Marrowgate March', biome: 'highland', act: 1, scatterProps: ['fortWall', 'basalt', 'fence'], foliageDensity: 0.6 },
  regions: [
    { id: R.fort, name: 'Marrowgate Bastion', biome: 'highland', center: P(130, 120), radius: 34, occupied: true,
      blurb: 'The frontier\'s border fortress. The Covenant garrison that took it calls the quarrymen "volunteers".' },
    { id: R.moor, name: 'Cairnfield Moor', biome: 'highland', center: P(60, 195), radius: 32, occupied: false,
      blurb: 'Heather, cairns and crag ibex. The wind never decides which way to blow.' },
    { id: R.quarry, name: 'The Quarry Cut', biome: 'highland', center: P(195, 45), radius: 26, occupied: false,
      blurb: 'Where Covenant quarrymen cut grey stone for Greyspire, until one of them stopped.' },
  ],
  water: [{ center: P(200, 200), radius: 12, kind: 'lake' }],
  paths: [
    { points: [P(250, 110), P(205, 115), P(160, 120), P(130, 120)], width: 3.5 },
    { points: [P(130, 120), P(125, 60), P(120, 0)], width: 3 },
    { points: [P(130, 120), P(70, 128), P(0, 130)], width: 3 },
    { points: [P(130, 120), P(138, 190), P(140, 250)], width: 3 },
    { points: [P(160, 120), P(190, 70), P(200, 40)], width: 2.5 },
    { points: [P(138, 190), P(80, 190), P(50, 175)], width: 2 },
  ],
  props: [
    prop('fortWall', P(110, 100), { rotation: 0, scale: 1.4 }), prop('fortWall', P(150, 100), { scale: 1.4 }),
    prop('fortWall', P(110, 142), { scale: 1.4 }), prop('fortWall', P(150, 142), { scale: 1.4 }),
    prop('gateArch', P(166, 120), { rotation: 1.57, scale: 1.3 }), prop('tower', P(100, 120), { scale: 1.3 }),
    prop('tower', P(145, 112)), prop('house', P(122, 130)), prop('chapel', P(132, 106), { tint: '#9aa0a6' }),
    prop('tent', P(205, 105)), prop('tent', P(213, 122)), prop('campfire', P(220, 112)),
    prop('basalt', P(185, 30)), prop('basalt', P(205, 25)), prop('ruin', P(178, 58)),
    prop('fence', P(70, 205), { rotation: 0.6 }), prop('obelisk', P(45, 150)), prop('statue', P(30, 225)),
    prop('sign', P(232, 104)), prop('bridge', P(140, 232), { rotation: 1.57 }), prop('lantern', P(160, 132), { tint: '#e8f0ff' }),
  ],
  gates: [
    gate(GATE.fallenPass, 'boulder', 'The Fallen Pass', P(0, 130), [P(6, 130), P(-6, 130)], { width: 10, depth: 4, rotation: 1.57 }),
    gate(GATE.sunderedGorge, 'chasm', 'The Sundered Gorge', P(140, 250), [P(140, 243), P(140, 257)], { width: 12, depth: 6 }),
    gate(GATE.quarryRubble, 'boulder', 'Collapsed Quarry Shaft', P(215, 58), [P(209, 58), P(221, 58)], { width: 6, depth: 4, rotation: 1.57 }),
  ],
  npcs: [
    npc('npc.captainRue', 'Captain Rue', 'Lanternwick militia', 'npc.captain', P(200, 120), [
      [questIs(MAIN.marrowgate, 'COMPLETED'), 'dlg.rue.after'],
      [questIs(MAIN.marrowgate, 'ACTIVE'), 'dlg.rue.hint'],
      [questIs(MAIN.marrowgate, 'DISCOVERED'), 'dlg.rue.offer'],
      [always, 'dlg.rue.idle'],
    ]),
    npc('npc.hadrik', 'Hadrik', 'Quarry-Shield', 'hero.hadrik', P(190, 52), [
      [flagIs('marrowgate.tunnelOpen'), 'dlg.hadrik.ready'],
      [always, 'dlg.hadrik.meet'],
    ], { presentWhen: not(questIs(MAIN.marrowgate, 'COMPLETED')) }),
    npc('npc.sapperNim', 'Nim', 'Hidden sapper', 'npc.sapper', P(170, 150), [
      [flagIs('marrowgate.tunnelOpen'), 'dlg.nim.after'],
      [always, 'dlg.nim.tunnel'],
    ], { hiddenUntilDrakeSight: true, presentWhen: talked('npc.hadrik') }),
    npc('npc.quartermasterBel', 'Bel', 'Bastion quartermaster', 'npc.quartermaster', P(118, 112), [
      [all(liberated(R.fort), not(flagIs('clue:garrisonLog'))), 'dlg.bel.log'],
      [always, 'dlg.bel.idle'],
    ]),
    npc('npc.quarrymanDobbs', 'Dobbs', 'Quarryman', 'npc.quarryman', P(200, 40), [
      [all(questIs(HADRIK3, 'ACTIVE'), defeated('enc.quarryOverseer')), 'dlg.dobbs.free'],
      [not(flagIs('clue:quarryCarts')), 'dlg.dobbs.carts'],
      [always, 'dlg.dobbs.idle'],
    ]),
    npc('npc.trappedJessup', 'Jessup', 'Trapped quarry foreman', 'npc.quarryman', P(226, 62), [
      [all(questIs(HADRIK1, 'ACTIVE'), not(flagIs('hadrik.crewFreed'))), 'dlg.jessup.freed'],
      [always, 'dlg.jessup.idle'],
    ], { presentWhen: crossed('roll', GATE.quarryRubble) }),
    npc('npc.trapperKestrel', 'Kestrel', 'Moor trapper', 'npc.trapper', P(80, 178), [
      [recruited('npc.trapperKestrel'), 'dlg.kestrel.township'],
      [questAtLeast(TQ, 'ACTIVE'), 'dlg.kestrel.ready'],
      [always, 'dlg.kestrel.offer'],
    ]),
    npc('npc.moorWardenAsh', 'Ash Corrie', 'Moor warden', 'npc.warden', P(40, 172), [
      [all(questIs(TOBIN2, 'ACTIVE'), defeated('enc.moorPoachers'), fieldDone('huntShot', 'cragIbex')), 'dlg.corrie.census'],
      [questIs(TOBIN2, 'ACTIVE'), 'dlg.corrie.hint'],
      [always, 'dlg.corrie.idle'],
    ]),
    npc('npc.pitBossRhonda', 'Rhonda', 'Pit-boss of the bastion yard', 'npc.ringmaster', P(140, 130), [
      [all(questIs(VESNA2, 'ACTIVE'), defeated('enc.marrowPit')), 'dlg.rhonda.won'],
      [questIs(VESNA2, 'ACTIVE'), 'dlg.rhonda.hint'],
      [always, 'dlg.rhonda.idle'],
    ], { presentWhen: liberated(R.fort) }),
  ],
  zones: [
    { id: 'zone.cragHounds', encounterId: 'enc.cragHounds', position: P(60, 235), radius: 6, sprite: 'enemy.beast.cragHound', once: false },
    { id: 'zone.bastionPatrol', encounterId: 'enc.bastionPatrol', position: P(95, 165), radius: 6, sprite: 'enemy.humanoid.bastionPikeman', once: false },
    { id: 'zone.marrowGate', encounterId: 'enc.marrowGate', position: P(175, 128), radius: 6, sprite: 'enemy.humanoid.marrowCaptain', once: true,
      presentWhen: flagIs('marrowgate.tunnelOpen') },
    { id: 'zone.marshalVale', encounterId: 'enc.marshalVale', position: P(128, 118), radius: 7, sprite: 'enemy.humanoid.marshalVale', once: true,
      presentWhen: defeated('enc.marrowGate') },
    { id: 'zone.moorPoachers', encounterId: 'enc.moorPoachers', position: P(25, 200), radius: 6, sprite: 'enemy.humanoid.moorPoacher', once: true,
      presentWhen: questIs(TOBIN2, 'ACTIVE') },
    { id: 'zone.marrowPit', encounterId: 'enc.marrowPit', position: P(150, 155), radius: 6, sprite: 'enemy.humanoid.pitChampion', once: true,
      presentWhen: questIs(VESNA2, 'ACTIVE') },
    { id: 'zone.quarryOverseer', encounterId: 'enc.quarryOverseer', position: P(175, 20), radius: 7, sprite: 'enemy.humanoid.quarryOverseer', once: true,
      presentWhen: questIs(HADRIK3, 'ACTIVE') },
  ],
  spots: [{ id: 'spot.moorTarn', name: 'Cairn Tarn', position: P(200, 186), fish: ['fish.moorChar', 'fish.peatPike', 'fish.bastionSturgeon'] }],
  enemies: {
    bastionPikeman: foe('bastionPikeman', 'Bastion Pikeman', 'enemy.humanoid.bastionPikeman', 8, 'tank', {
      affinities: { holy: 0.8, earth: 1.2 }, skills: ['skill.enemy.shieldWall', 'skill.enemy.titheStrike'],
      drops: [{ itemId: 'item.bastionSteel', chance: 0.5 }, { itemId: 'item.tonic', chance: 0.25 }],
    }),
    cragHound: foe('cragHound', 'Crag Hound', 'enemy.beast.cragHound', 8, 'skirmisher', {
      affinities: { earth: 0.7, fire: 1.25 }, skills: ['skill.enemy.gnash', 'skill.enemy.packHowl'],
      drops: [{ itemId: 'item.wolfPelt', chance: 0.6 }, { itemId: 'item.ibexHorn', chance: 0.2 }],
    }),
    quarryHulk: foe('quarryHulk', 'Quarry Hulk', 'enemy.beast.quarryHulk', 9, 'brute', {
      affinities: { earth: 0.5, water: 1.4 }, skills: ['skill.enemy.gnash'],
      drops: [{ itemId: 'item.bastionSteel', chance: 0.3 }],
    }),
    marrowCaptain: foe('marrowCaptain', 'Gate-Captain Ferrow', 'enemy.humanoid.marrowCaptain', 9, 'brute', {
      affinities: { holy: 0.8 }, skills: ['skill.enemy.titheStrike', 'skill.enemy.crowdRoar'],
      drops: [{ itemId: 'item.bastionSteel', chance: 1 }],
    }),
    moorPoacher: foe('moorPoacher', 'Moor Poacher', 'enemy.humanoid.moorPoacher', 10, 'skirmisher', {
      affinities: {}, skills: ['skill.enemy.galeRake'], drops: [{ itemId: 'item.ibexHorn', chance: 0.6 }],
    }),
    pitChampion: foe('pitChampion', 'Brannagh the Pit-Queen', 'enemy.humanoid.pitChampion', 11, 'boss', {
      affinities: { fire: 0.9 }, skills: ['skill.enemy.ringFlourish', 'skill.enemy.crowdRoar'],
      drops: [{ itemId: 'item.hiTonic', chance: 1 }],
    }),
    marshalVale: foe('marshalVale', 'Marshal Corwen Vale', 'enemy.humanoid.marshalVale', 10, 'boss', {
      affinities: { holy: 0.6, shadow: 1.25 }, skills: ['skill.enemy.titheStrike', 'skill.enemy.shieldWall', 'skill.enemy.judgement'],
      drops: [{ itemId: 'item.bastionSteel', chance: 1 }, { itemId: 'item.hiTonic', chance: 0.6 }],
    }),
    quarryOverseer: foe('quarryOverseer', 'Overseer Grayle', 'enemy.humanoid.quarryOverseer', 15, 'boss', {
      affinities: { earth: 0.7, holy: 0.8 }, skills: ['skill.enemy.titheStrike', 'skill.enemy.auditorsGaze'],
      drops: [{ itemId: 'item.bastionSteel', chance: 1 }],
    }),
  },
  encounters: {
    'enc.cragHounds': { id: 'enc.cragHounds', name: 'Crag Hound Pack', enemies: ['cragHound', 'cragHound', 'cragHound'], canFlee: true },
    'enc.bastionPatrol': { id: 'enc.bastionPatrol', name: 'Bastion Patrol', enemies: ['bastionPikeman', 'bastionPikeman', 'quarryHulk'], canFlee: true },
    'enc.marrowGate': { id: 'enc.marrowGate', name: 'The Inner Gate', enemies: ['marrowCaptain', 'bastionPikeman', 'bastionPikeman'], canFlee: true },
    'enc.marshalVale': { id: 'enc.marshalVale', name: 'Marshal Vale', enemies: ['marshalVale', 'bastionPikeman', 'quarryHulk'], canFlee: false, boss: true, liberatesRegion: R.fort },
    'enc.moorPoachers': { id: 'enc.moorPoachers', name: 'Moor Poachers', enemies: ['moorPoacher', 'moorPoacher', 'cragHound'], canFlee: true },
    'enc.marrowPit': { id: 'enc.marrowPit', name: 'The Bastion Pit', enemies: ['pitChampion', 'cragHound'], canFlee: false },
    'enc.quarryOverseer': { id: 'enc.quarryOverseer', name: 'Overseer Grayle', enemies: ['quarryOverseer', 'quarryHulk', 'quarryHulk'], canFlee: false, boss: true },
  },
  species: {
    cragIbex: { id: 'cragIbex', name: 'Crag Ibex', sprite: 'animal.deer.cragIbex', speed: 8.5, wanderSpeed: 0.9, alertRadius: 18, scentSensitivity: 2.4,
      drops: [{ itemId: 'item.ibexHorn', chance: 0.75 }, { itemId: 'item.softHide', chance: 0.5 }], herd: { min: 2, max: 3 }, habitat: [{ center: P(45, 60), radius: 16 }] },
    heathGrouse: { id: 'heathGrouse', name: 'Heath Grouse', sprite: 'animal.bird.heathGrouse', speed: 10, wanderSpeed: 0.8, alertRadius: 11, scentSensitivity: 0.6,
      drops: [{ itemId: 'item.heathPlume', chance: 0.9 }, { itemId: 'item.grouseFeather', chance: 0.4 }], herd: { min: 2, max: 3 }, habitat: [{ center: P(105, 225), radius: 12 }] },
  },
  fish: {
    'fish.moorChar': { id: 'fish.moorChar', name: 'Moor Char', itemId: 'item.fish.moorChar', rarity: 'common', fight: 0.24, weight: 40 },
    'fish.peatPike': { id: 'fish.peatPike', name: 'Peat Pike', itemId: 'item.fish.peatPike', rarity: 'uncommon', fight: 0.48, weight: 16, preferredLure: 'item.lure.silverSpoon' },
    'fish.bastionSturgeon': { id: 'fish.bastionSturgeon', name: 'Bastion Sturgeon', itemId: 'item.fish.bastionSturgeon', rarity: 'rare', fight: 0.66, weight: 6, preferredLure: 'item.lure.emberFly' },
  },
  items: {
    'item.ibexHorn': material('item.ibexHorn', 'Ibex Horn', 'Ridged and heavy. Bows and hunting-lodge beams both want it.', '🐐', 18),
    'item.heathPlume': material('item.heathPlume', 'Heath Plume', 'Barred brown feathers for fletching.', '🪶', 8),
    'item.bastionSteel': material('item.bastionSteel', 'Bastion Steel', 'Good border steel, Covenant-stamped. Gilda will unstamp it.', '⚙️', 26),
    'item.fish.moorChar': catchItem('item.fish.moorChar', 'Moor Char', 'Speckled, cold-blooded, tasty.', 22, 6),
    'item.fish.peatPike': catchItem('item.fish.peatPike', 'Peat Pike', 'Brown as the water it hides in.', 36, 20),
    'item.fish.bastionSturgeon': catchItem('item.fish.bastionSturgeon', 'Bastion Sturgeon', 'Armoured like the fortress it is named for.', 55, 70, '🐟'),
  },
  dialogues: byId([
    dlg('dlg.rue.idle', [
      ['Captain Rue', 'Lanternwick militia. All twelve of us.'],
      ['Captain Rue', 'We watch the bastion. The bastion watches us back.'],
    ]),
    dlg('dlg.rue.offer', [
      ['Captain Rue', 'Marrowgate held this border for two hundred years. The Covenant took it in a night, with prayers instead of ladders.'],
      ['Captain Rue', 'They\'re working the quarrymen to death for Greyspire stone. One of them — a big fellow, Hadrik — keeps breaking out. He says he knows a way in.'],
    ], { choices: acceptChoice(MAIN.marrowgate, 'Let\'s take the bastion back.') }),
    dlg('dlg.rue.hint', [
      ['Captain Rue', 'Hadrik\'s camped in the Quarry Cut, north-east. Talk to him first.'],
      ['Captain Rue', 'When the gate falls, my twelve will follow you in.'],
    ]),
    dlg('dlg.rue.after', [
      ['Captain Rue', 'Marrowgate flies Lanternwick\'s lantern. I\'m going to need more than twelve.'],
      ['Captain Rue', 'West, the pass to the marshes is choked with fallen rock. South, the gorge to the great forest. Your new friends might manage both.'],
    ]),
    dlg('dlg.hadrik.meet', [
      ['Hadrik', 'You\'re the drake-boy. Good. I need someone who can see in the dark.'],
      ['Hadrik', 'Old Nim the sapper dug us a tunnel under the bastion. Then the Covenant glamoured it, and Nim with it.'],
      ['Hadrik', 'Find Nim, find the tunnel. I\'ll do the knocking.'],
    ]),
    dlg('dlg.hadrik.ready', [
      ['Hadrik', 'Tunnel\'s open. Gate-captain first, then the Marshal.'],
      ['Hadrik', 'After that, I\'ll carry this maul wherever you\'re going. I\'m done carrying stone for them.'],
    ]),
    dlg('dlg.nim.tunnel', [
      ['Nim', 'Seen! At last! Do you know how dull it is being a glamour?'],
      ['Nim', 'Tunnel comes up behind the inner gate. I\'ve unblocked it. Mind your heads; Hadrik never does.'],
    ], { onEnd: [setFlag('marrowgate.tunnelOpen')] }),
    dlg('dlg.nim.after', [
      ['Nim', 'I\'m staying invisible a while longer. It\'s grown on me.'],
      ['Nim', 'Or I\'ve grown on it.'],
    ]),
    dlg('dlg.bel.log', [
      ['Bel', 'The Marshal kept a garrison log. Twenty years back there\'s an entry: "Lantern procession passed north to Ashfall. Escort provided."'],
      ['Bel', 'Signed by Deacon Corvane. It\'s been gnawing at me ever since I read it.'],
    ], { onEnd: [setFlag('clue:garrisonLog')] }),
    dlg('dlg.bel.idle', [
      ['Bel', 'Stores are full of Covenant iron and empty of bread.'],
      ['Bel', 'I can fix half of that.'],
    ]),
    dlg('dlg.dobbs.carts', [
      ['Dobbs', 'We don\'t just cut stone. Every month a sealed cart comes from the quarry chapel, humming, bound for the Greyspire Works.'],
      ['Dobbs', 'Carts don\'t hum. Spirits do.'],
    ], { onEnd: [setFlag('clue:quarryCarts')] }),
    dlg('dlg.dobbs.idle', [
      ['Dobbs', 'Hadrik was the only one of us who said no out loud.'],
      ['Dobbs', 'Now we all say it. Loudly.'],
    ]),
    dlg('dlg.dobbs.free', [
      ['Dobbs', 'Grayle\'s finished. The Cut belongs to whoever cuts it.'],
      ['Hadrik', 'Then cut something for yourselves. Homes. Not cathedrals.'],
      ['Dobbs', 'And this — the gate-ward\'s pauldron. The lads want you to have it.'],
    ], { onEnd: [setFlag('hadrik.quarryFree')] }),
    dlg('dlg.jessup.freed', [
      ['Jessup', 'Daylight! Hadrik, you great boulder, I knew you\'d roll back for us.'],
      ['Hadrik', 'Six of you, Jessup. I counted every night.'],
    ], { onEnd: [setFlag('hadrik.crewFreed')] }),
    dlg('dlg.jessup.idle', [
      ['Jessup', 'We\'re digging a proper exit now. One that doesn\'t need Hadrik.'],
      ['Jessup', 'He\'ll be offended.'],
    ]),
    dlg('dlg.kestrel.offer', [
      ['Kestrel', 'I trap the moor and sell to whoever pays. Lately that\'s been the garrison.'],
      ['Kestrel', 'A frontier village with a hunting lodge, you say? Wardens that know the wind? I could be talked into it.'],
    ], { choices: acceptChoice(TQ, 'Build a lodge with us.', 'Another time.') }),
    dlg('dlg.kestrel.ready', [
      ['Kestrel', 'Write me into your Hearthstead ledger.'],
      ['Kestrel', 'Ibex horn for the beams, heath plumes for the fletching table.'],
    ]),
    dlg('dlg.kestrel.township', [
      ['Kestrel', 'Lodge fire\'s lit. The wind-vane on the roof never lies.'],
      ['Kestrel', 'Upgrade the lodge and I\'ll teach your wardens to read the gusts.'],
    ]),
    dlg('dlg.corrie.idle', [
      ['Ash Corrie', 'Moor warden. Mostly I count ibex and shout at poachers.'],
      ['Ash Corrie', 'Tobin Marsh? Old Holt\'s boy? Tell him the moor misses him.'],
    ]),
    dlg('dlg.corrie.hint', [
      ['Ash Corrie', 'Poachers on the west cairns, ibex on the north crags. Bring me one clean shot and one clean sweep.'],
      ['Tobin', 'Same as old times.'],
    ]),
    dlg('dlg.corrie.census', [
      ['Ash Corrie', 'One ibex, shot through the heart from downwind. Poachers sent running. Holt taught you well.'],
      ['Ash Corrie', 'He left this compass with me for when you\'d earned it. The needle points into the wind.'],
    ], { onEnd: [setFlag('tobin.censusDone')] }),
    dlg('dlg.rhonda.idle', [
      ['Rhonda', 'The garrison ran a fighting pit in the yard. The garrison\'s gone. The pit stays.'],
      ['Rhonda', 'Free bouts now. Nobody\'s marker on the line.'],
    ]),
    dlg('dlg.rhonda.hint', [
      ['Rhonda', 'Vesna? The Cinder Ring\'s Vesna? Brannagh will want a piece of you.'],
      ['Rhonda', 'Bring her a fresh ibex you caught yourself — pit tradition — then step into the yard.'],
    ]),
    dlg('dlg.rhonda.won', [
      ['Rhonda', 'Brannagh\'s never lost in this yard. She\'s laughing about it, which is new.'],
      ['Vesna', 'She fights like my sister used to. Before the Ring bought her marker too.'],
      ['Rhonda', 'Then you know where to look next. The old champions went south — to the Sunken Ring in Saffrane.'],
    ], { onEnd: [setFlag('vesna.pitWon')] }),
  ]),
  quests: [
    {
      id: MAIN.marrowgate, title: 'The Siege of Marrowgate', kind: 'main', act: 1, giver: 'npc.captainRue',
      summary: 'The Covenant holds the border bastion of Marrowgate and works the quarrymen to death for Greyspire stone. One of them, Hadrik, knows a way in.',
      chronicle: chron(
        'Lanternwick militia are watching Marrowgate. They could use help.',
        'Meet Hadrik in the Quarry Cut, find the glamoured sapper with Drake-Sight, then storm the inner gate and break Marshal Vale.',
        'Marrowgate is free. Hadrik rolled through the inner gate like a landslide and has decided to keep rolling with the party.',
      ),
      discoverWhen: questIs(MAIN.galecrest, 'COMPLETED'),
      activateWhen: accepted(MAIN.marrowgate),
      objectives: [
        obj('meetHadrik', 'Meet Hadrik in the Quarry Cut.', talked('npc.hadrik'), P(190, 52)),
        obj('findSapper', 'Find the glamoured sapper with Drake-Sight.', fieldDone('drakeSight', 'npc.sapperNim'), P(170, 150), talked('npc.hadrik')),
        obj('openTunnel', 'Hear Nim out.', flagIs('marrowgate.tunnelOpen'), P(170, 150), fieldDone('drakeSight', 'npc.sapperNim')),
        obj('takeGate', 'Take the inner gate.', defeated('enc.marrowGate'), P(175, 128), flagIs('marrowgate.tunnelOpen')),
        obj('breakMarshal', 'Break Marshal Vale and liberate Marrowgate.', liberated(R.fort), P(128, 118), defeated('enc.marrowGate')),
      ],
      rewards: [{ type: 'hero', heroId: 'hadrik' }, { type: 'gear', gearId: 'armor.bastionHauberk' }, { type: 'xp', amount: 600 }, { type: 'coin', amount: 220 }, { type: 'flag', key: 'act1.marrowgate', value: true }],
    },
    {
      id: TOBIN2, chain: { id: CHAIN.tobin, stage: 2, of: 3, title: 'The Warden\'s Oath' }, title: 'The High Moor Census', kind: 'companion', act: 2, companion: 'tobin', giver: 'npc.moorWardenAsh',
      summary: 'Holt\'s last words point Tobin to the moor warden of Cairnfield, who has something of Holt\'s — once Tobin proves he still hunts like a warden.',
      chronicle: chron('Tobin keeps glancing toward the high moor.', 'Shoot a crag ibex cleanly from downwind and drive off the moor poachers, then report to Ash Corrie.', 'Ash Corrie handed Tobin the Hearthwood Compass. Its needle points into the wind, as a warden\'s should.'),
      discoverWhen: all(questIs('companion.tobin.oath', 'COMPLETED'), questIs(MAIN.marrowgate, 'COMPLETED')),
      activateWhen: always,
      objectives: [
        obj('shootIbex', 'Take a crag ibex with Tobin\'s bowshot.', fieldDone('huntShot', 'cragIbex'), P(45, 60)),
        obj('poachers', 'Drive off the moor poachers.', defeated('enc.moorPoachers'), P(25, 200)),
        obj('report', 'Report to Ash Corrie.', flagIs('tobin.censusDone'), P(40, 172), all(fieldDone('huntShot', 'cragIbex'), defeated('enc.moorPoachers'))),
      ],
      rewards: [{ type: 'gear', gearId: 'relic.hearthwoodCompass' }, { type: 'xp', amount: 500 }],
    },
    {
      id: VESNA2, chain: { id: CHAIN.vesna, stage: 2, of: 3, title: 'Debts of the Cinder Ring' }, title: 'The Ring-Sister', kind: 'companion', act: 2, companion: 'vesna', giver: 'npc.pitBossRhonda',
      summary: 'Marrowgate\'s yard pit has a champion who fights like someone Vesna used to know.',
      chronicle: chron('Vesna heard the bastion pit is open again.', 'Bring the pit-boss a crag ibex run down by hand, then beat Brannagh the Pit-Queen.', 'Brannagh fell laughing. The old champions, Rhonda says, went south to the Sunken Ring.'),
      discoverWhen: all(questIs(QUEST.debts, 'COMPLETED'), questIs(MAIN.marrowgate, 'COMPLETED')),
      activateWhen: always,
      objectives: [
        obj('dashIbex', 'Run down a crag ibex with a dash.', fieldDone('huntDash', 'cragIbex'), P(45, 60)),
        obj('winPit', 'Win the bout in the bastion pit.', defeated('enc.marrowPit'), P(150, 155), fieldDone('huntDash', 'cragIbex')),
        obj('talkRhonda', 'Talk to Rhonda after the bout.', flagIs('vesna.pitWon'), P(140, 130), defeated('enc.marrowPit')),
      ],
      rewards: [{ type: 'xp', amount: 520 }, { type: 'coin', amount: 180 }],
    },
    {
      id: HADRIK1, chain: { id: CHAIN.hadrik, stage: 1, of: 3, title: 'Quarry-Shield' }, title: 'The Trapped Crew', kind: 'companion', act: 1, companion: 'hadrik', giver: 'npc.quarrymanDobbs',
      summary: 'A shaft collapsed in the Quarry Cut the night Hadrik escaped. He has counted the men behind it every night since.',
      chronicle: chron('Hadrik won\'t stop looking at the collapsed shaft.', 'Roll through the collapsed quarry shaft and bring Jessup\'s crew out.', 'Six quarrymen saw daylight. Hadrik pretended there was dust in his eyes.'),
      discoverWhen: questIs(MAIN.marrowgate, 'COMPLETED'),
      activateWhen: always,
      objectives: [
        obj('rollShaft', 'Roll through the collapsed shaft (Hadrik).', crossed('roll', GATE.quarryRubble), P(215, 58)),
        obj('freeCrew', 'Free Jessup\'s crew.', flagIs('hadrik.crewFreed'), P(226, 62), crossed('roll', GATE.quarryRubble)),
      ],
      rewards: [{ type: 'xp', amount: 300 }, { type: 'item', itemId: 'item.bastionSteel', qty: 2 }],
    },
    {
      id: HADRIK3, chain: { id: CHAIN.hadrik, stage: 3, of: 3, title: 'Quarry-Shield' }, title: 'Overseer Grayle', kind: 'companion', act: 2, companion: 'hadrik', giver: 'npc.quarrymanDobbs',
      summary: 'The Covenant sent a new overseer to the Quarry Cut — the man who broke Hadrik\'s wrist the year he refused.',
      chronicle: chron('Word from the Cut: Overseer Grayle is back.', 'Return through the Fallen Pass and break Overseer Grayle\'s hold on the Quarry Cut.', 'Grayle is gone and the Cut is the quarrymen\'s. They gave Hadrik the gate-ward\'s pauldron.'),
      discoverWhen: questIs('companion.hadrik.rockfall', 'COMPLETED'),
      activateWhen: always,
      objectives: [
        obj('pass', 'Roll the Fallen Pass clear (Hadrik).', crossed('roll', GATE.fallenPass), P(0, 130)),
        obj('grayle', 'Defeat Overseer Grayle in the Quarry Cut.', defeated('enc.quarryOverseer'), P(175, 20)),
        obj('freeCut', 'Tell Dobbs the Cut is theirs.', flagIs('hadrik.quarryFree'), P(200, 40), defeated('enc.quarryOverseer')),
      ],
      rewards: [{ type: 'gear', gearId: 'sig.bastionPauldron' }, { type: 'xp', amount: 900 }],
    },
    {
      id: TQ, title: 'A Lodge on the Wind', kind: 'township', act: 1, giver: 'npc.trapperKestrel',
      summary: 'Kestrel the moor trapper could run a hunting lodge in Hearthstead.',
      chronicle: chron('A moor trapper asked what Hearthstead pays.', 'Recruit Kestrel and raise the Hunting Lodge.', 'The Hunting Lodge\'s wind-vane turns over Hearthstead.'),
      discoverWhen: any(talked('npc.trapperKestrel'), accepted(TQ)),
      activateWhen: accepted(TQ),
      objectives: [
        obj('recruitKestrel', 'Invite Kestrel to Hearthstead (Hearthstead ledger).', recruited('npc.trapperKestrel'), P(80, 178)),
        obj('buildLodge', 'Build the Hunting Lodge on a Hearthstead plot.', built('building.lodge'), undefined, recruited('npc.trapperKestrel')),
      ],
      rewards: [{ type: 'item', itemId: 'item.smokedVenison', qty: 4 }, { type: 'xp', amount: 160 }],
    },
  ],
};
