/**
 * Adapter over the engine's client asset registry (`src/engine/assets/registry.ts`,
 * shape `assetRegistry.get(id): AssetRecord` + `subscribe(cb)`), which is being built
 * in parallel. Vite's glob import resolves to `{}` while the file does not exist, so
 * the HUD switches to the real registry automatically once it lands. Until then,
 * every id resolves to a not-ready record (manifest entry from `db.assetRequests`
 * when available) and renders as the debug fallback.
 */
import { useSyncExternalStore } from 'react';
import { getServices } from '@/app/store';
import type { AssetId, AssetManifestEntry, AssetRecord } from '@/types/contracts';

export interface AssetSource {
  get(id: AssetId): AssetRecord;
  subscribe(cb: () => void): () => void;
}

function isSource(v: unknown): v is AssetSource {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as { get?: unknown; subscribe?: unknown };
  return typeof o.get === 'function' && typeof o.subscribe === 'function';
}

function engineRegistry(): AssetSource | null {
  try {
    const mods = import.meta.glob('/src/engine/assets/registry.ts', { eager: true });
    for (const mod of Object.values(mods)) {
      const m = mod as Record<string, unknown>;
      const candidate = m.assetRegistry ?? m.registry ?? m.default;
      if (isSource(candidate)) return candidate;
    }
  } catch {
    /* not available (e.g. non-Vite runtime) */
  }
  return null;
}

function manifestEntry(id: AssetId): AssetManifestEntry | null {
  try {
    return getServices().db.assetRequests?.find((e) => e.asset_id === id) ?? null;
  } catch {
    return null;
  }
}

const cache = new Map<AssetId, AssetRecord>();
const fallbackSource: AssetSource = {
  get(id) {
    let rec = cache.get(id);
    if (!rec) {
      rec = { assetId: id, entry: manifestEntry(id), ready: false, url: null, version: 0 };
      cache.set(id, rec);
    }
    return rec;
  },
  subscribe() {
    return () => undefined;
  },
};

let source: AssetSource | null = null;
export function assetSource(): AssetSource {
  source ??= engineRegistry() ?? fallbackSource;
  return source;
}

/** Reactive asset record (re-renders when the registry reports a delivery). */
export function useAsset(id: AssetId): AssetRecord {
  const src = assetSource();
  return useSyncExternalStore(
    (cb) => src.subscribe(cb),
    () => safeGet(src, id),
    () => safeGet(src, id),
  );
}

const snapshots = new Map<AssetId, AssetRecord>();

/** Stable snapshot: keep the previous object while nothing observable changed (useSyncExternalStore needs this). */
function safeGet(src: AssetSource, id: AssetId): AssetRecord {
  let rec: AssetRecord;
  try {
    rec = src.get(id);
  } catch {
    rec = fallbackSource.get(id);
  }
  const prev = snapshots.get(id);
  if (prev && prev.ready === rec.ready && prev.url === rec.url && prev.version === rec.version && prev.entry === rec.entry) return prev;
  snapshots.set(id, rec);
  return rec;
}
