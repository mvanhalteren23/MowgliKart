/**
 * EMBERWAKE — shared contracts.
 *
 * Single source of truth uniting `core` (simulation), `engine` (HD-2D renderer),
 * `ui` (mobile HUD) and `data`/`systems` (content + world rules).
 *
 * Rules:
 *  - Type-only module (plus a few frozen literal tables). No runtime dependencies.
 *  - Everything is `readonly`. State transitions return new objects.
 *  - Modules never import each other directly; they meet here, in the Zustand
 *    store (`src/app/store.ts`) and on the runtime bus (`src/app/runtime.ts`).
 */

/* ════════════════════════════════════════════════════════════════════════
 * 1. Identifiers
 * ════════════════════════════════════════════════════════════════════════ */

export const HERO_IDS = ['kael', 'tobin', 'vesna', 'orla', 'hadrik', 'pim', 'quill', 'moss', 'sable'] as const;
export type HeroId = (typeof HERO_IDS)[number];

export const SPIRIT_IDS = ['ashka', 'mirelle', 'zephra', 'tor', 'lumen', 'nyx'] as const;
export type SpiritId = (typeof SPIRIT_IDS)[number];

export const ELEMENTS = ['physical', 'fire', 'water', 'wind', 'earth', 'holy', 'shadow', 'lightning', 'ice'] as const;
export type Element = (typeof ELEMENTS)[number];

export type DragonFormId = string;
export type SkillId = string;
export type EnemyId = string;
export type EncounterId = string;
export type GearId = string;
export type ItemId = string;
export type QuestId = string;
export type ObjectiveId = string;
export type NpcId = string;
export type RegionId = string;
export type BuildingId = string;
export type PlotId = string;
export type SpeciesId = string;
export type FishId = string;
export type FishingSpotId = string;
export type DialogueId = string;
export type CombatHookId = string;
export type CombatantId = string;
/** Key into the procedural asset library (see `AssetLibrary`). */
export type SpriteSheetId = string;

/* ════════════════════════════════════════════════════════════════════════
 * 2. Math & stats
 * ════════════════════════════════════════════════════════════════════════ */

/** World-space ground position in metres. +x east, +z south. y is sampled from the heightmap. */
export interface Vec2 {
  readonly x: number;
  readonly z: number;
}

export interface Stats {
  readonly maxHp: number;
  readonly maxAp: number;
  readonly atk: number;
  readonly def: number;
  readonly mag: number;
  readonly res: number;
  readonly spd: number;
  readonly luck: number;
}
export type StatKey = keyof Stats;
export type StatBlock = Partial<Stats>;

/** Element → damage-taken multiplier (1 = neutral, <1 resist, >1 weak, 0 immune). */
export type Affinities = Readonly<Partial<Record<Element, number>>>;

/* ════════════════════════════════════════════════════════════════════════
 * 3. Heroes, skills, dragon forms
 * ════════════════════════════════════════════════════════════════════════ */

export type FieldActionId =
  | 'fish'
  | 'drakeSight'
  | 'huntShot'
  | 'huntDash'
  /** Traversal actions: each clears one `TraversalGateKind` (see `TRAVERSAL_FOR_GATE`). */
  | 'roll'
  | 'glide'
  | 'grapple'
  | 'leap'
  | 'commune'
  | 'unseal'
  | 'none';

/**
 * Overworld obstacles that block the open world until the right leader clears them.
 *  boulder → roll (smash through)      chasm → glide (cross a gap on the wind)
 *  cliff   → grapple (pull up a ledge) river → leap (bound across water / lily-stones)
 *  grove   → commune (the forest parts) ward  → unseal (dispel a Covenant seal)
 */
export type TraversalGateKind = 'boulder' | 'chasm' | 'cliff' | 'river' | 'grove' | 'ward';
export const TRAVERSAL_FOR_GATE: Readonly<Record<TraversalGateKind, FieldActionId>> = {
  boulder: 'roll',
  chasm: 'glide',
  cliff: 'grapple',
  river: 'leap',
  grove: 'commune',
  ward: 'unseal',
};

export interface FieldActionDef {
  readonly id: FieldActionId;
  readonly label: string;
  /** Emoji / short glyph used by the HUD button. */
  readonly glyph: string;
  readonly description: string;
  readonly cooldownSec: number;
  /**
   * Effective radius or range in metres (meaning depends on the action):
   * huntShot = max arrow range at full draw; huntDash = strike radius at the dash end (dash length is 8 m);
   * drakeSight = reveal radius; traversal actions = how close (m) the leader must be to the gate.
   */
  readonly range: number;
  /** Set on traversal actions: the gate kind this action clears. */
  readonly clears?: TraversalGateKind;
}

export interface HeroDef {
  readonly id: HeroId;
  readonly name: string;
  readonly title: string;
  readonly blurb: string;
  /**
   * Has full playable content. Being playable does not mean being in the party: heroes outside
   * `db.start.party` join through a `{ type: 'hero' }` quest reward (see `joinQuest`).
   * Non-party heroes appear greyed (locked) in the hot-swap rail.
   */
  readonly playable: boolean;
  /** Quest whose completion recruits this hero (absent for starting members). */
  readonly joinQuest?: QuestId;
  /** Chain id of this hero's personal multi-stage quest line (see `QuestDef.chain`). */
  readonly personalChain?: string;
  readonly sprite: SpriteSheetId;
  readonly accent: string; // CSS colour
  readonly baseStats: Stats; // at level 1
  readonly growth: Stats; // added per level
  readonly affinities: Affinities;
  readonly skills: readonly { readonly skillId: SkillId; readonly level: number }[];
  /** Primary + optional secondary overworld action (e.g. Kael: fish + drakeSight). */
  readonly fieldActions: readonly FieldActionId[];
  /** Spirits this hero can host. Empty = cannot fuse. */
  readonly fusionAffinity: readonly SpiritId[];
  /** Dragon forms unlocked by level; only the drake-blooded have any. */
  readonly dragonForms: readonly { readonly formId: DragonFormId; readonly level: number }[];
}

export type SkillTarget = 'enemy' | 'allEnemies' | 'ally' | 'allAllies' | 'self';
export type StatusId = 'burn' | 'soak' | 'stun' | 'guardUp' | 'atkUp' | 'defDown' | 'regen';

export interface StatusInstance {
  readonly id: StatusId;
  readonly turns: number;
  readonly potency: number;
}

export interface SkillDef {
  readonly id: SkillId;
  readonly name: string;
  readonly description: string;
  readonly apCost: number;
  readonly target: SkillTarget;
  readonly element: Element;
  /** 'physical' scales atk vs def; 'magical' scales mag vs res; 'heal' restores HP from mag. */
  readonly kind: 'physical' | 'magical' | 'heal' | 'support';
  /** Damage/heal multiplier on the scaling stat. */
  readonly power: number;
  readonly inflicts?: { readonly status: StatusId; readonly chance: number; readonly turns: number; readonly potency: number };
  /** Sync gained by a drake-blooded user when this lands. */
  readonly syncGain?: number;
  /** Heavy skills open a quick-time window before resolving (see `QteSpec`). */
  readonly qte?: QteSpec;
}

/**
 * Multi-turn Dragon Transformation.
 *  - Sync (0..100) builds from acting/being hit; a form needs `syncRequired` to enter.
 *  - Entering costs `apCostToEnter`; each of the actor's turns in form drains `apDrainPerTurn`.
 *  - The form ends when AP cannot pay the drain, when `maxTurns` elapse, or on manual revert.
 *  - On revert Sync resets to 0 (not the AP pool) — forms are sustained, not one-shot nukes.
 */
export interface DragonFormDef {
  readonly id: DragonFormId;
  readonly name: string;
  readonly element: Element;
  readonly sprite: SpriteSheetId;
  readonly syncRequired: number;
  readonly apCostToEnter: number;
  readonly apDrainPerTurn: number;
  readonly maxTurns: number;
  /** Form is only usable when this world flag is truthy (passed in via `EncounterSetup.flags`). */
  readonly requiresFlag?: string;
  /** The apex form: shown last, typically gated by `requiresFlag` from the Act III story. */
  readonly apex?: boolean;
  /** Multipliers applied to effective stats while in form (after gear + fusion). */
  readonly statMultipliers: StatBlock;
  readonly affinities: Affinities;
  /** Skills that replace the hero's list while transformed. */
  readonly skills: readonly SkillId[];
}

export interface DragonState {
  readonly formId: DragonFormId;
  readonly turnsInForm: number;
}

