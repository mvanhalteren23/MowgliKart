/**
 * Low-poly traversal-gate visuals (pure, three-free). Each gate is built in its
 * own local frame — x across the path (`width`), z along it (`depth`), origin
 * at the gate centre on the ground — into a `PropGeometryBuilder`.
 */
import type { TraversalGateDef, TraversalGateKind } from '@/types/contracts';
import { PropGeometryBuilder } from './props';

type Rgb = readonly [number, number, number];

const ROCK: Rgb = [0.66, 0.62, 0.6];
const ROCK_DARK: Rgb = [0.5, 0.47, 0.47];
const MOSS: Rgb = [0.55, 0.68, 0.46];
const PIT: Rgb = [0.06, 0.06, 0.1];
const RIVER: Rgb = [0.34, 0.62, 0.8];
const BARK: Rgb = [0.42, 0.32, 0.26];
const LEAF: Rgb = [0.3, 0.52, 0.3];
const LEAF_DARK: Rgb = [0.22, 0.42, 0.26];
const WARD: Rgb = [0.62, 0.9, 1];
const WARD_STONE: Rgb = [0.4, 0.42, 0.5];

/** Deterministic 0..1 sequence from a gate id. */
function idRandom(id: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  let s = h >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function boulders(b: PropGeometryBuilder, w: number, d: number, rnd: () => number): void {
  const n = Math.max(4, Math.round((w * d) / 5));
  for (let i = 0; i < n; i++) {
    const x = (rnd() - 0.5) * w * 0.9;
    const z = (rnd() - 0.5) * d * 0.8;
    const r = 0.9 + rnd() * 1.2;
    b.rock(x, 0, z, r, r * (1 + rnd() * 0.6), r * 0.9, 'stone', i % 3 === 0 ? ROCK_DARK : ROCK, { seed: i * 7 + 3 });
  }
  b.rock(0, 0, 0, w * 0.32, Math.min(4.5, w * 0.4), d * 0.45, 'stone', ROCK, { seed: 99 });
  b.rock(w * 0.2, 1.6, 0, 0.9, 0.5, 0.8, 'stone', MOSS, { seed: 5 });
}

function chasm(b: PropGeometryBuilder, w: number, d: number, rnd: () => number): void {
  b.box(0, 0.06, 0, w, 0.08, d * 0.85, 'plain', PIT);
  b.box(0, 0.04, 0, w * 0.96, 0.08, d, 'stone', ROCK_DARK);
  // Jagged lips along both edges of the gap.
  for (const side of [-1, 1]) {
    const n = Math.max(3, Math.round(w / 2.2));
    for (let i = 0; i < n; i++) {
      const x = ((i + 0.5) / n - 0.5) * w;
      b.rock(x, -0.2, side * d * 0.46, 0.9 + rnd() * 0.5, 0.5 + rnd() * 0.6, 0.5, 'stone', ROCK, { seed: i * 13 + (side > 0 ? 1 : 2) });
    }
  }
}

function cliff(b: PropGeometryBuilder, w: number, d: number, rnd: () => number): void {
  const n = Math.max(3, Math.round(w / 2.5));
  for (let i = 0; i < n; i++) {
    const x = ((i + 0.5) / n - 0.5) * w;
    const h = 4.5 + rnd() * 2.5;
    b.box(x, h / 2 - 0.3, (rnd() - 0.5) * 0.4, w / n + 0.4, h, d, 'stone', i % 2 ? ROCK : ROCK_DARK);
    b.rock(x, h - 0.6, 0, w / n * 0.55, 1 + rnd(), d * 0.55, 'stone', MOSS, { seed: i * 5 + 1 });
  }
  // A few ledges for the grapple to bite.
  b.box(-w * 0.15, 2.2, d / 2 + 0.25, 1.6, 0.3, 0.6, 'stone', ROCK_DARK);
  b.box(w * 0.18, 3.4, d / 2 + 0.25, 1.4, 0.3, 0.6, 'stone', ROCK_DARK);
}

function river(b: PropGeometryBuilder, w: number, d: number): void {
  b.box(0, 0.05, 0, w, 0.12, d, 'plain', RIVER, { glow: 0.15 });
  b.box(0, 0.12, -d / 2 + 0.2, w, 0.04, 0.35, 'plain', [0.9, 0.97, 1], { glow: 0.4 });
  b.box(0, 0.12, d / 2 - 0.2, w, 0.04, 0.35, 'plain', [0.9, 0.97, 1], { glow: 0.4 });
  const stones = Math.max(2, Math.round(d / 3.2) - 1);
  for (let i = 0; i < stones; i++) {
    const z = ((i + 1) / (stones + 1) - 0.5) * d;
    b.cylinder((i % 2 ? 0.35 : -0.35), -0.1, z, 0.75, 0.42, 7, 'stone', i % 2 ? ROCK : MOSS);
  }
}

function grove(b: PropGeometryBuilder, w: number, d: number, rnd: () => number): void {
  const n = Math.max(4, Math.round(w / 1.3));
  for (let i = 0; i < n; i++) {
    const x = ((i + 0.5) / n - 0.5) * w;
    const z = (rnd() - 0.5) * d * 0.6;
    const h = 3.5 + rnd() * 2.5;
    b.cylinder(x, 0, z, 0.32 + rnd() * 0.2, h, 6, 'wood', BARK);
    b.rock(x, h - 0.8, z, 1.4 + rnd() * 0.5, 1.6 + rnd(), 1.3, 'plain', i % 2 ? LEAF : LEAF_DARK, { seed: i * 3 + 2 });
  }
  // Briar knot along the ground.
  for (let i = 0; i < n; i++) b.rock(((i + 0.2) / n - 0.5) * w, 0, d * 0.25 * (i % 2 ? 1 : -1), 0.9, 1.1, 0.8, 'plain', LEAF_DARK, { seed: i + 40 });
}

function ward(b: PropGeometryBuilder, w: number, d: number): void {
  for (const side of [-1, 1]) {
    b.box(side * w / 2, 2.2, 0, 0.9, 4.6, 0.9, 'stone', WARD_STONE);
    b.pyramid(side * w / 2, 4.5, 0, 0.9, 0.8, 'stone', WARD_STONE);
    b.box(side * w / 2, 3.4, 0.46, 0.3, 0.3, 0.04, 'plain', WARD, { glow: 1 });
  }
  b.box(0, 2, 0, w - 0.9, 3.8, Math.min(0.2, d), 'plain', WARD, { glow: 0.85 });
  for (let i = 0; i < 3; i++) b.box(((i + 1) / 4 - 0.5) * (w - 1.2), 2.2 + (i % 2) * 0.6, 0.12, 0.5, 0.5, 0.04, 'plain', [1, 1, 1], { glow: 1, rot: Math.PI / 4 });
}

/** Build the visual for one gate in its local frame. */
export function buildGateGeometry(gate: TraversalGateDef): PropGeometryBuilder {
  const b = new PropGeometryBuilder();
  const rnd = idRandom(gate.id);
  const w = Math.max(1, gate.width);
  const d = Math.max(0.5, gate.depth);
  const build: Readonly<Record<TraversalGateKind, () => void>> = {
    boulder: () => boulders(b, w, d, rnd),
    chasm: () => chasm(b, w, d, rnd),
    cliff: () => cliff(b, w, d, rnd),
    river: () => river(b, w, d),
    grove: () => grove(b, w, d, rnd),
    ward: () => ward(b, w, d),
  };
  build[gate.kind]();
  return b;
}
