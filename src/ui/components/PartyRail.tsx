import { useEffect, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { deriveHeroSheet, getServices, useGame } from '@/app/store';
import { HERO_IDS, type HeroId, type Stats } from '@/types/contracts';
import { newlyJoined, railEntries } from '../logic/campaign';
import { Bar, HeroPortrait, TapButton, cx } from './common';

const SWIPE_PX = 36;
const RECRUIT_MS = 2600;

interface Drag {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly scroll: number;
  mode: 'none' | 'scroll' | 'swipe';
  done: boolean;
}

/**
 * Zero-menu leader hot-swap rail: all nine heroes. Tap a member to swap;
 * horizontal drag scrolls the rail when it overflows (else swipes = cycle);
 * a vertical swipe always cycles the leader.
 */
export function PartyRail() {
  const { party, leader, roster, liberatedRegions } = useGame(useShallow((s) => ({ party: s.party, leader: s.leader, roster: s.roster, liberatedRegions: s.liberatedRegions })));
  const setLeader = useGame((s) => s.setLeader);
  const cycleLeader = useGame((s) => s.cycleLeader);
  const { db } = getServices();
  const railRef = useRef<HTMLElement>(null);

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

  // Recruit animation: highlight heroes who just joined.
  const prevParty = useRef<readonly HeroId[]>(party);
  const [fresh, setFresh] = useState<readonly HeroId[]>([]);
  useEffect(() => {
    const joined = newlyJoined(prevParty.current, party);
    prevParty.current = party;
    if (joined.length === 0) return;
    setFresh((f) => [...f, ...joined]);
    const t = setTimeout(() => setFresh((f) => f.filter((h) => !joined.includes(h))), RECRUIT_MS);
    return () => clearTimeout(t);
  }, [party]);

  // Keep the leader (or a fresh recruit) in view inside the scrollable rail.
  const focus = fresh[fresh.length - 1] ?? leader;
  useEffect(() => {
    const rail = railRef.current;
    const chip = rail?.querySelector<HTMLElement>(`[data-testid="leader-${focus}"]`);
    if (!rail || !chip) return;
    const left = chip.offsetLeft - rail.clientWidth / 2 + chip.offsetWidth / 2;
    rail.scrollTo({ left: Math.max(0, left), behavior: 'smooth' });
  }, [focus]);

  const drag = useRef<Drag | null>(null);
  const entries = railEntries(HERO_IDS, party, leader);

  return (
    <nav
      ref={railRef}
      className="ew-rail"
      aria-label="Party"
      data-testid="party-rail"
      onPointerDown={(e) => {
        const rail = railRef.current;
        drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, scroll: rail?.scrollLeft ?? 0, mode: 'none', done: false };
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        const rail = railRef.current;
        if (!d || d.id !== e.pointerId || !rail) return;
        const dx = e.clientX - d.x;
        const dy = e.clientY - d.y;
        if (d.mode === 'none' && Math.hypot(dx, dy) > 10) {
          const overflow = rail.scrollWidth > rail.clientWidth + 2;
          d.mode = Math.abs(dx) > Math.abs(dy) && overflow ? 'scroll' : 'swipe';
        }
        if (d.mode === 'scroll') rail.scrollLeft = d.scroll - dx;
      }}
      onPointerUp={(e) => {
        const d = drag.current;
        drag.current = null;
        if (!d || d.id !== e.pointerId || d.mode !== 'swipe') return;
        const dx = e.clientX - d.x;
        const dy = e.clientY - d.y;
        if (Math.abs(dy) >= Math.abs(dx) && Math.abs(dy) > SWIPE_PX) cycleLeader(dy > 0 ? 1 : -1);
        else if (Math.abs(dx) > SWIPE_PX) cycleLeader(dx < 0 ? 1 : -1);
      }}
      onPointerCancel={() => {
        drag.current = null;
      }}
    >
      {entries.map(({ heroId: id, locked, leader: isLeader }) => {
        const hero = db.heroes[id];
        if (locked) {
          return (
            <span key={id} className="ew-chip ew-chip--locked" data-testid={`leader-${id}`} data-locked="true" aria-disabled="true" aria-label={`${hero.name} — not yet in the party`}>
              <HeroPortrait heroId={id} />
              <span className="ew-chip__lock" aria-hidden="true">
                🔒
              </span>
            </span>
          );
        }
        const p = roster[id];
        const max = maxes[id];
        return (
          <TapButton
            key={id}
            className={cx('ew-chip', isLeader && 'is-leader', fresh.includes(id) && 'is-recruited')}
            data-testid={`leader-${id}`}
            aria-pressed={isLeader}
            aria-label={`${hero.name}${isLeader ? ' (leader)' : ''}`}
            style={{ ['--accent' as string]: hero.accent }}
            suppress={() => drag.current?.mode === 'scroll' || drag.current?.mode === 'swipe'}
            onTap={() => setLeader(id)}
          >
            <HeroPortrait heroId={id} />
            <span className="ew-chip__bars">
              <Bar value={p?.hp ?? 0} max={max?.maxHp ?? 1} tone="hp" thin />
              <Bar value={p?.ap ?? 0} max={max?.maxAp ?? 1} tone="ap" thin />
            </span>
            {fresh.includes(id) && <span className="ew-chip__new">Joined!</span>}
          </TapButton>
        );
      })}
    </nav>
  );
}
