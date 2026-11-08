# Mowgli Kart — from MVP to full game

Status today: 4 tracks (Whistler = open slope), 2 playable karts, 12 kids, 4-race Draft Cup, 1-4 local players + 7 AI, touch controls, deployed on Vercel.

## Done recently
- Open-slope Whistler: powder, moguls, collidable trees, snowbanks; out-of-bounds **yeti** (chase -> grab -> throw -> obstacle penalty).
- Graphics tiers (Low / High / **Ultra**): shadows, bloom, speed blur, ambient occlusion, snow normal-maps, ski trails, gondola lift, sky + clouds + snowfall.

## Proposed phases (rough effort in brackets: S = days, M = 1-2 wks, L = 3+ wks)

### 1. Make it look & sound like a finished game
- Replace procedural meshes with real `.glb` karts/kids/obstacles (prompts are in ASSET_PIPELINE.md) and skinned kid/yeti/NPC animation. [M, mostly asset work]
- Real audio: SFX + kid voice barks (ElevenLabs), music per track (Suno), engine loops, positional audio. [S-M]
- Open-slope treatment for the other 3 tracks (San Diego hillside streets, Great Wall ridge, Zoo safari) each with its own out-of-bounds creature (e.g. raccoon swarm, dragon, rhino). [L]
- Environmental storytelling: finish podium + replay camera, intro cinematic, weather variants (blizzard, night, golden hour). [M]

### 2. Depth & progression
- Garage/progression: coins from races, unlock the 10 pre-registered karts, kart/kid stats screen, cosmetic paint & stickers. [M]
- Cup modes: Time Trial + ghost, Grand Prix difficulty tiers (50/100/150cc), Hot-seat tournament. [M]
- AI v2: lane graph with multiple lines through the trees, item-use personalities, catch-up that doesn't feel unfair. [M]
- More items/weapons/shields and a balance pass (re-run the Monte-Carlo sim in scripts/sim.mjs with the new open-slope data). [M]
- Tutorial / how-to-play that teaches push-start, drift, trick, slipstream, draft. [S]

### 3. Platform & polish
- Settings menu: remappable controls, audio sliders, graphics options, accessibility (colour-blind, reduced motion). [S]
- Save data (localStorage now; Neon Postgres for accounts later). [S -> M]
- PWA install (offline, fullscreen on phones), gamepad rumble, haptics. [S]
- Performance: LOD for trees, instanced foliage culling, texture atlases, dynamic resolution; target 60 fps on mid phones. [M]
- Error reporting + analytics. [S]

### 4. Online
- Async leaderboards / ghost sharing per track (cheap, high value). [M]
- Real-time online multiplayer (authoritative server or deterministic lockstep; Rapier is deterministic). [L]

## Suggested next slice (2-3 weeks)
1. Audio pass (ElevenLabs SFX/barks) + settings menu.
2. Garage + coins + unlock the other karts.
3. Open-slope San Diego (second showcase) with a new out-of-bounds hazard.
4. First batch of real `.glb` assets (2 karts + 4 kids + yeti).
