/**
 * Test-only "player" that drives the real store toward any quest condition by
 * dispatching the world events a player would cause. Shared by the e2e suites.
 */
import { useGame } from '@/app/store';
import { QUEST_STATUS_ORDER, type Condition, type CoreServices, type GameDatabase, type QuestId, type QuestStatus, type WorldEvent } from '@/types/contracts';

export interface Transition {
  readonly questId: QuestId;
  readonly from: QuestStatus;
  readonly to: QuestStatus;
}

export function createDriver(db: GameDatabase, core: CoreServices) {
  const game = () => useGame.getState();
  const transitions: Transition[] = [];
  const rank = (s: QuestStatus): number => QUEST_STATUS_ORDER.indexOf(s);
  const statusOf = (id: QuestId): QuestStatus => game().questLog[id]?.status ?? 'HIDDEN';
  const holds = (c: Condition): boolean => core.quests.evaluate(c, game().flags, game().questLog);

  function eventForFlag(key: string): WorldEvent | null {
    const [ns, type, ...rest] = key.split(':');
    const id = rest.join(':');
    if (ns !== 'evt' || !type) return null;
    switch (type) {
      case 'talk':
        return { type: 'talk', npcId: id };
      case 'defeat':
        return { type: 'defeat', encounterId: id };
      case 'obtain':
        return { type: 'obtain', itemId: id, qty: 1 };
      case 'enter':
        return { type: 'enterRegion', regionId: id };
      case 'recruit':
        return { type: 'recruit', npcId: id };
      case 'build':
        return { type: 'build', buildingId: id };
      case 'accept':
        return { type: 'acceptQuest', questId: id };
      case 'liberate':
        return { type: 'liberate', regionId: id };
      case 'field': {
        const [action, ...target] = rest;
        return { type: 'fieldAction', action: action as never, targetId: target.join(':') };
      }
      case 'choice': {
        const choiceId = rest[rest.length - 1] ?? '';
        return { type: 'choice', dialogueId: rest.slice(0, -1).join(':'), choiceId };
      }
      default:
        return null;
    }
  }

  function dispatch(event: WorldEvent): void {
    const before = { ...game().questLog };
    game().dispatchWorldEvent(event);
    const after = game().questLog;
    for (const q of db.quests) {
      const a = before[q.id]?.status ?? 'HIDDEN';
      const b = after[q.id]?.status ?? 'HIDDEN';
      if (a !== b) transitions.push({ questId: q.id, from: a, to: b });
    }
  }

  function grantMaterials(items: readonly { readonly itemId: string; readonly qty: number }[], coin: number): void {
    const inventory = { ...game().inventory };
    for (const it of items) inventory[it.itemId] = (inventory[it.itemId] ?? 0) + it.qty;
    useGame.setState({ coin: game().coin + coin, inventory });
  }

  function satisfy(c: Condition, depth = 0): void {
    if (depth > 16 || holds(c)) return;
    switch (c.kind) {
      case 'always':
      case 'not':
        return;
      case 'flag': {
        const need = typeof c.atLeast === 'number' ? c.atLeast : 1;
        for (let i = 0; i < need + 1 && !holds(c); i++) {
          const ev = eventForFlag(c.key);
          if (ev?.type === 'recruit') {
            const def = db.township.recruits.find((r) => r.npcId === ev.npcId);
            if (def) satisfy(def.requires, depth + 1);
            game().recruit(ev.npcId);
            if (!holds(c)) dispatch(ev);
          } else if (ev?.type === 'build') {
            const building = db.township.buildings.find((b) => b.id === ev.buildingId);
            const plot = db.township.plots.find((p) => p.accepts.includes(ev.buildingId) && !game().township.built[p.id]);
            if (building && plot) {
              satisfy({ kind: 'flag', key: `evt:recruit:${building.requiresRecruit}` }, depth + 1);
              grantMaterials(building.cost.items, building.cost.coin);
              game().build(plot.id, building.id);
            }
            if (!holds(c)) dispatch(ev);
          } else if (ev) {
            dispatch(ev);
          } else {
            const upgrade = db.township.buildings.flatMap((b) => b.upgrades.map((u) => ({ b, u }))).find(({ u }) => u.unlocksFlag === c.key);
            if (upgrade) upgradeTo(upgrade.b.id, upgrade.u.level, depth + 1);
            if (!holds(c)) dispatch({ type: 'setFlag', key: c.key, value: c.equals ?? (c.atLeast ?? true) });
          }
        }
        return;
      }
      case 'quest':
      case 'questAtLeast':
        driveQuest(c.questId, c.status, depth + 1);
        return;
      case 'all':
        for (const sub of c.of) satisfy(sub, depth + 1);
        return;
      case 'any': {
        const first = c.of[0];
        if (first) satisfy(first, depth + 1);
        return;
      }
      case 'count': {
        for (const sub of c.of) {
          if (c.of.filter(holds).length >= c.atLeast) break;
          satisfy(sub, depth + 1);
        }
        return;
      }
    }
  }

  function upgradeTo(buildingId: string, level: number, depth = 0): void {
    const building = db.township.buildings.find((b) => b.id === buildingId);
    if (!building) return;
    satisfy({ kind: 'flag', key: `evt:build:${buildingId}` }, depth + 1);
    const plot = Object.entries(game().township.built).find(([, b]) => b === buildingId)?.[0];
    if (!plot) return;
    for (let guard = 0; guard < 5 && (game().township.levels[plot] ?? 1) < level; guard++) {
      const next = building.upgrades.find((u) => u.level === (game().township.levels[plot] ?? 1) + 1);
      if (!next) return;
      if (next.requires) satisfy(next.requires, depth + 1);
      grantMaterials(next.cost.items, next.cost.coin);
      game().upgradeBuilding(plot);
    }
  }

  function driveQuest(id: QuestId, target: QuestStatus = 'COMPLETED', depth = 0): void {
    const quest = db.quests.find((q) => q.id === id);
    if (!quest) throw new Error(`Unknown quest ${id}`);
    for (let guard = 0; guard < 60 && rank(statusOf(id)) < rank(target); guard++) {
      const status = statusOf(id);
      if (status === 'HIDDEN') satisfy(quest.discoverWhen, depth);
      else if (status === 'DISCOVERED') satisfy(quest.activateWhen, depth);
      else if (status === 'ACTIVE') {
        for (const o of quest.objectives) {
          if (game().questLog[id]?.objectives[o.id]) continue;
          if (o.revealWhen) satisfy(o.revealWhen, depth);
          satisfy(o.completeWhen, depth);
        }
      }
    }
  }

  return { game, transitions, rank, statusOf, holds, satisfy, driveQuest, upgradeTo, dispatch };
}
