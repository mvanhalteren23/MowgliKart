/**
 * Client asset registry (three-free, DOM-only — the HUD imports it too).
 *
 * One `AssetRecord` per requested asset id, seeded from `db.assetRequests`. Records
 * flip to `ready` when the pipeline delivers a file:
 *  - dev: Vite HMR custom event `emberwake:asset` (pushed by the AssetWatcher plugin),
 *    plus a poll of `/__emberwake/assets.json` every ~3 s as a fallback;
 *  - production: `assets/generated/registry.json` loaded once.
 * Each delivery bumps `version`, which is also the cache-busting `?v=` on `url`.
 */
import { getServices } from '@/app/store';
import type { AssetId, AssetManifestEntry, AssetRecord } from '@/types/contracts';

export const ASSET_EVENT = 'emberwake:asset';
export const DEV_ENDPOINT = '/__emberwake/assets.json';
export const PROD_REGISTRY = 'assets/generated/registry.json';
export const POLL_MS = 3000;

/** One delivered asset as sent by the dev server / production registry. */
export interface AssetUpdate {
  readonly assetId: AssetId;
  /** Public URL without the cache-buster. */
  readonly url: string;
  readonly version: number;
}

export type RegistryState = ReadonlyMap<AssetId, AssetRecord>;

/* ── Pure state transitions ───────────────────────────────────────────────── */

export function emptyRecord(assetId: AssetId, entry: AssetManifestEntry | null = null): AssetRecord {
  return { assetId, entry, ready: false, url: null, version: 0 };
}

/** `url?v=version` (keeps an existing query string). */
export function cacheBusted(url: string, version: number): string {
  const clean = url.replace(/([?&])v=\d+(&|$)/, '$1').replace(/[?&]$/, '');
  return `${clean}${clean.includes('?') ? '&' : '?'}v=${version}`;
}

/** Seed records for requested entries; keeps readiness of ids already known. */
export function seedState(state: RegistryState, entries: readonly AssetManifestEntry[]): RegistryState {
  const next = new Map(state);
  for (const e of entries) {
    const old = next.get(e.asset_id);
    next.set(e.asset_id, old ? { ...old, entry: e } : emptyRecord(e.asset_id, e));
  }
  return next;
}

/**
 * Apply one delivery. Returns the same state object when nothing changed (older or
 * identical version), so callers can skip notifying. Rejected entries never turn ready.
 */
export function applyUpdate(state: RegistryState, u: AssetUpdate): RegistryState {
  if (!u || typeof u.assetId !== 'string' || typeof u.url !== 'string' || !Number.isFinite(u.version)) return state;
  const old = state.get(u.assetId) ?? emptyRecord(u.assetId);
  if (old.entry?.status === 'rejected') return state;
  const version = Math.max(1, Math.floor(u.version));
  if (old.ready && version <= old.version) return state;
  const next = new Map(state);
  next.set(u.assetId, { ...old, ready: true, url: cacheBusted(u.url, version), version });
  return next;
}

export function applyPayload(state: RegistryState, payload: unknown): RegistryState {
  const list = payload && typeof payload === 'object' ? (payload as { assets?: unknown }).assets : null;
  if (!Array.isArray(list)) return state;
  let s = state;
  for (const u of list) if (u && typeof u === 'object') s = applyUpdate(s, u as AssetUpdate);
  return s;
}

/* ── Live registry ────────────────────────────────────────────────────────── */

export interface HotChannel {
  on(event: string, cb: (data: unknown) => void): void;
  off?(event: string, cb: (data: unknown) => void): void;
}

export interface RegistryDeps {
  readonly mode: 'dev' | 'prod' | 'off';
  readonly base?: string;
  readonly fetchJson?: (url: string) => Promise<unknown>;
  readonly hot?: HotChannel | null;
  readonly setInterval?: (fn: () => void, ms: number) => unknown;
  readonly clearInterval?: (h: unknown) => void;
  /** Lazily supplies the requested entries (null = not available yet). */
  readonly seedSource?: () => readonly AssetManifestEntry[] | null;
  readonly pollMs?: number;
}

