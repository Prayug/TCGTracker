import { backfillCardMappingImages, getImageCoverageStats } from '../services/cardImageBackfillService';
import { logger } from '../utils/logger';

async function main() {
  logger.info('Running card image backfill...');
  const before = await getImageCoverageStats();
  logger.info(`Before: ${before.withImages}/${before.total} (${before.percentage.toFixed(1)}%)`);

  const result = await backfillCardMappingImages();

  const after = await getImageCoverageStats();
  logger.info(`After: ${after.withImages}/${after.total} (${after.percentage.toFixed(1)}%)`);
  logger.info('Backfill result', result);
}

main().catch((error) => {
  logger.error('Backfill failed', { error: (error as Error).message });
  process.exit(1);
});
