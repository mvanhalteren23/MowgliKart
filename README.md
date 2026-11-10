# Mowgli Kart — Red Bull-style Soapbox Downhill Racer

A browser 3D arcade downhill kart racer (Three.js r187 + Rapier3D WASM physics + Vite) built from [`SPEC.md`](SPEC.md):
a **4-race roguelite Draft Cup**, Mario Kart-style hop-drift mini-turbos and jump tricks, Soapbox push-starts judged by a
celebrity panel, cosmetic part shedding with duct-tape repair, janky elevated shortcuts, slipstream drafting, and local
**1–4 player split-screen** against up to 7 AI (8 racers total).

```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # production bundle in dist/
npm run sim          # headless 8-AI race (node scripts/sim.mjs [track_id|cup])
npm run validate-assets && npm run gen-pipeline   # AI-asset tooling, see ASSET_PIPELINE.md
```
Add `?auto=1&players=N` to the URL for an attract/test mode where human karts drive themselves (add `&stay=1` to stop after race 1).


## 🥽 Pico G2 4K — first-person VR

The game is played from the driver's seat and runs as a WebXR app in the headset's browser. There is one build (this site); the headset, phones and computers all open the same URL.

**Target device:** Pico G2 4K only (3DoF headset, Snapdragon 835, 3840×2160 panel, one 3DoF remote with trigger + clickable touchpad).

**Start it**
1. In the G2 4K, open the site in a WebXR-capable browser (Firefox Reality for Pico; Wolvic if it installs on your firmware). The stock 2D browser can show the game as a flat panel but cannot enter VR.
2. Point the remote at **🥽 Enter VR** (top right) and pull the trigger. Menus then appear on a floating panel: point + trigger.
3. `Headset` row in the lobby picks the steering style; `VR detail` (Low / Medium / High) sets render resolution — lower it if the picture stutters.

**Remote**

| Input | Racing | Countdown |
| --- | --- | --- |
| Tilt remote (roll) | Steer (alternatives: touchpad left/right, head tilt) | — |
| Trigger | Hold = hop + drift, release = mini-turbo; tap at a ramp lip = trick | Hold on **DROP!** for the launch |
| Touchpad click | Use item, else fire weapon; click the lower third = shield | Pump in the green zone |
| Touch lower edge of pad | Brake / reverse (gas is automatic) | — |
| App / Back, Home | Browser / system (Back leaves VR) | |

Shields also auto-trigger in VR. Haptics pulse on hits, boosts and menu hover where the browser exposes them.

**Comfort:** the view is horizon-locked (no roll), pitch follows the road smoothly, the heading freezes while you are spun or thrown by the yeti, and the edges of the view darken during hard turns and boosts.

**Headset graphics tier (`vr`, chosen automatically in VR)** — mobile-budget assets from the same models:
- Skybox trick (`src/core/SkyBake.js`): sky, three mountain ranges and a 5,000-tree forest carpet (~157k triangles) are rendered once into a 360° cube map and drawn as the background; nothing distant is drawn per frame. To use your own 360° picture instead, put an equirectangular JPEG at `public/assets/skyboxes/<trackId>.jpg`.
- Lite geometry (`src/core/Lod.js`): every kart, kid, obstacle and item is rebuilt with half the curve segments (karts ≈ 24k → 11k triangles), no outline hulls, coarser mesh merging.
- Track and scenery are split into 220 m chunks that are frustum- and distance-culled; karts beyond 32 m become 100-triangle stand-ins; no shadow pass or post-processing; contact-shadow decals remain.
- Measured in the stereo test mode: ~1.1 M → ~185k triangles per eye on the start grid (worst case). **Not yet measured on a real G2 4K.**

**Without a headset:** add `?vr=sim` to the URL for a side-by-side stereo view (Cardboard-style on a phone; this is also what the automated checks drive).

## 🌐 Multiplayer rooms

Lobby → **Host a room** shows a 4-digit code; other devices choose **Join a room** and enter it (or open `/?join=1234`). Every device is one racer (the host can also run 1–4 split-screen players, or 0 = big-screen spectator that follows the leader). AI fills the grid to 8. Drafts happen on each player's own screen.

- Peer-to-peer over WebRTC (PeerJS public broker) — no game server, works from the static Vercel site.
- Each device simulates its own kart locally (no steering lag in the headset) and streams it 15×/s; other karts are interpolated. The host owns the AI and referees the finishing order. If a player drops, the AI takes over their kart.
- `?transport=bc` uses BroadcastChannel between tabs of one browser for local testing.

## How to play
1. **Lobby** — pick 1–4 players, a kart (Rocket Grocery Kart / Motorized Chicken Coop) and a kid for each.
2. **Pre-race draft** — each race you pick **one of three** dealt cards: a stacking *Stat Boost*, a rechargeable *Weapon*, or a rechargeable *Shield*
   (picking a weapon/shield you already own levels it up). AI racers draft by persona (Balanced Hybrid, Defensive Sprinter, Offensive Brawler, Adaptive Counter).