/* ════════════════════════════════════════════════════════════════════════
 * 4. Warden (spirit) fusion — Decorator pattern
 * ════════════════════════════════════════════════════════════════════════ */

/**
 * A spirit is a decorator over a `FusedProfile`. Fusing [a, b] yields
 * `b.decorate(a.decorate(base))` — order matters and each layer is inspectable.
 * Data supplies the numbers; `core` supplies the decorator classes.
 */
export interface SpiritDef {
  readonly id: SpiritId;
  readonly name: string;
  readonly element: Element;
  readonly epithet: string;
  readonly description: string;
  /** Available in the vertical slice. */
  readonly awakened: boolean;
  readonly auraColor: string; // CSS hex, drives the resonance aura shader
  /** Multiplicative stat layer (1.2 = +20 %). Applied first. */
  readonly statMultipliers: StatBlock;
  /** Flat stat layer. Applied after multipliers of the same layer. */
  readonly statBonuses: StatBlock;
  /** Affinity layer, multiplied into the host's affinities. */
  readonly affinities: Affinities;
  /** Skills granted while fused. */
  readonly grantsSkills: readonly SkillId[];
  /** Element imbued on basic attacks by the outermost layer. */
  readonly imbue: Element;
  /** Contribution to the fusion's armor pool (see `FusionState`). */
  readonly armor: number;
  /** Named resonances with other spirits when both are in the stack. */
  readonly resonance?: readonly { readonly with: SpiritId; readonly name: string; readonly statMultipliers: StatBlock }[];
}

/** The fully composed result of the decorator chain. */
export interface FusedProfile {
  readonly heroId: HeroId;
  readonly spirits: readonly SpiritId[];
  /** Display name, e.g. "Kael · Ashka-bound". */
  readonly title: string;
  readonly stats: Stats;
  readonly affinities: Affinities;
  readonly skills: readonly SkillId[];
  readonly basicAttackElement: Element;
  readonly armorMax: number;
  readonly auraColors: readonly string[];
  /** Active resonance names (for the Synergy Inspector). */
  readonly resonances: readonly string[];
  /** One human-readable line per decorator layer, innermost first. */
  readonly layers: readonly string[];
}

/**
 * Runtime fusion state on a combatant.
 * "Armor Break" replaces permanent loss: damage taken chips `armor`; at 0 the
 * fusion is *suppressed* (`broken`) for `brokenTurns` of the host's turns —
 * the host fights with base stats — then re-forms with full armor.
 */
export interface FusionState {
  readonly spirits: readonly SpiritId[];
  readonly armor: number;
  readonly armorMax: number;
  readonly broken: boolean;
  readonly brokenTurns: number;
}

/** Host turns a broken fusion stays suppressed. */
export const FUSION_BREAK_TURNS = 2;
/** Max spirits in one fusion stack. */
export const FUSION_MAX_STACK = 2;

/* ════════════════════════════════════════════════════════════════════════
 * 5. Gear — dual archetype
 * ════════════════════════════════════════════════════════════════════════ */

export type GearSlot = 'weapon' | 'armor' | 'relic' | 'signature';

interface GearBase {
  readonly id: GearId;
  readonly name: string;
  readonly slot: GearSlot;
  readonly description: string;
  readonly flavor?: string;
  readonly stats: StatBlock;
  /** If set, only this hero can equip it. */
  readonly boundHero?: HeroId;
  readonly icon: string; // glyph
}

export interface StandardGearDef extends GearBase {
  readonly archetype: 'standard';
}

export type ScalingCurve = 'linear' | 'sqrt' | 'log';

/**
 * Progression-Scaling Relic: bonus = base stats
 *   + perLevel × curve(level − 1)
 *   + perLiberatedRegion × liberatedRegions
 * each stat clamped by `cap` (if present). Values are floored to integers.
 */
export interface RelicGearDef extends GearBase {
  readonly archetype: 'relic';
  readonly scaling: {
    readonly perLevel: StatBlock;
    readonly levelCurve: ScalingCurve;
    readonly perLiberatedRegion: StatBlock;
    readonly cap?: StatBlock;
  };
}

/** Build-Altering Signature item: injects a passive combat hook implemented in `core`. */
export interface SignatureGearDef extends GearBase {
  readonly archetype: 'signature';
  readonly hookId: CombatHookId;
  /** Tunables forwarded to the hook (e.g. `{ chance: 0.5, power: 1.2 }`). */
  readonly hookParams: Readonly<Record<string, number>>;
  /** One-line rules text shown in the Synergy Inspector. */
  readonly hookText: string;
}

export type GearDef = StandardGearDef | RelicGearDef | SignatureGearDef;

export type Loadout = Readonly<Partial<Record<GearSlot, GearId>>>;

export interface ProgressionContext {
  readonly level: number;
  readonly liberatedRegions: number;
}

export type CombatHookTrigger = 'onTurnStart' | 'onBeforeDamage' | 'onDamaged' | 'onAttackLanded' | 'onKill' | 'onGuard';

/** Describes a registered hook for UI purposes; behaviour lives in `core`. */
export interface CombatHookInfo {
  readonly id: CombatHookId;
  readonly trigger: CombatHookTrigger;
  readonly name: string;
}

/** Hook ids the core registry MUST implement for the slice. */
export const HOOK_COUNTER_ATTACK: CombatHookId = 'hook.counterAttack';

/**
 * Every hook the core registry MUST implement for the full campaign. Signature gear
 * references these ids; params are forwarded from `SignatureGearDef.hookParams`.
 *  counterAttack  onDamaged      chance, power — basic-attack counter after a single-target physical hit (never chains).
 *  dragonSurge    onTurnStart    sync, ap      — while transformed: +sync and refund AP each turn.
 *  markedQuarry   onAttackLanded chance, turns, potency — apply `defDown` to the target.
 *  mendingEcho    onTurnStart    fraction      — heal the lowest-HP-fraction living ally by fraction × owner maxHp.
 *  bulwark        onGuard        armor, turns, potency — gain `guardUp` and grant `guardUp` to all allies for `turns`.
 *  pilfer         onAttackLanded chance, coin  — steal: add `coin` to the encounter's coin reward (once per enemy).
 *  spellEcho      onAttackLanded chance, power — after a magical skill lands, repeat it once at `power`× (never chains).
 *  rootbind       onDamaged      chance, turns — stun the attacker for `turns`.
 *  reap           onKill         ap, potency, turns — restore `ap` and gain `atkUp`.
 */
export const HOOK_IDS = {
  counterAttack: 'hook.counterAttack',
  dragonSurge: 'hook.dragonSurge',
  markedQuarry: 'hook.markedQuarry',
  mendingEcho: 'hook.mendingEcho',
  bulwark: 'hook.bulwark',
  pilfer: 'hook.pilfer',
  spellEcho: 'hook.spellEcho',
  rootbind: 'hook.rootbind',
  reap: 'hook.reap',
} as const satisfies Record<string, CombatHookId>;
/** Params: `chance` (0..1), `power` (multiplier of a basic attack). Trigger: onDamaged by an enemy's single-target physical hit while alive. Never chains off another counter. */

export interface ConsumableDef {
  readonly id: ItemId;
  readonly name: string;
  readonly description: string;
  readonly icon: string;
  readonly kind: 'heal' | 'ap' | 'revive' | 'material' | 'lure' | 'key' | 'catch';
  readonly potency: number;
  readonly value: number; // coin
}

/* ════════════════════════════════════════════════════════════════════════
 * 6. Combat — deterministic turn-based state machine
 * ════════════════════════════════════════════════════════════════════════ */

export interface EnemyDef {
  readonly id: EnemyId;
  readonly name: string;
  readonly sprite: SpriteSheetId;
  readonly level: number;
  readonly stats: Stats;
  readonly affinities: Affinities;
  readonly skills: readonly SkillId[];
  readonly xp: number;
  readonly coin: number;
  readonly drops: readonly { readonly itemId: ItemId; readonly chance: number }[];
  /** 0..1 chance to use a skill instead of a basic attack when AP allows. */
  readonly skillBias: number;
}

export interface EncounterDef {
  readonly id: EncounterId;
  readonly name: string;
  readonly enemies: readonly EnemyId[];
  readonly canFlee: boolean;
  readonly boss?: boolean;
  /** Region liberated when this encounter is won. */
  readonly liberatesRegion?: RegionId;
}

export type CombatSide = 'party' | 'enemy';

/** Everything core needs to field one party member. Built by the app from the roster. */
export interface PartyMemberSetup {
  readonly heroId: HeroId;
  readonly level: number;
  readonly hp: number; // current (≤ effective max; clamped by core)
  readonly ap: number;
  readonly loadout: Loadout;
  readonly fusion: readonly SpiritId[];
}

