import { getDb } from '../db/database';
import { logger } from '../utils/logger';
import { computeValidationMetrics } from './validationMetrics';
import {
  CategoryAccuracy,
  ForwardTestStatus,
  WindowAccuracy,
  resolveStatus,
  windowIsHit,
} from './forwardTestTracker';
import { fetchPsa10PriceNear } from './slabPredictionEngine';

const WINDOW_DAYS = [7, 30, 90, 180, 365] as const;
const TRACKING_LOOKBACK_DAYS = 180;
/** Slab quotes are sparser than raw — allow a wider match window around the target date. */
const SLACK_DAYS = 14;

const WINDOW_COLS: Record<
  number,
  { price: string; dir: string; expected: string; actual: string }
> = {
  7: {
    price: 'actual_7d_price',
    dir: 'direction_correct_7d',
    expected: 'expected_7d_return',
    actual: 'actual_7d_return',
  },
  30: {
    price: 'actual_30d_price',
    dir: 'direction_correct_30d',
    expected: 'expected_30d_return',
    actual: 'actual_30d_return',
  },
  90: {
    price: 'actual_90d_price',
    dir: 'direction_correct_90d',
    expected: 'expected_90d_return',
    actual: 'actual_90d_return',
  },
  180: {
    price: 'actual_180d_price',
    dir: 'direction_correct_180d',
    expected: 'expected_180d_return',
    actual: 'actual_180d_return',
  },
  365: {
    price: 'actual_365d_price',
    dir: 'direction_correct_365d',
    expected: 'expected_365d_return',
    actual: 'actual_365d_return',
  },
};

function all<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  return new Promise((resolve, reject) => {
    getDb().all(sql, params, (err, rows) => (err ? reject(err) : resolve((rows || []) as T[])));
  });
}

function get<T>(sql: string, params: unknown[] = []): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    getDb().get(sql, params, (err, row) => (err ? reject(err) : resolve(row as T | undefined)));
  });
}

function run(sql: string, params: unknown[] = []): Promise<void> {
  return new Promise((resolve, reject) => {
    getDb().run(sql, params, (err) => (err ? reject(err) : resolve()));
  });
}

