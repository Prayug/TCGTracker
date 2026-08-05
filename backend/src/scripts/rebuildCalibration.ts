/**
 * Full calibration reset + rebuild.
 *
 * The old sample pool was unusable: 634k of 830k 7d samples came from stale
 * June-era rows that predate any prediction run, bucket keys mixed scales
 * (v3.x stored post-calibration expected returns via a COALESCE fallback), and
 * the backtest harvest produced zero samples because card_mappings.rarity was
 * blank. This script purges everything, re-harvests from the current engine
 * (raw signal keys on one scale), and rebuilds the curves.
 *
 * Usage: npx ts-node src/scripts/rebuildCalibration.ts
 */
import { initializeDatabase, getDb } from '../db/database';
import { runMigrations } from '../db/migrations';
import {
  collectForwardTestSamples,
  harvestBacktestSamples,
  rebuildAllCalibrationModels,
  getCalibrationStatus,
} from '../services/returnCalibration';
import { logger } from '../utils/logger';

const SAMPLE_SIZE = 2500;

function cutoffs(weeksBeforeToday: number[]): string[] {
  const out: string[] = [];
  for (const w of weeksBeforeToday) {
    const d = new Date();
    d.setDate(d.getDate() - w * 7);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

async function main() {
  logger.info('Initializing database + running migrations...');
  await initializeDatabase();
  const db = getDb();
  await runMigrations(db);

  logger.info('Purging calibration_samples + calibration_model...');
  await new Promise<void>((resolve, reject) => {
    db.serialize(() => {
      db.run('DELETE FROM calibration_samples', (err) => (err ? reject(err) : resolve()));
    });
  });
  await new Promise<void>((resolve, reject) => {
    db.run('DELETE FROM calibration_model', (err) => (err ? reject(err) : resolve()));
  });

  // Forward-test samples: only runs that recorded a true raw signal_score
  // (v4.0.0+) are eligible; v3.x rows are scale-polluted and stay out.
  logger.info('Collecting forward-test samples (signal_score IS NOT NULL)...');
  const ft = await collectForwardTestSamples();
  logger.info(`Forward-test samples collected: ${ft}`);

  // Backtest harvest: cutoffs picked so each window's outcome has matured
  // against real price history (price_history starts 2026-02-11).
  const harvests: Array<{ days: number; cutoffs: string[] }> = [
    { days: 7, cutoffs: cutoffs([1, 2, 3]) },
    { days: 30, cutoffs: cutoffs([4, 6, 8]) },
    { days: 90, cutoffs: cutoffs([12, 16, 20]) },
  ];
  for (const h of harvests) {
    logger.info(`Harvesting ${h.days}d backtest samples at ${h.cutoffs.join(', ')}...`);
    const stored = await harvestBacktestSamples(h.cutoffs, h.days, SAMPLE_SIZE);
    logger.info(`${h.days}d backtest samples stored: ${stored}`);
  }

  logger.info('Rebuilding calibration models...');
  const models = await rebuildAllCalibrationModels();
  for (const s of getCalibrationStatus(models)) {
    logger.info(
      `Calibration ${s.horizon}d: samples=${s.sampleCount} bias=${s.bias} ` +
      `marketMedian=${s.marketMedianReturn} builtAt=${s.builtAt}`
    );
  }

  logger.info('Calibration rebuild complete.');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
