/**
 * Campaign-scale selectors (rail, story graph, chains, clues, endings, township
 * upgrades) — framework-free, unit tested. Everything is derived from contract
 * data; nothing here knows about React or the store.
 */
import type {
  BuildingDef,
  ClueDef,
  Condition,
  EndingDef,
  HeroDef,
  HeroId,
  ItemId,
  QuestDef,
  QuestLog,
  QuestStatus,
  StoryNodeDef,
  WorldFlags,
} from '@/types/contracts';
import { QUEST_STATUS_ORDER } from '@/types/contracts';
import { statusOf, type Evaluate } from './questSelectors';

/* ════════════════════════════════════════════════════════════════════════
 * Party rail
 * ════════════════════════════════════════════════════════════════════════ */

export interface RailEntry {
  readonly heroId: HeroId;
  /** Locked iff not in the party. */
  readonly locked: boolean;
  readonly leader: boolean;
}

/** Lock rule: a hero is locked iff not in `party`. Party members first (party order), then locked heroes (roster order). */
export function railEntries(allHeroes: readonly HeroId[], party: readonly HeroId[], leader: HeroId): readonly RailEntry[] {
  const members = party.filter((h, i) => allHeroes.includes(h) && party.indexOf(h) === i);
  const locked = allHeroes.filter((h) => !members.includes(h));
  return [
    ...members.map((heroId) => ({ heroId, locked: false, leader: heroId === leader })),
    ...locked.map((heroId) => ({ heroId, locked: true, leader: false })),
  ];
}

export const isHeroLocked = (heroId: HeroId, party: readonly HeroId[]): boolean => !party.includes(heroId);

/** Heroes present in `next` but not in `prev` (recruit animation trigger). */
export function newlyJoined(prev: readonly HeroId[], next: readonly HeroId[]): readonly HeroId[] {
  return next.filter((h) => !prev.includes(h));
}

/** Who performs a field action: the leader if able, else the first party member who can (traversal auto-swap). */
export function performerFor(action: string, leader: HeroId, party: readonly HeroId[], heroes: Readonly<Record<HeroId, Pick<HeroDef, 'fieldActions'>>>): HeroId | null {
  const can = (h: HeroId): boolean => heroes[h]?.fieldActions.some((a) => a === action) ?? false;
  if (can(leader)) return leader;
  return party.find(can) ?? null;
}

/* ════════════════════════════════════════════════════════════════════════
 * Story graph
 * ════════════════════════════════════════════════════════════════════════ */

export interface StoryNodeView {
  readonly id: string;
  readonly questId: string;
  readonly act: number;
  /** Column index (one column per act, ascending). */
  readonly col: number;
  /** Row inside its column. */
  readonly row: number;
  readonly status: QuestStatus;
  /** "???" while the chapter's quest is still hidden. */
  readonly title: string;
  readonly regionId: string;
  readonly current: boolean;
}

export interface StoryEdgeView {
  readonly from: string;
  readonly to: string;
  /** Edge is "lit" once its source chapter is completed. */
  readonly lit: boolean;
}

export interface StoryGraphLayout {
  readonly acts: readonly number[];
  readonly nodes: readonly StoryNodeView[];
  readonly edges: readonly StoryEdgeView[];
  readonly rows: number;
}

export const HIDDEN_TITLE = '???';

export function layoutStoryGraph(nodes: readonly StoryNodeDef[], log: QuestLog): StoryGraphLayout {
  const acts = [...new Set(nodes.map((n) => n.act))].sort((a, b) => a - b);
  const rowCount: Record<number, number> = {};
  const views: StoryNodeView[] = nodes.map((n) => {
    const row = rowCount[n.act] ?? 0;
    rowCount[n.act] = row + 1;
    const status = statusOf(log, n.questId);
    return {
      id: n.id,
      questId: n.questId,
      act: n.act,
      col: acts.indexOf(n.act),
      row,
      status,
      title: status === 'HIDDEN' ? HIDDEN_TITLE : n.title,
      regionId: n.regionId,
      current: status === 'ACTIVE',
    };
  });
  const ids = new Set(nodes.map((n) => n.id));
  const edges: StoryEdgeView[] = [];
  for (const n of nodes) {
    for (const to of n.next) {
      if (ids.has(to)) edges.push({ from: n.id, to, lit: statusOf(log, n.questId) === 'COMPLETED' });
    }
  }
  return { acts, nodes: views, edges, rows: Math.max(0, ...Object.values(rowCount)) };
}

