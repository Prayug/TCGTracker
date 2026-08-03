import { getDb } from '../db/database';
import { logger } from '../utils/logger';

/**
 * Safe retention policies.
 *
 * Price history is NEVER truncated below MIN_PRICE_HISTORY_DAYS — long-horizon
 * models and backtests depend on it. Prediction runs are pruned to the last N.
 */

export const MIN_PRICE_HISTORY_DAYS = 400;
export const DEFAULT_PREDICTION_RUNS_TO_KEEP = 30;
export const DEFAULT_DATA_QUALITY_DAYS_TO_KEEP = 90;

const run = (sql: string, params: unknown[] = []): Promise<{ changes: number }> =>
  new Promise((resolve, reject) => {
    getDb().run(sql, params, function (this: { changes: number }, err) {
      if (err) reject(err);
      else resolve({ changes: this.changes });
    });
  });

const get = <T>(sql: string, params: unknown[] = []): Promise<T | undefined> =>
  new Promise((resolve, reject) => {
    getDb().get(sql, params, (err, row) => (err ? reject(err) : resolve(row as T | undefined)));
  });

export interface RetentionResult {
  deletedPredictionRuns: number;
  deletedDataQualityRows: number;
  priceHistoryPruned: number;
  skippedPricePruneReason?: string;
}

/**
 * Keep the newest `keepRuns` prediction runs; cascade deletes predictions/results
 * via FK when configured, otherwise delete children explicitly.
 */
export async function pruneOldPredictionRuns(
  keepRuns: number = DEFAULT_PREDICTION_RUNS_TO_KEEP
): Promise<number> {
  const cutoff = await get<{ id: number }>(
    `SELECT id FROM prediction_runs ORDER BY id DESC LIMIT 1 OFFSET ?`,
    [Math.max(0, keepRuns - 1)]
  );
  if (!cutoff?.id) return 0;

  // Delete children first in case FK cascade is missing on older DBs.
  await run(
    `DELETE FROM prediction_results
     WHERE prediction_id IN (SELECT id FROM card_predictions WHERE run_id < ?)`,
    [cutoff.id]
  );
  const pred = await run(`DELETE FROM card_predictions WHERE run_id < ?`, [cutoff.id]);
  const runs = await run(`DELETE FROM prediction_runs WHERE id < ?`, [cutoff.id]);
  logger.info('Pruned old prediction runs', {
    cutoffRunId: cutoff.id,
    deletedRuns: runs.changes,
    deletedPredictions: pred.changes,
  });
  return runs.changes;
}

/**
 * Optional price-history prune — only removes days older than max(MIN_PRICE_HISTORY_DAYS, keepDays).
 * Refuses to run if the resulting span would drop below MIN_PRICE_HISTORY_DAYS.
 */
export async function pruneOldPriceHistory(keepDays: number = MIN_PRICE_HISTORY_DAYS): Promise<{
  deleted: number;
  skippedReason?: string;
}> {
  const effectiveKeep = Math.max(keepDays, MIN_PRICE_HISTORY_DAYS);
  const span = await get<{ days: number; maxDate: string }>(
    `SELECT CAST(julianday(MAX(date)) - julianday(MIN(date)) AS INTEGER) AS days,
            MAX(date) AS maxDate
     FROM price_history`
  );
  if (!span?.maxDate) {
    return { deleted: 0, skippedReason: 'no price history' };
  }
  if ((span.days ?? 0) <= effectiveKeep) {
    return {
      deleted: 0,
      skippedReason: `history span ${span.days}d ≤ keep ${effectiveKeep}d`,
    };
  }

  const cutoff = await get<{ d: string }>(
    `SELECT date(?, ?) AS d`,
    [span.maxDate, `-${effectiveKeep} days`]
  );
  if (!cutoff?.d) return { deleted: 0, skippedReason: 'could not compute cutoff' };

  const result = await run(`DELETE FROM price_history WHERE date < ?`, [cutoff.d]);
  // Also prune canonical series to stay in sync
  await run(`DELETE FROM canonical_price_history WHERE date < ?`, [cutoff.d]).catch(() => ({
    changes: 0,
  }));
  await run(`DELETE FROM graded_price_history WHERE date < ?`, [cutoff.d]).catch(() => ({
    changes: 0,
  }));

  logger.info('Pruned old price history', { cutoff: cutoff.d, deleted: result.changes });
  return { deleted: result.changes };
}

export async function pruneDataQualityChecks(
  keepDays: number = DEFAULT_DATA_QUALITY_DAYS_TO_KEEP
): Promise<number> {
  const result = await run(
    `DELETE FROM data_quality_checks WHERE checked_at < datetime('now', ?)`,
    [`-${keepDays} days`]
  );
  return result.changes;
}

export async function runRetentionPolicies(options?: {
  keepPredictionRuns?: number;
  keepPriceHistoryDays?: number;
  prunePriceHistory?: boolean;
}): Promise<RetentionResult> {
  const deletedPredictionRuns = await pruneOldPredictionRuns(
    options?.keepPredictionRuns ?? DEFAULT_PREDICTION_RUNS_TO_KEEP
  );
  const deletedDataQualityRows = await pruneDataQualityChecks();

  let priceHistoryPruned = 0;
  let skippedPricePruneReason: string | undefined;
  if (options?.prunePriceHistory) {
    const price = await pruneOldPriceHistory(
      options.keepPriceHistoryDays ?? MIN_PRICE_HISTORY_DAYS
    );
    priceHistoryPruned = price.deleted;
    skippedPricePruneReason = price.skippedReason;
  }

  return {
    deletedPredictionRuns,
    deletedDataQualityRows,
    priceHistoryPruned,
    skippedPricePruneReason,
  };
}