/** Combat fields the leader plus the next members in party order, up to this many. */
export const COMBAT_PARTY_SIZE = 4;

export interface EncounterSetup {
  /** World flags at encounter start (gates `DragonFormDef.requiresFlag`). Absent = no flags. */
  readonly flags?: WorldFlags;
  readonly encounterId: EncounterId;
  readonly party: readonly PartyMemberSetup[];
  readonly liberatedRegions: number;
}

export interface Combatant {
  readonly id: CombatantId; // `hero:<HeroId>` or `enemy:<index>:<EnemyId>`
  readonly side: CombatSide;
  readonly name: string;
  readonly sprite: SpriteSheetId;
  readonly heroId?: HeroId;
  readonly enemyId?: EnemyId;
  readonly level: number;
  /** Base stats: level growth + gear (incl. scaled relics). Fusion/dragon/status layers are applied on top by `effectiveStats`. */
  readonly baseStats: Stats;
  readonly baseAffinities: Affinities;
  readonly baseSkills: readonly SkillId[];
  readonly hp: number;
  readonly ap: number;
  readonly sync: number; // 0..100, drake-blooded only
  readonly alive: boolean;
  readonly guarding: boolean;
  readonly statuses: readonly StatusInstance[];
  readonly fusion: FusionState | null;
  readonly dragon: DragonState | null;
  /** Hooks contributed by equipped signature gear. */
  readonly hooks: readonly { readonly hookId: CombatHookId; readonly params: Readonly<Record<string, number>>; readonly sourceGear: GearId }[];
}

export type CombatAction =
  | { readonly type: 'attack'; readonly targetId: CombatantId }
  | { readonly type: 'skill'; readonly skillId: SkillId; readonly targetId?: CombatantId }
  | { readonly type: 'guard' }
  | { readonly type: 'item'; readonly itemId: ItemId; readonly targetId: CombatantId }
  | { readonly type: 'transform'; readonly formId: DragonFormId }
  | { readonly type: 'revert' }
  | { readonly type: 'flee' }
  /** Answer to an open `CombatState.qte` window (one entry per prompt, in order). */
  | { readonly type: 'qte'; readonly results: readonly QteInputResult[] };

export type CombatPhase = 'awaitingInput' | 'enemyTurn' | 'victory' | 'defeat' | 'fled';

export type CombatEvent =
  | { readonly type: 'turnStart'; readonly actorId: CombatantId; readonly round: number }
  | { readonly type: 'attack'; readonly actorId: CombatantId; readonly targetId: CombatantId; readonly skillId?: SkillId; readonly element: Element }
  | { readonly type: 'damage'; readonly targetId: CombatantId; readonly amount: number; readonly element: Element; readonly crit: boolean; readonly affinity: 'weak' | 'resist' | 'neutral' | 'immune'; readonly absorbedByArmor: number }
  | { readonly type: 'heal'; readonly targetId: CombatantId; readonly amount: number }
  | { readonly type: 'apChange'; readonly targetId: CombatantId; readonly amount: number }
  | { readonly type: 'status'; readonly targetId: CombatantId; readonly status: StatusId; readonly applied: boolean }
  | { readonly type: 'guard'; readonly actorId: CombatantId }
  | { readonly type: 'transform'; readonly actorId: CombatantId; readonly formId: DragonFormId }
  | { readonly type: 'revert'; readonly actorId: CombatantId; readonly reason: 'manual' | 'apDepleted' | 'maxTurns' | 'ko' }
  | { readonly type: 'armorBreak'; readonly targetId: CombatantId }
  | { readonly type: 'armorRestore'; readonly targetId: CombatantId }
  | { readonly type: 'hook'; readonly ownerId: CombatantId; readonly hookId: CombatHookId; readonly sourceGear: GearId; readonly note: string }
  | { readonly type: 'ko'; readonly targetId: CombatantId }
  | { readonly type: 'flee'; readonly success: boolean }
  | { readonly type: 'invalid'; readonly reason: string }
  | { readonly type: 'end'; readonly outcome: 'victory' | 'defeat' | 'fled' }
  // Phase 3 — emitted by combat modifiers
  | { readonly type: 'reaction'; readonly reactionId: ReactionId; readonly targetId: CombatantId; readonly element: Element }
  | { readonly type: 'hazardSpawn'; readonly hazardId: HazardId; readonly instanceId: number; readonly side: CombatSide }
  | { readonly type: 'hazardTick'; readonly hazardId: HazardId; readonly instanceId: number; readonly targetId: CombatantId; readonly amount: number; readonly element: Element }
  | { readonly type: 'hazardExpire'; readonly hazardId: HazardId; readonly instanceId: number; readonly side: CombatSide }
  | { readonly type: 'qteStart'; readonly actorId: CombatantId; readonly skillId: SkillId; readonly sequence: readonly QteInput[]; readonly windowMs: number }
  | { readonly type: 'qteResult'; readonly actorId: CombatantId; readonly grade: QteGrade; readonly multiplier: number }
  /** Freeze-frame for impact: the engine pauses combat animation for `ms`. */
  | { readonly type: 'hitStop'; readonly targetId: CombatantId; readonly ms: number };

/* ── Phase 3: elemental reactions, hazards, quick-time events ─────────── */

export type HazardId = string;
export type ReactionId = string;

/**
 * A terrain hazard covering one side of the battle field. Ticks at the start of
 * each living combatant's turn on that side, for `durationRounds` rounds.
 * Hazard damage never KOs (it leaves at least 1 HP) so combat-end detection stays in the core state machine.
 */
export interface HazardDef {
  readonly id: HazardId;
  readonly name: string;
  readonly description: string;
  readonly durationRounds: number;
  /** Damage over time: `fraction` × the victim's max HP, of `element` (affinities apply). */
  readonly dot?: { readonly element: Element; readonly fraction: number };
  readonly inflicts?: { readonly status: StatusId; readonly chance: number; readonly turns: number; readonly potency: number };
  /** Damage of these elements dealt to combatants standing in the hazard is multiplied. */
  readonly amplifies?: Readonly<Partial<Record<Element, number>>>;
  /** 0..1 — single-target hits into this side lose this fraction of damage (smoke, steam). */
  readonly obscures?: number;
  /** HUD icon and battlefield FX — asset manifest ids. */
  readonly iconAssetId: AssetId;
  readonly fxAssetId: AssetId;
}

/**
 * Elemental chaining: when a hit of `element` lands on a target that matches `when`,
 * the reaction fires. An empty `when` matches every hit of that element.
 */
export interface ElementalReactionDef {
  readonly id: ReactionId;
  readonly name: string;
  readonly element: Element;
  readonly when: { readonly targetStatus?: StatusId; readonly sideHazard?: HazardId };
  /** Hazard spawned on the target's side (refreshes duration if already present). */
  readonly spawns?: HazardId;
  /** Removed when the reaction fires (e.g. ice consumes the water puddle it freezes). */
  readonly consumes?: { readonly status?: StatusId; readonly hazard?: HazardId };
  /** Extra damage as a fraction of the triggering hit (0.5 = +50 %). */
  readonly bonusDamage?: number;
  readonly inflicts?: { readonly status: StatusId; readonly chance: number; readonly turns: number; readonly potency: number };
  /** Lower runs first; at most one reaction per (hit, target). */
  readonly priority: number;
}

export interface HazardInstance {
  readonly instanceId: number;
  readonly hazardId: HazardId;
  readonly side: CombatSide;
  readonly roundsLeft: number;
  readonly sourceId: CombatantId | null;
}

export type QteInput = 'up' | 'down' | 'left' | 'right' | 'tap';
export type QteGrade = 'miss' | 'good' | 'perfect';

export interface QteSpec {
  /** Number of prompts in the sequence (1–5). */
  readonly prompts: number;
  /** Time allowed per prompt (ms). */
  readonly windowMs: number;
  /** Pool the deterministic sequence is drawn from. */
  readonly pool: readonly QteInput[];
  readonly goodMultiplier: number;
  readonly perfectMultiplier: number;
  /** Fraction of `windowMs` an answer must beat (on every prompt) to grade perfect. */
  readonly perfectWithin: number;
  /** Hit-stop length on a good/perfect result (ms). */
  readonly hitStopMs: number;
}

export interface QteWindow {
  readonly actorId: CombatantId;
  readonly skillId: SkillId;
  readonly targetId?: CombatantId;
  readonly sequence: readonly QteInput[];
  readonly windowMs: number;
  readonly perfectWithin: number;
}

