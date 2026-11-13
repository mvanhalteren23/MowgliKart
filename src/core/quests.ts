/**
 * World-flag / quest state machine.
 *
 * `dispatch(flags, log, event)`:
 *   1. Fold the event into flags using the canonical `evt:*` count keys.
 *   2. Repeat passes over all quests (definition order) until nothing changes:
 *        HIDDEN     → DISCOVERED  when `discoverWhen`
 *        DISCOVERED → ACTIVE      when `activateWhen`
 *        ACTIVE: objectives complete when revealed (`revealWhen`, default true) and
 *                `completeWhen` holds — sticky once true;
 *                → COMPLETED when every non-optional objective is complete.
 *      At most ONE status step per quest per pass, strictly forward. Each status
 *      change sets flag `quest:<id>` = status. Completion rewards are collected;
 *      `flag` rewards are written to flags immediately (and can cascade).
 *
 * Flag conditions: `equals` compares strictly (a missing flag equals `false`);
 * `atLeast` compares numbers (true → 1, missing/false → 0); neither → truthy.
 */
import type {
  Condition,
  CoreServices,
  FlagValue,
  GameDatabase,
  QuestDef,
  QuestLog,
  QuestNotification,
  QuestProgress,
  QuestStatus,
  QuestStepResult,
  Reward,
  WorldEvent,
  WorldFlags,
} from '@/types/contracts';
import { QUEST_STATUS_ORDER } from '@/types/contracts';

const MAX_PASSES = 256;

export function statusRank(s: QuestStatus): number {
  return QUEST_STATUS_ORDER.indexOf(s);
}

function asNumber(v: FlagValue | undefined): number {
  if (typeof v === 'number') return v;
  if (v === true) return 1;
  if (typeof v === 'string') {
    const n = Number(v);
    return Number.isFinite(n) && v.trim() !== '' ? n : 0;
  }
  return 0;
}

export function evaluate(condition: Condition, flags: WorldFlags, log: QuestLog): boolean {
  switch (condition.kind) {
    case 'always':
      return true;
    case 'flag': {
      const v = flags[condition.key];
      if (condition.equals !== undefined) {
        if (v === undefined) return condition.equals === false;
        if (v !== condition.equals) return false;
      }
      if (condition.atLeast !== undefined) return asNumber(v) >= condition.atLeast;
      if (condition.equals !== undefined) return true;
      return v !== undefined && v !== false && v !== 0 && v !== '';
    }
    case 'quest':
      return (log[condition.questId]?.status ?? 'HIDDEN') === condition.status;
    case 'questAtLeast':
      return statusRank(log[condition.questId]?.status ?? 'HIDDEN') >= statusRank(condition.status);
    case 'all':
      return condition.of.every((c) => evaluate(c, flags, log));
    case 'any':
      return condition.of.some((c) => evaluate(c, flags, log));
    case 'not':
      return !evaluate(condition.of, flags, log);
  }
}

function bump(flags: WorldFlags, key: string, by: number): WorldFlags {
  return { ...flags, [key]: asNumber(flags[key]) + by };
}

/** Fold one event into flags (canonical keys documented on `WorldEvent`). */
export function foldEvent(flags: WorldFlags, event: WorldEvent): WorldFlags {
  switch (event.type) {
    case 'talk':
      return bump(flags, `evt:talk:${event.npcId}`, 1);
    case 'defeat':
      return bump(flags, `evt:defeat:${event.encounterId}`, 1);
    case 'obtain':
      return bump(flags, `evt:obtain:${event.itemId}`, event.qty);
    case 'enterRegion':
      return bump(flags, `evt:enter:${event.regionId}`, 1);
    case 'fieldAction':
      return bump(flags, `evt:field:${event.action}:${event.targetId}`, 1);
    case 'recruit':
      return bump(flags, `evt:recruit:${event.npcId}`, 1);
    case 'build':
      return bump(flags, `evt:build:${event.buildingId}`, 1);
    case 'acceptQuest':
      return bump(flags, `evt:accept:${event.questId}`, 1);
    case 'liberate':
      return bump(flags, `evt:liberate:${event.regionId}`, 1);
    case 'choice':
      return bump(flags, `evt:choice:${event.dialogueId}:${event.choiceId}`, 1);
    case 'setFlag':
      return { ...flags, [event.key]: event.value };
  }
}

function freshProgress(q: QuestDef): QuestProgress {
  const objectives: Record<string, boolean> = {};
  for (const o of q.objectives) objectives[o.id] = false;
  return { status: 'HIDDEN', objectives };
}

export function initialLog(db: GameDatabase): QuestLog {
  const log: Record<string, QuestProgress> = {};
  for (const q of db.quests) log[q.id] = freshProgress(q);
  return log;
}

export function dispatch(db: GameDatabase, flagsIn: WorldFlags, logIn: QuestLog, event: WorldEvent): QuestStepResult {
  let flags = foldEvent(flagsIn, event);
  const log: Record<string, QuestProgress> = { ...logIn };
  const notifications: QuestNotification[] = [];
  const rewards: Reward[] = [];

  for (let pass = 0; pass < MAX_PASSES; pass++) {
    let changed = false;
    for (const q of db.quests) {
      const prev = log[q.id] ?? freshProgress(q);
      let next: QuestProgress = prev;
      const setStatus = (status: QuestStatus, kind: QuestNotification['kind']): void => {
        next = { ...next, status };
        flags = { ...flags, [`quest:${q.id}`]: status };
        notifications.push({ questId: q.id, kind, text: q.chronicle[status] || q.title });
      };

      if (prev.status === 'HIDDEN') {
        if (evaluate(q.discoverWhen, flags, log)) setStatus('DISCOVERED', 'discovered');
      } else if (prev.status === 'DISCOVERED') {
        if (evaluate(q.activateWhen, flags, log)) setStatus('ACTIVE', 'activated');
      } else if (prev.status === 'ACTIVE') {
        const objectives: Record<string, boolean> = { ...prev.objectives };
        for (const o of q.objectives) {
          if (objectives[o.id] === true) continue;
          const revealed = o.revealWhen === undefined || evaluate(o.revealWhen, flags, log);
          if (revealed && evaluate(o.completeWhen, flags, log)) {
            objectives[o.id] = true;
            notifications.push({ questId: q.id, kind: 'objective', text: o.text });
          }
        }
        next = { ...next, objectives };
        if (q.objectives.every((o) => o.optional === true || objectives[o.id] === true)) {
          setStatus('COMPLETED', 'completed');
          for (const r of q.rewards) {
            rewards.push(r);
            if (r.type === 'flag') flags = { ...flags, [r.key]: r.value };
          }
        }
      }

      if (next !== prev && JSON.stringify(next) !== JSON.stringify(prev)) {
        log[q.id] = next;
        changed = true;
      } else if (log[q.id] === undefined) {
        log[q.id] = prev;
      }
    }
    if (!changed) break;
  }

  return { flags, log, notifications, rewards };
}

export function createQuests(db: GameDatabase): CoreServices['quests'] {
  return {
    initialLog: () => initialLog(db),
    evaluate,
    dispatch: (flags, log, event) => dispatch(db, flags, log, event),
  };
}
