/**
 * One-shot bootstrap: sync Japanese sets into catalog_cards.
 * Usage:
 *   npx ts-node src/scripts/syncJapaneseCatalog.ts [setLimit]
 *   npx ts-node src/scripts/syncJapaneseCatalog.ts all
 */
import { initializeDatabase, getDb } from '../db/database';
import { runMigrations } from '../db/migrations';
import { syncJapaneseCatalogData } from '../services/catalogSync';
import { logger } from '../utils/logger';

const main = async () => {
  const arg = (process.argv[2] || '13').toLowerCase();
  const full = arg === 'all' || arg === 'full';
  const setLimit = full ? 250 : Math.min(Math.max(parseInt(arg, 10) || 13, 1), 250);
  await initializeDatabase();
  await runMigrations(getDb());
  logger.info('Starting Japanese catalog bootstrap', { setLimit, priorityOnly: !full });
  const result = await syncJapaneseCatalogData(setLimit, { priorityOnly: !full });
  logger.info('Japanese catalog bootstrap complete', result);

  await new Promise<void>((resolve, reject) => {
    getDb().get(
      `SELECT COUNT(*) AS n FROM catalog_cards WHERE language = 'ja'`,
      (err, row: { n: number }) => {
        if (err) reject(err);
        else {
          logger.info('JA catalog row count', { count: row?.n });
          resolve();
        }
      }
    );
  });

  process.exit(0);
};

main().catch((error) => {
  logger.error('Japanese catalog bootstrap failed', { error: (error as Error).message });
  process.exit(1);
});
