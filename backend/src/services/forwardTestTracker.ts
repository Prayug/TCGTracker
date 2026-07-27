import { getDb } from '../db/database';
import { logger } from '../utils/logger';
import { computeValidationMetrics } from './validationMetrics';

const WINDOW_DAYS = [7, 30, 90, 180, 365] as const;

const WINDOW_COLS: Record<number, { price: string; dir: string }> = {
  7: { price: 'actual_7d_price', dir: 'direction_correct_7d' },
  30: { price: 'actual_30d_price', dir: 'direction_correct_30d' },
  90: { price: 'actual_90d_price', dir: 'direction_correct_90d' },
  180: { price: 'actual_180d_price', dir: 'direction_correct_180d' },
  365: { price: 'actual_365d_price', dir: 'direction_correct_365d' },
};

/** Look back this far when aggregating forward-test accuracy. */
const TRACKING_LOOKBACK_DAYS = 180;

export interface WindowAccuracy {
  pending: number;
  hit: number;
  missed: number;
  accuracy: number | null;
  rankIC: number | null;
  meanBias: number | null;
  hitRate: number | null;
}

export interface CategoryAccuracy {
  category: string;
  total: number;
  hit: number;
  missed: number;
  partiallyCorrect: number;
  accuracy: number | null;
  avgError: number | null;
}

export interface ForwardTestStatus {
  totalPredictions: number;
  pending: number;
  hit: number;
  missed: number;
  partiallyCorrect: number;
  overallAccuracy: number | null;
  latestRunId: number | null;
  latestRunDate: string | null;
  matureEnoughFor7d: number;
  byWindow: {
    _7d: WindowAccuracy;
    _30d: WindowAccuracy;
    _90d: WindowAccuracy;
    _180d: WindowAccuracy;
    _365d: WindowAccuracy;
  };
  byCategory: CategoryAccuracy[];
  byPriceRange: {
    under5: { total: number; hit: number; accuracy: number | null };
    fiveToFifty: { total: number; hit: number; accuracy: number | null };
    overFifty: { total: number; hit: number; accuracy: number | null };
  };
}

function daysSincePrediction(predictionDate: string, now = new Date()): number {
  const predDate = new Date(predictionDate + 'T00:00:00Z');
  return Math.floor((now.getTime() - predDate.getTime()) / (1000 * 60 * 60 * 24));
}

function computeReturn(actual: number | null, currentPrice: number): number | null {
  return actual !== null && currentPrice > 0 ? (actual - currentPrice) / currentPrice : null;
}

function computeError(expected: number | null | undefined, actualReturn: number | null): number | null {
  return actualReturn !== null && expected != null ? Math.abs(expected - actualReturn) : null;
}

function computeDirection(expected: number | null | undefined, actualReturn: number | null): number | null {
  if (expected == null || actualReturn == null) return null;
  return (expected > 0) === (actualReturn > 0) ? 1 : 0;
}

/**
 * A window counts as a hit only when the prediction added real information:
 * direction was correct AND the error is small relative to the actual move
 * (with a floor so tiny flat moves don't produce free hits).
 */
export function windowIsHit(
  direction: number | null,
  error: number | null,
  actualReturn: number | null
): boolean {
  if (direction !== 1 || error == null || actualReturn == null) return false;
  return error < 0.5 * Math.max(Math.abs(actualReturn), 0.03);
}

export function resolveStatus(windows: Array<{ has: boolean; hit: boolean }>): string {
  // Resolve against the longest matured window only — never invent later windows.
  const matured = windows.filter(w => w.has);
  if (matured.length === 0) return 'pending';
  const hits = matured.filter(w => w.hit);
  if (hits.length === matured.length) return 'hit';
  if (hits.length > 0) return 'partially_correct';
  return 'missed';
}

/**
 * Clear actuals that were written before their window matured (legacy bug:
 * fetchActualPrice used "latest price ≤ future target date" = today's price).
 */
