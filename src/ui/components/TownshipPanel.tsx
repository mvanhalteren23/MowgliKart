import { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { getServices, useGame } from '@/app/store';
import type { BuildingDef, PlotDef } from '@/types/contracts';
import { costView, maxLevelOf, propScaleAt, upgradeTimeline, type CostView } from '../logic/campaign';
import { Sheet, TapButton, cx } from './common';

type TownTab = 'settlers' | 'plots' | 'upgrades';

function CostLine({ view, testId }: { view: CostView; testId?: string }) {
  if (view.parts.length === 0) return <small className="ew-cost">Free</small>;
  return (
    <small className="ew-cost" data-testid={testId}>
      {view.parts.map((p) => (
        <span key={p.key} className={cx('ew-cost__part', p.ok ? 'is-ok' : 'is-short')}>
          {p.label} {p.have}/{p.need}
        </span>
      ))}
    </small>
  );
}

/** Isometric CSS block whose footprint/height follows the level's `propScale`. */
function IsoPreview({ scale, level }: { scale: number; level: number }) {
  const s = Math.max(0.6, Math.min(2, scale));
  return (
    <div className="ew-iso" aria-hidden="true" style={{ ['--s' as string]: String(s) }} data-level={level}>
      <div className="ew-iso__stack">
        <div className="ew-iso__roof" />
        <div className="ew-iso__left" />
        <div className="ew-iso__right" />
      </div>
      <span className="ew-iso__lv">Lv {level}</span>
    </div>
  );
}

function UpgradeCard({ plot, building, level }: { plot: PlotDef; building: BuildingDef; level: number }) {
  const { township, flags, questLog, coin, inventory } = useGame(
    useShallow((s) => ({ township: s.township, flags: s.flags, questLog: s.questLog, coin: s.coin, inventory: s.inventory })),
  );
  const upgrade = useGame((s) => s.upgradeBuilding);
  const { db, core, systems } = getServices();
  const itemName = (id: string): string => db.items[id]?.name ?? id;
  const steps = upgradeTimeline(building, level);
  const maxed = level >= maxLevelOf(building);
  let check: { ok: boolean; reason?: string } = { ok: false, reason: 'Fully upgraded' };
  if (!maxed) {
    try {
      check = systems.township.canUpgrade(plot.id, township, coin, inventory, flags, core.quests.evaluate, questLog);
    } catch {
      check = { ok: false, reason: 'Upgrades unavailable' };
    }
  }
  return (
    <article className="ew-upcard" data-testid={`township-upgrade-card-${plot.id}`}>
      <IsoPreview scale={propScaleAt(building, level)} level={level} />
      <div className="ew-upcard__main">
        <div className="ew-upcard__head">
          <span className="ew-strong">{building.name}</span>
          <span className="ew-dim">· {plot.name}</span>
          <span className="ew-badge ew-badge--active">Lv {level}</span>
        </div>
        <ol className="ew-timeline">
          {steps.map((st) => (
            <li key={st.level} className={cx('ew-timeline__step', `is-${st.state}`)}>
              <span className="ew-timeline__dot">{st.state === 'done' || st.state === 'current' ? '◆' : '◇'}</span>
              <span className="ew-timeline__text">
                <span className="ew-strong">
                  {st.level}. {st.name}
                </span>
                <small>{st.perk}</small>
                {st.cost && st.state !== 'done' && st.state !== 'current' && <CostLine view={costView(st.cost, coin, inventory, itemName)} />}
                {st.requirementText && st.state !== 'done' && st.state !== 'current' && <small className="ew-dim">⚑ {st.requirementText}</small>}
              </span>
            </li>
          ))}
        </ol>
        <div className="ew-upcard__actions">
          {!check.ok && check.reason && <small className={cx(!maxed && 'ew-warn')}>{check.reason}</small>}
          {!maxed && (
            <TapButton className="ew-btn--pill" data-testid={`township-upgrade-${plot.id}`} disabled={!check.ok} onTap={() => upgrade(plot.id)}>
              Upgrade → Lv {level + 1}
            </TapButton>
          )}
        </div>
      </div>
    </article>
  );
}

/** Hearthstead township: settlers, plots/build, and the architectural upgrade inspector. */
export function TownshipPanel() {
  const { township, flags, questLog, coin, inventory } = useGame(
    useShallow((s) => ({ township: s.township, flags: s.flags, questLog: s.questLog, coin: s.coin, inventory: s.inventory })),
  );
  const recruit = useGame((s) => s.recruit);
  const build = useGame((s) => s.build);
  const toggleTownship = useGame((s) => s.toggleTownship);
  const { db, core, systems } = getServices();
  const t = db.township;
  const npcName = (id: string): string => db.world.npcs.find((n) => n.id === id)?.name ?? id;
  const itemName = (id: string): string => db.items[id]?.name ?? id;
  const builtPlots = t.plots.filter((p) => township.built[p.id]);
  const [tab, setTab] = useState<TownTab>('settlers');

  const tabs: readonly { id: TownTab; label: string; count: number }[] = [
    { id: 'settlers', label: 'Settlers', count: township.recruited.length },
    { id: 'plots', label: 'Plots', count: builtPlots.length },
    { id: 'upgrades', label: 'Upgrades', count: builtPlots.length },
  ];

  return (
    <Sheet kind="panel" title={t.name} sub={<span>◉ {coin} coin</span>} onClose={() => toggleTownship(false)} closeTestId="township-close">
      <div className="ew-tabs" role="tablist">
        {tabs.map((x) => (
          <TapButton key={x.id} role="tab" aria-selected={tab === x.id} className={cx('ew-tab', tab === x.id && 'is-on')} data-testid={`township-tab-${x.id}`} onTap={() => setTab(x.id)}>
            {x.label}
            <span className="ew-tab__count">{x.count}</span>
          </TapButton>
        ))}
      </div>
      <div className="ew-town">
        {tab === 'settlers' && (
          <section>
            {t.recruits.length === 0 && <p className="ew-empty">No settlers seek a home yet.</p>}
            {t.recruits.map((r) => {
              const joined = township.recruited.includes(r.npcId);
              const check = joined ? { ok: false, reason: undefined } : systems.township.canRecruit(r.npcId, township, flags, core.quests.evaluate, questLog);
              return (
                <div key={r.npcId} className={cx('ew-row', joined && 'is-done')}>
                  <div className="ew-row__text">
                    <span className="ew-strong">{npcName(r.npcId)}</span> <span className="ew-dim">· {r.trade}</span>
                    <small>{joined ? 'Lives in the township' : check.ok ? 'Ready to move in' : r.requirementText}</small>
                  </div>
                  {!joined && (
                    <TapButton className="ew-btn--pill" data-testid={`township-recruit-${r.npcId}`} disabled={!check.ok} onTap={() => recruit(r.npcId)}>
                      Invite
                    </TapButton>
                  )}
                </div>
              );
            })}
          </section>
        )}
        {tab === 'plots' && (
          <section>
            {t.plots.map((p) => {
              const builtId = township.built[p.id];
              const built = builtId ? t.buildings.find((b) => b.id === builtId) : undefined;
              return (
                <div key={p.id} className="ew-plot">
                  <div className="ew-strong">{p.name}</div>
                  {built ? (
                    <div className="ew-row is-done">
                      <div className="ew-row__text">
                        🏠 {built.name} <span className="ew-dim">· Lv {township.levels[p.id] ?? 1}</span>
                        <small>{built.perk}</small>
                      </div>
                    </div>
                  ) : (
                    p.accepts.map((bid) => {
                      const b = t.buildings.find((x) => x.id === bid);
                      if (!b) return null;
                      const check = systems.township.canBuild(p.id, bid, township, coin, inventory);
                      return (
                        <div key={bid} className="ew-row">
                          <div className="ew-row__text">
                            {b.name} <span className="ew-dim">· {b.perk}</span>
                            <CostLine view={costView(b.cost, coin, inventory, itemName)} />
                            {!check.ok && check.reason && <small className="ew-warn">{check.reason}</small>}
                          </div>
                          <TapButton className="ew-btn--pill" data-testid={`township-build-${p.id}-${bid}`} disabled={!check.ok} onTap={() => build(p.id, bid)}>
                            Build
                          </TapButton>
                        </div>
                      );
                    })
                  )}
                </div>
              );
            })}
          </section>
        )}
        {tab === 'upgrades' && (
          <section data-testid="township-upgrades">
            {builtPlots.length === 0 && <p className="ew-empty">Raise a building first — then it can grow.</p>}
            {builtPlots.map((p) => {
              const b = t.buildings.find((x) => x.id === township.built[p.id]);
              return b ? <UpgradeCard key={p.id} plot={p} building={b} level={township.levels[p.id] ?? 1} /> : null;
            })}
          </section>
        )}
      </div>
    </Sheet>
  );
}
