import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { AssetManifest, AssetManifestEntry } from '../../src/types/contracts.ts';
import { entryForOutputFile, entryForTarget, isSafeTargetPath, ManifestEmitter, manifestPathFor, mergeManifest, normalizeEntry, parseManifest, pipelineDirFor, publicUrlFor, requestsFromModule, serializeManifest } from './manifest.ts';

const entry = (id: string, extra: Partial<AssetManifestEntry> = {}): AssetManifestEntry => ({
  asset_id: id,
  type: 'spritesheet',
  target_path: `public/assets/generated/test/${id}.png`,
  resolution: { width: 64, height: 32 },
  grid: { columns: 2, rows: 1, frame_width: 32, frame_height: 32 },
  fps: 8,
  loop: true,
  alpha_channel: true,
  prompt_spec: `spec ${id}`,
  status: 'pending',
  ...extra,
});

const manifest = (assets: AssetManifestEntry[]): AssetManifest => ({ manifest_version: '1.0', project: 'emberwake', assets });

describe('mergeManifest', () => {
  it('preserves the external agent status for known ids', () => {
    const old = manifest([entry('a', { status: 'in_progress' }), entry('b', { status: 'rejected' }), entry('c', { status: 'delivered' })]);
    const r = mergeManifest([entry('a'), entry('b'), entry('c'), entry('d')], old, () => false);
    const st = Object.fromEntries(r.manifest.assets.map((e) => [e.asset_id, e.status]));
    expect(st).toEqual({ a: 'in_progress', b: 'rejected', c: 'delivered', d: 'pending' });
    expect(r.added).toEqual(['d']);
  });

  it('marks delivered when the target file exists (but keeps rejected)', () => {
    const old = manifest([entry('a'), entry('b', { status: 'rejected' }), entry('c', { status: 'in_progress' })]);
    const r = mergeManifest([entry('a'), entry('b'), entry('c')], old, () => true);
    expect(r.manifest.assets.map((e) => e.status)).toEqual(['delivered', 'rejected', 'delivered']);
    expect(r.newlyDelivered).toEqual(['a', 'c']);
  });

  it('reports removed ids instead of dropping silently', () => {
    const r = mergeManifest([entry('keep')], manifest([entry('keep'), entry('gone.b'), entry('gone.a')]), () => false);
    expect(r.removed).toEqual(['gone.a', 'gone.b']);
    expect(r.manifest.assets.map((e) => e.asset_id)).toEqual(['keep']);
  });

  it('sorts by asset_id and is stable', () => {
    const reqs = [entry('zeta'), entry('alpha'), entry('mid')];
    const a = serializeManifest(mergeManifest(reqs, null, () => false).manifest);
    const b = serializeManifest(mergeManifest([...reqs].reverse(), null, () => false).manifest);
    expect(a).toBe(b);
    expect(parseManifest(a)?.assets.map((e) => e.asset_id)).toEqual(['alpha', 'mid', 'zeta']);
    expect(a.endsWith('\n')).toBe(true);
    expect(a).toContain('\n  "assets": [\n');
  });

  it('emits exactly the contract schema keys in order', () => {
    const r = mergeManifest([{ ...entry('a', { category: 'fx', animation_states: [{ name: 'idle_s', row: 0, from: 0, count: 2 }] }), extra: 1 } as unknown as AssetManifestEntry], null, () => false);
    const json = JSON.parse(serializeManifest(r.manifest)) as Record<string, unknown> & { assets: Record<string, unknown>[] };
    expect(Object.keys(json)).toEqual(['manifest_version', 'project', 'assets']);
    expect(json.manifest_version).toBe('1.0');
    expect(json.project).toBe('emberwake');
    expect(Object.keys(json.assets[0] ?? {})).toEqual(['asset_id', 'type', 'target_path', 'resolution', 'grid', 'fps', 'loop', 'alpha_channel', 'prompt_spec', 'status', 'category', 'animation_states']);
    const minimal = normalizeEntry({ asset_id: 'm', type: 'icon', target_path: 'public/assets/generated/m.png', resolution: { width: 1, height: 1 }, alpha_channel: false, prompt_spec: 'p', status: 'pending' });
    expect(Object.keys(minimal)).toEqual(['asset_id', 'type', 'target_path', 'resolution', 'alpha_channel', 'prompt_spec', 'status']);
  });

  it('rejects duplicate ids and unsafe target paths', () => {
    const r = mergeManifest([entry('a'), entry('a'), entry('evil', { target_path: 'public/assets/generated/../../src/x.png' }), entry('abs', { target_path: '/etc/x.png' })], null, () => false);
    expect(r.manifest.assets.map((e) => e.asset_id)).toEqual(['a']);
    expect(r.invalid).toEqual(['a', 'evil', 'abs']);
  });
});