async function scrubPrematureActuals(): Promise<number> {
  const db = getDb();
  return new Promise((resolve, reject) => {
    db.run(
      `UPDATE prediction_results
       SET
         actual_30d_price = CASE WHEN julianday('now') - julianday(cp.prediction_date) < 30 THEN NULL ELSE actual_30d_price END,
         actual_30d_return = CASE WHEN julianday('now') - julianday(cp.prediction_date) < 30 THEN NULL ELSE actual_30d_return END,
         error_30d = CASE WHEN julianday('now') - julianday(cp.prediction_date) < 30 THEN NULL ELSE error_30d END,
         direction_correct_30d = CASE WHEN julianday('now') - julianday(cp.prediction_date) < 30 THEN 0 ELSE direction_correct_30d END,
         actual_90d_price = CASE WHEN julianday('now') - julianday(cp.prediction_date) < 90 THEN NULL ELSE actual_90d_price END,
         actual_90d_return = CASE WHEN julianday('now') - julianday(cp.prediction_date) < 90 THEN NULL ELSE actual_90d_return END,
         error_90d = CASE WHEN julianday('now') - julianday(cp.prediction_date) < 90 THEN NULL ELSE error_90d END,
         direction_correct_90d = CASE WHEN julianday('now') - julianday(cp.prediction_date) < 90 THEN 0 ELSE direction_correct_90d END,
         actual_180d_price = CASE WHEN julianday('now') - julianday(cp.prediction_date) < 180 THEN NULL ELSE actual_180d_price END,
         actual_180d_return = CASE WHEN julianday('now') - julianday(cp.prediction_date) < 180 THEN NULL ELSE actual_180d_return END,
         error_180d = CASE WHEN julianday('now') - julianday(cp.prediction_date) < 180 THEN NULL ELSE error_180d END,
         direction_correct_180d = CASE WHEN julianday('now') - julianday(cp.prediction_date) < 180 THEN 0 ELSE direction_correct_180d END,
         actual_365d_price = CASE WHEN julianday('now') - julianday(cp.prediction_date) < 365 THEN NULL ELSE actual_365d_price END,
         actual_365d_return = CASE WHEN julianday('now') - julianday(cp.prediction_date) < 365 THEN NULL ELSE actual_365d_return END,
         error_365d = CASE WHEN julianday('now') - julianday(cp.prediction_date) < 365 THEN NULL ELSE error_365d END,
         direction_correct_365d = CASE WHEN julianday('now') - julianday(cp.prediction_date) < 365 THEN 0 ELSE direction_correct_365d END,
         status = CASE
           WHEN julianday('now') - julianday(cp.prediction_date) < 7 THEN 'pending'
           ELSE status
         END
       FROM card_predictions cp
       WHERE cp.id = prediction_results.prediction_id
         AND julianday('now') - julianday(cp.prediction_date) < 90
         AND (
           (julianday('now') - julianday(cp.prediction_date) < 30 AND prediction_results.actual_30d_price IS NOT NULL)
           OR (julianday('now') - julianday(cp.prediction_date) < 90 AND prediction_results.actual_90d_price IS NOT NULL)
         )`,
      function (this: { changes: number }, err) {
        if (err) return reject(err);
        resolve(this.changes || 0);
      }
    );
  });
}

