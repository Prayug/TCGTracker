"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SUPPORTED_BACKTEST_WINDOWS = void 0;
exports.expectedReturnForWindow = expectedReturnForWindow;
exports.runBacktest = runBacktest;
exports.getBacktestResults = getBacktestResults;
exports.runWalkForwardValidation = runWalkForwardValidation;
const database_1 = require("../db/database");
const logger_1 = require("../utils/logger");
const marketAnalyzer_1 = require("./marketAnalyzer");
const predictionEngine_1 = require("./predictionEngine");
exports.SUPPORTED_BACKTEST_WINDOWS = [7, 30, 90, 180, 365];
/** Picks the expected return matching a backtest window from the engine output. */
function expectedReturnForWindow(returns, windowDays) {
    if (windowDays <= 7)
        return returns.expected7dReturn;
    if (windowDays <= 30)
        return returns.expected30dReturn;
    if (windowDays <= 90)
        return returns.expected90dReturn;
    if (windowDays <= 180)
        return returns.expected180dReturn;
    return returns.expected365dReturn;
}
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
async function runBacktest(backtestDate, windowDays = 90, cardIdFilter, filter = predictionEngine_1.DEFAULT_CARD_QUALITY_FILTER) {
    const db = (0, database_1.getDb)();
    let cards = await new Promise((resolve, reject) => {
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
    const returns = [];
    for (const card of cards) {
        try {
            const uid = card.uniqueIdentifier;
            if (!uid)
                continue;
            const priceHistory = await fetchPriceHistoryUpToDate(uid, backtestDate);
            if (priceHistory.length < filter.minDataPoints)
                continue;
            const currentPrice = (0, marketAnalyzer_1.getLatestPrice)(priceHistory);
            if (!currentPrice || currentPrice <= 0)
                continue;
            if (currentPrice < filter.minPrice || currentPrice > filter.maxPrice)
                continue;
            if (!(0, predictionEngine_1.isRarityInvestmentWorthy)(card.rarity))
                continue;
            if (filter.excludeStagnant && !(0, predictionEngine_1.hasMeaningfulPriceMovement)(priceHistory))
                continue;
            const movingAverages = (0, marketAnalyzer_1.computeMovingAverages)(priceHistory);
            const priceChanges = (0, marketAnalyzer_1.computePriceChanges)(priceHistory);
            const volatility = (0, marketAnalyzer_1.computeVolatility)(priceHistory);
            const recoveryMetrics = (0, marketAnalyzer_1.computeRecoveryMetrics)(priceHistory);
            const liquidityScore = (0, predictionEngine_1.computeLiquidityScore)(priceHistory, currentPrice, volatility);
            const dataQualityScore = (0, predictionEngine_1.computeDataQualityScore)(priceHistory);
            const trendScore = (0, predictionEngine_1.computeTrendScore)(priceChanges, movingAverages, currentPrice);
            const recoveryScore = (0, predictionEngine_1.computeRecoveryScore)(recoveryMetrics, priceChanges);
            const demandScore = (0, predictionEngine_1.computeDemandScore)(card.rarity, card.cardNumber);
            const riskScore = (0, predictionEngine_1.computeRiskScore)(volatility, priceChanges, movingAverages, 0);
            const scores = {
                trendScore, recoveryScore, demandScore, riskScore,
                externalSignalScore: 0,
                liquidityScore,
                dataQualityScore,
            };
            const expectedReturns = (0, predictionEngine_1.computeExpectedReturns)(scores);
            const predictedReturn = expectedReturnForWindow(expectedReturns, windowDays);
            const futurePrice = await fetchFuturePrice(uid, backtestDate, windowDays);
            let actualReturn = null;
            let error = null;
            let directionCorrect = null;
            if (futurePrice && futurePrice > 0) {
                actualReturn = (futurePrice - currentPrice) / currentPrice;
                if (predictedReturn !== 0 && actualReturn !== 0) {
                    const predictedDir = predictedReturn > 0;
                    const actualDir = actualReturn > 0;
                    directionCorrect = predictedDir === actualDir;
                    if (directionCorrect)
                        totalDirectionalCorrect++;
                    totalDirectionalTests++;
                }
                error = Math.abs(predictedReturn - actualReturn);
                totalMape += Math.abs(error);
                totalMapeCount++;
                returns.push(actualReturn);
            }
            const category = (0, predictionEngine_1.determineCategory)(scores, expectedReturns.expected90dReturn, priceChanges, recoveryMetrics);
            cardResults.push({
                cardId: card.cardId,
                cardName: card.cardName,
                currentPrice,
                predictedReturn,
                actualReturn,
                error,
                directionCorrect,
                category,
                liquidityScore,
                dataQualityScore,
                riskScore,
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
        .filter(r => r.predictedReturn !== null)
        .sort((a, b) => b.predictedReturn - a.predictedReturn)
        .slice(0, 10);
    const top10AvgReturn = top10.length > 0
        ? top10.reduce((s, r) => { var _a; return s + ((_a = r.actualReturn) !== null && _a !== void 0 ? _a : 0); }, 0) / top10.length
        : null;
    const withActualReturns = cardResults.filter(r => r.actualReturn !== null);
    const marketAvgReturn = withActualReturns.length > 0
        ? withActualReturns.reduce((s, r) => { var _a; return s + ((_a = r.actualReturn) !== null && _a !== void 0 ? _a : 0); }, 0) / withActualReturns.length
        : null;
    // Compute market benchmark from all tested cards' price histories
    const allHistories = [];
    for (const card of cards) {
        try {
            const uid = card.uniqueIdentifier;
            if (!uid)
                continue;
            const history = await fetchPriceHistoryUpToDate(uid, backtestDate);
            if (history.length >= windowDays + 1) {
                allHistories.push(history);
            }
        }
        catch (_a) {
            // skip failed fetches
        }
    }
    const benchmark = (0, marketAnalyzer_1.computeMarketBenchmark)(allHistories, windowDays);
    const strongBuyCards = cardResults.filter(r => r.category === 'strong_buy');
    const strongBuyFalsePositive = strongBuyCards.filter(r => r.actualReturn !== null && r.actualReturn < 0);
    const strongBuyFalsePositiveRate = strongBuyCards.length > 0
        ? strongBuyFalsePositive.length / strongBuyCards.length
        : null;
    const avoidCards = cardResults.filter(r => r.category === 'avoid' && r.actualReturn !== null);
    const avoidAvgReturn = avoidCards.length > 0
        ? avoidCards.reduce((s, r) => { var _a; return s + ((_a = r.actualReturn) !== null && _a !== void 0 ? _a : 0); }, 0) / avoidCards.length
        : null;
    const winRate = returns.length > 0 ? returns.filter(r => r > 0).length / returns.length : null;
    const gains = returns.filter(r => r > 0);
    const losses = returns.filter(r => r < 0).map(r => Math.abs(r));
    const avgGain = gains.length > 0 ? gains.reduce((a, b) => a + b, 0) / gains.length : 0;
    const avgLoss = losses.length > 0 ? losses.reduce((a, b) => a + b, 0) / losses.length : 0;
    const profitFactor = avgLoss > 0 ? avgGain / avgLoss : null;
    let sharpeRatio = null;
    let maxDrawdown = null;
    if (returns.length > 1) {
        const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
        const variance = returns.reduce((a, r) => a + (r - mean) ** 2, 0) / returns.length;
        const stdDev = Math.sqrt(variance);
        // Annualize based on the actual window period (default 90 days)
        const annualizationFactor = Math.sqrt(365 / windowDays);
        sharpeRatio = stdDev > 0 ? (mean / stdDev) * annualizationFactor : null;
        let peak = 0;
        let maxDd = 0;
        let cumulative = 0;
        for (const r of returns) {
            cumulative += r;
            if (cumulative > peak)
                peak = cumulative;
            const drawdown = peak - cumulative;
            if (drawdown > maxDd)
                maxDd = drawdown;
        }
        maxDrawdown = maxDd;
    }
    const categories = ['strong_buy', 'watch_dip', 'recovery', 'momentum', 'stagnant', 'avoid', 'downtrend'];
    const categoryPerformance = categories.map(cat => {
        const catCards = cardResults.filter(r => r.category === cat && r.actualReturn !== null);
        const count = catCards.length;
        const avgReturn = count > 0 ? catCards.reduce((s, r) => { var _a; return s + ((_a = r.actualReturn) !== null && _a !== void 0 ? _a : 0); }, 0) / count : 0;
        const avgPredictedReturn = count > 0
            ? catCards.filter(r => r.predictedReturn !== null).reduce((s, r) => s + r.predictedReturn, 0) / count
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
        marketMedianReturn: benchmark.medianReturn,
        marketReturnStdDev: benchmark.returnStdDev,
        strongBuyFalsePositiveRate,
        avoidAvgReturn,
        sharpeRatio,
        maxDrawdown,
        winRate,
        profitFactor,
        categoryPerformance,
        cardResults,
    };
    await saveBacktestResult(result);
    return result;
}
async function saveBacktestResult(result) {
    const db = (0, database_1.getDb)();
    await new Promise((resolve, reject) => {
        db.run(`INSERT INTO backtest_runs
       (backtest_date, window_days, cards_tested, directional_accuracy, mape,
        top10_avg_return, market_avg_return, strong_buy_false_positive_rate,
        avoid_avg_return, sharpe_ratio, max_drawdown, win_rate, profit_factor,
        category_performance, market_median_return, market_return_std_dev)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
            result.backtestDate,
            result.windowDays,
            result.cardsTested,
            result.directionalAccuracy,
            result.mape,
            result.top10AvgReturn,
            result.marketAvgReturn,
            result.strongBuyFalsePositiveRate,
            result.avoidAvgReturn,
            result.sharpeRatio,
            result.maxDrawdown,
            result.winRate,
            result.profitFactor,
            JSON.stringify(result.categoryPerformance),
            result.marketMedianReturn,
            result.marketReturnStdDev,
        ], function (err) {
            if (err)
                reject(err);
            else
                resolve();
        });
    });
}
async function getBacktestResults() {
    const db = (0, database_1.getDb)();
    return new Promise((resolve, reject) => {
        db.all(`SELECT * FROM backtest_runs ORDER BY created_at DESC LIMIT 20`, [], (err, rows) => {
            if (err)
                return reject(err);
            resolve(rows.map(r => ({
                ...r,
                category_performance: (() => {
                    try {
                        return r.category_performance ? JSON.parse(r.category_performance) : [];
                    }
                    catch (_a) {
                        return [];
                    }
                })(),
            })));
        });
    });
}
/**
 * Walk-forward validation: runs backtests at multiple historical cutoff dates
 * to measure model consistency across different market regimes.
 * Returns rolling metrics for each window and aggregate statistics.
 */
async function runWalkForwardValidation(windowDays = 90, numWindows = 6, windowSpacingDays = 30, filter = predictionEngine_1.DEFAULT_CARD_QUALITY_FILTER) {
    const db = (0, database_1.getDb)();
    // Determine date range from available data
    const dateRange = await new Promise((resolve, reject) => {
        db.get(`SELECT MIN(date) as minDate, MAX(date) as maxDate FROM price_history
       WHERE source IN ('tcgcsv', 'tcgdex', 'catalog_fallback')`, [], (err, row) => {
            if (err)
                return reject(err);
            resolve({ minDate: (row === null || row === void 0 ? void 0 : row.minDate) || '2023-01-01', maxDate: (row === null || row === void 0 ? void 0 : row.maxDate) || new Date().toISOString().split('T')[0] });
        });
    });
    const maxCutoff = new Date(dateRange.maxDate);
    const cutoffDates = [];
    for (let i = 0; i < numWindows; i++) {
        const cutoff = new Date(maxCutoff);
        cutoff.setDate(cutoff.getDate() - i * windowSpacingDays);
        // Ensure we have enough history before the cutoff
        const minRequired = new Date(dateRange.minDate);
        minRequired.setDate(minRequired.getDate() + windowDays + 30);
        if (cutoff < minRequired)
            break;
        cutoffDates.push(cutoff.toISOString().split('T')[0]);
    }
    const windows = [];
    for (const cutoffDate of cutoffDates) {
        try {
            const backtestResult = await runBacktest(cutoffDate, windowDays, undefined, filter);
            windows.push({
                cutoffDate,
                directionalAccuracy: backtestResult.directionalAccuracy,
                mape: backtestResult.mape,
                top10AvgReturn: backtestResult.top10AvgReturn,
                marketAvgReturn: backtestResult.marketAvgReturn,
                cardsTested: backtestResult.cardsTested,
            });
        }
        catch (err) {
            logger_1.logger.warn(`Walk-forward window ${cutoffDate} failed:`, err);
            windows.push({
                cutoffDate,
                directionalAccuracy: null,
                mape: null,
                top10AvgReturn: null,
                marketAvgReturn: null,
                cardsTested: 0,
            });
        }
    }
    // Compute aggregate metrics
    const validWindows = windows.filter(w => w.directionalAccuracy !== null);
    const avgDirectionalAccuracy = validWindows.length > 0
        ? validWindows.reduce((s, w) => s + w.directionalAccuracy, 0) / validWindows.length
        : null;
    const windowsWithMape = windows.filter(w => w.mape !== null);
    const avgMape = windowsWithMape.length > 0
        ? windowsWithMape.reduce((s, w) => s + w.mape, 0) / windowsWithMape.length
        : null;
    const windowsWithTop10 = windows.filter(w => w.top10AvgReturn !== null);
    const avgTop10Return = windowsWithTop10.length > 0
        ? windowsWithTop10.reduce((s, w) => s + w.top10AvgReturn, 0) / windowsWithTop10.length
        : null;
    const consistencyScore = validWindows.length > 0
        ? validWindows.filter(w => w.directionalAccuracy > 0.5).length / validWindows.length
        : null;
    return {
        windows,
        aggregateMetrics: {
            avgDirectionalAccuracy,
            avgMape,
            avgTop10Return,
            consistencyScore,
        },
    };
}
