import { STAT_BOOSTS, WEAPONS, SHIELDS, STAT_IDS, WEAPON_IDS, SHIELD_IDS, gammaDim, newBuildState, PERSONAS } from '../registries/CircuitDraftRegistry.js';
import { TRACK_ORDER } from '../registries/TrackRegistry.js';

export const POINTS = [15, 12, 10, 8, 6, 4, 2, 1];
export const RACES = 4;

/**
 * 4-race Cup state machine + 3-card roguelite draft (Stat Boost | Weapon | Shield) + standings.
 * Pure data, no rendering.
 */
export class CircuitManager {
  /** racers: [{ id, name, isHuman, persona, kartId, charId }] */
  constructor(racers, rnd = Math.random) {
    this.rnd = rnd;
    this.stage = 0; // 0..3
    this.tracks = TRACK_ORDER.slice(0, RACES);
    this.racers = racers.map((r) => ({
      ...r, points: 0, results: [], statCount: 0,
      build: newBuildState(), weapon: null, shield: null, stats: [],
    }));
    this.byId = new Map(this.racers.map((r) => [r.id, r]));
    this.phase = 'LOBBY'; // LOBBY -> DRAFT -> RACE -> STANDINGS -> ... -> FINISHED
    this.hands = new Map();
  }

  get trackId() { return this.tracks[this.stage]; }
  get raceNumber() { return this.stage + 1; }
  get isFinal() { return this.stage >= RACES - 1; }

  pick(arr) { return arr[Math.floor(this.rnd() * arr.length)]; }

  /** Deal one card of each category to a racer. */
  deal(racerId) {
    const statId = this.pick(STAT_IDS), wId = this.pick(WEAPON_IDS), sId = this.pick(SHIELD_IDS);
    const r = this.byId.get(racerId);
    const sc = STAT_BOOSTS[statId], wp = WEAPONS[wId], sh = SHIELDS[sId];
    const g = gammaDim(r.statCount);
    const hand = [
      { category: 'stat', id: statId, icon: sc.icon, name: sc.name, desc: sc.desc, tag: `STAT BOOST · γ ${g.toFixed(2)}` },
      { category: 'weapon', id: wId, icon: wp.icon, name: wp.name, tag: r.weapon?.id === wId ? `WEAPON · UPGRADE → Lv ${r.weapon.level + 1}` : 'WEAPON · ' + wp.cooldown + 's cooldown', desc: wp.desc },
      { category: 'shield', id: sId, icon: sh.icon, name: sh.name, tag: r.shield?.id === sId ? `SHIELD · UPGRADE → Lv ${r.shield.level + 1}` : 'SHIELD · ' + sh.cooldown + 's cooldown', desc: sh.desc },
    ];
    this.hands.set(racerId, hand);
    return hand;
  }
  dealAll() { for (const r of this.racers) this.deal(r.id); this.phase = 'DRAFT'; }

  /** Apply a drafted card (stat stacks with diminishing return; weapon/shield equip or level up). */
  apply(racerId, card) {
    const r = this.byId.get(racerId);
    if (card.category === 'stat') {
      STAT_BOOSTS[card.id].apply(r.build, gammaDim(r.statCount));
      r.statCount++; r.stats.push(card.id);
    } else if (card.category === 'weapon') {
      r.weapon = r.weapon?.id === card.id ? { id: card.id, level: r.weapon.level + 1 } : { id: card.id, level: 1 };
    } else {
      r.shield = r.shield?.id === card.id ? { id: card.id, level: r.shield.level + 1 } : { id: card.id, level: 1 };
    }
    this.hands.delete(racerId);
  }
  humansPending() { return this.racers.filter((r) => r.isHuman && this.hands.has(r.id)); }

  /** AI draft by persona (SPEC 3.5/3.6). */
  aiPick(racerId, standingPos = 4) {
    const r = this.byId.get(racerId);
    const hand = this.hands.get(racerId);
    const persona = PERSONAS[r.persona] ?? PERSONAS.balanced_hybrid;
    const n = r.stats.length + (r.weapon ? r.weapon.level : 0) + (r.shield ? r.shield.level : 0); // picks made so far
    let want;
    if (persona.order) want = persona.order[Math.min(n, persona.order.length - 1)];
    else want = !r.shield ? 'shield' : !r.weapon ? 'weapon' : standingPos > 4 ? 'weapon' : 'stat'; // Adaptive Counter
    // If the persona's wanted category was already maxed on duplicates, fall back to a stat
    const card = hand.find((c) => c.category === want) ?? hand[0];
    this.apply(racerId, card);
    return card;
  }
  aiPickAll() {
    const order = this.standings().map((r) => r.id);
    for (const r of this.racers) if (!r.isHuman && this.hands.has(r.id)) this.aiPick(r.id, order.indexOf(r.id) + 1);
  }

  /** finishOrder: array of racer ids, 1st first. */
  recordResults(finishOrder) {
    finishOrder.forEach((id, i) => {
      const r = this.byId.get(id);
      const pts = POINTS[i] ?? 0;
      r.points += pts; r.results.push({ pos: i + 1, pts });
    });
    this.phase = 'STANDINGS';
  }
  standings() {
    return [...this.racers].sort((a, b) => b.points - a.points || (a.results.at(-1)?.pos ?? 9) - (b.results.at(-1)?.pos ?? 9));
  }
  advance() {
    if (this.isFinal) { this.phase = 'FINISHED'; return false; }
    this.stage++; this.phase = 'DRAFT'; return true;
  }
}
