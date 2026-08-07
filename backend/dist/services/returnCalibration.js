"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.CALIBRATION_HORIZONS = void 0;
exports.collectForwardTestSamples = collectForwardTestSamples;
exports.harvestBacktestSamples = harvestBacktestSamples;
exports.storeBacktestSamples = storeBacktestSamples;
exports.buildCalibrationModel = buildCalibrationModel;
exports.rebuildAllCalibrationModels = rebuildAllCalibrationModels;
exports.getCalibrationModel = getCalibrationModel;
exports.getCalibrationModels = getCalibrationModels;
exports.calibrateReturn = calibrateReturn;
exports.biasCorrectionForHorizon = biasCorrectionForHorizon;
exports.returnCapForHorizon = returnCapForHorizon;
exports.getCalibrationStatus = getCalibrationStatus;
exports.strongBuyThresholdForHorizon = strongBuyThresholdForHorizon;
exports.positiveThresholdForHorizon = positiveThresholdForHorizon;
const database_1 = require("../db/database");
const logger_1 = require("../utils/logger");
exports.CALIBRATION_HORIZONS = [7, 30, 90, 180, 365];
/** Samples per bucket below which the curve is heavily shrunk to the median. */
const SHRINK_TARGET_N = 25;
const inMemoryCache = new Map();
let cacheLoadedAt = 0;
/** Re-read the persisted model at most every N ms. */
const CACHE_TTL_MS = 15 * 60 * 1000;
function median(values) {
    if (values.length === 0)
        return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}
function mean(values) {
    if (values.length === 0)
        return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
}
function stdDev(values) {
    if (values.length < 2)
        return 0;
    const m = mean(values);
    return Math.sqrt(values.reduce((a, v) => a + (v - m) ** 2, 0) / values.length);
}
/**
 * Robust trimmed mean: drops the top and bottom `trim` fraction of values so a
 * fat right tail (a few cards that 10x) cannot inflate the "expected" return.
 */
function trimmedMean(values, trim = 0.10) {
    if (values.length === 0)
        return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const k = Math.floor(sorted.length * trim);
    if (sorted.length - 2 * k <= 0)
        return median(sorted);
    const slice = sorted.slice(k, sorted.length - k);
    return mean(slice);
}
/**
 * Pool-Adjacent-Violators isotonic regression: returns a non-decreasing copy of
 * `values` weighted by `weights`. Enforces that higher raw signal never maps to
 * a lower expected return, which turns bucket noise into an honest curve.
 */
