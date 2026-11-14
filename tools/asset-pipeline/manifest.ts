/**
 * ManifestEmitter — builds `shared_pipeline/manifests/pending_assets.json` from the
 * game's asset requests and merges it with the file already on disk.
 *
 * Node-only, but the merge / naming rules are small pure functions so they can be
 * unit-tested without touching the filesystem. Only type imports from `src/` so this
 * module also runs under `node --experimental-strip-types` (no path aliases needed).
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, isAbsolute, join, normalize, relative, resolve, sep } from 'node:path';
import type { AssetManifest, AssetManifestEntry, AssetStatus } from '../../src/types/contracts.ts';

export const MANIFEST_VERSION = '1.0' as const;
export const MANIFEST_PROJECT = 'emberwake';
/** Every target must live here (repo-relative, forward slashes). */
export const GENERATED_ROOT = 'public/assets/generated/';
export const OUTPUT_EXTENSIONS: readonly string[] = ['.png', '.webp'];
const KEPT_STATUSES: readonly AssetStatus[] = ['in_progress', 'delivered', 'rejected'];
const STATUSES: readonly AssetStatus[] = ['pending', 'in_progress', 'delivered', 'rejected'];

/* ── Pure helpers ─────────────────────────────────────────────────────────── */

/** `${EMBERWAKE_PIPELINE_DIR ?? '<repo>/shared_pipeline'}` (relative env values resolve against the repo). */
export function pipelineDirFor(repoRoot: string, env: Readonly<Record<string, string | undefined>> = {}): string {
  const fromEnv = env.EMBERWAKE_PIPELINE_DIR;
  if (fromEnv && fromEnv.trim() !== '') return isAbsolute(fromEnv) ? fromEnv : resolve(repoRoot, fromEnv);
  return join(repoRoot, 'shared_pipeline');
}

export const manifestPathFor = (pipelineDir: string): string => join(pipelineDir, 'manifests', 'pending_assets.json');
export const outputDirFor = (pipelineDir: string): string => join(pipelineDir, 'output');

/** True when a manifest target path is a safe repo-relative path under `public/assets/generated/`. */
export function isSafeTargetPath(targetPath: string): boolean {
  if (isAbsolute(targetPath) || targetPath.includes('\\')) return false;
  const norm = normalize(targetPath).split(sep).join('/');
  return norm.startsWith(GENERATED_ROOT) && !norm.split('/').includes('..') && norm.length > GENERATED_ROOT.length;
}

