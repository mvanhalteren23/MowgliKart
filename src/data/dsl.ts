/**
 * Authoring helpers for campaign content. Pure data builders — no logic beyond arithmetic.
 */
import { CHUNK_SIZE } from '@/types/contracts';
import type {
  Affinities, BiomeChunkDef, ConsumableDef, DialogueChoice, DialogueDef, EncounterDef, EncounterZoneDef, EnemyDef,
  FishDef, FishingSpotDef, Condition, NpcDef, ObjectiveDef, PropDef, QuestDef, QuestStatus, RegionDef, SkillId,
  SpeciesDef, Stats, TraversalGateDef, Vec2, WorldEvent, WorldMapDef,
} from '@/types/contracts';

/** Local (0..250) → world coordinates for chunk (cx, cz). */
export const chunkAt = (cx: number, cz: number) => (lx: number, lz: number): Vec2 => ({ x: cx * CHUNK_SIZE + lx, z: cz * CHUNK_SIZE + lz });

/** Everything one chunk contributes to the database. */
export interface ChapterContent {
  readonly chunk: BiomeChunkDef;
  readonly regions: readonly RegionDef[];
  readonly props: readonly PropDef[];
  readonly npcs: readonly NpcDef[];
  readonly zones: readonly EncounterZoneDef[];
  readonly spots: readonly FishingSpotDef[];
  readonly paths: WorldMapDef['paths'];
  readonly water: WorldMapDef['water'];
  readonly gates: readonly TraversalGateDef[];
  readonly dialogues: Readonly<Record<string, DialogueDef>>;
  readonly quests: readonly QuestDef[];
  readonly enemies: Readonly<Record<string, EnemyDef>>;
  readonly encounters: Readonly<Record<string, EncounterDef>>;
  readonly species: Readonly<Record<string, SpeciesDef>>;
  readonly fish: Readonly<Record<string, FishDef>>;
  readonly items: Readonly<Record<string, ConsumableDef>>;
}

/* ── dialogue ──────────────────────────────────────────────────────────── */

export type Line = readonly [speaker: string, text: string];

export function dlg(
  id: string,
  lines: readonly Line[],
  extra: { readonly onEnd?: readonly WorldEvent[]; readonly choices?: readonly DialogueChoice[]; readonly startsEncounter?: string } = {},
): DialogueDef {
  return { id, lines: lines.map(([speaker, text]) => ({ speaker, text })), ...extra };
}

export const byId = <T extends { readonly id: string }>(defs: readonly T[]): Record<string, T> =>
  Object.fromEntries(defs.map((d) => [d.id, d]));

export const setFlag = (key: string, value: boolean | number | string = true): WorldEvent => ({ type: 'setFlag', key, value });
export const acceptEv = (questId: string): WorldEvent => ({ type: 'acceptQuest', questId });
export const acceptChoice = (questId: string, label: string, decline = 'Not yet.'): readonly DialogueChoice[] => [
  { id: 'accept', label, events: [acceptEv(questId)] },
  { id: 'later', label: decline },
];

export function npc(
  id: string, name: string, role: string, sprite: string, position: Vec2,
  dialogues: readonly (readonly [Condition, string])[],
  extra: { readonly presentWhen?: Condition; readonly hiddenUntilDrakeSight?: boolean } = {},
): NpcDef {
  return { id, name, role, sprite, position, dialogues: dialogues.map(([when, dialogueId]) => ({ when, dialogueId })), ...extra };
}

/* ── quests ────────────────────────────────────────────────────────────── */

export const chron = (discovered: string, active: string, completed: string): Readonly<Record<QuestStatus, string>> => ({
  HIDDEN: '', DISCOVERED: discovered, ACTIVE: active, COMPLETED: completed,
});

export function obj(id: string, text: string, completeWhen: Condition, marker?: Vec2, revealWhen?: Condition): ObjectiveDef {
  return { id, text, completeWhen, ...(marker ? { marker } : {}), ...(revealWhen ? { revealWhen } : {}) };
}

/* ── world ─────────────────────────────────────────────────────────────── */

export const prop = (kind: PropDef['kind'], position: Vec2, extra: Omit<PropDef, 'kind' | 'position'> = {}): PropDef => ({ kind, position, ...extra });