3. **Summit push-start** — during `3… 2… 1…` tap **Hop/Trick** inside the green zone to raise the Judges' Scorecard (6.0 → 10.0); hold **Throttle only in the last 0.35 s** for a Rocket Start
   (≥ 9.0 = 1.40× for 1.6 s, ≥ 7.5 = 1.20× for 1.0 s). Holding throttle from before 3.0 s = *Blown Gasket* stall.
4. **Race** — drift (hop, then hold) to charge blue/orange/pink mini-turbos, hit ramps and tap Trick right at the lip, slipstream rivals for a slingshot, grab Mystery Boxes,
   take the risky **elevated shortcuts** (hairpins only; need ≈ top speed or a trick/nitro boost to clear the gap — miss and you drop onto the road with 0.65× mud drag).
5. **Standings** — points 15/12/10/8/6/4/2/1 per race, four races, best total wins the Cup.

| | P1 | P2 | Gamepad |
|---|---|---|---|
| Steer / Throttle / Brake | A D / W / S | ← → / ↑ / ↓ | L-stick / R2·A / L2 |
| Hop · Drift · Trick · Push-start | Space | Enter | R1 |
| Mystery item | Left Shift | Right Shift | L1 |
| Circuit weapon | E | / | X |
| Circuit shield | Q | . | B / Y |

Draft: P1 `1/2/3`, P2 `8/9/0`, or mouse / pad (◀ ▶ + A). `M` mute, `P` pause.

## Architecture (matches the spec's module layout)
```
src/core/        GameLoop (60 Hz fixed step), CircuitManager (4-race cup + draft), StartSequence (judges/push-start),
                 SplitScreenRenderer (+HUD), InputManager, AssetManager, AudioManager, RaceSession (one race), UI, FX
src/physics/     PhysicsWorld (Rapier, collision groups, event queue), RaycastSuspension (4-wheel spring/damper + tyre friction)
src/controllers/ KartController (engine, slope assist, hop/drift FSM, tricks, slipstream), DamageModel, KartVisual, AIController
src/track/       TrackSpline (Catmull-Rom, Frenet+banking, arc-length LUT, kickers, shortcut branches), ObstacleManager
src/items/       ItemManager (weapon + shield + pickup slots, projectiles, hazards)
src/registries/  Karts, Characters, Tracks (+obstacles), Items, CircuitDraft (stats/weapons/shields): pure data + procedural fallbacks
```
Content is data-driven: every registry entry carries a `proceduralFallback(THREE)` builder, so the game is fully playable with **no external assets**.
Drop `.glb` files in `public/assets/models/` (see [ASSET_PIPELINE.md](ASSET_PIPELINE.md)) and `npm run validate-assets` to swap them in.

## Art direction
Styled after the supplied reference shots: 4-band cel shading with black inverted-hull outlines on karts/kids, soft ground shadows, dense snow-capped firs,
distant mountain ring, chalets, wooden kicker ramps, rainbow "?" mystery boxes, iridescent oil puddles and soap-bubble shields. Per-track dressing:
Whistler (snow/ski tracks), San Diego (palms + pastel buildings), Great Wall (crenellated battlements + watchtowers), Zoo (baobabs + wooden fences).
HUD: rainbow arc speedometer, circular minimap (shortcuts in yellow), bold rank, colour-framed Item/Weapon/Shield slots, P-badges in split-screen.
Draft: a 3D garage backdrop showing each drafting player's kart + kid, glowing colour-coded stat/weapon/shield cards with rating bars, and the 4-race progress tracker.
Everything is procedural; swap in AI-generated `.glb` models via ASSET_PIPELINE.md for the fully illustrated look.

