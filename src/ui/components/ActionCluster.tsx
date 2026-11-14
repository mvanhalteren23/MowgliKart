import { useCallback, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useGame, getServices } from '@/app/store';
import type { ContextAction, FieldActionDef, FieldActionId, HeroId } from '@/types/contracts';
import { performerFor } from '../logic/campaign';
import { cooldownFraction, cooldownSecondsLeft } from '../logic/hudMath';
import { CastPad } from './CastPad';
import { aimHandlers } from './HuntAim';
import { HeroPortrait, TapButton, cx } from './common';

const CONTEXT_GLYPH: Readonly<Record<ContextAction['kind'], string>> = { talk: '💬', fish: '🎣', encounter: '⚔', build: '🔨', traverse: '➚' };

const FALLBACK_DEF = (id: FieldActionId): FieldActionDef => ({ id, label: id, glyph: '✦', description: '', cooldownSec: 0, range: 0 });

function fieldDef(action: FieldActionId): FieldActionDef {
  return getServices().db.fieldActions[action] ?? FALLBACK_DEF(action);
}

function FieldButton({ action, onCast }: { action: FieldActionId; onCast: () => void }) {
  const readyAt = useGame((s) => s.fieldCooldowns[action]);
  const worldTime = useGame((s) => s.worldTime);
  const ctx = useGame((s) => s.contextAction);
  const perform = useGame((s) => s.performFieldAction);
  const def = fieldDef(action);
  const frac = cooldownFraction(readyAt, worldTime, def.cooldownSec);
  const secs = cooldownSecondsLeft(readyAt, worldTime);
  const atGate = ctx?.kind === 'traverse' && ctx.action === action;
  const disabled = frac > 0 || (action === 'fish' && ctx?.kind !== 'fish') || (def.clears !== undefined && !atGate);
  const common = {
    className: cx('ew-field', frac > 0 && 'is-cooling', atGate && 'is-ready', def.clears && 'is-traversal'),
    'data-testid': `btn-field-${action}`,
    'aria-label': def.label,
    title: def.description,
    style: { ['--cd' as string]: `${frac * 360}deg` },
  };
  const body = (
    <>
      <span className="ew-field__glyph">{def.glyph}</span>
      <span className="ew-field__label">{secs > 0 ? `${secs}s` : def.label}</span>
    </>
  );
  if (action === 'huntShot') {
    // Press-and-drag back from the bow button to aim; a short tap looses a plain shot.
    const h = aimHandlers();
    return (
      <button
        type="button"
        {...common}
        className={cx('ew-btn', common.className)}
        disabled={disabled}
        {...h}
        onClick={(e) => {
          if (e.detail === 0 && !disabled) perform('huntShot');
        }}
      >
        {body}
      </button>
    );
  }
  return (
    <TapButton {...common} disabled={disabled} onTap={() => (action === 'fish' ? onCast() : perform(action))}>
      {body}
    </TapButton>
  );
}

/** Bottom-right cluster: big contextual button + every field action of the leader. */
export function ActionCluster() {
  const ctx = useGame((s) => s.contextAction);
  const { leader, party } = useGame(useShallow((s) => ({ leader: s.leader, party: s.party })));
  const trigger = useGame((s) => s.triggerContextAction);
  const [casting, setCasting] = useState(false);
  const closeCast = useCallback(() => setCasting(false), []);
  const { db } = getServices();
  const actions = db.heroes[leader].fieldActions.filter((a) => a !== 'none');

  let glyph = ctx ? CONTEXT_GLYPH[ctx.kind] : '✦';
  let performer: HeroId | null = null;
  if (ctx?.kind === 'traverse') {
    glyph = fieldDef(ctx.action).glyph;
    performer = performerFor(ctx.action, leader, party, db.heroes);
  }
  const swap = performer !== null && performer !== leader;

  return (
    <>
      <div className="ew-cluster">
        <div className={cx('ew-cluster__fields', actions.length > 2 && 'is-many')}>
          {actions.map((a) => (
            <FieldButton key={a} action={a} onCast={() => setCasting(true)} />
          ))}
        </div>
        <TapButton
          className={cx('ew-context', !ctx && 'is-idle', ctx?.kind === 'traverse' && 'is-traverse')}
          data-testid="btn-context"
          data-kind={ctx?.kind ?? 'none'}
          disabled={!ctx}
          onTap={() => (ctx?.kind === 'fish' ? setCasting(true) : trigger())}
          aria-label={ctx ? `${ctx.label}${performer ? ` (${db.heroes[performer].name})` : ''}` : 'No action'}
        >
          <span className="ew-context__glyph">{glyph}</span>
          <span className="ew-context__label">{ctx?.label ?? '—'}</span>
          {performer && (
            <span className={cx('ew-context__who', swap && 'is-swap')} data-testid="context-performer" title={db.heroes[performer].name}>
              <HeroPortrait heroId={performer} />
              {swap && <span className="ew-context__swap">⇄</span>}
            </span>
          )}
        </TapButton>
      </div>
      {casting && <CastPad onClose={closeCast} />}
    </>
  );
}
