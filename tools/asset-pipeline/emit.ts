/**
 * `npm run assets:manifest` — regenerate `<pipeline>/manifests/pending_assets.json`
 * without a running dev server: boots Vite in middleware mode (for the `@/` alias and TS
 * transforms), loads the asset requests through the module graph, merges, writes, exits.
 */
import { fileURLToPath } from 'node:url';
import { dirname, relative, resolve } from 'node:path';
import { createServer } from 'vite';
import { ManifestEmitter } from './manifest.ts';
import { loadAssetRequests } from './vitePlugin.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const server = await createServer({
  configFile: false,
  root,
  logLevel: 'error',
  appType: 'custom',
  resolve: { alias: { '@': resolve(root, 'src') } },
  server: { middlewareMode: true, hmr: false, watch: null },
  optimizeDeps: { noDiscovery: true, include: [] },
});
let code = 0;
try {
  const log = (m: string): void => console.log(`[emberwake:assets] ${m}`);
  const requests = await loadAssetRequests(root, (u) => server.ssrLoadModule(u), log);
  if (requests === null) {
    log('no asset requests found — nothing written');
  } else {
    const em = new ManifestEmitter({ repoRoot: root, log });
    const r = em.emit(requests);
    log(`${r.manifest.assets.length} assets (${r.added.length} new, ${r.removed.length} removed, ${r.newlyDelivered.length} newly delivered) → ${relative(root, em.manifestPath)}`);
  }
} catch (err) {
  console.error(err);
  code = 1;
} finally {
  await server.close();
}
process.exit(code);