## Open-slope Whistler + graphics layer
- **Whistler is now an open slope**: a 44 m corridor with an 18 m groomed groove (fast) and moguly **powder** either side (≈20 % slower, less grip), bounded by snowbanks.
  ~300 individually **collidable trees** sit in the powder (≥ 9 m apart so there's always a gap, kept clear of ramps and shortcut decks); hitting one stops/bounces you and sheds parts.
  The other three tracks keep the curbed road. (`def.open`, `TrackSpline._buildOpenMeshes`, `PhysicsWorld.addTree`, surface tag `powder`.)
- **Graphics (Lobby → Graphics High/Low)**: real-time sun shadows that follow the player, bloom + colour grade + vignette + **speed blur on boosts** (single-player),
  procedural sky with sun glow and drifting clouds, falling snow, wind-swaying trees, soft snow/dust spray off the wheels, cinematic orbit camera during the countdown,
  camera that never clips trunks or crowns. Multiplayer uses shadows but not the post-processing chain (it renders each viewport directly).
- **Animation**: kids lean and look into corners, bob with speed and celebrate at the finish; chassis rolls into turns and drifts; trees sway.
- Tuned for desktop GPUs; "Low" disables shadows and post-processing.

## Yeti & graphics upgrade
- **Out of bounds (Whistler)**: the terrain beyond the snowbanks is drivable, with trees. Go > 35 m from the centre line and a **yeti** bursts out of the forest, chases (12 -> 26 m/s),
  grabs you, hurls you back near the groomed groove and you take the same hit as an obstacle (stun, knock, part shed). Get back in time and it wanders off.
- **Graphics**: Ultra tier adds ambient occlusion + 4K shadows; snow normal-maps, ski-carving trails, animated gondola lift, richer trees, soft spray (all disabled on Low).
- See [ROADMAP.md](ROADMAP.md) for the path from MVP to a full game.

## Detail, tracks & controllers (latest)
- **Yeti** now throws on a scripted arc and always lands you on the groomed groove on the first throw, then applies the obstacle penalty once.
- **Tracks** are windier and hillier: rolling crests/dips (pitch -2.5 deg .. +17 deg), extra medium bends between the hairpins, jump kickers nudged onto straights, and a geometry check (no road crosses another).
- **Detailed models** (procedural, until real `.glb` assets arrive): kids with faces/helmets/goggles/hair, wire-basket grocery cart with twin firework rockets, plank-built coop with a hen, tread-block tyres, shaggier yeti, limbed critters.
- **Controllers**: up to 4 pads (Xbox/PlayStation/Switch Pro/generic) on PC, Mac, Android and iOS; hot-plug, auto-adds players, A/d-pad in menus, rumble + phone haptics, touch controls hide when a pad is connected.

## Status vs. the spec
Implemented: everything in spec §3–§6 as a vertical slice — all four tracks (procedural seeded splines with sweepers, banking, 8 jump kickers and 3 shortcuts each), 4-race circuit & draft,
push-start/judges, hop/drift/mini-turbo FSM, trick boost, slipstream, piecemeal shedding + duct-tape snap-back, 4 weapons (with level upgrades), 3 shields, 4 stat boosts with γ diminishing returns, 3 mystery items,
12 kids, 12 karts registered (2 playable), 12 region obstacles, 8-racer AI with whiskers/shortcut/slipstream/combat/draft personas, split-screen with the 91°→108° FOV and (0, 3.4, 7.8) chase camera.

Decisions & deviations (so nothing is a surprise):
- **Rapier is pinned to 0.14.0.** 0.21 changes trimesh/CCD behaviour enough to wedge karts on the shortcut kicker; retune before upgrading. Three is r187.
- **Arcade gravity 14 m/s²** (suspension constants are as specified: k = 18 000, c = 2 400, L_rest 0.45, R 0.25). The damper impulse is capped per step and rays reach 0.18 m past the spring range (grounded-detection margin) — both needed for stable landings at 60 Hz.
- **Jump kickers** are 18° wedges on a downhill road, so the net launch angle is ≈ 11°. Shortcut kickers are 25°. Trick window is exactly −0.20 s / +0.12 s around the lip (+ Pogo-Shock bonus).
- **Janky shortcuts** (spec §3.1.4): inside lane of each hairpin; solid kicker → 24 m gap → 4.2 m elevated plank. The speed gate is *physical* (≈ 0.93 v_top clears it; nitro/trick also work) rather than a scripted check. Chord savings are 18–27 % of the arc (spec: ~28 %). Missing the plank lands you on the road below with the 0.65× / 2 s mud drag.
- **Stat "+0.38 m/s equivalents"** are converted against a 23.5 m/s reference (jump +1.6 %; drift charge +5 % rate).
- **Camera FOV**: 91°/108° is applied as the *16:9-reference* FOV; wide 2-player strips keep the same horizontal FOV instead of fisheyeing.
- **3-player 4th quadrant** is a live 2-D minimap + standings (canvas), not a separate 3-D camera.
- **Not modelled**: pit-crew meshes pushing the kart (the judges, scorecards, gauge and launch are), kart-specific voice barks (ids are registered; audio is synthesised placeholders), the 10 expansion karts are data-only (`playable: false`).
- **Balance**: constants follow the spec; I did *not* re-run its Monte Carlo. Headless sims (`npm run sim`) give ≈ 180 s solo laps and 200–250 s in an 8-kart pack (collisions + weapon hits), vs. the spec's 177 s average.

## Verification done
`npm run build` clean; Node simulations (full 8-AI races on all tracks, the 4-race Cup with drafting); headless-Chromium runs of the real UI (lobby → draft → 1/2/3/4-player races) with zero console errors,
real keyboard control, and a GLB hot-swap round-trip. Physics regression helpers live in `scripts/sim.mjs`.

## Visual pass & tests
- `src/core/TextureFactory.js`: procedural canvas textures (asphalt/snow road with dashed centreline, rumble strips on curves, checkered banner, wood-plank decks, neon boost chevrons, kart wood/metal/stripes/number decals, cockpit dash).
- `src/core/Toon.js`: 3-step nearest-filtered toon ramp, inverted-hull ink outlines (`#14141f`), per-unit mesh baking (big draw-call cut), soft drop-shadow decals.
- Compound meshes in `src/registries/_detail.js`; roadside flags/banners/crowds/guardrails via `InstancedMesh` in `Scenery.js`.
- First-person cockpit camera: `V` key / gamepad R3 / 👁 touch button.
- `npm test` runs `scripts/test.mjs` (node:test: asset contracts, track geometry, AI sessions on all tracks, yeti, trees, powder, cup rules, headset tier, skybox bake, two-device multiplayer sync); `npm run check` = test + build.
