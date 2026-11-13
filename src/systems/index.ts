import type { GameDatabase, WorldSystems } from '@/types/contracts';
import { createFishing } from './fishing';
import { createHunting } from './hunting';
import { createTownship } from './township';

export { BITE_WINDOW, LURE_BONUS, MAX_REEL } from './fishing';
export { HERD_PANIC_RADIUS, SHOT_CONE } from './hunting';

/** Pure, deterministic world rules (township, wind/scent hunting, fishing) over an authored database. */
export function createWorldSystems(db: GameDatabase): WorldSystems {
  return {
    township: createTownship(db),
    hunting: createHunting(db),
    fishing: createFishing(db),
  };
}
