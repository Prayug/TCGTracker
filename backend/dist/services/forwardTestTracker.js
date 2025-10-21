"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateActualResults = updateActualResults;
exports.getForwardTestStatus = getForwardTestStatus;
const database_1 = require("../db/database");
const logger_1 = require("../utils/logger");
const WINDOW_COLS = {
    7: { price: 'actual_7d_price', dir: 'direction_correct_7d' },
    30: { price: 'actual_30d_price', dir: 'direction_correct_30d' },
    90: { price: 'actual_90d_price', dir: 'direction_correct_90d' },
};
function updateActualResults() {
    return __awaiter(this, void 0, void 0, function* () {
        const db = (0, database_1.getDb)();
        const pendingPredictions = yield new Promise((resolve, reject) => {
            db.all(`SELECT cp.id, cp.card_id, cp.prediction_date, cp.current_price,
              cp.predicted_7d_mid, cp.predicted_30d_mid, cp.predicted_90d_mid,
              cp.expected_7d_return, cp.expected_30d_return, cp.expected_90d_return
       FROM card_predictions cp
       LEFT JOIN prediction_results pr ON pr.prediction_id = cp.id
       WHERE pr.id IS NULL OR pr.status = 'pending'`, [], (err, rows) => {
                if (err)
                    return reject(err);
                resolve(rows || []);
            });
        });
        let updated = 0;
        for (const pred of pendingPredictions) {
            try {
                const now = new Date();
                const predDate = new Date(pred.prediction_date + 'T00:00:00Z');
                const daysSince = Math.floor((now.getTime() - predDate.getTime()) / (1000 * 60 * 60 * 24));
                if (daysSince < 7)
                    continue;
                const actual7d = yield fetchActualPrice(pred.card_id, pred.prediction_date, 7);
                const actual30d = yield fetchActualPrice(pred.card_id, pred.prediction_date, 30);
                const actual90d = yield fetchActualPrice(pred.card_id, pred.prediction_date, 90);
                const currentPrice = pred.current_price || 0;
                const actual7dReturn = actual7d !== null && currentPrice > 0
                    ? (actual7d - currentPrice) / currentPrice : null;
                const actual30dReturn = actual30d !== null && currentPrice > 0
                    ? (actual30d - currentPrice) / currentPrice : null;
                const actual90dReturn = actual90d !== null && currentPrice > 0
                    ? (actual90d - currentPrice) / currentPrice : null;
                const error7d = actual7dReturn !== null
                    ? Math.abs((pred.expected_7d_return || 0) - actual7dReturn) : null;
                const error30d = actual30dReturn !== null
                    ? Math.abs((pred.expected_30d_return || 0) - actual30dReturn) : null;
                const error90d = actual90dReturn !== null
                    ? Math.abs((pred.expected_90d_return || 0) - actual90dReturn) : null;
                const directionCorrect7d = (pred.expected_7d_return != null && actual7dReturn != null)
                    ? (pred.expected_7d_return > 0) === (actual7dReturn > 0) ? 1 : 0 : 0;
                const directionCorrect30d = (pred.expected_30d_return != null && actual30dReturn != null)
                    ? (pred.expected_30d_return > 0) === (actual30dReturn > 0) ? 1 : 0 : 0;
                const directionCorrect90d = (pred.expected_90d_return != null && actual90dReturn != null)
                    ? (pred.expected_90d_return > 0) === (actual90dReturn > 0) ? 1 : 0 : 0;
                const has7d = actual7d !== null;
                const has30d = actual30d !== null;
                const has90d = actual90d !== null;
                let status = 'pending';
                if (has90d) {
                    const hit7d = error7d !== null && error7d < 0.1;
                    const hit30d = error30d !== null && error30d < 0.1;
                    const hit90d = error90d !== null && error90d < 0.1;
                    status = (hit7d && hit30d && hit90d) ? 'hit' : (hit7d || hit30d || hit90d) ? 'partially_correct' : 'missed';
                }
                else if (has30d) {
                    const hit7d = error7d !== null && error7d < 0.1;
                    const hit30d = error30d !== null && error30d < 0.1;
                    status = (hit7d && hit30d) ? 'hit' : (hit7d || hit30d) ? 'partially_correct' : 'missed';
                }
                else if (has7d) {
                    status = (error7d !== null && error7d < 0.1) ? 'hit' : 'missed';
                }
                yield new Promise((resolve, reject) => {
                    db.run(`INSERT OR REPLACE INTO prediction_results
           (prediction_id, actual_7d_price, actual_30d_price, actual_90d_price,
            actual_7d_return, actual_30d_return, actual_90d_return,
            error_7d, error_30d, error_90d,
            direction_correct_7d, direction_correct_30d, direction_correct_90d,
            status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
                        pred.id,
                        actual7d, actual30d, actual90d,
                        actual7dReturn, actual30dReturn, actual90dReturn,
                        error7d, error30d, error90d,
                        directionCorrect7d, directionCorrect30d, directionCorrect90d,
                        status,
                    ], function (err) {
                        if (err)
                            return reject(err);
                        resolve();
                    });
                });
                updated++;
            }
            catch (err) {
                logger_1.logger.warn(`Forward test update failed for prediction ${pred.id}:`, err);
            }
        }
        return { updated };
    });
}
function fetchActualPrice(cardId, predictionDate, daysAhead) {
    return __awaiter(this, void 0, void 0, function* () {
        const db = (0, database_1.getDb)();
        const targetDate = new Date(predictionDate + 'T00:00:00Z');
        targetDate.setDate(targetDate.getDate() + daysAhead);
        const targetStr = targetDate.toISOString().split('T')[0];
        return new Promise((resolve, reject) => {
            db.get(`SELECT ph.marketPrice, ph.price
       FROM price_history ph
       JOIN card_mappings cm ON cm.uniqueIdentifier = ph.uniqueIdentifier
       WHERE cm.cardId = ? AND ph.date <= ? AND (ph.marketPrice > 0 OR ph.price > 0)
       ORDER BY ph.date DESC LIMIT 1`, [cardId, targetStr], (err, row) => {
                var _a;
                if (err)
                    return reject(err);
                if (!row)
                    return resolve(null);
                resolve((_a = row.marketPrice) !== null && _a !== void 0 ? _a : row.price);
            });
        });
    });
}
function getForwardTestStatus() {
    return __awaiter(this, void 0, void 0, function* () {
        const db = (0, database_1.getDb)();
        const totalPredictions = yield new Promise((resolve, reject) => {
            db.get(`SELECT COUNT(*) as count FROM card_predictions
       WHERE run_id = (SELECT MAX(id) FROM prediction_runs)`, [], (err, row) => {
                if (err)
                    return reject(err);
                resolve((row === null || row === void 0 ? void 0 : row.count) || 0);
            });
        });
        const getCountByStatus = (status) => {
            return new Promise((resolve, reject) => {
                db.get(`SELECT COUNT(*) as count FROM prediction_results pr
         JOIN card_predictions cp ON cp.id = pr.prediction_id
         WHERE cp.run_id = (SELECT MAX(id) FROM prediction_runs) AND pr.status = ?`, [status], (err, row) => {
                    if (err)
                        return reject(err);
                    resolve((row === null || row === void 0 ? void 0 : row.count) || 0);
                });
            });
        };
        const [pending, hit, missed, partiallyCorrect] = yield Promise.all([
            getCountByStatus('pending'),
            getCountByStatus('hit'),
            getCountByStatus('missed'),
            getCountByStatus('partially_correct'),
        ]);
        const totalResolved = hit + missed + partiallyCorrect;
        const overallAccuracy = totalResolved > 0 ? (hit + partiallyCorrect * 0.5) / totalResolved : null;
        const getWindowStats = (days) => __awaiter(this, void 0, void 0, function* () {
            const cols = WINDOW_COLS[days];
            if (!cols) {
                return { pending: totalPredictions, hit: 0, missed: 0, accuracy: null };
            }
            const total = yield new Promise((resolve, reject) => {
                db.get(`SELECT COUNT(*) as count FROM prediction_results pr
         JOIN card_predictions cp ON cp.id = pr.prediction_id
         WHERE cp.run_id = (SELECT MAX(id) FROM prediction_runs)
         AND pr.${cols.price} IS NOT NULL`, [], (err, row) => {
                    if (err)
                        return reject(err);
                    resolve((row === null || row === void 0 ? void 0 : row.count) || 0);
                });
            });
            const correct = yield new Promise((resolve, reject) => {
                db.get(`SELECT COUNT(*) as count FROM prediction_results pr
         JOIN card_predictions cp ON cp.id = pr.prediction_id
         WHERE cp.run_id = (SELECT MAX(id) FROM prediction_runs)
         AND pr.${cols.dir} = 1`, [], (err, row) => {
                    if (err)
                        return reject(err);
                    resolve((row === null || row === void 0 ? void 0 : row.count) || 0);
                });
            });
            const pendingCount = totalPredictions - total;
            return {
                pending: pendingCount,
                hit: correct,
                missed: total - correct,
                accuracy: total > 0 ? correct / total : null,
            };
        });
        const [_7d, _30d, _90d] = yield Promise.all([
            getWindowStats(7),
            getWindowStats(30),
            getWindowStats(90),
        ]);
        const getCategoryStats = () => __awaiter(this, void 0, void 0, function* () {
            const categories = ['strong_buy', 'watch_dip', 'recovery', 'momentum', 'stagnant', 'avoid', 'downtrend'];
            const results = [];
            for (const cat of categories) {
                const stats = yield new Promise((resolve, reject) => {
                    db.get(`SELECT
            COUNT(*) as total,
            COUNT(CASE WHEN pr.status = 'hit' THEN 1 END) as hit,
            COUNT(CASE WHEN pr.status = 'missed' THEN 1 END) as missed,
            COUNT(CASE WHEN pr.status = 'partially_correct' THEN 1 END) as partial,
            AVG(pr.error_90d) as avg_error
          FROM prediction_results pr
          JOIN card_predictions cp ON cp.id = pr.prediction_id
          WHERE cp.run_id = (SELECT MAX(id) FROM prediction_runs)
          AND cp.category = ?`, [cat], (err, row) => {
                        if (err)
                            return reject(err);
                        resolve(row || { total: 0, hit: 0, missed: 0, partial: 0, avg_error: null });
                    });
                });
                const resolved = stats.hit + stats.missed + stats.partial;
                results.push({
                    category: cat,
                    total: stats.total,
                    hit: stats.hit,
                    missed: stats.missed,
                    partiallyCorrect: stats.partial,
                    accuracy: resolved > 0 ? (stats.hit + stats.partial * 0.5) / resolved : null,
                    avgError: stats.avg_error,
                });
            }
            return results;
        });
        const getPriceRangeStats = () => __awaiter(this, void 0, void 0, function* () {
            const getStatsForRange = (minPrice, maxPrice) => {
                return new Promise((resolve, reject) => {
                    const priceClause = maxPrice !== null
                        ? 'AND cp.current_price >= ? AND cp.current_price < ?'
                        : 'AND cp.current_price >= ?';
                    const params = maxPrice !== null ? [minPrice, maxPrice] : [minPrice];
                    db.get(`SELECT
            COUNT(*) as total,
            COUNT(CASE WHEN pr.status = 'hit' THEN 1 END) as hit
          FROM prediction_results pr
          JOIN card_predictions cp ON cp.id = pr.prediction_id
          WHERE cp.run_id = (SELECT MAX(id) FROM prediction_runs)
          ${priceClause}`, params, (err, row) => {
                        if (err)
                            return reject(err);
                        const r = row || { total: 0, hit: 0 };
                        resolve({ total: r.total, hit: r.hit, accuracy: r.total > 0 ? r.hit / r.total : null });
                    });
                });
            };
            const [under5, fiveToFifty, overFifty] = yield Promise.all([
                getStatsForRange(0, 5),
                getStatsForRange(5, 50),
                getStatsForRange(50, null),
            ]);
            return { under5, fiveToFifty, overFifty };
        });
        const [byCategory, byPriceRange] = yield Promise.all([getCategoryStats(), getPriceRangeStats()]);
        return {
            totalPredictions,
            pending, hit, missed, partiallyCorrect,
            overallAccuracy,
            byWindow: { _7d, _30d, _90d },
            byCategory,
            byPriceRange,
        };
    });
}
