# Emberwake: The Hollow Covenant

A mobile-first (landscape), open-world HD-2D RPG vertical slice. Original world, cast and story.
Vite · TypeScript (strict) · React Three Fiber · Three.js · Zustand · Miniplex · Vitest.

```
npm install
npm run dev        # play at the printed URL (landscape; touch or keyboard)
npm test           # 242 tests
npm run build      # typecheck + bundle
```

Keyboard: WASD/arrows move · Space/Enter context action · Q/E or 1–3 swap leader · F field action ·
C chronicle · I inspector · T township.

## The slice
- One 250 m × 250 m frontier biome: Lanternwick, Saltmarket and the Cinder Ring, the Hearthstead township plot.
- Swappable leaders: **Kael** (fishing, Drake-Sight, dragon forms), **Tobin** (hunting shot), **Vesna** (hunting dash).
- Warden fusions **Ashka** (fire) and **Mirelle** (water), with Armor Break instead of permanent loss.
- Main quest *The Lanternwick Ledger*; companion quests *Embers of the Clan* (relic **Wyrm's Lament**, scales
  with level and liberated regions) and *Debts of the Cinder Ring* (signature **Cinder Ring Talon**, counter-attack hook).
- Township: recruit the carpenter and blacksmith and raise their workshops.

## Layout
| Path | What |
| --- | --- |
| `src/types/contracts.ts` | Shared immutable interfaces |
| `src/core` | Deterministic combat, dragon forms, fusion decorators, gear engine, quest state machine |
| `src/data`, `src/systems` | Authored content; township, hunting (wind/scent) and fishing rules |
| `src/engine` | HD-2D renderer, chunk streaming, GLSL shaders, procedural asset bootstrapper |
| `src/ui` | Mobile HUD |
| `src/app` | Zustand store, runtime bus, end-to-end tests |

See `CLAUDE.md` for ownership rules and the subagent definitions in `.claude/agents/`.
