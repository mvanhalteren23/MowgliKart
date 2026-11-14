import { useEffect, useRef, useState } from 'react';
import { getServices, useGame } from '@/app/store';
import type { Combatant, CombatantId, CombatState, SkillId } from '@/types/contracts';
import { armorPips, formatCombatEvent, sortForms, targetModeFor, type TargetMode } from '../logic/combatText';
import type { TickNumber } from '../logic/hazards';
import { Bar, HeroPortrait, SpritePortrait, TapButton, cx } from './common';
import { HazardChips, TickNumbers, useHazardTicks } from './Hazards';
import { QteFeedback, QteOverlay } from './QteOverlay';

type Pending = { readonly kind: 'attack' } | { readonly kind: 'skill'; readonly skillId: SkillId; readonly mode: TargetMode };

function maxOf(combat: CombatState, c: Combatant): { maxHp: number; maxAp: number } {
  try {
    const s = getServices().core.combat.effectiveStats(combat, c.id);
    return { maxHp: s.maxHp, maxAp: s.maxAp };
  } catch {
    return { maxHp: c.baseStats.maxHp, maxAp: c.baseStats.maxAp };
  }
}

function PartyCard({ combat, c, targetable, onPick, compact, ticks }: { combat: CombatState; c: Combatant; targetable: boolean; onPick: () => void; compact: boolean; ticks: readonly TickNumber[] }) {
  const { db } = getServices();
  const max = maxOf(combat, c);
  const hero = c.heroId ? db.heroes[c.heroId] : undefined;
  const drake = (hero?.dragonForms.length ?? 0) > 0;
  const form = c.dragon ? db.dragonForms[c.dragon.formId] : undefined;
  const [filled, total] = c.fusion ? armorPips(c.fusion.armor, c.fusion.armorMax) : [0, 0];
  return (
    <TapButton
      className={cx('ew-pcard', combat.activeId === c.id && 'is-active', !c.alive && 'is-ko', targetable && 'is-target')}
      data-testid={`combat-target-${c.id}`}
      disabled={!targetable}
      style={{ ['--accent' as string]: hero?.accent ?? '#e8c26a' }}
      onTap={onPick}
    >
      {c.heroId && <HeroPortrait heroId={c.heroId} className="ew-pcard__face" />}
      <span className="ew-pcard__main">
        <span className="ew-pcard__name">
          {c.name}
          {form && <span className="ew-badge ew-badge--dragon">🐉 {form.name} {c.dragon ? `${c.dragon.turnsInForm}/${form.maxTurns}` : ''}</span>}
          {c.guarding && <span className="ew-badge">🛡</span>}
        </span>
        {compact ? (
          <>
            <span className="ew-pcard__nums">
              <span className="ew-pcard__hp">{Math.round(c.hp)}</span>/{Math.round(max.maxHp)} · <span className="ew-pcard__ap">{Math.round(c.ap)} AP</span>
              {drake && <span className="ew-pcard__sync"> · {Math.round(c.sync)}%</span>}
            </span>
            <Bar value={c.hp} max={max.maxHp} tone="hp" label="HP" thin />
            <Bar value={c.ap} max={max.maxAp} tone="ap" label="AP" thin />
            {drake && <Bar value={c.sync} max={100} tone="sync" label="Sync" thin />}
          </>
        ) : (
          <>
            <Bar value={c.hp} max={max.maxHp} tone="hp" label="HP" />
            <Bar value={c.ap} max={max.maxAp} tone="ap" label="AP" />
            {drake && <Bar value={c.sync} max={100} tone="sync" label="Sync" />}
          </>
        )}
        {c.fusion && (
          <span className={cx('ew-armor', c.fusion.broken && 'is-broken')} data-testid={`armor-${c.id}`}>
            {c.fusion.broken ? (
              <span className="ew-badge ew-badge--broken">BROKEN · {c.fusion.brokenTurns}</span>
            ) : (
              Array.from({ length: total }, (_, i) => <span key={i} className={cx('ew-pip', i < filled && 'is-full')} />)
            )}
          </span>
        )}
        {c.statuses.length > 0 && <span className="ew-statuses">{c.statuses.map((s) => `${s.id}(${s.turns})`).join(' ')}</span>}
      </span>
      <TickNumbers ticks={ticks} id={c.id} />
    </TapButton>
  );
}

