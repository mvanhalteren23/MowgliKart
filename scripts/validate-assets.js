#!/usr/bin/env node
// Validates AI-generated assets in public/assets and rewrites public/assets/models/manifest.json.
//   npm run validate-assets            (exit code 1 if any .glb fails; valid ones are still listed)
import { readdirSync, readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { join, basename, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { KARTS } from '../src/registries/KartRegistry.js';
import { CHARACTERS } from '../src/registries/CharacterRegistry.js';
import { ITEMS } from '../src/registries/ItemRegistry.js';
import { WEAPONS, SHIELDS } from '../src/registries/CircuitDraftRegistry.js';
import { OBSTACLES, TRACKS } from '../src/registries/TrackRegistry.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'assets');
const KIND = {};
for (const id of Object.keys(KARTS)) KIND[id] = 'kart';
for (const id of Object.keys(CHARACTERS)) KIND[id] = 'kid';
for (const id of Object.keys(ITEMS)) KIND[id] = 'item';
for (const id of Object.keys(WEAPONS)) KIND[id] = 'weapon';
for (const id of Object.keys(SHIELDS)) KIND[id] = 'shield';
for (const id of Object.keys(OBSTACLES)) KIND[id] = 'obstacle';

const LIMIT = { kart: 10000, kid: 4000, item: 4000, weapon: 4000, shield: 4000, obstacle: 6000 };
const KART_REQUIRED = ['Wheel_FL', 'Wheel_FR', 'Wheel_RL', 'Wheel_RR', 'Cosmetic_Panel_L', 'Cosmetic_Panel_R', 'Cosmetic_Roof_Spoiler', 'Cosmetic_Bumper_Prop'];
const KART_MOUNTS = ['Weapon_Mount', 'Shield_Mount'];

function parseGlb(buf) {
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error('not a glTF binary (bad magic)');
  if (buf.readUInt32LE(4) !== 2) throw new Error('glTF version must be 2');
  let off = 12, json = null;
  while (off < buf.length) {
    const len = buf.readUInt32LE(off), type = buf.readUInt32LE(off + 4);
    if (type === 0x4e4f534a) json = JSON.parse(buf.slice(off + 8, off + 8 + len).toString('utf8'));
    off += 8 + len;
  }
  if (!json) throw new Error('no JSON chunk');
  return json;
}
function triangles(g) {
  let t = 0;
  for (const m of g.meshes ?? []) for (const p of m.primitives) {
    if ((p.mode ?? 4) !== 4) continue;
    const acc = p.indices !== undefined ? g.accessors[p.indices] : g.accessors[p.attributes.POSITION];
    t += Math.floor(acc.count / 3);
  }
  return t;
}
function bounds(g) {
  const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
  for (const m of g.meshes ?? []) for (const p of m.primitives) {
    const a = g.accessors[p.attributes.POSITION];
    if (!a.min || !a.max) continue;
    for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], a.min[i]); hi[i] = Math.max(hi[i], a.max[i]); }
  }
  return { lo, hi };
}

let failures = 0;
const models = [];
const dir = join(root, 'models');
for (const f of existsSync(dir) ? readdirSync(dir).filter((x) => x.endsWith('.glb')) : []) {
  const id = basename(f, '.glb');
  const errs = [], warns = [];
  const kind = KIND[id];
  if (!kind) errs.push(`unknown asset id "${id}" (must match a registry id)`);
  try {
    const g = parseGlb(readFileSync(join(dir, f)));
    const tris = triangles(g), names = new Set((g.nodes ?? []).map((n) => n.name));
    if (kind && tris > LIMIT[kind]) errs.push(`${tris} triangles exceeds the ${LIMIT[kind]} budget`);
    if (kind === 'kart') {
      for (const n of KART_REQUIRED) if (!names.has(n)) errs.push(`missing required node "${n}"`);
      for (const n of KART_MOUNTS) if (!names.has(n)) warns.push(`missing mount node "${n}" (weapon/shield visuals will attach to the root)`);
      const { lo, hi } = bounds(g);
      if (Math.abs(lo[1] + 0.68) > 0.3) warns.push(`wheel bottoms at y=${lo[1].toFixed(2)}; expected about -0.68 (chassis centre at origin)`);
      if (hi[2] - lo[2] < (hi[0] - lo[0])) warns.push('model is wider than it is long: check the forward axis is -Z');
    }
    console.log(`${errs.length ? '✗' : '✓'} ${f} (${kind ?? '?'}, ${tris} tris)`);
  } catch (e) { errs.push(e.message); console.log(`✗ ${f}`); }
  for (const w of warns) console.log(`    warn: ${w}`);
  for (const e of errs) console.log(`    ERROR: ${e}`);
  if (errs.length) failures++; else models.push(id);
}

const listBy = (sub, exts, ok = () => true) => (existsSync(join(root, sub)) ? readdirSync(join(root, sub)).filter((x) => exts.includes(extname(x).toLowerCase()) && statSync(join(root, sub, x)).isFile() && ok(x)) : []);
const skyboxes = listBy('skyboxes', ['.jpg', '.jpeg'], (x) => TRACKS[basename(x, extname(x))]).map((x) => basename(x, extname(x)));
const audio = listBy('audio', ['.mp3', '.ogg', '.wav']);
if (existsSync(join(root, 'skyboxes'))) for (const x of listBy('skyboxes', ['.jpg', '.jpeg'], (y) => !TRACKS[basename(y, extname(y))])) console.log(`warn: skybox "${x}" does not match a track id`);
const manifest = { models, skyboxes, audio };
writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`\nmanifest.json: ${models.length} models, ${skyboxes.length} skyboxes, ${audio.length} audio files${failures ? ` — ${failures} model(s) FAILED and keep their procedural fallback` : ''}`);
process.exit(failures ? 1 : 0);