export interface AssetRegistry {
  get(id: AssetId): AssetRecord;
  /** Called after every change; returns an unsubscribe function. */
  subscribe(cb: () => void): () => void;
  /** Resolves with the record once it is ready (immediately if it already is). */
  whenReady(id: AssetId): Promise<AssetRecord>;
  /** Seed / reseed from the game's asset requests (idempotent). */
  seed(entries: readonly AssetManifestEntry[]): void;
  /** Apply a delivery directly (used by transports and tests). */
  apply(update: AssetUpdate): void;
  /** Monotonic change counter (handy for `useSyncExternalStore`). */
  revision(): number;
  ids(): readonly AssetId[];
  start(): void;
  stop(): void;
}

export function createAssetRegistry(deps: RegistryDeps): AssetRegistry {
  let state: RegistryState = new Map();
  let rev = 0;
  let seeded = false;
  let started = false;
  let pollHandle: unknown = null;
  const listeners = new Set<() => void>();
  const waiters = new Map<AssetId, ((r: AssetRecord) => void)[]>();
  const misses = new Map<AssetId, AssetRecord>();

  const commit = (next: RegistryState): void => {
    if (next === state) return;
    state = next;
    rev++;
    for (const [id, list] of waiters) {
      const r = state.get(id);
      if (!r?.ready) continue;
      waiters.delete(id);
      for (const w of list) w(r);
    }
    for (const cb of [...listeners]) cb();
  };

  const ensureSeeded = (): void => {
    if (seeded || !deps.seedSource) return;
    const entries = deps.seedSource();
    if (entries) api.seed(entries);
  };

  const onHot = (data: unknown): void => {
    if (data && typeof data === 'object') commit(applyUpdate(state, data as AssetUpdate));
  };

  const fetchInto = (url: string): void => {
    if (!deps.fetchJson) return;
    deps.fetchJson(url).then(
      (payload) => commit(applyPayload(state, payload)),
      () => undefined,
    );
  };

  const api: AssetRegistry = {
    get(id) {
      ensureSeeded();
      const r = state.get(id);
      if (r) return r;
      let miss = misses.get(id);
      if (!miss) {
        miss = emptyRecord(id);
        misses.set(id, miss);
      }
      return miss;
    },
    subscribe(cb) {
      ensureSeeded();
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
    whenReady(id) {
      const r = api.get(id);
      if (r.ready) return Promise.resolve(r);
      return new Promise((res) => {
        const list = waiters.get(id) ?? [];
        list.push(res);
        waiters.set(id, list);
      });
    },
    seed(entries) {
      seeded = true;
      commit(seedState(state, entries));
      api.start();
    },
    apply(update) {
      commit(applyUpdate(state, update));
    },
    revision: () => rev,
    ids: () => [...state.keys()],
    start() {
      if (started || deps.mode === 'off') return;
      started = true;
      const base = deps.base ?? '/';
      if (deps.mode === 'dev') {
        deps.hot?.on(ASSET_EVENT, onHot);
        fetchInto(DEV_ENDPOINT);
        if (deps.setInterval) pollHandle = deps.setInterval(() => fetchInto(DEV_ENDPOINT), deps.pollMs ?? POLL_MS);
      } else {
        fetchInto(`${base.endsWith('/') ? base : `${base}/`}${PROD_REGISTRY}`);
      }
    },
    stop() {
      if (!started) return;
      started = false;
      deps.hot?.off?.(ASSET_EVENT, onHot);
      if (pollHandle !== null) deps.clearInterval?.(pollHandle);
      pollHandle = null;
    },
  };
  return api;
}

/* ── Singleton ────────────────────────────────────────────────────────────── */

const inBrowser = typeof window !== 'undefined' && typeof fetch === 'function';

/** Shared registry. Seeds itself from `db.assetRequests` once services are bound. */
export const assetRegistry: AssetRegistry = createAssetRegistry({
  mode: !inBrowser ? 'off' : import.meta.env?.DEV ? 'dev' : 'prod',
  base: import.meta.env?.BASE_URL ?? '/',
  hot: import.meta.hot ?? null,
  fetchJson: async (url) => {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`${res.status}`);
    return res.json() as Promise<unknown>;
  },
  setInterval: (fn, ms) => window.setInterval(fn, ms),
  clearInterval: (h) => window.clearInterval(h as number),
  seedSource: () => {
    try {
      return getServices().db.assetRequests ?? [];
    } catch {
      return null;
    }
  },
});
