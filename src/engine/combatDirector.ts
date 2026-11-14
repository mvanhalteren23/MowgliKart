/**
 * Seamless battle staging: on `mode === 'combat'` the combatants are spawned as
 * `combatActor` entities in a line around the player's position (no scene
 * swap) and animated from the combat event log.
 */
import { getSpriteMeta, sampleHeight, WATER_LEVEL } from '@/engine/bootstrapAssets';
import type { Combatant, CombatantId, CombatState, GameDatabase, Vec2, WorldMapDef } from '@/types/contracts';
import { cuesFromEvents, lungeCurve, stageExtent, stageLayout, type ActorCue } from './combatStaging';
import { spriteWorldSize } from './spriteMath';
import { setAnim, type EngineEntity, type EngineWorld } from './ecs';
import { HitStopClock } from './hitStop';

interface Actor {
  readonly entity: EngineEntity;
  /** Current (animated) stage position. */
  readonly home: { x: number; z: number };
  /** Where the layout wants it (changes when a neighbour transforms). */
  readonly target: { x: number; z: number };
  readonly side: 'party' | 'enemy';
  baseHeading: number;
  lungeT: number;
  lungeDir: { x: number; z: number };
  hurtT: number;
  flash: number;
  healT: number;
}

const LUNGE_DISTANCE = 1.5;

export class CombatDirector {
  private actors = new Map<CombatantId, Actor>();
  private snapshot: readonly EngineEntity[] = [];
  private readonly listeners = new Set<() => void>();
  private pending: { cue: ActorCue; at: number }[] = [];
  private lastLog = 0;
  private active: CombatState | null = null;
  anchor: Vec2 | null = null;
  /** Centre x/z and full width (m) of the staged line-up, for the battle camera. */
  frame: { x: number; z: number; width: number } | null = null;
  /** Freeze-frame clock driven by `hitStop` events. */
  readonly hitStop = new HitStopClock();

  constructor(
    private readonly ecs: EngineWorld,
    private readonly db: GameDatabase,
    private readonly world: WorldMapDef,
  ) {}

  /** React external-store hooks (CombatStage renders one BillboardSprite per actor). */
  readonly subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  readonly getSnapshot = (): readonly EngineEntity[] => this.snapshot;

  get isStaged(): boolean {
    return this.active !== null;
  }

  private emit(): void {
    this.snapshot = [...this.actors.values()].map((a) => a.entity);
    for (const fn of this.listeners) fn();
  }

  private ground(x: number, z: number): number {
    return Math.max(sampleHeight(this.world, x, z), WATER_LEVEL - 0.3);
  }

  update(dt: number, time: number, combat: CombatState | null, inCombat: boolean, player: Vec2): void {
    if (inCombat && combat && !this.active) this.start(combat, player);
    else if ((!inCombat || !combat) && this.active) this.stop();
    if (!this.active || !combat) return;
    this.active = combat;

    if (combat.log.length > this.lastLog) {
      const cues = cuesFromEvents(combat.log.slice(this.lastLog));
      this.lastLog = combat.log.length;
      for (const cue of cues) this.pending.push({ cue, at: time + cue.delay });
    }
    // Hit-stop: frozen time does not count — cues wait and actor clocks hold.
    const adt = this.hitStop.effectiveDt(time, dt);
    const held = dt - adt;
    if (held > 0) for (const p of this.pending) p.at += held;
    this.pending = this.pending.filter((p) => {
      if (p.at > time) return true;
      this.apply(p.cue, time);
      return false;
    });
    const frozen = this.hitStop.frozen(time);

    let relayout = false;
    for (const [id, a] of this.actors) {
      const c = combat.combatants[id];
      const e = a.entity;
      if (!c || !e.sprite) continue;
      const sheet = this.sheetOf(c);
      if (sheet !== e.sprite.sheet) {
        e.sprite.sheet = sheet;
        a.flash = Math.max(a.flash, 1);
        relayout = true;
      }
    }
    if (relayout) this.layout(combat);
    const slide = 1 - Math.exp(-6 * adt);

    for (const [id, a] of this.actors) {
      const c = combat.combatants[id];
      const e = a.entity;
      if (!c || !e.sprite || !e.position) continue;
      a.home.x += (a.target.x - a.home.x) * slide;
      a.home.z += (a.target.z - a.home.z) * slide;
      if (e.combatActor) {
        e.combatActor.home.x = a.home.x;
        e.combatActor.home.z = a.home.z;
      }
      // Warden aura: dims and gutters while the fusion is broken.
      const spirits = c.fusion?.spirits ?? [];
      if (c.fusion && spirits.length > 0) {
        const colors = spirits.map((s) => this.db.spirits[s]?.auraColor ?? '#ffffff');
        e.aura = { colors, intensity: c.fusion.broken ? 0.55 : c.dragon ? 1.25 : 1, broken: c.fusion.broken };
      } else delete e.aura;

      e.frozen = frozen;
      a.lungeT += adt;
      a.hurtT = Math.max(0, a.hurtT - adt);
      a.healT = Math.max(0, a.healT - adt);
      a.flash = Math.max(0, a.flash - adt * 3.5);
      const off = lungeCurve(a.lungeT) * LUNGE_DISTANCE;
      const x = a.home.x + a.lungeDir.x * off;
      const z = a.home.z + a.lungeDir.z * off;
      e.position.x = x;
      e.position.z = z;
      e.position.y = this.ground(x, z);
      e.heading = a.baseHeading;
      const opTarget = c.alive ? 1 : a.side === 'party' ? 0.45 : 0;
      const op = e.opacity ?? 1;
      e.opacity = op + Math.sign(opTarget - op) * Math.min(Math.abs(opTarget - op), dt * 1.4);
      setAnim(e, !c.alive || a.hurtT > 0 ? 'hurt' : a.lungeT < 0.45 ? 'action' : 'idle');
      e.sprite.flash = a.flash;
      e.sprite.tint = a.healT > 0 ? '#b8ffb0' : c.alive ? undefined : '#9c94a8';
      e.scale = combat.activeId === id && c.alive ? 1 + Math.sin(time * 6) * 0.015 : 1;
    }
  }

