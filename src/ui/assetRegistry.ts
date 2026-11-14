/**
 * HUD adapter over the engine's three-free client asset registry
 * (`src/engine/assets/registry.ts`). Gives React a stable, reactive `AssetRecord`
 * per id; the registry flips records to `ready` when the pipeline delivers files.
 */
import { useSyncExternalStore } from 'react';
import { assetRegistry } from '@/engine/assets/registry';
import type { AssetId, AssetRecord } from '@/types/contracts';

let started = false;
/** `start()` is idempotent in the registry; the HUD makes sure deliveries are being watched. */
function ensureStarted(): void {
  if (started) return;
  started = true;
  try {
    assetRegistry.start();
  } catch {
    /* non-browser runtime */
  }
}

const subscribe = (cb: () => void): (() => void) => assetRegistry.subscribe(cb);

const snapshots = new Map<AssetId, AssetRecord>();

/** Stable snapshot: keep the previous object while nothing observable changed (useSyncExternalStore needs this). */
function snapshot(id: AssetId): AssetRecord {
  let rec: AssetRecord;
  try {
    rec = assetRegistry.get(id);
  } catch {
    rec = { assetId: id, entry: null, ready: false, url: null, version: 0 };
  }
  const prev = snapshots.get(id);
  if (prev && prev.ready === rec.ready && prev.url === rec.url && prev.version === rec.version && prev.entry === rec.entry) return prev;
  snapshots.set(id, rec);
  return rec;
}

/** Reactive asset record (re-renders when the registry reports a delivery). */
export function useAsset(id: AssetId): AssetRecord {
  ensureStarted();
  return useSyncExternalStore(
    subscribe,
    () => snapshot(id),
    () => snapshot(id),
  );
}
