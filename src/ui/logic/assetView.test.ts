import { describe, expect, it } from 'vitest';
import type { AssetManifestEntry, AssetRecord } from '@/types/contracts';
import { assetView, fitFrame, frameSize } from './assetView';

const entry = (extra: Partial<AssetManifestEntry> = {}): AssetManifestEntry => ({
  asset_id: 'hud.qte.ring',
  type: 'icon',
  target_path: 'public/assets/generated/hud/qte_ring.png',
  resolution: { width: 256, height: 256 },
  alpha_channel: true,
  prompt_spec: '',
  status: 'pending',
  ...extra,
});
const rec = (r: Partial<AssetRecord>): AssetRecord => ({ assetId: 'hud.qte.ring', entry: entry(), ready: false, url: null, version: 0, ...r });
const FB = { width: 64, height: 32 };

describe('asset render decision', () => {
  it('falls back while not ready, at the manifest frame size', () => {
    expect(assetView('hud.qte.ring', rec({}), FB)).toEqual({ kind: 'fallback', assetId: 'hud.qte.ring', width: 256, height: 256 });
  });
  it('falls back for a ready record without a url, or an unknown id', () => {
    expect(assetView('x', rec({ ready: true, url: null }), FB).kind).toBe('fallback');
    expect(assetView('x', rec({ ready: true, url: '' }), FB).kind).toBe('fallback');
    expect(assetView('x', null, FB)).toEqual({ kind: 'fallback', assetId: 'x', width: 64, height: 32 });
  });
  it('renders the delivered file once ready', () => {
    const v = assetView('hud.qte.ring', rec({ ready: true, url: '/assets/generated/hud/qte_ring.png?v=2', version: 2 }), FB);
    expect(v).toEqual({ kind: 'image', url: '/assets/generated/hud/qte_ring.png?v=2', width: 256, height: 256, frames: 1 });
  });
  it('uses the grid cell for sheets', () => {
    const e = entry({ type: 'spritesheet', resolution: { width: 512, height: 128 }, grid: { columns: 4, rows: 1, frame_width: 128, frame_height: 128 } });
    expect(frameSize(e, FB)).toEqual({ width: 128, height: 128 });
    const v = assetView('s', rec({ entry: e, ready: true, url: '/a.png' }), FB);
    expect(v.kind === 'image' && v.frames).toBe(4);
  });
  it('fits frames into a box preserving aspect', () => {
    expect(fitFrame({ width: 256, height: 96 }, 128, 128)).toEqual({ width: 128, height: 48 });
    expect(fitFrame({ width: 0, height: 0 }, 20, 10)).toEqual({ width: 20, height: 10 });
  });
});
