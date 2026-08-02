/**
 * One-shot runner for pending migrations (especially migration 24).
 * Usage: npx ts-node src/scripts/runMigration24.ts
 */
import { initializeDatabase, getDb } from '../db/database';
import { runMigrations } from '../db/migrations';
import { materializeCanonicalPrices } from '../services/canonicalPriceService';
import { runDataQualityChecks } from '../services/dataQualityService';
import { rebuildAllCalibrationModels } from '../services/returnCalibration';
import { logger } from '../utils/logger';

async function main() {
  logger.info('Initializing database + running migrations...');
  await initializeDatabase();
  const db = getDb();
  await runMigrations(db);

  logger.info('Materializing canonical prices (full rebuild)...');
  const canonical = await materializeCanonicalPrices({ fullRebuild: true });
  logger.info('Canonical prices done', canonical);

  logger.info('Rebuilding calibration models from deduped samples...');
  await rebuildAllCalibrationModels();

  logger.info('Running data quality checks...');
  const quality = await runDataQualityChecks();
  logger.info('Data quality summary', {
    passed: quality.passed,
    warned: quality.warned,
    failed: quality.failed,
    checks: quality.checks.map((c) => `${c.checkName}=${c.status}`),
  });

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
