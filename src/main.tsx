import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@/App';
import { runtime } from '@/app/runtime';
import { bindServices, useGame } from '@/app/store';
import { createCoreServices } from '@/core';
import { gameData } from '@/data';
import { bootstrapAssets } from '@/engine/bootstrapAssets';
import { createWorldSystems } from '@/systems';

// Collect every sprite the database references and pre-bake the procedural sheets.
const spriteIds = new Set<string>();
for (const h of Object.values(gameData.heroes)) spriteIds.add(h.sprite);
for (const f of Object.values(gameData.dragonForms)) spriteIds.add(f.sprite);
for (const e of Object.values(gameData.enemies)) spriteIds.add(e.sprite);
for (const s of Object.values(gameData.species)) spriteIds.add(s.sprite);
for (const n of gameData.world.npcs) spriteIds.add(n.sprite);
for (const z of gameData.world.encounterZones) spriteIds.add(z.sprite);
bootstrapAssets([...spriteIds]);

bindServices({ db: gameData, core: createCoreServices(gameData), systems: createWorldSystems(gameData) });

// Debug/test handle (used by the Playwright smoke test).
(window as unknown as Record<string, unknown>).__emberwake = { useGame, runtime, db: gameData };

const root = document.getElementById('root');
if (!root) throw new Error('#root missing');
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
