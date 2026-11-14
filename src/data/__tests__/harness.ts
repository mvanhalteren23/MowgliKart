/**
 * Test-only reference implementation of the quest fold + condition evaluator described in
 * `contracts.ts`, plus a scripted "player" that dispatches exactly the events the app does —
 * and a *legal* solver that only reaches a goal through moves a real player could make:
 * talking to present NPCs (whose current dialogue sets the flag), fighting open encounter
 * zones, fishing/hunting in reachable chunks, and crossing gates with a hero who is actually
 * in the party. Used to prove the campaign is completable and correctly gated. Not shipped.
 */
import { CHUNK_SIZE, QUEST_STATUS_ORDER, TRAVERSAL_FOR_GATE } from '@/types/contracts';
import type {
  Condition, DialogueDef, FieldActionId, FlagValue, GameDatabase, HeroId, ItemId, NpcDef, QuestDef, QuestLog, QuestProgress, QuestStatus, Reward,
  TownshipState, Vec2, WorldEvent, WorldFlags, WorldSystems,
} from '@/types/contracts';

const rank = (s: QuestStatus): number => QUEST_STATUS_ORDER.indexOf(s);

function asNumber(v: FlagValue | undefined): number {
  if (typeof v === 'number') return v;
  return v === true ? 1 : 0;
}

