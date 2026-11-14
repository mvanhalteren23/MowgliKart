import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { AssetWatcher } from './tools/asset-pipeline/vitePlugin.ts';

export default defineConfig({
  plugins: [react(), AssetWatcher()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  build: { target: 'es2022', chunkSizeWarningLimit: 1500 },
  test: { environment: 'node', include: ['src/**/*.test.ts', 'tools/**/*.test.ts'] },
});