/** `ms` = reaction time measured by the UI from prompt shown to input; `input: null` = timed out. */
export interface QteInputResult {
  readonly input: QteInput | null;
  readonly ms: number;
}

/**
 * Decorator over the combat service (`CoreServices['combat']`). Handlers wrap the core
 * state machine without modifying it: they may intercept actions before `step`, and
 * post-process the resulting state/events after it. `createCoreServices` returns the
 * combat service already decorated with the built-in handlers (reactions, hazards, QTE).
 */
export interface CombatModifierHandler {
  readonly id: string;
  /** Return a state to short-circuit `step` (e.g. open a QTE window), or null to continue. */
  beforeStep?(state: CombatState, action: CombatAction, next: (s: CombatState, a: CombatAction) => CombatState): CombatState | null;
  /** Post-process: `prev` is the state before the step, `next` the core's result. */
  afterStep?(prev: CombatState, next: CombatState, action: CombatAction): CombatState;
  /** Extend start (e.g. initialise `hazards: []`). */
  afterStart?(state: CombatState): CombatState;
}

/* ── Phase 3: stamina, mounts ─────────────────────────────────────────── */

export interface StaminaTuning {
  readonly max: number;
  readonly regenPerSec: number;
  /** Seconds without draining before regeneration starts. */
  readonly regenDelaySec: number;
  readonly sprintDrainPerSec: number;
  readonly sprintSpeedMultiplier: number;
  /** After hitting 0 the pool is `exhausted` until it refills to this fraction of max. */
  readonly recoverFraction: number;
}

export interface StaminaState {
  readonly current: number;
  readonly max: number;
  readonly exhausted: boolean;
  /** Seconds since stamina was last drained. */
  readonly idleSec: number;
}

export type MountId = string;

export interface MountDef {
  readonly id: MountId;
  readonly name: string;
  readonly description: string;
  /** flight: dragon flight, ignores ground collision and crosses chunks; beast: fast ground mount. */
  readonly kind: 'flight' | 'beast';
  /** Hero who provides the mount (dragon flight is Kael's). */
  readonly hero?: HeroId;
  readonly speed: number; // m/s cruising
  readonly boostSpeed: number; // m/s while boosting (drains extra stamina)
  readonly staminaDrainPerSec: number; // while mounted
  readonly boostDrainPerSec: number; // extra while boosting
  readonly ignoresCollision: boolean;
  /** Metres above ground the rider travels at. */
  readonly altitude: number;
  /** Camera spring-arm offsets the rider inherits. */
  readonly camera: { readonly distance: number; readonly pitchDeg: number; readonly lookHeight: number };
  readonly unlockWhen: Condition;
  readonly unlockText: string;
  /** Sprite sheet asset for the mount (manifest id). */
  readonly assetId: AssetId;
  readonly iconAssetId: AssetId;
}

/* ── Phase 3: external asset pipeline ─────────────────────────────────── */

export type AssetId = string;
export type AssetStatus = 'pending' | 'in_progress' | 'delivered' | 'rejected';

/**
 * One visual the external art agent must produce. Field names follow the shared
 * pipeline schema exactly (snake_case). `category` and `animation_states` are optional extensions.
 */
export interface AssetManifestEntry {
  readonly asset_id: AssetId;
  readonly type: 'spritesheet' | 'sprite' | 'icon' | 'texture' | 'normal_map';
  /** Repo-relative path the finished file must be written to (under `public/assets/generated/`). */
  readonly target_path: string;
  readonly resolution: { readonly width: number; readonly height: number };
  readonly grid?: { readonly columns: number; readonly rows: number; readonly frame_width: number; readonly frame_height: number };
  readonly fps?: number;
  readonly loop?: boolean;
  readonly alpha_channel: boolean;
  readonly prompt_spec: string;
  readonly status: AssetStatus;
  readonly category?: 'mount' | 'hazard' | 'qte' | 'hud' | 'fx';
  readonly animation_states?: readonly { readonly name: string; readonly row: number; readonly from: number; readonly count: number }[];
}

export interface AssetManifest {
  readonly manifest_version: '1.0';
  readonly project: string;
  readonly assets: readonly AssetManifestEntry[];
}

/** Client-side view of one asset (see `src/engine/assets/registry.ts`). */
export interface AssetRecord {
  readonly assetId: AssetId;
  readonly entry: AssetManifestEntry | null;
  /** True once a production file is present and loadable. */
  readonly ready: boolean;
  /** Public URL (cache-busted with `version`) when ready. */
  readonly url: string | null;
  readonly version: number;
}

export interface CombatRewards {
  readonly xp: number;
  readonly coin: number;
  readonly items: readonly { readonly itemId: ItemId; readonly qty: number }[];
  readonly liberatesRegion?: RegionId;
}

export interface CombatState {
  readonly encounterId: EncounterId;
  readonly phase: CombatPhase;
  readonly round: number;
  /** Turn order for the current round (alive combatants, by effective spd desc, id tiebreak). */
  readonly order: readonly CombatantId[];
  /** Index into `order` of the combatant whose turn it is. */
  readonly turnIndex: number;
  readonly activeId: CombatantId | null;
  readonly combatants: Readonly<Record<CombatantId, Combatant>>;
  /** Full append-only event log. UI/engine animate from `log.slice(lastSeen)`. */
  readonly log: readonly CombatEvent[];
  /** Deterministic PRNG state (mulberry32-style uint32). Same seed + actions ⇒ same result. */
  readonly rng: number;
  readonly canFlee: boolean;
  readonly liberatedRegions: number;
  /** Present once `phase === 'victory'`. */
  readonly rewards: CombatRewards | null;
  /** World flags captured at encounter start (gates apex dragon forms). Never rebuild state field-by-field or these are lost. */
  readonly flags?: WorldFlags;
  /** Phase 3 — elemental terrain hazards on each side of the field (managed by combat modifiers). */
  readonly hazards?: readonly HazardInstance[];
  /** Phase 3 — an open quick-time window; while set, the active hero must answer with a `qte` action. */
  readonly qte?: QteWindow | null;
  /** Monotonic id source for hazard instances. */
  readonly hazardSeq?: number;
}

/* ════════════════════════════════════════════════════════════════════════
 * 7. World flags & quest state machine
 * ════════════════════════════════════════════════════════════════════════ */

export type FlagValue = boolean | number | string;
export type WorldFlags = Readonly<Record<string, FlagValue>>;

/**
 * Everything that happens in the world is a WorldEvent. The quest engine folds an
 * event into flags using these canonical keys (value = occurrence count):
 *   talk → `evt:talk:<npcId>`          defeat → `evt:defeat:<encounterId>`
 *   obtain → `evt:obtain:<itemId>` (count += qty)
 *   enterRegion → `evt:enter:<regionId>`   fieldAction → `evt:field:<action>:<targetId>`
 *   recruit → `evt:recruit:<npcId>`    build → `evt:build:<buildingId>`
 *   acceptQuest → `evt:accept:<questId>`   liberate → `evt:liberate:<regionId>`
 *   choice → `evt:choice:<dialogueId>:<choiceId>`   setFlag → sets `<key>` = value directly
 */
export type WorldEvent =
  | { readonly type: 'talk'; readonly npcId: NpcId }
  | { readonly type: 'defeat'; readonly encounterId: EncounterId }
  | { readonly type: 'obtain'; readonly itemId: ItemId | GearId; readonly qty: number }
  | { readonly type: 'enterRegion'; readonly regionId: RegionId }
  | { readonly type: 'fieldAction'; readonly action: FieldActionId; readonly targetId: string }
  | { readonly type: 'recruit'; readonly npcId: NpcId }
  | { readonly type: 'build'; readonly buildingId: BuildingId }
  | { readonly type: 'acceptQuest'; readonly questId: QuestId }
  | { readonly type: 'liberate'; readonly regionId: RegionId }
  | { readonly type: 'choice'; readonly dialogueId: DialogueId; readonly choiceId: string }
  | { readonly type: 'setFlag'; readonly key: string; readonly value: FlagValue };

export type Condition =
  | { readonly kind: 'always' }
  | { readonly kind: 'flag'; readonly key: string; readonly equals?: FlagValue; readonly atLeast?: number }
  | { readonly kind: 'quest'; readonly questId: QuestId; readonly status: QuestStatus }
  | { readonly kind: 'questAtLeast'; readonly questId: QuestId; readonly status: QuestStatus }
  | { readonly kind: 'all'; readonly of: readonly Condition[] }
  | { readonly kind: 'any'; readonly of: readonly Condition[] }
  | { readonly kind: 'not'; readonly of: Condition }
  /** True when at least `atLeast` of the sub-conditions hold (clue counts, ending thresholds). */
  | { readonly kind: 'count'; readonly of: readonly Condition[]; readonly atLeast: number };