export function gate(
  id: string, kind: TraversalGateDef['kind'], label: string, position: Vec2, sides: readonly [Vec2, Vec2],
  extra: { readonly width?: number; readonly depth?: number; readonly rotation?: number; readonly permanent?: boolean } = {},
): TraversalGateDef {
  const permanent = extra.permanent ?? (kind === 'boulder' || kind === 'ward' || kind === 'grove');
  return {
    id, kind, label, position, sides,
    width: extra.width ?? 8, depth: extra.depth ?? 3,
    ...(extra.rotation !== undefined ? { rotation: extra.rotation } : {}),
    clearsPermanently: permanent,
  };
}

/* ── enemies ───────────────────────────────────────────────────────────── */

export type Role = 'brute' | 'caster' | 'skirmisher' | 'tank' | 'boss' | 'bossCaster';

const ROLE: Readonly<Record<Role, Readonly<Partial<Record<keyof Stats, number>>>>> = {
  brute: { maxHp: 1.25, atk: 1.15, def: 1.05, mag: 0.4, res: 0.85 },
  caster: { maxHp: 0.85, atk: 0.6, def: 0.8, mag: 1.2, res: 1.25 },
  skirmisher: { maxHp: 0.9, atk: 1.05, def: 0.9, mag: 0.5, spd: 1.3, luck: 1.2 },
  tank: { maxHp: 1.2, atk: 0.95, def: 1.45, mag: 0.4, res: 1.1, spd: 0.7 },
  boss: { maxHp: 2.6, atk: 1.12, def: 1.1, mag: 0.8, res: 1.05, spd: 1.05, maxAp: 1.6 },
  bossCaster: { maxHp: 2.4, atk: 0.8, def: 1.0, mag: 1.2, res: 1.25, spd: 1.05, maxAp: 1.8 },
};

/**
 * Level-scaled enemy. Base curve (multiplied by role):
 *   hp 30+10L · atk 6+1.7L · def 5+1.2L · mag 6+1.7L · res 5+1.2L · spd 8+0.6L · luck 4+0.3L · ap 10+L.
 * With the party's growth this keeps fights at 3–6 rounds from level 2 to 35.
 */
export function foe(
  id: string, name: string, sprite: string, level: number, role: Role,
  o: { readonly affinities?: Affinities; readonly skills: readonly SkillId[]; readonly drops: readonly { readonly itemId: string; readonly chance: number }[]; readonly skillBias?: number },
): EnemyDef {
  const m = ROLE[role];
  const base: Stats = {
    maxHp: 30 + 10 * level, maxAp: 10 + level, atk: 6 + 1.7 * level, def: 5 + 1.2 * level,
    mag: 6 + 1.7 * level, res: 5 + 1.2 * level, spd: 8 + 0.6 * level, luck: 4 + 0.3 * level,
  };
  const stat = (k: keyof Stats): number => Math.round(base[k] * (m[k] ?? 1));
  const isBoss = role === 'boss' || role === 'bossCaster';
  return {
    id, name, sprite, level,
    stats: {
      maxHp: stat('maxHp'), maxAp: stat('maxAp'), atk: stat('atk'), def: stat('def'),
      mag: stat('mag'), res: stat('res'), spd: stat('spd'), luck: stat('luck'),
    },
    affinities: o.affinities ?? {},
    skills: o.skills,
    xp: Math.round((8 + 6 * level) * (isBoss ? 4 : 1)),
    coin: Math.round((3 + 2 * level) * (isBoss ? 4 : 1)),
    drops: o.drops,
    skillBias: o.skillBias ?? (role === 'caster' || role === 'bossCaster' ? 0.6 : 0.4),
  };
}

export const material = (id: string, name: string, description: string, icon: string, value: number): ConsumableDef => ({
  id, name, description, icon, kind: 'material', potency: 0, value,
});
export const catchItem = (id: string, name: string, description: string, potency: number, value: number, icon = '🐟'): ConsumableDef => ({
  id, name, description, icon, kind: 'catch', potency, value,
});
export const keyItem = (id: string, name: string, description: string, icon = '🗝️'): ConsumableDef => ({
  id, name, description, icon, kind: 'key', potency: 0, value: 0,
});