/* ════════════════════════════════════════════════════════════════════════
 * Personal quest chains
 * ════════════════════════════════════════════════════════════════════════ */

export interface ChainStageView {
  readonly quest: QuestDef;
  readonly stage: number;
  readonly status: QuestStatus;
}

export interface ChainView {
  readonly chainId: string;
  readonly title: string;
  readonly of: number;
  readonly companion?: HeroId;
  readonly stages: readonly ChainStageView[];
  /** Stage currently in play (highest non-hidden stage), or null if none visible. */
  readonly current: ChainStageView | null;
  readonly completedStages: number;
  readonly complete: boolean;
}

/** All chains in data, grouped by `chain.id`, stages ascending. */
export function groupChains(quests: readonly QuestDef[], log: QuestLog): readonly ChainView[] {
  const byId = new Map<string, QuestDef[]>();
  for (const q of quests) {
    if (!q.chain) continue;
    const list = byId.get(q.chain.id) ?? [];
    list.push(q);
    byId.set(q.chain.id, list);
  }
  const out: ChainView[] = [];
  for (const [chainId, list] of byId) {
    const sorted = [...list].sort((a, b) => (a.chain?.stage ?? 0) - (b.chain?.stage ?? 0));
    const stages = sorted.map((quest) => ({ quest, stage: quest.chain?.stage ?? 0, status: statusOf(log, quest.id) }));
    const first = sorted[0];
    const of = Math.max(stages.length, ...sorted.map((q) => q.chain?.of ?? 0));
    const visible = stages.filter((s) => s.status !== 'HIDDEN');
    const completedStages = stages.filter((s) => s.status === 'COMPLETED').length;
    const companion = sorted.find((q) => q.companion)?.companion;
    out.push({
      chainId,
      title: first?.chain?.title ?? chainId,
      of,
      ...(companion ? { companion } : {}),
      stages,
      current: visible[visible.length - 1] ?? null,
      completedStages,
      complete: completedStages >= of && of > 0,
    });
  }
  return out;
}

/** Chains with at least one visible stage. */
export const visibleChains = (chains: readonly ChainView[]): readonly ChainView[] => chains.filter((c) => c.current !== null);

export function chainStageLabel(c: ChainView): string {
  if (c.complete) return `Complete · ${c.of}/${c.of}`;
  return `Stage ${c.current?.stage ?? 0}/${c.of}`;
}

/* ════════════════════════════════════════════════════════════════════════
 * Clue board
 * ════════════════════════════════════════════════════════════════════════ */

export interface ClueCard {
  readonly clue: ClueDef;
  readonly found: boolean;
  readonly regionName: string;
}

export interface ClueBoard {
  readonly cards: readonly ClueCard[];
  readonly found: number;
  readonly total: number;
}

/** Found clues first (authored order), then silhouettes; `foundIds` comes from the store's `foundClues`. */
export function clueBoard(clues: readonly ClueDef[], foundIds: ReadonlySet<string>, regionName: (id: string) => string): ClueBoard {
  const cards = clues.map((clue) => ({ clue, found: foundIds.has(clue.id), regionName: regionName(clue.regionId) }));
  const sorted = [...cards.filter((c) => c.found), ...cards.filter((c) => !c.found)];
  return { cards: sorted, found: cards.filter((c) => c.found).length, total: clues.length };
}

/* ════════════════════════════════════════════════════════════════════════
 * Ending progress
 * ════════════════════════════════════════════════════════════════════════ */

export type RequirementKind = 'clue' | 'hero' | 'chain' | 'quest' | 'flag' | 'other';