  private apply(cue: ActorCue, time: number): void {
    if (cue.kind === 'hitStop') {
      this.hitStop.trigger(time, cue.amount ?? 0);
      return;
    }
    const a = this.actors.get(cue.actorId);
    if (!a) return;
    switch (cue.kind) {
      case 'lunge': {
        const t = cue.targetId ? this.actors.get(cue.targetId) : undefined;
        const dx = t ? t.home.x - a.home.x : a.side === 'party' ? 1 : -1;
        const dz = t ? t.home.z - a.home.z : 0;
        const d = Math.hypot(dx, dz) || 1;
        a.lungeDir = { x: dx / d, z: dz / d };
        a.lungeT = 0;
        break;
      }
      case 'hit':
        a.flash = 1;
        a.hurtT = 0.4;
        break;
      case 'heal':
        a.healT = 0.6;
        break;
      case 'transform':
      case 'revert':
      case 'armorBreak':
      case 'armorRestore':
        a.flash = 1;
        break;
      case 'guard':
        a.lungeDir = { x: 0, z: 0 };
        a.lungeT = 0;
        break;
      default:
        break;
    }
  }

  /** Centre and width (m) of one side of the line-up (hazard FX sit under it). */
  sideSpan(side: 'party' | 'enemy'): { x: number; z: number; width: number } | null {
    let min = Infinity;
    let max = -Infinity;
    let z = 0;
    let n = 0;
    for (const a of this.actors.values()) {
      if (a.side !== side) continue;
      min = Math.min(min, a.home.x);
      max = Math.max(max, a.home.x);
      z += a.home.z;
      n++;
    }
    if (n === 0) return null;
    return { x: (min + max) / 2, z: z / n, width: max - min + 2.4 };
  }

  /** Sprite sheet a combatant shows right now (dragon form while transformed). */
  private sheetOf(c: Combatant): string {
    return c.dragon ? (this.db.dragonForms[c.dragon.formId]?.sprite ?? c.sprite) : c.sprite;
  }

  private widthOf = (c: Combatant): number => spriteWorldSize(getSpriteMeta(this.sheetOf(c))).width;

  /** Recompute stage targets (edge-to-edge by current sprite widths) and the camera frame. */
  private layout(combat: CombatState): void {
    if (!this.anchor) return;
    const list = Object.values(combat.combatants);
    const layout = stageLayout(list, this.anchor, this.widthOf);
    const widths = new Map(list.map((c) => [c.id, this.widthOf(c)] as const));
    for (const [id, p] of layout) {
      const a = this.actors.get(id);
      if (a) {
        a.target.x = p.x;
        a.target.z = p.z;
      }
    }
    const ext = stageExtent(layout, widths);
    this.frame = { x: (ext.minX + ext.maxX) / 2, z: this.anchor.z, width: ext.maxX - ext.minX };
  }

  private start(combat: CombatState, player: Vec2): void {
    this.active = combat;
    this.anchor = { x: player.x, z: player.z };
    this.lastLog = 0;
    this.pending = [];
    const list = Object.values(combat.combatants);
    const layout = stageLayout(list, this.anchor, this.widthOf);
    for (const c of list) {
      const p = layout.get(c.id);
      if (!p) continue;
      const entity: EngineEntity = {
        id: `combat:${c.id}`,
        position: { x: p.x, y: this.ground(p.x, p.z), z: p.z },
        sprite: { sheet: this.sheetOf(c), facing: 0, anim: 'idle', frameTime: Math.abs(p.z) % 1 },
        combatActor: { combatantId: c.id, home: { x: p.x, z: p.z } },
        heading: p.heading,
        opacity: c.alive ? 1 : 0,
      };
      this.ecs.add(entity);
      this.actors.set(c.id, { entity, home: { x: p.x, z: p.z }, target: { x: p.x, z: p.z }, side: c.side, baseHeading: p.heading, lungeT: 9, lungeDir: { x: 0, z: 0 }, hurtT: 0, flash: 0, healT: 0 });
    }
    this.layout(combat);
    this.emit();
  }

  private stop(): void {
    for (const a of this.actors.values()) this.ecs.remove(a.entity);
    this.actors.clear();
    this.pending = [];
    this.active = null;
    this.anchor = null;
    this.frame = null;
    this.hitStop.reset();
    this.emit();
  }

  dispose(): void {
    if (this.active) this.stop();
    this.listeners.clear();
  }
}
