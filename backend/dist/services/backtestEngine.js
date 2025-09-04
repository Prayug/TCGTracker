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
exports.runBacktest = runBacktest;
exports.getBacktestResults = getBacktestResults;
const database_1 = require("../db/database");
const logger_1 = require("../utils/logger");
const marketAnalyzer_1 = require("./marketAnalyzer");
const predictionEngine_1 = require("./predictionEngine");
function fetchPriceHistoryUpToDate(uniqueIdentifier, cutoffDate) {
    const db = (0, database_1.getDb)();
    return new Promise((resolve, reject) => {
        db.all(`SELECT date, price, marketPrice, volume FROM price_history
       WHERE uniqueIdentifier = ? AND source IN ('tcgcsv', 'tcgdex', 'catalog_fallback')
       AND date <= ?
       ORDER BY date ASC`, [uniqueIdentifier, cutoffDate], (err, rows) => {
            if (err)
                return reject(err);
            resolve(rows.map(r => {
                var _a, _b;
                return ({
                    date: r.date,
                    price: (_a = r.price) !== null && _a !== void 0 ? _a : 0,
                    marketPrice: (_b = r.marketPrice) !== null && _b !== void 0 ? _b : r.price,
                    volume: r.volume,
                });
            }));
        });
    });
}
function fetchFuturePrice(uniqueIdentifier, startDate, daysAhead) {
    const db = (0, database_1.getDb)();
    return new Promise((resolve, reject) => {
        const targetDate = new Date(startDate);
        targetDate.setDate(targetDate.getDate() + daysAhead);
        const targetStr = targetDate.toISOString().split('T')[0];
        db.all(`SELECT date, marketPrice, price FROM price_history
       WHERE uniqueIdentifier = ? AND source IN ('tcgcsv', 'tcgdex', 'catalog_fallback')
       AND date >= ? AND date <= ?
       ORDER BY date ASC`, [uniqueIdentifier, startDate, targetStr], (err, rows) => {
            var _a;
            if (err)
                return reject(err);
            if (!rows || rows.length === 0)
                return resolve(null);
            const closest = rows[rows.length - 1];
            resolve((_a = closest.marketPrice) !== null && _a !== void 0 ? _a : closest.price);
        });
    });
}
function runBacktest(backtestDate_1) {
    return __awaiter(this, arguments, void 0, function* (backtestDate, windowDays = 90, cardIdFilter) {
        const db = (0, database_1.getDb)();
        let cards = yield new Promise((resolve, reject) => {
            let sql = `SELECT cm.cardId, cm.cardName, cm.setId, cm.setName, cm.cardNumber, cm.rarity, cm.uniqueIdentifier
               FROM card_mappings cm WHERE cm.cardName IS NOT NULL`;
            const params = [];
            if (cardIdFilter && cardIdFilter.length > 0) {
                sql += ` AND cm.cardId IN (${cardIdFilter.map(() => '?').join(',')})`;
                params.push(...cardIdFilter);
            }
            sql += ` ORDER BY cm.cardName ASC`;
            db.all(sql, params, (err, rows) => {
                if (err)
                    return reject(err);
                resolve(rows || []);
            });
        });
        const cardResults = [];
        let totalDirectionalCorrect = 0;
        let totalDirectionalTests = 0;
        let totalMape = 0;
        let totalMapeCount = 0;
        for (const card of cards) {
            try {
                const uid = card.uniqueIdentifier;
                if (!uid)
                    continue;
                const priceHistory = yield fetchPriceHistoryUpToDate(uid, backtestDate);
                if (priceHistory.length < 14)
                    continue;
                const currentPrice = (0, marketAnalyzer_1.getLatestPrice)(priceHistory);
                if (!currentPrice || currentPrice <= 0)
                    continue;
                const movingAverages = (0, marketAnalyzer_1.computeMovingAverages)(priceHistory);
                const priceChanges = (0, marketAnalyzer_1.computePriceChanges)(priceHistory);
                const volatility = (0, marketAnalyzer_1.computeVolatility)(priceHistory);
                const recoveryMetrics = (0, marketAnalyzer_1.computeRecoveryMetrics)(priceHistory);
                const trendScore = (0, predictionEngine_1.computeTrendScore)(priceChanges, movingAverages, currentPrice);
                const recoveryScore = (0, predictionEngine_1.computeRecoveryScore)(recoveryMetrics, priceChanges);
                const demandScore = (0, predictionEngine_1.computeDemandScore)(card.rarity, card.cardNumber);
                const riskScore = (0, predictionEngine_1.computeRiskScore)(volatility, priceChanges, movingAverages, 0);
                const scores = {
                    trendScore, recoveryScore, demandScore, riskScore,
                    externalSignalScore: 0,
                };
                const expectedReturns = (0, predictionEngine_1.computeExpectedReturns)(scores);
                const futurePrice = yield fetchFuturePrice(uid, backtestDate, windowDays);
                let actual90dReturn = null;
                let error90d = null;
                let directionCorrect = null;
                if (futurePrice && futurePrice > 0) {
                    actual90dReturn = (futurePrice - currentPrice) / currentPrice;
                    if (expectedReturns.expected90dReturn !== 0 && actual90dReturn !== 0) {
                        const predictedDir = expectedReturns.expected90dReturn > 0;
                        const actualDir = actual90dReturn > 0;
                        directionCorrect = predictedDir === actualDir;
                        if (directionCorrect)
                            totalDirectionalCorrect++;
                        totalDirectionalTests++;
                    }
                    error90d = Math.abs(expectedReturns.expected90dReturn - actual90dReturn);
                    totalMape += Math.abs(error90d);
                    totalMapeCount++;
                }
                const category = (0, predictionEngine_1.determineCategory)(scores, expectedReturns.expected90dReturn, priceChanges, recoveryMetrics);
                cardResults.push({
                    cardId: card.cardId,
                    cardName: card.cardName,
                    predicted90dReturn: expectedReturns.expected90dReturn,
                    actual90dReturn,
                    error90d,
                    directionCorrect,
                    category,
                });
            }
            catch (err) {
                logger_1.logger.warn(`Backtest failed for ${card.cardName}:`, err);
            }
        }
        const cardsTested = cardResults.length;
        const directionalAccuracy = totalDirectionalTests > 0 ? totalDirectionalCorrect / totalDirectionalTests : null;
        const mape = totalMapeCount > 0 ? totalMape / totalMapeCount : null;
        const top10 = [...cardResults]
            .filter(r => r.predicted90dReturn !== null)
            .sort((a, b) => b.predicted90dReturn - a.predicted90dReturn)
            .slice(0, 10);
        const top10AvgReturn = top10.length > 0
            ? top10.reduce((s, r) => { var _a; return s + ((_a = r.actual90dReturn) !== null && _a !== void 0 ? _a : 0); }, 0) / top10.length
            : null;
        const withActualReturns = cardResults.filter(r => r.actual90dReturn !== null);
        const marketAvgReturn = withActualReturns.length > 0
            ? withActualReturns.reduce((s, r) => { var _a; return s + ((_a = r.actual90dReturn) !== null && _a !== void 0 ? _a : 0); }, 0) / withActualReturns.length
            : null;
        const strongBuyCards = cardResults.filter(r => r.category === 'strong_buy');
        const strongBuyFalsePositive = strongBuyCards.filter(r => r.actual90dReturn !== null && r.actual90dReturn < 0);
        const strongBuyFalsePositiveRate = strongBuyCards.length > 0
            ? strongBuyFalsePositive.length / strongBuyCards.length
            : null;
        const avoidCards = cardResults.filter(r => r.category === 'avoid' && r.actual90dReturn !== null);
        const avoidAvgReturn = avoidCards.length > 0
            ? avoidCards.reduce((s, r) => { var _a; return s + ((_a = r.actual90dReturn) !== null && _a !== void 0 ? _a : 0); }, 0) / avoidCards.length
            : null;
        const categories = ['strong_buy', 'watch_dip', 'recovery', 'momentum', 'stagnant', 'avoid', 'downtrend'];
        const categoryPerformance = categories.map(cat => {
            const catCards = cardResults.filter(r => r.category === cat && r.actual90dReturn !== null);
            const count = catCards.length;
            const avgReturn = count > 0 ? catCards.reduce((s, r) => { var _a; return s + ((_a = r.actual90dReturn) !== null && _a !== void 0 ? _a : 0); }, 0) / count : 0;
            const avgPredictedReturn = count > 0
                ? catCards.filter(r => r.predicted90dReturn !== null).reduce((s, r) => s + r.predicted90dReturn, 0) / count
                : 0;
            return { category: cat, count, avgReturn, avgPredictedReturn };
        });
        const result = {
            backtestDate,
            windowDays,
            cardsTested,
            directionalAccuracy,
            mape,
            top10AvgReturn,
            marketAvgReturn,
            strongBuyFalsePositiveRate,
            avoidAvgReturn,
            categoryPerformance,
            cardResults,
        };
        yield saveBacktestResult(result);
        return result;
    });
}
function saveBacktestResult(result) {
    return __awaiter(this, void 0, void 0, function* () {
        const db = (0, database_1.getDb)();
        yield new Promise((resolve, reject) => {
            db.run(`INSERT INTO backtest_runs
       (backtest_date, window_days, cards_tested, directional_accuracy, mape,
        top10_avg_return, market_avg_return, strong_buy_false_positive_rate,
        avoid_avg_return, category_performance)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
                result.backtestDate,
                result.windowDays,
                result.cardsTested,
                result.directionalAccuracy,
                result.mape,
                result.top10AvgReturn,
                result.marketAvgReturn,
                result.strongBuyFalsePositiveRate,
                result.avoidAvgReturn,
                JSON.stringify(result.categoryPerformance),
            ], function (err) {
                if (err)
                    reject(err);
                else
                    resolve();
            });
        });
    });
}
function getBacktestResults() {
    return __awaiter(this, void 0, void 0, function* () {
        const db = (0, database_1.getDb)();
        return new Promise((resolve, reject) => {
            db.all(`SELECT * FROM backtest_runs ORDER BY created_at DESC LIMIT 20`, [], (err, rows) => {
                if (err)
                    return reject(err);
                resolve(rows.map(r => (Object.assign(Object.assign({}, r), { category_performance: (() => {
                        try {
                            return r.category_performance ? JSON.parse(r.category_performance) : [];
                        }
                        catch (_a) {
                            return [];
                        }
                    })() }))));
            });
        });
    });
}