export interface RequirementLine {
  readonly kind: RequirementKind;
  readonly text: string;
  readonly met: boolean;
  /** For counted requirements. */
  readonly have?: number;
  readonly need?: number;
}

export interface EndingMetric {
  readonly id: 'clues' | 'heroes' | 'chains';
  readonly label: string;
  readonly have: number;
  /** Needed by the true ending (derived from its condition), else the total. */
  readonly need: number;
  readonly total: number;
}

export interface EndingProgress {
  readonly trueEnding: EndingDef | null;
  readonly metrics: readonly EndingMetric[];
  readonly requirements: readonly RequirementLine[];
  readonly met: boolean;
}

export interface CampaignData {
  readonly endings: readonly EndingDef[];
  readonly clues: readonly ClueDef[];
  readonly quests: readonly QuestDef[];
  readonly heroes: Readonly<Record<HeroId, HeroDef>>;
}

/** The "true" ending: the one with the highest priority. */
export function trueEndingOf(endings: readonly EndingDef[]): EndingDef | null {
  return [...endings].sort((a, b) => b.priority - a.priority)[0] ?? null;
}

interface Classifier {
  readonly clueFlags: ReadonlySet<string>;
  readonly clueIds: ReadonlySet<string>;
  readonly joinQuests: ReadonlyMap<string, HeroId>;
  readonly chainFinals: ReadonlyMap<string, string>;
  readonly questTitles: ReadonlyMap<string, string>;
}

function classifier(data: CampaignData): Classifier {
  const joinQuests = new Map<string, HeroId>();
  for (const h of Object.values(data.heroes)) if (h.joinQuest) joinQuests.set(h.joinQuest, h.id);
  const chainFinals = new Map<string, string>();
  for (const q of data.quests) if (q.chain && q.chain.stage >= q.chain.of) chainFinals.set(q.id, q.chain.title);
  return {
    clueFlags: new Set(data.clues.map((c) => `clue:${c.id}`)),
    clueIds: new Set(data.clues.map((c) => c.id)),
    joinQuests,
    chainFinals,
    questTitles: new Map(data.quests.map((q) => [q.id, q.title])),
  };
}

function leafKind(c: Condition, k: Classifier): RequirementKind {
  switch (c.kind) {
    case 'flag':
      if (k.clueFlags.has(c.key) || c.key.startsWith('clue:') || /clue/i.test(c.key)) return 'clue';
      if (c.key.startsWith('evt:recruit:')) return 'hero';
      return 'flag';
    case 'quest':
    case 'questAtLeast':
      if (k.joinQuests.has(c.questId)) return 'hero';
      if (k.chainFinals.has(c.questId)) return 'chain';
      return 'quest';
    default:
      return 'other';
  }
}

/** Category shared by all leaves of a condition (or 'other' when mixed). */
function uniformKind(c: Condition, k: Classifier): RequirementKind {
  if (c.kind === 'all' || c.kind === 'any' || c.kind === 'count') {
    const kinds = new Set(c.of.map((x) => uniformKind(x, k)));
    const [only] = [...kinds];
    return kinds.size === 1 && only ? only : 'other';
  }
  if (c.kind === 'not') return 'other';
  return leafKind(c, k);
}

const KIND_NOUN: Readonly<Record<RequirementKind, string>> = {
  clue: 'clues found',
  hero: 'heroes recruited',
  chain: 'personal chains complete',
  quest: 'chapters',
  flag: 'deeds',
  other: 'conditions',
};

