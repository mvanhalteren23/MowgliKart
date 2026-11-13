import { useGame, getServices } from '@/app/store';
import type { ContextAction, FieldActionId } from '@/types/contracts';
import { cooldownFraction, cooldownSecondsLeft } from '../logic/hudMath';
import { TapButton, cx } from './common';

const CONTEXT_GLYPH: Readonly<Record<ContextAction['kind'], string>> = { talk: '💬', fish: '🎣', encounter: '⚔', build: '🔨' };

function FieldButton({ action }: { action: FieldActionId }) {
  const readyAt = useGame((s) => s.fieldCooldowns[action]);
  const worldTime = useGame((s) => s.worldTime);
  const fishCtx = useGame((s) => s.contextAction?.kind === 'fish');
  const perform = useGame((s) => s.performFieldAction);
  const def = getServices().db.fieldActions[action];
  const frac = cooldownFraction(readyAt, worldTime, def.cooldownSec);
  const secs = cooldownSecondsLeft(readyAt, worldTime);
  const disabled = frac > 0 || (action === 'fish' && !fishCtx);
  return (
    <TapButton
      className={cx('ew-field', frac > 0 && 'is-cooling')}
      data-testid={`btn-field-${action}`}
      disabled={disabled}
      aria-label={def.label}
      style={{ ['--cd' as string]: `${frac * 360}deg` }}
      onTap={() => perform(action)}
    >
      <span className="ew-field__glyph">{def.glyph}</span>
      <span className="ew-field__label">{secs > 0 ? `${secs}s` : def.label}</span>
    </TapButton>
  );
}

/** Bottom-right cluster: big contextual button + the leader's field actions. */
export function ActionCluster() {
  const ctx = useGame((s) => s.contextAction);
  const leader = useGame((s) => s.leader);
  const trigger = useGame((s) => s.triggerContextAction);
  const actions = getServices().db.heroes[leader].fieldActions.filter((a) => a !== 'none');
  return (
    <div className="ew-cluster">
      <div className="ew-cluster__fields">
        {actions.map((a) => (
          <FieldButton key={a} action={a} />
        ))}
      </div>
      <TapButton className={cx('ew-context', !ctx && 'is-idle')} data-testid="btn-context" disabled={!ctx} onTap={trigger} aria-label={ctx?.label ?? 'No action'}>
        <span className="ew-context__glyph">{ctx ? CONTEXT_GLYPH[ctx.kind] : '✦'}</span>
        <span className="ew-context__label">{ctx?.label ?? '—'}</span>
      </TapButton>
    </div>
  );
}
