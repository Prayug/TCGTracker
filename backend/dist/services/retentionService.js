"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_DATA_QUALITY_DAYS_TO_KEEP = exports.DEFAULT_PREDICTION_RUNS_TO_KEEP = exports.MIN_PRICE_HISTORY_DAYS = void 0;
exports.pruneOldPredictionRuns = pruneOldPredictionRuns;
exports.pruneOldPriceHistory = pruneOldPriceHistory;
exports.pruneDataQualityChecks = pruneDataQualityChecks;
exports.runRetentionPolicies = runRetentionPolicies;
const database_1 = require("../db/database");
const logger_1 = require("../utils/logger");
/**
 * Safe retention policies.
 *
 * Price history is NEVER truncated below MIN_PRICE_HISTORY_DAYS — long-horizon
 * models and backtests depend on it. Prediction runs are pruned to the last N.
 */
exports.MIN_PRICE_HISTORY_DAYS = 400;
exports.DEFAULT_PREDICTION_RUNS_TO_KEEP = 30;
exports.DEFAULT_DATA_QUALITY_DAYS_TO_KEEP = 90;
const run = (sql, params = []) => new Promise((resolve, reject) => {
    (0, database_1.getDb)().run(sql, params, function (err) {
        if (err)
            reject(err);
        else
            resolve({ changes: this.changes });
    });
});
const get = (sql, params = []) => new Promise((resolve, reject) => {
    (0, database_1.getDb)().get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
});
/**
 * Keep the newest `keepRuns` prediction runs; cascade deletes predictions/results
 * via FK when configured, otherwise delete children explicitly.
 */
async function pruneOldPredictionRuns(keepRuns = exports.DEFAULT_PREDICTION_RUNS_TO_KEEP) {
    const cutoff = await get(`SELECT id FROM prediction_runs ORDER BY id DESC LIMIT 1 OFFSET ?`, [Math.max(0, keepRuns - 1)]);
    if (!(cutoff === null || cutoff === void 0 ? void 0 : cutoff.id))
        return 0;
    // Delete children first in case FK cascade is missing on older DBs.
    await run(`DELETE FROM prediction_results
     WHERE prediction_id IN (SELECT id FROM card_predictions WHERE run_id < ?)`, [cutoff.id]);
    const pred = await run(`DELETE FROM card_predictions WHERE run_id < ?`, [cutoff.id]);
    const runs = await run(`DELETE FROM prediction_runs WHERE id < ?`, [cutoff.id]);
    logger_1.logger.info('Pruned old prediction runs', {
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
async function pruneOldPriceHistory(keepDays = exports.MIN_PRICE_HISTORY_DAYS) {
    var _a;
    const effectiveKeep = Math.max(keepDays, exports.MIN_PRICE_HISTORY_DAYS);
    const span = await get(`SELECT CAST(julianday(MAX(date)) - julianday(MIN(date)) AS INTEGER) AS days,
            MAX(date) AS maxDate
     FROM price_history`);
    if (!(span === null || span === void 0 ? void 0 : span.maxDate)) {
        return { deleted: 0, skippedReason: 'no price history' };
    }
    if (((_a = span.days) !== null && _a !== void 0 ? _a : 0) <= effectiveKeep) {
        return {
            deleted: 0,
            skippedReason: `history span ${span.days}d ≤ keep ${effectiveKeep}d`,
        };
    }
    const cutoff = await get(`SELECT date(?, ?) AS d`, [span.maxDate, `-${effectiveKeep} days`]);
    if (!(cutoff === null || cutoff === void 0 ? void 0 : cutoff.d))
        return { deleted: 0, skippedReason: 'could not compute cutoff' };
    const result = await run(`DELETE FROM price_history WHERE date < ?`, [cutoff.d]);
    // Also prune canonical series to stay in sync
    await run(`DELETE FROM canonical_price_history WHERE date < ?`, [cutoff.d]).catch(() => ({
        changes: 0,
    }));
    await run(`DELETE FROM graded_price_history WHERE date < ?`, [cutoff.d]).catch(() => ({
        changes: 0,
    }));
    logger_1.logger.info('Pruned old price history', { cutoff: cutoff.d, deleted: result.changes });
    return { deleted: result.changes };
}
async function pruneDataQualityChecks(keepDays = exports.DEFAULT_DATA_QUALITY_DAYS_TO_KEEP) {
    const result = await run(`DELETE FROM data_quality_checks WHERE checked_at < datetime('now', ?)`, [`-${keepDays} days`]);
    return result.changes;
}
async function runRetentionPolicies(options) {
    var _a, _b;
    const deletedPredictionRuns = await pruneOldPredictionRuns((_a = options === null || options === void 0 ? void 0 : options.keepPredictionRuns) !== null && _a !== void 0 ? _a : exports.DEFAULT_PREDICTION_RUNS_TO_KEEP);
    const deletedDataQualityRows = await pruneDataQualityChecks();
    let priceHistoryPruned = 0;
    let skippedPricePruneReason;
    if (options === null || options === void 0 ? void 0 : options.prunePriceHistory) {
        const price = await pruneOldPriceHistory((_b = options.keepPriceHistoryDays) !== null && _b !== void 0 ? _b : exports.MIN_PRICE_HISTORY_DAYS);
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