function humanizeFlag(key: string): string {
  const tail = key.split(':').pop() ?? key;
  return tail
    .replace(/[._-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .trim();
}

function describe(c: Condition, k: Classifier, heroName: (id: HeroId) => string): string {
  switch (c.kind) {
    case 'always':
      return 'Always';
    case 'flag':
      if (k.clueFlags.has(c.key)) return `Clue: ${humanizeFlag(c.key)}`;
      if (c.atLeast !== undefined) return `${humanizeFlag(c.key)} ≥ ${c.atLeast}`;
      return humanizeFlag(c.key);
    case 'quest':
    case 'questAtLeast': {
      const hero = k.joinQuests.get(c.questId);
      if (hero) return `Recruit ${heroName(hero)}`;
      const chain = k.chainFinals.get(c.questId);
      if (chain) return `Complete “${chain}”`;
      const title = k.questTitles.get(c.questId) ?? c.questId;
      return c.status === 'COMPLETED' ? `Complete “${title}”` : `“${title}” ${c.status.toLowerCase()}`;
    }
    case 'not':
      return `Not: ${describe(c.of, k, heroName)}`;
    case 'any':
      return c.of.map((x) => describe(x, k, heroName)).join(' or ');
    case 'all':
      return c.of.map((x) => describe(x, k, heroName)).join(' and ');
    case 'count': {
      const kind = uniformKind(c, k);
      return `${c.atLeast} of ${c.of.length} ${KIND_NOUN[kind]}`;
    }
  }
}

/** Flatten the top-level `all` of a condition into checklist lines. */
export function requirementLines(cond: Condition, data: CampaignData, flags: WorldFlags, log: QuestLog, evaluate: Evaluate): readonly RequirementLine[] {
  const k = classifier(data);
  const heroName = (id: HeroId): string => data.heroes[id]?.name ?? id;
  const parts = cond.kind === 'all' ? cond.of : [cond];
  return parts.map((c) => {
    const kind = uniformKind(c, k);
    const met = evaluate(c, flags, log);
    if (c.kind === 'count') {
      const have = c.of.filter((x) => evaluate(x, flags, log)).length;
      return { kind, text: describe(c, k, heroName), met, have, need: c.atLeast };
    }
    return { kind, text: describe(c, k, heroName), met };
  });
}

/** How many of a category the condition needs (from `count` nodes or counted leaves), or null if it never mentions it. */
export function neededOfKind(cond: Condition, kind: RequirementKind, data: CampaignData): number | null {
  const k = classifier(data);
  const walk = (c: Condition): number | null => {
    if (c.kind === 'count') {
      if (uniformKind(c, k) === kind) return c.atLeast;
      const sub = c.of.map(walk).filter((n): n is number => n !== null);
      return sub.length ? Math.max(...sub) : null;
    }
    if (c.kind === 'all') {
      const sub = c.of.map(walk).filter((n): n is number => n !== null);
      return sub.length ? sub.reduce((a, b) => a + b, 0) : null;
    }
    if (c.kind === 'any') {
      const sub = c.of.map(walk).filter((n): n is number => n !== null);
      return sub.length ? Math.min(...sub) : null;
    }
    if (c.kind === 'not') return null;
    if (c.kind === 'flag' && kind === 'clue' && leafKind(c, k) === 'clue' && !k.clueFlags.has(c.key) && c.atLeast !== undefined) {
      return c.atLeast; // aggregate counter flag, e.g. `clues.found ≥ 8`
    }
    return leafKind(c, k) === kind ? 1 : null;
  };
  return walk(cond);
}

/** Distinct chain ids and how many are complete (every stage COMPLETED). */
export function chainCompletion(quests: readonly QuestDef[], log: QuestLog): { readonly complete: number; readonly total: number } {
  const chains = groupChains(quests, log);
  return { complete: chains.filter((c) => c.complete).length, total: chains.length };
}

export function endingProgress(
  data: CampaignData,
  state: { readonly flags: WorldFlags; readonly log: QuestLog; readonly party: readonly HeroId[] },
  foundClueCount: number,
  evaluate: Evaluate,
): EndingProgress {
  const trueEnding = trueEndingOf(data.endings);
  const heroTotal = Object.keys(data.heroes).length;
  const chains = chainCompletion(data.quests, state.log);
  const need = (kind: RequirementKind, total: number): number => {
    const n = trueEnding ? neededOfKind(trueEnding.when, kind, data) : null;
    return Math.min(total, n ?? total);
  };
  const metrics: EndingMetric[] = [
    { id: 'clues', label: 'Clues', have: foundClueCount, need: need('clue', data.clues.length), total: data.clues.length },
    { id: 'heroes', label: 'Heroes', have: state.party.length, need: need('hero', heroTotal), total: heroTotal },
    { id: 'chains', label: 'Chains', have: chains.complete, need: need('chain', chains.total), total: chains.total },
  ];
  const requirements = trueEnding ? requirementLines(trueEnding.when, data, state.flags, state.log, evaluate) : [];
  const met = trueEnding ? evaluate(trueEnding.when, state.flags, state.log) : false;
  return { trueEnding, metrics, requirements, met };
}

/* ════════════════════════════════════════════════════════════════════════
 * Township architectural upgrades
 * ════════════════════════════════════════════════════════════════════════ */

export interface CostPart {
  readonly key: string;
  readonly label: string;
  readonly have: number;
  readonly need: number;
  readonly ok: boolean;
}

export interface CostView {
  readonly parts: readonly CostPart[];
  readonly affordable: boolean;
  /** One-line text, e.g. "◉ 120/80 · Timber 2/4". */
  readonly text: string;
}

export function costView(
  cost: { readonly coin: number; readonly items: readonly { readonly itemId: ItemId; readonly qty: number }[] },
  coin: number,
  inventory: Readonly<Record<ItemId, number>>,
  itemName: (id: ItemId) => string,
): CostView {
  const parts: CostPart[] = [];
  if (cost.coin > 0) parts.push({ key: 'coin', label: '◉', have: coin, need: cost.coin, ok: coin >= cost.coin });
  for (const it of cost.items) {
    const have = inventory[it.itemId] ?? 0;
    parts.push({ key: it.itemId, label: itemName(it.itemId), have, need: it.qty, ok: have >= it.qty });
  }
  const text = parts.length === 0 ? 'Free' : parts.map((p) => `${p.label} ${p.have}/${p.need}`).join(' · ');
  return { parts, affordable: parts.every((p) => p.ok), text };
}

export type UpgradeStepState = 'done' | 'current' | 'next' | 'future';

export interface UpgradeStep {
  readonly level: number;
  readonly name: string;
  readonly perk: string;
  readonly description: string;
  readonly propScale: number;
  readonly state: UpgradeStepState;
  readonly requirementText?: string;
  readonly cost?: { readonly coin: number; readonly items: readonly { readonly itemId: ItemId; readonly qty: number }[] };
}

/** Level 1 (the building itself) → each upgrade, marked done / current / next / future. */
export function upgradeTimeline(building: BuildingDef, level: number): readonly UpgradeStep[] {
  const cur = Math.max(1, level);
  const mark = (l: number): UpgradeStepState => (l < cur ? 'done' : l === cur ? 'current' : l === cur + 1 ? 'next' : 'future');
  const base: UpgradeStep = { level: 1, name: building.name, perk: building.perk, description: building.description, propScale: 1, state: mark(1) };
  const ups = [...(building.upgrades ?? [])]
    .sort((a, b) => a.level - b.level)
    .map((u) => ({
      level: u.level,
      name: u.name,
      perk: u.perk,
      description: u.description,
      propScale: u.propScale,
      state: mark(u.level),
      cost: u.cost,
      ...(u.requirementText ? { requirementText: u.requirementText } : {}),
    }));
  return [base, ...ups];
}

/** Prop scale at a level (largest upgrade ≤ level, 1 when none). */
export function propScaleAt(building: BuildingDef, level: number): number {
  const reached = (building.upgrades ?? []).filter((u) => u.level <= level).sort((a, b) => b.level - a.level)[0];
  return reached?.propScale ?? 1;
}

export const maxLevelOf = (building: BuildingDef): number => Math.max(1, ...(building.upgrades ?? []).map((u) => u.level));

/** Rank used to colour statuses consistently. */
export const statusRank = (s: QuestStatus): number => QUEST_STATUS_ORDER.indexOf(s);
