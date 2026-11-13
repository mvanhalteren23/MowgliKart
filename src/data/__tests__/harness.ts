/**
 * Test-only reference implementation of the quest fold + condition evaluator described in
 * `contracts.ts`, plus a scripted "player" that dispatches exactly the events the app does.
 * Used to prove the authored slice quests are completable. Not shipped.
 */
import { QUEST_STATUS_ORDER } from '@/types/contracts';
import type {
  Condition, DialogueDef, GameDatabase, ItemId, NpcDef, QuestDef, QuestLog, QuestProgress, QuestStatus, Reward,
  TownshipState, WorldEvent, WorldFlags, WorldSystems,
} from '@/types/contracts';

const rank = (s: QuestStatus): number => QUEST_STATUS_ORDER.indexOf(s);

export function evaluate(c: Condition, flags: WorldFlags, log: QuestLog): boolean {
  switch (c.kind) {
    case 'always':
      return true;
    case 'flag': {
      const v = flags[c.key];
      if (c.equals !== undefined) return v === c.equals;
      if (c.atLeast !== undefined) return typeof v === 'number' && v >= c.atLeast;
      return v !== undefined && v !== false && v !== 0 && v !== '';
    }
    case 'quest':
      return (log[c.questId]?.status ?? 'HIDDEN') === c.status;
    case 'questAtLeast':
      return rank(log[c.questId]?.status ?? 'HIDDEN') >= rank(c.status);
    case 'all':
      return c.of.every((x) => evaluate(x, flags, log));
    case 'any':
      return c.of.some((x) => evaluate(x, flags, log));
    case 'not':
      return !evaluate(c.of, flags, log);
  }
}

export function eventKey(e: WorldEvent): string {
  switch (e.type) {
    case 'talk': return `evt:talk:${e.npcId}`;
    case 'defeat': return `evt:defeat:${e.encounterId}`;
    case 'obtain': return `evt:obtain:${e.itemId}`;
    case 'enterRegion': return `evt:enter:${e.regionId}`;
    case 'fieldAction': return `evt:field:${e.action}:${e.targetId}`;
    case 'recruit': return `evt:recruit:${e.npcId}`;
    case 'build': return `evt:build:${e.buildingId}`;
    case 'acceptQuest': return `evt:accept:${e.questId}`;
    case 'liberate': return `evt:liberate:${e.regionId}`;
    case 'choice': return `evt:choice:${e.dialogueId}:${e.choiceId}`;
    case 'setFlag': return e.key;
  }
}

export function fold(flags: WorldFlags, e: WorldEvent): WorldFlags {
  const key = eventKey(e);
  if (e.type === 'setFlag') return { ...flags, [key]: e.value };
  const prev = flags[key];
  const n = typeof prev === 'number' ? prev : 0;
  return { ...flags, [key]: n + (e.type === 'obtain' ? e.qty : 1) };
}

export class Playthrough {
  flags: WorldFlags;
  log: QuestLog;
  inventory: Record<ItemId, number>;
  gear: string[];
  coin: number;
  township: TownshipState;
  readonly completed: string[] = [];
  readonly trace: string[] = [];

  readonly db: GameDatabase;
  readonly sys: WorldSystems;

  constructor(db: GameDatabase, sys: WorldSystems) {
    this.db = db;
    this.sys = sys;
    this.flags = { ...db.start.flags };
    this.log = Object.fromEntries(db.quests.map((q) => [q.id, { status: 'HIDDEN', objectives: {} } satisfies QuestProgress]));
    this.inventory = { ...db.start.inventory };
    this.gear = [...db.start.gearOwned];
    this.coin = db.start.coin;
    this.township = sys.township.initial();
    // Like core's initialLog(): nothing advances until the first event.
  }

  holds(c: Condition): boolean {
    return evaluate(c, this.flags, this.log);
  }

  status(questId: string): QuestStatus {
    return this.log[questId]?.status ?? 'HIDDEN';
  }

