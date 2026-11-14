import { useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { deriveHeroSheet, getServices, useGame, type HeroSheet } from '@/app/store';
import { FUSION_MAX_STACK, SPIRIT_IDS, type GearDef, type GearSlot, type HeroId, type ProgressionContext, type RelicGearDef, type SpiritId } from '@/types/contracts';
import { relicBreakdown, relicSparkline, sampleLevels, sparkPoints } from '../logic/relicBreakdown';
import { formatDelta, formatMultipliers, formatStatBlock, statRows } from '../logic/statFormat';
import { HeroPortrait, Sheet, TapButton, cx } from './common';

const SLOTS: readonly { slot: GearSlot; label: string; glyph: string }[] = [
  { slot: 'weapon', label: 'Weapon', glyph: '🗡' },
  { slot: 'armor', label: 'Armor', glyph: '🛡' },
  { slot: 'relic', label: 'Relic', glyph: '🔮' },
  { slot: 'signature', label: 'Signature', glyph: '✴' },
];

const SPARK_COLORS = ['#ffb347', '#7fc6ff', '#b6e388'];

function RelicPanel({ relic, ctx }: { relic: RelicGearDef; ctx: ProgressionContext }) {
  const { core } = getServices();
  const bonusAt = (c: ProgressionContext) => core.gear.bonus(relic, c);
  const breakdown = relicBreakdown(relic, ctx, bonusAt);
  const levels = sampleLevels(Math.max(20, ctx.level + 5), 10, ctx.level);
  const spark = relicSparkline(relic, ctx.liberatedRegions, levels, bonusAt);
  const W = 180;
  const H = 54;
  const curIdx = levels.indexOf(ctx.level);
  const curX = levels.length > 1 && curIdx >= 0 ? 2 + (curIdx * (W - 4)) / (levels.length - 1) : null;
  return (
    <div className="ew-relic" data-testid="relic-breakdown">
      <div className="ew-label">Scaling · {breakdown.formula}</div>
      <table className="ew-table ew-table--relic">
        <thead>
          <tr>
            <th />
            <th>Base</th>
            <th>Lv {ctx.level}</th>
            <th>Regions ×{ctx.liberatedRegions}</th>
            <th>Total</th>
            <th>Cap</th>
          </tr>
        </thead>
        <tbody>
          {breakdown.rows.map((r) => (
            <tr key={r.key} className={cx(r.capped && 'is-capped')}>
              <th>{r.label}</th>
              <td>{r.base}</td>
              <td className="is-up" title={`+${r.perLevel} × curve`}>
                {formatDelta(r.levelTerm) || '·'}
              </td>
              <td className="is-up" title={`+${r.perRegion} per region`}>
                {formatDelta(r.regionTerm) || '·'}
              </td>
              <td className="ew-strong">{r.total}</td>
              <td>{r.cap ?? '—'}{r.capped ? ' ●' : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="ew-spark">
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-label="Bonus versus level">
          {curX !== null && <line x1={curX} x2={curX} y1={0} y2={H} className="ew-spark__now" />}
          {spark.series.map((s, i) => (
            <polyline key={s.key} points={sparkPoints(s.values, spark.max, W, H)} fill="none" stroke={SPARK_COLORS[i % SPARK_COLORS.length]} strokeWidth={1.75} />
          ))}
        </svg>
        <div className="ew-spark__legend">
          {spark.series.map((s, i) => (
            <span key={s.key} style={{ color: SPARK_COLORS[i % SPARK_COLORS.length] }}>
              {s.label}
            </span>
          ))}
          <span className="ew-dim">
            Lv 1→{levels[levels.length - 1]}
          </span>
        </div>
      </div>
    </div>
  );
}

function GearPicker({ heroId, slot, onDone }: { heroId: HeroId; slot: GearSlot; onDone: () => void }) {
  const { gearOwned, roster, party, liberatedRegions } = useGame(useShallow((s) => ({ gearOwned: s.gearOwned, roster: s.roster, party: s.party, liberatedRegions: s.liberatedRegions })));
  const equip = useGame((s) => s.equip);
  const { db, core } = getServices();
  const level = roster[heroId]?.level ?? 1;
  const current = roster[heroId]?.loadout[slot];
  const options = gearOwned.map((id) => db.gear[id]).filter((g): g is GearDef => g !== undefined && g.slot === slot);
  return (
    <div className="ew-picker" data-testid={`inspector-picker-${slot}`}>
      {current && (
        <TapButton className="ew-pick" data-testid="inspector-unequip" onTap={() => { equip(heroId, slot, null); onDone(); }}>
          <span className="ew-pick__icon">∅</span>
          <span className="ew-pick__name">Unequip</span>
        </TapButton>
      )}
      {options.length === 0 && <p className="ew-empty">No {slot} gear owned.</p>}
      {options.map((g) => {
        const allowed = core.gear.canEquip(heroId, g);
        const wornBy = party.find((h) => h !== heroId && roster[h]?.loadout[slot] === g.id);
        const bonus = core.gear.bonus(g, { level, liberatedRegions: liberatedRegions.length });
        return (
          <TapButton
            key={g.id}
            className={cx('ew-pick', g.id === current && 'is-on')}
            data-testid={`inspector-gear-${g.id}`}
            disabled={!allowed || g.id === current}
            onTap={() => {
              equip(heroId, slot, g.id);
              onDone();
            }}
          >
            <span className="ew-pick__icon">{g.icon}</span>
            <span className="ew-pick__name">
              {g.name}
              <small>
                {formatStatBlock(bonus)}
                {g.archetype === 'relic' && ' · scales'}
                {!allowed && g.boundHero && ` · bound to ${db.heroes[g.boundHero].name}`}
                {wornBy && ` · worn by ${db.heroes[wornBy].name}`}
              </small>
              {g.archetype === 'signature' && <small className="ew-hook">{g.hookText}</small>}
            </span>
          </TapButton>
        );
      })}
    </div>
  );
}

function FusionPanel({ heroId, sheet }: { heroId: HeroId; sheet: HeroSheet }) {
  const stack = useGame((s) => s.roster[heroId]?.fusion);
  const owned = useGame((s) => s.spiritsOwned);
  const setFusion = useGame((s) => s.setFusion);
  const { db, core } = getServices();
  const hero = db.heroes[heroId];
  const current = stack ?? [];
  const canHost = hero.fusionAffinity.length > 0;
  const toggle = (id: SpiritId): void => {
    setFusion(heroId, current.includes(id) ? current.filter((s) => s !== id) : [...current, id]);
  };
  const fused = sheet.fused;
  return (
    <section className="ew-fusion" data-testid="fusion-panel">
      <h3>Warden Fusion</h3>
      {!canHost && <p className="ew-empty">{hero.name} cannot host a Warden.</p>}
      <div className="ew-spirits">
        {SPIRIT_IDS.map((id) => {
          const sp = db.spirits[id];
          const inStack = current.includes(id);
          const check = inStack ? { ok: true } : core.fusion.canFuse(hero, [...current, id], owned);
          const pos = current.indexOf(id);
          return (
            <TapButton
              key={id}
              className={cx('ew-spirit', inStack && 'is-on', !owned.includes(id) && 'is-sealed')}
              data-testid={`inspector-spirit-${id}`}
              disabled={!inStack && !check.ok}
              title={check.reason}
              style={{ ['--aura' as string]: sp.auraColor }}
              onTap={() => toggle(id)}
            >
              <span className="ew-spirit__name">
                {inStack && <b className="ew-spirit__pos">{pos + 1}</b>}
                {sp.name}
              </span>
              <small>{!check.ok && !inStack ? check.reason ?? 'Unavailable' : `${sp.element} · ${sp.epithet}`}</small>
            </TapButton>
          );
        })}
      </div>
      <div className="ew-fusion__actions">
        <span className="ew-dim">
          Stack {current.length}/{FUSION_MAX_STACK} (inner → outer)
        </span>
        {current.length === 2 && (
          <TapButton className="ew-btn--pill" data-testid="inspector-fusion-swap" onTap={() => setFusion(heroId, [...current].reverse())}>
            ⇄ Swap order
          </TapButton>
        )}
        {current.length > 0 && (
          <TapButton className="ew-btn--pill" data-testid="inspector-fusion-clear" onTap={() => setFusion(heroId, [])}>
            Release
          </TapButton>
        )}
      </div>
      {current.length > 0 && (
        <div className="ew-fusion__result" data-testid="fusion-result">
          <div className="ew-strong">{fused.title}</div>
          <ol className="ew-layers">
            {fused.layers.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ol>
          <div className="ew-chips">
            <span className="ew-tag">Armor pool {fused.armorMax}</span>
            <span className="ew-tag">Imbue {fused.basicAttackElement}</span>
            {fused.resonances.map((r) => (
              <span key={r} className="ew-tag ew-tag--res">
                ✧ {r}
              </span>
            ))}
          </div>
          {current.map((id) => {
            const m = formatMultipliers(db.spirits[id].statMultipliers);
            const b = formatStatBlock(db.spirits[id].statBonuses);
            return (
              <div key={id} className="ew-dim">
                {db.spirits[id].name}: {[m, b].filter(Boolean).join(' · ') || '—'}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

/** Equipment & Relic Synergy Inspector. */
export function Inspector() {
  const heroId = useGame((s) => s.ui.inspectorHero);
  const { party, roster, liberatedRegions } = useGame(useShallow((s) => ({ party: s.party, roster: s.roster, liberatedRegions: s.liberatedRegions })));
  const toggleInspector = useGame((s) => s.toggleInspector);
  const { db } = getServices();
  const [picking, setPicking] = useState<GearSlot | null>(null);

  const sheet = useMemo(() => {
    try {
      return deriveHeroSheet({ roster, liberatedRegions }, heroId);
    } catch {
      return null;
    }
  }, [roster, liberatedRegions, heroId]);
  const progress = roster[heroId];
  const hero = db.heroes[heroId];
  const ctx: ProgressionContext = { level: progress?.level ?? 1, liberatedRegions: liberatedRegions.length };
  const rows = sheet ? statRows(sheet.base, sheet.withGear, sheet.fused.stats) : [];
  const relicId = progress?.loadout.relic;
  const relic = relicId ? db.gear[relicId] : undefined;
  const sigId = progress?.loadout.signature;
  const sig = sigId ? db.gear[sigId] : undefined;

  return (
    <Sheet kind="sheet" title="Equipment & Synergy" onClose={() => toggleInspector(false)} closeTestId="inspector-close">
      <div className="ew-heroes">
        {party.map((id) => (
          <TapButton
            key={id}
            className={cx('ew-hero-tab', id === heroId && 'is-on')}
            data-testid={`inspector-hero-${id}`}
            style={{ ['--accent' as string]: db.heroes[id].accent }}
            onTap={() => {
              setPicking(null);
              toggleInspector(true, id);
            }}
          >
            <HeroPortrait heroId={id} />
            <span>{db.heroes[id].name}</span>
          </TapButton>
        ))}
      </div>
      {!progress || !sheet ? (
        <p className="ew-empty">{hero.name} has not joined the party.</p>
      ) : (
        <div className="ew-insp">
          <div className="ew-insp__col">
            <div className="ew-insp__who">
              <span className="ew-strong">{hero.name}</span> <span className="ew-dim">{hero.title} · Lv {progress.level}</span>
            </div>
            <div className="ew-slots">
              {SLOTS.map(({ slot, label, glyph }) => {
                const id = progress.loadout[slot];
                const g = id ? db.gear[id] : undefined;
                return (
                  <TapButton key={slot} className={cx('ew-slot', picking === slot && 'is-on')} data-testid={`inspector-slot-${slot}`} onTap={() => setPicking((p) => (p === slot ? null : slot))}>
                    <span className="ew-slot__icon">{g?.icon ?? glyph}</span>
                    <span className="ew-slot__text">
                      <small>{label}</small>
                      {g?.name ?? 'Empty'}
                    </span>
                  </TapButton>
                );
              })}
            </div>
            {picking && <GearPicker heroId={heroId} slot={picking} onDone={() => setPicking(null)} />}
            {sig?.archetype === 'signature' && (
              <div className="ew-sig" data-testid="signature-hook">
                <span className="ew-label">{sig.icon} {sig.name}</span>
                <p className="ew-hook">{sig.hookText}</p>
              </div>
            )}
            {relic?.archetype === 'relic' && <RelicPanel relic={relic} ctx={ctx} />}
          </div>
          <div className="ew-insp__col">
            <table className="ew-table" data-testid="stat-table">
              <thead>
                <tr>
                  <th />
                  <th>Base</th>
                  <th>+Gear</th>
                  <th>+Fusion</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key}>
                    <th>{r.label}</th>
                    <td>{r.base}</td>
                    <td>
                      {r.gear} <span className={`is-${r.gearTone}`}>{r.gearDelta}</span>
                    </td>
                    <td className="ew-strong">
                      {r.fused} <span className={`is-${r.fusionTone}`}>{r.fusionDelta}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <FusionPanel heroId={heroId} sheet={sheet} />
          </div>
        </div>
      )}
    </Sheet>
  );
}
