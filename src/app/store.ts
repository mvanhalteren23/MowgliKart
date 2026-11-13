/**
 * Game store (lead-owned). The single reactive source of truth; implements
 * `GameStore` from the contracts by orchestrating the injected services.
 *
 *   bindServices({ db, core, systems })  → boots a new game
 *   useGame(selector)                    → React hook (UI + engine)
 *   useGame.getState()                   → imperative access (engine frame loop)
 *   getServices()                        → definitions + pure rule engines
 */
import { create } from 'zustand';
import { runtime } from '@/app/runtime';
import { COMBAT_PARTY_SIZE } from '@/types/contracts';
import type {
  CombatState,
  EndingDef,
  ClueDef,
  FieldActionOptions,
  CoreServices,
  FieldActionId,
  FusedProfile,
  GameDatabase,
  GameState,
  GameStore,
  GearId,
  HeroId,
  HeroProgress,
  ItemId,
  QuestId,
  QuestNotification,
  Reward,
  Stats,
  Toast,
  WorldEvent,
  WorldSystems,
} from '@/types/contracts';

export interface Services {
  readonly db: GameDatabase;
  readonly core: CoreServices;
  readonly systems: WorldSystems;
}

let services: Services | null = null;

export function getServices(): Services {
  if (!services) throw new Error('Services not bound — call bindServices() before rendering the game.');
  return services;
}

/** Tunables (tests set `enemyTurnDelayMs = 0` to resolve enemy turns synchronously). */
export const storeConfig = {
  enemyTurnDelayMs: 850,
  drakeSightDurationSec: 9,
  maxToasts: 4,
};

const EMPTY_STATE: GameState = {
  mode: 'boot',
  party: [],
  leader: 'kael',
  roster: {},
  coin: 0,
  inventory: {},
  gearOwned: [],
  spiritsOwned: [],
  flags: {},
  questLog: {},
  trackedQuestId: null,
  liberatedRegions: [],
  township: { recruited: [], built: {}, levels: {} },
  combat: null,
  combatZoneId: null,
  dialogue: null,
  fishing: null,
  merchantSurfaced: false,
  wind: { direction: 0, speed: 2 },
  contextAction: null,
  drakeSightUntil: 0,
  fieldCooldowns: {},
  worldTime: 0,
  clearedZones: [],
  toasts: [],
  ui: { chronicleOpen: false, inspectorOpen: false, townshipOpen: false, inspectorHero: 'kael' },
};

/* ── Derived hero sheet (shared by store, UI inspector and tests) ───────── */

export interface HeroSheet {
  readonly heroId: HeroId;
  readonly level: number;
  /** Level-scaled stats, no gear. */
  readonly base: Stats;
  /** + loadout (relics scaled by level and liberated regions). */
  readonly withGear: Stats;
  /** + Warden fusion decorator chain (equals `withGear` when not fused). */
  readonly fused: FusedProfile;
}

export function deriveHeroSheet(state: Pick<GameState, 'roster' | 'liberatedRegions'>, heroId: HeroId): HeroSheet | null {
  const { db, core } = getServices();
  const progress = state.roster[heroId];
  if (!progress) return null;
  const hero = db.heroes[heroId];
  const ctx = { level: progress.level, liberatedRegions: state.liberatedRegions.length };
  const base = core.progression.statsAt(hero, progress.level);
  const withGear = core.gear.statsWithLoadout(hero, progress.loadout, ctx);
  const fused = core.fusion.compose(hero, withGear, core.progression.skillsAt(hero, progress.level), progress.fusion);
  return { heroId, level: progress.level, base, withGear, fused };
}

/** Highest-priority ending whose condition currently holds (null before any is reachable). */
export function resolveEnding(state: Pick<GameState, 'flags' | 'questLog'>): EndingDef | null {
  const { db, core } = getServices();
  const reached = db.endings.filter((e) => core.quests.evaluate(e.when, state.flags, state.questLog));
  return reached.sort((a, b) => b.priority - a.priority)[0] ?? null;
}

