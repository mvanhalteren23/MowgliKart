/** Quest grouping / sorting / tracking selectors — framework-free, unit tested. */
import type {
  Condition,
  GameDatabase,
  ObjectiveDef,
  QuestDef,
  QuestKind,
  QuestLog,
  QuestStatus,
  Reward,
  WorldFlags,
} from '@/types/contracts';
import { QUEST_STATUS_ORDER } from '@/types/contracts';

export type Evaluate = (condition: Condition, flags: WorldFlags, log: QuestLog) => boolean;

export interface ChronicleTab {
  readonly id: 'main' | 'companion' | 'investigation' | 'township';
  readonly label: string;
  readonly kind: QuestKind;
}

export const CHRONICLE_TABS: readonly ChronicleTab[] = [
  { id: 'main', label: 'Main', kind: 'main' },
  { id: 'companion', label: 'Companion', kind: 'companion' },
  { id: 'investigation', label: 'Investigations', kind: 'investigation' },
  { id: 'township', label: 'Township', kind: 'township' },
];

export const statusOf = (log: QuestLog, questId: string): QuestStatus => log[questId]?.status ?? 'HIDDEN';

const STATUS_RANK: Readonly<Record<QuestStatus, number>> = { ACTIVE: 0, DISCOVERED: 1, COMPLETED: 2, HIDDEN: 3 };

/** Visible quests of one kind: not HIDDEN; tracked first, then ACTIVE → DISCOVERED → COMPLETED, then act, then authored order. */
export function questsForTab(quests: readonly QuestDef[], log: QuestLog, kind: QuestKind, trackedId: string | null = null): QuestDef[] {
  return quests
    .map((q, index) => ({ q, index, status: statusOf(log, q.id) }))
    .filter((e) => e.q.kind === kind && e.status !== 'HIDDEN')
    .sort((a, b) => {
      const ta = a.q.id === trackedId ? 0 : 1;
      const tb = b.q.id === trackedId ? 0 : 1;
      return ta - tb || STATUS_RANK[a.status] - STATUS_RANK[b.status] || a.q.act - b.q.act || a.index - b.index;
    })
    .map((e) => e.q);
}

/** Count of visible quests per kind (for tab badges) — only ACTIVE + DISCOVERED count as "open". */
export function openCounts(quests: readonly QuestDef[], log: QuestLog): Readonly<Record<QuestKind, number>> {
  const out: Record<QuestKind, number> = { main: 0, companion: 0, investigation: 0, township: 0 };
  for (const q of quests) {
    const s = statusOf(log, q.id);
    if (s === 'ACTIVE' || s === 'DISCOVERED') out[q.kind] += 1;
  }
  return out;
}

export interface ObjectiveView {
  readonly def: ObjectiveDef;
  readonly done: boolean;
}

/** Objectives the player may see (revealed), with completion. */
export function visibleObjectives(quest: QuestDef, log: QuestLog, flags: WorldFlags, evaluate: Evaluate): ObjectiveView[] {
  const progress = log[quest.id];
  return quest.objectives
    .filter((o) => (progress?.objectives[o.id] ?? false) || !o.revealWhen || evaluate(o.revealWhen, flags, log))
    .map((def) => ({ def, done: progress?.objectives[def.id] ?? false }));
}

/** First incomplete, revealed objective — required ones before optional ones. */
export function currentObjective(quest: QuestDef, log: QuestLog, flags: WorldFlags, evaluate: Evaluate): ObjectiveDef | null {
  const open = visibleObjectives(quest, log, flags, evaluate).filter((o) => !o.done);
  return (open.find((o) => !o.def.optional) ?? open[0])?.def ?? null;
}

/** Marker for the tracker arrow: current objective's, else any open revealed objective's. */
export function trackerMarker(quest: QuestDef, log: QuestLog, flags: WorldFlags, evaluate: Evaluate): { readonly x: number; readonly z: number } | null {
  const cur = currentObjective(quest, log, flags, evaluate);
  if (cur?.marker) return cur.marker;
  const open = visibleObjectives(quest, log, flags, evaluate).filter((o) => !o.done && o.def.marker);
  return open[0]?.def.marker ?? null;
}

/** Chronicle passages for every status reached so far (DISCOVERED onward), oldest first. */
export function chronicleEntries(quest: QuestDef, status: QuestStatus): { readonly status: QuestStatus; readonly text: string }[] {
  const reached = QUEST_STATUS_ORDER.indexOf(status);
  return QUEST_STATUS_ORDER.filter((s, i) => s !== 'HIDDEN' && i <= reached)
    .map((s) => ({ status: s, text: quest.chronicle[s] }))
    .filter((e) => e.text.trim().length > 0);
}

export type RewardNames = Pick<GameDatabase, 'gear' | 'items' | 'spirits'>;

export function formatReward(r: Reward, db: RewardNames): string | null {
  switch (r.type) {
    case 'gear':
      return `${db.gear[r.gearId]?.icon ?? '⚙'} ${db.gear[r.gearId]?.name ?? r.gearId}`;
    case 'item':
      return `${db.items[r.itemId]?.icon ?? '•'} ${db.items[r.itemId]?.name ?? r.itemId} ×${r.qty}`;
    case 'coin':
      return `◉ ${r.amount} coin`;
    case 'xp':
      return `✦ ${r.amount} XP`;
    case 'spirit':
      return `✧ Warden ${db.spirits[r.spiritId]?.name ?? r.spiritId}`;
    case 'flag':
      return null;
  }
}
