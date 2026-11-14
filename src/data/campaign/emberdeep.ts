/** (0,−2) — Act III: the Emberdeep Caldera and the Covenant's Kilnworks. Unlocks Kael's apex form. */
import type { ChapterContent } from '../dsl';
import { acceptChoice, byId, catchItem, chron, chunkAt, dlg, foe, material, npc, obj, prop, setFlag } from '../dsl';
import { accepted, all, always, any, crossed, defeated, entered, fieldDone, flagIs, liberated, not, questAtLeast, questIs } from '../conditions';
import { CHAIN, FLAG, GATE, MAIN } from '../ids';

const P = chunkAt(0, -2);
const R = { rim: 'emberdeepRim', kiln: 'kilnworks', crown: 'sovereignsCrown' } as const;
const KAEL3 = 'companion.kael.sovereignEmber';
const SABLE3 = 'companion.sable.kilnReliquary';

export const emberdeep: ChapterContent = {
  chunk: { cx: 0, cz: -2, name: 'The Emberdeep Caldera', biome: 'volcanic', act: 3, scatterProps: ['basalt', 'crystal', 'obelisk'], foliageDensity: 0.05 },
  regions: [
    { id: R.rim, name: 'Emberdeep Rim', biome: 'volcanic', center: P(130, 195), radius: 30, occupied: false,
      blurb: 'Black glass and hot wind on the caldera\'s lip. The ground is warm through your boots.' },
    { id: R.kiln, name: 'The Kilnworks', biome: 'volcanic', center: P(130, 105), radius: 30, occupied: true,
      blurb: 'The Greyspire Works\' furnaces. Stilled spirits go in; something cold and steady comes out.' },
    { id: R.crown, name: 'The Sovereign\'s Crown', biome: 'volcanic', center: P(205, 45), radius: 24, occupied: false,
      blurb: 'The caldera\'s heart, where the first drakes are said to have hatched.' },
  ],
  water: [{ center: P(60, 60), radius: 12, kind: 'lake' }],
  paths: [
    { points: [P(130, 250), P(128, 200), P(130, 140), P(130, 110)], width: 3 },
    { points: [P(0, 130), P(60, 135), P(130, 140)], width: 3 },
    { points: [P(130, 110), P(170, 70), P(200, 48)], width: 2.5 },
    { points: [P(60, 135), P(60, 80)], width: 2 },
  ],
  props: [
    prop('basalt', P(100, 90)), prop('basalt', P(160, 90)), prop('basalt', P(100, 125)), prop('basalt', P(160, 125)),
    prop('tower', P(130, 80), { scale: 1.6, tint: '#6a5a5a' }), prop('fortWall', P(110, 75)), prop('fortWall', P(150, 75)),
    prop('campfire', P(120, 210)), prop('tent', P(140, 212), { tint: '#7a5040' }), prop('obelisk', P(205, 30), { tint: '#ffcf70' }),
    prop('crystal', P(222, 52), { tint: '#ff9050' }), prop('crystal', P(188, 60), { tint: '#ff9050' }), prop('shrine', P(212, 40), { tint: '#ffd08a' }),
    prop('statue', P(40, 170), { tint: '#4a3a3a' }), prop('ruin', P(80, 200)), prop('sign', P(126, 238)), prop('basalt', P(220, 160)),
    prop('lantern', P(118, 132), { tint: '#e8f0ff' }), prop('gateArch', P(130, 140), { scale: 1.3 }),
  ],
  gates: [],
  npcs: [
    npc('npc.stokerBren', 'Bren', 'Escaped furnace-stoker', 'npc.stoker', P(118, 220), [
      [questIs(MAIN.emberdeep, 'COMPLETED'), 'dlg.bren.after'],
      [questIs(MAIN.emberdeep, 'ACTIVE'), 'dlg.bren.hint'],
      [questIs(MAIN.emberdeep, 'DISCOVERED'), 'dlg.bren.offer'],
      [always, 'dlg.bren.idle'],
    ]),
    npc('npc.stokerOona', 'Oona', 'Freed stoker', 'npc.stoker', P(92, 150), [
      [not(flagIs('clue:kilnManifest')), 'dlg.oona.clue'],
      [always, 'dlg.oona.idle'],
    ], { presentWhen: defeated('enc.kilnForeman') }),
    npc('npc.crownEmber', 'The Banked Flame', 'Heart of the caldera', 'npc.flame', P(205, 52), [
      [all(liberated(R.kiln), not(flagIs(FLAG.sovereign))), 'dlg.crown.awaken'],
      [always, 'dlg.crown.idle'],
    ]),
    npc('npc.clanElderEmber', 'Ember of Elder Kaiden', 'Last ember of the clan-elders', 'npc.shade', P(228, 62), [
      [all(questIs(KAEL3, 'ACTIVE'), defeated('enc.ashenEcho'), not(flagIs('kael.emberClaimed'))), 'dlg.elder.claim'],
      [always, 'dlg.elder.speak'],
    ], { hiddenUntilDrakeSight: true, presentWhen: questAtLeast(KAEL3, 'DISCOVERED') }),
    npc('npc.ashSmugglerCrane', 'Crane', 'Ash-smuggler', 'npc.thief', P(30, 128), [
      [all(questIs(SABLE3, 'ACTIVE'), defeated('enc.kilnReliquary')), 'dlg.crane.done'],
      [questIs(SABLE3, 'ACTIVE'), 'dlg.crane.hint'],
      [always, 'dlg.crane.idle'],
    ]),
    npc('npc.hermitVolka', 'Volka', 'Caldera hermit', 'npc.hermit', P(70, 225), [[always, 'dlg.volka.idle']]),
  ],
  zones: [
    { id: 'zone.magmaHulks', encounterId: 'enc.magmaHulks', position: P(200, 180), radius: 6, sprite: 'enemy.beast.magmaHulk', once: false },
    { id: 'zone.cinderSouls', encounterId: 'enc.cinderSouls', position: P(40, 200), radius: 6, sprite: 'enemy.wisp.cinderSoul', once: false },
    { id: 'zone.kilnForeman', encounterId: 'enc.kilnForeman', position: P(108, 150), radius: 6, sprite: 'enemy.humanoid.kilnForeman', once: true },
    { id: 'zone.forgemaster', encounterId: 'enc.forgemaster', position: P(130, 96), radius: 7, sprite: 'enemy.humanoid.forgemasterSkarn', once: true,
      presentWhen: flagIs('emberdeep.furnaceMapped') },
    { id: 'zone.ashenEcho', encounterId: 'enc.ashenEcho', position: P(225, 80), radius: 7, sprite: 'enemy.wisp.ashenEcho', once: true,
      presentWhen: fieldDone('drakeSight', 'npc.clanElderEmber') },
    { id: 'zone.kilnReliquary', encounterId: 'enc.kilnReliquary', position: P(25, 100), radius: 7, sprite: 'enemy.humanoid.kilnReliquary', once: true,
      presentWhen: questIs(SABLE3, 'ACTIVE') },
  ],
  spots: [{ id: 'spot.boilingSpring', name: 'The Boiling Spring', position: P(60, 74), fish: ['fish.boilfinChub', 'fish.sulphurEel', 'fish.magmaKoi'] }],
  enemies: {
    magmaHulk: foe('magmaHulk', 'Magma Hulk', 'enemy.beast.magmaHulk', 24, 'brute', {
      affinities: { fire: 0.2, water: 1.6, ice: 1.5 }, skills: ['skill.enemy.slagHurl'], drops: [{ itemId: 'item.obsidianSlag', chance: 0.6 }],
    }),
    kilnStoker: foe('kilnStoker', 'Kiln Stoker', 'enemy.humanoid.kilnStoker', 25, 'skirmisher', {
      affinities: { fire: 0.5, water: 1.3, ice: 1.3 }, skills: ['skill.enemy.slagHurl', 'skill.enemy.quenchSpray', 'skill.enemy.titheStrike'], drops: [{ itemId: 'item.obsidianSlag', chance: 0.5 }],
    }),
    cinderSoul: foe('cinderSoul', 'Stilled Cinder-Soul', 'enemy.wisp.cinderSoul', 25, 'caster', {
      affinities: { physical: 0.6, fire: 0.3, water: 1.6, ice: 1.4 }, skills: ['skill.enemy.emberSpit', 'skill.enemy.kilnBlast'], drops: [{ itemId: 'item.wispDust', chance: 0.6 }],
    }),
    kilnForeman: foe('kilnForeman', 'Kiln Foreman Tarrow', 'enemy.humanoid.kilnForeman', 26, 'tank', {
      affinities: { fire: 0.5, holy: 0.8 }, skills: ['skill.enemy.shieldWall', 'skill.enemy.slagHurl'], drops: [{ itemId: 'item.obsidianSlag', chance: 1 }],
    }),
    forgemasterSkarn: foe('forgemasterSkarn', 'Forgemaster Skarn', 'enemy.humanoid.forgemasterSkarn', 28, 'boss', {
      affinities: { fire: 0.3, holy: 0.7, water: 1.4 }, skills: ['skill.enemy.kilnBlast', 'skill.enemy.slagHurl', 'skill.enemy.shieldWall'],
      drops: [{ itemId: 'item.obsidianSlag', chance: 1 }, { itemId: 'item.hiTonic', chance: 0.8 }],
    }),
    ashenEcho: foe('ashenEcho', 'Echo of the Burning', 'enemy.wisp.ashenEcho', 28, 'bossCaster', {
      affinities: { fire: 0.2, holy: 1.3 }, skills: ['skill.enemy.kilnBlast', 'skill.enemy.stillingHymn'], drops: [{ itemId: 'item.cinderglass', chance: 1 }],
    }),
    kilnReliquary: foe('kilnReliquary', 'Kiln Reliquary Warden', 'enemy.humanoid.kilnReliquary', 27, 'boss', {
      affinities: { fire: 0.5, shadow: 1.3 }, skills: ['skill.enemy.reliquaryLight', 'skill.enemy.shieldWall'], drops: [{ itemId: 'item.obsidianSlag', chance: 1 }],
    }),
  },
  encounters: {
    'enc.magmaHulks': { id: 'enc.magmaHulks', name: 'Magma Hulks', enemies: ['magmaHulk', 'magmaHulk'], canFlee: true },
    'enc.cinderSouls': { id: 'enc.cinderSouls', name: 'Stilled Cinder-Souls', enemies: ['cinderSoul', 'cinderSoul', 'cinderSoul'], canFlee: true },
    'enc.kilnForeman': { id: 'enc.kilnForeman', name: 'The Kiln Gate', enemies: ['kilnForeman', 'kilnStoker', 'kilnStoker'], canFlee: true },
    'enc.forgemaster': { id: 'enc.forgemaster', name: 'Forgemaster Skarn', enemies: ['forgemasterSkarn', 'kilnStoker', 'cinderSoul'], canFlee: false, boss: true, liberatesRegion: R.kiln },
    'enc.ashenEcho': { id: 'enc.ashenEcho', name: 'Echo of the Burning', enemies: ['ashenEcho', 'cinderSoul'], canFlee: false, boss: true },
    'enc.kilnReliquary': { id: 'enc.kilnReliquary', name: 'The Kiln Reliquary', enemies: ['kilnReliquary', 'kilnStoker', 'kilnStoker'], canFlee: false, boss: true },
  },
  species: {
    cinderGoat: { id: 'cinderGoat', name: 'Cinder Goat', sprite: 'animal.deer.cinderGoat', speed: 8, wanderSpeed: 0.8, alertRadius: 17, scentSensitivity: 2.2,
      drops: [{ itemId: 'item.cinderGoatHorn', chance: 0.75 }, { itemId: 'item.smokedVenison', chance: 0.5 }], herd: { min: 2, max: 2 }, habitat: [{ center: P(190, 215), radius: 12 }] },
    ashHawk: { id: 'ashHawk', name: 'Ash Hawk', sprite: 'animal.bird.ashHawk', speed: 13, wanderSpeed: 1.1, alertRadius: 18, scentSensitivity: 0.2,
      drops: [{ itemId: 'item.ashHawkPlume', chance: 0.9 }], herd: { min: 2, max: 2 }, habitat: [{ center: P(40, 30), radius: 10 }] },
  },
  fish: {
    'fish.boilfinChub': { id: 'fish.boilfinChub', name: 'Boilfin Chub', itemId: 'item.fish.boilfinChub', rarity: 'common', fight: 0.3, weight: 40 },
    'fish.sulphurEel': { id: 'fish.sulphurEel', name: 'Sulphur Eel', itemId: 'item.fish.sulphurEel', rarity: 'uncommon', fight: 0.56, weight: 15 },
    'fish.magmaKoi': { id: 'fish.magmaKoi', name: 'Magma Koi', itemId: 'item.fish.magmaKoi', rarity: 'rare', fight: 0.74, weight: 5, preferredLure: 'item.lure.emberFly' },
  },
  items: {
    'item.obsidianSlag': material('item.obsidianSlag', 'Obsidian Slag', 'Glassy furnace-waste. It holds an edge like nothing else.', '⬛', 40),
    'item.cinderGoatHorn': material('item.cinderGoatHorn', 'Cinder Goat Horn', 'Spiralled and warm to the touch.', '🐐', 36),
    'item.ashHawkPlume': material('item.ashHawkPlume', 'Ash Hawk Plume', 'Grey above, flame-orange beneath.', '🪶', 30),
    'item.fish.boilfinChub': catchItem('item.fish.boilfinChub', 'Boilfin Chub', 'Comes out of the water already cooked.', 36, 12),
    'item.fish.sulphurEel': catchItem('item.fish.sulphurEel', 'Sulphur Eel', 'Yellow and pungent.', 52, 30),
    'item.fish.magmaKoi': catchItem('item.fish.magmaKoi', 'Magma Koi', 'Black scales cracked with glowing seams.', 70, 110, '🐠'),
  },
  dialogues: byId([
    dlg('dlg.bren.idle', [
      ['Bren', 'I stoked the kilns for eleven years. I stopped hearing the screaming in year two.'],
      ['Bren', 'Then I started again.'],
    ]),
    dlg('dlg.bren.offer', [
      ['Bren', 'You came over the scarp or through the seal — either way, you\'re mad, and I need mad.'],
      ['Bren', 'The Kilnworks render stilled Wardens into the Still Flame\'s fuel. Spirits from every hall you freed came through here. Shut it down.'],
    ], { choices: acceptChoice(MAIN.emberdeep, 'We\'ll douse the kilns.') }),
    dlg('dlg.bren.hint', [
      ['Bren', 'Foreman Tarrow holds the kiln gate. Oona\'s chained behind it; she knows the furnace layout.'],
      ['Bren', 'Then Skarn. Then the caldera\'s heart — something old is waiting there.'],
    ]),
    dlg('dlg.bren.after', [
      ['Bren', 'The kilns are cold. First time in a century.'],
      ['Bren', 'Greyspire lies south of Lanternwick, behind the Hierophant\'s Veil. Your archivist can read it open.'],
    ]),
    dlg('dlg.oona.clue', [
      ['Oona', 'Free? Then listen fast: the furnace manifest. Every spirit, every hall, every weight — shipped to the cathedral under Greyspire.'],
      ['Oona', 'The Still Flame isn\'t a symbol. It\'s a furnace that burns Wardens and never flickers.'],
    ], { onEnd: [setFlag('clue:kilnManifest'), setFlag('emberdeep.furnaceMapped')] }),
    dlg('dlg.oona.idle', [
      ['Oona', 'Skarn\'s in the central kiln.'],
      ['Oona', 'Hit him with water if you have any. He hates the hiss.'],
    ]),
    dlg('dlg.crown.awaken', [
      ['The Banked Flame', 'Drake-child. You doused the kilns, and every stolen ember in the caldera turned to look at you.'],
      ['Ashka', 'This is where the first of your blood hatched, Kael. Let it remember you.'],
      ['The Banked Flame', 'Take the crown that flickers. Sovereign of the Banked Flame — wear it gently.'],
    ], { onEnd: [setFlag(FLAG.sovereign)] }),
    dlg('dlg.crown.idle', [
      ['The Banked Flame', 'Burn, and choose to.'],
      ['The Banked Flame', 'That is all a flame is for.'],
    ]),
    dlg('dlg.elder.speak', [
      ['Ember of Elder Kaiden', 'Grandson. I hid here when the procession came. An ember is easy to miss.'],
      ['Ember of Elder Kaiden', 'The memory of the burning walks the crater. Lay it to rest, and take what I kept for you.'],
    ]),
    dlg('dlg.elder.claim', [
      ['Ember of Elder Kaiden', 'The echo is quiet. So am I, almost.'],
      ['Ember of Elder Kaiden', 'Set me in iron and wear me. When you take wing, I will beat for you.'],
      ['Kael', 'I\'ll carry you home, grandfather.'],
    ], { onEnd: [setFlag('kael.emberClaimed')] }),
    dlg('dlg.crane.idle', [
      ['Crane', 'Ash sells. Don\'t ask what it used to be.'],
      ['Crane', 'There\'s a reliquary vault on the west ledge. Too high for me.'],
    ]),
    dlg('dlg.crane.hint', [
      ['Crane', 'Sable! Climb the scarp; the Kiln Reliquary sits on the west ledge. Its warden carries a hook the size of a moon.'],
      ['Sable', 'I like moons.'],
    ]),
    dlg('dlg.crane.done', [
      ['Crane', 'You emptied the Kiln Reliquary? The whole ledge is singing.'],
      ['Sable', 'And I took the warden\'s hook. It cuts chains now.'],
    ], { onEnd: [setFlag('sable.vaultEmptied')] }),
    dlg('dlg.volka.idle', [
      ['Volka', 'The caldera breathes once a day. Be elsewhere at noon.'],
      ['Volka', 'The goats know. Follow the goats.'],
    ]),
  ]),
  quests: [
    {
      id: MAIN.emberdeep, title: 'The Kilnworks', kind: 'main', act: 3, giver: 'npc.stokerBren',
      summary: 'Every road of stolen light leads to the Emberdeep Caldera, where the Greyspire Works render stilled Wardens into fuel.',
      chronicle: chron(
        'Both the Hall of Ledgers and the Lantern Hall point north-east: to the caldera.',
        'Break the kiln gate, learn the furnace layout, destroy Forgemaster Skarn, and climb to the caldera\'s heart.',
        'The Kilnworks are cold. At the Sovereign\'s Crown, the Banked Flame named Kael its sovereign.',
      ),
      discoverWhen: all(questIs(MAIN.saffrane, 'COMPLETED'), questIs(MAIN.rimefold, 'COMPLETED'), any(crossed('unseal', GATE.calderaSeal), crossed('grapple', GATE.frostScarp))),
      activateWhen: accepted(MAIN.emberdeep),
      objectives: [
        obj('gate', 'Break the kiln gate.', defeated('enc.kilnForeman'), P(108, 150)),
        obj('oona', 'Learn the furnace layout from Oona.', flagIs('emberdeep.furnaceMapped'), P(92, 150), defeated('enc.kilnForeman')),
        obj('skarn', 'Destroy Forgemaster Skarn and liberate the Kilnworks.', liberated(R.kiln), P(130, 96), flagIs('emberdeep.furnaceMapped')),
        obj('crown', 'Climb to the Sovereign\'s Crown.', entered(R.crown), P(205, 45), liberated(R.kiln)),
        obj('awaken', 'Answer the Banked Flame.', flagIs(FLAG.sovereign), P(205, 52), entered(R.crown)),
      ],
      rewards: [{ type: 'gear', gearId: 'armor.kilnwardenPlate' }, { type: 'xp', amount: 3200 }, { type: 'coin', amount: 700 }],
    },
    {
      id: KAEL3, chain: { id: CHAIN.kael, stage: 3, of: 3, title: 'Embers of the Clan' }, title: 'The Sovereign\'s Ember', kind: 'companion', act: 3, companion: 'kael', giver: 'npc.clanElderEmber',
      summary: 'With the kilns cold, Ashka hears a clan-voice in the crater: an elder\'s ember that hid from the procession.',
      chronicle: chron('Ashka is listening to something in the crater.', 'Find the hidden ember with Drake-Sight, lay the Echo of the Burning to rest, and claim what the elder kept.', 'Kael carries his grandfather\'s ember in the Drakeheart Sigil. When he takes wing, it beats.'),
      discoverWhen: all(questIs('companion.kael.bankedHearth', 'COMPLETED'), questIs(MAIN.emberdeep, 'COMPLETED')),
      activateWhen: fieldDone('drakeSight', 'npc.clanElderEmber'),
      objectives: [
        obj('reveal', 'Use Drake-Sight at the crater\'s edge.', fieldDone('drakeSight', 'npc.clanElderEmber'), P(228, 62)),
        obj('echo', 'Lay the Echo of the Burning to rest.', defeated('enc.ashenEcho'), P(225, 80), fieldDone('drakeSight', 'npc.clanElderEmber')),
        obj('claim', 'Claim the elder\'s ember.', flagIs('kael.emberClaimed'), P(228, 62), defeated('enc.ashenEcho')),
      ],
      rewards: [{ type: 'gear', gearId: 'sig.drakeheartSigil' }, { type: 'xp', amount: 2600 }],
    },
    {
      id: SABLE3, chain: { id: CHAIN.sable, stage: 3, of: 3, title: 'Lantern-Thief' }, title: 'The Kiln Reliquary', kind: 'companion', act: 3, companion: 'sable', giver: 'npc.ashSmugglerCrane',
      summary: 'The biggest reliquary Sable has ever heard of sits on a ledge above the caldera, guarded by a warden with a hook.',
      chronicle: chron('Sable has been eyeing the caldera\'s west ledge.', 'Climb the Frost Scarp and empty the Kiln Reliquary.', 'The Kiln Reliquary is empty and singing. Sable took the warden\'s hook: the Reaper\'s Hook.'),
      discoverWhen: all(questIs('companion.sable.chimeLedge', 'COMPLETED'), questIs(MAIN.emberdeep, 'COMPLETED')),
      activateWhen: crossed('grapple', GATE.frostScarp),
      objectives: [
        obj('scarp', 'Grapple up the Frost Scarp (Sable).', crossed('grapple', GATE.frostScarp), P(0, 130)),
        obj('vault', 'Defeat the Kiln Reliquary Warden.', defeated('enc.kilnReliquary'), P(25, 100)),
        obj('crane', 'Tell Crane the ledge is clear.', flagIs('sable.vaultEmptied'), P(30, 128), defeated('enc.kilnReliquary')),
      ],
      rewards: [{ type: 'gear', gearId: 'sig.reapersHook' }, { type: 'xp', amount: 2600 }],
    },
  ],
};
