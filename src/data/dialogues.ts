import type { DialogueDef } from '@/types/contracts';
import { ENC, FLAG, MAIN, QUEST } from './ids';

const set = (key: string) => ({ type: 'setFlag', key, value: true }) as const;
const accept = (questId: string) => ({ type: 'acceptQuest', questId }) as const;

export const dialogues = {
  /* ── Elder Maren — main quest giver ───────────────────────────────── */
  'dlg.maren.offer': {
    id: 'dlg.maren.offer',
    lines: [
      { speaker: 'Elder Maren', text: 'Forty sacks of tithe-grain left this square under Covenant seal. The Greyford post swears it never arrived.' },
      { speaker: 'Elder Maren', text: 'Now Brother Caul says we owe it again. Twice the grain, before first frost — or the chapel "stills" our hearth-spirits.' },
      { speaker: 'Kael', text: 'Grain doesn\'t walk off a road by itself.' },
      { speaker: 'Elder Maren', text: 'No. Will you follow the ledger for me, drake-son? Start with Wenna at the mill.' },
    ],
    choices: [
      { id: 'accept', label: 'I\'ll follow the ledger.', events: [accept(QUEST.ledger)] },
      { id: 'later', label: 'Give me a little time.' },
    ],
  },
  'dlg.maren.prologue': {
    id: 'dlg.maren.prologue',
    lines: [
      { speaker: 'Elder Maren', text: 'Kael. The north road came back with a rumour: Covenant gleaners are sifting Ashfall Hollow.' },
      { speaker: 'Elder Maren', text: 'Your clan\'s hall. I know you\'ve never gone back. I think you should — before they finish.' },
      { speaker: 'Kael', text: 'Twenty years of not looking. All right. North, then.' },
    ],
    choices: [
      { id: 'accept', label: 'I\'ll go to Ashfall.', events: [accept(MAIN.prologue)] },
      { id: 'later', label: 'Not yet.' },
    ],
  },
  'dlg.maren.prologueHint': {
    id: 'dlg.maren.prologueHint',
    lines: [
      { speaker: 'Elder Maren', text: 'The north road, past the chapel lane. Ashfall is a morning\'s walk.' },
      { speaker: 'Elder Maren', text: 'Take Tobin and Vesna. Ghosts are easier in company.' },
    ],
  },
  'dlg.maren.active': {
    id: 'dlg.maren.active',
    lines: [
      { speaker: 'Elder Maren', text: 'Wenna at the mill, Caul at the chapel, and the grain road south. The truth is somewhere between them.' },
      { speaker: 'Elder Maren', text: 'And Kael — if your drake-eyes see something on that road, trust them.' },
    ],
  },
  'dlg.maren.done': {
    id: 'dlg.maren.done',
    lines: [
      { speaker: 'Elder Maren', text: 'The grain carts are rolling home. You did that.' },
      { speaker: 'Elder Maren', text: 'But the Covenant has longer ledgers than ours, and they keep them in Greyspire. This was the first page, not the last.' },
    ],
  },

  /* ── Wenna the miller ─────────────────────────────────────────────── */
  'dlg.wenna.ledger': {
    id: 'dlg.wenna.ledger',
    lines: [
      { speaker: 'Wenna', text: 'I milled every sack myself. Forty, sealed with the Still Flame, counted by Brother Caul.' },
      { speaker: 'Wenna', text: 'Pell drove the wagon south. He hasn\'t come home. His mule did.' },
      { speaker: 'Wenna', text: 'Ask Caul to show you his ledger. Watch his hands when he does.' },
    ],
    onEnd: [set(FLAG.millerHeard)],
  },
  'dlg.wenna.after': {
    id: 'dlg.wenna.after',
    lines: [
      { speaker: 'Wenna', text: 'If you find Pell, tell him the mule is fine and I\'m furious. In that order.' },
      { speaker: 'Wenna', text: 'And if you find the grain, tell it to come home.' },
    ],
  },
  'dlg.wenna.idle': {
    id: 'dlg.wenna.idle',
    lines: [
      { speaker: 'Wenna', text: 'Wheel\'s turning, stones are grinding, and none of it is ours to eat.' },
      { speaker: 'Wenna', text: 'Talk to Maren. She\'s been staring at the south road for days.' },
    ],
  },

  /* ── Brother Caul — Covenant tithe-collector ──────────────────────── */
  'dlg.caul.ledger': {
    id: 'dlg.caul.ledger',
    lines: [
      { speaker: 'Brother Caul', text: 'The ledger? Certainly. Forty sacks, sealed, signed by the carter. The Flame keeps perfect accounts.' },
      { speaker: 'Kael', text: 'The carter\'s signature is in your ink.' },
      { speaker: 'Brother Caul', text: '…Carters cannot write, child. I sign on their behalf. Mind the road south — it is unsafe for the curious.' },
    ],
    onEnd: [set(FLAG.caulQuestioned)],
  },
  'dlg.caul.humbled': {
    id: 'dlg.caul.humbled',
    lines: [
      { speaker: 'Brother Caul', text: 'Deacon Vash was… overzealous. The Covenant will review the matter.' },
      { speaker: 'Brother Caul', text: 'Greyspire will review you, too.' },
    ],
  },
  'dlg.caul.sermon': {
    id: 'dlg.caul.sermon',
    lines: [
      { speaker: 'Brother Caul', text: 'A flame that flickers is a flame that fears. The Still Flame fears nothing.' },
      { speaker: 'Brother Caul', text: 'Tithe gladly, settler. Quiet spirits make for quiet harvests.' },
    ],
  },

  /* ── Pell — hidden witness (Drake-Sight) ──────────────────────────── */
  'dlg.pell.confess': {
    id: 'dlg.pell.confess',
    lines: [
      { speaker: 'Pell', text: 'You can SEE me? The acolyte\'s charm was meant to — never mind. Please don\'t call them.' },
      { speaker: 'Pell', text: 'The grain never left Covenant hands. Captain Ferris re-sealed the sacks at the ford and drove them to Greyford for the Deacon.' },
      { speaker: 'Pell', text: 'He keeps the true count on a page in his coat. His wagon\'s still on the grain road, loading the next batch.' },
    ],
    onEnd: [set(FLAG.witnessHeard)],
  },
  'dlg.pell.after': {
    id: 'dlg.pell.after',
    lines: [
      { speaker: 'Pell', text: 'I\'ll stay hidden till the wagon\'s gone.' },
      { speaker: 'Pell', text: 'Tell Wenna… tell her the mule knew the way home.' },
    ],
  },

  /* ── Bram the carpenter (recruit) ─────────────────────────────────── */
  'dlg.bram.township': {
    id: 'dlg.bram.township',
    lines: [
      { speaker: 'Bram', text: 'Good soil, honest timber, and nobody counting my nails. I could get used to Hearthstead.' },
      { speaker: 'Bram', text: 'Bring me hides and coin and I\'ll put a roof over anything you like.' },
    ],
  },
  'dlg.bram.ready': {
    id: 'dlg.bram.ready',
    lines: [
      { speaker: 'Bram', text: 'Lark sent you? A whole new village, from nothing.' },
      { speaker: 'Bram', text: 'Aye, I\'m in. Write my name in your Hearthstead ledger and I\'ll pack the saws.' },
    ],
  },
  'dlg.bram.idle': {
    id: 'dlg.bram.idle',
    lines: [
      { speaker: 'Bram', text: 'Lanternwick\'s full up. Every board I cut, the chapel taxes twice.' },
      { speaker: 'Bram', text: 'Somebody ought to build somewhere new. Somebody braver than me.' },
    ],
  },

  /* ── Gilda the blacksmith (recruit) ───────────────────────────────── */
  'dlg.gilda.township': {
    id: 'dlg.gilda.township',
    lines: [
      { speaker: 'Gilda', text: 'Covenant iron melts like any other.' },
      { speaker: 'Gilda', text: 'Bring me some and a boar tusk for the quench, and I\'ll make it useful.' },
    ],
  },
  'dlg.gilda.ready': {
    id: 'dlg.gilda.ready',
    lines: [
      { speaker: 'Gilda', text: 'You put down Ferris and his wagon? Then the road\'s ours again.' },
      { speaker: 'Gilda', text: 'Fine. Put me in that ledger of yours. I want the plot with the good wind for the forge.' },
    ],
  },
  'dlg.gilda.wary': {
    id: 'dlg.gilda.wary',
    lines: [
      { speaker: 'Gilda', text: 'Move inland? With Covenant tithe-wagons owning the grain road?' },
      { speaker: 'Gilda', text: 'Break that wagon and we\'ll talk.' },
    ],
  },
  'dlg.gilda.idle': {
    id: 'dlg.gilda.idle',
    lines: [
      { speaker: 'Gilda', text: 'Hooks, hinges, harpoons. If it bends wrong, it\'s not mine.' },
      { speaker: 'Gilda', text: 'If it bends the Covenant\'s way, it\'s definitely not mine.' },
    ],
  },

  /* ── Surveyor Lark — township giver ───────────────────────────────── */
  'dlg.lark.offer': {
    id: 'dlg.lark.offer',
    lines: [
      { speaker: 'Lark', text: 'Three plots, one well-spot, and the best drainage on the frontier. Hearthstead, I\'m calling it.' },
      { speaker: 'Lark', text: 'What it needs is people. A carpenter first — Bram in Lanternwick. Then a smith: Gilda, in Saltmarket.' },
    ],
    choices: [
      { id: 'accept', label: 'Let\'s raise Hearthstead.', events: [accept(QUEST.timber), accept(QUEST.anvil)] },
      { id: 'later', label: 'Maybe later.' },
    ],
  },
  'dlg.lark.progress': {
    id: 'dlg.lark.progress',
    lines: [
      { speaker: 'Lark', text: 'Recruit folk through the Hearthstead ledger, then pick a plot and build.' },
      { speaker: 'Lark', text: 'Hides and tusks from the meadow, iron off Covenant thugs. You\'ll manage.' },
    ],
  },
  'dlg.lark.built': {
    id: 'dlg.lark.built',
    lines: [
      { speaker: 'Lark', text: 'A carpentry and a smithy. Two years ago this was thistles.' },
      { speaker: 'Lark', text: 'One plot left. I\'m saving it for whoever surprises us.' },
    ],
  },

  /* ── Isolde — Embers of the Clan ──────────────────────────────────── */
  'dlg.isolde.offer': {
    id: 'dlg.isolde.offer',
    lines: [
      { speaker: 'Isolde', text: 'You have her eyes. Your mother\'s. I kept the clan-hearth when you were too small to lift a cup.' },
      { speaker: 'Isolde', text: 'Before the burning, the elders sank something in this tarn and veiled it from Covenant eyes. Only drake-sight can find it.' },
      { speaker: 'Ashka', text: '…I remember the cold of that water. Kael. Let us look.' },
    ],
    choices: [
      { id: 'accept', label: 'Show me where.', events: [accept(QUEST.embers)] },
      { id: 'later', label: 'I\'m not ready.' },
    ],
  },
  'dlg.isolde.hint': {
    id: 'dlg.isolde.hint',
    lines: [
      { speaker: 'Isolde', text: 'The west shore, under the old stone. Open your drake-eyes there, then cast a line.' },
      { speaker: 'Isolde', text: 'What the clan left will rise to its own blood.' },
    ],
  },
  'dlg.isolde.return': {
    id: 'dlg.isolde.return',
    lines: [
      { speaker: 'Isolde', text: 'An ember-scale, still warm… and the horn. The Wyrm\'s Lament. Oh, child.' },
      { speaker: 'Ashka', text: 'Your mother sounded it once, to call me home. I came. I could not save the hall.' },
      { speaker: 'Ashka', text: 'Carry it, Kael. Every hearth you free will make it louder — and me stronger.' },
      { speaker: 'Kael', text: 'Then we free all of them.' },
    ],
    onEnd: [set(FLAG.embersReturned)],
  },
  'dlg.isolde.after': {
    id: 'dlg.isolde.after',
    lines: [
      { speaker: 'Isolde', text: 'The Lament hums when you are near. It never did that for anyone else.' },
      { speaker: 'Isolde', text: 'There were lanterns on the highland road the night the hall burned. Covenant lanterns. Remember that.' },
    ],
  },

  /* ── Ringmaster Drava — Debts of the Cinder Ring ──────────────────── */
  'dlg.drava.offer': {
    id: 'dlg.drava.offer',
    lines: [
      { speaker: 'Drava', text: 'Vesna! My favourite investment. Your marker still says you owe me one bout.' },
      { speaker: 'Vesna', text: 'And you want blood-price on top, I suppose.' },
      { speaker: 'Drava', text: 'A bristleboar, run down by hand. Arrows are for cowards and wardens. Then one last bout, and I burn the marker.' },
    ],
    choices: [
      { id: 'accept', label: 'Deal. Let\'s end this.', events: [accept(QUEST.debts)] },
      { id: 'later', label: 'Not today, Drava.' },
    ],
  },
  'dlg.drava.hint': {
    id: 'dlg.drava.hint',
    lines: [
      { speaker: 'Drava', text: 'Bramblemeadow, south-west. Boars bed down in the bracken.' },
      { speaker: 'Drava', text: 'Come at them downwind, or they\'ll smell you a field away.' },
    ],
  },
  'dlg.drava.tribute': {
    id: 'dlg.drava.tribute',
    lines: [
      { speaker: 'Drava', text: 'Fresh bristleboar, taken by the glaive. The kitchens will sing.' },
      { speaker: 'Drava', text: 'Now — the sand. Halvard the Unbowed has been waiting all season.' },
      { speaker: 'Vesna', text: 'Let him wait a little longer. On his back.' },
    ],
    onEnd: [set(FLAG.debtsPaid)],
    startsEncounter: ENC.cinderRing,
  },
  'dlg.drava.rematch': {
    id: 'dlg.drava.rematch',
    lines: [
      { speaker: 'Drava', text: 'Back for more? The crowd loves a comeback.' },
      { speaker: 'Vesna', text: 'Then let\'s give them one.' },
    ],
    startsEncounter: ENC.cinderRing,
  },
  'dlg.drava.burn': {
    id: 'dlg.drava.burn',
    lines: [
      { speaker: 'Drava', text: 'Halvard\'s never been unbowed less. Here — your marker.' },
      { speaker: 'Drava', text: 'And this. A champion\'s talon. The Ring remembers who paid in full.' },
      { speaker: 'Vesna', text: 'Burn it slowly. I want to watch.' },
    ],
    onEnd: [set(FLAG.debtsCleared)],
  },
  'dlg.drava.after': {
    id: 'dlg.drava.after',
    lines: [
      { speaker: 'Drava', text: 'Free woman, Vesna. Strange look on you.' },
      { speaker: 'Drava', text: 'Come fight for coin sometime — your own, this time.' },
    ],
  },

  /* ── Saltmarket & tarn folk ───────────────────────────────────────── */
  'dlg.nell.shrine': {
    id: 'dlg.nell.shrine',
    lines: [
      { speaker: 'Nell', text: 'West shore? My line always snags out there, like something\'s holding it.' },
      { speaker: 'Nell', text: 'Try an ember fly. Odd fish like odd lures.' },
    ],
  },
  'dlg.nell.tips': {
    id: 'dlg.nell.tips',
    lines: [
      { speaker: 'Nell', text: 'Tap when it bites, hold to reel. When the line sings high, ease off.' },
      { speaker: 'Nell', text: 'Perch love crickets. Pike chase a silver spoon.' },
    ],
  },
  'dlg.odo.barge': {
    id: 'dlg.odo.barge',
    lines: [
      { speaker: 'Harbormaster Odo', text: 'Brinefolk barge just tied up off the pier — that lantern eel of yours called it in.' },
      { speaker: 'Harbormaster Odo', text: 'Go say hello before the tide turns.' },
    ],
  },
  'dlg.odo.books': {
    id: 'dlg.odo.books',
    lines: [
      { speaker: 'Harbormaster Odo', text: 'Since Greyford fell I\'ve been reading my own tithe-books. Properly, for once.' },
      { speaker: 'Harbormaster Odo', text: 'Two inks. Black for us, grey for Greyspire. The grey column is always bigger.' },
    ],
    onEnd: [set('clue:harbourBooks')],
  },
  'dlg.odo.harbour': {
    id: 'dlg.odo.harbour',
    lines: [
      { speaker: 'Harbormaster Odo', text: 'Saltmarket pays its tithe in herring and patience. Lately the Covenant wants more of both.' },
      { speaker: 'Harbormaster Odo', text: 'Land a lantern eel off my pier and the Brinefolk barge follows it in. Best trading on the coast.' },
    ],
  },
  'dlg.barge.manifest': {
    id: 'dlg.barge.manifest',
    lines: [
      { speaker: 'Brinefolk Trader', text: 'The eel-light brought you. Then you may see what the barge does not show the Covenant.' },
      { speaker: 'Brinefolk Trader', text: 'Our manifest: sealed crates, Saltmarket to "the Works". We are paid double not to open them. One hummed all the way.' },
    ],
    onEnd: [set('clue:bargeManifest')],
  },
  'dlg.barge.hello': {
    id: 'dlg.barge.hello',
    lines: [
      { speaker: 'Brinefolk Trader', text: 'You carry the eel-light. Then you are a friend of the barge.' },
      { speaker: 'Brinefolk Trader', text: 'We sail where the Covenant does not tithe. Ask after Orla, if you ever reach the Drift.' },
    ],
  },
  'dlg.thessaly.act2': {
    id: 'dlg.thessaly.act2',
    lines: [
      { speaker: 'Thessaly', text: 'Greyford\'s free, they say. Good. Now follow the money: harbour tithes, tarn wisps, the old highland road.' },
      { speaker: 'Thessaly', text: 'Pull any thread you like, in any order. Every one of them ends at Greyspire.' },
    ],
  },
  'dlg.thessaly.idle': {
    id: 'dlg.thessaly.idle',
    lines: [
      { speaker: 'Thessaly', text: 'Wayfarer. I collect rumours the way the Covenant collects grain.' },
      { speaker: 'Thessaly', text: 'Here\'s a free one: the wisps at Mirror Tarn used to be warm.' },
    ],
  },
} satisfies Record<string, DialogueDef>;
