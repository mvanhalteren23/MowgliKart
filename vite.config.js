import { defineConfig } from 'vite';

// Rapier ships as a base64-embedded WASM ("-compat"), so no special WASM plugin is needed.
// esnext target keeps top-level await working in production builds.
export default defineConfig({
  base: './',
  build: { target: 'esnext', chunkSizeWarningLimit: 2500 },
  esbuild: { target: 'esnext' },
  optimizeDeps: { exclude: ['@dimforge/rapier3d-compat'], esbuildOptions: { target: 'esnext' } },
  server: { host: true },
});
