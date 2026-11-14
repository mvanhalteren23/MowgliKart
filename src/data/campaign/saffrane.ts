/** (−2,1) — Act II: Saffrane, the caravan city of the glass dunes. Quill joins. */
import type { ChapterContent } from '../dsl';
import { acceptChoice, byId, catchItem, chron, chunkAt, dlg, foe, gate, material, npc, obj, prop, setFlag } from '../dsl';
import { accepted, all, always, any, built, crossed, defeated, fieldDone, flagIs, liberated, not, questAtLeast, questIs, recruited, talked } from '../conditions';
import { CHAIN, GATE, MAIN } from '../ids';

const P = chunkAt(-2, 1);
const R = { city: 'saffrane', hall: 'ledgerHall', dunes: 'glassDunes' } as const;
const QUILL1 = 'companion.quill.duneVault';
const PIM1 = 'companion.pim.oasis';
const ORLA3 = 'companion.orla.dustGorge';
const VESNA3 = 'companion.vesna.sunkenRing';
const TQ = 'township.unstilledCandles';

export const saffrane: ChapterContent = {
  chunk: { cx: -2, cz: 1, name: 'The Glass Dunes of Saffrane', biome: 'desert', act: 2, scatterProps: ['cactus', 'tent', 'obelisk'], foliageDensity: 0.15 },
  regions: [
    { id: R.city, name: 'Saffrane', biome: 'desert', center: P(140, 110), radius: 36, occupied: false,
      blurb: 'Caravan city of awnings and spice-smoke. Every trade road on the continent ends in its market.' },
    { id: R.hall, name: 'The Ledger Hall', biome: 'desert', center: P(60, 175), radius: 26, occupied: true,
      blurb: 'The Covenant\'s great counting-house. Every tithe on the continent is written down here — twice.' },
    { id: R.dunes, name: 'The Glass Dunes', biome: 'desert', center: P(185, 200), radius: 32, occupied: false,
      blurb: 'Sand fused to glass by some old fire. The Sunken Ring lies half-buried among them.' },
  ],
  water: [{ center: P(200, 60), radius: 14, kind: 'lake' }],
  paths: [
    { points: [P(120, 0), P(128, 60), P(140, 110)], width: 3 },
    { points: [P(140, 110), P(200, 118), P(250, 120)], width: 3 },
    { points: [P(140, 110), P(90, 150), P(62, 170)], width: 3 },
    { points: [P(140, 110), P(170, 170), P(185, 205)], width: 2.5 },
    { points: [P(200, 118), P(212, 86)], width: 2 },
  ],
  props: [
    prop('tent', P(130, 95), { tint: '#e0a050' }), prop('tent', P(150, 92), { tint: '#c86040' }), prop('tent', P(160, 120), { tint: '#e0c070' }),
    prop('stall', P(125, 118), { tint: '#d9a04f' }), prop('stall', P(145, 128), { tint: '#4fa3d9' }), prop('house', P(112, 100), { tint: '#e8d0a0' }),
    prop('house', P(170, 100), { tint: '#e8d0a0' }), prop('well', P(140, 105)), prop('obelisk', P(100, 60)),
    prop('cathedral', P(55, 182), { scale: 0.8, tint: '#d8c8a0' }), prop('statue', P(80, 165)), prop('fence', P(40, 150), { rotation: 1.57 }),
    prop('cactus', P(20, 30)), prop('cactus', P(230, 30)), prop('cactus', P(100, 230)), prop('arena', P(195, 215), { scale: 1.6, tint: '#c8b080' }),
    prop('ruin', P(220, 160)), prop('crystal', P(160, 225), { tint: '#ffe0a0' }), prop('sign', P(122, 40)), prop('tent', P(230, 130)),
  ],
  gates: [
    gate(GATE.dustGorge, 'chasm', 'The Dust Gorge', P(250, 120), [P(243, 120), P(257, 120)], { width: 12, depth: 6, rotation: 1.57 }),
    gate(GATE.duneVault, 'ward', 'Sealed Ledger Vault', P(32, 150), [P(38, 150), P(26, 150)], { width: 5, depth: 2, rotation: 1.57 }),
    gate(GATE.oasisChannel, 'river', 'The Oasis Channel', P(212, 92), [P(212, 86), P(212, 100)], { width: 9, depth: 5 }),
  ],
  npcs: [
    npc('npc.caravanMistressIdony', 'Idony', 'Caravan-mistress of Saffrane', 'npc.caravanMistress', P(138, 100), [
      [questIs(MAIN.saffrane, 'COMPLETED'), 'dlg.idony.after'],
      [questIs(MAIN.saffrane, 'ACTIVE'), 'dlg.idony.hint'],
      [questIs(MAIN.saffrane, 'DISCOVERED'), 'dlg.idony.offer'],
      [always, 'dlg.idony.idle'],
    ]),
    npc('npc.quill', 'Quill', 'Apostate archivist in hiding', 'hero.quill', P(100, 140), [
      [flagIs('saffrane.hallKey'), 'dlg.quill.ready'],
      [defeated('enc.titheCaravan'), 'dlg.quill.key'],
      [always, 'dlg.quill.meet'],
    ], { presentWhen: not(questIs(MAIN.saffrane, 'COMPLETED')) }),
    npc('npc.clerkAmsel', 'Amsel', 'Captured caravan clerk', 'npc.clerk', P(178, 150), [
      [not(flagIs('clue:caravanScrip')), 'dlg.amsel.clue'],
      [always, 'dlg.amsel.idle'],
    ], { presentWhen: defeated('enc.titheCaravan') }),
    npc('npc.chandlerAnsel', 'Ansel', 'Lapsed Covenant chandler', 'npc.chandler', P(165, 135), [
      [recruited('npc.chandlerAnsel'), 'dlg.ansel.township'],
      [questAtLeast(TQ, 'ACTIVE'), 'dlg.ansel.ready'],
      [always, 'dlg.ansel.offer'],
    ]),
    npc('npc.vaultScribeOrrin', 'Orrin', 'Vault scribe, walled in', 'npc.clerk', P(20, 152), [
      [all(questIs(QUILL1, 'ACTIVE'), not(flagIs('quill.ledgerFound'))), 'dlg.orrin.quill'],
      [always, 'dlg.orrin.idle'],
    ], { presentWhen: crossed('unseal', GATE.duneVault) }),
    npc('npc.cogHermitTib', 'Tib', 'Clockmaker of the oasis isle', 'npc.tinker', P(214, 106), [
      [all(questIs(PIM1, 'ACTIVE'), not(flagIs('pim.tibMet'))), 'dlg.tib.pim'],
      [always, 'dlg.tib.idle'],
    ], { presentWhen: crossed('leap', GATE.oasisChannel) }),
    npc('npc.sandRingmasterKoro', 'Koro', 'Master of the Sunken Ring', 'npc.ringmaster', P(205, 195), [
      [all(questIs(VESNA3, 'ACTIVE'), defeated('enc.sunkenRing')), 'dlg.koro.won'],
      [questIs(VESNA3, 'ACTIVE'), 'dlg.koro.hint'],
      [always, 'dlg.koro.idle'],
    ]),
    npc('npc.windSellerYev', 'Yev', 'Seller of bottled winds', 'npc.merchant', P(225, 112), [
      [all(questIs(ORLA3, 'ACTIVE'), defeated('enc.stillChoir')), 'dlg.yev.freed'],
      [questIs(ORLA3, 'ACTIVE'), 'dlg.yev.hint'],
      [always, 'dlg.yev.idle'],
    ]),
  ],
  zones: [
    { id: 'zone.duneStalkers', encounterId: 'enc.duneStalkers', position: P(60, 60), radius: 6, sprite: 'enemy.beast.duneStalker', once: false },
    { id: 'zone.auditors', encounterId: 'enc.auditors', position: P(95, 195), radius: 6, sprite: 'enemy.humanoid.ledgerScribe', once: false },
    { id: 'zone.titheCaravan', encounterId: 'enc.titheCaravan', position: P(175, 160), radius: 6, sprite: 'enemy.humanoid.caravanGuard', once: true,
      presentWhen: talked('npc.quill') },
    { id: 'zone.comptroller', encounterId: 'enc.comptroller', position: P(62, 170), radius: 7, sprite: 'enemy.humanoid.comptrollerVey', once: true,
      presentWhen: flagIs('saffrane.hallKey') },
    { id: 'zone.sunkenRing', encounterId: 'enc.sunkenRing', position: P(190, 228), radius: 6, sprite: 'enemy.humanoid.sandChampion', once: true,
      presentWhen: questIs(VESNA3, 'ACTIVE') },
    { id: 'zone.stillChoir', encounterId: 'enc.stillChoir', position: P(235, 165), radius: 6, sprite: 'enemy.wisp.stillChoir', once: true,
      presentWhen: questIs(ORLA3, 'ACTIVE') },
  ],
  spots: [{ id: 'spot.oasis', name: 'Saffrane Oasis', position: P(196, 76), fish: ['fish.oasisTetra', 'fish.sandCarp', 'fish.sunscaleArowana'] }],
  enemies: {
    duneStalker: foe('duneStalker', 'Dune Stalker', 'enemy.beast.duneStalker', 16, 'skirmisher', {
      affinities: { earth: 0.7, water: 1.4 }, skills: ['skill.enemy.gnash', 'skill.enemy.sandLash'], drops: [{ itemId: 'item.duneHide', chance: 0.5 }],
    }),
    ledgerScribe: foe('ledgerScribe', 'Tithe Auditor', 'enemy.humanoid.ledgerScribe', 16, 'caster', {
      affinities: { holy: 0.6, shadow: 1.3 }, skills: ['skill.enemy.auditorsGaze', 'skill.enemy.acolyteMend'], drops: [{ itemId: 'item.sunGlass', chance: 0.4 }],
    }),
    sunWisp: foe('sunWisp', 'Stilled Sun-Wisp', 'enemy.wisp.sunWisp', 17, 'caster', {
      affinities: { physical: 0.7, fire: 0.5, water: 1.4 }, skills: ['skill.enemy.emberSpit'], drops: [{ itemId: 'item.wispDust', chance: 0.6 }, { itemId: 'item.sunGlass', chance: 0.3 }],
    }),
    caravanGuard: foe('caravanGuard', 'Tithe Caravan Guard', 'enemy.humanoid.caravanGuard', 17, 'tank', {
      affinities: { holy: 0.8 }, skills: ['skill.enemy.shieldWall', 'skill.enemy.titheStrike'], drops: [{ itemId: 'item.sunGlass', chance: 0.6 }],
    }),
    comptrollerVey: foe('comptrollerVey', 'Comptroller Vey', 'enemy.humanoid.comptrollerVey', 19, 'bossCaster', {
      affinities: { holy: 0.5, shadow: 1.4 }, skills: ['skill.enemy.auditorsGaze', 'skill.enemy.stillingHymn', 'skill.enemy.stillMend'],
      drops: [{ itemId: 'item.sunGlass', chance: 1 }, { itemId: 'item.hiTonic', chance: 0.7 }],
    }),
    sandChampion: foe('sandChampion', 'Ysolde of the Sunken Ring', 'enemy.humanoid.sandChampion', 20, 'boss', {
      affinities: { fire: 0.8, earth: 0.8 }, skills: ['skill.enemy.ringFlourish', 'skill.enemy.sandLash', 'skill.enemy.crowdRoar'], drops: [{ itemId: 'item.hiTonic', chance: 1 }],
    }),
    stillChoir: foe('stillChoir', 'The Still Choir', 'enemy.wisp.stillChoir', 21, 'bossCaster', {
      affinities: { physical: 0.6, holy: 0.6, wind: 1.4 }, skills: ['skill.enemy.chimeToll', 'skill.enemy.stillingHymn'], drops: [{ itemId: 'item.wispDust', chance: 1 }],
    }),
  },
  encounters: {
    'enc.duneStalkers': { id: 'enc.duneStalkers', name: 'Dune Stalkers', enemies: ['duneStalker', 'duneStalker', 'duneStalker'], canFlee: true },
    'enc.auditors': { id: 'enc.auditors', name: 'Tithe Auditors', enemies: ['ledgerScribe', 'sunWisp', 'ledgerScribe'], canFlee: true },
    'enc.titheCaravan': { id: 'enc.titheCaravan', name: 'The Tithe Caravan', enemies: ['caravanGuard', 'caravanGuard', 'ledgerScribe'], canFlee: true },
    'enc.comptroller': { id: 'enc.comptroller', name: 'Comptroller Vey', enemies: ['comptrollerVey', 'caravanGuard', 'sunWisp'], canFlee: false, boss: true, liberatesRegion: R.hall },
    'enc.sunkenRing': { id: 'enc.sunkenRing', name: 'Bout of the Sunken Ring', enemies: ['sandChampion', 'duneStalker'], canFlee: false },
    'enc.stillChoir': { id: 'enc.stillChoir', name: 'The Still Choir', enemies: ['stillChoir', 'sunWisp', 'sunWisp'], canFlee: false, boss: true },
  },
  species: {
    duneHare: { id: 'duneHare', name: 'Dune Hare', sprite: 'animal.hare.dune', speed: 11, wanderSpeed: 1.5, alertRadius: 9, scentSensitivity: 1.6,
      drops: [{ itemId: 'item.hareFoot', chance: 0.7 }, { itemId: 'item.duneHide', chance: 0.4 }], herd: { min: 2, max: 3 }, habitat: [{ center: P(150, 230), radius: 12 }] },
    sandGazelle: { id: 'sandGazelle', name: 'Sand Gazelle', sprite: 'animal.deer.sandGazelle', speed: 11, wanderSpeed: 1.2, alertRadius: 20, scentSensitivity: 2,
      drops: [{ itemId: 'item.duneHide', chance: 0.85 }, { itemId: 'item.smokedVenison', chance: 0.4 }], herd: { min: 2, max: 3 }, habitat: [{ center: P(40, 90), radius: 14 }] },
  },
  fish: {
    'fish.oasisTetra': { id: 'fish.oasisTetra', name: 'Oasis Tetra', itemId: 'item.fish.oasisTetra', rarity: 'common', fight: 0.2, weight: 42 },
    'fish.sandCarp': { id: 'fish.sandCarp', name: 'Sand Carp', itemId: 'item.fish.sandCarp', rarity: 'uncommon', fight: 0.46, weight: 16, preferredLure: 'item.lure.cricket' },
    'fish.sunscaleArowana': { id: 'fish.sunscaleArowana', name: 'Sunscale Arowana', itemId: 'item.fish.sunscaleArowana', rarity: 'rare', fight: 0.7, weight: 5, preferredLure: 'item.lure.emberFly' },
  },
  items: {
    'item.duneHide': material('item.duneHide', 'Dune Hide', 'Sun-bleached gazelle hide. Awnings, saddles, roofs.', '🟨', 18),
    'item.sunGlass': material('item.sunGlass', 'Sunglass', 'Dune-glass gone gold with heat. It focuses light into a point.', '🔆', 28),
    'item.fish.oasisTetra': catchItem('item.fish.oasisTetra', 'Oasis Tetra', 'A flicker of blue.', 24, 8),
    'item.fish.sandCarp': catchItem('item.fish.sandCarp', 'Sand Carp', 'Tastes faintly of cinnamon. Nobody knows why.', 40, 24),
    'item.fish.sunscaleArowana': catchItem('item.fish.sunscaleArowana', 'Sunscale Arowana', 'A gold dragon of the oasis, worth a caravan.', 64, 95, '🐉'),
  },
  dialogues: byId([
    dlg('dlg.idony.idle', [
      ['Idony', 'Spice, silk, salt — and tithe-carts, heading east every dawn.'],
      ['Idony', 'Saffrane pays everybody. Lately it pays the Covenant first.'],
    ]),
    dlg('dlg.idony.offer', [
      ['Idony', 'You bounded the Mire Ford? With a tinker on springs? Saffrane will tell that story for a year.'],
      ['Idony', 'Here\'s mine: the Covenant\'s Ledger Hall writes every tithe twice — once for us, once for Greyspire. An archivist named Quill found out, and now she\'s hiding in my warehouse.'],
    ], { choices: acceptChoice(MAIN.saffrane, 'Then let\'s audit the auditors.') }),
    dlg('dlg.idony.hint', [
      ['Idony', 'Quill hides behind the dye-vats on the hall road.'],
      ['Idony', 'If she says break a caravan, break a caravan. She\'s never wrong about numbers.'],
    ]),
    dlg('dlg.idony.after', [
      ['Idony', 'The hall\'s books are open in the market square. People are reading them aloud.'],
      ['Idony', 'East, the Dust Gorge leads to Hollowroot. Your chanter can ride its winds.'],
    ]),
    dlg('dlg.quill.meet', [
      ['Quill', 'Don\'t shout. I\'m being discreet. It\'s a new skill.'],
      ['Quill', 'The hall key travels with today\'s tithe caravan — Comptroller Vey trusts nothing that stays put. Take the caravan, and I can take the hall.'],
    ]),
    dlg('dlg.quill.key', [
      ['Quill', 'The key, and the caravan\'s scrip, and — oh, this is beautiful — a double-entry error.'],
      ['Quill', 'Vey\'s in the hall. Every Covenant seal in there, I can unwrite. Let\'s go.'],
    ], { onEnd: [setFlag('saffrane.hallKey')] }),
    dlg('dlg.quill.ready', [
      ['Quill', 'The Ledger Hall, south-west. I\'ll read; you hit things.'],
      ['Quill', 'And after, I\'m coming with you. Someone has to keep accounts.'],
    ]),
    dlg('dlg.amsel.clue', [
      ['Amsel', 'I just copy figures! Look — Greyspire Works scrip. They pay for "fuel" by the Warden-weight.'],
      ['Amsel', 'Every shipment is countersigned with the same seal. A flame that does not flicker.'],
    ], { onEnd: [setFlag('clue:caravanScrip')] }),
    dlg('dlg.amsel.idle', [
      ['Amsel', 'I\'m going to be a spice merchant now. Spices don\'t scream.'],
      ['Amsel', 'Mostly.'],
    ]),
    dlg('dlg.ansel.offer', [
      ['Ansel', 'I made the Covenant\'s candles for thirty years. Then I learned what the wax was rendered from.'],
      ['Ansel', 'I could make honest light instead — and temper relics the old way. If your Hearthstead has room for an old sinner.'],
    ], { choices: acceptChoice(TQ, 'There\'s room.', 'Not yet.') }),
    dlg('dlg.ansel.ready', [
      ['Ansel', 'Put me in your ledger. I\'ll bring my moulds.'],
      ['Ansel', 'Marsh wax and sunglass — I can unmake the one and focus the other.'],
    ]),
    dlg('dlg.ansel.township', [
      ['Ansel', 'Every candle I pour here, I pour honestly.'],
      ['Ansel', 'Expand the reliquary and I\'ll temper your relics in true flame.'],
    ]),
    dlg('dlg.orrin.quill', [
      ['Orrin', 'Quill? They walled me in with the true ledger when you ran. I\'ve been copying it by lamplight.'],
      ['Quill', 'Orrin, you absolute pedant. Give it here.'],
      ['Orrin', 'It never burns. I tried, once. It just… waited.'],
    ], { onEnd: [setFlag('quill.ledgerFound')] }),
    dlg('dlg.orrin.idle', [
      ['Orrin', 'Daylight is very loud.'],
      ['Orrin', 'I\'ll come out when I\'ve finished this page.'],
    ]),
    dlg('dlg.tib.pim', [
      ['Tib', 'Little Pim! You bounded the channel! I told your mother you would.'],
      ['Pim', 'Uncle Tib! You said this spring was too dangerous to give a child.'],
      ['Tib', 'You\'re not a child. It\'s still dangerous. Take it.'],
    ], { onEnd: [setFlag('pim.tibMet')] }),
    dlg('dlg.tib.idle', [
      ['Tib', 'Clocks on an island in an oasis in a desert. Nobody visits. Bliss.'],
      ['Tib', 'Mind the channel on the way out.'],
    ]),
    dlg('dlg.koro.idle', [
      ['Koro', 'The Sunken Ring is older than the Cinder Ring. Older than the Covenant.'],
      ['Koro', 'No markers here. You fight for the sand\'s respect.'],
    ]),
    dlg('dlg.koro.hint', [
      ['Koro', 'Vesna of the Cinder Ring. Ysolde has waited for you. She was your sister\'s trainer.'],
      ['Koro', 'Bring down a dune hare by hand first. The sand likes a hunter.'],
    ]),
    dlg('dlg.koro.won', [
      ['Koro', 'Ysolde yields. Vesna, the sand names you champion.'],
      ['Vesna', 'My sister\'s marker was sold to Greyspire. She never came back.'],
      ['Koro', 'Then wear this laurel where Greyspire can see it.'],
    ], { onEnd: [setFlag('vesna.ringFree')] }),
    dlg('dlg.yev.idle', [
      ['Yev', 'Bottled winds! North wind for headaches, sea-breeze for heartache.'],
      ['Yev', 'Business is bad. Something east of here is drinking the wind.'],
    ]),
    dlg('dlg.yev.hint', [
      ['Yev', 'A choir of stilled wisps sings east, near the gorge. My bottles go flat when they sing.'],
      ['Orla', 'Then I\'ll sing louder.'],
    ]),
    dlg('dlg.yev.freed', [
      ['Yev', 'My bottles are full again! What did you do?'],
      ['Orla', 'Finished their hymn. Wrong ending.'],
      ['Yev', 'Take this conch. It hums back whatever you sing to it.'],
    ], { onEnd: [setFlag('orla.choirFreed')] }),
  ]),
  quests: [
    {
      id: MAIN.saffrane, title: 'The Ledger Hall of Saffrane', kind: 'main', act: 2, giver: 'npc.caravanMistressIdony',
      summary: 'Saffrane\'s Covenant counting-house writes every tithe twice. The archivist who noticed is hiding in a dye warehouse.',
      chronicle: chron(
        'Across the Mire Ford lies Saffrane, where every road\'s money is counted.',
        'Find Quill, break the tithe caravan for the hall key, and confront Comptroller Vey.',
        'The Ledger Hall\'s books are open in the market square. Quill has joined the party — to keep accounts.',
      ),
      discoverWhen: all(questIs(MAIN.mirefast, 'COMPLETED'), crossed('leap', GATE.mireFord)),
      activateWhen: accepted(MAIN.saffrane),
      objectives: [
        obj('findQuill', 'Find Quill in hiding.', talked('npc.quill'), P(100, 140)),
        obj('caravan', 'Break the tithe caravan.', defeated('enc.titheCaravan'), P(175, 160), talked('npc.quill')),
        obj('key', 'Bring the hall key to Quill.', flagIs('saffrane.hallKey'), P(100, 140), defeated('enc.titheCaravan')),
        obj('vey', 'Defeat Comptroller Vey and liberate the Ledger Hall.', liberated(R.hall), P(62, 170), flagIs('saffrane.hallKey')),
      ],
      rewards: [{ type: 'hero', heroId: 'quill' }, { type: 'gear', gearId: 'weapon.sunglassGlaive' }, { type: 'xp', amount: 1700 }, { type: 'coin', amount: 400 }],
    },
    {
      id: QUILL1, chain: { id: CHAIN.quill, stage: 1, of: 3, title: 'The Unburned Ledger' }, title: 'The Walled-In Scribe', kind: 'companion', act: 2, companion: 'quill', giver: 'npc.vaultScribeOrrin',
      summary: 'Quill\'s old colleague was walled into the hall\'s vault with the one ledger the Covenant could not burn.',
      chronicle: chron('Quill keeps tapping the vault wall.', 'Unseal the Ledger Vault and find Orrin.', 'Orrin handed over the Unburned Ledger. It is warm, and it is right.'),
      discoverWhen: questIs(MAIN.saffrane, 'COMPLETED'),
      activateWhen: always,
      objectives: [
        obj('unseal', 'Unseal the Ledger Vault (Quill).', crossed('unseal', GATE.duneVault), P(32, 150)),
        obj('orrin', 'Find Orrin and the ledger.', flagIs('quill.ledgerFound'), P(20, 152), crossed('unseal', GATE.duneVault)),
      ],
      rewards: [{ type: 'gear', gearId: 'relic.unburnedLedger' }, { type: 'xp', amount: 1200 }],
    },
    {
      id: PIM1, chain: { id: CHAIN.pim, stage: 1, of: 3, title: 'Spring-Wound' }, title: 'Uncle Tib\'s Island', kind: 'companion', act: 2, companion: 'pim', giver: 'npc.cogHermitTib',
      summary: 'Pim\'s uncle keeps a clock-shop on an island in Saffrane\'s oasis, across a channel too fast to swim.',
      chronicle: chron('Pim wants to visit family in Saffrane.', 'Bound across the Oasis Channel and visit Tib.', 'Tib gave Pim the Everwound Mainspring. It has opinions.'),
      discoverWhen: questIs(MAIN.mirefast, 'COMPLETED'),
      activateWhen: always,
      objectives: [
        obj('channel', 'Spring-leap the Oasis Channel (Pim).', crossed('leap', GATE.oasisChannel), P(212, 92)),
        obj('tib', 'Visit Uncle Tib.', flagIs('pim.tibMet'), P(214, 106), crossed('leap', GATE.oasisChannel)),
      ],
      rewards: [{ type: 'gear', gearId: 'relic.everwoundMainspring' }, { type: 'xp', amount: 900 }],
    },
    {
      id: ORLA3, chain: { id: CHAIN.orla, stage: 3, of: 3, title: 'The Unsung Hymn' }, title: 'The Still Choir', kind: 'companion', act: 2, companion: 'orla', giver: 'npc.windSellerYev',
      summary: 'A choir of stilled wisps sings the Covenant hymn by the Dust Gorge, and the desert winds go flat.',
      chronicle: chron('Orla says the desert wind sounds wrong.', 'Ride the Dust Gorge winds, then out-sing and break the Still Choir.', 'The Still Choir broke on Orla\'s last verse. Yev gave her the Echoing Conch.'),
      discoverWhen: all(questIs('companion.orla.bellLoft', 'COMPLETED'), questIs(MAIN.saffrane, 'COMPLETED')),
      activateWhen: always,
      objectives: [
        obj('gorge', 'Glide the Dust Gorge (Orla).', crossed('glide', GATE.dustGorge), P(250, 120)),
        obj('choir', 'Break the Still Choir.', defeated('enc.stillChoir'), P(235, 165)),
        obj('yev', 'Tell Yev the wind is free.', flagIs('orla.choirFreed'), P(225, 112), defeated('enc.stillChoir')),
      ],
      rewards: [{ type: 'gear', gearId: 'sig.echoingConch' }, { type: 'xp', amount: 1600 }],
    },
    {
      id: VESNA3, chain: { id: CHAIN.vesna, stage: 3, of: 3, title: 'Debts of the Cinder Ring' }, title: 'The Sunken Ring', kind: 'companion', act: 2, companion: 'vesna', giver: 'npc.sandRingmasterKoro',
      summary: 'Vesna\'s sister trained in the Sunken Ring before her marker was sold. Its champion is waiting.',
      chronicle: chron('Vesna keeps looking south toward the dunes.', 'Run down a dune hare by hand, then win the bout of the Sunken Ring.', 'Ysolde yielded. Vesna wears the Ashen Laurel where Greyspire can see it.'),
      discoverWhen: all(questIs('companion.vesna.ringSister', 'COMPLETED'), questIs(MAIN.saffrane, 'COMPLETED')),
      activateWhen: always,
      objectives: [
        obj('dashHare', 'Run down a dune hare with a dash.', fieldDone('huntDash', 'duneHare'), P(150, 230)),
        obj('bout', 'Win the bout of the Sunken Ring.', defeated('enc.sunkenRing'), P(190, 228), fieldDone('huntDash', 'duneHare')),
        obj('koro', 'Hear Koro\'s verdict.', flagIs('vesna.ringFree'), P(205, 195), defeated('enc.sunkenRing')),
      ],
      rewards: [{ type: 'gear', gearId: 'relic.ashenLaurel' }, { type: 'xp', amount: 1500 }],
    },
    {
      id: TQ, title: 'Unstilled Candles', kind: 'township', act: 2, giver: 'npc.chandlerAnsel',
      summary: 'Ansel, a lapsed Covenant chandler, wants to pour honest light in Hearthstead and temper relics in true flame.',
      chronicle: chron('A repentant chandler asked about Hearthstead.', 'Recruit Ansel and raise the Reliquary.', 'The Reliquary\'s candles burn and flicker, the way candles should.'),
      discoverWhen: any(talked('npc.chandlerAnsel'), accepted(TQ)),
      activateWhen: accepted(TQ),
      objectives: [
        obj('recruitAnsel', 'Invite Ansel to Hearthstead (Hearthstead ledger).', recruited('npc.chandlerAnsel'), P(165, 135)),
        obj('buildReliquary', 'Build the Reliquary on a Hearthstead plot.', built('building.reliquary'), undefined, recruited('npc.chandlerAnsel')),
      ],
      rewards: [{ type: 'item', itemId: 'item.phoenixAsh', qty: 2 }, { type: 'xp', amount: 400 }],
    },
  ],
};