/** Public URL a target path is served at (`public/` is the web root). */
export function publicUrlFor(targetPath: string, base = '/'): string {
  const rel = targetPath.replace(/^public\//, '');
  return `${base.endsWith('/') ? base : `${base}/`}${rel}`;
}

/**
 * A file dropped into `output/` named `<asset_id>.png|webp` → the entry it delivers.
 * Asset ids may contain dots, so only the final extension is stripped.
 */
export function entryForOutputFile(fileName: string, entries: readonly AssetManifestEntry[]): AssetManifestEntry | null {
  const base = fileName.split(/[\\/]/).pop() ?? '';
  const ext = extname(base).toLowerCase();
  if (!OUTPUT_EXTENSIONS.includes(ext)) return null;
  const id = base.slice(0, base.length - ext.length);
  return entries.find((e) => e.asset_id === id) ?? null;
}

/** Entry whose `target_path` is this repo-relative path, if any. */
export function entryForTarget(repoRelative: string, entries: readonly AssetManifestEntry[]): AssetManifestEntry | null {
  const norm = repoRelative.split(sep).join('/');
  return entries.find((e) => e.target_path === norm) ?? null;
}

/** Copy an entry in canonical key order (exact contract schema, optional keys only when present). */
export function normalizeEntry(e: AssetManifestEntry, status: AssetStatus = e.status): AssetManifestEntry {
  const o: Record<string, unknown> = {};
  o.asset_id = e.asset_id;
  o.type = e.type;
  o.target_path = e.target_path;
  o.resolution = { width: e.resolution.width, height: e.resolution.height };
  if (e.grid) o.grid = { columns: e.grid.columns, rows: e.grid.rows, frame_width: e.grid.frame_width, frame_height: e.grid.frame_height };
  if (e.fps !== undefined) o.fps = e.fps;
  if (e.loop !== undefined) o.loop = e.loop;
  o.alpha_channel = e.alpha_channel;
  o.prompt_spec = e.prompt_spec;
  o.status = status;
  if (e.category !== undefined) o.category = e.category;
  if (e.animation_states) o.animation_states = e.animation_states.map((s) => ({ name: s.name, row: s.row, from: s.from, count: s.count }));
  return o as unknown as AssetManifestEntry;
}

export interface MergeResult {
  readonly manifest: AssetManifest;
  /** Ids in the old file that are no longer requested (dropped — callers log them). */
  readonly removed: readonly string[];
  readonly added: readonly string[];
  /** Ids whose status became `delivered` in this merge. */
  readonly newlyDelivered: readonly string[];
  /** Requests skipped because their target path is unsafe or the id is duplicated. */
  readonly invalid: readonly string[];
}

/**
 * Merge requested entries with the manifest on disk.
 *  - status: `rejected` is kept; otherwise a present target file ⇒ `delivered`;
 *    otherwise the external agent's `in_progress` / `delivered` is kept; else `pending`.
 *  - removed ids are dropped and reported; output is sorted by `asset_id`.
 */
export function mergeManifest(requests: readonly AssetManifestEntry[], existing: AssetManifest | null, targetExists: (targetPath: string) => boolean): MergeResult {
  const prev = new Map<string, AssetManifestEntry>();
  for (const e of existing?.assets ?? []) if (e && typeof e.asset_id === 'string') prev.set(e.asset_id, e);
  const seen = new Set<string>();
  const assets: AssetManifestEntry[] = [];
  const added: string[] = [];
  const newlyDelivered: string[] = [];
  const invalid: string[] = [];
  for (const req of requests) {
    if (seen.has(req.asset_id) || !isSafeTargetPath(req.target_path)) {
      invalid.push(req.asset_id);
      continue;
    }
    seen.add(req.asset_id);
    const old = prev.get(req.asset_id);
    if (!old) added.push(req.asset_id);
    const oldStatus = old && STATUSES.includes(old.status) ? old.status : null;
    let status: AssetStatus;
    if (oldStatus === 'rejected') status = 'rejected';
    else if (targetExists(req.target_path)) status = 'delivered';
    else if (oldStatus && KEPT_STATUSES.includes(oldStatus)) status = oldStatus;
    else status = 'pending';
    if (status === 'delivered' && oldStatus !== 'delivered') newlyDelivered.push(req.asset_id);
    assets.push(normalizeEntry(req, status));
  }
  assets.sort((a, b) => (a.asset_id < b.asset_id ? -1 : a.asset_id > b.asset_id ? 1 : 0));
  const removed = [...prev.keys()].filter((id) => !seen.has(id)).sort();
  return { manifest: { manifest_version: MANIFEST_VERSION, project: MANIFEST_PROJECT, assets }, removed, added, newlyDelivered, invalid };
}

/** Stable pretty JSON (2-space indent, trailing newline). */
export const serializeManifest = (m: AssetManifest): string => `${JSON.stringify({ manifest_version: m.manifest_version, project: m.project, assets: m.assets }, null, 2)}\n`;

/** Parse a manifest file's text; null when it is missing or not a manifest. */
export function parseManifest(text: string | null): AssetManifest | null {
  if (!text) return null;
  try {
    const raw: unknown = JSON.parse(text);
    if (!raw || typeof raw !== 'object') return null;
    const assets = (raw as { assets?: unknown }).assets;
    if (!Array.isArray(assets)) return null;
    return { manifest_version: MANIFEST_VERSION, project: MANIFEST_PROJECT, assets: assets as AssetManifestEntry[] };
  } catch {
    return null;
  }
}

/** Production / dev registry payload consumed by `src/engine/assets/registry.ts`. */
export interface RegistryPayload {
  readonly assets: readonly { readonly assetId: string; readonly url: string; readonly version: number }[];
}

/* ── Filesystem ───────────────────────────────────────────────────────────── */

export interface ManifestEmitterOptions {
  readonly repoRoot: string;
  readonly pipelineDir?: string;
  readonly log?: (msg: string) => void;
}

export class ManifestEmitter {
  readonly repoRoot: string;
  readonly pipelineDir: string;
  readonly manifestPath: string;
  readonly outputDir: string;
  private readonly log: (msg: string) => void;
  private current: AssetManifest | null = null;

  constructor(opts: ManifestEmitterOptions) {
    this.repoRoot = opts.repoRoot;
    this.pipelineDir = opts.pipelineDir ?? pipelineDirFor(opts.repoRoot, process.env);
    this.manifestPath = manifestPathFor(this.pipelineDir);
    this.outputDir = outputDirFor(this.pipelineDir);
    this.log = opts.log ?? ((m) => console.log(`[emberwake:assets] ${m}`));
  }

  get entries(): readonly AssetManifestEntry[] {
    return this.current?.assets ?? [];
  }

  absTarget(targetPath: string): string {
    return join(this.repoRoot, targetPath);
  }

  targetExists = (targetPath: string): boolean => isSafeTargetPath(targetPath) && existsSync(this.absTarget(targetPath));

  /** Cache-busting version of a delivered target (mtime, ms). 0 when missing. */
  versionOf(targetPath: string): number {
    try {
      return Math.floor(statSync(this.absTarget(targetPath)).mtimeMs);
    } catch {
      return 0;
    }
  }

  readExisting(): AssetManifest | null {
    try {
      return parseManifest(readFileSync(this.manifestPath, 'utf8'));
    } catch {
      return null;
    }
  }

  /** Merge `requests` with the file on disk and write it when it changed. */
  emit(requests: readonly AssetManifestEntry[]): MergeResult {
    const result = mergeManifest(requests, this.readExisting(), this.targetExists);
    for (const id of result.removed) this.log(`asset "${id}" is no longer requested — removed from the manifest`);
    for (const id of result.invalid) this.log(`asset "${id}" skipped (duplicate id or target outside ${GENERATED_ROOT})`);
    this.write(result.manifest);
    return result;
  }

  /** Re-check one asset's target after a file event; returns true when it changed to delivered. */
  refreshStatus(assetId: string): boolean {
    const base = this.current ?? this.readExisting();
    if (!base) return false;
    let changed = false;
    const assets = base.assets.map((e) => {
      if (e.asset_id !== assetId || e.status === 'rejected' || e.status === 'delivered' || !this.targetExists(e.target_path)) return e;
      changed = true;
      return normalizeEntry(e, 'delivered');
    });
    if (changed) this.write({ ...base, assets });
    return changed;
  }

  /** Copy `output/<asset_id>.png|webp` to the entry's target. Returns the entry, or null when unknown. */
  deliverFromOutput(filePath: string): AssetManifestEntry | null {
    const entry = entryForOutputFile(filePath, this.entries);
    if (!entry || !isSafeTargetPath(entry.target_path)) return null;
    const dest = this.absTarget(entry.target_path);
    if (extname(filePath).toLowerCase() !== extname(dest).toLowerCase()) this.log(`"${entry.asset_id}": delivered ${extname(filePath)} but target is ${extname(dest)} — copying as-is`);
    mkdirSync(dirname(dest), { recursive: true });
    const tmp = `${dest}.tmp-${process.pid}`;
    copyFileSync(filePath, tmp);
    renameSync(tmp, dest);
    this.log(`delivered ${relative(this.repoRoot, filePath)} → ${entry.target_path}`);
    return entry;
  }

  /**
   * Ingest every file already sitting in `output/` (e.g. pushed to git while no dev server was
   * running): copy each to its target unless the target is already identical and at least as new.
   * Returns the ids copied. Call after `emit()` so entries are loaded, then `emit()` again to flip statuses.
   */
  ingestOutput(): string[] {
    let files: string[];
    try {
      files = readdirSync(this.outputDir);
    } catch {
      return [];
    }
    const copied: string[] = [];
    for (const name of files.sort()) {
      if (!OUTPUT_EXTENSIONS.includes(extname(name).toLowerCase())) continue;
      const src = join(this.outputDir, name);
      const entry = entryForOutputFile(src, this.entries);
      if (!entry || entry.status === 'rejected' || !isSafeTargetPath(entry.target_path)) {
        if (!entry) this.log(`ignored output/${name} (not "<asset_id>.png|webp" of a requested asset)`);
        continue;
      }
      const dest = this.absTarget(entry.target_path);
      try {
        const s = statSync(src);
        const d = existsSync(dest) ? statSync(dest) : null;
        if (d && d.size === s.size && d.mtimeMs >= s.mtimeMs) continue;
      } catch {
        continue;
      }
      if (this.deliverFromOutput(src)) copied.push(entry.asset_id);
    }
    return copied;
  }

  /** Registry of delivered (present) targets. */
  registry(base = '/'): RegistryPayload {
    return {
      assets: this.entries
        .filter((e) => e.status !== 'rejected' && this.targetExists(e.target_path))
        .map((e) => ({ assetId: e.asset_id, url: publicUrlFor(e.target_path, base), version: this.versionOf(e.target_path) })),
    };
  }

  private write(manifest: AssetManifest): void {
    this.current = manifest;
    const text = serializeManifest(manifest);
    let old: string | null = null;
    try {
      old = readFileSync(this.manifestPath, 'utf8');
    } catch {
      old = null;
    }
    if (old === text) return;
    mkdirSync(dirname(this.manifestPath), { recursive: true });
    writeFileSync(this.manifestPath, text);
  }
}

/** Pull asset requests out of a loaded module (manifests index or the data barrel). */
export function requestsFromModule(mod: Record<string, unknown> | null | undefined): AssetManifestEntry[] {
  if (!mod) return [];
  const isEntry = (v: unknown): v is AssetManifestEntry => !!v && typeof v === 'object' && typeof (v as { asset_id?: unknown }).asset_id === 'string' && typeof (v as { target_path?: unknown }).target_path === 'string';
  const out: AssetManifestEntry[] = [];
  const visit = (v: unknown): void => {
    if (Array.isArray(v)) for (const x of v) if (isEntry(x)) out.push(x);
  };
  for (const [key, value] of Object.entries(mod)) {
    if (Array.isArray(value)) visit(value);
    else if (value && typeof value === 'object' && (key === 'default' || key === 'gameData')) visit((value as { assetRequests?: unknown }).assetRequests);
  }
  const seen = new Set<string>();
  return out.filter((e) => (seen.has(e.asset_id) ? false : (seen.add(e.asset_id), true)));
}
