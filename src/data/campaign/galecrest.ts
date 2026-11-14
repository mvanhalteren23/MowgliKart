/** (−1,−1) — Act I: Galecrest, the wind-spire city. Orla joins. */
import type { ChapterContent } from '../dsl';
import { acceptChoice, byId, catchItem, chron, chunkAt, dlg, foe, gate, material, npc, obj, prop, setFlag } from '../dsl';
import { accepted, all, always, any, crossed, defeated, fieldDone, flagIs, liberated, not, questAtLeast, questIs, recruited, built, talked } from '../conditions';
import { CHAIN, GATE, MAIN, QUEST } from '../ids';

const P = chunkAt(-1, -1);
const R = { city: 'galecrest', spire: 'chimeSpire', terraces: 'updraftTerraces' } as const;
const ORLA1 = 'companion.orla.updraft';
const SABLE2 = 'companion.sable.chimeLedge';
const TQ = 'township.highWindHerbs';

export const galecrest: ChapterContent = {
  chunk: { cx: -1, cz: -1, name: 'Galecrest Heights', biome: 'skyreach', act: 1, scatterProps: ['windmill', 'skyPlatform', 'crystal'], foliageDensity: 0.45 },
  regions: [
    { id: R.city, name: 'Galecrest', biome: 'skyreach', center: P(135, 100), radius: 36, occupied: false,
      blurb: 'A city of windmills and sky-docks on stone spires. Its mills have stood still for a month.' },
    { id: R.spire, name: 'The Chime Spire', biome: 'skyreach', center: P(60, 62), radius: 24, occupied: true,
      blurb: 'The Covenant hung its chime-cages here. Since then, the wind will not blow.' },
    { id: R.terraces, name: 'Updraft Terraces', biome: 'skyreach', center: P(185, 190), radius: 28, occupied: false,
      blurb: 'Broken sky-platforms over a gulf of warm air. Only a glider can reach the top.' },
  ],
  water: [{ center: P(70, 180), radius: 12, kind: 'lake' }],
  paths: [
    { points: [P(250, 90), P(200, 95), P(150, 100), P(130, 100)], width: 3.5 },
    { points: [P(130, 100), P(125, 160), P(120, 220), P(120, 250)], width: 3 },
    { points: [P(130, 100), P(115, 50), P(110, 0)], width: 2.5 },
    { points: [P(130, 100), P(85, 80), P(62, 66)], width: 3 },
    { points: [P(125, 160), P(175, 160)], width: 2 },
    { points: [P(85, 80), P(48, 110)], width: 2 },
  ],
  props: [
    prop('windmill', P(150, 80), { scale: 1.4 }), prop('windmill', P(110, 120)), prop('windmill', P(165, 120)),
    prop('tower', P(120, 82), { scale: 1.3 }), prop('house', P(145, 110)), prop('house', P(155, 92), { tint: '#cfe3f0' }),
    prop('house', P(118, 105)), prop('stall', P(136, 118), { tint: '#4fa3d9' }), prop('skyPlatform', P(100, 140)),
    prop('skyPlatform', P(190, 185)), prop('skyPlatform', P(205, 200)), prop('bridge', P(175, 150), { rotation: 1.57 }),
    prop('tower', P(55, 55), { scale: 1.6, tint: '#c8ccd4' }), prop('lantern', P(70, 72), { tint: '#e8f0ff' }),
    prop('lantern', P(52, 72), { tint: '#e8f0ff' }), prop('crystal', P(30, 30)), prop('sign', P(200, 98)),
    prop('fence', P(40, 120)), prop('well', P(130, 92)), prop('statue', P(140, 128), { tint: '#8fb6d0' }),
  ],
  gates: [
    gate(GATE.galecrestUpdraft, 'chasm', 'Updraft Gulf', P(178, 168), [P(178, 162), P(178, 176)], { width: 10, depth: 6 }),
    gate(GATE.galecrestLedge, 'cliff', 'Chime-Ledge Cliff', P(40, 112), [P(46, 112), P(33, 112)], { width: 8, depth: 4, rotation: 1.57 }),
    gate(GATE.rimepineGrove, 'grove', 'The Rimepine Thicket', P(110, 0), [P(110, 6), P(110, -6)], { width: 12, depth: 4 }),
  ],
  npcs: [
    npc('npc.windmistressCassia', 'Windmistress Cassia', 'Governor of Galecrest', 'npc.windmistress', P(140, 96), [
      [questIs(MAIN.galecrest, 'COMPLETED'), 'dlg.cassia.after'],
      [questIs(MAIN.galecrest, 'ACTIVE'), 'dlg.cassia.hint'],
      [questIs(MAIN.galecrest, 'DISCOVERED'), 'dlg.cassia.offer'],
      [always, 'dlg.cassia.idle'],
    ]),
    npc('npc.orla', 'Orla', 'Jailed wind-chanter', 'hero.orla', P(66, 78), [
      [flagIs('galecrest.orlaFreed'), 'dlg.orla.ready'],
      [defeated('enc.spireJailers'), 'dlg.orla.freed'],
      [always, 'dlg.orla.caged'],
    ], { presentWhen: not(questIs(MAIN.galecrest, 'COMPLETED')) }),
    npc('npc.chimewrightFenn', 'Fenn', 'Chimewright', 'npc.chimewright', P(108, 96), [
      [questIs(ORLA1, 'ACTIVE'), 'dlg.fenn.updraft'],
      [always, 'dlg.fenn.idle'],
    ]),
    npc('npc.windHermitSaro', 'Saro', 'Hermit of the high platform', 'npc.hermit', P(198, 194), [
      [all(questIs(ORLA1, 'ACTIVE'), not(flagIs('orla.hymnFound'))), 'dlg.saro.hymn'],
      [always, 'dlg.saro.idle'],
    ], { presentWhen: crossed('glide', GATE.galecrestUpdraft) }),
    npc('npc.herbalistSorrel', 'Sorrel', 'Herbalist', 'npc.herbalist', P(150, 130), [
      [recruited('npc.herbalistSorrel'), 'dlg.sorrel.township'],
      [questAtLeast(TQ, 'ACTIVE'), 'dlg.sorrel.ready'],
      [always, 'dlg.sorrel.offer'],
    ]),
    npc('npc.sailmerchantJory', 'Jory', 'Sky-dock trader', 'npc.merchant', P(190, 96), [[always, 'dlg.jory.idle']]),
    npc('npc.ledgeHermitIvo', 'Ivo', 'Chime-cutter in hiding', 'npc.chimewright', P(26, 114), [
      [all(questIs(SABLE2, 'ACTIVE'), not(flagIs('sable.chimesCut'))), 'dlg.ivo.sable'],
      [not(flagIs('clue:chimeCages')), 'dlg.ivo.clue'],
      [always, 'dlg.ivo.after'],
    ], { presentWhen: crossed('grapple', GATE.galecrestLedge) }),
  ],
  zones: [
    { id: 'zone.galeHarriers', encounterId: 'enc.galeHarriers', position: P(205, 55), radius: 6, sprite: 'enemy.beast.galeHarrier', once: false },
    { id: 'zone.chimeAcolytes', encounterId: 'enc.chimeAcolytes', position: P(92, 145), radius: 6, sprite: 'enemy.humanoid.chimeAcolyte', once: false },
    { id: 'zone.spireJailers', encounterId: 'enc.spireJailers', position: P(76, 88), radius: 6, sprite: 'enemy.humanoid.spireJailer', once: true,
      presentWhen: talked('npc.orla') },
    { id: 'zone.chimeCantor', encounterId: 'enc.chimeCantor', position: P(58, 48), radius: 7, sprite: 'enemy.humanoid.chimeCantor', once: true,
      presentWhen: flagIs('galecrest.orlaFreed') },
  ],
  spots: [
    { id: 'spot.cloudTarn', name: 'Cloud Tarn', position: P(70, 194), fish: ['fish.cloudDace', 'fish.galeTrout', 'fish.skyKoi'] },
  ],
  enemies: {
    chimeAcolyte: foe('chimeAcolyte', 'Chime Acolyte', 'enemy.humanoid.chimeAcolyte', 6, 'caster', {
      affinities: { holy: 0.6, shadow: 1.3, lightning: 0.7 }, skills: ['skill.enemy.chimeToll', 'skill.enemy.acolyteMend'],
      drops: [{ itemId: 'item.chimeShard', chance: 0.5 }, { itemId: 'item.tonic', chance: 0.25 }],
    }),
    galeHarrier: foe('galeHarrier', 'Gale Harrier', 'enemy.beast.galeHarrier', 6, 'skirmisher', {
      affinities: { wind: 0.5, earth: 1.3, lightning: 1.3 }, skills: ['skill.enemy.galeRake'],
      drops: [{ itemId: 'item.galeFeather', chance: 0.6 }],
    }),
    spireJailer: foe('spireJailer', 'Spire Jailer', 'enemy.humanoid.spireJailer', 7, 'tank', {
      affinities: { holy: 0.8 }, skills: ['skill.enemy.shieldWall', 'skill.enemy.titheStrike'],
      drops: [{ itemId: 'item.covenantIron', chance: 0.6 }],
    }),
    stilledZephyr: foe('stilledZephyr', 'Stilled Zephyr', 'enemy.wisp.stilledZephyr', 7, 'caster', {
      affinities: { physical: 0.7, wind: 0.5, fire: 1.4, ice: 1.2 }, skills: ['skill.enemy.stillChill'],
      drops: [{ itemId: 'item.wispDust', chance: 0.6 }, { itemId: 'item.chimeShard', chance: 0.3 }],
    }),
    chimeCantor: foe('chimeCantor', 'Cantor Imrey of the Chimes', 'enemy.humanoid.chimeCantor', 8, 'bossCaster', {
      affinities: { holy: 0.5, wind: 0.8, shadow: 1.4, lightning: 0.6 }, skills: ['skill.enemy.chimeToll', 'skill.enemy.stillingHymn', 'skill.enemy.acolyteMend'],
      drops: [{ itemId: 'item.chimeShard', chance: 1 }, { itemId: 'item.hiTonic', chance: 0.5 }],
    }),
  },
  encounters: {
    'enc.galeHarriers': { id: 'enc.galeHarriers', name: 'Gale Harriers', enemies: ['galeHarrier', 'galeHarrier', 'galeHarrier'], canFlee: true },
    'enc.chimeAcolytes': { id: 'enc.chimeAcolytes', name: 'Chime Acolytes', enemies: ['chimeAcolyte', 'stilledZephyr', 'chimeAcolyte'], canFlee: true },
    'enc.spireJailers': { id: 'enc.spireJailers', name: 'Orla\'s Jailers', enemies: ['spireJailer', 'spireJailer', 'chimeAcolyte'], canFlee: true },
    'enc.chimeCantor': { id: 'enc.chimeCantor', name: 'Cantor Imrey', enemies: ['chimeCantor', 'stilledZephyr', 'spireJailer'], canFlee: false, boss: true, liberatesRegion: R.spire },
  },
  species: {
    galeSwift: { id: 'galeSwift', name: 'Gale Swift', sprite: 'animal.bird.galeSwift', speed: 13, wanderSpeed: 1.2, alertRadius: 15, scentSensitivity: 0.3,
      drops: [{ itemId: 'item.galeFeather', chance: 0.9 }], herd: { min: 2, max: 2 }, habitat: [{ center: P(205, 120), radius: 12 }] },
    mistDeer: { id: 'mistDeer', name: 'Mist Deer', sprite: 'animal.deer.mist', speed: 9.5, wanderSpeed: 1, alertRadius: 17, scentSensitivity: 2.8,
      drops: [{ itemId: 'item.mistVelvet', chance: 0.7 }, { itemId: 'item.softHide', chance: 0.6 }], herd: { min: 2, max: 3 }, habitat: [{ center: P(40, 210), radius: 14 }] },
  },
  fish: {
    'fish.cloudDace': { id: 'fish.cloudDace', name: 'Cloud Dace', itemId: 'item.fish.cloudDace', rarity: 'common', fight: 0.22, weight: 42 },
    'fish.galeTrout': { id: 'fish.galeTrout', name: 'Gale Trout', itemId: 'item.fish.galeTrout', rarity: 'uncommon', fight: 0.46, weight: 16, preferredLure: 'item.lure.silverSpoon' },
    'fish.skyKoi': { id: 'fish.skyKoi', name: 'Sky Koi', itemId: 'item.fish.skyKoi', rarity: 'rare', fight: 0.64, weight: 6, preferredLure: 'item.lure.emberFly' },
  },
  items: {
    'item.galeFeather': material('item.galeFeather', 'Gale Feather', 'A swift\'s flight-feather. Weighs nothing; Sorrel uses it in tinctures.', '🪶', 10),
    'item.mistVelvet': material('item.mistVelvet', 'Mist Velvet', 'Antler velvet from the spire deer, damp as a cloud.', '🦌', 22),
    'item.chimeShard': material('item.chimeShard', 'Chime Shard', 'A fragment of a stilling bell. It hums when the wind blows.', '🔔', 18),
    'item.fish.cloudDace': catchItem('item.fish.cloudDace', 'Cloud Dace', 'Pale as morning fog.', 18, 5),
    'item.fish.galeTrout': catchItem('item.fish.galeTrout', 'Gale Trout', 'Fights like a kite in a storm.', 34, 18),
    'item.fish.skyKoi': catchItem('item.fish.skyKoi', 'Sky Koi', 'Blue-white scales; Galecrest\'s luck-fish.', 50, 60, '🐠'),
  },
  dialogues: byId([
    dlg('dlg.cassia.idle', [
      ['Windmistress Cassia', 'Galecrest grinds the frontier\'s grain. Or did, while the wind blew.'],
      ['Windmistress Cassia', 'Mind the edges, lowlander. The fall is the only thing up here that never stops.'],
    ]),
    dlg('dlg.cassia.offer', [
      ['Windmistress Cassia', 'You broke Deacon Vash. Word flies faster than wind these days — there\'s no wind.'],
      ['Windmistress Cassia', 'The Covenant hung chime-cages on our spire and the air went still. They jailed our chanter, Orla, for singing against them.'],
      ['Windmistress Cassia', 'Free her. Silence the Cantor. Give us back our weather.'],
    ], { choices: acceptChoice(MAIN.galecrest, 'We\'ll bring back the wind.') }),
    dlg('dlg.cassia.hint', [
      ['Windmistress Cassia', 'Orla is held below the Chime Spire, west of the mills. Her jailers keep the keys.'],
      ['Windmistress Cassia', 'Once she\'s free, the Cantor will come for her himself.'],
    ]),
    dlg('dlg.cassia.after', [
      ['Windmistress Cassia', 'Listen. Every mill on the spires is turning.'],
      ['Windmistress Cassia', 'North of here the Rimepine closes the road. Only a druid could talk it open.'],
    ]),
    dlg('dlg.orla.caged', [
      ['Orla', 'Visitors! The jailers usually just bring soup and sermons.'],
      ['Orla', 'They want me to sing their hymn so the wind stays caged. I sang them a sea-shanty instead.'],
      ['Orla', 'Get me past those jailers and I\'ll show you what a chanter does with a free sky.'],
    ]),
    dlg('dlg.orla.freed', [
      ['Orla', 'Keys! You took the keys off a jailer. Oh, I could kiss you. I won\'t. Yet.'],
      ['Orla', 'The Cantor tolls the chimes from the spire-top. Break his bell and the wind comes back.'],
      ['Kael', 'Then let\'s break a bell.'],
    ], { onEnd: [setFlag('galecrest.orlaFreed')] }),
    dlg('dlg.orla.ready', [
      ['Orla', 'Spire-top. Cantor. Bell. In that order.'],
      ['Orla', 'And when the wind comes back, I\'m coming with you.'],
    ]),
    dlg('dlg.fenn.idle', [
      ['Fenn', 'I tune chimes. Good chimes call the wind. Covenant chimes cage it.'],
      ['Fenn', 'I tuned them both. I\'d like to un-tune one of them.'],
    ]),
    dlg('dlg.fenn.updraft', [
      ['Fenn', 'Saro lives on the top terrace, across the Updraft Gulf. He kept the old hymns when the chapel burned the books.'],
      ['Fenn', 'Orla can ride the gulf\'s thermals. Nobody else is that brave or that daft.'],
    ]),
    dlg('dlg.saro.hymn', [
      ['Saro', 'You glided the gulf! Then you\'re Orla, and you\'re finally ready.'],
      ['Saro', 'Here: every verse your mother sang on the barges, and every one the Covenant forbade. I wrote them down in the dark.'],
      ['Orla', 'It\'s heavier than it looks.'],
      ['Saro', 'Songs usually are.'],
    ], { onEnd: [setFlag('orla.hymnFound')] }),
    dlg('dlg.saro.idle', [
      ['Saro', 'Up here the wind tells me everything. Lately it says "Greyspire" a great deal.'],
      ['Saro', 'Mind the thermals on the way down.'],
    ]),
    dlg('dlg.sorrel.offer', [
      ['Sorrel', 'Feverfew, cloudroot, galeleaf — the best herbs grow where the wind is strongest.'],
      ['Sorrel', 'You\'re building a village down south? A village needs an apothecary. A village with Covenant neighbours needs one twice.'],
    ], { choices: acceptChoice(TQ, 'Come to Hearthstead.', 'Not right now.') }),
    dlg('dlg.sorrel.ready', [
      ['Sorrel', 'Put my name in your Hearthstead ledger and I\'ll pack my mortar.'],
      ['Sorrel', 'Bring gale feathers and mist velvet for the stillroom.'],
    ]),
    dlg('dlg.sorrel.township', [
      ['Sorrel', 'Lowland air is thick, but my tonics are thicker.'],
      ['Sorrel', 'Grow the stillroom and I\'ll brew stronger draughts.'],
    ]),
    dlg('dlg.jory.idle', [
      ['Jory', 'Sky-barges, sail-silk, spire honey. Nothing\'s moved since the wind died.'],
      ['Jory', 'Mist deer graze down by the south cliffs if you\'re hungry.'],
    ]),
    dlg('dlg.ivo.clue', [
      ['Ivo', 'You climbed? Nobody climbs. That\'s why I hide here.'],
      ['Ivo', 'I cast the chime-cages. Each bell has a spirit\'s voice cast into the bronze — Zephra\'s, mostly. The order came sealed from Greyspire.'],
    ], { onEnd: [setFlag('clue:chimeCages')] }),
    dlg('dlg.ivo.sable', [
      ['Sable', 'You\'re the bell-founder. Show me where you hid the last cage.'],
      ['Ivo', 'Under the ledge. I couldn\'t melt it. Couldn\'t let them have it either.'],
      ['Sable', 'I\'ll cut it open. Whatever\'s inside goes free.'],
    ], { onEnd: [setFlag('sable.chimesCut'), setFlag('clue:chimeCages')] }),
    dlg('dlg.ivo.after', [
      ['Ivo', 'I keep hearing bells in my sleep.'],
      ['Ivo', 'Lately they\'re out of tune. I think that\'s a good sign.'],
    ]),
  ]),
  quests: [
    {
      id: MAIN.galecrest, title: 'The Chimes of Galecrest', kind: 'main', act: 1, giver: 'npc.windmistressCassia',
      summary: 'The wind-spire city of Galecrest has gone still under Covenant chime-cages, and its chanter Orla is in a cell for singing about it.',
      chronicle: chron(
        'A runner from Galecrest begs Lanternwick for help: the spire-city\'s wind has died.',
        'Free the chanter Orla from her Covenant jailers and silence Cantor Imrey\'s chimes.',
        'The Chime Spire is silent and the mills turn again. Orla has joined the party, sail-cloak and all.',
      ),
      discoverWhen: questIs(QUEST.ledger, 'COMPLETED'),
      activateWhen: accepted(MAIN.galecrest),
      objectives: [
        obj('findOrla', 'Find the jailed chanter beneath the Chime Spire.', talked('npc.orla'), P(66, 78)),
        obj('breakJailers', 'Defeat Orla\'s jailers.', defeated('enc.spireJailers'), P(76, 88), talked('npc.orla')),
        obj('freeOrla', 'Free Orla.', flagIs('galecrest.orlaFreed'), P(66, 78), defeated('enc.spireJailers')),
        obj('silenceCantor', 'Silence Cantor Imrey and liberate the Chime Spire.', liberated(R.spire), P(58, 48), flagIs('galecrest.orlaFreed')),
      ],
      rewards: [{ type: 'hero', heroId: 'orla' }, { type: 'gear', gearId: 'weapon.galecrestSaber' }, { type: 'xp', amount: 380 }, { type: 'coin', amount: 160 }],
    },
    {
      id: ORLA1, chain: { id: CHAIN.orla, stage: 1, of: 3, title: 'The Unsung Hymn' }, title: 'The Updraft', kind: 'companion', act: 1, companion: 'orla', giver: 'npc.chimewrightFenn',
      summary: 'Fenn says the hermit Saro kept every hymn the Covenant forbade — on a terrace only a glider can reach.',
      chronicle: chron('Orla wants to visit an old friend across the Updraft Gulf.', 'Glide the Updraft Gulf and find Saro on the top terrace.', 'Saro gave Orla the Hymnal of the High Wind: every forbidden verse, written in the dark.'),
      discoverWhen: questIs(MAIN.galecrest, 'COMPLETED'),
      activateWhen: crossed('glide', GATE.galecrestUpdraft),
      objectives: [
        obj('glideGulf', 'Glide across the Updraft Gulf (Orla).', crossed('glide', GATE.galecrestUpdraft), P(178, 168)),
        obj('meetSaro', 'Find Saro on the top terrace.', flagIs('orla.hymnFound'), P(198, 194), crossed('glide', GATE.galecrestUpdraft)),
      ],
      rewards: [{ type: 'gear', gearId: 'relic.galeHymnal' }, { type: 'xp', amount: 260 }],
    },
    {
      id: SABLE2, chain: { id: CHAIN.sable, stage: 2, of: 3, title: 'Lantern-Thief' }, title: 'The Last Cage', kind: 'companion', act: 2, companion: 'sable', giver: 'npc.ledgeHermitIvo',
      summary: 'Sable heard a bell-founder hides on a cliff-ledge in Galecrest with one chime-cage the Covenant never collected.',
      chronicle: chron('Sable is asking about Galecrest\'s cliffs.', 'Grapple up to the chime-ledge, find the bell-founder and cut the last cage open. Bring a gale swift down by hand on the way.', 'The last chime-cage is cut and its voice is free. Sable says it sang her a thank-you; Orla says it was flat.'),
      discoverWhen: questIs('companion.sable.crevasse', 'COMPLETED'),
      activateWhen: crossed('grapple', GATE.galecrestLedge),
      objectives: [
        obj('climbLedge', 'Grapple up the chime-ledge cliff (Sable).', crossed('grapple', GATE.galecrestLedge), P(40, 112)),
        obj('cutCage', 'Cut the last chime-cage open.', flagIs('sable.chimesCut'), P(26, 114), crossed('grapple', GATE.galecrestLedge)),
        obj('dashSwift', 'Run down a gale swift with a dash (Sable or Vesna).', fieldDone('huntDash', 'galeSwift'), P(205, 120)),
      ],
      rewards: [{ type: 'xp', amount: 1100 }, { type: 'item', itemId: 'item.hiTonic', qty: 3 }],
    },
    {
      id: TQ, title: 'Herbs on the High Wind', kind: 'township', act: 1, giver: 'npc.herbalistSorrel',
      summary: 'Sorrel the Galecrest herbalist will bring her stillroom to Hearthstead.',
      chronicle: chron('A Galecrest herbalist is curious about Hearthstead.', 'Recruit Sorrel and raise her Apothecary in Hearthstead.', 'The Apothecary\'s stillroom bubbles day and night. Hearthstead smells of galeleaf.'),
      discoverWhen: any(talked('npc.herbalistSorrel'), accepted(TQ)),
      activateWhen: accepted(TQ),
      objectives: [
        obj('recruitSorrel', 'Invite Sorrel to Hearthstead (Hearthstead ledger).', recruited('npc.herbalistSorrel'), P(150, 130)),
        obj('buildApothecary', 'Build the Apothecary on a Hearthstead plot.', built('building.apothecary'), undefined, recruited('npc.herbalistSorrel')),
      ],
      rewards: [{ type: 'item', itemId: 'item.hiTonic', qty: 3 }, { type: 'xp', amount: 120 }],
    },
  ],
};
