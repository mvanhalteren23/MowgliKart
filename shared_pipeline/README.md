# Shared asset pipeline

Contract between Emberwake and the external art agent.

- `manifests/pending_assets.json` — written by Emberwake (`npm run assets:manifest`, and automatically by the dev
  server). Each entry describes one visual to produce. Schema: `AssetManifest` in `src/types/contracts.ts`.
  Do not hand-edit entries; the emitter regenerates them and preserves each entry's `status`.
- Deliver a finished file either
  - directly to the entry's `target_path` (under `public/assets/generated/`), or
  - into `output/` named `<asset_id>.png` / `<asset_id>.webp` — the dev server copies it to `target_path`.
- On delivery the dev server marks the entry `delivered` and hot-swaps the texture in the running game.
- The art agent may set `status` to `in_progress` while working.

The directory can be relocated with the `EMBERWAKE_PIPELINE_DIR` environment variable.
