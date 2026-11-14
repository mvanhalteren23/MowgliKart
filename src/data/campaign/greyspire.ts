/** (0,1) — Act III finale: Greyspire, the Hollow Covenant's cathedral seat. */
import type { ChapterContent } from '../dsl';
import { acceptChoice, byId, catchItem, chron, chunkAt, dlg, foe, gate, material, npc, obj, prop, setFlag } from '../dsl';
import { accepted, all, always, any, choseIn, crossed, defeated, fieldDone, flagIs, liberated, not, questIs } from '../conditions';
import { CHAIN, FLAG, GATE, MAIN } from '../ids';
import { trueEndingReady } from '../story';

const P = chunkAt(0, 1);
const R = { city: 'greyspire', sanctum: 'stillFlameSanctum', cloister: 'ossuaryCloister' } as const;
const QUILL3 = 'companion.quill.margins';
export const FINAL_DIALOGUE = 'dlg.flameHeart.choice';

export const greyspire: ChapterContent = {
  chunk: { cx: 0, cz: 1, name: 'Greyspire', biome: 'ruin', act: 3, scatterProps: ['statue', 'obelisk', 'lantern'], foliageDensity: 0.2 },
  regions: [
    { id: R.city, name: 'Greyspire', biome: 'ruin', center: P(110, 85), radius: 34, occupied: true,
      blurb: 'The cathedral city of the Hollow Covenant. Its bells never ring; its lamps never flicker.' },
    { id: R.sanctum, name: 'The Still Flame Sanctum', biome: 'ruin', center: P(110, 190), radius: 26, occupied: true,
      blurb: 'Beneath the cathedral, a fire burns without moving. It is very cold.' },
    { id: R.cloister, name: 'The Ossuary Cloister', biome: 'ruin', center: P(40, 140), radius: 26, occupied: false,
      blurb: 'Where the Covenant\'s archivists are buried with their pens.' },
  ],
  water: [
    { center: P(40, 215), radius: 10, kind: 'lake' },
    { center: P(310, 100), radius: 75, kind: 'sea' },
    { center: P(310, 200), radius: 75, kind: 'sea' },
  ],
  paths: [
    { points: [P(110, 0), P(110, 50), P(110, 85)], width: 3.5 },
    { points: [P(110, 85), P(110, 150), P(110, 182)], width: 3.5 },
    { points: [P(110, 85), P(70, 120), P(42, 140)], width: 2.5 },
    { points: [P(42, 140), P(40, 196)], width: 2 },
  ],
  props: [
    prop('cathedral', P(110, 70), { scale: 2, tint: '#b8bcc4' }), prop('tower', P(80, 60), { scale: 1.5 }), prop('tower', P(140, 60), { scale: 1.5 }),
    prop('statue', P(96, 100)), prop('statue', P(124, 100)), prop('lantern', P(100, 40), { tint: '#e8f0ff' }), prop('lantern', P(120, 40), { tint: '#e8f0ff' }),
    prop('gateArch', P(110, 20), { scale: 1.4 }), prop('obelisk', P(110, 165)), prop('shrine', P(110, 205), { tint: '#dfe8ff', scale: 1.4 }),
    prop('statue', P(92, 190)), prop('statue', P(128, 190)), prop('ruin', P(30, 120)), prop('ruin', P(55, 160)),
    prop('chapel', P(25, 150), { tint: '#9aa0a6' }), prop('fence', P(70, 30)), prop('house', P(150, 110), { tint: '#9aa0a6' }),
    prop('house', P(70, 100), { tint: '#9aa0a6' }), prop('well', P(110, 120)), prop('sign', P(116, 8)),
  ],
  gates: [
    gate(GATE.hierophantVeil, 'ward', 'The Hierophant\'s Veil', P(110, 0), [P(110, 7), P(110, -7)], { width: 14, depth: 3 }),
  ],
  npcs: [
    npc('npc.vergerCole', 'Cole', 'Lapsed verger', 'npc.covenantMonk', P(98, 30), [
      [questIs(MAIN.greyspire, 'COMPLETED'), 'dlg.cole.after'],
      [questIs(MAIN.greyspire, 'ACTIVE'), 'dlg.cole.hint'],
      [questIs(MAIN.greyspire, 'DISCOVERED'), 'dlg.cole.offer'],
      [always, 'dlg.cole.idle'],
    ]),
    npc('npc.sacristanElm', 'Sacristan Elm', 'Keeper of the sanctum stair', 'npc.covenantMonk', P(118, 140), [
      [flagIs('greyspire.sanctumOpen'), 'dlg.elm.after'],
      [always, 'dlg.elm.stair'],
    ], { hiddenUntilDrakeSight: true, presentWhen: liberated(R.city) }),
    npc('npc.flameHeart', 'The Still Flame', 'A fire that has forgotten how to move', 'npc.flame', P(110, 214), [
      [any(choseIn(FINAL_DIALOGUE, 'quench'), choseIn(FINAL_DIALOGUE, 'sacrifice'), choseIn(FINAL_DIALOGUE, 'unbind')), 'dlg.flameHeart.after'],
      [always, FINAL_DIALOGUE],
    ], { presentWhen: defeated('enc.hierophant') }),
    npc('npc.archivistMorwen', 'Morwen', 'Archivist-Prime, retired', 'npc.archivist', P(48, 132), [
      [all(questIs(QUILL3, 'ACTIVE'), not(flagIs('quill.marginsWritten'))), 'dlg.morwen.quill'],
      [always, 'dlg.morwen.idle'],
    ]),
    npc('npc.pilgrimRosk', 'Rosk', 'Doubting pilgrim', 'npc.pilgrim', P(135, 35), [[always, 'dlg.rosk.idle']]),
    npc('npc.choirChildLiss', 'Liss', 'Choir child', 'npc.child', P(150, 90), [
      [liberated(R.sanctum), 'dlg.liss.after'],
      [always, 'dlg.liss.idle'],
    ]),
  ],
  zones: [
    { id: 'zone.ossuaryHounds', encounterId: 'enc.ossuaryHounds', position: P(60, 180), radius: 6, sprite: 'enemy.beast.ossuaryHound', once: false },
    { id: 'zone.vanguard', encounterId: 'enc.vanguard', position: P(150, 40), radius: 6, sprite: 'enemy.humanoid.cathedralVanguard', once: false },
    { id: 'zone.exarch', encounterId: 'enc.exarch', position: P(110, 92), radius: 7, sprite: 'enemy.humanoid.exarchThorne', once: true,
      presentWhen: questIs(MAIN.greyspire, 'ACTIVE') },
    { id: 'zone.hierophant', encounterId: 'enc.hierophant', position: P(110, 196), radius: 8, sprite: 'enemy.humanoid.hierophant', once: true,
      presentWhen: flagIs('greyspire.sanctumOpen') },
  ],
  spots: [{ id: 'spot.cloisterPool', name: 'Cloister Pool', position: P(40, 202), fish: ['fish.cloisterCarp', 'fish.vespersEel', 'fish.ghostfin'] }],
  enemies: {
    cathedralVanguard: foe('cathedralVanguard', 'Cathedral Vanguard', 'enemy.humanoid.cathedralVanguard', 30, 'tank', {
      affinities: { holy: 0.5, shadow: 1.3 }, skills: ['skill.enemy.shieldWall', 'skill.enemy.titheStrike'], drops: [{ itemId: 'item.stillWax', chance: 0.5 }],
    }),
    stilledSeraph: foe('stilledSeraph', 'Stilled Seraph', 'enemy.wisp.stilledSeraph', 31, 'caster', {
      affinities: { physical: 0.6, holy: 0.4, fire: 1.4, shadow: 1.3 }, skills: ['skill.enemy.stillingVerdict', 'skill.enemy.fontSurge', 'skill.enemy.stillMend'], drops: [{ itemId: 'item.stillWax', chance: 0.5 }],
    }),
    ossuaryHound: foe('ossuaryHound', 'Ossuary Hound', 'enemy.beast.ossuaryHound', 30, 'skirmisher', {
      affinities: { shadow: 0.5, holy: 1.4, fire: 1.2 }, skills: ['skill.enemy.gnash', 'skill.enemy.ossuaryHowl'], drops: [{ itemId: 'item.wolfPelt', chance: 0.5 }],
    }),
    exarchThorne: foe('exarchThorne', 'Exarch Thorne', 'enemy.humanoid.exarchThorne', 32, 'boss', {
      affinities: { holy: 0.5, shadow: 1.3 }, skills: ['skill.enemy.judgement', 'skill.enemy.shieldWall', 'skill.enemy.titheStrike'],
      drops: [{ itemId: 'item.stillWax', chance: 1 }, { itemId: 'item.hiTonic', chance: 1 }],
    }),
    hierophant: foe('hierophant', 'The Hierophant of the Still Flame', 'enemy.humanoid.hierophant', 35, 'bossCaster', {
      affinities: { holy: 0.4, fire: 0.8, shadow: 1.2 }, skills: ['skill.enemy.stillingVerdict', 'skill.enemy.judgement', 'skill.enemy.stillMend', 'skill.enemy.kilnBlast'],
      drops: [{ itemId: 'item.stillWax', chance: 1 }, { itemId: 'item.phoenixAsh', chance: 1 }],
    }),
  },
  encounters: {
    'enc.ossuaryHounds': { id: 'enc.ossuaryHounds', name: 'Ossuary Hounds', enemies: ['ossuaryHound', 'ossuaryHound', 'ossuaryHound'], canFlee: true },
    'enc.vanguard': { id: 'enc.vanguard', name: 'Cathedral Vanguard', enemies: ['cathedralVanguard', 'stilledSeraph', 'cathedralVanguard'], canFlee: true },
    'enc.exarch': { id: 'enc.exarch', name: 'Exarch Thorne', enemies: ['exarchThorne', 'cathedralVanguard', 'stilledSeraph'], canFlee: false, boss: true, liberatesRegion: R.city },
    'enc.hierophant': { id: 'enc.hierophant', name: 'The Hierophant', enemies: ['hierophant', 'stilledSeraph', 'stilledSeraph'], canFlee: false, boss: true, liberatesRegion: R.sanctum },
  },
  species: {
    ashDove: { id: 'ashDove', name: 'Ash Dove', sprite: 'animal.bird.ashDove', speed: 10, wanderSpeed: 0.9, alertRadius: 12, scentSensitivity: 0.4,
      drops: [{ itemId: 'item.doveFeather', chance: 0.9 }], herd: { min: 2, max: 2 }, habitat: [{ center: P(40, 60), radius: 12 }] },
    graveHare: { id: 'graveHare', name: 'Grave Hare', sprite: 'animal.hare.grave', speed: 10, wanderSpeed: 1.2, alertRadius: 8, scentSensitivity: 1.8,
      drops: [{ itemId: 'item.hareFoot', chance: 0.8 }, { itemId: 'item.ashHareFur', chance: 0.4 }], herd: { min: 2, max: 2 }, habitat: [{ center: P(170, 160), radius: 10 }] },
  },
  fish: {
    'fish.cloisterCarp': { id: 'fish.cloisterCarp', name: 'Cloister Carp', itemId: 'item.fish.cloisterCarp', rarity: 'common', fight: 0.3, weight: 40 },
    'fish.vespersEel': { id: 'fish.vespersEel', name: 'Vespers Eel', itemId: 'item.fish.vespersEel', rarity: 'uncommon', fight: 0.56, weight: 15 },
    'fish.ghostfin': { id: 'fish.ghostfin', name: 'Stillwater Ghostfin', itemId: 'item.fish.ghostfin', rarity: 'rare', fight: 0.76, weight: 4, preferredLure: 'item.lure.emberFly' },
  },
  items: {
    'item.stillWax': material('item.stillWax', 'Still Wax', 'Candle-wax that will not melt. Ansel shudders at it, then melts it anyway.', '🕯️', 48),
    'item.doveFeather': material('item.doveFeather', 'Ash Dove Feather', 'Soft grey down from the cathedral eaves.', '🪶', 30),
    'item.fish.cloisterCarp': catchItem('item.fish.cloisterCarp', 'Cloister Carp', 'Fat on archivists\' crusts.', 40, 14),
    'item.fish.vespersEel': catchItem('item.fish.vespersEel', 'Vespers Eel', 'Only bites at evening bell.', 56, 34),
    'item.fish.ghostfin': catchItem('item.fish.ghostfin', 'Stillwater Ghostfin', 'Almost invisible. Almost.', 72, 120, '🐠'),
  },
  dialogues: byId([
    dlg('dlg.cole.idle', [
      ['Cole', 'I lit the cathedral lamps for twenty years. They never needed lighting.'],
      ['Cole', 'That should have told me something.'],
    ]),
    dlg('dlg.cole.offer', [
      ['Cole', 'You read the Veil open. Then the Hierophant knows you\'re here — he knows everything that moves in Greyspire.'],
      ['Cole', 'Exarch Thorne holds the nave. Beneath it, the sanctum stair, and beneath that, the Still Flame. End it.'],
    ], { choices: acceptChoice(MAIN.greyspire, 'We end it today.', 'Give us a moment.') }),
    dlg('dlg.cole.hint', [
      ['Cole', 'Thorne first. Then find Sacristan Elm — he hides even from us. Only the stair-keeper can open the sanctum.'],
      ['Cole', 'Drake-eyes, I think. Everything here is glamoured.'],
    ]),
    dlg('dlg.cole.after', [
      ['Cole', 'The lamps flicker now. Every one of them.'],
      ['Cole', 'I have never seen anything so beautiful.'],
    ]),
    dlg('dlg.elm.stair', [
      ['Sacristan Elm', 'You see me. Then it is time.'],
      ['Sacristan Elm', 'I have kept this stair for the Hierophant for forty years, and prayed every night someone would come down it to stop him. Go.'],
    ], { onEnd: [setFlag('greyspire.sanctumOpen')] }),
    dlg('dlg.elm.after', [
      ['Sacristan Elm', 'The stair is open.'],
      ['Sacristan Elm', 'I am going to sit in the sun for a while.'],
    ]),
    dlg(FINAL_DIALOGUE, [
      ['The Still Flame', 'Drake-blood. The first Hierophant fed me his, so I would never flicker. Every Hierophant since has fed me Wardens.'],
      ['Ashka', 'Kael. It is full of us. Every hearth, every spring, every wind.'],
      ['The Still Flame', 'Quench me, and they die with me. Feed me your blood, and I will flicker — once — and let them go. Or…'],
    ], {
      choices: [
        { id: 'quench', label: 'Quench the Still Flame.' },
        { id: 'sacrifice', label: 'Give it the drake-blood. Let them go.' },
        { id: 'unbind', label: 'Sound the Wyrm\'s Lament and call every Warden home.', when: trueEndingReady },
      ],
    }),
    dlg('dlg.flameHeart.after', [
      ['The Still Flame', '…'],
      ['Ashka', 'It is only a fire now, Kael. Just a fire.'],
    ]),
    dlg('dlg.morwen.quill', [
      ['Morwen', 'Quill. My worst pupil. You unwrote the Veil — I felt it from here.'],
      ['Quill', 'I came to write one last entry in the Covenant\'s book, Archivist-Prime.'],
      ['Morwen', 'Then use my quill. It writes in the margins, where the truth always ends up.'],
    ], { onEnd: [setFlag('quill.marginsWritten')] }),
    dlg('dlg.morwen.idle', [
      ['Morwen', 'Every archivist is buried with a pen. Mine is not ready to stop writing.'],
      ['Morwen', 'Mind the hounds in the ossuary.'],
    ]),
    dlg('dlg.rosk.idle', [
      ['Rosk', 'I walked here barefoot from Saltmarket to pray to the Still Flame.'],
      ['Rosk', 'I have been here a week. I think I will walk home.'],
    ]),
    dlg('dlg.liss.idle', [
      ['Liss', 'We sing the same three notes every day. The Exarch says they keep the spirits calm.'],
      ['Liss', 'I don\'t think the spirits like them.'],
    ]),
    dlg('dlg.liss.after', [
      ['Liss', 'We\'re learning new songs. Orla taught us a sea-shanty.'],
      ['Liss', 'The Exarch would hate it.'],
    ]),
  ]),
  quests: [
    {
      id: MAIN.greyspire, title: 'The Still Flame', kind: 'main', act: 3, giver: 'npc.vergerCole',
      summary: 'Beneath the cathedral at Greyspire, the Covenant feeds stilled Wardens into a flame that does not flicker.',
      chronicle: chron(
        'Every road the Covenant built leads to Greyspire.',
        'Break Exarch Thorne, find the hidden sacristan, descend to the sanctum and face the Hierophant.',
        'The Hierophant has fallen and the Still Flame has been answered. For the first time in a century, the Wardens choose.',
      ),
      discoverWhen: all(questIs(MAIN.emberdeep, 'COMPLETED'), crossed('unseal', GATE.hierophantVeil)),
      activateWhen: accepted(MAIN.greyspire),
      objectives: [
        obj('thorne', 'Break Exarch Thorne and liberate Greyspire.', liberated(R.city), P(110, 92)),
        obj('elm', 'Find the sanctum\'s keeper with Drake-Sight.', fieldDone('drakeSight', 'npc.sacristanElm'), P(118, 140), liberated(R.city)),
        obj('stair', 'Hear Sacristan Elm.', flagIs('greyspire.sanctumOpen'), P(118, 140), fieldDone('drakeSight', 'npc.sacristanElm')),
        obj('hierophant', 'Defeat the Hierophant in the Still Flame Sanctum.', liberated(R.sanctum), P(110, 196), flagIs('greyspire.sanctumOpen')),
        obj('choose', 'Answer the Still Flame.', any(choseIn(FINAL_DIALOGUE, 'quench'), choseIn(FINAL_DIALOGUE, 'sacrifice'), choseIn(FINAL_DIALOGUE, 'unbind')), P(110, 214), liberated(R.sanctum)),
      ],
      rewards: [{ type: 'xp', amount: 5000 }, { type: 'flag', key: FLAG.finale, value: true }],
    },
    {
      id: QUILL3, chain: { id: CHAIN.quill, stage: 3, of: 3, title: 'The Unburned Ledger' }, title: 'In the Margins', kind: 'companion', act: 3, companion: 'quill', giver: 'npc.archivistMorwen',
      summary: 'Quill\'s old teacher is buried — alive and very cross — in Greyspire\'s Ossuary Cloister.',
      chronicle: chron('Quill wants to visit her teacher.', 'Unseal the Hierophant\'s Veil and find Morwen in the Ossuary Cloister.', 'Quill wrote the Covenant\'s last entry with Morwen\'s Marginalia Quill.'),
      discoverWhen: all(questIs('companion.quill.vaultOfAshes', 'COMPLETED'), questIs(MAIN.emberdeep, 'COMPLETED')),
      activateWhen: crossed('unseal', GATE.hierophantVeil),
      objectives: [
        obj('veil', 'Unseal the Hierophant\'s Veil (Quill).', crossed('unseal', GATE.hierophantVeil), P(110, 0)),
        obj('morwen', 'Find Morwen in the Ossuary Cloister.', flagIs('quill.marginsWritten'), P(48, 132), crossed('unseal', GATE.hierophantVeil)),
      ],
      rewards: [{ type: 'gear', gearId: 'sig.marginaliaQuill' }, { type: 'xp', amount: 3000 }],
    },
  ],
};