export async function updateActualResults(): Promise<{ updated: number }> {
  const db = getDb();

  try {
    const scrubbed = await scrubPrematureActuals();
    if (scrubbed > 0) {
      logger.info(`Scrubbed premature forward-test actuals on ${scrubbed} rows`);
    }
  } catch (err) {
    logger.warn('Failed to scrub premature forward-test actuals:', err);
  }

  // Only predictions old enough for at least the 7d window, still needing work.
  const pendingPredictions: any[] = await new Promise((resolve, reject) => {
    db.all(
      `SELECT cp.id, cp.card_id, cp.unique_identifier, cp.prediction_date, cp.current_price,
              cp.expected_7d_return, cp.expected_30d_return, cp.expected_90d_return,
              cp.expected_180d_return, cp.expected_365d_return,
              pr.status AS existing_status,
              pr.actual_7d_price, pr.actual_30d_price, pr.actual_90d_price,
              pr.actual_180d_price, pr.actual_365d_price
       FROM card_predictions cp
       LEFT JOIN prediction_results pr ON pr.prediction_id = cp.id
       WHERE julianday('now') - julianday(cp.prediction_date) >= 7
         AND (
           pr.id IS NULL
           OR pr.status = 'pending'
           OR (pr.actual_7d_price IS NULL)
           OR (pr.actual_30d_price IS NULL AND julianday('now') - julianday(cp.prediction_date) >= 30)
           OR (pr.actual_90d_price IS NULL AND julianday('now') - julianday(cp.prediction_date) >= 90)
           OR (pr.actual_180d_price IS NULL AND julianday('now') - julianday(cp.prediction_date) >= 180)
           OR (pr.actual_365d_price IS NULL AND julianday('now') - julianday(cp.prediction_date) >= 365)
         )
       ORDER BY CASE WHEN pr.actual_7d_price IS NULL THEN 0 ELSE 1 END,
                cp.prediction_date ASC
       LIMIT 20000`,
      [],
      (err, rows: any[]) => {
        if (err) return reject(err);
        resolve(rows || []);
      }
    );
  });

  let updated = 0;

  for (const pred of pendingPredictions) {
    try {
      const daysSince = daysSincePrediction(pred.prediction_date);
      if (daysSince < 7) continue;

      const uid = pred.unique_identifier || null;
      const actual7d = daysSince >= 7 ? await fetchActualPrice(pred.card_id, pred.prediction_date, 7, uid) : null;
      const actual30d = daysSince >= 30 ? await fetchActualPrice(pred.card_id, pred.prediction_date, 30, uid) : null;
      const actual90d = daysSince >= 90 ? await fetchActualPrice(pred.card_id, pred.prediction_date, 90, uid) : null;
      const actual180d = daysSince >= 180 ? await fetchActualPrice(pred.card_id, pred.prediction_date, 180, uid) : null;
      const actual365d = daysSince >= 365 ? await fetchActualPrice(pred.card_id, pred.prediction_date, 365, uid) : null;

      const currentPrice = pred.current_price || 0;

      const actual7dReturn = computeReturn(actual7d, currentPrice);
      const actual30dReturn = computeReturn(actual30d, currentPrice);
      const actual90dReturn = computeReturn(actual90d, currentPrice);
      const actual180dReturn = computeReturn(actual180d, currentPrice);
      const actual365dReturn = computeReturn(actual365d, currentPrice);

      const error7d = computeError(pred.expected_7d_return, actual7dReturn);
      const error30d = computeError(pred.expected_30d_return, actual30dReturn);
      const error90d = computeError(pred.expected_90d_return, actual90dReturn);
      const error180d = computeError(pred.expected_180d_return, actual180dReturn);
      const error365d = computeError(pred.expected_365d_return, actual365dReturn);

      const directionCorrect7d = computeDirection(pred.expected_7d_return, actual7dReturn);
      const directionCorrect30d = computeDirection(pred.expected_30d_return, actual30dReturn);
      const directionCorrect90d = computeDirection(pred.expected_90d_return, actual90dReturn);
      const directionCorrect180d = computeDirection(pred.expected_180d_return, actual180dReturn);
      const directionCorrect365d = computeDirection(pred.expected_365d_return, actual365dReturn);

      const has7d = actual7d !== null;
      const has30d = actual30d !== null;
      const has90d = actual90d !== null;
      const status = resolveStatus([
        { has: has7d, hit: windowIsHit(directionCorrect7d, error7d, actual7dReturn) },
        { has: has30d, hit: windowIsHit(directionCorrect30d, error30d, actual30dReturn) },
        { has: has90d, hit: windowIsHit(directionCorrect90d, error90d, actual90dReturn) },
      ]);

      await new Promise<void>((resolve, reject) => {
        db.run(
          `INSERT INTO prediction_results
           (prediction_id, actual_7d_price, actual_30d_price, actual_90d_price,
            actual_180d_price, actual_365d_price,
            actual_7d_return, actual_30d_return, actual_90d_return,
            actual_180d_return, actual_365d_return,
            error_7d, error_30d, error_90d, error_180d, error_365d,
            direction_correct_7d, direction_correct_30d, direction_correct_90d,
            direction_correct_180d, direction_correct_365d,
            status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(prediction_id) DO UPDATE SET
             actual_7d_price = COALESCE(excluded.actual_7d_price, prediction_results.actual_7d_price),
             actual_30d_price = COALESCE(excluded.actual_30d_price, prediction_results.actual_30d_price),
             actual_90d_price = COALESCE(excluded.actual_90d_price, prediction_results.actual_90d_price),
             actual_180d_price = COALESCE(excluded.actual_180d_price, prediction_results.actual_180d_price),
             actual_365d_price = COALESCE(excluded.actual_365d_price, prediction_results.actual_365d_price),
             actual_7d_return = COALESCE(excluded.actual_7d_return, prediction_results.actual_7d_return),
             actual_30d_return = COALESCE(excluded.actual_30d_return, prediction_results.actual_30d_return),
             actual_90d_return = COALESCE(excluded.actual_90d_return, prediction_results.actual_90d_return),
             actual_180d_return = COALESCE(excluded.actual_180d_return, prediction_results.actual_180d_return),
             actual_365d_return = COALESCE(excluded.actual_365d_return, prediction_results.actual_365d_return),
             error_7d = COALESCE(excluded.error_7d, prediction_results.error_7d),
             error_30d = COALESCE(excluded.error_30d, prediction_results.error_30d),
             error_90d = COALESCE(excluded.error_90d, prediction_results.error_90d),
             error_180d = COALESCE(excluded.error_180d, prediction_results.error_180d),
             error_365d = COALESCE(excluded.error_365d, prediction_results.error_365d),
             direction_correct_7d = COALESCE(excluded.direction_correct_7d, prediction_results.direction_correct_7d),
             direction_correct_30d = COALESCE(excluded.direction_correct_30d, prediction_results.direction_correct_30d),
             direction_correct_90d = COALESCE(excluded.direction_correct_90d, prediction_results.direction_correct_90d),
             direction_correct_180d = COALESCE(excluded.direction_correct_180d, prediction_results.direction_correct_180d),
             direction_correct_365d = COALESCE(excluded.direction_correct_365d, prediction_results.direction_correct_365d),
             status = excluded.status`,
          [
            pred.id,
            actual7d, actual30d, actual90d,
            actual180d, actual365d,
            actual7dReturn, actual30dReturn, actual90dReturn,
            actual180dReturn, actual365dReturn,
            error7d, error30d, error90d, error180d, error365d,
            directionCorrect7d ?? 0, directionCorrect30d ?? 0, directionCorrect90d ?? 0,
            directionCorrect180d ?? 0, directionCorrect365d ?? 0,
            status,
          ],
          function (err) {
            if (err) return reject(err);
            resolve();
          }
        );
      });

      updated++;
    } catch (err) {
      logger.warn(`Forward test update failed for prediction ${pred.id}:`, err);
    }
  }

  // Bulk-refresh status for rows that already have mature actuals but were left pending
  // (e.g. after scrubbing premature 30d/90d fills).
  try {
    const refreshed = await bulkRefreshStatuses();
    if (refreshed > 0) {
      logger.info(`Bulk-refreshed forward-test status on ${refreshed} rows`);
    }
  } catch (err) {
    logger.warn('Bulk forward-test status refresh failed:', err);
  }

  return { updated };
}

