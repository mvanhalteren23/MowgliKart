import { useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { foundClues, getServices, resolveEnding, useGame } from '@/app/store';
import type { QuestDef, QuestKind } from '@/types/contracts';
import { chainStageLabel, clueBoard, endingProgress, groupChains, layoutStoryGraph, visibleChains, type ChainView, type StoryGraphLayout } from '../logic/campaign';
import { CHRONICLE_TABS, chronicleEntries, formatReward, openCounts, questsForTab, statusOf, visibleObjectives } from '../logic/questSelectors';
import { HeroPortrait, Sheet, TapButton, cx } from './common';

const ROMAN = ['', 'I', 'II', 'III'] as const;
type TabId = 'story' | QuestKind;

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
        <span className="ew-qcard__title">
          {quest.title}
          {quest.chain && (
            <small className="ew-dim">
              {' '}
              · {quest.chain.stage}/{quest.chain.of}
            </small>
          )}
        </span>
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

const COL_W = 118;
const ROW_H = 58;
const NODE_W = 104;
const NODE_H = 48;

function StoryMap({ graph }: { graph: StoryGraphLayout }) {
  const trackedId = useGame((s) => s.trackedQuestId);
  const trackQuest = useGame((s) => s.trackQuest);
  const { db } = getServices();
  if (graph.nodes.length === 0) return <p className="ew-empty">The story map is still being charted.</p>;
  const width = graph.acts.length * COL_W;
  const height = graph.rows * ROW_H + 22;
  const pos = new Map(graph.nodes.map((n) => [n.id, { x: n.col * COL_W + (COL_W - NODE_W) / 2, y: 22 + n.row * ROW_H }]));
  return (
    <div className="ew-story" data-testid="story-graph">
      <div className="ew-story__canvas" style={{ width, height }}>
        {graph.acts.map((act, i) => (
          <div key={act} className="ew-story__act" style={{ left: i * COL_W, width: COL_W }}>
            Act {ROMAN[act as 1 | 2 | 3] ?? act}
          </div>
        ))}
        <svg className="ew-story__edges" width={width} height={height} aria-hidden="true">
          {graph.edges.map((e) => {
            const a = pos.get(e.from);
            const b = pos.get(e.to);
            if (!a || !b) return null;
            const sameCol = Math.abs(a.x - b.x) < 1;
            const d = sameCol
              ? `M${a.x + NODE_W / 2},${a.y + NODE_H} L${b.x + NODE_W / 2},${b.y}`
              : `M${a.x + NODE_W},${a.y + NODE_H / 2} C${a.x + NODE_W + 14},${a.y + NODE_H / 2} ${b.x - 14},${b.y + NODE_H / 2} ${b.x},${b.y + NODE_H / 2}`;
            return <path key={`${e.from}-${e.to}`} d={d} className={cx('ew-story__edge', e.lit && 'is-lit')} />;
          })}
        </svg>
        {graph.nodes.map((n) => {
          const p = pos.get(n.id);
          if (!p) return null;
          const trackable = n.status === 'ACTIVE' || n.status === 'DISCOVERED';
          const region = db.world.regions.find((r) => r.id === n.regionId)?.name;
          return (
            <TapButton
              key={n.id}
              className={cx('ew-snode', `is-${n.status.toLowerCase()}`, trackedId === n.questId && 'is-tracked')}
              style={{ left: p.x, top: p.y, width: NODE_W, height: NODE_H }}
              data-testid={`story-node-${n.id}`}
              disabled={!trackable}
              aria-label={`${n.title} — ${n.status.toLowerCase()}`}
              onTap={() => trackQuest(n.questId)}
            >
              <span className="ew-snode__title">{n.title}</span>
              <small>{n.status === 'HIDDEN' ? '—' : region ?? n.status.toLowerCase()}</small>
            </TapButton>
          );
        })}
      </div>
    </div>
  );
}

function EndingPanel() {
  const { flags, questLog, party } = useGame(useShallow((s) => ({ flags: s.flags, questLog: s.questLog, party: s.party })));
  const { db, core } = getServices();
  const endings = db.endings ?? [];
  const clues = db.clues ?? [];
  const current = endings.length ? resolveEnding({ flags, questLog }) : null;
  const found = clues.length ? foundClues({ flags, questLog }).length : 0;
  const progress = endingProgress({ endings, clues, quests: db.quests, heroes: db.heroes }, { flags, log: questLog, party }, found, core.quests.evaluate);
  return (
    <section className="ew-ending" data-testid="ending-indicator">
      <div className="ew-ending__now">
        <span className="ew-label">Ending</span>
        <span className={cx('ew-strong', !current && 'ew-dim')} data-testid="ending-current">
          {current ? current.title : 'Unwritten'}
        </span>
      </div>
      {progress.trueEnding && (
        <div className="ew-ending__true">
          <span className="ew-label">
            Toward “{progress.met ? progress.trueEnding.title : '???'}”
          </span>
          <div className="ew-ending__metrics">
            {progress.metrics
              .filter((m) => m.total > 0)
              .map((m) => (
                <span key={m.id} className={cx('ew-metric', m.have >= m.need && 'is-met')} data-testid={`ending-metric-${m.id}`}>
                  {m.label} {Math.min(m.have, m.total)}/{m.need}
                </span>
              ))}
          </div>
          <ul className="ew-objs">
            {progress.requirements.map((r, i) => (
              <li key={i} className={cx(r.met && 'is-done')}>
                <span className="ew-objs__box">{r.met ? '✔' : '◇'}</span>
                {r.text}
                {r.have !== undefined && r.need !== undefined && <em> ({Math.min(r.have, r.need)}/{r.need})</em>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function ChainCard({ chain }: { chain: ChainView }) {
  const pct = chain.of > 0 ? (chain.completedStages / chain.of) * 100 : 0;
  return (
    <div className={cx('ew-chain', chain.complete && 'is-complete')} data-testid={`chain-${chain.chainId}`}>
      {chain.companion && <HeroPortrait heroId={chain.companion} className="ew-qcard__face" />}
      <div className="ew-chain__main">
        <span className="ew-strong">{chain.title}</span>
        <small>{chainStageLabel(chain)}</small>
        <span className="ew-chain__pips">
          {Array.from({ length: chain.of }, (_, i) => {
            const st = chain.stages.find((s) => s.stage === i + 1)?.status ?? 'HIDDEN';
            return <span key={i} className={cx('ew-chain__pip', `is-${st.toLowerCase()}`)} />;
          })}
        </span>
        <span className="ew-chain__bar" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function CluePanel() {
  const { flags, questLog } = useGame(useShallow((s) => ({ flags: s.flags, questLog: s.questLog })));
  const { db } = getServices();
  const clues = db.clues ?? [];
  const board = useMemo(() => {
    const found = new Set(clues.length ? foundClues({ flags, questLog }).map((c) => c.id) : []);
    return clueBoard(clues, found, (id) => db.world.regions.find((r) => r.id === id)?.name ?? 'Uncharted');
  }, [clues, flags, questLog, db]);
  if (board.total === 0) return null;
  return (
    <section className="ew-clues" data-testid="clue-board">
      <div className="ew-clues__head">
        <span className="ew-label">Clue board</span>
        <span className="ew-strong" data-testid="clue-count">
          {board.found}/{board.total} found
        </span>
      </div>
      <div className="ew-clues__grid">
        {board.cards.map((c) =>
          c.found ? (
            <article key={c.clue.id} className="ew-clue is-found" data-testid={`clue-${c.clue.id}`}>
              <span className="ew-strong">{c.clue.title}</span>
              <small className="ew-dim">{c.regionName}</small>
              <p>{c.clue.text}</p>
            </article>
          ) : (
            <article key={c.clue.id} className="ew-clue is-unfound" data-testid={`clue-${c.clue.id}`} aria-label={`Unfound clue in ${c.regionName}`}>
              <span className="ew-clue__mark">?</span>
              <small>{c.regionName}</small>
            </article>
          ),
        )}
      </div>
    </section>
  );
}

/** Chronicle & Side Quest Tracker drawer. */
export function Chronicle() {
  const log = useGame((s) => s.questLog);
  const trackedId = useGame((s) => s.trackedQuestId);
  const toggleChronicle = useGame((s) => s.toggleChronicle);
  const { db } = getServices();
  const storyGraph = db.storyGraph ?? [];

  const trackedQuest = trackedId ? db.quests.find((q) => q.id === trackedId) : undefined;
  const [tab, setTab] = useState<TabId>(trackedQuest?.kind ?? 'main');
  const [expanded, setExpanded] = useState<string | null>(trackedId);

  const kind: QuestKind | null = tab === 'story' ? null : tab;
  const quests = useMemo(() => (kind ? questsForTab(db.quests, log, kind, trackedId) : []), [db, log, kind, trackedId]);
  const counts = useMemo(() => openCounts(db.quests, log), [db, log]);
  const chains = useMemo(() => visibleChains(groupChains(db.quests, log)), [db, log]);
  const graph = useMemo(() => layoutStoryGraph(storyGraph, log), [storyGraph, log]);
  const actNo = trackedQuest?.act ?? Math.max(1, ...db.quests.filter((q) => statusOf(log, q.id) === 'ACTIVE').map((q) => q.act));
  const act = db.acts.find((a) => a.act === actNo);

  // Companion tab: chained quests are shown as chain cards + their current stage.
  const listed = tab === 'companion' ? quests.filter((q) => !q.chain || chains.some((c) => c.current?.quest.id === q.id)) : quests;

  return (
    <Sheet
      kind="drawer"
      title="Chronicle"
      sub={act ? <span data-testid="chronicle-act">Act {ROMAN[act.act]} · {act.title}</span> : undefined}
      onClose={() => toggleChronicle(false)}
      closeTestId="chronicle-close"
    >
      <div className="ew-tabs" role="tablist">
        <TapButton role="tab" aria-selected={tab === 'story'} className={cx('ew-tab', tab === 'story' && 'is-on')} data-testid="chronicle-tab-story" onTap={() => setTab('story')}>
          Story
        </TapButton>
        {CHRONICLE_TABS.map((t) => (
          <TapButton key={t.id} role="tab" aria-selected={tab === t.kind} className={cx('ew-tab', tab === t.kind && 'is-on')} data-testid={`chronicle-tab-${t.id}`} onTap={() => setTab(t.kind)}>
            {t.label}
            {counts[t.kind] > 0 && <span className="ew-tab__count">{counts[t.kind]}</span>}
          </TapButton>
        ))}
      </div>
      {tab === 'story' && (
        <>
          {act && <p className="ew-act-synopsis">{act.synopsis}</p>}
          <StoryMap graph={graph} />
          <EndingPanel />
        </>
      )}
      {tab === 'companion' && chains.length > 0 && (
        <section className="ew-chains" data-testid="chronicle-chains">
          {chains.map((c) => (
            <ChainCard key={c.chainId} chain={c} />
          ))}
        </section>
      )}
      {tab === 'investigation' && <CluePanel />}
      {kind && (
        <div className="ew-qlist">
          {listed.length === 0 && <p className="ew-empty">Nothing recorded here yet.</p>}
          {listed.map((q) => (
            <QuestCard key={q.id} quest={q} expanded={expanded === q.id} onToggle={() => setExpanded((e) => (e === q.id ? null : q.id))} />
          ))}
        </div>
      )}
    </Sheet>
  );
}