/** Strictly ordered; a quest only ever moves forward. */
export const QUEST_STATUS_ORDER = ['HIDDEN', 'DISCOVERED', 'ACTIVE', 'COMPLETED'] as const;
export type QuestStatus = (typeof QUEST_STATUS_ORDER)[number];

export type QuestKind = 'main' | 'companion' | 'investigation' | 'township';

export type Reward =
  | { readonly type: 'gear'; readonly gearId: GearId }
  | { readonly type: 'item'; readonly itemId: ItemId; readonly qty: number }
  | { readonly type: 'coin'; readonly amount: number }
  | { readonly type: 'xp'; readonly amount: number }
  | { readonly type: 'spirit'; readonly spiritId: SpiritId }
  | { readonly type: 'flag'; readonly key: string; readonly value: FlagValue }
  /** Recruit a hero into the travelling party. */
  | { readonly type: 'hero'; readonly heroId: HeroId };

export interface ObjectiveDef {
  readonly id: ObjectiveId;
  readonly text: string;
  /** Objective is visible/trackable only once this holds (default: always). */
  readonly revealWhen?: Condition;
  readonly completeWhen: Condition;
  /** Optional objectives don't gate completion. */
  readonly optional?: boolean;
  /** Where the tracker should point. */
  readonly marker?: Vec2;
}

export interface QuestDef {
  readonly id: QuestId;
  /** Multi-stage quest lines (personal quests): stages of one chain share `id`, `stage` is 1-based. */
  readonly chain?: { readonly id: string; readonly stage: number; readonly of: number; readonly title: string };
  readonly title: string;
  readonly kind: QuestKind;
  readonly act: 1 | 2 | 3;
  readonly companion?: HeroId;
  readonly giver?: NpcId;
  readonly summary: string;
  /** Chronicle text appended as the quest advances. */
  readonly chronicle: Readonly<Record<QuestStatus, string>>;
  /** HIDDEN → DISCOVERED */
  readonly discoverWhen: Condition;
  /** DISCOVERED → ACTIVE (typically `evt:accept:<id>` ≥ 1) */
  readonly activateWhen: Condition;
  /** ACTIVE → COMPLETED when all non-optional objectives are complete. */
  readonly objectives: readonly ObjectiveDef[];
  readonly rewards: readonly Reward[];
}

export interface QuestProgress {
  readonly status: QuestStatus;
  readonly objectives: Readonly<Record<ObjectiveId, boolean>>;
}
export type QuestLog = Readonly<Record<QuestId, QuestProgress>>;

export interface QuestNotification {
  readonly questId: QuestId;
  readonly kind: 'discovered' | 'activated' | 'objective' | 'completed';
  readonly text: string;
}

export interface QuestStepResult {
  readonly flags: WorldFlags;
  readonly log: QuestLog;
  readonly notifications: readonly QuestNotification[];
  /** Rewards from quests completed by this step, in completion order. */
  readonly rewards: readonly Reward[];
}

/* ════════════════════════════════════════════════════════════════════════
 * 8. World: regions, NPCs, dialogue, township, hunting, fishing
 * ════════════════════════════════════════════════════════════════════════ */

/** Chunk edge length (m) and streaming radius (m). The slice biome is exactly one chunk. */
export const CHUNK_SIZE = 250;
export const ACTIVE_RADIUS = 500;

export type BiomeId = 'frontier' | 'coast' | 'forest' | 'highland' | 'marsh' | 'desert' | 'tundra' | 'volcanic' | 'skyreach' | 'ruin';
export type TerrainKind = 'grass' | 'path' | 'sand' | 'water' | 'rock' | 'plaza';

export interface RegionDef {
  readonly id: RegionId;
  readonly name: string;
  readonly biome: BiomeId;
  readonly center: Vec2;
  readonly radius: number;
  /** Starts under Covenant control; liberated by winning a linked encounter. */
  readonly occupied: boolean;
  readonly blurb: string;
}

export interface PropDef {
  readonly kind:
    | 'house' | 'chapel' | 'arena' | 'dock' | 'stall' | 'well' | 'sign' | 'lantern' | 'fence' | 'ruin' | 'campfire' | 'shrine'
    // campaign biomes
    | 'tent' | 'windmill' | 'tower' | 'fortWall' | 'gateArch' | 'bridge' | 'cactus' | 'iceSpire' | 'mangrove'
    | 'basalt' | 'crystal' | 'obelisk' | 'cathedral' | 'stiltHouse' | 'skyPlatform' | 'statue';
  readonly position: Vec2;
  readonly rotation?: number; // radians about y
  readonly scale?: number;
  readonly tint?: string;
}

export interface NpcDef {
  readonly id: NpcId;
  readonly name: string;
  readonly role: string;
  readonly sprite: SpriteSheetId;
  readonly position: Vec2;
  /** Only present in the world while this holds (default: always). */
  readonly presentWhen?: Condition;
  /** Only visible while Drake-Sight is active. */
  readonly hiddenUntilDrakeSight?: boolean;
  /** First dialogue whose `when` holds is played. */
  readonly dialogues: readonly { readonly when: Condition; readonly dialogueId: DialogueId }[];
}

export interface DialogueLine {
  readonly speaker: string;
  readonly text: string;
}
export interface DialogueChoice {
  readonly id: string;
  readonly label: string;
  /** Events dispatched when chosen (a `choice` event is always dispatched too). */
  readonly events?: readonly WorldEvent[];
  readonly when?: Condition;
}
export interface DialogueDef {
  readonly id: DialogueId;
  readonly lines: readonly DialogueLine[];
  /** Events dispatched when the last line is dismissed. */
  readonly onEnd?: readonly WorldEvent[];
  readonly choices?: readonly DialogueChoice[];
  /** Start this encounter when the dialogue ends. */
  readonly startsEncounter?: EncounterId;
}

export interface EncounterZoneDef {
  readonly id: string;
  readonly encounterId: EncounterId;
  readonly position: Vec2;
  readonly radius: number;
  readonly sprite: SpriteSheetId;
  readonly presentWhen?: Condition;
  /** Removed for good once won. */
  readonly once: boolean;
}

/* ── Township ─────────────────────────────────────────────────────────── */

export interface BuildingUpgradeDef {
  /** Level reached by this upgrade (2, 3, …). A freshly built building is level 1. */
  readonly level: number;
  readonly name: string;
  readonly description: string;
  readonly cost: { readonly coin: number; readonly items: readonly { readonly itemId: ItemId; readonly qty: number }[] };
  /** Flag set to true once this level is reached (e.g. `township.smithy.2`). */
  readonly unlocksFlag: string;
  readonly perk: string;
  /** Must hold before the upgrade is offered (e.g. a story chapter). Default: always. */
  readonly requires?: Condition;
  readonly requirementText?: string;
  /** Visual growth of the building prop at this level. */
  readonly propScale: number;
}

export interface BuildingDef {
  readonly id: BuildingId;
  readonly name: string;
  readonly description: string;
  readonly prop: PropDef['kind'];
  /** Tenant NPC that must be recruited first. */
  readonly requiresRecruit: NpcId;
  readonly cost: { readonly coin: number; readonly items: readonly { readonly itemId: ItemId; readonly qty: number }[] };
  /** Flag set to true once built — unlocks services (e.g. `township.smithy`). */
  readonly unlocksFlag: string;
  readonly perk: string;
  /** Architectural upgrades, ascending by level. */
  readonly upgrades: readonly BuildingUpgradeDef[];
}

export interface PlotDef {
  readonly id: PlotId;
  readonly name: string;
  readonly position: Vec2;
  readonly accepts: readonly BuildingId[];
}

export interface RecruitDef {
  readonly npcId: NpcId;
  readonly trade: string;
  /** Must hold before the NPC will agree to move in. */
  readonly requires: Condition;
  readonly requirementText: string;
  /** Where the NPC stands in the township after moving in. */
  readonly townshipPosition: Vec2;
  readonly unlocksBuildings: readonly BuildingId[];
}

export interface TownshipDef {
  readonly name: string;
  readonly regionId: RegionId;
  readonly plots: readonly PlotDef[];
  readonly buildings: readonly BuildingDef[];
  readonly recruits: readonly RecruitDef[];
}

export interface TownshipState {
  readonly recruited: readonly NpcId[];
  /** plot → building instantiated on it. */
  readonly built: Readonly<Record<PlotId, BuildingId>>;
  /** plot → current architectural level (1 once built). */
  readonly levels: Readonly<Record<PlotId, number>>;
}