function EnemyPlate({ combat, c, targetable, onPick, ticks }: { combat: CombatState; c: Combatant; targetable: boolean; onPick: () => void; ticks: readonly TickNumber[] }) {
  const max = maxOf(combat, c);
  return (
    <TapButton
      className={cx('ew-eplate', combat.activeId === c.id && 'is-active', targetable && 'is-target')}
      data-testid={`combat-target-${c.id}`}
      disabled={!targetable}
      onTap={onPick}
    >
      <SpritePortrait sprite={c.sprite} className="ew-eplate__face" />
      <span className="ew-eplate__main">
        <span className="ew-eplate__name">
          {c.name} <small>Lv {c.level}</small>
        </span>
        <Bar value={c.hp} max={max.maxHp} tone="hp" thin />
        {c.statuses.length > 0 && <span className="ew-statuses">{c.statuses.map((s) => s.id).join(' ')}</span>}
      </span>
      <TickNumbers ticks={ticks} id={c.id} />
    </TapButton>
  );
}

function CombatLog({ combat }: { combat: CombatState }) {
  const seen = useRef(0);
  const seq = useRef(0);
  const [lines, setLines] = useState<readonly { id: number; text: string }[]>([]);
  useEffect(() => {
    const { db } = getServices();
    const fresh = combat.log.slice(seen.current);
    seen.current = combat.log.length;
    const nameOf = (id: CombatantId): string => combat.combatants[id]?.name ?? id;
    const texts = fresh
      .map((ev) =>
        formatCombatEvent(ev, nameOf, (id) => db.skills[id]?.name ?? id, (id) => db.dragonForms[id]?.name ?? id, {
          reaction: (id) => db.reactions?.find((r) => r.id === id)?.name ?? id,
          hazard: (id) => db.hazards?.[id]?.name ?? id,
        }),
      )
      .filter((t): t is string => t !== null);
    if (texts.length === 0) return;
    setLines((prev) => [...prev, ...texts.map((text) => ({ id: seq.current++, text }))].slice(-3));
  }, [combat]);
  return (
    <div className="ew-clog" aria-live="polite" data-testid="combat-log">
      {lines.map((l) => (
        <div key={l.id} className={cx('ew-clog__line', l.text.endsWith('!') && 'is-loud')}>
          {l.text}
        </div>
      ))}
    </div>
  );
}