/** Mirrors core's evaluator (missing flag `equals: false` holds; `atLeast` treats true as 1). */
export function evaluate(c: Condition, flags: WorldFlags, log: QuestLog): boolean {
  switch (c.kind) {
    case 'always':
      return true;
    case 'flag': {
      const v = flags[c.key];
      if (c.equals !== undefined) {
        if (v === undefined) return c.equals === false;
        if (v !== c.equals) return false;
      }
      if (c.atLeast !== undefined) return asNumber(v) >= c.atLeast;
      if (c.equals !== undefined) return true;
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
    case 'count':
      return c.of.filter((x) => evaluate(x, flags, log)).length >= c.atLeast;
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
  return { ...flags, [key]: asNumber(flags[key]) + (e.type === 'obtain' ? e.qty : 1) };
}

export const chunkKey = (p: Vec2): string => `${Math.floor(p.x / CHUNK_SIZE)},${Math.floor(p.z / CHUNK_SIZE)}`;

/** Entry gates (sides in different chunks) and ungated chunk links (paths crossing an edge without one). */
export function chunkLinks(db: GameDatabase): { gated: Map<string, string[]>; free: Set<string> } {
  const pair = (a: string, b: string) => [a, b].sort().join('|');
  const gated = new Map<string, string[]>();
  for (const g of db.world.traversalGates) {
    const [a, b] = g.sides.map(chunkKey);
    if (a && b && a !== b) gated.set(pair(a, b), [...(gated.get(pair(a, b)) ?? []), g.id]);
  }
  const free = new Set<string>();
  for (const path of db.world.paths) {
    for (let i = 0; i + 1 < path.points.length; i++) {
      const p = path.points[i];
      const q = path.points[i + 1];
      if (!p || !q) continue;
      const a = chunkKey(p);
      const b = chunkKey(q);
      if (a !== b && !gated.has(pair(a, b))) free.add(pair(a, b));
    }
  }
  return { gated, free };
}

export class Playthrough {
  flags: WorldFlags;
  log: QuestLog;
  inventory: Record<ItemId, number>;
  gear: string[];
  coin: number;
  party: HeroId[];
  township: TownshipState;
  readonly completed: string[] = [];
  readonly trace: string[] = [];
  readonly cleared = new Set<string>();

  readonly db: GameDatabase;
  readonly sys: WorldSystems;
  private readonly links: ReturnType<typeof chunkLinks>;

  constructor(db: GameDatabase, sys: WorldSystems) {
    this.db = db;
    this.sys = sys;
    this.links = chunkLinks(db);
    this.flags = { ...db.start.flags };
    this.log = Object.fromEntries(db.quests.map((q) => [q.id, { status: 'HIDDEN', objectives: {} } satisfies QuestProgress]));
    this.inventory = { ...db.start.inventory };
    this.gear = [...db.start.gearOwned];
    this.coin = db.start.coin;
    this.party = [...db.start.party];
    this.township = sys.township.initial();
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
      if (this.db.gear[e.itemId]) {
        if (!this.gear.includes(e.itemId)) this.gear.push(e.itemId);
      } else this.inventory[e.itemId] = (this.inventory[e.itemId] ?? 0) + e.qty;
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
        if (!next) continue;
        if (next.status === 'COMPLETED' && this.log[q.id]?.status !== 'COMPLETED') {
          this.completed.push(q.id);
          for (const r of q.rewards) {
            if (r.type === 'flag') this.flags = { ...this.flags, [r.key]: r.value };
            else pendingRewards.push(r);
          }
        }
        this.log = { ...this.log, [q.id]: next };
        this.flags = { ...this.flags, [`quest:${q.id}`]: next.status };
        changed = true;
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
      if (!objectives[o.id] && (!o.revealWhen || this.holds(o.revealWhen)) && this.holds(o.completeWhen)) {
        objectives[o.id] = true;
        changed = true;
      }
    }
    if (q.objectives.every((o) => o.optional || objectives[o.id])) return { status: 'COMPLETED', objectives };
    return changed ? { status: 'ACTIVE', objectives } : null;
  }

  private grant(r: Reward): void {
    switch (r.type) {
      case 'gear': this.dispatch({ type: 'obtain', itemId: r.gearId, qty: 1 }); break;
      case 'item': this.dispatch({ type: 'obtain', itemId: r.itemId, qty: r.qty }); break;
      case 'coin': this.coin += r.amount; break;
      case 'hero': if (!this.party.includes(r.heroId)) this.party.push(r.heroId); break;
      case 'flag':
      case 'xp':
      case 'spirit':
        break;
    }
  }

  /* ── world access ─────────────────────────────────────────────────── */

  /** Chunks the party can walk into right now (free path links + crossed entry gates). */
  reachableChunks(): Set<string> {
    const seen = new Set<string>(['0,0']);
    const queue = ['0,0'];
    const open = (a: string, b: string): boolean => {
      const k = [a, b].sort().join('|');
      if (this.links.free.has(k)) return true;
      return (this.links.gated.get(k) ?? []).some((gid) => {
        const g = this.db.world.traversalGates.find((x) => x.id === gid);
        return !!g && this.holds({ kind: 'flag', key: `evt:field:${TRAVERSAL_FOR_GATE[g.kind]}:${g.id}`, atLeast: 1 });
      });
    };
    while (queue.length) {
      const cur = queue.shift() ?? '';
      const [x = 0, z = 0] = cur.split(',').map(Number);
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nk = `${x + dx},${z + dz}`;
        if (!seen.has(nk) && this.db.world.chunks.some((c) => `${c.cx},${c.cz}` === nk) && open(cur, nk)) {
          seen.add(nk);
          queue.push(nk);
        }
      }
    }
    return seen;
  }

  canReach(p: Vec2): boolean {
    return this.reachableChunks().has(chunkKey(p));
  }

  private require(ok: boolean, msg: string): void {
    if (!ok) throw new Error(msg);
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
    const npc = this.npc(npcId);
    if (this.autoTravel) this.ensureReachable(npc.position);
    this.require(this.isPresent(npcId), `${npcId} is not present`);
    this.require(this.canReach(npc.position), `${npcId} is in an unreachable chunk`);
    if (npc.hiddenUntilDrakeSight) this.require(this.holds({ kind: 'flag', key: `evt:field:drakeSight:${npcId}`, atLeast: 1 }), `${npcId} is still hidden`);
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
    this.require(this.party.includes('kael'), 'Drake-Sight needs Kael');
    const npc = this.db.world.npcs.find((n) => n.id === targetId);
    const spot = this.db.world.fishingSpots.find((s) => s.id === targetId);
    const where = npc?.position ?? spot?.position;
    if (this.autoTravel && where) this.ensureReachable(where);
    if (npc) {
      this.require(!!npc.hiddenUntilDrakeSight, `${targetId} is not hidden`);
      this.require(this.isPresent(targetId), `${targetId} not present to reveal`);
      this.require(this.canReach(npc.position), `${targetId} unreachable`);
    } else if (spot) {
      this.require(!!spot.hiddenUntilDrakeSight, `${targetId} is not hidden`);
      this.require(this.canReach(spot.position), `${targetId} unreachable`);
    } else {
      throw new Error(`nothing to reveal: ${targetId}`);
    }
    this.dispatch({ type: 'fieldAction', action: 'drakeSight', targetId });
  }

  zoneOpen(encounterId: string): boolean {
    return this.db.world.encounterZones.some((z) => z.encounterId === encounterId && !this.cleared.has(z.id)
      && (!z.presentWhen || this.holds(z.presentWhen)) && this.canReach(z.position));
  }

  /** Win an encounter: defeat (+ liberate), guaranteed (chance ≥ 1) drops plus any legal `loot`. */
  win(encounterId: string, loot: readonly string[] = []): void {
    const enc = this.db.encounters[encounterId];
    if (!enc) throw new Error(`no encounter ${encounterId}`);
    const enemies = enc.enemies.map((id) => {
      const e = this.db.enemies[id];
      if (!e) throw new Error(`no enemy ${id}`);
      return e;
    });
    for (const e of enemies) for (const d of e.drops) if (d.chance >= 1) this.dispatch({ type: 'obtain', itemId: d.itemId, qty: 1 });
    for (const item of loot) {
      this.require(enemies.some((e) => e.drops.some((d) => d.itemId === item)), `${encounterId} never drops ${item}`);
      this.dispatch({ type: 'obtain', itemId: item, qty: 1 });
    }
    const zone = this.db.world.encounterZones.find((z) => z.encounterId === encounterId && z.once && !this.cleared.has(z.id));
    if (zone) this.cleared.add(zone.id);
    this.dispatch({ type: 'defeat', encounterId });
    if (enc.liberatesRegion) this.dispatch({ type: 'liberate', regionId: enc.liberatesRegion });
  }

  /** Land a fish at a spot. */
  fish(spotId: string, fishId: string): void {
    this.require(this.party.includes('kael'), 'fishing needs Kael');
    const spot = this.db.world.fishingSpots.find((s) => s.id === spotId);
    if (!spot) throw new Error(`no spot ${spotId}`);
    if (this.autoTravel) this.ensureReachable(spot.position);
    this.require(this.canReach(spot.position), `${spotId} unreachable`);
    if (spot.hiddenUntilDrakeSight) this.require(this.holds({ kind: 'flag', key: `evt:field:drakeSight:${spotId}`, atLeast: 1 }), `${spotId} still hidden`);
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
    if (this.autoTravel) {
      this.ensureHero(action);
      const home = sp.habitat[0];
      if (home && !sp.habitat.some((h) => this.canReach(h.center))) this.ensureReachable(home.center);
    }
    this.require(this.party.some((h) => this.db.heroes[h].fieldActions.includes(action)), `nobody in the party can ${action}`);
    this.require(sp.habitat.some((h) => this.canReach(h.center)), `${speciesId} lives nowhere reachable`);
    for (const d of drops) this.require(sp.drops.some((x) => x.itemId === d), `${speciesId} never drops ${d}`);
    this.dispatch({ type: 'fieldAction', action, targetId: speciesId });
    for (const d of drops) this.dispatch({ type: 'obtain', itemId: d, qty: 1 });
  }

  /** Solver mode: travel (recruit + cross gates) before acting in a far chunk. Scripted tests leave it off. */
  autoTravel = false;

  private tryTravel(p: Vec2): boolean {
    try {
      this.ensureReachable(p);
      return true;
    } catch {
      return false;
    }
  }

  canTraverse(gateId: string): boolean {
    const g = this.db.world.traversalGates.find((x) => x.id === gateId);
    if (!g) return false;
    const action = TRAVERSAL_FOR_GATE[g.kind];
    return this.party.some((h) => this.db.heroes[h].fieldActions.includes(action)) && g.sides.some((s) => this.canReach(s));
  }

  /** Cross a traversal gate the way the store does (fieldAction with the gate id). */
  traverse(gateId: string): void {
    const g = this.db.world.traversalGates.find((x) => x.id === gateId);
    if (!g) throw new Error(`no gate ${gateId}`);
    if (this.autoTravel) {
      this.ensureHero(TRAVERSAL_FOR_GATE[g.kind]);
      if (!g.sides.some((s) => this.canReach(s))) this.ensureReachable(g.sides[0]);
    }
    this.require(this.canTraverse(gateId), `cannot cross ${gateId} with party [${this.party.join(', ')}]`);
    this.dispatch({ type: 'fieldAction', action: TRAVERSAL_FOR_GATE[g.kind], targetId: gateId });
  }

  recruit(npcId: string): void {
    const can = this.sys.township.canRecruit(npcId, this.township, this.flags, evaluate, this.log);
    if (!can.ok) throw new Error(`cannot recruit ${npcId}: ${can.reason ?? ''}`);
    const res = this.sys.township.recruit(npcId, this.township);
    if (!res.ok) throw new Error(res.reason);
    this.township = res.state;
    for (const e of res.events) this.dispatch(e);
  }

  private spend(spend: { readonly coin: number; readonly items: readonly { readonly itemId: string; readonly qty: number }[] }): void {
    this.coin -= spend.coin;
    for (const s of spend.items) this.inventory[s.itemId] = (this.inventory[s.itemId] ?? 0) - s.qty;
  }

  build(plotId: string, buildingId: string): void {
    const res = this.sys.township.build(plotId, buildingId, this.township, this.coin, this.inventory);
    if (!res.ok) throw new Error(`cannot build ${buildingId}: ${res.reason}`);
    this.township = res.state;
    this.spend(res.spend);
    for (const e of res.events) this.dispatch(e);
  }

  upgrade(plotId: string): void {
    const res = this.sys.township.upgrade(plotId, this.township, this.coin, this.inventory, this.flags, evaluate, this.log);
    if (!res.ok) throw new Error(`cannot upgrade ${plotId}: ${res.reason}`);
    this.township = res.state;
    this.spend(res.spend);
    for (const e of res.events) this.dispatch(e);
  }

  /* ── legal solver ─────────────────────────────────────────────────── */

  /** Recruit (via its join quest) a hero who can perform `action`, if nobody in the party can. */
  ensureHero(action: FieldActionId, depth = 0): void {
    if (this.party.some((h) => this.db.heroes[h].fieldActions.includes(action))) return;
    const hero = Object.values(this.db.heroes).find((h) => h.fieldActions.includes(action) && h.joinQuest);
    if (!hero?.joinQuest) throw new Error(`no hero can ${action}`);
    this.drive(hero.joinQuest, 'COMPLETED', depth + 1);
  }

  /** Travel: cross whatever entry gates lie between the party and `p`. */
  ensureReachable(p: Vec2, depth = 0): void {
    const target = chunkKey(p);
    for (let guard = 0; !this.reachableChunks().has(target); guard++) {
      if (guard > 10) throw new Error(`cannot travel to chunk ${target}`);
      const reach = this.reachableChunks();
      // BFS over all links (gated or not) from the reachable set toward the target.
      const prev = new Map<string, string>();
      const queue = [...reach];
      const seen = new Set(reach);
      while (queue.length && !seen.has(target)) {
        const cur = queue.shift() ?? '';
        const [x = 0, z = 0] = cur.split(',').map(Number);
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const nk = `${x + dx},${z + dz}`;
          const k = [cur, nk].sort().join('|');
          if (seen.has(nk) || !(this.links.free.has(k) || this.links.gated.has(k))) continue;
          seen.add(nk);
          prev.set(nk, cur);
          queue.push(nk);
        }
      }
      if (!seen.has(target)) throw new Error(`no route to chunk ${target}`);
      let step = target;
      while (prev.has(step) && !reach.has(prev.get(step) ?? '')) step = prev.get(step) ?? step;
      const from = prev.get(step) ?? '';
      const gates = this.links.gated.get([from, step].sort().join('|')) ?? [];
      const errors: string[] = [];
      for (const gid of gates) {
        const g = this.db.world.traversalGates.find((x) => x.id === gid);
        if (!g) continue;
        try {
          this.ensureHero(TRAVERSAL_FOR_GATE[g.kind], depth + 1);
          if (!this.reachableChunks().has(step)) this.traverse(gid);
          break;
        } catch (e) {
          errors.push(String(e));
        }
      }
      if (!this.reachableChunks().has(step)) throw new Error(`stuck travelling ${from} → ${step}: ${errors.join(' / ')}`);
    }
  }

  /** Gather `qty` of an item through hunting, fishing or loot the party can legally reach. */
  acquire(itemId: string, qty: number): void {
    for (let guard = 0; (this.inventory[itemId] ?? 0) < qty; guard++) {
      if (guard > 40) throw new Error(`could not gather ${itemId}`);
      const reachable = (p: Vec2) => this.canReach(p) || (this.autoTravel && this.tryTravel(p));
      const sp = Object.values(this.db.species).find((s) => s.drops.some((d) => d.itemId === itemId) && s.habitat.some((h) => reachable(h.center)));
      const hunter = (['huntShot', 'huntDash'] as const).find((a) => this.party.some((h) => this.db.heroes[h].fieldActions.includes(a)));
      if (sp && hunter) {
        this.hunt(hunter, sp.id, [itemId]);
        continue;
      }
      const fish = Object.values(this.db.fish).find((f) => f.itemId === itemId);
      const spot = fish && this.db.world.fishingSpots.find((s) => s.fish.includes(fish.id) && !s.hiddenUntilDrakeSight && reachable(s.position));
      if (fish && spot) {
        this.fish(spot.id, fish.id);
        continue;
      }
      const dropsIt = (e: { readonly enemies: readonly string[] }) => e.enemies.some((id) => this.db.enemies[id]?.drops.some((d) => d.itemId === itemId));
      const enc = Object.values(this.db.encounters).find((e) => dropsIt(e) && this.zoneOpen(e.id))
        ?? Object.values(this.db.encounters).find((e) => dropsIt(e) && this.db.world.encounterZones.some((z) => z.encounterId === e.id && !z.once && !z.presentWhen && reachable(z.position)));
      if (enc) {
        this.win(enc.id, [itemId]);
        continue;
      }
      throw new Error(`no reachable source of ${itemId}`);
    }
  }

  private payFor(cost: { readonly coin: number; readonly items: readonly { readonly itemId: string; readonly qty: number }[] }): void {
    for (const it of cost.items) this.acquire(it.itemId, it.qty);
    if (this.coin < cost.coin) this.coin = cost.coin; // coin comes from fights; not the point here
  }

  /** Drive a quest to `target` through legal moves only. */
  drive(questId: string, target: QuestStatus = 'COMPLETED', depth = 0): void {
    this.autoTravel = true;
    const quest = this.db.quests.find((q) => q.id === questId);
    if (!quest) throw new Error(`unknown quest ${questId}`);
    for (let guard = 0; rank(this.status(questId)) < rank(target); guard++) {
      if (guard > 30) throw new Error(`${questId} stuck at ${this.status(questId)}`);
      const s = this.status(questId);
      if (s === 'HIDDEN') this.achieve(quest.discoverWhen, depth + 1);
      else if (s === 'DISCOVERED') this.achieve(quest.activateWhen, depth + 1);
      else {
        for (const o of quest.objectives) {
          if (this.log[questId]?.objectives[o.id]) continue;
          if (o.revealWhen) this.achieve(o.revealWhen, depth + 1);
          this.achieve(o.completeWhen, depth + 1);
        }
      }
    }
  }

  achieve(c: Condition, depth = 0): void {
    this.autoTravel = true;
    if (depth > 60) throw new Error(`solver recursion too deep at ${JSON.stringify(c).slice(0, 200)}`);
    if (this.holds(c)) return;
    switch (c.kind) {
      case 'always':
        return;
      case 'not':
        throw new Error(`cannot make a negation true: ${JSON.stringify(c)}`);
      case 'all':
        for (const sub of c.of) this.achieve(sub, depth + 1);
        break;
      case 'any':
      case 'count': {
        const need = c.kind === 'any' ? 1 : c.atLeast;
        const errors: string[] = [];
        for (const sub of c.of) {
          if (c.of.filter((x) => this.holds(x)).length >= need) break;
          try {
            this.achieve(sub, depth + 1);
          } catch (e) {
            errors.push(String(e));
          }
        }
        if (!this.holds(c)) throw new Error(`could not satisfy ${c.kind}: ${errors.join(' / ')}`);
        return;
      }
      case 'quest':
      case 'questAtLeast':
        this.drive(c.questId, c.status, depth + 1);
        break;
      case 'flag':
        for (let guard = 0; !this.holds(c); guard++) {
          if (guard > 6) throw new Error(`flag ${c.key} would not set`);
          this.setLegally(c.key, depth + 1);
        }
        break;
    }
    if (!this.holds(c)) throw new Error(`could not satisfy ${JSON.stringify(c)}`);
  }

  /** Talk to whoever currently offers `pred`; achieves the NPC entry condition first if needed. */
  private talkFor(pred: (d: DialogueDef) => string | true | null, what: string, depth: number): void {
    const candidates: { npc: NpcDef; when: Condition; dlg: DialogueDef }[] = [];
    for (const npc of this.db.world.npcs) {
      for (const entry of npc.dialogues) {
        const dlg = this.db.dialogues[entry.dialogueId];
        if (dlg && pred(dlg) !== null) candidates.push({ npc, when: entry.when, dlg });
      }
    }
    if (candidates.length === 0) throw new Error(`nothing in the world can ${what}`);
    const errors: string[] = [];
    for (const { npc, when, dlg } of candidates) {
      try {
        if (npc.presentWhen) this.achieve(npc.presentWhen, depth + 1);
        if (npc.hiddenUntilDrakeSight && !this.holds({ kind: 'flag', key: `evt:field:drakeSight:${npc.id}`, atLeast: 1 })) this.reveal(npc.id);
        this.achieve(when, depth + 1);
        if (this.dialogueFor(npc.id).id !== dlg.id) throw new Error(`${npc.id} shows ${this.dialogueFor(npc.id).id}, not ${dlg.id}`);
        const choice = pred(dlg);
        this.talk(npc.id, choice === true ? undefined : choice ?? undefined);
        return;
      } catch (e) {
        errors.push(`${npc.id}: ${String(e)}`);
      }
    }
    throw new Error(`could not ${what}: ${errors.join(' | ')}`);
  }

  private setLegally(key: string, depth: number): void {
    const [ns, type, ...rest] = key.split(':');
    const id = rest.join(':');
    if (ns === 'evt') {
      switch (type) {
        case 'talk': {
          const npc = this.npc(id);
          if (npc.presentWhen) this.achieve(npc.presentWhen, depth);
          if (npc.hiddenUntilDrakeSight && !this.holds({ kind: 'flag', key: `evt:field:drakeSight:${id}`, atLeast: 1 })) this.reveal(id);
          const dlg = this.dialogueFor(id);
          const decline = dlg.choices?.find((c) => !c.events?.length && (!c.when || this.holds(c.when)));
          this.talk(id, dlg.choices?.length ? (decline ?? dlg.choices.find((c) => !c.when || this.holds(c.when)))?.id : undefined);
          return;
        }
        case 'accept':
          return this.talkFor((d) => d.choices?.find((c) => c.events?.some((e) => e.type === 'acceptQuest' && e.questId === id))?.id ?? null, `accept ${id}`, depth);
        case 'choice': {
          const choiceId = rest[rest.length - 1] ?? '';
          const dialogueId = rest.slice(0, -1).join(':');
          return this.talkFor((d) => (d.id === dialogueId ? choiceId : null), `choose ${choiceId} in ${dialogueId}`, depth);
        }
        case 'defeat': {
          const z0 = this.db.world.encounterZones.find((z) => z.encounterId === id && !this.cleared.has(z.id));
          if (z0) this.ensureReachable(z0.position, depth);
          if (this.zoneOpen(id)) return this.win(id);
          const zone = this.db.world.encounterZones.find((z) => z.encounterId === id && !this.cleared.has(z.id));
          if (zone?.presentWhen && !this.holds(zone.presentWhen)) {
            this.achieve(zone.presentWhen, depth);
            if (this.zoneOpen(id)) return this.win(id);
          }
          const starter = this.db.world.npcs.find((n) => n.dialogues.some((e) => this.db.dialogues[e.dialogueId]?.startsEncounter === id));
          if (starter) {
            this.talkFor((d) => (d.startsEncounter === id ? true : null), `start ${id}`, depth);
            return this.win(id);
          }
          throw new Error(`encounter ${id} is not open`);
        }
        case 'liberate': {
          const enc = Object.values(this.db.encounters).find((e) => e.liberatesRegion === id);
          if (!enc) throw new Error(`nothing liberates ${id}`);
          return this.achieve({ kind: 'flag', key: `evt:defeat:${enc.id}`, atLeast: 1 }, depth);
        }
        case 'obtain': {
          const reward = this.db.quests.find((q) => q.rewards.some((r) => (r.type === 'gear' && r.gearId === id) || (r.type === 'item' && r.itemId === id)));
          if (this.db.gear[id] || this.db.items[id]?.kind === 'key') {
            if (!reward) {
              const enc = Object.values(this.db.encounters).find((e) => e.enemies.some((x) => this.db.enemies[x]?.drops.some((d) => d.itemId === id && d.chance >= 1)));
              if (enc) return this.achieve({ kind: 'flag', key: `evt:defeat:${enc.id}`, atLeast: asNumber(this.flags[`evt:defeat:${enc.id}`]) + 1 }, depth);
              throw new Error(`no source of ${id}`);
            }
            return this.drive(reward.id, 'COMPLETED', depth);
          }
          return this.acquire(id, (this.inventory[id] ?? 0) + 1);
        }
        case 'enter': {
          const region = this.db.world.regions.find((r) => r.id === id);
          if (!region) throw new Error(`no region ${id}`);
          this.ensureReachable(region.center, depth);
          this.require(this.canReach(region.center), `region ${id} unreachable`);
          return this.dispatch({ type: 'enterRegion', regionId: id });
        }
        case 'field': {
          const [action = 'none', ...t] = rest;
          const target = t.join(':');
          if (action === 'drakeSight') {
            const npc = this.db.world.npcs.find((n) => n.id === target);
            if (npc?.presentWhen) this.achieve(npc.presentWhen, depth);
            return this.reveal(target);
          }
          if (action === 'fish') {
            const spot = this.db.world.fishingSpots.find((s) => s.id === target);
            if (!spot) throw new Error(`no spot ${target}`);
            if (spot.hiddenUntilDrakeSight) this.achieve({ kind: 'flag', key: `evt:field:drakeSight:${target}`, atLeast: 1 }, depth);
            return this.fish(target, spot.fish[0] ?? '');
          }
          if (action === 'huntShot' || action === 'huntDash') return this.hunt(action, target, []);
          if (this.db.world.traversalGates.some((g) => g.id === target)) return this.traverse(target);
          throw new Error(`unknown field target ${action}:${target}`);
        }
        case 'recruit': {
          const def = this.db.township.recruits.find((r) => r.npcId === id);
          if (!def) throw new Error(`${id} is not a recruit`);
          this.achieve(def.requires, depth);
          return this.recruit(id);
        }
        case 'build': {
          const building = this.db.township.buildings.find((b) => b.id === id);
          if (!building) throw new Error(`no building ${id}`);
          this.achieve({ kind: 'flag', key: `evt:recruit:${building.requiresRecruit}`, atLeast: 1 }, depth);
          const plot = this.db.township.plots.find((p) => p.accepts.includes(id) && !this.township.built[p.id]);
          if (!plot) throw new Error(`no free plot for ${id}`);
          this.payFor(building.cost);
          return this.build(plot.id, id);
        }
        default:
          throw new Error(`unknown event flag ${key}`);
      }
    }
    // Plain flags: dialogue setters, quest flag rewards, building/upgrade flags.
    const building = this.db.township.buildings.find((b) => b.unlocksFlag === key);
    if (building) return this.achieve({ kind: 'flag', key: `evt:build:${building.id}`, atLeast: 1 }, depth);
    const upgrade = this.db.township.buildings.flatMap((b) => b.upgrades.map((u) => ({ b, u }))).find(({ u }) => u.unlocksFlag === key);
    if (upgrade) return this.upgradeTo(upgrade.b.id, upgrade.u.level, depth);
    const sets = (e: WorldEvent) => e.type === 'setFlag' && e.key === key;
    const viaDialogue = Object.values(this.db.dialogues).some((d) => (d.onEnd ?? []).some(sets) || (d.choices ?? []).some((c) => (c.events ?? []).some(sets)));
    if (viaDialogue) {
      return this.talkFor((d) => {
        if ((d.onEnd ?? []).some(sets)) return d.choices?.length ? (d.choices.find((c) => !c.when || this.holds(c.when))?.id ?? null) : true;
        return d.choices?.find((c) => (c.events ?? []).some(sets))?.id ?? null;
      }, `set ${key}`, depth);
    }
    const quest = this.db.quests.find((q) => q.rewards.some((r) => r.type === 'flag' && r.key === key));
    if (quest) return this.drive(quest.id, 'COMPLETED', depth);
    throw new Error(`nothing sets flag ${key}`);
  }

  upgradeTo(buildingId: string, level: number, depth = 0): void {
    this.autoTravel = true;
    this.achieve({ kind: 'flag', key: `evt:build:${buildingId}`, atLeast: 1 }, depth);
    const plot = Object.entries(this.township.built).find(([, b]) => b === buildingId)?.[0];
    const building = this.db.township.buildings.find((b) => b.id === buildingId);
    if (!plot || !building) throw new Error(`${buildingId} not built`);
    while ((this.township.levels[plot] ?? 1) < level) {
      const next = building.upgrades.find((u) => u.level === (this.township.levels[plot] ?? 1) + 1);
      if (!next) throw new Error(`${buildingId} has no level ${level}`);
      if (next.requires) this.achieve(next.requires, depth + 1);
      this.payFor(next.cost);
      this.upgrade(plot);
    }
  }

  /** Action that clears a gate (for assertions). */
  static actionFor(kind: keyof typeof TRAVERSAL_FOR_GATE): FieldActionId {
    return TRAVERSAL_FOR_GATE[kind];
  }
}
