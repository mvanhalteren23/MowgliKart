import { describe, expect, it } from 'vitest';
import { gameData } from '@/data';
import { ENC, FLAG, INV, MAIN, NPC, QUEST, REGION, SPECIES, SPOT } from '@/data/ids';
import { createWorldSystems } from '@/systems';
import { Playthrough } from './harness';

const fresh = () => new Playthrough(gameData, createWorldSystems(gameData));

/** The Ashfall prologue, played by hand: it opens the Ledger. */
function playPrologue(p: Playthrough): void {
  p.dispatch({ type: 'enterRegion', regionId: REGION.lanternwick });
  expect(p.status(MAIN.prologue)).toBe('DISCOVERED');
  expect(p.dialogueFor(NPC.maren).id).toBe('dlg.maren.prologue');
  p.talk(NPC.maren, 'accept');
  expect(p.status(MAIN.prologue)).toBe('ACTIVE');
  p.dispatch({ type: 'enterRegion', regionId: 'ashfallHollow' });
  expect(p.zoneOpen('enc.gleanerPrior')).toBe(false);
  p.reveal('npc.shadeAldra');
  p.talk('npc.shadeAldra');
  expect(p.flags[FLAG.shadeHeard]).toBe(true);
  p.win('enc.gleanerPrior');
  expect(p.status(MAIN.prologue)).toBe('COMPLETED');
  expect(p.flags[FLAG.prologueDone]).toBe(true);
}

