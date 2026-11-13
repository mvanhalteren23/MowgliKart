import { useMemo, useState } from 'react';
import { getServices, useGame } from '@/app/store';
import type { QuestDef, QuestKind } from '@/types/contracts';
import { CHRONICLE_TABS, chronicleEntries, formatReward, openCounts, questsForTab, statusOf, visibleObjectives } from '../logic/questSelectors';
import { HeroPortrait, Sheet, TapButton, cx } from './common';

const ROMAN = ['', 'I', 'II', 'III'] as const;

function QuestCard({ quest, expanded, onToggle }: { quest: QuestDef; expanded: boolean; onToggle: () => void }) {
  const log = useGame((s) => s.questLog);
  const flags = useGame((s) => s.flags);
  const trackedId = useGame((s) => s.trackedQuestId);
  const trackQuest = useGame((s) => s.trackQuest);
  const { db, core } = getServices();
  const status = statusOf(log, quest.id);
  const objectives = visibleObjectives(quest, log, flags, core.quests.evaluate);
  const rewards = quest.rewards.map((r) => formatReward(r, db)).filter((t): t is string => t !== null);
  const tracked = trackedId === quest.id;
  return (
    <article className={cx('ew-qcard', `is-${status.toLowerCase()}`, tracked && 'is-tracked')} data-testid={`quest-${quest.id}`}>
      <TapButton className="ew-qcard__head" onTap={onToggle} aria-expanded={expanded}>
        {quest.companion && <HeroPortrait heroId={quest.companion} className="ew-qcard__face" />}
        <span className="ew-qcard__title">{quest.title}</span>
        <span className={cx('ew-badge', `ew-badge--${status.toLowerCase()}`)}>{status}</span>
      </TapButton>
      {expanded && (
        <div className="ew-qcard__body">
          <p className="ew-qcard__summary">{quest.summary}</p>
          {objectives.length > 0 && (
            <ul className="ew-objs">
              {objectives.map((o) => (
                <li key={o.def.id} className={cx(o.done && 'is-done', o.def.optional && 'is-optional')}>
                  <span className="ew-objs__box">{o.done ? '✔' : '◇'}</span>
                  {o.def.text}
                  {o.def.optional && <em> (optional)</em>}
                </li>
              ))}
            </ul>
          )}
          {chronicleEntries(quest, status).map((e) => (
            <p key={e.status} className="ew-chron-text">
              {e.text}
            </p>
          ))}
          {rewards.length > 0 && (
            <div className="ew-rewards">
              <span className="ew-label">Rewards</span>
              {rewards.map((r) => (
                <span key={r} className="ew-reward">
                  {r}
                </span>
              ))}
            </div>
          )}
          {(status === 'ACTIVE' || status === 'DISCOVERED') && (
            <TapButton className={cx('ew-btn--pill', tracked && 'is-on')} data-testid={`chronicle-track-${quest.id}`} onTap={() => trackQuest(tracked ? null : quest.id)}>
              {tracked ? '★ Tracking' : '☆ Track'}
            </TapButton>
          )}
        </div>
      )}
    </article>
  );
}

/** Chronicle & Side Quest Tracker drawer. */
export function Chronicle() {
  const log = useGame((s) => s.questLog);
  const trackedId = useGame((s) => s.trackedQuestId);
  const toggleChronicle = useGame((s) => s.toggleChronicle);
  const { db } = getServices();

  const trackedQuest = trackedId ? db.quests.find((q) => q.id === trackedId) : undefined;
  const [tab, setTab] = useState<QuestKind>(trackedQuest?.kind ?? 'main');
  const [expanded, setExpanded] = useState<string | null>(trackedId);

  const quests = useMemo(() => questsForTab(db.quests, log, tab, trackedId), [db, log, tab, trackedId]);
  const counts = useMemo(() => openCounts(db.quests, log), [db, log]);
  const actNo = trackedQuest?.act ?? Math.max(1, ...db.quests.filter((q) => statusOf(log, q.id) === 'ACTIVE').map((q) => q.act));
  const act = db.acts.find((a) => a.act === actNo);

  return (
    <Sheet
      kind="drawer"
      title="Chronicle"
      sub={act ? <span data-testid="chronicle-act">Act {ROMAN[act.act]} · {act.title}</span> : undefined}
      onClose={() => toggleChronicle(false)}
      closeTestId="chronicle-close"
    >
      {act && <p className="ew-act-synopsis">{act.synopsis}</p>}
      <div className="ew-tabs" role="tablist">
        {CHRONICLE_TABS.map((t) => (
          <TapButton key={t.id} role="tab" aria-selected={tab === t.kind} className={cx('ew-tab', tab === t.kind && 'is-on')} data-testid={`chronicle-tab-${t.id}`} onTap={() => setTab(t.kind)}>
            {t.label}
            {counts[t.kind] > 0 && <span className="ew-tab__count">{counts[t.kind]}</span>}
          </TapButton>
        ))}
      </div>
      <div className="ew-qlist">
        {quests.length === 0 && <p className="ew-empty">Nothing recorded here yet.</p>}
        {quests.map((q) => (
          <QuestCard key={q.id} quest={q} expanded={expanded === q.id} onToggle={() => setExpanded((e) => (e === q.id ? null : q.id))} />
        ))}
      </div>
    </Sheet>
  );
}
