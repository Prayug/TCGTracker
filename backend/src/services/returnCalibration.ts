import { getDb } from '../db/database';
import { logger } from '../utils/logger';

/**
 * Closed-loop return calibration.
 *
 * The prediction engine's raw output is systematically biased (it overpredicts
 * ~2-5x). This service learns the mapping from "raw predicted return" to
 * "historically realized return" using:
 *   - forward-test outcomes (prediction_results) for 7d/30d,
 *   - historical backtests (calibration_samples, source='backtest') for longer
 *     horizons.
 * Each horizon gets a bias estimate and a binned conditional-return curve with
 * shrinkage toward the market median, plus residual spread for honest
 * confidence bands.
 */

export type CalibrationHorizon = 7 | 30 | 90 | 180 | 365;

export const CALIBRATION_HORIZONS: CalibrationHorizon[] = [7, 30, 90, 180, 365];

export interface CalibrationBucket {
  signalMin: number;
  signalMax: number;
  meanActualReturn: number;
  stdActualReturn: number;
  sampleCount: number;
}

export interface CalibrationModel {
  horizon: number;
  /** median(actual - predicted); positive = the raw model overpredicts. */
  bias: number;
  marketMedianReturn: number;
  marketStdReturn: number;
  buckets: CalibrationBucket[];
  sampleCount: number;
  builtAt: string;
  /**
   * Signal level at which the direction flips honest: above it the realized
   * UP-RATE (share of positive returns) is >= 0.50. Below it the model must
   * never predict an "up" move — this is what kills the bullish bias (the
   * model currently says "up" for 81% of cards when only ~42-45% rise).
   * -Infinity = curve positive everywhere; +Infinity = never call up.
   * Null when unknown (old persisted models).
   */
  positiveThreshold?: number | null;
}

export interface CalibrationBucket {
  signalMin: number;
  signalMax: number;
  /** Robust expected return for the bucket (median/trimmed, tail-resilient). */
  meanActualReturn: number;
  stdActualReturn: number;
  sampleCount: number;
  /** Share of bucket outcomes that were positive — drives the direction gate. */
  upRate?: number;
}

export interface CalibratedReturn {
  expectedReturn: number;
  residualStd: number;
  sampleCount: number;
}

/** Samples per bucket below which the curve is heavily shrunk to the median. */
const SHRINK_TARGET_N = 25;

const inMemoryCache = new Map<number, CalibrationModel>();
let cacheLoadedAt = 0;
/** Re-read the persisted model at most every N ms. */
const CACHE_TTL_MS = 15 * 60 * 1000;

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  return Math.sqrt(values.reduce((a, v) => a + (v - m) ** 2, 0) / values.length);
}

/**
 * Robust trimmed mean: drops the top and bottom `trim` fraction of values so a
 * fat right tail (a few cards that 10x) cannot inflate the "expected" return.
 */
function trimmedMean(values: number[], trim = 0.10): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const k = Math.floor(sorted.length * trim);
  if (sorted.length - 2 * k <= 0) return median(sorted);
  const slice = sorted.slice(k, sorted.length - k);
  return mean(slice);
}

/**
 * Pool-Adjacent-Violators isotonic regression: returns a non-decreasing copy of
 * `values` weighted by `weights`. Enforces that higher raw signal never maps to
 * a lower expected return, which turns bucket noise into an honest curve.
 */
function isotonicNonDecreasing(values: number[], weights: number[]): number[] {
  const n = values.length;
  if (n === 0) return [];
  const starts: number[] = [0];
  const levels: number[] = [values[0]];
  const sizes: number[] = [Math.max(weights[0], 1e-9)];
  for (let i = 1; i < n; i++) {
    starts.push(i);
    levels.push(values[i]);
    sizes.push(Math.max(weights[i], 1e-9));
    while (levels.length >= 2 && levels[levels.length - 2] > levels[levels.length - 1]) {
      const bVal = levels.pop()!;
      const bSize = sizes.pop()!;
      const aVal = levels[levels.length - 1];
      const aSize = sizes[sizes.length - 1];
      levels[levels.length - 1] = (aVal * aSize + bVal * bSize) / (aSize + bSize);
      sizes[sizes.length - 1] = aSize + bSize;
      starts.pop();
    }
  }
  const result = new Array<number>(n).fill(0);
  for (let b = 0; b < levels.length; b++) {
    const from = starts[b];
    const to = b + 1 < starts.length ? starts[b + 1] : n;
    for (let i = from; i < to; i++) result[i] = levels[b];
  }
  return result;
}