function daysSincePrediction(predictionDate: string, now = new Date()): number {
  const predDate = new Date(predictionDate + 'T00:00:00Z');
  return Math.floor((now.getTime() - predDate.getTime()) / (1000 * 60 * 60 * 24));
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(isoDate + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split('T')[0];
}

function computeReturn(actual: number | null, currentPrice: number): number | null {
  return actual !== null && currentPrice > 0 ? (actual - currentPrice) / currentPrice : null;
}

function computeError(
  expected: number | null | undefined,
  actualReturn: number | null
): number | null {
  return actualReturn !== null && expected != null ? Math.abs(expected - actualReturn) : null;
}

function computeDirection(
  expected: number | null | undefined,
  actualReturn: number | null
): number | null {
  if (expected == null || actualReturn == null) return null;
  return expected > 0 === actualReturn > 0 ? 1 : 0;
}

function trackingScopeSql(alias: string): string {
  return `julianday('now') - julianday(${alias}.prediction_date) <= ${TRACKING_LOOKBACK_DAYS}`;
}

async function fetchActualSlabPrice(
  cardId: string,
  predictionDate: string,
  daysAhead: number
): Promise<number | null> {
  const target = addDays(predictionDate, daysAhead);
  const earliest = addDays(target, -SLACK_DAYS);
  const latest = addDays(target, SLACK_DAYS);
  const floor = predictionDate;
  const from = earliest > floor ? earliest : floor;
  return fetchPsa10PriceNear(cardId, from, latest);
}

export async function updateSlabActualResults(): Promise<{ updated: number }> {
  const pending = await all<any>(
    `SELECT sp.id, sp.card_id, sp.prediction_date, sp.current_price,
            sp.expected_7d_return, sp.expected_30d_return, sp.expected_90d_return,
            sp.expected_180d_return, sp.expected_365d_return,
            pr.status AS existing_status,
            pr.actual_7d_price, pr.actual_30d_price, pr.actual_90d_price,
            pr.actual_180d_price, pr.actual_365d_price
     FROM slab_predictions sp
     LEFT JOIN slab_prediction_results pr ON pr.prediction_id = sp.id
     WHERE julianday('now') - julianday(sp.prediction_date) >= 7
       AND (
         pr.id IS NULL
         OR pr.status = 'pending'
         OR (pr.actual_7d_price IS NULL)
         OR (pr.actual_30d_price IS NULL AND julianday('now') - julianday(sp.prediction_date) >= 30)
         OR (pr.actual_90d_price IS NULL AND julianday('now') - julianday(sp.prediction_date) >= 90)
         OR (pr.actual_180d_price IS NULL AND julianday('now') - julianday(sp.prediction_date) >= 180)
         OR (pr.actual_365d_price IS NULL AND julianday('now') - julianday(sp.prediction_date) >= 365)
       )
     ORDER BY CASE WHEN pr.actual_7d_price IS NULL THEN 0 ELSE 1 END,
              sp.prediction_date ASC
     LIMIT 20000`
  );

  let updated = 0;
  for (const pred of pending) {
    try {
      const daysSince = daysSincePrediction(pred.prediction_date);
      if (daysSince < 7) continue;

      const actual7d =
        daysSince >= 7 ? await fetchActualSlabPrice(pred.card_id, pred.prediction_date, 7) : null;
      const actual30d =
        daysSince >= 30 ? await fetchActualSlabPrice(pred.card_id, pred.prediction_date, 30) : null;
      const actual90d =
        daysSince >= 90 ? await fetchActualSlabPrice(pred.card_id, pred.prediction_date, 90) : null;
      const actual180d =
        daysSince >= 180
          ? await fetchActualSlabPrice(pred.card_id, pred.prediction_date, 180)
          : null;
      const actual365d =
        daysSince >= 365
          ? await fetchActualSlabPrice(pred.card_id, pred.prediction_date, 365)
          : null;

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

      const status = resolveStatus([
        { has: actual7d !== null, hit: windowIsHit(directionCorrect7d, error7d, actual7dReturn) },
        {
          has: actual30d !== null,
          hit: windowIsHit(directionCorrect30d, error30d, actual30dReturn),
        },
        {
          has: actual90d !== null,
          hit: windowIsHit(directionCorrect90d, error90d, actual90dReturn),
        },
      ]);

      await run(
        `INSERT INTO slab_prediction_results
         (prediction_id, actual_7d_price, actual_30d_price, actual_90d_price,
          actual_180d_price, actual_365d_price,
          actual_7d_return, actual_30d_return, actual_90d_return,
          actual_180d_return, actual_365d_return,
          error_7d, error_30d, error_90d, error_180d, error_365d,
          direction_correct_7d, direction_correct_30d, direction_correct_90d,
          direction_correct_180d, direction_correct_365d, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(prediction_id) DO UPDATE SET
           actual_7d_price = COALESCE(excluded.actual_7d_price, slab_prediction_results.actual_7d_price),
           actual_30d_price = COALESCE(excluded.actual_30d_price, slab_prediction_results.actual_30d_price),
           actual_90d_price = COALESCE(excluded.actual_90d_price, slab_prediction_results.actual_90d_price),
           actual_180d_price = COALESCE(excluded.actual_180d_price, slab_prediction_results.actual_180d_price),
           actual_365d_price = COALESCE(excluded.actual_365d_price, slab_prediction_results.actual_365d_price),
           actual_7d_return = COALESCE(excluded.actual_7d_return, slab_prediction_results.actual_7d_return),
           actual_30d_return = COALESCE(excluded.actual_30d_return, slab_prediction_results.actual_30d_return),
           actual_90d_return = COALESCE(excluded.actual_90d_return, slab_prediction_results.actual_90d_return),
           actual_180d_return = COALESCE(excluded.actual_180d_return, slab_prediction_results.actual_180d_return),
           actual_365d_return = COALESCE(excluded.actual_365d_return, slab_prediction_results.actual_365d_return),
           error_7d = COALESCE(excluded.error_7d, slab_prediction_results.error_7d),
           error_30d = COALESCE(excluded.error_30d, slab_prediction_results.error_30d),
           error_90d = COALESCE(excluded.error_90d, slab_prediction_results.error_90d),
           error_180d = COALESCE(excluded.error_180d, slab_prediction_results.error_180d),
           error_365d = COALESCE(excluded.error_365d, slab_prediction_results.error_365d),
           direction_correct_7d = COALESCE(excluded.direction_correct_7d, slab_prediction_results.direction_correct_7d),
           direction_correct_30d = COALESCE(excluded.direction_correct_30d, slab_prediction_results.direction_correct_30d),
           direction_correct_90d = COALESCE(excluded.direction_correct_90d, slab_prediction_results.direction_correct_90d),
           direction_correct_180d = COALESCE(excluded.direction_correct_180d, slab_prediction_results.direction_correct_180d),
           direction_correct_365d = COALESCE(excluded.direction_correct_365d, slab_prediction_results.direction_correct_365d),
           status = excluded.status`,
        [
          pred.id,
          actual7d,
          actual30d,
          actual90d,
          actual180d,
          actual365d,
          actual7dReturn,
          actual30dReturn,
          actual90dReturn,
          actual180dReturn,
          actual365dReturn,
          error7d,
          error30d,
          error90d,
          error180d,
          error365d,
          directionCorrect7d ?? 0,
          directionCorrect30d ?? 0,
          directionCorrect90d ?? 0,
          directionCorrect180d ?? 0,
          directionCorrect365d ?? 0,
          status,
        ]
      );
      updated++;
    } catch (err) {
      logger.warn(`Slab forward test update failed for prediction ${pred.id}:`, err);
    }
  }

  return { updated };
}

export async function getSlabForwardTestStatus(): Promise<ForwardTestStatus> {
  const latestRun = await get<{ id: number; created_at: string }>(
    `SELECT id, created_at FROM slab_prediction_runs ORDER BY id DESC LIMIT 1`
  );

  const totalRow = await get<{ count: number }>(
    `SELECT COUNT(*) AS count FROM slab_predictions sp WHERE ${trackingScopeSql('sp')}`
  );
  const totalPredictions = totalRow?.count || 0;

  const statusCounts = await get<any>(
    `SELECT
       SUM(CASE WHEN pr.status = 'hit' THEN 1 ELSE 0 END) AS hit,
       SUM(CASE WHEN pr.status = 'missed' THEN 1 ELSE 0 END) AS missed,
       SUM(CASE WHEN pr.status = 'partially_correct' THEN 1 ELSE 0 END) AS partial,
       SUM(CASE WHEN pr.id IS NULL OR pr.status = 'pending' THEN 1 ELSE 0 END) AS pending
     FROM slab_predictions sp
     LEFT JOIN slab_prediction_results pr ON pr.prediction_id = sp.id
     WHERE ${trackingScopeSql('sp')}`
  );

  const hit = statusCounts?.hit || 0;
  const missed = statusCounts?.missed || 0;
  const partiallyCorrect = statusCounts?.partial || 0;
  const pending = statusCounts?.pending || 0;
  const totalResolved = hit + missed + partiallyCorrect;
  const overallAccuracy = totalResolved > 0 ? (hit + partiallyCorrect * 0.5) / totalResolved : null;

  const getWindowStats = async (days: number): Promise<WindowAccuracy> => {
    const cols = WINDOW_COLS[days];
    const stats = await get<any>(
      `SELECT
         COUNT(*) AS eligible,
         SUM(CASE WHEN pr.${cols.price} IS NOT NULL THEN 1 ELSE 0 END) AS scored,
         SUM(CASE WHEN pr.${cols.dir} = 1 THEN 1 ELSE 0 END) AS correct
       FROM slab_predictions sp
       LEFT JOIN slab_prediction_results pr ON pr.prediction_id = sp.id
       WHERE ${trackingScopeSql('sp')}
         AND julianday('now') - julianday(sp.prediction_date) >= ?`,
      [days]
    );
    const eligible = stats?.eligible || 0;
    const scored = stats?.scored || 0;
    const correct = stats?.correct || 0;

    const immatureRow = await get<{ count: number }>(
      `SELECT COUNT(*) AS count FROM slab_predictions sp
       WHERE ${trackingScopeSql('sp')}
         AND julianday('now') - julianday(sp.prediction_date) < ?`,
      [days]
    );

    const samples = await all<{ predicted: number; actual: number | null }>(
      `SELECT sp.${cols.expected} AS predicted, pr.${cols.actual} AS actual
       FROM slab_prediction_results pr
       JOIN slab_predictions sp ON sp.id = pr.prediction_id
       WHERE ${trackingScopeSql('sp')}
         AND pr.${cols.actual} IS NOT NULL
         AND sp.${cols.expected} IS NOT NULL
       LIMIT 20000`
    );
    const metrics = computeValidationMetrics(
      samples.map((r) => ({
        predicted: Number(r.predicted),
        actual: r.actual != null ? Number(r.actual) : null,
      }))
    );

    return {
      pending: Math.max(eligible - scored, 0) + (immatureRow?.count || 0),
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
  );

  const categories = [
    'strong_buy',
    'watch_dip',
    'recovery',
    'momentum',
    'stagnant',
    'avoid',
    'downtrend',
  ];
  const byCategory: CategoryAccuracy[] = [];
  for (const cat of categories) {
    const stats = await get<any>(
      `SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN pr.status = 'hit' THEN 1 END) as hit,
        COUNT(CASE WHEN pr.status = 'missed' THEN 1 END) as missed,
        COUNT(CASE WHEN pr.status = 'partially_correct' THEN 1 END) as partial,
        AVG(CASE WHEN pr.error_90d IS NOT NULL THEN pr.error_90d END) as avgError
       FROM slab_predictions sp
       LEFT JOIN slab_prediction_results pr ON pr.prediction_id = sp.id
       WHERE ${trackingScopeSql('sp')} AND sp.category = ?`,
      [cat]
    );
    const total = stats?.total || 0;
    const catHit = stats?.hit || 0;
    const catMissed = stats?.missed || 0;
    const catPartial = stats?.partial || 0;
    const resolved = catHit + catMissed + catPartial;
    byCategory.push({
      category: cat,
      total,
      hit: catHit,
      missed: catMissed,
      partiallyCorrect: catPartial,
      accuracy: resolved > 0 ? (catHit + catPartial * 0.5) / resolved : null,
      avgError: stats?.avgError ?? null,
    });
  }

  const priceBand = async (min: number, max: number | null) => {
    const stats = await get<any>(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN pr.status = 'hit' THEN 1 ELSE 0 END) AS hit
       FROM slab_predictions sp
       LEFT JOIN slab_prediction_results pr ON pr.prediction_id = sp.id
       WHERE ${trackingScopeSql('sp')}
         AND sp.current_price >= ?
         ${max != null ? 'AND sp.current_price < ?' : ''}`,
      max != null ? [min, max] : [min]
    );
    const total = stats?.total || 0;
    const bandHit = stats?.hit || 0;
    return { total, hit: bandHit, accuracy: total > 0 ? bandHit / total : null };
  };

  const matureEnough = await get<{ count: number }>(
    `SELECT COUNT(*) AS count FROM slab_predictions sp
     WHERE ${trackingScopeSql('sp')}
       AND julianday('now') - julianday(sp.prediction_date) >= 7`
  );

  return {
    totalPredictions,
    pending,
    hit,
    missed,
    partiallyCorrect,
    overallAccuracy,
    latestRunId: latestRun?.id ?? null,
    latestRunDate: latestRun?.created_at ?? null,
    matureEnoughFor7d: matureEnough?.count || 0,
    byWindow: { _7d, _30d, _90d, _180d, _365d },
    byCategory,
    byPriceRange: {
      under5: await priceBand(0, 5),
      fiveToFifty: await priceBand(5, 50),
      overFifty: await priceBand(50, null),
    },
  };
}
