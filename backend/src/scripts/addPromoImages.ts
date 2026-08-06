/**
 * Promo image tooling (unsupported).
 *
 * Manual mappings + TCGPlayer API fetch were never productized. Prefer
 * `populate-images` / `backfill-images` for real image population.
 *
 * Usage (exits non-zero):
 *   npm run add-promo-images
 */

import { logger } from '../utils/logger';

const MESSAGE = [
  'add-promo-images is unsupported.',
  'TCGPlayer API integration was never implemented, and example.com stub mappings are not applied.',
  'Use populate-images or backfill-images instead.',
].join(' ');

if (require.main === module) {
  logger.error(MESSAGE);
  process.exit(1);
}

export function applyPromoImages(): never {
  throw new Error(MESSAGE);
}

export function showCardsNeedingImages(_setId: string): never {
  throw new Error(MESSAGE);
}
