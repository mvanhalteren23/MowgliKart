# Emberwake: The Hollow Covenant

Mobile-first (landscape), open-world HD-2D RPG vertical slice. **Original IP** — an
original world, cast and story in the classic 16-bit dragon-clan JRPG genre. Do not
introduce names, characters, plot, art or music from any existing commercial game.

Stack: Vite · TypeScript (strict) · React 19 · React Three Fiber · Three.js · Zustand · Miniplex ECS · Vitest.

## Commands
- `npm run dev` — dev server · `npm run build` — typecheck + bundle
- `npm run typecheck` — `tsc --noEmit` (must be clean) · `npm test` — Vitest (must be green)

## World bible (short)
- **Kael** — last of the Ashen Drake clan. Dragon forms (Sync/AP). Field: fishing + Drake-Sight.
- **Tobin Marsh** — frontier warden, longbow. Field: hunting shot (wind/scent tracking).
- **Vesna** — glaive duelist from the Cinder Ring arena. Field: hunting dash.
- Locked roster (defined, not yet playable): Orla, Hadrik, Pim, Quill, Moss, Sable.
- **Wardens** (spirit fusion): Ashka (fire), Mirelle (water) — playable; Zephra (wind), Tor (earth),
  Lumen (holy), Nyx (shadow) — defined, sealed.
- **The Hollow Covenant** — the church of the Still Flame; quietly siphoning tithes and "stilling" spirits.
- Slice biome (250 m × 250 m): **Lanternwick** (home town), **Saltmarket** (port + Cinder Ring),
  **Hearthstead** (player township frontier plot).
- Main quest: *The Lanternwick Ledger*. Companion quests: *Embers of the Clan* (Kael → relic
  **Wyrm's Lament**) and *Debts of the Cinder Ring* (Vesna → signature **Cinder Ring Talon**).

## Architecture & ownership (hard boundaries)
| Path | Owner | Rules |
| --- | --- | --- |
| `src/types/contracts.ts` | lead | Single source of truth. Immutable interfaces. Agents never edit; request changes in their report. |
| `src/app/**`, `src/App.tsx`, `src/main.tsx` | lead | Zustand store, runtime bus, service wiring, e2e tests. |
| `src/engine/shaders/**`, `src/engine/bootstrapAssets.ts` | lead | GLSL + procedural assets. Read-only for agents. |
| `src/core/**` | `core-sim` | Pure deterministic sim. **No** three / react / DOM / `src/data` imports. |
| `src/engine/**` (rest) | `engine-hd2d` | R3F scene, streaming, sprites, cameras. |
| `src/ui/**` | `mobile-ui` | DOM HUD overlay. No three imports. |
| `src/data/**`, `src/systems/**`, `src/assets/manifests/**` | `world-lore` | Content, pure world systems, asset requests. No three / react / DOM. |
| `src/engine/assets/**`, `tools/asset-pipeline/**` | `engine-hd2d` | Asset registry (client) + manifest emitter / watcher (node). |
| `shared_pipeline/**`, `public/assets/generated/**` | external art agent | Generated art only. Emberwake code never writes art files. |

Cross-module communication goes only through `contracts.ts`, the Zustand store
(`src/app/store.ts`) and the mutable runtime bus (`src/app/runtime.ts`).

## Subagent guardrails
- Every `.claude/agents/*.md` pins `model: claude-opus-5-5`. Never `inherit`, never `fable`.
- Agents stay inside their owned paths, never run git commands, never `npm install` new packages.
- Each agent finishes with `npx tsc --noEmit` clean for its files and its own Vitest files green.

## Phase 3 rules
- **No new procedural/placeholder art.** Every new visual is requested via an `AssetManifestEntry`
  (`src/assets/manifests`) and rendered from `public/assets/generated/` once delivered; until then
  show a debug wireframe/outline with the asset id. (The Phase 1–2 procedural bootstrapper stays as-is.)
- **Do not modify `src/core/combat/**`.** Extend combat with `CombatModifierHandler` decorators.
- Asset prompts describe an original style; never reference existing games or their art.

## Conventions
- All contract data is `readonly`; state transitions return new objects (no mutation).
- Determinism: core/systems take an explicit seed / rng state — never `Math.random()` or `Date.now()`.
- Import alias `@/` → `src/`. `noUncheckedIndexedAccess` is on: handle `undefined`.
- Perf budget: < 150 draw calls at 60 fps on mid-range mobile; touch targets ≥ 48 × 48 px.