export type TownshipResult =
  | { readonly ok: true; readonly state: TownshipState; readonly events: readonly WorldEvent[]; readonly spend: { readonly coin: number; readonly items: readonly { readonly itemId: ItemId; readonly qty: number }[] } }
  | { readonly ok: false; readonly reason: string };

/* ── Hunting (wind / scent tracking) ─────────────────────────────────── */

export interface WindState {
  /** Direction the wind blows TOWARD, radians (0 = +x, π/2 = +z). */
  readonly direction: number;
  /** m/s, 0..~8 */
  readonly speed: number;
}

export interface SpeciesDef {
  readonly id: SpeciesId;
  readonly name: string;
  readonly sprite: SpriteSheetId;
  readonly speed: number; // flee m/s
  readonly wanderSpeed: number;
  /** Base distance (m) at which it notices the hunter by sight/sound. */
  readonly alertRadius: number;
  /** Extra detection reach (m per m/s of wind) when the hunter is upwind of it. */
  readonly scentSensitivity: number;
  readonly drops: readonly { readonly itemId: ItemId; readonly chance: number }[];
  readonly herd: { readonly min: number; readonly max: number };
  readonly habitat: readonly { readonly center: Vec2; readonly radius: number }[];
}

export type AnimalMood = 'grazing' | 'alert' | 'fleeing' | 'downed';

export interface AnimalState {
  readonly id: string;
  readonly speciesId: SpeciesId;
  readonly position: Vec2;
  readonly heading: number;
  readonly mood: AnimalMood;
  /** 0..1 — fills while scenting/seeing the hunter; flees at 1. */
  readonly alertness: number;
  readonly home: Vec2;
}

export interface ScentReading {
  /** Distance at which this animal would currently detect the hunter. */
  readonly detectionRadius: number;
  /** −1 (hunter fully downwind: safe) … +1 (hunter fully upwind: scent carries). */
  readonly upwindFactor: number;
  readonly detected: boolean;
}

export interface HuntResult {
  readonly hit: boolean;
  readonly animalId?: string;
  readonly speciesId?: SpeciesId;
  readonly drops: readonly { readonly itemId: ItemId; readonly qty: number }[];
  readonly animals: readonly AnimalState[];
  readonly rng: number;
}

/* ── Fishing ──────────────────────────────────────────────────────────── */

export interface FishDef {
  readonly id: FishId;
  readonly name: string;
  readonly itemId: ItemId;
  readonly rarity: 'common' | 'uncommon' | 'rare' | 'legend';
  /** 0..1 — how hard it pulls. */
  readonly fight: number;
  readonly weight: number; // spawn weight
  readonly preferredLure?: ItemId;
}

export interface FishingSpotDef {
  readonly id: FishingSpotId;
  readonly name: string;
  readonly position: Vec2;
  readonly fish: readonly FishId[];
  /** Landing this fish here surfaces the travelling Brinefolk barge merchant. */
  readonly merchantFish?: FishId;
  readonly hiddenUntilDrakeSight?: boolean;
}

export type FishingPhase = 'waiting' | 'bite' | 'reeling' | 'landed' | 'escaped';

/**
 * Tension minigame: after `waiting`, a `bite` window opens (tap to hook), then
 * `reeling`: hold to raise tension/progress, release to lower tension. Tension
 * ≥ 1 snaps the line; progress ≥ 1 lands the fish.
 */
export interface FishingSession {
  readonly spotId: FishingSpotId;
  readonly fishId: FishId;
  readonly lureId: ItemId | null;
  readonly phase: FishingPhase;
  readonly timer: number; // seconds in current phase
  readonly biteAt: number; // seconds of waiting before the bite
  readonly tension: number; // 0..1
  readonly progress: number; // 0..1
  readonly rng: number;
}

/* ════════════════════════════════════════════════════════════════════════
 * 9. Game database (authored by world-lore, consumed by everyone)
 * ════════════════════════════════════════════════════════════════════════ */

/**
 * One authored 250 m × 250 m chunk of the continent. Chunk (cx, cz) covers world
 * x ∈ [cx·250, (cx+1)·250), z ∈ [cz·250, (cz+1)·250). Unauthored chunks are wilderness.
 */
export interface BiomeChunkDef {
  readonly cx: number;
  readonly cz: number;
  readonly name: string;
  readonly biome: BiomeId;
  readonly act: 1 | 2 | 3;
  /** Prop kinds the engine scatters procedurally (instanced) as biome dressing in this chunk. */
  readonly scatterProps: readonly PropDef['kind'][];
  /** 0..1 multiplier on foliage density; 0 = barren. */
  readonly foliageDensity: number;
}

export interface TraversalGateDef {
  readonly id: string;
  readonly kind: TraversalGateKind;
  readonly label: string;
  readonly position: Vec2;
  /** Blocking footprint: a box `width` (across the path) × `depth`, rotated about y. */
  readonly width: number;
  readonly depth: number;
  readonly rotation?: number;
  /** Two sides of the gate; a successful traversal moves the leader from the nearer to the other. */
  readonly sides: readonly [Vec2, Vec2];
  /** Gate stays cleared for good once crossed (boulders smashed, wards broken, groves opened). */
  readonly clearsPermanently: boolean;
  readonly presentWhen?: Condition;
}

export interface WorldMapDef {
  readonly seed: number;
  readonly playerStart: Vec2;
  readonly regions: readonly RegionDef[];
  readonly props: readonly PropDef[];
  readonly npcs: readonly NpcDef[];
  readonly encounterZones: readonly EncounterZoneDef[];
  readonly fishingSpots: readonly FishingSpotDef[];
  /** Painted features the terrain generator must respect. */
  readonly paths: readonly { readonly points: readonly Vec2[]; readonly width: number }[];
  readonly water: readonly { readonly center: Vec2; readonly radius: number; readonly kind: 'lake' | 'sea' }[];
  /** Every authored chunk. Must include (0, 0) — the Lanternwick frontier. */
  readonly chunks: readonly BiomeChunkDef[];
  readonly traversalGates: readonly TraversalGateDef[];
}

export interface StoryNodeDef {
  readonly id: string;
  readonly act: 1 | 2 | 3;
  readonly title: string;
  readonly regionId: RegionId;
  /** The main quest that plays this chapter. */
  readonly questId: QuestId;
  readonly next: readonly string[];
}

export interface ClueDef {
  readonly id: string;
  readonly title: string;
  readonly text: string;
  readonly regionId: RegionId;
  /** Investigation quest this clue belongs to. */
  readonly investigationId: QuestId;
  /** Found once this holds. Convention: also set flag `clue:<id>` via a quest/dialogue so it is countable. */
  readonly foundWhen: Condition;
}

export interface EndingDef {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  readonly priority: number;
  readonly when: Condition;
}

export interface StoryActDef {
  readonly act: 1 | 2 | 3;
  readonly title: string;
  readonly synopsis: string;
  readonly beats: readonly string[];
  readonly questIds: readonly QuestId[];
}

export interface GameDatabase {
  readonly title: string;
  readonly heroes: Readonly<Record<HeroId, HeroDef>>;
  readonly fieldActions: Readonly<Record<FieldActionId, FieldActionDef>>;
  readonly spirits: Readonly<Record<SpiritId, SpiritDef>>;
  readonly dragonForms: Readonly<Record<DragonFormId, DragonFormDef>>;
  readonly skills: Readonly<Record<SkillId, SkillDef>>;
  readonly enemies: Readonly<Record<EnemyId, EnemyDef>>;
  readonly encounters: Readonly<Record<EncounterId, EncounterDef>>;
  readonly gear: Readonly<Record<GearId, GearDef>>;
  readonly items: Readonly<Record<ItemId, ConsumableDef>>;
  readonly quests: readonly QuestDef[];
  readonly dialogues: Readonly<Record<DialogueId, DialogueDef>>;
  readonly acts: readonly StoryActDef[];
  /** Main story graph: nodes in play order; `next` lists the nodes it opens. */
  readonly storyGraph: readonly StoryNodeDef[];
  /** Hollow Covenant investigation clues, found non-linearly across the continent. */
  readonly clues: readonly ClueDef[];
  /** Endings, highest `priority` whose `when` holds wins (see `resolveEnding` in the store). */
  readonly endings: readonly EndingDef[];
  /** Phase 3 */
  readonly hazards: Readonly<Record<HazardId, HazardDef>>;
  readonly reactions: readonly ElementalReactionDef[];
  readonly mounts: Readonly<Record<MountId, MountDef>>;
  readonly stamina: StaminaTuning;
  /** Every visual the external pipeline must deliver (see `src/assets/manifests`). */
  readonly assetRequests: readonly AssetManifestEntry[];
  readonly world: WorldMapDef;
  readonly township: TownshipDef;
  readonly species: Readonly<Record<SpeciesId, SpeciesDef>>;
  readonly fish: Readonly<Record<FishId, FishDef>>;
  /** New-game state. */
  readonly start: {
    readonly party: readonly HeroId[];
    readonly leader: HeroId;
    readonly level: number;
    readonly coin: number;
    readonly inventory: Readonly<Record<ItemId, number>>;
    readonly gearOwned: readonly GearId[];
    readonly loadouts: Readonly<Partial<Record<HeroId, Loadout>>>;
    readonly spirits: readonly SpiritId[];
    readonly flags: WorldFlags;
  };
}

