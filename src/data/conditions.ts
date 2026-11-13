import type { Condition, FlagValue, QuestId, QuestStatus } from '@/types/contracts';

/** Tiny builders for authored `Condition` trees. Pure data, no logic. */
export const always: Condition = { kind: 'always' };
/** Never true in the slice (nothing ever sets this key). */
export const never: Condition = { kind: 'flag', key: 'slice.never', equals: true };

export const flagIs = (key: string, equals: FlagValue = true): Condition => ({ kind: 'flag', key, equals });
export const flagAtLeast = (key: string, atLeast = 1): Condition => ({ kind: 'flag', key, atLeast });

export const talked = (npcId: string, n = 1): Condition => flagAtLeast(`evt:talk:${npcId}`, n);
export const defeated = (encounterId: string, n = 1): Condition => flagAtLeast(`evt:defeat:${encounterId}`, n);
export const obtained = (itemId: string, n = 1): Condition => flagAtLeast(`evt:obtain:${itemId}`, n);
export const entered = (regionId: string): Condition => flagAtLeast(`evt:enter:${regionId}`);
export const fieldDone = (action: string, targetId: string, n = 1): Condition => flagAtLeast(`evt:field:${action}:${targetId}`, n);
export const recruited = (npcId: string): Condition => flagAtLeast(`evt:recruit:${npcId}`);
export const built = (buildingId: string): Condition => flagAtLeast(`evt:build:${buildingId}`);
export const accepted = (questId: QuestId): Condition => flagAtLeast(`evt:accept:${questId}`);
export const liberated = (regionId: string): Condition => flagAtLeast(`evt:liberate:${regionId}`);

export const questIs = (questId: QuestId, status: QuestStatus): Condition => ({ kind: 'quest', questId, status });
export const questAtLeast = (questId: QuestId, status: QuestStatus): Condition => ({ kind: 'questAtLeast', questId, status });

export const all = (...of: Condition[]): Condition => ({ kind: 'all', of });
export const any = (...of: Condition[]): Condition => ({ kind: 'any', of });
export const not = (of: Condition): Condition => ({ kind: 'not', of });
