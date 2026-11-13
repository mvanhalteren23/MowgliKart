import { useShallow } from 'zustand/react/shallow';
import { getServices, useGame } from '@/app/store';
import { Sheet, TapButton, cx } from './common';

/** Hearthstead township: recruits + requirements, plots and build buttons with costs. */
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

  return (
    <Sheet kind="panel" title={t.name} sub={<span>◉ {coin} coin</span>} onClose={() => toggleTownship(false)} closeTestId="township-close">
      <div className="ew-town">
        <section>
          <h3>Settlers</h3>
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
        <section>
          <h3>Plots</h3>
          {t.plots.map((p) => {
            const builtId = township.built[p.id];
            const built = builtId ? t.buildings.find((b) => b.id === builtId) : undefined;
            return (
              <div key={p.id} className="ew-plot">
                <div className="ew-strong">{p.name}</div>
                {built ? (
                  <div className="ew-row is-done">
                    <div className="ew-row__text">
                      🏠 {built.name}
                      <small>{built.perk}</small>
                    </div>
                  </div>
                ) : (
                  p.accepts.map((bid) => {
                    const b = t.buildings.find((x) => x.id === bid);
                    if (!b) return null;
                    const check = systems.township.canBuild(p.id, bid, township, coin, inventory);
                    const cost = [`◉ ${b.cost.coin}`, ...b.cost.items.map((it) => `${db.items[it.itemId]?.name ?? it.itemId} ×${it.qty} (${inventory[it.itemId] ?? 0})`)].join(' · ');
                    return (
                      <div key={bid} className="ew-row">
                        <div className="ew-row__text">
                          {b.name} <span className="ew-dim">· {b.perk}</span>
                          <small>{cost}</small>
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
      </div>
    </Sheet>
  );
}
