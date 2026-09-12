/**
 * Run a full catalog price snapshot for a calendar date (America/New_York).
 *
 *   npx ts-node src/scripts/runPriceUpdate.ts
 *   npx ts-node src/scripts/runPriceUpdate.ts --date 2026-08-29
 */
import { initializeDatabase, getDb } from '../db/database';
import { runMigrations } from '../db/migrations';
import { getRunDate, updatePriceData } from '../services/dataFetcher';
import { logger } from '../utils/logger';

const dateFlag = process.argv.indexOf('--date');
const requested = dateFlag >= 0 ? process.argv[dateFlag + 1] : process.argv[2];
const runDate = requested && /^\d{4}-\d{2}-\d{2}$/.test(requested) ? requested : getRunDate();

const main = async () => {
  await initializeDatabase();
  await runMigrations(getDb());
  logger.info('Starting price snapshot', { runDate });
  const result = await updatePriceData({ runDate });
  logger.info('Price snapshot finished', result);
  if (result.skipped || (result as { error?: string }).error) {
    process.exit(1);
  }
  process.exit(0);
};

main().catch((error) => {
  logger.error('Price snapshot failed', { error: (error as Error).message });
  process.exit(1);
});
