/** (0,−1) — Act I prologue: Ashfall Hollow, the burned hall of the Ashen Drake clan. */
import type { ChapterContent } from '../dsl';
import { acceptChoice, byId, catchItem, chron, chunkAt, dlg, foe, gate, keyItem, material, npc, obj, prop, setFlag } from '../dsl';
import { all, always, crossed, defeated, entered, fieldDone, flagIs, liberated, not, questAtLeast, questIs, talked } from '../conditions';
import { CHAIN, FLAG, GATE, MAIN, QUEST } from '../ids';

const P = chunkAt(0, -1);
const R = { hollow: 'ashfallHollow', spring: 'weepingSpring' } as const;
const KAEL2 = 'companion.kael.bankedHearth';
const QUILL2 = 'companion.quill.vaultOfAshes';

export const ashfall: ChapterContent = {
  chunk: { cx: 0, cz: -1, name: 'The Ashfall Reach', biome: 'ruin', act: 1, scatterProps: ['ruin', 'statue', 'crystal'], foliageDensity: 0.35 },
  regions: [
    { id: R.hollow, name: 'Ashfall Hollow', biome: 'ruin', center: P(110, 110), radius: 38, occupied: true,
      blurb: 'The burned hall of the Ashen Drake clan. Covenant gleaners sift its ashes for anything that still remembers fire.' },
    { id: R.spring, name: 'The Weeping Spring', biome: 'ruin', center: P(55, 170), radius: 26, occupied: false,
      blurb: 'The clan\'s old well-spring, still running through the soot.' },
  ],
  water: [
    { center: P(55, 175), radius: 13, kind: 'lake' },
    { center: P(310, 125), radius: 75, kind: 'sea' },
  ],
  paths: [
    { points: [P(100, 250), P(102, 200), P(110, 150), P(110, 118)], width: 3 },
    { points: [P(110, 118), P(70, 100), P(30, 92), P(0, 90)], width: 3 },
    { points: [P(110, 118), P(125, 70), P(130, 30), P(130, 0)], width: 3 },
    { points: [P(70, 100), P(66, 130), P(62, 152)], width: 2 },
  ],
  props: [
    prop('ruin', P(95, 95)), prop('ruin', P(125, 90)), prop('ruin', P(138, 120)), prop('ruin', P(92, 130)),
    prop('ruin', P(118, 140), { scale: 1.3 }), prop('ruin', P(80, 112)), prop('ruin', P(145, 98)), prop('ruin', P(40, 60)),
    prop('shrine', P(110, 104), { tint: '#ff8a4c' }), prop('statue', P(100, 118), { tint: '#5a4a44' }),
    prop('statue', P(122, 118), { tint: '#5a4a44' }), prop('obelisk', P(150, 70)),
    prop('tent', P(160, 132)), prop('tent', P(172, 142)), prop('campfire', P(165, 120)), prop('lantern', P(150, 128), { tint: '#e8f0ff' }),
    prop('fence', P(178, 125), { rotation: 1.57 }), prop('sign', P(104, 200)), prop('crystal', P(62, 150), { tint: '#ffb070' }),
    prop('ruin', P(70, 136), { tint: '#3a3236' }), prop('gateArch', P(130, 22)), prop('statue', P(85, 60)),
  ],
  gates: [
    gate(GATE.ashfallVault, 'ward', 'Sealed Vault Door', P(72, 140), [P(76, 140), P(66, 140)], { width: 4, depth: 2, rotation: 1.57 }),
    gate(GATE.calderaSeal, 'ward', 'Covenant Seal on the Caldera Road', P(130, 0), [P(130, 6), P(130, -6)], { width: 10, depth: 2 }),
  ],
  npcs: [
    npc('npc.shadeAldra', 'Shade of Keeper Aldra', 'Last hearth-keeper of the clan', 'npc.shade', P(112, 112), [
      [flagIs(FLAG.shadeHeard), 'dlg.aldra.after'],
      [always, 'dlg.aldra.speak'],
    ], { hiddenUntilDrakeSight: true, presentWhen: questAtLeast(MAIN.prologue, 'ACTIVE') }),
    npc('npc.gleanerWick', 'Wick', 'Deserted Covenant gleaner', 'npc.gleaner', P(112, 168), [
      [liberated(R.hollow), 'dlg.wick.after'],
      [always, 'dlg.wick.warn'],
    ]),
    npc('npc.pilgrimHenna', 'Henna', 'Ash-pilgrim', 'npc.pilgrim', P(45, 130), [
      [questIs(KAEL2, 'COMPLETED'), 'dlg.henna.after'],
      [all(questIs(KAEL2, 'ACTIVE'), fieldDone('fish', 'spot.hearthSpring')), 'dlg.henna.kindle'],
      [questIs(KAEL2, 'ACTIVE'), 'dlg.henna.hint'],
      [always, 'dlg.henna.idle'],
    ]),
    npc('npc.vaultEcho', 'Echo of the Vault-Warden', 'Memory in the ink', 'npc.shade', P(63, 146), [
      [all(questIs(QUILL2, 'ACTIVE'), not(flagIs('quill.vaultRead'))), 'dlg.vaultEcho.quill'],
      [not(flagIs('clue:vaultLedger')), 'dlg.vaultEcho.clue'],
      [always, 'dlg.vaultEcho.after'],
    ], { presentWhen: crossed('unseal', GATE.ashfallVault) }),
    npc('npc.scavengerBrisk', 'Brisk', 'Scavenger', 'npc.scavenger', P(150, 162), [[always, 'dlg.brisk.idle']]),
    npc('npc.penitentLoam', 'Loam', 'Covenant penitent', 'npc.covenantMonk', P(178, 106), [
      [liberated(R.hollow), 'dlg.loam.freed'],
      [always, 'dlg.loam.chained'],
    ]),
  ],
  zones: [
    { id: 'zone.gleanerCamp', encounterId: 'enc.gleanerCamp', position: P(150, 145), radius: 6, sprite: 'enemy.humanoid.ashGleaner', once: false },
    { id: 'zone.ashWraiths', encounterId: 'enc.ashWraiths', position: P(95, 70), radius: 6, sprite: 'enemy.wisp.ashWraith', once: false },
    { id: 'zone.cinderCrawlers', encounterId: 'enc.cinderCrawlers', position: P(180, 190), radius: 6, sprite: 'enemy.beast.emberCrawler', once: false },
    { id: 'zone.gleanerPrior', encounterId: 'enc.gleanerPrior', position: P(118, 98), radius: 7, sprite: 'enemy.humanoid.gleanerPrior', once: true,
      presentWhen: flagIs(FLAG.shadeHeard) },
  ],
  spots: [
    { id: 'spot.weepingSpring', name: 'The Weeping Spring', position: P(68, 180), fish: ['fish.springMinnow', 'fish.ashgillTrout', 'fish.hearthCarp'] },
    { id: 'spot.hearthSpring', name: 'The Banked Hearth-Spring', position: P(55, 161), hiddenUntilDrakeSight: true, fish: ['fish.ashgillTrout', 'fish.hearthCarp'] },
  ],
  enemies: {
    ashGleaner: foe('ashGleaner', 'Ash-Gleaner', 'enemy.humanoid.ashGleaner', 2, 'skirmisher', {
      affinities: { holy: 0.8, shadow: 1.2 }, skills: ['skill.enemy.titheStrike'],
      drops: [{ itemId: 'item.covenantIron', chance: 0.35 }, { itemId: 'item.tonic', chance: 0.2 }],
    }),
    emberCrawler: foe('emberCrawler', 'Ember Crawler', 'enemy.beast.emberCrawler', 3, 'brute', {
      affinities: { fire: 0.3, water: 1.5 }, skills: ['skill.enemy.emberSpit'],
      drops: [{ itemId: 'item.cinderglass', chance: 0.6 }],
    }),
    ashWraith: foe('ashWraith', 'Ash-Wraith', 'enemy.wisp.ashWraith', 3, 'caster', {
      affinities: { physical: 0.7, holy: 1.5, fire: 0.6 }, skills: ['skill.enemy.stillChill'],
      drops: [{ itemId: 'item.wispDust', chance: 0.6 }],
    }),
    gleanerPrior: foe('gleanerPrior', 'Prior Ondrel of the Gleaners', 'enemy.humanoid.gleanerPrior', 4, 'bossCaster', {
      affinities: { holy: 0.6, shadow: 1.3, fire: 1.1 }, skills: ['skill.enemy.stillingHymn', 'skill.enemy.acolyteMend', 'skill.enemy.judgement'],
      drops: [{ itemId: 'item.cinderglass', chance: 1 }, { itemId: 'item.tonic', chance: 1 }],
    }),
  },
  encounters: {
    'enc.gleanerCamp': { id: 'enc.gleanerCamp', name: 'Gleaner Camp', enemies: ['ashGleaner', 'ashGleaner', 'emberCrawler'], canFlee: true },
    'enc.ashWraiths': { id: 'enc.ashWraiths', name: 'Wraiths of the Hall', enemies: ['ashWraith', 'ashWraith'], canFlee: true },
    'enc.cinderCrawlers': { id: 'enc.cinderCrawlers', name: 'Cinder Crawler Nest', enemies: ['emberCrawler', 'emberCrawler'], canFlee: true },
    'enc.gleanerPrior': { id: 'enc.gleanerPrior', name: 'Prior Ondrel', enemies: ['gleanerPrior', 'ashGleaner', 'ashGleaner'], canFlee: false, boss: true, liberatesRegion: R.hollow },
  },
  species: {
    ashhare: { id: 'ashhare', name: 'Ash Hare', sprite: 'animal.hare.ash', speed: 10.5, wanderSpeed: 1.4, alertRadius: 8, scentSensitivity: 1.4,
      drops: [{ itemId: 'item.ashHareFur', chance: 0.85 }, { itemId: 'item.hareFoot', chance: 0.3 }], herd: { min: 2, max: 3 },
      habitat: [{ center: P(175, 210), radius: 14 }] },
    cinderjay: { id: 'cinderjay', name: 'Cinderjay', sprite: 'animal.bird.cinderjay', speed: 12, wanderSpeed: 1, alertRadius: 14, scentSensitivity: 0.5,
      drops: [{ itemId: 'item.cinderjayPlume', chance: 0.9 }], herd: { min: 2, max: 3 },
      habitat: [{ center: P(40, 40), radius: 12 }] },
  },
  fish: {
    'fish.springMinnow': { id: 'fish.springMinnow', name: 'Spring Minnow', itemId: 'item.fish.springMinnow', rarity: 'common', fight: 0.18, weight: 45 },
    'fish.ashgillTrout': { id: 'fish.ashgillTrout', name: 'Ashgill Trout', itemId: 'item.fish.ashgillTrout', rarity: 'uncommon', fight: 0.42, weight: 18, preferredLure: 'item.lure.cricket' },
    'fish.hearthCarp': { id: 'fish.hearthCarp', name: 'Hearth Carp', itemId: 'item.fish.hearthCarp', rarity: 'rare', fight: 0.6, weight: 7, preferredLure: 'item.lure.emberFly' },
  },
  items: {
    'item.cinderglass': material('item.cinderglass', 'Cinderglass', 'Glass the clan-fire made of sand. Smiths prize it for tempering.', '🔶', 14),
    'item.ashHareFur': material('item.ashHareFur', 'Ash Hare Fur', 'Grey as the ruin and soft as smoke.', '🐇', 8),
    'item.cinderjayPlume': material('item.cinderjayPlume', 'Cinderjay Plume', 'Orange-tipped, faintly warm.', '🪶', 9),
    'item.fish.springMinnow': catchItem('item.fish.springMinnow', 'Spring Minnow', 'Quick and silver.', 14, 4),
    'item.fish.ashgillTrout': catchItem('item.fish.ashgillTrout', 'Ashgill Trout', 'Gills dusted grey, flesh pink.', 30, 15),
    'item.fish.hearthCarp': catchItem('item.fish.hearthCarp', 'Hearth Carp', 'A carp the colour of embers. The clan fed it at every feast.', 48, 45, '🐠'),
    'item.clanHearthstone': keyItem('item.clanHearthstone', 'Clan Hearthstone', 'A blackened stone from the Ashen Drake hearth. Warm on one side only.', '🪨'),
  },
  dialogues: byId([
    dlg('dlg.aldra.speak', [
      ['Shade of Aldra', 'Drake-eyes. After twenty winters, drake-eyes in this hall.'],
      ['Shade of Aldra', 'They did not come for our gold, child. They came with lanterns that did not flicker, and they took our fire.'],
      ['Kael', 'Who are "they"?'],
      ['Shade of Aldra', 'The ones still here, sifting our ashes. Drive them out — then go south and live.'],
    ], { onEnd: [setFlag(FLAG.shadeHeard)] }),
    dlg('dlg.aldra.after', [
      ['Shade of Aldra', 'Your mother\'s hearth is cold, not dead. Remember that.'],
      ['Shade of Aldra', 'Lanternwick will need you. So will Ashka.'],
    ]),
    dlg('dlg.wick.warn', [
      ['Wick', 'I was a gleaner. Sift the ash, bag anything warm, send it to Greyspire. I stopped when the ash started screaming.'],
      ['Wick', 'Prior Ondrel holds the hall. He reads hymns at the hearth until it goes quiet.'],
    ]),
    dlg('dlg.wick.after', [
      ['Wick', 'The Prior\'s gone. The ash is just ash now.'],
      ['Wick', 'The road north is sealed with the Covenant\'s mark. Whatever they burn up there, they don\'t want it seen.'],
    ]),
    dlg('dlg.henna.idle', [
      ['Henna', 'I walk from ruin to ruin and light a candle in each.'],
      ['Henna', 'This one\'s candle never goes out. Strange, isn\'t it?'],
    ]),
    dlg('dlg.henna.hint', [
      ['Henna', 'The clan kept a second spring — the hearth-spring — glamoured beside the weeping one.'],
      ['Henna', 'Open your drake-eyes by the water. Then fish; what the hearth fed, the hearth will return.'],
    ]),
    dlg('dlg.henna.kindle', [
      ['Henna', 'A hearth carp from the hearth-spring. Your clan fed them at every feast.'],
      ['Ashka', 'I remember the smell of that kitchen. Kael… I am stronger here.'],
      ['Henna', 'Take the hearthstone. A clan is wherever its fire is carried.'],
    ], { onEnd: [setFlag('kael.hearthKindled')] }),
    dlg('dlg.henna.after', [
      ['Henna', 'My candle burns taller since you came.'],
      ['Henna', 'Go carefully, drake-son.'],
    ]),
    dlg('dlg.vaultEcho.clue', [
      ['Vault-Warden\'s Echo', 'Entry, the night of the burning: "Lantern procession on the highland road. Deacon Corvane, by order of the Hierophant."'],
      ['Vault-Warden\'s Echo', 'Entry, the morning after: "Nothing remains to tithe." The ink is still wet in my memory.'],
    ], { onEnd: [setFlag('clue:vaultLedger')] }),
    dlg('dlg.vaultEcho.quill', [
      ['Quill', 'Covenant cipher, third grade. I wrote half these myself. Hold still, memory.'],
      ['Vault-Warden\'s Echo', 'Entry: "Ashen Drake hearth — banked flame delivered to Greyspire Works. Weight: one Warden."'],
      ['Quill', 'They weighed her. They weighed Ashka like grain.'],
    ], { onEnd: [setFlag('quill.vaultRead'), setFlag('clue:vaultLedger')] }),
    dlg('dlg.vaultEcho.after', [
      ['Vault-Warden\'s Echo', 'All entries are read. Let the vault sleep.'],
      ['Vault-Warden\'s Echo', 'Or burn it. Burning is what it is for.'],
    ]),
    dlg('dlg.brisk.idle', [
      ['Brisk', 'Cinderglass sells in Saltmarket. Crawlers make it. You see my problem.'],
      ['Brisk', 'Hares out east, past the camp. Jays in the north ruins.'],
    ]),
    dlg('dlg.loam.chained', [
      ['Loam', 'I prayed too loud, so the Prior chained me where I could hear him pray quieter.'],
      ['Loam', 'Every hymn he reads, the hearth gets colder.'],
    ]),
    dlg('dlg.loam.freed', [
      ['Loam', 'Free. I don\'t know what to pray to now.'],
      ['Loam', 'Maybe nothing. Maybe that\'s allowed.'],
    ]),
  ]),
  quests: [
    {
      id: MAIN.prologue, title: 'Ashfall Hollow', kind: 'main', act: 1, giver: 'npc.elderMaren',
      summary: 'Kael has never gone back to the hall where his clan burned. Elder Maren says Covenant gleaners are picking through it — and that he should be there before they finish.',
      chronicle: chron(
        'Elder Maren has news from the north road: Covenant gleaners in Ashfall Hollow.',
        'Kael walks north to the hall where his clan burned, with Tobin and Vesna at his back.',
        'Prior Ondrel is broken and the gleaners are gone. The clan\'s last keeper spoke of lanterns that did not flicker. Kael came home — and now Lanternwick needs him.',
      ),
      discoverWhen: entered('lanternwick'),
      activateWhen: { kind: 'flag', key: `evt:accept:${MAIN.prologue}`, atLeast: 1 },
      objectives: [
        obj('reachHollow', 'Walk the north road to Ashfall Hollow.', entered(R.hollow), P(110, 120)),
        obj('seeShade', 'Use Kael\'s Drake-Sight at the burned hearth.', fieldDone('drakeSight', 'npc.shadeAldra'), P(112, 112), entered(R.hollow)),
        obj('hearShade', 'Listen to the shade of Keeper Aldra.', flagIs(FLAG.shadeHeard), P(112, 112), fieldDone('drakeSight', 'npc.shadeAldra')),
        obj('drivePrior', 'Drive Prior Ondrel\'s gleaners out of the hall.', liberated(R.hollow), P(118, 98), flagIs(FLAG.shadeHeard)),
      ],
      rewards: [{ type: 'xp', amount: 90 }, { type: 'coin', amount: 40 }, { type: 'item', itemId: 'item.tonic', qty: 2 }, { type: 'flag', key: FLAG.prologueDone, value: true }],
    },
    {
      id: KAEL2, chain: { id: CHAIN.kael, stage: 2, of: 3, title: 'Embers of the Clan' }, title: 'The Banked Hearth', kind: 'companion', act: 2, companion: 'kael', giver: 'npc.pilgrimHenna',
      summary: 'With the Wyrm\'s Lament in hand, Ashka remembers a second spring at Ashfall — the hearth-spring the clan fed with its own fire.',
      chronicle: chron('Ashka stirs whenever Kael thinks of Ashfall.', 'Find the glamoured hearth-spring at Ashfall and fish what the clan left in it.', 'A hearth carp rose from the clan\'s spring, and Henna gave Kael the clan hearthstone. Ashka burns brighter.'),
      discoverWhen: all(questIs(QUEST.embers, 'COMPLETED'), questIs(MAIN.prologue, 'COMPLETED')),
      activateWhen: always,
      objectives: [
        obj('revealSpring', 'Use Drake-Sight beside the Weeping Spring to reveal the hearth-spring.', fieldDone('drakeSight', 'spot.hearthSpring'), P(55, 161)),
        obj('fishSpring', 'Fish the hearth-spring (Kael).', fieldDone('fish', 'spot.hearthSpring'), P(55, 161), fieldDone('drakeSight', 'spot.hearthSpring')),
        obj('tellHenna', 'Tell Henna the hearth answered.', flagIs('kael.hearthKindled'), P(45, 130), fieldDone('fish', 'spot.hearthSpring')),
      ],
      rewards: [{ type: 'item', itemId: 'item.clanHearthstone', qty: 1 }, { type: 'xp', amount: 400 }, { type: 'item', itemId: 'item.emberDraught', qty: 3 }],
    },
    {
      id: QUILL2, chain: { id: CHAIN.quill, stage: 2, of: 3, title: 'The Unburned Ledger' }, title: 'The Vault of Ashes', kind: 'companion', act: 2, companion: 'quill', giver: 'npc.vaultEcho',
      summary: 'Quill is certain the Covenant kept a record of the night Ashfall burned. Covenant record-keepers always do. She means to read it.',
      chronicle: chron('Quill keeps asking about Ashfall\'s cellars.', 'Unseal the vault under Ashfall Hollow and read what the Covenant wrote there.', 'The vault\'s memory confessed: Ashka was "delivered" to the Greyspire Works. Quill copied every word.'),
      discoverWhen: questIs('companion.quill.duneVault', 'COMPLETED'),
      activateWhen: always,
      objectives: [
        obj('unsealVault', 'Unseal the vault door at Ashfall (Quill).', crossed('unseal', GATE.ashfallVault), P(72, 140)),
        obj('readVault', 'Let Quill read the vault-warden\'s memory.', flagIs('quill.vaultRead'), P(63, 146), crossed('unseal', GATE.ashfallVault)),
      ],
      rewards: [{ type: 'xp', amount: 900 }, { type: 'coin', amount: 200 }],
    },
  ],
};
