"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const cardImageBackfillService_1 = require("../services/cardImageBackfillService");
const logger_1 = require("../utils/logger");
async function main() {
    logger_1.logger.info('Running card image backfill...');
    const before = await (0, cardImageBackfillService_1.getImageCoverageStats)();
    logger_1.logger.info(`Before: ${before.withImages}/${before.total} (${before.percentage.toFixed(1)}%)`);
    const result = await (0, cardImageBackfillService_1.backfillCardMappingImages)();
    const after = await (0, cardImageBackfillService_1.getImageCoverageStats)();
    logger_1.logger.info(`After: ${after.withImages}/${after.total} (${after.percentage.toFixed(1)}%)`);
    logger_1.logger.info('Backfill result', result);
}
main().catch((error) => {
    logger_1.logger.error('Backfill failed', { error: error.message });
    process.exit(1);
});