/** Investigation clues found so far. */
export function foundClues(state: Pick<GameState, 'flags' | 'questLog'>): readonly ClueDef[] {
  const { db, core } = getServices();
  return db.clues.filter((c) => core.quests.evaluate(c.foundWhen, state.flags, state.questLog));
}

/** Heroes who fight: the leader first, then party order, capped at COMBAT_PARTY_SIZE. */
export function combatParty(state: Pick<GameState, 'party' | 'leader'>): readonly HeroId[] {
  const rest = state.party.filter((h) => h !== state.leader);
  return [state.leader, ...rest].filter((h) => state.party.includes(h)).slice(0, COMBAT_PARTY_SIZE);
}

function freshProgress(s: Services, heroId: HeroId, level: number): HeroProgress {
  const hero = s.db.heroes[heroId];
  const loadout = s.db.start.loadouts[heroId] ?? {};
  const stats = s.core.gear.statsWithLoadout(hero, loadout, { level, liberatedRegions: 0 });
  return { level, xp: 0, hp: stats.maxHp, ap: stats.maxAp, loadout, fusion: [] };
}

function newGame(s: Services): GameState {
  const { db, core, systems } = s;
  const roster: Partial<Record<HeroId, HeroProgress>> = {};
  for (const heroId of db.start.party) {
    const hero = db.heroes[heroId];
    const loadout = db.start.loadouts[heroId] ?? {};
    const stats = core.gear.statsWithLoadout(hero, loadout, { level: db.start.level, liberatedRegions: 0 });
    roster[heroId] = { level: db.start.level, xp: 0, hp: stats.maxHp, ap: stats.maxAp, loadout, fusion: [] };
  }
  return {
    ...EMPTY_STATE,
    mode: 'overworld',
    party: db.start.party,
    leader: db.start.leader,
    roster,
    coin: db.start.coin,
    inventory: db.start.inventory,
    gearOwned: db.start.gearOwned,
    spiritsOwned: db.start.spirits,
    flags: db.start.flags,
    questLog: core.quests.initialLog(),
    township: systems.township.initial(),
    wind: systems.hunting.windAt(0, db.world.seed),
    ui: { ...EMPTY_STATE.ui, inspectorHero: db.start.leader },
  };
}

let toastSeq = 1;
let encounterSeq = 1;
let enemyTimer: ReturnType<typeof setTimeout> | null = null;