/**
 * Incrementally copies matured forward-test outcomes into calibration_samples.
 * Idempotent thanks to the unique (horizon, card_id, source, prediction_date)
 * index. Only resolved outcomes (already ≥ horizon days old) are eligible, so
 * there is no lookahead.
 *
 * Only predictions that recorded a true raw `signal_score` are eligible. Older
 * runs stored the post-calibration expected return as a stand-in, which mixes
 * scales in the bucket curve — those rows are excluded and must be re-harvested.
 */
export async function collectForwardTestSamples(excludeRunId?: number): Promise<number> {
  const db = getDb();
  const excludeClause = excludeRunId ? ` AND cp.run_id <> ${Number(excludeRunId)}` : '';

  const insert = (
    horizon: number,
    expectedCol: string,
    actualCol: string
  ): Promise<number> =>
    new Promise((resolve, reject) => {
      db.run(
        `INSERT OR IGNORE INTO calibration_samples
           (horizon, card_id, run_id, signal_score, predicted_return, actual_return, source, prediction_date)
         SELECT
           ${horizon},
           cp.card_id,
           cp.run_id,
           cp.signal_score,
           cp.${expectedCol},
           pr.${actualCol},
           'forward_test',
           cp.prediction_date
         FROM card_predictions cp
         JOIN prediction_results pr ON pr.prediction_id = cp.id
         WHERE pr.${actualCol} IS NOT NULL
           AND cp.signal_score IS NOT NULL
           AND cp.${expectedCol} IS NOT NULL${excludeClause}`,
        [],
        function (this: { changes: number }, err) {
          if (err) reject(err);
          else resolve(this.changes ?? 0);
        }
      );
    });

  try {
    let collected = 0;
    collected += await insert(7, 'expected_7d_return', 'actual_7d_return');
    collected += await insert(30, 'expected_30d_return', 'actual_30d_return');
    // Only harvest 90d+ once outcomes exist; INSERT OR IGNORE is idempotent.
    collected += await insert(90, 'expected_90d_return', 'actual_90d_return');
    collected += await insert(180, 'expected_180d_return', 'actual_180d_return');
    collected += await insert(365, 'expected_365d_return', 'actual_365d_return');
    return collected;
  } catch (err) {
    logger.warn('Failed to collect forward-test calibration samples:', err);
    return 0;
  }
}

/**
 * Harvests long-horizon samples by running the backtest engine at historical
 * cutoff dates. Cutoffs are chosen so a `windowDays`-ahead outcome has already
 * matured against real price history.
 */
export async function harvestBacktestSamples(
  cutoffs: string[],
  windowDays: number,
  sampleSize: number
): Promise<number> {
  const { runBacktest } = await import('./backtestEngine');
  let stored = 0;
  for (const cutoff of cutoffs) {
    try {
      const result = await runBacktest(cutoff, windowDays, undefined, undefined, sampleSize);
      stored += await storeBacktestSamples(result);
    } catch (err) {
      logger.warn(`Calibration harvest failed for cutoff ${cutoff} (${windowDays}d):`, err);
    }
  }
  return stored;
}

/** Persists backtest (predicted, actual) pairs as calibration samples. */
export async function storeBacktestSamples(
  result: { backtestDate: string; windowDays: number; cardResults: Array<{
    cardId: string;
    predictedReturn: number;
    actualReturn: number | null;
    /** Raw composite signal (~[-1, 1]) — the calibration bucket key. */
    signalScore?: number;
  }> }
): Promise<number> {
  const db = getDb();
  let stored = 0;
  for (const card of result.cardResults) {
    if (card.actualReturn === null || card.predictedReturn === null) continue;
    await new Promise<void>((resolve) => {
      db.run(
        `INSERT OR IGNORE INTO calibration_samples
           (horizon, card_id, run_id, signal_score, predicted_return, actual_return, source, prediction_date)
         VALUES (?, ?, NULL, ?, ?, ?, 'backtest', ?)`,
        [
          result.windowDays,
          card.cardId,
          // Key buckets on the raw pre-calibration signal so backtest and
          // forward-test samples share one scale.
          card.signalScore ?? card.predictedReturn,
          card.predictedReturn,
          card.actualReturn,
          result.backtestDate,
        ],
        () => resolve()
      );
    });
    stored++;
  }
  return stored;
}

/**
 * Builds the calibration model for one horizon from stored samples.
 * Buckets samples by raw predicted return; each bucket's realized mean becomes
 * the calibrated estimate, shrunk toward the market median for small buckets.
 * When `asOfDate` is given, only outcomes that had already resolved by that
 * date are used (leakage-free backtest calibration).
 */
