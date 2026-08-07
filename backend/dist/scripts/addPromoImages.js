"use strict";
/**
 * Promo image tooling (unsupported).
 *
 * Manual mappings + TCGPlayer API fetch were never productized. Prefer
 * `populate-images` / `backfill-images` for real image population.
 *
 * Usage (exits non-zero):
 *   npm run add-promo-images
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.applyPromoImages = applyPromoImages;
exports.showCardsNeedingImages = showCardsNeedingImages;
const logger_1 = require("../utils/logger");
const MESSAGE = [
    'add-promo-images is unsupported.',
    'TCGPlayer API integration was never implemented, and example.com stub mappings are not applied.',
    'Use populate-images or backfill-images instead.',
].join(' ');
if (require.main === module) {
    logger_1.logger.error(MESSAGE);
    process.exit(1);
}
function applyPromoImages() {
    throw new Error(MESSAGE);
}
function showCardsNeedingImages(_setId) {
    throw new Error(MESSAGE);
}