describe('slice playthrough (events exactly as the app dispatches them)', () => {
  it('The Lanternwick Ledger is completable and liberates the tithe-post', () => {
    const p = fresh();
    expect(p.status(QUEST.ledger)).toBe('HIDDEN');
    p.dispatch({ type: 'enterRegion', regionId: REGION.lanternwick });
    expect(p.status(QUEST.ledger)).toBe('HIDDEN'); // chapter 2 waits for the prologue
    playPrologue(p);
    expect(p.status(QUEST.ledger)).toBe('DISCOVERED');
    expect(p.dialogueFor(NPC.maren).id).toBe('dlg.maren.offer');

    // Talking to the miller before accepting does not advance anything.
    p.talk(NPC.wenna);
    expect(p.flags[FLAG.millerHeard]).toBeUndefined();

    p.talk(NPC.maren, 'accept');
    expect(p.status(QUEST.ledger)).toBe('ACTIVE');

    expect(p.dialogueFor(NPC.caul).id).toBe('dlg.caul.sermon'); // needs the miller first
    p.talk(NPC.wenna);
    expect(p.log[QUEST.ledger]?.objectives.askMiller).toBe(true);

    expect(p.isPresent(NPC.pell)).toBe(false);
    p.talk(NPC.caul);
    expect(p.log[QUEST.ledger]?.objectives.questionCaul).toBe(true);

    expect(p.isPresent(NPC.pell)).toBe(true);
    expect(p.zoneOpen(ENC.wagon)).toBe(false);
    p.reveal(NPC.pell);
    p.talk(NPC.pell);
    expect(p.log[QUEST.ledger]?.objectives.hearWitness).toBe(true);

    expect(p.zoneOpen(ENC.wagon)).toBe(true);
    expect(p.zoneOpen(ENC.tithePost)).toBe(false);
    p.win(ENC.wagon);
    expect(p.inventory['item.trueLedgerPage']).toBe(1);
    expect(p.zoneOpen(ENC.tithePost)).toBe(true);

    p.win(ENC.tithePost);
    expect(p.flags[`evt:liberate:${REGION.tithePost}`]).toBe(1);
    expect(p.status(QUEST.ledger)).toBe('COMPLETED');
    expect(p.flags[FLAG.act1Complete]).toBe(true);
    expect(p.dialogueFor(NPC.maren).id).toBe('dlg.maren.done');
    expect(p.dialogueFor(NPC.caul).id).toBe('dlg.caul.humbled');
    expect(p.isPresent(NPC.pell)).toBe(false);
  });

  it('Embers of the Clan uses Drake-Sight + fishing and rewards the Wyrm\'s Lament', () => {
    const p = fresh();
    expect(p.status(QUEST.embers)).toBe('HIDDEN');
    p.talk(NPC.isolde, 'accept');
    expect(p.status(QUEST.embers)).toBe('ACTIVE');
    expect(p.dialogueFor(NPC.isolde).id).toBe('dlg.isolde.hint');

    p.reveal(SPOT.drownedShrine);
    p.fish(SPOT.drownedShrine, 'fish.ashfinKoi');
    expect(p.dialogueFor(NPC.isolde).id).toBe('dlg.isolde.return');
    p.talk(NPC.isolde);

    expect(p.status(QUEST.embers)).toBe('COMPLETED');
    expect(p.gear).toContain('relic.wyrmsLament');
    expect(p.flags[FLAG.ashkaRemembers]).toBe(true);
    expect(p.dialogueFor(NPC.isolde).id).toBe('dlg.isolde.after');
  });

  it('Debts of the Cinder Ring uses the glaive dash + an arena bout and rewards the Cinder Ring Talon', () => {
    const p = fresh();
    p.talk(NPC.drava, 'accept');
    expect(p.status(QUEST.debts)).toBe('ACTIVE');

    // An arrow-shot boar does not count; it must be the dash.
    p.hunt('huntShot', SPECIES.boar, ['item.boarHide']);
    expect(p.dialogueFor(NPC.drava).id).toBe('dlg.drava.hint');

    p.hunt('huntDash', SPECIES.boar, ['item.boarTusk']);
    const enc = p.talk(NPC.drava);
    expect(enc).toBe(ENC.cinderRing);
    expect(p.flags[FLAG.debtsPaid]).toBe(true);

    // A lost bout can be retried.
    expect(p.dialogueFor(NPC.drava).startsEncounter).toBe(ENC.cinderRing);
    p.win(ENC.cinderRing);
    p.talk(NPC.drava);

    expect(p.status(QUEST.debts)).toBe('COMPLETED');
    expect(p.gear).toContain('sig.cinderRingTalon');
    expect(p.dialogueFor(NPC.drava).id).toBe('dlg.drava.after');
  });

  it('Hearthstead township: recruit carpenter + blacksmith and build both workshops from slice drops', () => {
    const p = fresh();
    const thornwolf = gameData.enemies.thornwolf;
    expect(thornwolf?.drops.some((d) => d.itemId === 'item.wolfPelt')).toBe(true);

    p.talk(NPC.lark, 'accept');
    expect(p.status(QUEST.timber)).toBe('ACTIVE');
    expect(p.status(QUEST.anvil)).toBe('ACTIVE');

    // Gilda will not move while the tithe wagon owns the road.
    expect(() => p.recruit(NPC.gilda)).toThrow(/tithe wagon/);

    p.recruit(NPC.bram);
    expect(p.township.recruited).toContain(NPC.bram);
    expect(() => p.build('plot.hearthNorth', 'building.carpentry')).toThrow(/Soft Hide/);
    p.hunt('huntShot', SPECIES.deer, ['item.softHide']);
    p.hunt('huntShot', SPECIES.deer, ['item.softHide']);
    p.win(ENC.thornwolves);
    p.dispatch({ type: 'obtain', itemId: 'item.wolfPelt', qty: 1 }); // 60 % pelt drop
    p.build('plot.hearthNorth', 'building.carpentry');
    expect(p.status(QUEST.timber)).toBe('COMPLETED');
    expect(p.flags[FLAG.carpentry]).toBe(true);

    // Clear the wagon (main quest step) — guaranteed Covenant iron from the captain.
    playPrologue(p);
    p.talk(NPC.maren, 'accept');
    p.talk(NPC.wenna);
    p.talk(NPC.caul);
    p.reveal(NPC.pell);
    p.talk(NPC.pell);
    p.win(ENC.wagon);
    p.win(ENC.tithePost);
    expect(p.inventory['item.covenantIron']).toBeGreaterThanOrEqual(2);
    expect(p.dialogueFor(NPC.gilda).id).toBe('dlg.gilda.ready');

    p.recruit(NPC.gilda);
    p.hunt('huntDash', SPECIES.boar, ['item.boarTusk']);
    p.build('plot.hearthEast', 'building.smithy');
    expect(p.status(QUEST.anvil)).toBe('COMPLETED');
    expect(p.flags[FLAG.smithy]).toBe(true);
    expect(p.gear).toContain('armor.tithebreakerMail');
    expect(p.dialogueFor(NPC.lark).id).toBe('dlg.lark.built');
    expect(p.dialogueFor(NPC.bram).id).toBe('dlg.bram.township');
  });

  it('after the Ledger the investigations open and the next chapter is discovered; Act III stays hidden', () => {
    const p = fresh();
    playPrologue(p);
    p.talk(NPC.maren, 'accept');
    p.talk(NPC.wenna);
    p.talk(NPC.caul);
    p.reveal(NPC.pell);
    p.talk(NPC.pell);
    p.win(ENC.wagon);
    p.win(ENC.tithePost);
    p.talk(NPC.thessaly);
    p.talk(NPC.isolde, 'accept');
    for (const q of gameData.quests) if (q.act === 3) expect(p.status(q.id)).toBe('HIDDEN');
    expect(p.status(INV.saltLedgers)).toBe('DISCOVERED');
    expect(p.status(INV.ashenRoad)).toBe('DISCOVERED');
    expect(p.status(MAIN.galecrest)).toBe('DISCOVERED');
    expect(p.dialogueFor(NPC.thessaly).id).toBe('dlg.thessaly.act2');
    // A clue found anywhere activates its investigation.
    expect(p.dialogueFor(NPC.odo).id).toBe('dlg.odo.books');
    p.talk(NPC.odo);
    expect(p.status(INV.saltLedgers)).toBe('ACTIVE');
    expect(p.log[INV.saltLedgers]?.objectives.harbourBooks).toBe(true);
  });

  it('landing a lantern eel at the pier surfaces the Brinefolk barge merchant', () => {
    const p = fresh();
    expect(p.isPresent(NPC.barge)).toBe(false);
    p.fish(SPOT.pier, 'fish.lanternEel');
    expect(p.isPresent(NPC.barge)).toBe(true);
    expect(p.dialogueFor(NPC.odo).id).toBe('dlg.odo.barge');
    p.talk(NPC.barge);
    expect(p.flags['clue:bargeManifest']).toBe(true);
    expect(p.dialogueFor(NPC.barge).id).toBe('dlg.barge.hello');
  });
});