export async function buildCalibrationModel(
  horizon: CalibrationHorizon,
  asOfDate?: string
): Promise<CalibrationModel | null> {
  const db = getDb();
  let sql = `SELECT signal_score, predicted_return, actual_return
       FROM calibration_samples
       WHERE horizon = ?
         AND actual_return IS NOT NULL
         AND predicted_return IS NOT NULL`;
  const params: any[] = [horizon];
  if (asOfDate) {
    sql += ` AND prediction_date <= date(?, ?)`;
    params.push(asOfDate, `-${horizon} days`);
  }

  const rows: any[] = await new Promise((resolve, reject) => {
    db.all(sql, params, (err, r) => (err ? reject(err) : resolve(r || [])));
  });

  if (rows.length < 30) {
    logger.info(`Calibration: not enough samples for ${horizon}d (${rows.length}), skipping`);
    return null;
  }

  const actuals = rows.map(r => Number(r.actual_return));
  const marketMedianReturn = median(actuals);
  const marketStdReturn = stdDev(actuals);
  const biases = rows.map(r => Number(r.predicted_return) - Number(r.actual_return));
  const bias = median(biases);

  // Quantile buckets over the raw signal score (pre-calibration predicted return).
  const signals = rows.map(r => Number(r.signal_score ?? r.predicted_return)).sort((a, b) => a - b);
  const BUCKET_COUNT = 8;
  const boundaries: number[] = [];
  for (let i = 1; i < BUCKET_COUNT; i++) {
    boundaries.push(signals[Math.floor((i / BUCKET_COUNT) * signals.length)]);
  }

  const buckets: CalibrationBucket[] = [];
  const bucketWeights: number[] = [];
  for (let i = 0; i < BUCKET_COUNT; i++) {
    const signalMin = i === 0 ? -Infinity : boundaries[i - 1];
    const signalMax = i === BUCKET_COUNT - 1 ? Infinity : boundaries[i];
    const inBucket = rows.filter(
      r => Number(r.signal_score ?? r.predicted_return) >= signalMin &&
           Number(r.signal_score ?? r.predicted_return) < signalMax
    );
    if (inBucket.length === 0) continue;

    const bucketActuals = inBucket.map(r => Number(r.actual_return));
    const n = bucketActuals.length;
    // Robust central tendency: median + trimmed mean resist the fat right tail
    // (a few 10x cards) that makes the plain mean look like a buy everywhere.
    const robust = 0.5 * median(bucketActuals) + 0.5 * trimmedMean(bucketActuals, 0.1);
    const rawStd = stdDev(bucketActuals);
    // Shrink toward the market median; small buckets converge hard.
    const shrinkW = SHRINK_TARGET_N / (SHRINK_TARGET_N + n);
    const meanActualReturn = robust * (1 - shrinkW) + marketMedianReturn * shrinkW;
    const stdActualReturn = Math.sqrt(
      rawStd * rawStd * (1 - shrinkW) + marketStdReturn * marketStdReturn * shrinkW
    );

    // Direction: share of outcomes that were strictly positive. The mean is
    // tail-dominated and sits at ~0 for every bucket (7d median is 0), so the
    // direction gate keys on this rate instead — it is what actually orders
    // the market: 30d up-rates climb from ~41% (low signal) to ~69% (moderate
    // signal) in real data.
    const upRate = bucketActuals.filter(a => a > 0).length / n;

    buckets.push({
      signalMin: i === 0 ? -Infinity : signalMin,
      signalMax: i === BUCKET_COUNT - 1 ? Infinity : signalMax,
      meanActualReturn,
      stdActualReturn,
      sampleCount: n,
      upRate,
    });
    bucketWeights.push(n);
  }

  // Enforce a monotone curve: higher raw signal never implies a lower expected
  // return. Without this, bucket noise (non-monotonic means) leaks garbage
  // into predictions and destroys the model's ordering skill (rank IC).
  const isotonicMeans = isotonicNonDecreasing(
    buckets.map(b => b.meanActualReturn),
    bucketWeights
  );
  for (let i = 0; i < buckets.length; i++) {
    buckets[i].meanActualReturn = isotonicMeans[i];
  }

  // Monotone up-rate curve for the direction gate (noisy bucket rates get
  // flattened to the weighted average of their pool).
  const isotonicUpRates = isotonicNonDecreasing(
    buckets.map(b => b.upRate ?? 0),
    bucketWeights
  );

  // The lowest signal at which the direction flips honest (up-rate >= 50%):
  // predictions above it are directionally correct more often than not, so the
  // engine must never emit a positive expected return below it — that is what
  // kills the bullish bias (81% "up" calls vs ~42% realized up-rate).
  let positiveThreshold: number | null = null;
  if (buckets.length > 0) {
    if (isotonicUpRates[0] >= 0.50) {
      positiveThreshold = -Infinity; // even the worst signals rise >50% of the time
    } else if (isotonicUpRates[isotonicUpRates.length - 1] < 0.50) {
      positiveThreshold = Infinity; // no signal level is reliably "up"
    } else {
      for (let i = 0; i < buckets.length - 1; i++) {
        if (isotonicUpRates[i] < 0.50 && isotonicUpRates[i + 1] >= 0.50) {
          const lo = buckets[i];
          const hi = buckets[i + 1];
          const frac = (0.50 - isotonicUpRates[i]) / (isotonicUpRates[i + 1] - isotonicUpRates[i]);
          const lowerBound = Number.isFinite(lo.signalMax) ? lo.signalMax : hi.signalMin;
          const span = Number.isFinite(hi.signalMax) ? hi.signalMax - lowerBound : 0.01;
          positiveThreshold = lowerBound + frac * span;
          break;
        }
      }
    }
  }

  const model: CalibrationModel = {
    horizon,
    bias,
    marketMedianReturn,
    marketStdReturn,
    buckets,
    sampleCount: rows.length,
    builtAt: new Date().toISOString(),
    positiveThreshold,
  };

  if (!asOfDate) {
    await new Promise<void>((resolve, reject) => {
      db.run(
        `INSERT INTO calibration_model (horizon, model_json, sample_count, built_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(horizon) DO UPDATE SET
           model_json = excluded.model_json,
           sample_count = excluded.sample_count,
           built_at = excluded.built_at`,
        [horizon, serializeModel(model), rows.length, model.builtAt],
        (err) => (err ? reject(err) : resolve())
      );
    });
    inMemoryCache.set(horizon, model);
  }

  return model;
}