/**
 * Recomputes status for every row with resolved actuals using the
 * information-adding hit definition. Run after outcome updates so legacy rows
 * scored under the old lenient threshold are re-evaluated honestly.
 */
async function bulkRefreshStatuses(): Promise<number> {
  const db = getDb();
  return new Promise((resolve, reject) => {
    db.run(
      `UPDATE prediction_results SET status = CASE
         WHEN actual_90d_price IS NOT NULL THEN
           CASE
             WHEN
               IFNULL(error_7d, 1) < 0.5 * MAX(ABS(IFNULL(actual_7d_return, 0)), 0.03)
                 AND IFNULL(direction_correct_7d, 0) = 1
                 AND IFNULL(error_30d, 1) < 0.5 * MAX(ABS(IFNULL(actual_30d_return, 0)), 0.03)
                 AND IFNULL(direction_correct_30d, 0) = 1
                 AND error_90d < 0.5 * MAX(ABS(actual_90d_return), 0.03)
                 AND direction_correct_90d = 1
               THEN 'hit'
             WHEN
               (IFNULL(error_7d, 1) < 0.5 * MAX(ABS(IFNULL(actual_7d_return, 0)), 0.03)
                  AND IFNULL(direction_correct_7d, 0) = 1)
               OR (IFNULL(error_30d, 1) < 0.5 * MAX(ABS(IFNULL(actual_30d_return, 0)), 0.03)
                  AND IFNULL(direction_correct_30d, 0) = 1)
               OR (error_90d < 0.5 * MAX(ABS(actual_90d_return), 0.03)
                  AND direction_correct_90d = 1)
               THEN 'partially_correct'
             ELSE 'missed'
           END
         WHEN actual_30d_price IS NOT NULL THEN
           CASE
             WHEN
               IFNULL(error_7d, 1) < 0.5 * MAX(ABS(IFNULL(actual_7d_return, 0)), 0.03)
                 AND IFNULL(direction_correct_7d, 0) = 1
                 AND error_30d < 0.5 * MAX(ABS(actual_30d_return), 0.03)
                 AND direction_correct_30d = 1
               THEN 'hit'
             WHEN
               (IFNULL(error_7d, 1) < 0.5 * MAX(ABS(IFNULL(actual_7d_return, 0)), 0.03)
                  AND IFNULL(direction_correct_7d, 0) = 1)
               OR (error_30d < 0.5 * MAX(ABS(actual_30d_return), 0.03)
                  AND direction_correct_30d = 1)
               THEN 'partially_correct'
             ELSE 'missed'
           END
         WHEN actual_7d_price IS NOT NULL THEN
           CASE
             WHEN error_7d < 0.5 * MAX(ABS(actual_7d_return), 0.03)
                  AND direction_correct_7d = 1 THEN 'hit'
             ELSE 'missed'
           END
         ELSE 'pending'
       END
       WHERE actual_7d_price IS NOT NULL OR actual_30d_price IS NOT NULL OR actual_90d_price IS NOT NULL`,
      function (this: { changes: number }, err) {
        if (err) return reject(err);
        resolve(this.changes || 0);
      }
    );
  });
}