/* ════════════════════════════════════════════════════════════════════════
 * 10. Service interfaces (dependency-injected at boot)
 * ════════════════════════════════════════════════════════════════════════ */

/** `src/core/index.ts` exports `createCoreServices(db: GameDatabase): CoreServices`. */
export interface CoreServices {
  readonly progression: {
    /** Level-scaled base stats (no gear). */
    statsAt(hero: HeroDef, level: number): Stats;
    xpToNext(level: number): number;
    /** Apply xp; returns the new level + leftover xp. */
    grantXp(level: number, xp: number, gained: number): { readonly level: number; readonly xp: number; readonly levelsGained: number };
    skillsAt(hero: HeroDef, level: number): readonly SkillId[];
  };
  readonly gear: {
    /** Scaled bonus of a single piece of gear (relics scale; others return `stats`). */
    bonus(gear: GearDef, ctx: ProgressionContext): Stats;
    /** Hero stats with the whole loadout applied. */
    statsWithLoadout(hero: HeroDef, loadout: Loadout, ctx: ProgressionContext): Stats;
    canEquip(heroId: HeroId, gear: GearDef): boolean;
    hooks(): readonly CombatHookInfo[];
  };
  readonly fusion: {
    canFuse(hero: HeroDef, spirits: readonly SpiritId[], owned: readonly SpiritId[]): { readonly ok: boolean; readonly reason?: string };
    /** Run the decorator chain over `base` stats (already including gear). */
    compose(hero: HeroDef, base: Stats, skills: readonly SkillId[], spirits: readonly SpiritId[]): FusedProfile;
  };
  readonly combat: {
    start(setup: EncounterSetup, seed: number): CombatState;
    /** Pure reducer. Only valid for the active combatant; invalid actions append an `invalid` event and change nothing else. */
    step(state: CombatState, action: CombatAction): CombatState;
    /** Deterministic AI pick for the active enemy (does not consume rng in `state`; `step` does). */
    chooseEnemyAction(state: CombatState): CombatAction;
    /** Stats after fusion (unless broken), dragon form and statuses. */
    effectiveStats(state: CombatState, id: CombatantId): Stats;
    availableSkills(state: CombatState, id: CombatantId): readonly SkillId[];
    availableForms(state: CombatState, id: CombatantId): readonly { readonly formId: DragonFormId; readonly usable: boolean; readonly reason?: string }[];
  };
  readonly stamina: {
    initial(tuning: StaminaTuning): StaminaState;
    /** Advance by dt seconds while draining `drainPerSec` (0 = resting). */
    tick(state: StaminaState, drainPerSec: number, dt: number, tuning: StaminaTuning): StaminaState;
    /** Can a drain of this rate start now (false while exhausted or empty)? */
    canDrain(state: StaminaState): boolean;
  };
  readonly quests: {
    initialLog(): QuestLog;
    evaluate(condition: Condition, flags: WorldFlags, log: QuestLog): boolean;
    /** Fold one event into flags, then advance every quest as far as it can go (fixpoint). */
    dispatch(flags: WorldFlags, log: QuestLog, event: WorldEvent): QuestStepResult;
  };
}

/** `src/systems/index.ts` exports `createWorldSystems(db: GameDatabase): WorldSystems`. */
export interface WorldSystems {
  readonly township: {
    initial(): TownshipState;
    canUpgrade(plotId: PlotId, state: TownshipState, coin: number, inventory: Readonly<Record<ItemId, number>>, flags: WorldFlags, evaluate: CoreServices['quests']['evaluate'], log: QuestLog): { readonly ok: boolean; readonly reason?: string };
    /** Raise the building on `plotId` one level. Events include `{ type: 'setFlag', key: upgrade.unlocksFlag, value: true }`. */
    upgrade(plotId: PlotId, state: TownshipState, coin: number, inventory: Readonly<Record<ItemId, number>>, flags: WorldFlags, evaluate: CoreServices['quests']['evaluate'], log: QuestLog): TownshipResult;
    canRecruit(npcId: NpcId, state: TownshipState, flags: WorldFlags, evaluate: CoreServices['quests']['evaluate'], log: QuestLog): { readonly ok: boolean; readonly reason?: string };
    recruit(npcId: NpcId, state: TownshipState): TownshipResult;
    canBuild(plotId: PlotId, buildingId: BuildingId, state: TownshipState, coin: number, inventory: Readonly<Record<ItemId, number>>): { readonly ok: boolean; readonly reason?: string };
    build(plotId: PlotId, buildingId: BuildingId, state: TownshipState, coin: number, inventory: Readonly<Record<ItemId, number>>): TownshipResult;
    /** NPC position accounting for township residency. */
    npcPosition(npc: NpcDef, state: TownshipState): Vec2;
  };
  readonly hunting: {
    /** Smoothly varying, deterministic wind for a world time. */
    windAt(timeSec: number, seed: number): WindState;
    spawn(seed: number): readonly AnimalState[];
    scent(animal: AnimalState, hunter: Vec2, wind: WindState, hunterStealth: number): ScentReading;
    /** Advance herd AI by dt seconds. `hunterStealth` 0..1 shrinks detection (crouch / slow walk). */
    update(animals: readonly AnimalState[], hunter: Vec2, wind: WindState, hunterStealth: number, dt: number, rng: number): { readonly animals: readonly AnimalState[]; readonly rng: number };
    /** Tobin's shot: hits the nearest non-downed animal inside a narrow cone within `range`. */
    shoot(animals: readonly AnimalState[], hunter: Vec2, facing: number, range: number, rng: number): HuntResult;
    /** Vesna's dash: tackles any non-downed animal within `radius` of the dash end point. */
    dashStrike(animals: readonly AnimalState[], dashEnd: Vec2, radius: number, rng: number): HuntResult;
  };
  readonly fishing: {
    /**
     * `castQuality` 0..1 from the cast gesture (default 0.5): better casts bite sooner and
     * shift weight toward rarer fish (≤ +50 % for uncommon and rarer at 1.0).
     */
    cast(spotId: FishingSpotId, lureId: ItemId | null, seed: number, castQuality?: number): FishingSession;
    /** `holding` = player is holding the reel button; `tapped` = pressed this frame. */
    tick(session: FishingSession, input: { readonly holding: boolean; readonly tapped: boolean }, dt: number): FishingSession;
    /** Catch for a landed session. */
    result(session: FishingSession): { readonly fish: FishDef; readonly itemId: ItemId; readonly summonsMerchant: boolean } | null;
  };
}

/* ════════════════════════════════════════════════════════════════════════
 * 11. App state (Zustand store shape — implemented by the lead in src/app/store.ts)
 * ════════════════════════════════════════════════════════════════════════ */

export type GameMode = 'boot' | 'overworld' | 'dialogue' | 'combat' | 'fishing';

export interface HeroProgress {
  readonly level: number;
  readonly xp: number;
  readonly hp: number;
  readonly ap: number;
  readonly loadout: Loadout;
  /** Spirits currently fused (persist between battles). */
  readonly fusion: readonly SpiritId[];
}

/** What the big bottom-right button does right now. Set by the engine from proximity. */
export type ContextAction =
  | { readonly kind: 'talk'; readonly npcId: NpcId; readonly label: string }
  | { readonly kind: 'fish'; readonly spotId: FishingSpotId; readonly label: string }
  | { readonly kind: 'encounter'; readonly zoneId: string; readonly encounterId: EncounterId; readonly label: string }
  | { readonly kind: 'build'; readonly plotId: PlotId; readonly label: string }
  /** Near a traversal gate the current party can clear: pressing performs `action`. */
  | { readonly kind: 'traverse'; readonly gateId: string; readonly action: FieldActionId; readonly label: string };