export const useGame = create<GameStore>()((set, get) => {
  const toast = (text: string, tone: Toast['tone'] = 'info'): void => {
    set((st) => ({ toasts: [...st.toasts, { id: toastSeq++, text, tone }].slice(-storeConfig.maxToasts) }));
  };

  const addItem = (itemId: ItemId, qty: number): void => {
    if (qty === 0) return;
    set((st) => ({ inventory: { ...st.inventory, [itemId]: Math.max(0, (st.inventory[itemId] ?? 0) + qty) } }));
  };

  const maxOf = (heroId: HeroId): Stats | null => deriveHeroSheet(get(), heroId)?.fused.stats ?? null;

  const grantXp = (amount: number): void => {
    if (amount <= 0) return;
    const { core, db } = getServices();
    const st = get();
    const roster: Partial<Record<HeroId, HeroProgress>> = { ...st.roster };
    for (const heroId of st.party) {
      const p = roster[heroId];
      if (!p) continue;
      const r = core.progression.grantXp(p.level, p.xp, amount);
      roster[heroId] = { ...p, level: r.level, xp: r.xp };
      if (r.levelsGained > 0) toast(`${db.heroes[heroId].name} reached level ${r.level}!`, 'reward');
    }
    set({ roster });
    // Level-ups refill to the new maximums.
    const after: Partial<Record<HeroId, HeroProgress>> = { ...get().roster };
    for (const heroId of st.party) {
      const before = st.roster[heroId];
      const now = after[heroId];
      const max = maxOf(heroId);
      if (before && now && max && now.level > before.level) after[heroId] = { ...now, hp: max.maxHp, ap: max.maxAp };
    }
    set({ roster: after });
  };

  const grantRewards = (rewards: readonly Reward[]): void => {
    const { db } = getServices();
    for (const r of rewards) {
      switch (r.type) {
        case 'gear': {
          if (!get().gearOwned.includes(r.gearId)) set((st) => ({ gearOwned: [...st.gearOwned, r.gearId] }));
          toast(`Obtained ${db.gear[r.gearId]?.name ?? r.gearId}`, 'reward');
          get().dispatchWorldEvent({ type: 'obtain', itemId: r.gearId, qty: 1 });
          break;
        }
        case 'item':
          addItem(r.itemId, r.qty);
          toast(`Obtained ${db.items[r.itemId]?.name ?? r.itemId} ×${r.qty}`, 'reward');
          get().dispatchWorldEvent({ type: 'obtain', itemId: r.itemId, qty: r.qty });
          break;
        case 'coin':
          set((st) => ({ coin: st.coin + r.amount }));
          toast(`+${r.amount} coin`, 'reward');
          break;
        case 'xp':
          grantXp(r.amount);
          break;
        case 'spirit':
          if (!get().spiritsOwned.includes(r.spiritId)) set((st) => ({ spiritsOwned: [...st.spiritsOwned, r.spiritId] }));
          toast(`Warden ${db.spirits[r.spiritId].name} answers your call`, 'reward');
          break;
        case 'flag':
          break; // already folded into flags by the quest engine
        case 'hero': {
          const st = get();
          if (st.party.includes(r.heroId)) break;
          // Newcomers join at the party's average level so they are immediately useful.
          const levels = st.party.map((h) => st.roster[h]?.level ?? 1);
          const level = Math.max(1, Math.round(levels.reduce((a, b) => a + b, 0) / Math.max(1, levels.length)));
          const progress = st.roster[r.heroId] ?? freshProgress(getServices(), r.heroId, level);
          set({ party: [...st.party, r.heroId], roster: { ...st.roster, [r.heroId]: progress } });
          toast(`${db.heroes[r.heroId].name} joins the party!`, 'reward');
          break;
        }
      }
    }
  };

  const pickTracked = (current: QuestId | null): QuestId | null => {
    const { db } = getServices();
    const log = get().questLog;
    if (current && log[current]?.status === 'ACTIVE') return current;
    const active = db.quests.filter((q) => log[q.id]?.status === 'ACTIVE');
    return (active.find((q) => q.kind === 'main') ?? active[0])?.id ?? null;
  };

  const notify = (notes: readonly QuestNotification[]): void => {
    for (const n of notes) toast(n.text, 'quest');
  };

  /** Copy battle HP/AP back onto the roster. */
  const writeBack = (combat: CombatState, reviveFraction: number): void => {
    const roster: Partial<Record<HeroId, HeroProgress>> = { ...get().roster };
    for (const c of Object.values(combat.combatants)) {
      if (!c.heroId) continue;
      const p = roster[c.heroId];
      if (!p) continue;
      const max = maxOf(c.heroId);
      const maxHp = max?.maxHp ?? c.baseStats.maxHp;
      const maxAp = max?.maxAp ?? c.baseStats.maxAp;
      const hp = c.alive && reviveFraction === 0 ? c.hp : Math.max(c.hp, Math.ceil(maxHp * Math.max(reviveFraction, 0.25)));
      roster[c.heroId] = { ...p, hp: Math.max(1, Math.min(maxHp, hp)), ap: Math.max(0, Math.min(maxAp, c.ap)) };
    }
    set({ roster });
  };

  const settleCombat = (combat: CombatState): void => {
    const { db } = getServices();
    const zoneId = get().combatZoneId;
    if (combat.phase === 'victory') {
      writeBack(combat, 0);
      const rewards = combat.rewards;
      if (zoneId) {
        const zone = db.world.encounterZones.find((z) => z.id === zoneId);
        if (zone?.once && !get().clearedZones.includes(zoneId)) set((st) => ({ clearedZones: [...st.clearedZones, zoneId] }));
      }
      if (rewards) {
        set((st) => ({ coin: st.coin + rewards.coin }));
        grantXp(rewards.xp);
        for (const it of rewards.items) {
          addItem(it.itemId, it.qty);
          get().dispatchWorldEvent({ type: 'obtain', itemId: it.itemId, qty: it.qty });
        }
      }
      get().dispatchWorldEvent({ type: 'defeat', encounterId: combat.encounterId });
      const region = rewards?.liberatesRegion ?? db.encounters[combat.encounterId]?.liberatesRegion;
      if (region && !get().liberatedRegions.includes(region)) {
        set((st) => ({ liberatedRegions: [...st.liberatedRegions, region] }));
        toast(`${db.world.regions.find((r) => r.id === region)?.name ?? region} is liberated!`, 'reward');
        get().dispatchWorldEvent({ type: 'liberate', regionId: region });
      }
    } else if (combat.phase === 'defeat') {
      writeBack(combat, 0.5);
      toast('The party staggers back to its feet…', 'warn');
    } else if (combat.phase === 'fled') {
      writeBack(combat, 0);
    }
  };

  const isOver = (c: CombatState): boolean => c.phase === 'victory' || c.phase === 'defeat' || c.phase === 'fled';

  /** Resolve enemy turns (paced by a timer, or synchronously when the delay is 0). */
  const pumpEnemies = (): void => {
    const { core } = getServices();
    const stepOnce = (): boolean => {
      const combat = get().combat;
      if (!combat || combat.phase !== 'enemyTurn') return false;
      const next = core.combat.step(combat, core.combat.chooseEnemyAction(combat));
      set({ combat: next });
      if (isOver(next)) settleCombat(next);
      return next.phase === 'enemyTurn';
    };
    if (storeConfig.enemyTurnDelayMs <= 0) {
      let guard = 0;
      while (stepOnce() && guard++ < 200);
      return;
    }
    if (enemyTimer) return;
    if (get().combat?.phase !== 'enemyTurn') return;
    enemyTimer = setTimeout(() => {
      enemyTimer = null;
      if (stepOnce()) pumpEnemies();
    }, storeConfig.enemyTurnDelayMs);
  };

  const closeDialogue = (): void => {
    const { db } = getServices();
    const d = get().dialogue;
    if (!d) return;
    const def = db.dialogues[d.dialogueId];
    set({ dialogue: null, mode: 'overworld' });
    for (const e of def?.onEnd ?? []) get().dispatchWorldEvent(e);
    if (d.npcId) get().dispatchWorldEvent({ type: 'talk', npcId: d.npcId });
    if (def?.startsEncounter) get().startEncounter(def.startsEncounter, null);
  };

  return {
    ...EMPTY_STATE,

    setLeader(heroId) {
      const st = get();
      if (st.mode !== 'overworld' || heroId === st.leader) return;
      if (!st.party.includes(heroId) || !getServices().db.heroes[heroId].playable) return;
      set({ leader: heroId, ui: { ...st.ui, inspectorHero: heroId } });
    },

    cycleLeader(direction) {
      const st = get();
      const i = st.party.indexOf(st.leader);
      if (i < 0 || st.party.length === 0) return;
      const next = st.party[(i + direction + st.party.length) % st.party.length];
      if (next) get().setLeader(next);
    },

    setContextAction(action) {
      set({ contextAction: action });
    },

    triggerContextAction() {
      const st = get();
      const ctx = st.contextAction;
      if (!ctx || st.mode !== 'overworld') return;
      const { db, core } = getServices();
      switch (ctx.kind) {
        case 'talk': {
          const npc = db.world.npcs.find((n) => n.id === ctx.npcId);
          const entry = npc?.dialogues.find((d) => core.quests.evaluate(d.when, st.flags, st.questLog));
          if (!npc || !entry || !db.dialogues[entry.dialogueId]) return;
          set({ dialogue: { dialogueId: entry.dialogueId, npcId: npc.id, lineIndex: 0 }, mode: 'dialogue' });
          break;
        }
        case 'fish':
          get().performFieldAction('fish');
          break;
        case 'encounter':
          get().startEncounter(ctx.encounterId, ctx.zoneId);
          break;
        case 'build':
          get().toggleTownship(true);
          break;
        case 'traverse':
          get().performFieldAction(ctx.action);
          break;
      }
    },

    performFieldAction(action: FieldActionId, options: FieldActionOptions = {}) {
      const st = get();
      if (st.mode !== 'overworld' || action === 'none') return;
      const { db, systems } = getServices();
      const def = db.fieldActions[action];
      if (!def) return;
      if (!db.heroes[st.leader].fieldActions.includes(action)) {
        const who = st.party.find((h) => db.heroes[h].fieldActions.includes(action));
        if (who && def.clears) {
          // Traversal is zero-menu: the right companion steps forward automatically.
          get().setLeader(who);
          get().performFieldAction(action, options);
          return;
        }
        toast(who ? `Swap to ${db.heroes[who].name} to ${def.label.toLowerCase()}.` : `No one here can ${def.label.toLowerCase()}.`, 'warn');
        return;
      }
      if ((st.fieldCooldowns[action] ?? 0) > st.worldTime) return;
      const cooldowns = { ...st.fieldCooldowns, [action]: st.worldTime + def.cooldownSec };
      switch (action) {
        case 'fish': {
          const ctx = st.contextAction;
          if (ctx?.kind !== 'fish') {
            toast('Find a fishing spot at the water’s edge.', 'info');
            return;
          }
          const lure = Object.keys(st.inventory).find((id) => db.items[id]?.kind === 'lure' && (st.inventory[id] ?? 0) > 0) ?? null;
          if (lure) addItem(lure, -1);
          const seed = (Math.floor(st.worldTime * 1000) ^ (encounterSeq++ * 2654435761)) >>> 0;
          const quality = Math.max(0, Math.min(1, options.castQuality ?? 0.5));
          set({ fishing: systems.fishing.cast(ctx.spotId, lure, seed, quality), mode: 'fishing', fieldCooldowns: cooldowns });
          break;
        }
        case 'drakeSight':
          set({ drakeSightUntil: st.worldTime + storeConfig.drakeSightDurationSec, fieldCooldowns: cooldowns });
          runtime.requests.fieldAction = 'drakeSight';
          get().dispatchWorldEvent({ type: 'fieldAction', action: 'drakeSight', targetId: 'area' });
          break;
        case 'huntShot':
          set({ fieldCooldowns: cooldowns });
          runtime.requests.huntAim =
            options.aimAngle !== undefined ? { angle: options.aimAngle, power: Math.max(0, Math.min(1, options.aimPower ?? 1)) } : null;
          runtime.requests.fieldAction = action;
          break;
        case 'huntDash':
          set({ fieldCooldowns: cooldowns });
          runtime.requests.fieldAction = action;
          break;
        case 'roll':
        case 'glide':
        case 'grapple':
        case 'leap':
        case 'commune':
        case 'unseal': {
          const ctx = st.contextAction;
          if (ctx?.kind !== 'traverse' || ctx.action !== action) {
            toast(`Nothing here to ${def.label.toLowerCase()}.`, 'info');
            return;
          }
          set({ fieldCooldowns: cooldowns });
          runtime.requests.traverseGate = ctx.gateId;
          runtime.requests.fieldAction = action;
          get().dispatchWorldEvent({ type: 'fieldAction', action, targetId: ctx.gateId });
          break;
        }
      }
    },

    reportHunt(result) {
      if (!result.hit) {
        toast('Missed — the herd scatters.', 'info');
        return;
      }
      const st = get();
      const { db } = getServices();
      const action: FieldActionId = db.heroes[st.leader].fieldActions.includes('huntShot') ? 'huntShot' : 'huntDash';
      const species = result.speciesId ? db.species[result.speciesId] : undefined;
      const names: string[] = [];
      for (const d of result.drops) {
        addItem(d.itemId, d.qty);
        names.push(`${db.items[d.itemId]?.name ?? d.itemId} ×${d.qty}`);
      }
      toast(`${species?.name ?? 'Game'} downed${names.length ? ` — ${names.join(', ')}` : ''}`, 'reward');
      if (result.speciesId) get().dispatchWorldEvent({ type: 'fieldAction', action, targetId: result.speciesId });
      for (const d of result.drops) get().dispatchWorldEvent({ type: 'obtain', itemId: d.itemId, qty: d.qty });
    },

    dispatchWorldEvent(event: WorldEvent) {
      const { core, systems } = getServices();
      const st = get();
      // Dialogue-driven recruitment instantiates the resident immediately.
      if (event.type === 'recruit' && !st.township.recruited.includes(event.npcId)) {
        const r = systems.township.recruit(event.npcId, st.township);
        if (r.ok) set({ township: r.state });
      }
      const res = core.quests.dispatch(st.flags, st.questLog, event);
      set({ flags: res.flags, questLog: res.log });
      notify(res.notifications);
      set({ trackedQuestId: pickTracked(get().trackedQuestId) });
      if (res.rewards.length) grantRewards(res.rewards);
    },

    advanceDialogue(choiceId) {
      const st = get();
      const d = st.dialogue;
      if (!d) return;
      const { db, core } = getServices();
      const def = db.dialogues[d.dialogueId];
      if (!def) {
        set({ dialogue: null, mode: 'overworld' });
        return;
      }
      if (d.lineIndex < def.lines.length - 1) {
        set({ dialogue: { ...d, lineIndex: d.lineIndex + 1 } });
        return;
      }
      const choices = (def.choices ?? []).filter((c) => !c.when || core.quests.evaluate(c.when, st.flags, st.questLog));
      if (choices.length > 0) {
        const choice = choices.find((c) => c.id === choiceId);
        if (!choice) return; // UI must present the choices on the last line
        get().dispatchWorldEvent({ type: 'choice', dialogueId: def.id, choiceId: choice.id });
        for (const e of choice.events ?? []) get().dispatchWorldEvent(e);
      }
      closeDialogue();
    },

    startEncounter(encounterId, zoneId = null) {
      const st = get();
      const { db, core } = getServices();
      if (st.mode === 'combat' || !db.encounters[encounterId]) return;
      const party = combatParty(st).flatMap((heroId) => {
        const p = st.roster[heroId];
        return p ? [{ heroId, level: p.level, hp: p.hp, ap: p.ap, loadout: p.loadout, fusion: p.fusion }] : [];
      });
      const seed = (Math.imul(encounterSeq++, 0x9e3779b1) ^ Math.floor(st.worldTime * 997) ^ db.world.seed) >>> 0;
      const combat = core.combat.start({ encounterId, party, liberatedRegions: st.liberatedRegions.length, flags: st.flags }, seed);
      set({ combat, combatZoneId: zoneId, mode: 'combat', dialogue: null, contextAction: null });
      if (isOver(combat)) settleCombat(combat);
      else pumpEnemies();
    },

    combatAct(action) {
      const combat = get().combat;
      if (!combat || combat.phase !== 'awaitingInput') return;
      const next = getServices().core.combat.step(combat, action);
      set({ combat: next });
      if (isOver(next)) settleCombat(next);
      else pumpEnemies();
    },

    endCombat() {
      const combat = get().combat;
      if (!combat || !isOver(combat)) return;
      if (enemyTimer) {
        clearTimeout(enemyTimer);
        enemyTimer = null;
      }
      set({ combat: null, combatZoneId: null, mode: 'overworld' });
    },

    fishingInput(input, dt) {
      const st = get();
      const session = st.fishing;
      if (!session || session.phase === 'landed' || session.phase === 'escaped') return;
      const { systems, db } = getServices();
      const next = systems.fishing.tick(session, input, dt);
      if (next === session) return;
      set({ fishing: next });
      if (next.phase === 'landed') {
        const result = systems.fishing.result(next);
        if (result) {
          addItem(result.itemId, 1);
          toast(`Landed a ${result.fish.name}!`, 'reward');
          get().dispatchWorldEvent({ type: 'obtain', itemId: result.itemId, qty: 1 });
          get().dispatchWorldEvent({ type: 'fieldAction', action: 'fish', targetId: next.spotId });
          if (result.summonsMerchant && !get().merchantSurfaced) {
            set({ merchantSurfaced: true });
            toast('A Brinefolk barge surfaces nearby…', 'quest');
            get().dispatchWorldEvent({ type: 'setFlag', key: 'merchant.surfaced', value: true });
          }
        }
      } else if (next.phase === 'escaped') {
        toast(db.fish[next.fishId] ? 'The line goes slack — it got away.' : 'Nothing bites.', 'info');
      }
    },

    endFishing() {
      if (get().mode !== 'fishing') return;
      set({ fishing: null, mode: 'overworld' });
    },

    equip(heroId, slot, gearId) {
      const st = get();
      const { db, core } = getServices();
      const p = st.roster[heroId];
      if (!p) return;
      const roster: Partial<Record<HeroId, HeroProgress>> = { ...st.roster };
      if (gearId === null) {
        const { [slot]: _removed, ...rest } = p.loadout;
        roster[heroId] = { ...p, loadout: rest };
      } else {
        const gear = db.gear[gearId];
        if (!gear || gear.slot !== slot || !st.gearOwned.includes(gearId) || !core.gear.canEquip(heroId, gear)) return;
        // A piece of gear can only be worn by one hero: take it off anyone else.
        for (const other of st.party) {
          const op = roster[other];
          if (other === heroId || !op || op.loadout[slot] !== gearId) continue;
          const { [slot]: _moved, ...rest } = op.loadout;
          roster[other] = { ...op, loadout: rest };
        }
        roster[heroId] = { ...p, loadout: { ...p.loadout, [slot]: gearId as GearId } };
      }
      set({ roster });
      // Clamp current HP/AP to the new maximums.
      const clamped: Partial<Record<HeroId, HeroProgress>> = { ...get().roster };
      for (const id of st.party) {
        const cur = clamped[id];
        const max = maxOf(id);
        if (cur && max) clamped[id] = { ...cur, hp: Math.min(cur.hp, max.maxHp), ap: Math.min(cur.ap, max.maxAp) };
      }
      set({ roster: clamped });
    },

    setFusion(heroId, spirits) {
      const st = get();
      const { db, core } = getServices();
      const p = st.roster[heroId];
      if (!p) return;
      if (spirits.length > 0) {
        const check = core.fusion.canFuse(db.heroes[heroId], spirits, st.spiritsOwned);
        if (!check.ok) {
          toast(check.reason ?? 'That fusion will not hold.', 'warn');
          return;
        }
      }
      set({ roster: { ...st.roster, [heroId]: { ...p, fusion: [...spirits] } } });
    },

    recruit(npcId) {
      const st = get();
      const { db, core, systems } = getServices();
      const check = systems.township.canRecruit(npcId, st.township, st.flags, core.quests.evaluate, st.questLog);
      if (!check.ok) {
        toast(check.reason ?? 'They are not ready to move in.', 'warn');
        return;
      }
      const r = systems.township.recruit(npcId, st.township);
      if (!r.ok) {
        toast(r.reason, 'warn');
        return;
      }
      set({ township: r.state });
      toast(`${db.world.npcs.find((n) => n.id === npcId)?.name ?? 'A settler'} moves to ${db.township.name}!`, 'reward');
      for (const e of r.events) get().dispatchWorldEvent(e);
    },

    build(plotId, buildingId) {
      const st = get();
      const { db, systems } = getServices();
      const r = systems.township.build(plotId, buildingId, st.township, st.coin, st.inventory);
      if (!r.ok) {
        toast(r.reason, 'warn');
        return;
      }
      const inventory = { ...st.inventory };
      for (const it of r.spend.items) inventory[it.itemId] = Math.max(0, (inventory[it.itemId] ?? 0) - it.qty);
      set({ township: r.state, coin: st.coin - r.spend.coin, inventory });
      const def = db.township.buildings.find((b) => b.id === buildingId);
      toast(`${def?.name ?? 'Building'} raised in ${db.township.name}!`, 'reward');
      if (def) get().dispatchWorldEvent({ type: 'setFlag', key: def.unlocksFlag, value: true });
      for (const e of r.events) get().dispatchWorldEvent(e);
    },

    upgradeBuilding(plotId) {
      const st = get();
      const { db, core, systems } = getServices();
      const r = systems.township.upgrade(plotId, st.township, st.coin, st.inventory, st.flags, core.quests.evaluate, st.questLog);
      if (!r.ok) {
        toast(r.reason, 'warn');
        return;
      }
      const inventory = { ...st.inventory };
      for (const it of r.spend.items) inventory[it.itemId] = Math.max(0, (inventory[it.itemId] ?? 0) - it.qty);
      set({ township: r.state, coin: st.coin - r.spend.coin, inventory });
      const buildingId = r.state.built[plotId];
      const def = db.township.buildings.find((b) => b.id === buildingId);
      const level = r.state.levels[plotId] ?? 1;
      const up = def?.upgrades.find((u) => u.level === level);
      toast(`${def?.name ?? 'Building'} upgraded: ${up?.name ?? `level ${level}`}`, 'reward');
      for (const e of r.events) get().dispatchWorldEvent(e);
    },

    trackQuest(questId) {
      set({ trackedQuestId: questId });
    },

    toggleChronicle(open) {
      set((st) => ({ ui: { ...st.ui, chronicleOpen: open ?? !st.ui.chronicleOpen, inspectorOpen: false, townshipOpen: false } }));
    },

    toggleInspector(open, heroId) {
      set((st) => ({ ui: { ...st.ui, inspectorOpen: open ?? !st.ui.inspectorOpen, inspectorHero: heroId ?? st.ui.inspectorHero, chronicleOpen: false, townshipOpen: false } }));
    },

    toggleTownship(open) {
      set((st) => ({ ui: { ...st.ui, townshipOpen: open ?? !st.ui.townshipOpen, chronicleOpen: false, inspectorOpen: false } }));
    },

    dismissToast(id) {
      set((st) => ({ toasts: st.toasts.filter((t) => t.id !== id) }));
    },

    tickWorld(dt) {
      const st = get();
      if (st.mode === 'boot') return;
      const { db, systems } = getServices();
      const worldTime = st.worldTime + dt;
      set({ worldTime, wind: systems.hunting.windAt(worldTime, db.world.seed) });
    },
  };
});

/** Inject services and start a new game. Safe to call again (tests / new game). */
export function bindServices(s: Services): void {
  services = s;
  if (enemyTimer) {
    clearTimeout(enemyTimer);
    enemyTimer = null;
  }
  toastSeq = 1;
  encounterSeq = 1;
  runtime.requests.fieldAction = null;
  runtime.requests.huntAim = null;
  runtime.requests.traverseGate = null;
  useGame.setState(newGame(s));
  const start = s.db.world.playerStart;
  runtime.player.x = start.x;
  runtime.player.z = start.z;
  // The party begins inside a region: announce it so "on arrival" quests are discoverable from the first frame.
  const home = s.db.world.regions.find((r) => Math.hypot(start.x - r.center.x, start.z - r.center.z) <= r.radius);
  if (home) useGame.getState().dispatchWorldEvent({ type: 'enterRegion', regionId: home.id });
  useGame.setState({ toasts: [] });
}