async function fetchActualPrice(
  cardId: string,
  predictionDate: string,
  daysAhead: number,
  uniqueIdentifier?: string | null
): Promise<number | null> {
  const db = getDb();
  const targetDate = new Date(predictionDate + 'T00:00:00Z');
  targetDate.setUTCDate(targetDate.getUTCDate() + daysAhead);
  const targetStr = targetDate.toISOString().split('T')[0];

  // Require a quote near the target — don't silently use a much older price as
  // a stand-in for a window that hasn't produced new market data.
  const slackDays = Math.min(Math.max(Math.floor(daysAhead * 0.25), 2), 7);

  const lookup = (sql: string, params: unknown[]): Promise<number | null> =>
    new Promise((resolve, reject) => {
      db.get(sql, params, (err, row: any) => {
        if (err) return reject(err);
        if (!row) return resolve(null);
        resolve(row.marketPrice ?? row.price);
      });
    });

  // Prefer the exact finish/variant the prediction was made on.
  if (uniqueIdentifier) {
    const byUid = await lookup(
      `SELECT ph.marketPrice, ph.price, ph.date
       FROM price_history ph
       WHERE ph.uniqueIdentifier = ?
         AND ph.date <= ?
         AND ph.date >= date(?, ?)
         AND ph.date >= ?
         AND (ph.marketPrice > 0 OR ph.price > 0)
       ORDER BY ph.date DESC LIMIT 1`,
      [uniqueIdentifier, targetStr, targetStr, `-${slackDays} days`, predictionDate]
    );
    if (byUid != null) return byUid;
  }

  return lookup(
    `SELECT ph.marketPrice, ph.price, ph.date
     FROM price_history ph
     JOIN card_mappings cm ON cm.uniqueIdentifier = ph.uniqueIdentifier
     WHERE cm.cardId = ?
       AND ph.date <= ?
       AND ph.date >= date(?, ?)
       AND ph.date >= ?
       AND (ph.marketPrice > 0 OR ph.price > 0)
     ORDER BY ph.date DESC LIMIT 1`,
    [cardId, targetStr, targetStr, `-${slackDays} days`, predictionDate]
  );
}

