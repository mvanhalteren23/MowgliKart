/**
 * AssetWatcher — Vite plugin bridging the external art pipeline and the running game.
 *
 * dev:   emits the manifest on start (and when `src/assets/manifests/**` changes), watches
 *        `public/assets/generated/**` and `<pipeline>/output/**`; a file dropped into output/
 *        named `<asset_id>.png|webp` is copied to its `target_path`; a target appearing/changing
 *        marks the entry delivered and pushes `emberwake:asset` over HMR. Serves
 *        `/__emberwake/assets.json` (the client's polling fallback).
 * build: writes `<outDir>/assets/generated/registry.json` listing delivered assets.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import type { Plugin, ResolvedConfig, ViteDevServer } from 'vite';
import type { AssetManifestEntry } from '../../src/types/contracts.ts';
import { entryForTarget, GENERATED_ROOT, ManifestEmitter, publicUrlFor, requestsFromModule } from './manifest.ts';

export const ASSET_EVENT = 'emberwake:asset';
export const ASSETS_ENDPOINT = '/__emberwake/assets.json';
export const MANIFEST_MODULE = '/src/assets/manifests/index.ts';
export const DATA_MODULE = '/src/data/index.ts';

type ModuleLoader = (url: string) => Promise<Record<string, unknown>>;

/** Asset requests via the module graph: the manifests barrel, else `gameData.assetRequests`. */
export async function loadAssetRequests(root: string, load: ModuleLoader, log: (m: string) => void = () => {}): Promise<AssetManifestEntry[] | null> {
  const sources = [MANIFEST_MODULE, DATA_MODULE].filter((u) => existsSync(join(root, u)));
  let found: AssetManifestEntry[] | null = null;
  for (const url of sources) {
    try {
      const list = requestsFromModule(await load(url));
      if (list.length > 0 || found === null) found = list;
      if (list.length > 0) return list;
    } catch (err) {
      log(`could not load ${url}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return found;
}

const posix = (p: string): string => p.split(sep).join('/');

export interface AssetWatcherOptions {
  /** Override the pipeline dir (defaults to `EMBERWAKE_PIPELINE_DIR` or `<root>/shared_pipeline`). */
  readonly pipelineDir?: string;
}

export function AssetWatcher(opts: AssetWatcherOptions = {}): Plugin {
  let config: ResolvedConfig | null = null;
  let emitter: ManifestEmitter | null = null;
  const log = (m: string): void => config?.logger.info(`[emberwake:assets] ${m}`, { timestamp: true }) ?? console.log(m);

  const makeEmitter = (root: string): ManifestEmitter => new ManifestEmitter({ repoRoot: root, log, ...(opts.pipelineDir ? { pipelineDir: opts.pipelineDir } : {}) });

  return {
    name: 'emberwake-asset-watcher',
    configResolved(c) {
      config = c;
    },

    configureServer(server: ViteDevServer) {
      const root = server.config.root;
      const em = makeEmitter(root);
      emitter = em;
      const base = server.config.base;
      const generatedDir = join(root, GENERATED_ROOT);
      const manifestsSrc = join(root, 'src', 'assets', 'manifests');
      const versions = new Map<string, number>();

      const notify = (entry: AssetManifestEntry): void => {
        const version = Math.max(em.versionOf(entry.target_path), (versions.get(entry.asset_id) ?? 0) + 1);
        versions.set(entry.asset_id, version);
        server.ws.send({ type: 'custom', event: ASSET_EVENT, data: { assetId: entry.asset_id, url: publicUrlFor(entry.target_path, base), version } });
      };

      const emit = async (): Promise<void> => {
        const requests = await loadAssetRequests(root, (u) => server.ssrLoadModule(u), log);
        if (requests === null) {
          log('no asset requests found (src/assets/manifests not ready yet) — manifest left untouched');
          return;
        }
        const r = em.emit(requests);
        log(`manifest: ${r.manifest.assets.length} assets (${r.added.length} new, ${r.newlyDelivered.length} newly delivered) → ${relative(root, em.manifestPath)}`);
      };

      const onFile = (file: string): void => {
        const abs = resolve(file);
        if (abs.startsWith(em.outputDir + sep)) {
          try {
            if (!em.deliverFromOutput(abs)) log(`ignored ${relative(root, abs)} (not "<asset_id>.png|webp" of a requested asset)`);
          } catch (err) {
            log(`copy failed for ${abs}: ${err instanceof Error ? err.message : String(err)}`);
          }
          return; // the copy triggers a target event
        }
        if (abs.startsWith(generatedDir)) {
          const entry = entryForTarget(posix(relative(root, abs)), em.entries);
          if (!entry || entry.status === 'rejected') return;
          em.refreshStatus(entry.asset_id);
          notify(entry);
          return;
        }
        if (abs.startsWith(manifestsSrc + sep)) void emit();
      };

      mkdirSync(em.outputDir, { recursive: true });
      server.watcher.add([generatedDir, em.outputDir, manifestsSrc]);
      server.watcher.on('add', onFile);
      server.watcher.on('change', onFile);

      server.middlewares.use((req, res, next) => {
        if (!req.url || req.url.split('?')[0] !== ASSETS_ENDPOINT) return next();
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'no-store');
        res.end(JSON.stringify(em.registry(base)));
      });

      void emit();
    },

    writeBundle() {
      if (!config || config.command !== 'build') return;
      const em = emitter ?? makeEmitter(config.root);
      // Statuses come from the manifest on disk (written by `npm run assets:manifest` / the dev server).
      const existing = em.readExisting();
      if (existing) em.emit(existing.assets);
      const outDir = resolve(config.root, config.build.outDir);
      const dest = join(outDir, 'assets', 'generated', 'registry.json');
      mkdirSync(join(outDir, 'assets', 'generated'), { recursive: true });
      const registry = em.registry(config.base);
      writeFileSync(dest, `${JSON.stringify(registry, null, 2)}\n`);
      log(`registry.json: ${registry.assets.length} delivered assets`);
    },
  };
}