function isotonicNonDecreasing(values, weights) {
    const n = values.length;
    if (n === 0)
        return [];
    const starts = [0];
    const levels = [values[0]];
    const sizes = [Math.max(weights[0], 1e-9)];
    for (let i = 1; i < n; i++) {
        starts.push(i);
        levels.push(values[i]);
        sizes.push(Math.max(weights[i], 1e-9));
        while (levels.length >= 2 && levels[levels.length - 2] > levels[levels.length - 1]) {
            const bVal = levels.pop();
            const bSize = sizes.pop();
            const aVal = levels[levels.length - 1];
            const aSize = sizes[sizes.length - 1];
            levels[levels.length - 1] = (aVal * aSize + bVal * bSize) / (aSize + bSize);
            sizes[sizes.length - 1] = aSize + bSize;
            starts.pop();
        }
    }
    const result = new Array(n).fill(0);
    for (let b = 0; b < levels.length; b++) {
        const from = starts[b];
        const to = b + 1 < starts.length ? starts[b + 1] : n;
        for (let i = from; i < to; i++)
            result[i] = levels[b];
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
async function collectForwardTestSamples(excludeRunId) {
    const db = (0, database_1.getDb)();
    const excludeClause = excludeRunId ? ` AND cp.run_id <> ${Number(excludeRunId)}` : '';
    const insert = (horizon, expectedCol, actualCol) => new Promise((resolve, reject) => {
        db.run(`INSERT OR IGNORE INTO calibration_samples
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
           AND cp.${expectedCol} IS NOT NULL${excludeClause}`, [], function (err) {
            var _a;
            if (err)
                reject(err);
            else
                resolve((_a = this.changes) !== null && _a !== void 0 ? _a : 0);
        });
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
    }
    catch (err) {
        logger_1.logger.warn('Failed to collect forward-test calibration samples:', err);
        return 0;
    }
}
/**
 * Harvests long-horizon samples by running the backtest engine at historical
 * cutoff dates. Cutoffs are chosen so a `windowDays`-ahead outcome has already
 * matured against real price history.
 */
async function harvestBacktestSamples(cutoffs, windowDays, sampleSize) {
    const { runBacktest } = await Promise.resolve().then(() => __importStar(require('./backtestEngine')));
    let stored = 0;
    for (const cutoff of cutoffs) {
        try {
            const result = await runBacktest(cutoff, windowDays, undefined, undefined, sampleSize);
            stored += await storeBacktestSamples(result);
        }
        catch (err) {
            logger_1.logger.warn(`Calibration harvest failed for cutoff ${cutoff} (${windowDays}d):`, err);
        }
    }
    return stored;
}
/** Persists backtest (predicted, actual) pairs as calibration samples. */
async function storeBacktestSamples(result) {
    const db = (0, database_1.getDb)();
    let stored = 0;
    for (const card of result.cardResults) {
        if (card.actualReturn === null || card.predictedReturn === null)
            continue;
        await new Promise((resolve) => {
            var _a;
            db.run(`INSERT OR IGNORE INTO calibration_samples
           (horizon, card_id, run_id, signal_score, predicted_return, actual_return, source, prediction_date)
         VALUES (?, ?, NULL, ?, ?, ?, 'backtest', ?)`, [
                result.windowDays,
                card.cardId,
                // Key buckets on the raw pre-calibration signal so backtest and
                // forward-test samples share one scale.
                (_a = card.signalScore) !== null && _a !== void 0 ? _a : card.predictedReturn,
                card.predictedReturn,
                card.actualReturn,
                result.backtestDate,
            ], () => resolve());
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
async function buildCalibrationModel(horizon, asOfDate) {
    const db = (0, database_1.getDb)();
    let sql = `SELECT signal_score, predicted_return, actual_return
       FROM calibration_samples
       WHERE horizon = ?
         AND actual_return IS NOT NULL
         AND predicted_return IS NOT NULL`;
    const params = [horizon];
    if (asOfDate) {
        sql += ` AND prediction_date <= date(?, ?)`;
        params.push(asOfDate, `-${horizon} days`);
    }
    const rows = await new Promise((resolve, reject) => {
        db.all(sql, params, (err, r) => (err ? reject(err) : resolve(r || [])));
    });
    if (rows.length < 30) {
        logger_1.logger.info(`Calibration: not enough samples for ${horizon}d (${rows.length}), skipping`);
        return null;
    }
    const actuals = rows.map(r => Number(r.actual_return));
    const marketMedianReturn = median(actuals);
    const marketStdReturn = stdDev(actuals);
    const biases = rows.map(r => Number(r.predicted_return) - Number(r.actual_return));
    const bias = median(biases);
    // Quantile buckets over the raw signal score (pre-calibration predicted return).
    const signals = rows.map(r => { var _a; return Number((_a = r.signal_score) !== null && _a !== void 0 ? _a : r.predicted_return); }).sort((a, b) => a - b);
    const BUCKET_COUNT = 8;
    const boundaries = [];
    for (let i = 1; i < BUCKET_COUNT; i++) {
        boundaries.push(signals[Math.floor((i / BUCKET_COUNT) * signals.length)]);
    }
    const buckets = [];
    const bucketWeights = [];
    for (let i = 0; i < BUCKET_COUNT; i++) {
        const signalMin = i === 0 ? -Infinity : boundaries[i - 1];
        const signalMax = i === BUCKET_COUNT - 1 ? Infinity : boundaries[i];
        const inBucket = rows.filter(r => {
            var _a, _b;
            return Number((_a = r.signal_score) !== null && _a !== void 0 ? _a : r.predicted_return) >= signalMin &&
                Number((_b = r.signal_score) !== null && _b !== void 0 ? _b : r.predicted_return) < signalMax;
        });
        if (inBucket.length === 0)
            continue;
        const bucketActuals = inBucket.map(r => Number(r.actual_return));
        const n = bucketActuals.length;
        // Robust central tendency: median + trimmed mean resist the fat right tail
        // (a few 10x cards) that makes the plain mean look like a buy everywhere.
        const robust = 0.5 * median(bucketActuals) + 0.5 * trimmedMean(bucketActuals, 0.1);
        const rawStd = stdDev(bucketActuals);
        // Shrink toward the market median; small buckets converge hard.
        const shrinkW = SHRINK_TARGET_N / (SHRINK_TARGET_N + n);
        const meanActualReturn = robust * (1 - shrinkW) + marketMedianReturn * shrinkW;
        const stdActualReturn = Math.sqrt(rawStd * rawStd * (1 - shrinkW) + marketStdReturn * marketStdReturn * shrinkW);
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
    const isotonicMeans = isotonicNonDecreasing(buckets.map(b => b.meanActualReturn), bucketWeights);
    for (let i = 0; i < buckets.length; i++) {
        buckets[i].meanActualReturn = isotonicMeans[i];
    }
    // Monotone up-rate curve for the direction gate (noisy bucket rates get
    // flattened to the weighted average of their pool).
    const isotonicUpRates = isotonicNonDecreasing(buckets.map(b => { var _a; return (_a = b.upRate) !== null && _a !== void 0 ? _a : 0; }), bucketWeights);
    // The lowest signal at which the direction flips honest (up-rate >= 50%):
    // predictions above it are directionally correct more often than not, so the
    // engine must never emit a positive expected return below it — that is what
    // kills the bullish bias (81% "up" calls vs ~42% realized up-rate).
    let positiveThreshold = null;
    if (buckets.length > 0) {
        if (isotonicUpRates[0] >= 0.50) {
            positiveThreshold = -Infinity; // even the worst signals rise >50% of the time
        }
        else if (isotonicUpRates[isotonicUpRates.length - 1] < 0.50) {
            positiveThreshold = Infinity; // no signal level is reliably "up"
        }
        else {
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
    const model = {
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
        await new Promise((resolve, reject) => {
            db.run(`INSERT INTO calibration_model (horizon, model_json, sample_count, built_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(horizon) DO UPDATE SET
           model_json = excluded.model_json,
           sample_count = excluded.sample_count,
           built_at = excluded.built_at`, [horizon, serializeModel(model), rows.length, model.builtAt], (err) => (err ? reject(err) : resolve()));
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
function serializeModel(model) {
    const threshold = model.positiveThreshold;
    const safeThreshold = threshold === Infinity ? 'Infinity'
        : threshold === -Infinity ? '-Infinity'
            : threshold;
    return JSON.stringify({ ...model, positiveThreshold: safeThreshold });
}
function parseModel(json) {
    const model = JSON.parse(json);
    const t = model.positiveThreshold;
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
async function rebuildAllCalibrationModels() {
    const result = {};
    for (const horizon of exports.CALIBRATION_HORIZONS) {
        const sampleCount = await new Promise((resolve) => {
            (0, database_1.getDb)().get(`SELECT COUNT(*) AS n FROM calibration_samples WHERE horizon = ?`, [horizon], (_err, row) => { var _a; return resolve((_a = row === null || row === void 0 ? void 0 : row.n) !== null && _a !== void 0 ? _a : 0); });
        });
        if (sampleCount < 30) {
            logger_1.logger.info(`Calibration: skipping ${horizon}d rebuild (${sampleCount} samples)`);
            result[horizon] = await getCalibrationModel(horizon);
            continue;
        }
        result[horizon] = await buildCalibrationModel(horizon);
    }
    cacheLoadedAt = Date.now();
    return result;
}
/** Loads a persisted calibration model (with a short in-memory TTL). */
async function getCalibrationModel(horizon) {
    var _a;
    if (Date.now() - cacheLoadedAt < CACHE_TTL_MS && inMemoryCache.has(horizon)) {
        return (_a = inMemoryCache.get(horizon)) !== null && _a !== void 0 ? _a : null;
    }
    const db = (0, database_1.getDb)();
    const row = await new Promise((resolve, reject) => {
        db.get(`SELECT model_json FROM calibration_model WHERE horizon = ?`, [horizon], (err, r) => (err ? reject(err) : resolve(r || null)));
    });
    if (!(row === null || row === void 0 ? void 0 : row.model_json))
        return null;
    try {
        const model = parseModel(row.model_json);
        inMemoryCache.set(horizon, model);
        return model;
    }
    catch (_b) {
        return null;
    }
}
async function getCalibrationModels() {
    const result = {};
    for (const horizon of exports.CALIBRATION_HORIZONS) {
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
function calibrateReturn(predictedReturn, model) {
    if (!model || model.buckets.length === 0)
        return null;
    let bucket = model.buckets.find(b => predictedReturn >= b.signalMin && predictedReturn < b.signalMax);
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
function biasCorrectionForHorizon(horizon, models) {
    if (models[horizon])
        return models[horizon].bias;
    const nearest = exports.CALIBRATION_HORIZONS
        .filter(h => models[h])
        .sort((a, b) => Math.abs(a - horizon) - Math.abs(b - horizon))[0];
    if (nearest == null)
        return 0;
    return models[nearest].bias * Math.sqrt(horizon / nearest);
}
/**
 * Realistic cap for expected returns: roughly the observed |median| + 3 std
 * when a model exists, otherwise a sane fallback per horizon.
 */
function returnCapForHorizon(horizon, model, fallbackCap) {
    if (!model)
        return fallbackCap;
    return Math.max(fallbackCap, Math.abs(model.marketMedianReturn) + model.marketStdReturn * 3);
}
function getCalibrationStatus(models) {
    return exports.CALIBRATION_HORIZONS.map(h => {
        var _a, _b, _c, _d, _e, _f, _g, _h;
        return ({
            horizon: h,
            sampleCount: (_b = (_a = models[h]) === null || _a === void 0 ? void 0 : _a.sampleCount) !== null && _b !== void 0 ? _b : 0,
            bias: (_d = (_c = models[h]) === null || _c === void 0 ? void 0 : _c.bias) !== null && _d !== void 0 ? _d : null,
            marketMedianReturn: (_f = (_e = models[h]) === null || _e === void 0 ? void 0 : _e.marketMedianReturn) !== null && _f !== void 0 ? _f : null,
            builtAt: (_h = (_g = models[h]) === null || _g === void 0 ? void 0 : _g.builtAt) !== null && _h !== void 0 ? _h : null,
        });
    });
}
/**
 * Selective "strong buy" bar derived from the calibrated curve: the realized
 * mean return of the bucket holding the 75th-percentile signal (buckets are
 * built on equal quantiles, so index 6 of 8 starts at the 75th percentile).
 * Strong buy should be a small top slice — with the old flat 0.06 threshold,
 * 45-82% of cards qualified, which made the label meaningless.
 */
function strongBuyThresholdForHorizon(horizon, models, fallback = 0.06) {
    var _a, _b;
    const model = models === null || models === void 0 ? void 0 : models[horizon];
    if (!model || model.buckets.length === 0)
        return fallback;
    const idx = Math.min(6, model.buckets.length - 1);
    const level = (_b = (_a = model.buckets[idx]) === null || _a === void 0 ? void 0 : _a.meanActualReturn) !== null && _b !== void 0 ? _b : 0;
    if (!Number.isFinite(level) || level <= 0)
        return fallback;
    return Math.max(level, fallback);
}
/**
 * Direction gate for a horizon that may lack its own model (90d/180d/365d
 * before backtest history matures). The threshold lives in raw-signal units,
 * which are horizon-independent, so the nearest modeled horizon's gate applies.
 */
function positiveThresholdForHorizon(horizon, models) {
    var _a, _b, _c;
    const direct = (_a = models === null || models === void 0 ? void 0 : models[horizon]) === null || _a === void 0 ? void 0 : _a.positiveThreshold;
    if (direct != null)
        return direct;
    const nearest = exports.CALIBRATION_HORIZONS
        .filter(h => { var _a; return ((_a = models === null || models === void 0 ? void 0 : models[h]) === null || _a === void 0 ? void 0 : _a.positiveThreshold) != null; })
        .sort((a, b) => Math.abs(a - horizon) - Math.abs(b - horizon))[0];
    if (nearest == null)
        return null;
    return (_c = (_b = models === null || models === void 0 ? void 0 : models[nearest]) === null || _b === void 0 ? void 0 : _b.positiveThreshold) !== null && _c !== void 0 ? _c : null;
}