/**
 * JSON cannot represent Infinity/-Infinity (they become null on parse), and a
 * null threshold silently disables the direction gate — the exact failure mode
 * for horizons whose curve never crosses 50% up-rate (e.g. 7d). Persist the
 * sentinels as strings so the gate survives a process restart.
 */
function serializeModel(model: CalibrationModel): string {
  const threshold = model.positiveThreshold;
  const safeThreshold =
    threshold === Infinity ? 'Infinity'
    : threshold === -Infinity ? '-Infinity'
    : threshold;
  return JSON.stringify({ ...model, positiveThreshold: safeThreshold });
}

function parseModel(json: string): CalibrationModel {
  const model = JSON.parse(json) as CalibrationModel & { positiveThreshold: unknown };
  const t = model.positiveThreshold as unknown;
  model.positiveThreshold =
    t === 'Infinity' ? Infinity
    : t === '-Infinity' ? -Infinity
    : (typeof t === 'number' ? t : null);
  return model;
}

/**
 * Rebuild models only for horizons that have enough samples.
 * Longer horizons stay null until history/outcomes mature — callers fall back
 * to bias correction instead of inventing a curve.
 */
export async function rebuildAllCalibrationModels(): Promise<Record<number, CalibrationModel | null>> {
  const result: Record<number, CalibrationModel | null> = {};
  for (const horizon of CALIBRATION_HORIZONS) {
    const sampleCount = await new Promise<number>((resolve) => {
      getDb().get(
        `SELECT COUNT(*) AS n FROM calibration_samples WHERE horizon = ?`,
        [horizon],
        (_err, row: any) => resolve(row?.n ?? 0)
      );
    });
    if (sampleCount < 30) {
      logger.info(`Calibration: skipping ${horizon}d rebuild (${sampleCount} samples)`);
      result[horizon] = await getCalibrationModel(horizon);
      continue;
    }
    result[horizon] = await buildCalibrationModel(horizon);
  }
  cacheLoadedAt = Date.now();
  return result;
}

/** Loads a persisted calibration model (with a short in-memory TTL). */
export async function getCalibrationModel(horizon: CalibrationHorizon): Promise<CalibrationModel | null> {
  if (Date.now() - cacheLoadedAt < CACHE_TTL_MS && inMemoryCache.has(horizon)) {
    return inMemoryCache.get(horizon) ?? null;
  }
  const db = getDb();
  const row: any = await new Promise((resolve, reject) => {
    db.get(
      `SELECT model_json FROM calibration_model WHERE horizon = ?`,
      [horizon],
      (err, r) => (err ? reject(err) : resolve(r || null))
    );
  });
  if (!row?.model_json) return null;
  try {
    const model = parseModel(row.model_json);
    inMemoryCache.set(horizon, model);
    return model;
  } catch {
    return null;
  }
}