  dispatch(e: WorldEvent): void {
    this.trace.push(eventKey(e));
    this.flags = fold(this.flags, e);
    if (e.type === 'obtain') {
      if (this.db.gear[e.itemId]) this.gear.push(e.itemId);
      else this.inventory[e.itemId] = (this.inventory[e.itemId] ?? 0) + e.qty;
    }
    this.advance();
  }

  private advance(): void {
    const pendingRewards: Reward[] = [];
    let changed = true;
    while (changed) {
      changed = false;
      for (const q of this.db.quests) {
        const next = this.step(q);
        if (next) {
          if (next.status === 'COMPLETED' && this.log[q.id]?.status !== 'COMPLETED') {
            this.completed.push(q.id);
            pendingRewards.push(...q.rewards);
          }
          this.log = { ...this.log, [q.id]: next };
          changed = true;
        }
      }
    }
    for (const r of pendingRewards) this.grant(r);
  }

  private step(q: QuestDef): QuestProgress | null {
    const cur = this.log[q.id] ?? { status: 'HIDDEN', objectives: {} };
    if (cur.status === 'HIDDEN') return this.holds(q.discoverWhen) ? { ...cur, status: 'DISCOVERED' } : null;
    if (cur.status === 'DISCOVERED') return this.holds(q.activateWhen) ? { ...cur, status: 'ACTIVE' } : null;
    if (cur.status !== 'ACTIVE') return null;
    const objectives: Record<string, boolean> = { ...cur.objectives };
    let changed = false;
    for (const o of q.objectives) {
      if (!objectives[o.id] && this.holds(o.completeWhen)) {
        objectives[o.id] = true;
        changed = true;
      }
    }
    const done = q.objectives.every((o) => o.optional || objectives[o.id]);
    if (done) return { status: 'COMPLETED', objectives };
    return changed ? { status: 'ACTIVE', objectives } : null;
  }

  private grant(r: Reward): void {
    switch (r.type) {
      case 'gear': this.dispatch({ type: 'obtain', itemId: r.gearId, qty: 1 }); break;
      case 'item': this.dispatch({ type: 'obtain', itemId: r.itemId, qty: r.qty }); break;
      case 'coin': this.coin += r.amount; break;
      case 'flag': this.dispatch({ type: 'setFlag', key: r.key, value: r.value }); break;
      case 'xp':
      case 'spirit':
        break;
    }
  }

  npc(npcId: string): NpcDef {
    const npc = this.db.world.npcs.find((n) => n.id === npcId);
    if (!npc) throw new Error(`no npc ${npcId}`);
    return npc;
  }

  isPresent(npcId: string): boolean {
    const npc = this.npc(npcId);
    return npc.presentWhen ? this.holds(npc.presentWhen) : true;
  }

  dialogueFor(npcId: string): DialogueDef {
    const npc = this.npc(npcId);
    const entry = npc.dialogues.find((d) => this.holds(d.when));
    if (!entry) throw new Error(`${npcId} has no dialogue for the current state`);
    const dlg = this.db.dialogues[entry.dialogueId];
    if (!dlg) throw new Error(`missing dialogue ${entry.dialogueId}`);
    return dlg;
  }

  /** Talk to an NPC exactly as the app would; returns the encounter the dialogue starts, if any. */
  talk(npcId: string, choiceId?: string): string | undefined {
    if (!this.isPresent(npcId)) throw new Error(`${npcId} is not present`);
    const dlg = this.dialogueFor(npcId);
    this.trace.push(`dialogue ${dlg.id}`);
    if (choiceId !== undefined) {
      const choice = dlg.choices?.find((c) => c.id === choiceId);
      if (!choice) throw new Error(`${dlg.id} has no choice ${choiceId}`);
      if (choice.when && !this.holds(choice.when)) throw new Error(`choice ${choiceId} unavailable`);
      this.dispatch({ type: 'choice', dialogueId: dlg.id, choiceId });
      for (const e of choice.events ?? []) this.dispatch(e);
    }
    for (const e of dlg.onEnd ?? []) this.dispatch(e);
    this.dispatch({ type: 'talk', npcId });
    return dlg.startsEncounter;
  }

