import type { AssetManifestEntry } from '@/types/contracts';
import { phase3Assets } from './phase3';

export { ASSET, FACINGS, HAZARD_ASSET, QTE_PROMPT_ASSET, phase3Assets } from './phase3';

/** Every visual Emberwake requests from the external pipeline (`GameDatabase.assetRequests`). */
export const allAssetRequests: readonly AssetManifestEntry[] = [...phase3Assets];