/** Gesture results from the touch mini-games. */
export interface FieldActionOptions {
  /** Hunting: world aim angle (atan2(dz, dx) convention) from the drag-to-aim gesture. */
  readonly aimAngle?: number;
  /** Hunting: draw strength 0..1 (scales range; < 0.25 is a weak, short shot). */
  readonly aimPower?: number;
  /** Fishing: cast quality 0..1 from the flick gesture. */
  readonly castQuality?: number;
}

export interface ActiveDialogue {
  readonly dialogueId: DialogueId;
  readonly npcId: NpcId | null;
  readonly lineIndex: number;
}

export interface Toast {
  readonly id: number;
  readonly text: string;
  readonly tone: 'info' | 'quest' | 'reward' | 'warn';
}

export interface GameState {
  readonly mode: GameMode;
  readonly party: readonly HeroId[];
  readonly leader: HeroId;
  readonly roster: Readonly<Partial<Record<HeroId, HeroProgress>>>;
  readonly coin: number;
  readonly inventory: Readonly<Record<ItemId, number>>;
  readonly gearOwned: readonly GearId[];
  readonly spiritsOwned: readonly SpiritId[];
  readonly flags: WorldFlags;
  readonly questLog: QuestLog;
  readonly trackedQuestId: QuestId | null;
  readonly liberatedRegions: readonly RegionId[];
  readonly township: TownshipState;
  readonly combat: CombatState | null;
  /** Zone that started the current combat (so it can be removed on victory). */
  readonly combatZoneId: string | null;
  readonly dialogue: ActiveDialogue | null;
  readonly fishing: FishingSession | null;
  readonly merchantSurfaced: boolean;
  readonly wind: WindState;
  readonly contextAction: ContextAction | null;
  /** World-time seconds until which Drake-Sight is active (0 = inactive). */
  readonly drakeSightUntil: number;
  /** fieldAction → world-time second when it is ready again. */
  readonly fieldCooldowns: Readonly<Partial<Record<FieldActionId, number>>>;
  readonly worldTime: number;
  readonly clearedZones: readonly string[];
  readonly toasts: readonly Toast[];
  /** Phase 3 — current mount (null on foot). Stamina itself lives on the runtime bus. */
  readonly mountedOn: MountId | null;
  /** Fast-travel destination in flight (null when not auto-flying). */
  readonly flightTarget: RegionId | null;
  readonly ui: {
    readonly chronicleOpen: boolean;
    readonly inspectorOpen: boolean;
    readonly townshipOpen: boolean;
    readonly inspectorHero: HeroId;
  };
}

export interface GameActions {
  /** Zero-menu hot-swap. Ignored for locked / absent heroes and outside the overworld. */
  setLeader(heroId: HeroId): void;
  cycleLeader(direction: 1 | -1): void;
  /** Engine → store: proximity result. Pass null to clear. */
  setContextAction(action: ContextAction | null): void;
  /** UI → store: press the contextual action button. */
  triggerContextAction(): void;
  /** UI → store: press a leader field-action button. Fishing needs a `fish` context. */
  performFieldAction(action: FieldActionId, options?: FieldActionOptions): void;
  /** Engine → store: result of a hunt resolved against live animals. */
  reportHunt(result: HuntResult): void;
  dispatchWorldEvent(event: WorldEvent): void;
  advanceDialogue(choiceId?: string): void;
  startEncounter(encounterId: EncounterId, zoneId?: string | null): void;
  combatAct(action: CombatAction): void;
  /** Leave the result screen and return to the overworld. */
  endCombat(): void;
  fishingInput(input: { readonly holding: boolean; readonly tapped: boolean }, dt: number): void;
  endFishing(): void;
  equip(heroId: HeroId, slot: GearSlot, gearId: GearId | null): void;
  setFusion(heroId: HeroId, spirits: readonly SpiritId[]): void;
  recruit(npcId: NpcId): void;
  build(plotId: PlotId, buildingId: BuildingId): void;
  upgradeBuilding(plotId: PlotId): void;
  trackQuest(questId: QuestId | null): void;
  toggleChronicle(open?: boolean): void;
  toggleInspector(open?: boolean, heroId?: HeroId): void;
  toggleTownship(open?: boolean): void;
  dismissToast(id: number): void;
  /** Engine → store, ~4 Hz: advance world time (drives wind + cooldowns). */
  tickWorld(dt: number): void;
  /** Mount/dismount. Fails (toast) if locked or the providing hero is not in the party. */
  mount(mountId: MountId): void;
  dismount(): void;
  /** Fast travel: mount the unlocked flight mount and fly to a discovered region (`evt:enter:<id>`). */
  flyTo(regionId: RegionId): void;
  /** Engine → store: the flight reached its destination (or stamina forced a landing). */
  arrive(reason: 'arrived' | 'exhausted' | 'cancelled'): void;
}

export type GameStore = GameState & GameActions;

/* ════════════════════════════════════════════════════════════════════════
 * 12. Runtime bus (mutable, non-reactive, per-frame — src/app/runtime.ts)
 * ════════════════════════════════════════════════════════════════════════ */

/** The ONLY mutable contract. Written every frame; never put it in React state. */
export interface RuntimeBus {
  /** UI writes, engine reads. Analog stick, each axis −1..1 (y: up on screen = −1 = north/−z). */
  input: { moveX: number; moveY: number; reelHeld: boolean; sprint: boolean; boost: boolean };
  /** Engine writes each frame via `core.stamina.tick`; UI reads in rAF. */
  stamina: StaminaState;
  /** Engine writes, UI may read (minimap / tracker arrow). */
  player: { x: number; z: number; facing: number; moving: boolean; speed: number };
  /** Engine writes: 0 = overworld framing, 1 = combat framing. */
  camera: { combatBlend: number; yaw: number };
  /** Store writes one-shot requests; engine consumes and clears. */
  requests: {
    fieldAction: FieldActionId | null;
    /** Set with a huntShot request when it came from the aim gesture; engine consumes and clears. */
    huntAim: { angle: number; power: number } | null;
    /** Set with a traversal request: the gate to cross (engine validates proximity). */
    traverseGate: string | null;
    /** Fast-travel request: fly to this point (engine consumes and clears). */
    flyTo: Vec2 | null;
  };
  /** Engine writes each frame (dev overlay + perf test). */
  perf: { drawCalls: number; fps: number; triangles: number };
}

/* ════════════════════════════════════════════════════════════════════════
 * 13. Engine: sprites, ECS entities, assets
 * ════════════════════════════════════════════════════════════════════════ */

/** 8-way facing index: 0 = S (toward camera), then clockwise S, SW, W, NW, N, NE, E, SE. */
export type Facing8 = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
export const FACING_NAMES = ['S', 'SW', 'W', 'NW', 'N', 'NE', 'E', 'SE'] as const;

export type SpriteAnim = 'idle' | 'walk' | 'action' | 'hurt';

/**
 * Sprite sheet layout: a grid of `cols × rows` equally sized frames.
 * Row = facing (0..7 for 8-way sheets, single row otherwise).
 * Each animation is a contiguous column range. UV frame animation offsets
 * `uvOffset = (col / cols, 1 − (row + 1) / rows)` with `uvScale = (1/cols, 1/rows)`.
 */
export interface SpriteSheetMeta {
  readonly id: SpriteSheetId;
  readonly cols: number;
  readonly rows: number;
  readonly frameWidth: number;
  readonly frameHeight: number;
  readonly directional: boolean;
  /** World height in metres the frame should be drawn at. */
  readonly worldHeight: number;
  readonly anims: Readonly<Partial<Record<SpriteAnim, { readonly from: number; readonly count: number; readonly fps: number }>>>;
}

/** Miniplex entity shape used by the engine's world. All components optional. */
export interface WorldEntity {
  id: string;
  position?: { x: number; y: number; z: number };
  velocity?: { x: number; z: number };
  sprite?: { sheet: SpriteSheetId; facing: Facing8; anim: SpriteAnim; frameTime: number; tint?: string; flash?: number };
  player?: { heroId: HeroId };
  follower?: { heroId: HeroId; slot: number };
  npc?: { npcId: NpcId };
  animal?: { state: AnimalState };
  fishingSpot?: { spotId: FishingSpotId };
  encounterZone?: { zoneId: string; encounterId: EncounterId };
  combatActor?: { combatantId: CombatantId; home: { x: number; z: number } };
  aura?: { colors: readonly string[]; intensity: number; broken: boolean };
  hiddenUntilDrakeSight?: true;
  chunk?: { cx: number; cz: number };
}