export async function getCalibrationModels(): Promise<Record<number, CalibrationModel | null>> {
  const result: Record<number, CalibrationModel | null> = {};
  for (const horizon of CALIBRATION_HORIZONS) {
    result[horizon] = await getCalibrationModel(horizon);
  }
  return result;
}

/**
 * Maps a raw predicted return to a calibrated expected return.
 * Shrinks each bucket estimate toward the market median proportional to its
 * sample size (the curve itself is already shrunk at build time; this adds a
 * per-lookup interpolation between adjacent buckets when the signal falls on a
 * boundary).
 */
export function calibrateReturn(
  predictedReturn: number,
  model: CalibrationModel | null | undefined
): CalibratedReturn | null {
  if (!model || model.buckets.length === 0) return null;

  let bucket = model.buckets.find(
    b => predictedReturn >= b.signalMin && predictedReturn < b.signalMax
  );
  if (!bucket) {
    bucket = predictedReturn < model.buckets[0].signalMin
      ? model.buckets[0]
      : model.buckets[model.buckets.length - 1];
  }

  return {
    expectedReturn: bucket.meanActualReturn,
    residualStd: bucket.stdActualReturn,
    sampleCount: bucket.sampleCount,
  };
}

/**
 * Bias-only correction used when a horizon has no bucket model yet (e.g. 180d/
 * 365d before backtest samples exist). Uses the bias from the nearest modeled
 * horizon, scaled by the sqrt of the horizon ratio.
 */
export function biasCorrectionForHorizon(
  horizon: CalibrationHorizon,
  models: Record<number, CalibrationModel | null>
): number {
  if (models[horizon]) return models[horizon]!.bias;
  const nearest = CALIBRATION_HORIZONS
    .filter(h => models[h])
    .sort((a, b) => Math.abs(a - horizon) - Math.abs(b - horizon))[0];
  if (nearest == null) return 0;
  return models[nearest]!.bias * Math.sqrt(horizon / nearest);
}

/**
 * Realistic cap for expected returns: roughly the observed |median| + 3 std
 * when a model exists, otherwise a sane fallback per horizon.
 */
export function returnCapForHorizon(
  horizon: CalibrationHorizon,
  model: CalibrationModel | null | undefined,
  fallbackCap: number
): number {
  if (!model) return fallbackCap;
  return Math.max(
    fallbackCap,
    Math.abs(model.marketMedianReturn) + model.marketStdReturn * 3
  );
}

export function getCalibrationStatus(
  models: Record<number, CalibrationModel | null>
): Array<{
  horizon: number;
  sampleCount: number;
  bias: number | null;
  marketMedianReturn: number | null;
  builtAt: string | null;
}> {
  return CALIBRATION_HORIZONS.map(h => ({
    horizon: h,
    sampleCount: models[h]?.sampleCount ?? 0,
    bias: models[h]?.bias ?? null,
    marketMedianReturn: models[h]?.marketMedianReturn ?? null,
    builtAt: models[h]?.builtAt ?? null,
  }));
}

/**
 * Selective "strong buy" bar derived from the calibrated curve: the realized
 * mean return of the bucket holding the 75th-percentile signal (buckets are
 * built on equal quantiles, so index 6 of 8 starts at the 75th percentile).
 * Strong buy should be a small top slice — with the old flat 0.06 threshold,
 * 45-82% of cards qualified, which made the label meaningless.
 */
export function strongBuyThresholdForHorizon(
  horizon: CalibrationHorizon,
  models?: Record<number, CalibrationModel | null>,
  fallback: number = 0.06
): number {
  const model = models?.[horizon];
  if (!model || model.buckets.length === 0) return fallback;
  const idx = Math.min(6, model.buckets.length - 1);
  const level = model.buckets[idx]?.meanActualReturn ?? 0;
  if (!Number.isFinite(level) || level <= 0) return fallback;
  return Math.max(level, fallback);
}

/**
 * Direction gate for a horizon that may lack its own model (90d/180d/365d
 * before backtest history matures). The threshold lives in raw-signal units,
 * which are horizon-independent, so the nearest modeled horizon's gate applies.
 */
export function positiveThresholdForHorizon(
  horizon: CalibrationHorizon,
  models?: Record<number, CalibrationModel | null>
): number | null | undefined {
  const direct = models?.[horizon]?.positiveThreshold;
  if (direct != null) return direct;
  const nearest = CALIBRATION_HORIZONS
    .filter(h => models?.[h]?.positiveThreshold != null)
    .sort((a, b) => Math.abs(a - horizon) - Math.abs(b - horizon))[0];
  if (nearest == null) return null;
  return models?.[nearest]?.positiveThreshold ?? null;
}
