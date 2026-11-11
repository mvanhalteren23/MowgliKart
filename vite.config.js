import { defineConfig } from 'vite';

// Rapier ships as a base64-embedded WASM ("-compat"), so no special WASM plugin is needed.
// esnext target keeps top-level await working in production builds.
export default defineConfig({
  base: './',
  build: { target: ['es2017', 'chrome61', 'firefox60', 'safari11'], chunkSizeWarningLimit: 3500 },
  esbuild: { target: 'esnext' },
  optimizeDeps: { exclude: ['@dimforge/rapier3d-compat'], esbuildOptions: { target: 'esnext' } },
  server: { host: true },
});