describe('naming helpers', () => {
  const list = [entry('mount_drake_flight_01'), entry('hazard.fire.v2')];
  it('maps output/<asset_id>.png|webp to its entry (dots in ids allowed)', () => {
    expect(entryForOutputFile('/x/output/mount_drake_flight_01.png', list)?.asset_id).toBe('mount_drake_flight_01');
    expect(entryForOutputFile('hazard.fire.v2.WEBP', list)?.asset_id).toBe('hazard.fire.v2');
    expect(entryForOutputFile('mount_drake_flight_01.jpg', list)).toBeNull();
    expect(entryForOutputFile('unknown.png', list)).toBeNull();
  });
  it('finds entries by target and builds public urls / paths', () => {
    expect(entryForTarget('public/assets/generated/test/hazard.fire.v2.png', list)?.asset_id).toBe('hazard.fire.v2');
    expect(publicUrlFor('public/assets/generated/a/b.png')).toBe('/assets/generated/a/b.png');
    expect(publicUrlFor('public/assets/generated/a/b.png', '/game')).toBe('/game/assets/generated/a/b.png');
    expect(isSafeTargetPath('public/assets/generated/a.png')).toBe(true);
    expect(isSafeTargetPath('public/assets/other.png')).toBe(false);
    expect(pipelineDirFor('/repo', {})).toBe(join('/repo', 'shared_pipeline'));
    expect(pipelineDirFor('/repo', { EMBERWAKE_PIPELINE_DIR: '/elsewhere' })).toBe('/elsewhere');
    expect(manifestPathFor('/p')).toBe(join('/p', 'manifests', 'pending_assets.json'));
  });
  it('pulls requests out of loaded modules', () => {
    const mod = { allAssetRequests: list, phase3Assets: list, FACINGS: ['s', 'sw'], gameData: { assetRequests: [entry('x')] } };
    expect(requestsFromModule(mod).map((e) => e.asset_id)).toEqual(['mount_drake_flight_01', 'hazard.fire.v2', 'x']);
  });
});

describe('ManifestEmitter (temp dir)', () => {
  let dir = '';
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
    dir = '';
  });

  it('emits, copies output drops to target paths, flips delivered and lists the registry', () => {
    dir = mkdtempSync(join(tmpdir(), 'emberwake-assets-'));
    const logs: string[] = [];
    const em = new ManifestEmitter({ repoRoot: dir, pipelineDir: join(dir, 'pipe'), log: (m) => logs.push(m) });
    // A pre-existing manifest from the art agent.
    mkdirSync(join(dir, 'pipe', 'manifests'), { recursive: true });
    writeFileSync(em.manifestPath, serializeManifest(manifest([entry('a', { status: 'in_progress' }), entry('old')])));

    const r = em.emit([entry('b'), entry('a')]);
    expect(r.removed).toEqual(['old']);
    expect(logs.some((l) => l.includes('"old"'))).toBe(true);
    const onDisk = parseManifest(readFileSync(em.manifestPath, 'utf8'));
    expect(onDisk?.assets.map((e) => [e.asset_id, e.status])).toEqual([['a', 'in_progress'], ['b', 'pending']]);
    expect(em.registry().assets).toEqual([]);

    mkdirSync(em.outputDir, { recursive: true });
    const drop = join(em.outputDir, 'b.png');
    writeFileSync(drop, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    const delivered = em.deliverFromOutput(drop);
    expect(delivered?.asset_id).toBe('b');
    expect(existsSync(join(dir, 'public/assets/generated/test/b.png'))).toBe(true);
    expect(em.deliverFromOutput(join(em.outputDir, 'nope.png'))).toBeNull();

    expect(em.refreshStatus('b')).toBe(true);
    expect(em.refreshStatus('b')).toBe(false);
    const after = parseManifest(readFileSync(em.manifestPath, 'utf8'));
    expect(after?.assets.find((e) => e.asset_id === 'b')?.status).toBe('delivered');
    const reg = em.registry();
    expect(reg.assets.map((a) => a.assetId)).toEqual(['b']);
    expect(reg.assets[0]?.url).toBe('/assets/generated/test/b.png');
    expect(reg.assets[0]?.version).toBeGreaterThan(0);

    // Re-emitting keeps delivered (file present) and does not rewrite an identical file.
    const again = em.emit([entry('a'), entry('b')]);
    expect(again.manifest.assets.find((e) => e.asset_id === 'b')?.status).toBe('delivered');
    expect(again.newlyDelivered).toEqual([]);
  });

  it('ingests files already in output/ without a dev server, and skips unchanged ones', () => {
    dir = mkdtempSync(join(tmpdir(), 'emberwake-assets-'));
    const em = new ManifestEmitter({ repoRoot: dir, pipelineDir: join(dir, 'pipe'), log: () => {} });
    em.emit([entry('a'), entry('b')]);
    mkdirSync(em.outputDir, { recursive: true });
    writeFileSync(join(em.outputDir, 'a.png'), Buffer.from([1, 2, 3]));
    writeFileSync(join(em.outputDir, 'stray.png'), Buffer.from([1]));
    writeFileSync(join(em.outputDir, 'notes.txt'), 'x');
    expect(em.ingestOutput()).toEqual(['a']);
    expect(em.ingestOutput()).toEqual([]); // already identical and up to date
    const r = em.emit([entry('a'), entry('b')]);
    expect(r.manifest.assets.map((e) => [e.asset_id, e.status])).toEqual([['a', 'delivered'], ['b', 'pending']]);
  });
});