  /** Drake-Sight reveals a hidden NPC / fishing spot (engine fires this on first reveal). */
  reveal(targetId: string): void {
    const npc = this.db.world.npcs.find((n) => n.id === targetId);
    const spot = this.db.world.fishingSpots.find((s) => s.id === targetId);
    if (npc) {
      if (!npc.hiddenUntilDrakeSight) throw new Error(`${targetId} is not hidden`);
      if (!this.isPresent(targetId)) throw new Error(`${targetId} not present to reveal`);
    } else if (spot) {
      if (!spot.hiddenUntilDrakeSight) throw new Error(`${targetId} is not hidden`);
    } else {
      throw new Error(`nothing to reveal: ${targetId}`);
    }
    this.dispatch({ type: 'fieldAction', action: 'drakeSight', targetId });
  }

  zoneOpen(encounterId: string): boolean {
    return this.db.world.encounterZones.some((z) => z.encounterId === encounterId && (!z.presentWhen || this.holds(z.presentWhen)));
  }

  /** Win an encounter: defeat (+ liberate), plus guaranteed (chance ≥ 1) drops. */
  win(encounterId: string): void {
    const enc = this.db.encounters[encounterId];
    if (!enc) throw new Error(`no encounter ${encounterId}`);
    for (const enemyId of enc.enemies) {
      const enemy = this.db.enemies[enemyId];
      if (!enemy) throw new Error(`no enemy ${enemyId}`);
      for (const d of enemy.drops) if (d.chance >= 1) this.dispatch({ type: 'obtain', itemId: d.itemId, qty: 1 });
    }
    this.dispatch({ type: 'defeat', encounterId });
    if (enc.liberatesRegion) this.dispatch({ type: 'liberate', regionId: enc.liberatesRegion });
  }

  /** Land a fish at a spot. */
  fish(spotId: string, fishId: string): void {
    const spot = this.db.world.fishingSpots.find((s) => s.id === spotId);
    if (!spot) throw new Error(`no spot ${spotId}`);
    if (!spot.fish.includes(fishId)) throw new Error(`${fishId} does not bite at ${spotId}`);
    const fish = this.db.fish[fishId];
    if (!fish) throw new Error(`no fish ${fishId}`);
    this.dispatch({ type: 'obtain', itemId: fish.itemId, qty: 1 });
    this.dispatch({ type: 'fieldAction', action: 'fish', targetId: spotId });
  }

  /** A hunting kill with the given (species-legal) drops. */
  hunt(action: 'huntShot' | 'huntDash', speciesId: string, drops: readonly string[]): void {
    const sp = this.db.species[speciesId];
    if (!sp) throw new Error(`no species ${speciesId}`);
    for (const d of drops) {
      if (!sp.drops.some((x) => x.itemId === d)) throw new Error(`${speciesId} never drops ${d}`);
    }
    this.dispatch({ type: 'fieldAction', action, targetId: speciesId });
    for (const d of drops) this.dispatch({ type: 'obtain', itemId: d, qty: 1 });
  }

  recruit(npcId: string): void {
    const can = this.sys.township.canRecruit(npcId, this.township, this.flags, evaluate, this.log);
    if (!can.ok) throw new Error(`cannot recruit ${npcId}: ${can.reason ?? ''}`);
    const res = this.sys.township.recruit(npcId, this.township);
    if (!res.ok) throw new Error(res.reason);
    this.township = res.state;
    for (const e of res.events) this.dispatch(e);
  }

  build(plotId: string, buildingId: string): void {
    const res = this.sys.township.build(plotId, buildingId, this.township, this.coin, this.inventory);
    if (!res.ok) throw new Error(`cannot build ${buildingId}: ${res.reason}`);
    this.township = res.state;
    this.coin -= res.spend.coin;
    for (const s of res.spend.items) this.inventory[s.itemId] = (this.inventory[s.itemId] ?? 0) - s.qty;
    for (const e of res.events) this.dispatch(e);
  }
}