function trackingScopeSql(alias = 'cp'): string {
  return `${alias}.prediction_date >= date('now', '-${TRACKING_LOOKBACK_DAYS} days')`;
}

export async function getForwardTestStatus(): Promise<ForwardTestStatus> {
  const db = getDb();

  const latestRun: { id: number; prediction_date: string } | null = await new Promise((resolve, reject) => {
    db.get(
      `SELECT pr.id, (
         SELECT prediction_date FROM card_predictions WHERE run_id = pr.id LIMIT 1
       ) AS prediction_date
       FROM prediction_runs pr
       ORDER BY pr.id DESC LIMIT 1`,
      [],
      (err, row: any) => {
        if (err) return reject(err);
        resolve(row ? { id: row.id, prediction_date: row.prediction_date } : null);
      }
    );
  });

  const totalPredictions: number = await new Promise((resolve, reject) => {
    db.get(
      `SELECT COUNT(*) as count FROM card_predictions cp WHERE ${trackingScopeSql('cp')}`,
      [],
      (err, row: any) => {
        if (err) return reject(err);
        resolve(row?.count || 0);
      }
    );
  });

  const matureEnoughFor7d: number = await new Promise((resolve, reject) => {
    db.get(
      `SELECT COUNT(*) as count FROM card_predictions cp
       WHERE ${trackingScopeSql('cp')}
         AND julianday('now') - julianday(cp.prediction_date) >= 7`,
      [],
      (err, row: any) => {
        if (err) return reject(err);
        resolve(row?.count || 0);
      }
    );
  });

  const statusCounts: any = await new Promise((resolve, reject) => {
    db.get(
      `SELECT
         SUM(CASE WHEN pr.status = 'hit' THEN 1 ELSE 0 END) AS hit,
         SUM(CASE WHEN pr.status = 'missed' THEN 1 ELSE 0 END) AS missed,
         SUM(CASE WHEN pr.status = 'partially_correct' THEN 1 ELSE 0 END) AS partial,
         SUM(CASE WHEN pr.id IS NULL OR pr.status = 'pending' THEN 1 ELSE 0 END) AS pending
       FROM card_predictions cp
       LEFT JOIN prediction_results pr ON pr.prediction_id = cp.id
       WHERE ${trackingScopeSql('cp')}`,
      [],
      (err, row: any) => {
        if (err) return reject(err);
        resolve(row || { hit: 0, missed: 0, partial: 0, pending: 0 });
      }
    );
  });

  const hit = statusCounts.hit || 0;
  const missed = statusCounts.missed || 0;
  const partiallyCorrect = statusCounts.partial || 0;
  const pending = statusCounts.pending || 0;
  const totalResolved = hit + missed + partiallyCorrect;
  const overallAccuracy = totalResolved > 0 ? (hit + partiallyCorrect * 0.5) / totalResolved : null;

  const getWindowStats = async (days: number): Promise<WindowAccuracy> => {
    const cols = WINDOW_COLS[days];
    if (!cols) {
      return { pending: totalPredictions, hit: 0, missed: 0, accuracy: null, rankIC: null, meanBias: null, hitRate: null };
    }

    const stats: any = await new Promise((resolve, reject) => {
      db.get(
        `SELECT
           COUNT(*) AS eligible,
           SUM(CASE WHEN pr.${cols.price} IS NOT NULL THEN 1 ELSE 0 END) AS scored,
           SUM(CASE WHEN pr.${cols.dir} = 1 THEN 1 ELSE 0 END) AS correct
         FROM card_predictions cp
         LEFT JOIN prediction_results pr ON pr.prediction_id = cp.id
         WHERE ${trackingScopeSql('cp')}
           AND julianday('now') - julianday(cp.prediction_date) >= ?`,
        [days],
        (err, row: any) => {
          if (err) return reject(err);
          resolve(row || { eligible: 0, scored: 0, correct: 0 });
        }
      );
    });

    const eligible = stats.eligible || 0;
    const scored = stats.scored || 0;
    const correct = stats.correct || 0;
    const pendingCount = Math.max(eligible - scored, 0);

    // Also count immature predictions in this lookback as pending for the window
    const immature: number = await new Promise((resolve, reject) => {
      db.get(
        `SELECT COUNT(*) as count FROM card_predictions cp
         WHERE ${trackingScopeSql('cp')}
           AND julianday('now') - julianday(cp.prediction_date) < ?`,
        [days],
        (err, row: any) => {
          if (err) return reject(err);
          resolve(row?.count || 0);
        }
      );
    });

    // Skill metrics from a deterministic stride sample of resolved outcomes.
    const expectedCol = `expected_${days}d_return`;
    const samples: Array<{ predicted: number; actual: number | null }> = await new Promise((resolve, reject) => {
      db.all(
        `SELECT cp.${expectedCol} AS predicted, pr.${days === 7 ? 'actual_7d_return' : days === 30 ? 'actual_30d_return' : days === 90 ? 'actual_90d_return' : days === 180 ? 'actual_180d_return' : 'actual_365d_return'} AS actual
         FROM prediction_results pr
         JOIN card_predictions cp ON cp.id = pr.prediction_id
         WHERE ${trackingScopeSql('cp')}
           AND pr.${days === 7 ? 'actual_7d_return' : days === 30 ? 'actual_30d_return' : days === 90 ? 'actual_90d_return' : days === 180 ? 'actual_180d_return' : 'actual_365d_return'} IS NOT NULL
           AND cp.${expectedCol} IS NOT NULL
           AND pr.prediction_id % 20 = 0
         LIMIT 20000`,
        [],
        (err, rows: any[]) => {
          if (err) return reject(err);
          resolve((rows || []).map(r => ({ predicted: Number(r.predicted), actual: r.actual != null ? Number(r.actual) : null })));
        }
      );
    });

    const metrics = computeValidationMetrics(samples);

    return {
      pending: pendingCount + immature,
      hit: correct,
      missed: Math.max(scored - correct, 0),
      accuracy: scored > 0 ? correct / scored : null,
      rankIC: metrics.rankIC,
      meanBias: metrics.meanBias,
      hitRate: metrics.hitRate,
    };
  };

  const [_7d, _30d, _90d, _180d, _365d] = await Promise.all(
    WINDOW_DAYS.map((d) => getWindowStats(d))
  ) as [
    Awaited<ReturnType<typeof getWindowStats>>,
    Awaited<ReturnType<typeof getWindowStats>>,
    Awaited<ReturnType<typeof getWindowStats>>,
    Awaited<ReturnType<typeof getWindowStats>>,
    Awaited<ReturnType<typeof getWindowStats>>,
  ];

  const getCategoryStats = async (): Promise<CategoryAccuracy[]> => {
    const categories = ['strong_buy', 'watch_dip', 'recovery', 'momentum', 'stagnant', 'avoid', 'downtrend'];
    const results: CategoryAccuracy[] = [];

    for (const cat of categories) {
      const stats: any = await new Promise((resolve, reject) => {
        db.get(
          `SELECT
            COUNT(*) as total,
            COUNT(CASE WHEN pr.status = 'hit' THEN 1 END) as hit,
            COUNT(CASE WHEN pr.status = 'missed' THEN 1 END) as missed,
            COUNT(CASE WHEN pr.status = 'partially_correct' THEN 1 END) as partial,
            AVG(CASE WHEN pr.error_90d IS NOT NULL THEN pr.error_90d END) as avg_error
          FROM card_predictions cp
          LEFT JOIN prediction_results pr ON pr.prediction_id = cp.id
          WHERE ${trackingScopeSql('cp')}
          AND cp.category = ?`,
          [cat],
          (err, row: any) => {
            if (err) return reject(err);
            resolve(row || { total: 0, hit: 0, missed: 0, partial: 0, avg_error: null });
          }
        );
      });

      const resolved = (stats.hit || 0) + (stats.missed || 0) + (stats.partial || 0);
      results.push({
        category: cat,
        total: stats.total || 0,
        hit: stats.hit || 0,
        missed: stats.missed || 0,
        partiallyCorrect: stats.partial || 0,
        accuracy: resolved > 0 ? (stats.hit + stats.partial * 0.5) / resolved : null,
        avgError: stats.avg_error,
      });
    }

    return results;
  };

  const getPriceRangeStats = async () => {
    const getStatsForRange = (minPrice: number, maxPrice: number | null) => {
      return new Promise<{ total: number; hit: number; accuracy: number | null }>((resolve, reject) => {
        const priceClause = maxPrice !== null
          ? 'AND cp.current_price >= ? AND cp.current_price < ?'
          : 'AND cp.current_price >= ?';
        const params = maxPrice !== null ? [minPrice, maxPrice] : [minPrice];

        db.get(
          `SELECT
            COUNT(*) as total,
            COUNT(CASE WHEN pr.status = 'hit' THEN 1 END) as hit,
            COUNT(CASE WHEN pr.status = 'missed' THEN 1 END) as missed,
            COUNT(CASE WHEN pr.status = 'partially_correct' THEN 1 END) as partial
          FROM card_predictions cp
          LEFT JOIN prediction_results pr ON pr.prediction_id = cp.id
          WHERE ${trackingScopeSql('cp')}
          ${priceClause}`,
          params,
          (err, row: any) => {
            if (err) return reject(err);
            const r = row || { total: 0, hit: 0, missed: 0, partial: 0 };
            const resolved = r.hit + r.missed + r.partial;
            const accuracy = resolved > 0 ? (r.hit + r.partial * 0.5) / resolved : null;
            resolve({ total: r.total, hit: r.hit, accuracy });
          }
        );
      });
    };

    const [under5, fiveToFifty, overFifty] = await Promise.all([
      getStatsForRange(0, 5),
      getStatsForRange(5, 50),
      getStatsForRange(50, null),
    ]);

    return { under5, fiveToFifty, overFifty };
  };

  const [byCategory, byPriceRange] = await Promise.all([getCategoryStats(), getPriceRangeStats()]);

  return {
    totalPredictions,
    pending,
    hit,
    missed,
    partiallyCorrect,
    overallAccuracy,
    latestRunId: latestRun?.id ?? null,
    latestRunDate: latestRun?.prediction_date ?? null,
    matureEnoughFor7d,
    byWindow: { _7d, _30d, _90d, _180d, _365d },
    byCategory,
    byPriceRange,
  };
}