function CommandMenu({ combat, actor, pending, setPending }: { combat: CombatState; actor: Combatant; pending: Pending | null; setPending: (p: Pending | null) => void }) {
  const act = useGame((s) => s.combatAct);
  const { db, core } = getServices();
  const [tab, setTab] = useState<'skills' | 'dragon'>('skills');
  const skills = core.combat.availableSkills(combat, actor.id);
  const forms = sortForms(core.combat.availableForms(combat, actor.id), (id) => db.dragonForms[id]?.apex === true);
  const pick = (skillId: SkillId): void => {
    const def = db.skills[skillId];
    if (!def) return;
    const mode = targetModeFor(def.target);
    if (mode === 'none') act({ type: 'skill', skillId });
    else setPending({ kind: 'skill', skillId, mode });
  };
  if (pending) {
    const label = pending.kind === 'attack' ? 'Attack' : db.skills[pending.skillId]?.name ?? pending.skillId;
    const who = pending.kind === 'skill' && pending.mode === 'ally' ? 'an ally' : 'an enemy';
    return (
      <div className="ew-cmd ew-cmd--picking">
        <div className="ew-cmd__hint">
          {label}: choose {who}
        </div>
        <TapButton className="ew-cmdbtn" data-testid="combat-cancel" onTap={() => setPending(null)}>
          ✕ Cancel
        </TapButton>
      </div>
    );
  }
  return (
    <div className="ew-cmd" data-testid="combat-menu">
      <div className="ew-cmd__primary">
        <TapButton className="ew-cmdbtn ew-cmdbtn--main" data-testid="combat-attack" onTap={() => setPending({ kind: 'attack' })}>
          ⚔ Attack
        </TapButton>
        <TapButton className="ew-cmdbtn" data-testid="combat-guard" onTap={() => act({ type: 'guard' })}>
          🛡 Guard
        </TapButton>
        {actor.dragon ? (
          <TapButton className="ew-cmdbtn ew-cmdbtn--dragon" data-testid="combat-revert" onTap={() => act({ type: 'revert' })}>
            ↺ Revert
          </TapButton>
        ) : (
          <TapButton className="ew-cmdbtn" data-testid="combat-flee" disabled={!combat.canFlee} onTap={() => act({ type: 'flee' })}>
            ➶ Flee
          </TapButton>
        )}
      </div>
      <div className="ew-cmd__panel">
        {forms.length > 0 && (
          <div className="ew-cmd__tabs">
            <TapButton className={cx('ew-tab', tab === 'skills' && 'is-on')} data-testid="combat-tab-skills" onTap={() => setTab('skills')}>
              Skills
            </TapButton>
            <TapButton className={cx('ew-tab', tab === 'dragon' && 'is-on')} data-testid="combat-tab-dragon" onTap={() => setTab('dragon')}>
              🐉 Dragon
            </TapButton>
          </div>
        )}
        <div className="ew-cmd__list">
          {(tab === 'skills' || forms.length === 0) &&
            (skills.length === 0 ? (
              <p className="ew-empty">No skills.</p>
            ) : (
              skills.map((id) => {
                const def = db.skills[id];
                const cost = def?.apCost ?? 0;
                return (
                  <TapButton key={id} className="ew-skill" data-testid={`combat-skill-${id}`} disabled={!def || actor.ap < cost} onTap={() => pick(id)}>
                    <span>{def?.name ?? id}</span>
                    <small>
                      {cost} AP · {def?.element}
                    </small>
                  </TapButton>
                );
              })
            ))}
          {tab === 'dragon' &&
            forms.length > 0 &&
            forms.map((f) => {
              const def = db.dragonForms[f.formId];
              const lockedByStory = !f.usable && def?.requiresFlag !== undefined;
              return (
                <TapButton
                  key={f.formId}
                  className={cx('ew-skill', 'ew-skill--dragon', def?.apex && 'is-apex', lockedByStory && 'is-sealed')}
                  data-testid={`combat-transform-${f.formId}`}
                  disabled={!f.usable || actor.dragon !== null}
                  onTap={() => act({ type: 'transform', formId: f.formId })}
                >
                  <span>
                    {lockedByStory ? '🔒 ' : ''}
                    {def?.name ?? f.formId}
                    {def?.apex && <span className="ew-badge ew-badge--dragon">Apex</span>}
                  </span>
                  <small>{f.usable ? `${def?.apCostToEnter ?? 0} AP · −${def?.apDrainPerTurn ?? 0}/turn` : f.reason ?? `Sync ${def?.syncRequired ?? '?'}`}</small>
                </TapButton>
              );
            })}
        </div>
      </div>
    </div>
  );
}

function ResultPanel({ combat }: { combat: CombatState }) {
  const endCombat = useGame((s) => s.endCombat);
  const { db } = getServices();
  const r = combat.rewards;
  const title = combat.phase === 'victory' ? 'Victory' : combat.phase === 'defeat' ? 'Defeat' : 'Escaped';
  const region = r?.liberatesRegion ? db.world.regions.find((x) => x.id === r.liberatesRegion)?.name ?? r.liberatesRegion : null;
  return (
    <div className="ew-result-root">
      <section className={cx('ew-result', `is-${combat.phase}`)} data-testid="combat-result">
        <h2>{title}</h2>
        {combat.phase === 'victory' && r && (
          <ul className="ew-result__list">
            <li>✦ {r.xp} XP</li>
            <li>◉ {r.coin} coin</li>
            {r.items.map((it) => (
              <li key={it.itemId}>
                {db.items[it.itemId]?.icon ?? '•'} {db.items[it.itemId]?.name ?? it.itemId} ×{it.qty}
              </li>
            ))}
            {region && <li className="ew-strong">🏳 {region} liberated!</li>}
          </ul>
        )}
        {combat.phase === 'defeat' && <p>The party falls back to regroup.</p>}
        {combat.phase === 'fled' && <p>You slip away into the night.</p>}
        <TapButton className="ew-btn--primary" data-testid="combat-continue" onTap={endCombat}>
          Continue
        </TapButton>
      </section>
    </div>
  );
}

