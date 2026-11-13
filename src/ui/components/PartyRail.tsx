import { useMemo, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { deriveHeroSheet, getServices, useGame } from '@/app/store';
import { HERO_IDS, type HeroId, type Stats } from '@/types/contracts';
import { Bar, HeroPortrait, TapButton, cx } from './common';

const SWIPE_PX = 36;

/** Zero-menu leader hot-swap rail: tap a chip to swap, swipe the rail to cycle. */
export function PartyRail() {
  const { party, leader, roster, liberatedRegions } = useGame(useShallow((s) => ({ party: s.party, leader: s.leader, roster: s.roster, liberatedRegions: s.liberatedRegions })));
  const setLeader = useGame((s) => s.setLeader);
  const cycleLeader = useGame((s) => s.cycleLeader);
  const { db } = getServices();

  const maxes = useMemo(() => {
    const out: Partial<Record<HeroId, Stats>> = {};
    for (const id of party) {
      try {
        const sheet = deriveHeroSheet({ roster, liberatedRegions }, id);
        if (sheet) out[id] = sheet.fused.stats;
      } catch {
        /* services mid-reload */
      }
    }
    return out;
  }, [party, roster, liberatedRegions]);

  const swipe = useRef<{ id: number; x: number; swiped: boolean } | null>(null);

  const playable = HERO_IDS.filter((id) => party.includes(id) && db.heroes[id].playable);
  const locked = HERO_IDS.filter((id) => !playable.includes(id));

  return (
    <nav
      className="ew-rail"
      aria-label="Party"
      onPointerDown={(e) => {
        swipe.current = { id: e.pointerId, x: e.clientX, swiped: false };
      }}
      onPointerMove={(e) => {
        const s = swipe.current;
        if (s && s.id === e.pointerId && Math.abs(e.clientX - s.x) > SWIPE_PX) s.swiped = true;
      }}
      onPointerUp={(e) => {
        const s = swipe.current;
        if (s && s.id === e.pointerId && s.swiped) cycleLeader(e.clientX < s.x ? 1 : -1);
        swipe.current = null;
      }}
      onPointerCancel={() => {
        swipe.current = null;
      }}
    >
      {playable.map((id) => {
        const p = roster[id];
        const max = maxes[id];
        const hero = db.heroes[id];
        return (
          <TapButton
            key={id}
            className={cx('ew-chip', id === leader && 'is-leader')}
            data-testid={`leader-${id}`}
            aria-pressed={id === leader}
            aria-label={`${hero.name}${id === leader ? ' (leader)' : ''}`}
            style={{ ['--accent' as string]: hero.accent }}
            suppress={() => swipe.current?.swiped ?? false}
            onTap={() => setLeader(id)}
          >
            <HeroPortrait heroId={id} />
            <span className="ew-chip__bars">
              <Bar value={p?.hp ?? 0} max={max?.maxHp ?? 1} tone="hp" thin />
              <Bar value={p?.ap ?? 0} max={max?.maxAp ?? 1} tone="ap" thin />
            </span>
          </TapButton>
        );
      })}
      <span className="ew-rail__locked" aria-label="Locked heroes">
        {locked.map((id) => (
          <span key={id} className="ew-chip ew-chip--locked" data-testid={`leader-${id}`} aria-disabled="true" title={`${db.heroes[id].name} — locked`}>
            <HeroPortrait heroId={id} />
            <span className="ew-chip__lock">🔒</span>
          </span>
        ))}
      </span>
    </nav>
  );
}
