import type { StoryActDef } from '@/types/contracts';
import { QUEST } from './ids';

export const acts: readonly StoryActDef[] = [
  {
    act: 1,
    title: 'Act I — The Lanternwick Ledger',
    synopsis:
      'On the Lanternwick frontier, forty sacks of tithe-grain vanish between the mill and the Covenant\'s Greyford post, and the Hollow Covenant demands the settlers pay twice. Kael, last of the Ashen Drake clan, follows the ledger with warden Tobin Marsh and the arena duelist Vesna — and finds the Covenant robbing its own faithful. Along the way he recovers his clan\'s drowned relic, Vesna buys back her freedom in the Cinder Ring, and a cleared field called Hearthstead becomes a village.',
    beats: [
      'Lanternwick at lantern-light: Elder Maren asks Kael to trace the missing tithe-grain.',
      'Wenna the miller and Brother Caul\'s too-neat ledger point down the grain road.',
      'Drake-Sight pierces a Covenant glamour: Pell the carter, hidden and terrified, names Captain Ferris.',
      'The tithe wagon is broken on the grain road; the true ledger page shows the grain went to Deacon Vash.',
      'Companion — Embers of the Clan: Isolde guides Kael to the drowned shrine in Mirror Tarn; Ashka remembers, and the Wyrm\'s Lament is reclaimed.',
      'Companion — Debts of the Cinder Ring: Vesna runs down a bristleboar by hand and beats Halvard the Unbowed for her marker and the Cinder Ring Talon.',
      'Hearthstead rises: Bram\'s carpentry and Gilda\'s smithy turn a survey stake into a home.',
      'Greyford is stormed, Deacon Vash falls, and the occupied tithe-post is liberated. The grain comes home — and Greyspire takes notice.',
    ],
    questIds: [QUEST.ledger, QUEST.embers, QUEST.debts, QUEST.timber, QUEST.anvil],
  },
  {
    act: 2,
    title: 'Act II — The Hollow Covenant',
    synopsis:
      'With Greyford free, the frontier begins to talk. Across the coast, the tarn and the highlands, Kael\'s party pulls on separate threads in any order — doctored harbour tithes, wisps singing Covenant hymns, the lanterns seen on the night the Ashen Drake hall burned. Each thread frees a region, wakes a sealed Warden, and adds a locked companion to the roster. Together they reveal that the Covenant does not worship spirits: it stills them, and feeds them to something under Greyspire.',
    beats: [
      'Thessaly the wayfarer lays out three threads; the party may pursue them in any order.',
      'Salt in the Ledgers: Saltmarket\'s double-inked tithe-books lead to the Greyspire Works and to Orla of the Brinefolk.',
      'The Stilled Choir: the tarn wisps\' hymn is a binding-chant; Quill, an apostate archivist, deciphers it.',
      'The Ashen Road: Covenant lanterns on the night of the burning; Kael learns a Deacon lit the fire on the Hierophant\'s word.',
      'Sealed Wardens — Zephra, Tor, Lumen, Nyx — are found caged in chime, quarry, lantern and shadow; freeing each changes a region.',
      'Hadrik, Pim, Moss and Sable join as the frontier turns against the Covenant.',
    ],
    questIds: [QUEST.saltLedgers, QUEST.stilledChoir, QUEST.ashenRoad],
  },
  {
    act: 3,
    title: 'Act III — The Still Flame',
    synopsis:
      'Beneath the cathedral at Greyspire burns the Still Flame: a fire that does not flicker because it is fed on silenced Wardens. The Hierophant means to add the last free hearth-spirit, Ashka, and with her the drake-blood in Kael — and with it, the end of every spirit that ever chose. The party must descend through the cathedral\'s ledger-vaults, sound the Wyrm\'s Lament, and let the Flame flicker at last.',
    beats: [
      'The Covenant answers the frontier\'s defiance with an army of the stilled.',
      'Greyspire\'s ledger-vaults: a century of tithes, every one a spirit\'s silence.',
      'The Hierophant reveals the Still Flame and offers Kael his clan back — as embers in the fire.',
      'Kael takes his final dragon form; Ashka and Mirelle\'s Steamveil shields the party as the Wardens are unbound.',
      'The Wyrm\'s Lament is sounded for the first time in twenty years. The Flame flickers. The Wardens choose.',
    ],
    questIds: [QUEST.stillFlame],
  },
];
