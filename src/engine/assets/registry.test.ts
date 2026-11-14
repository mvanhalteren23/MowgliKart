import { describe, expect, it } from 'vitest';
import type { AssetManifestEntry } from '@/types/contracts';
import { manifestFrameRect, frameAspect, resolveState } from './manifestSprite';
import { applyPayload, applyUpdate, ASSET_EVENT, cacheBusted, createAssetRegistry, DEV_ENDPOINT, PROD_REGISTRY, seedState, type HotChannel } from './registry';

const entry = (id: string, extra: Partial<AssetManifestEntry> = {}): AssetManifestEntry => ({
  asset_id: id,
  type: 'spritesheet',
  target_path: `public/assets/generated/${id}.webp`,
  resolution: { width: 3456, height: 1536 },
  grid: { columns: 18, rows: 8, frame_width: 192, frame_height: 192 },
  fps: 10,
  loop: true,
  alpha_channel: true,
  prompt_spec: 'p',
  status: 'pending',
  ...extra,
});

describe('registry state transitions', () => {
  it('seeds not-ready records and flips to ready with a cache-busted url', () => {
    let s = seedState(new Map(), [entry('a'), entry('b')]);
    expect(s.get('a')).toMatchObject({ ready: false, url: null, version: 0 });
    s = applyUpdate(s, { assetId: 'a', url: '/assets/generated/a.webp', version: 5 });
    expect(s.get('a')).toMatchObject({ ready: true, url: '/assets/generated/a.webp?v=5', version: 5 });
    expect(s.get('a')?.entry?.asset_id).toBe('a');
  });

  it('ignores stale versions and returns the same state object', () => {
    const s1 = applyUpdate(seedState(new Map(), [entry('a')]), { assetId: 'a', url: '/a.webp', version: 7 });
    expect(applyUpdate(s1, { assetId: 'a', url: '/a.webp', version: 7 })).toBe(s1);
    expect(applyUpdate(s1, { assetId: 'a', url: '/a.webp', version: 3 })).toBe(s1);
    const s2 = applyUpdate(s1, { assetId: 'a', url: '/a.webp', version: 9 });
    expect(s2.get('a')?.url).toBe('/a.webp?v=9');
  });

  it('never readies rejected entries; reseeding keeps readiness', () => {
    const s = seedState(new Map(), [entry('r', { status: 'rejected' })]);
    expect(applyUpdate(s, { assetId: 'r', url: '/r', version: 2 })).toBe(s);
    const ready = applyUpdate(seedState(new Map(), [entry('a')]), { assetId: 'a', url: '/a', version: 2 });
    expect(seedState(ready, [entry('a', { status: 'delivered' })]).get('a')?.ready).toBe(true);
  });

  it('applies payloads and cache-busts cleanly', () => {
    const s = applyPayload(new Map(), { assets: [{ assetId: 'x', url: '/x.png', version: 1 }, { junk: true }] });
    expect(s.get('x')?.ready).toBe(true);
    expect(applyPayload(s, null)).toBe(s);
    expect(cacheBusted('/x.png?v=1', 2)).toBe('/x.png?v=2');
    expect(cacheBusted('/x.png?a=1', 2)).toBe('/x.png?a=1&v=2');
  });
});

describe('createAssetRegistry', () => {
  function fakeHot(): HotChannel & { emit(data: unknown): void } {
    const cbs: ((d: unknown) => void)[] = [];
    return { on: (e, cb) => (e === ASSET_EVENT ? cbs.push(cb) : 0) && undefined, emit: (d) => cbs.forEach((cb) => cb(d)) };
  }

  it('dev: listens to HMR, polls the endpoint, notifies subscribers and resolves whenReady', async () => {
    const hot = fakeHot();
    const fetched: string[] = [];
    let tick: (() => void) | null = null;
    let payload: unknown = { assets: [] };
    const reg = createAssetRegistry({
      mode: 'dev',
      hot,
      fetchJson: async (url) => {
        fetched.push(url);
        return payload;
      },
      setInterval: (fn) => {
        tick = fn;
        return 1;
      },
      clearInterval: () => undefined,
      seedSource: () => [entry('mount'), entry('fx')],
    });
    let calls = 0;
    reg.subscribe(() => calls++);
    expect(reg.get('mount')).toMatchObject({ ready: false, entry: { asset_id: 'mount' } });
    expect(fetched).toEqual([DEV_ENDPOINT]);
    const ready = reg.whenReady('mount');
    hot.emit({ assetId: 'mount', url: '/assets/generated/mount.webp', version: 3 });
    await expect(ready).resolves.toMatchObject({ ready: true, version: 3 });
    expect(calls).toBeGreaterThan(0);
    const before = reg.revision();
    payload = { assets: [{ assetId: 'fx', url: '/fx.webp', version: 4 }] };
    expect(tick).not.toBeNull();
    (tick as unknown as () => void)();
    await new Promise((r) => setTimeout(r, 0));
    expect(reg.get('fx').ready).toBe(true);
    expect(reg.revision()).toBeGreaterThan(before);
    expect(reg.get('unknown')).toBe(reg.get('unknown'));
    reg.stop();
  });

  it('prod: loads the registry json once', async () => {
    const fetched: string[] = [];
    const reg = createAssetRegistry({ mode: 'prod', base: '/game/', fetchJson: async (u) => (fetched.push(u), { assets: [{ assetId: 'a', url: '/game/a.png', version: 1 }] }) });
    reg.seed([entry('a')]);
    await reg.whenReady('a');
    expect(fetched).toEqual([`/game/${PROD_REGISTRY}`]);
  });
});

describe('manifest sprite frames', () => {
  const e = entry('mount', {
    animation_states: [
      { name: 'idle_s', row: 0, from: 0, count: 4 },
      { name: 'move_s', row: 0, from: 4, count: 6 },
      { name: 'move_w', row: 2, from: 4, count: 6 },
      { name: 'takeoff_w', row: 2, from: 10, count: 4 },
    ],
  });

  it('resolves <anim>_<facing> states with fallbacks', () => {
    expect(resolveState(e, 'move', 2)).toEqual({ row: 2, from: 4, count: 6 });
    expect(resolveState(e, 'move', 4)).toEqual({ row: 0, from: 4, count: 6 }); // no move_n → any move_*
    expect(resolveState(e, 'run', 0)).toEqual({ row: 0, from: 0, count: 4 }); // unknown → idle
  });

  it('computes uv rects (row 0 at the top) and holds one-shots', () => {
    const r = manifestFrameRect(e, 'move', 2, 0.25);
    expect(r[0]).toBeCloseTo(6 / 18);
    expect(r[1]).toBeCloseTo(1 - 3 / 8);
    expect(r[2]).toBeCloseTo(1 / 18);
    expect(r[3]).toBeCloseTo(1 / 8);
    expect(manifestFrameRect(e, 'takeoff', 2, 99, false)[0]).toBeCloseTo(13 / 18);
    const single = entry('hz', { grid: { columns: 8, rows: 1, frame_width: 256, frame_height: 128 }, resolution: { width: 2048, height: 128 } });
    expect(manifestFrameRect(single, 'loop', null, 0.35)).toEqual([3 / 8, 0, 1 / 8, 1]);
    expect(frameAspect(single)).toBe(0.5);
    expect(frameAspect(null)).toBe(1);
  });
});
