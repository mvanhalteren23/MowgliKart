import type { StoryActDef } from '@/types/contracts';

/**
 * Act synopses. `questIds` is filled in by `src/data/index.ts` from each quest's `act`
 * so the chronicle always lists every quest in the database.
 */
export const acts: readonly Omit<StoryActDef, 'questIds'>[] = [
  {
    act: 1,
    title: 'Act I — The Lanternwick Ledger',
    synopsis:
      'Kael, last of the Ashen Drake clan, finally walks back into Ashfall Hollow, where his clan burned, and hears of lanterns that did not flicker. Home on the Lanternwick frontier, forty sacks of tithe-grain vanish and the Hollow Covenant demands the settlers pay twice. Following the ledger with Tobin and Vesna, Kael finds the Covenant robbing its own faithful — then carries the fight to the wind-spire city of Galecrest, where the chanter Orla joins, and to the border fortress of Marrowgate, where the quarryman Hadrik rolls through the gate.',
    beats: [
      'Prologue — Ashfall Hollow: Kael wakes the shade of his clan\'s last keeper with Drake-Sight and drives the Covenant gleaners from the burned hall.',
      'The Lanternwick Ledger: a hidden witness, a broken tithe wagon, and Deacon Vash cast out of the Greyford tithe-post.',
      'Embers of the Clan and Debts of the Cinder Ring: the Wyrm\'s Lament rises from Mirror Tarn; Vesna burns her marker.',
      'Hearthstead rises: Bram\'s carpentry and Gilda\'s smithy turn a survey stake into a home.',
      'The Chimes of Galecrest: Orla is freed and Cantor Imrey\'s chime-cages fall silent. The mills turn again.',
      'The Siege of Marrowgate: a glamoured sapper, a tunnel, and Marshal Vale broken. Hadrik joins; the roads west and south open.',
    ],
  },
  {
    act: 2,
    title: 'Act II — The Hollow Covenant',
    synopsis:
      'Beyond the Fallen Pass and the Sundered Gorge, the continent opens. In the order the party chooses, Kael\'s companions free the marsh-lights of Mirefast (Pim), open the Ledger Hall of Saffrane (Quill), save the Heartwood of Hollowroot (Moss) and empty the Lantern Hall of the Rimefold (Sable). Each new companion opens roads the others could not. Across every chunk, clues pile up: the Covenant does not worship spirits — it stills them, weighs them, and ships them to the Greyspire Works.',
    beats: [
      'Two roads from Marrowgate: the marshes (Hadrik rolls the Fallen Pass) or the great forest (Orla glides the Sundered Gorge).',
      'The Drowned Abbey: Pim jams the sluice that drinks the marsh-lights; Abbess Morrow falls.',
      'The Ledger Hall of Saffrane: Pim bounds the Mire Ford; Quill audits the auditors and Comptroller Vey.',
      'The Felling of Hollowroot: Moss and a hidden dryad stop Fellwarden Grath\'s saws.',
      'The Reliquary of Rime: Moss opens the Rimepine; Sable and the party empty a thousand lanterns.',
      'Investigations — Salt in the Ledgers, the Stilled Choir, the Ashen Road, the Greyspire Works and the Hierophant\'s Name — can be pursued in any order.',
      'Personal quests: each companion earns a relic that grows with them and a signature that changes how they fight.',
    ],
  },
  {
    act: 3,
    title: 'Act III — The Still Flame',
    synopsis:
      'Quill unseals the caldera road and Sable climbs the Frost Scarp: in the Emberdeep Caldera the Kilnworks render stilled Wardens into fuel. Kael douses them, and the Banked Flame at the caldera\'s heart names him its sovereign. Then, behind the Hierophant\'s Veil south of Hearthstead, Greyspire: a cathedral built over a fire that does not flicker, fed for a century on Wardens — and first lit with drake-blood. What Kael does there depends on how much of the truth he has gathered, and who stands with him.',
    beats: [
      'The Kilnworks: Forgemaster Skarn falls and the furnaces go cold.',
      'The Sovereign\'s Crown: Kael\'s apex form, the Sovereign of the Banked Flame, awakens.',
      'The Hierophant\'s Veil: Quill reads the cathedral\'s ward open.',
      'Greyspire: Exarch Thorne, the hidden sacristan, and the sanctum stair.',
      'The Hierophant falls. The Still Flame asks Kael to choose: quench it, feed it his blood — or, with every clue, every companion and every oath kept, sound the Wyrm\'s Lament and call the Wardens home.',
    ],
  },
];
