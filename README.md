# Emberwake: The Hollow Covenant

A mobile-first (landscape), open-world HD-2D RPG vertical slice. Original world, cast and story.
Vite · TypeScript (strict) · React Three Fiber · Three.js · Zustand · Miniplex · Vitest.

```
npm install
npm run dev        # play at the printed URL (landscape; touch or keyboard)
npm test           # 432 tests
npm run build      # typecheck + bundle
```

Keyboard: WASD/arrows move · Space/Enter context action · Q/E or 1–3 swap leader · F field action ·
C chronicle · I inspector · T township.

## The campaign
- Ten connected 250 m × 250 m chunks across three acts: Ashfall Reach (prologue), the Lanternwick Frontier,
  Galecrest Heights, Marrowgate March, the Mirefast Marshes, the Glass Dunes of Saffrane, Hollowroot Weald,
  the Rimefold, the Emberdeep Caldera and Greyspire.
- Nine heroes. Kael, Tobin and Vesna start; Orla (glide), Hadrik (roll), Sable (grapple), Pim (leap),
  Moss (commune) and Quill (unseal) join through the story and clear the traversal gates that open the world.
- A ten-chapter story graph, Hollow Covenant investigations with 15 clues, and three endings.
- Three-stage personal quest lines for all nine heroes, each awarding a bound scaling relic and a
  build-altering signature item.
- Kael's dragon forms: a hatchling, cinder, rime and storm forms, and an apex form unlocked in Act III.
- Gesture mini-games: drag-to-aim hunting with wind and scent; flick-to-cast, crank-to-reel fishing.
- Hearthstead township: six residents, six buildings, each upgradable to level 3.

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