const EMPTY_COMBAT: CombatState = {
  encounterId: '',
  phase: 'awaitingInput',
  round: 0,
  order: [],
  turnIndex: 0,
  activeId: null,
  combatants: {},
  log: [],
  rng: 0,
  canFlee: false,
  liberatedRegions: 0,
  rewards: null,
};

/** Turn-based combat overlay. Enemy pacing is the store's job; this only renders + issues player actions. */
export function CombatHud() {
  const combat = useGame((s) => s.combat);
  const act = useGame((s) => s.combatAct);
  const [pending, setPending] = useState<Pending | null>(null);
  const ticks = useHazardTicks(combat ?? EMPTY_COMBAT);

  const activeId = combat?.activeId ?? null;
  const phase = combat?.phase;
  const logLen = combat?.log.length ?? 0;
  useEffect(() => setPending(null), [activeId, phase, logLen]);

  if (!combat) return null;
  const all = Object.values(combat.combatants);
  const party = all.filter((c) => c.side === 'party');
  const enemies = all.filter((c) => c.side === 'enemy');
  const actor = combat.activeId ? combat.combatants[combat.activeId] : undefined;
  const qte = combat.qte ?? null;
  const awaiting = combat.phase === 'awaitingInput' && actor?.side === 'party' && !qte;
  const over = combat.phase === 'victory' || combat.phase === 'defeat' || combat.phase === 'fled';
  const enemyPick = awaiting && (pending === null || pending.kind === 'attack' || pending.mode === 'enemy');
  const allyPick = awaiting && pending?.kind === 'skill' && pending.mode === 'ally';

  const target = (id: CombatantId): void => {
    if (!awaiting) return;
    if (pending?.kind === 'skill') act({ type: 'skill', skillId: pending.skillId, targetId: id });
    else act({ type: 'attack', targetId: id }); // tapping an enemy with nothing pending = quick attack
    setPending(null);
  };

  return (
    <div className="ew-combat" data-testid="combat-hud" data-phase={combat.phase}>
      <div className="ew-enemies">
        {enemies.map((c) =>
          c.alive ? <EnemyPlate key={c.id} combat={combat} c={c} targetable={enemyPick} onPick={() => target(c.id)} ticks={ticks} /> : null,
        )}
        <HazardChips combat={combat} side="enemy" />
      </div>
      <div className={cx('ew-party', party.length > 3 && 'ew-party--compact')}>
        <HazardChips combat={combat} side="party" />
        {party.map((c) => (
          <PartyCard key={c.id} combat={combat} c={c} targetable={allyPick} compact={party.length > 3} onPick={() => target(c.id)} ticks={ticks} />
        ))}
      </div>
      <CombatLog combat={combat} />
      <div className="ew-round">Round {combat.round}</div>
      {awaiting && actor && <CommandMenu combat={combat} actor={actor} pending={pending} setPending={setPending} />}
      {combat.phase === 'enemyTurn' && <div className="ew-cmd ew-cmd--wait">Enemy turn…</div>}
      {qte && combat.phase === 'awaitingInput' && <QteOverlay key={`${combat.log.length}:${qte.actorId}:${qte.skillId}`} qte={qte} />}
      <QteFeedback combat={combat} />
      {over && <ResultPanel combat={combat} />}
    </div>
  );
}
