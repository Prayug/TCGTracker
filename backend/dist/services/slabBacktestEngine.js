"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runSlabBacktest = runSlabBacktest;
exports.getSlabBacktestResults = getSlabBacktestResults;
const database_1 = require("../db/database");
const logger_1 = require("../utils/logger");
const marketAnalyzer_1 = require("./marketAnalyzer");
const validationMetrics_1 = require("./validationMetrics");
const predictionEngine_1 = require("./predictionEngine");
const returnCalibration_1 = require("./returnCalibration");
const backtestEngine_1 = require("./backtestEngine");
const slabPredictionEngine_1 = require("./slabPredictionEngine");
function addDays(isoDate, days) {
    const d = new Date(isoDate + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().split('T')[0];
}
async function fetchFutureSlabPrice(cardId, startDate, daysAhead) {
    var _a;
    const target = addDays(startDate, daysAhead);
    const slack = addDays(target, 14);
    const db = (0, database_1.getDb)();
    const row = await new Promise((resolve, reject) => {
        db.get(`SELECT price FROM graded_price_history
       WHERE cardId = ?
         AND LOWER(grader) = 'psa'
         AND grade = '10'
         AND price > 0
         AND date >= ?
         AND date <= ?
       ORDER BY date ASC
       LIMIT 1`, [cardId, target, slack], (err, r) => (err ? reject(err) : resolve(r)));
    });
    return (_a = row === null || row === void 0 ? void 0 : row.price) !== null && _a !== void 0 ? _a : null;
}
async function runSlabBacktest(backtestDate, windowDays = 90, cardIds, calibrationModels) {
    const models = calibrationModels !== null && calibrationModels !== void 0 ? calibrationModels : (await (0, returnCalibration_1.getCalibrationModels)());
    const universe = await (0, slabPredictionEngine_1.fetchSlabUniverse)(slabPredictionEngine_1.SLAB_QUALITY_FILTER);
    const cards = cardIds && cardIds.length > 0
        ? universe.filter((c) => cardIds.includes(c.cardId))
        : universe;
    const cardResults = [];
    let totalDirectionalCorrect = 0;
    let totalDirectionalTests = 0;
    let totalMape = 0;
    let totalMapeCount = 0;
    const returns = [];
    const allHistories = [];
    for (const card of cards) {
        try {
            const rawHistory = await (0, slabPredictionEngine_1.fetchPsa10HistoryUpTo)(card.cardId, backtestDate);
            const priceHistory = (0, predictionEngine_1.dedupePriceHistoryByDate)(rawHistory);
            if (priceHistory.length < slabPredictionEngine_1.SLAB_MIN_DATA_POINTS)
                continue;
            const currentPrice = (0, marketAnalyzer_1.getLatestPrice)(priceHistory);
            if (!currentPrice || currentPrice <= 0)
                continue;
            if (currentPrice < slabPredictionEngine_1.SLAB_QUALITY_FILTER.minPrice || currentPrice > slabPredictionEngine_1.SLAB_QUALITY_FILTER.maxPrice)
                continue;
            if (!(0, predictionEngine_1.hasMeaningfulPriceMovement)(priceHistory, 3))
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
                trendScore,
                recoveryScore,
                demandScore,
                riskScore,
                externalSignalScore: 0,
                liquidityScore,
                dataQualityScore,
            };
            const expectedReturns = (0, predictionEngine_1.computeExpectedReturns)(scores, 0, models);
            const predictedReturn = (0, backtestEngine_1.expectedReturnForWindow)(expectedReturns, windowDays);
            const futurePrice = await fetchFutureSlabPrice(card.cardId, backtestDate, windowDays);
            let actualReturn = null;
            let error = null;
            let directionCorrect = null;
            if (futurePrice && futurePrice > 0) {
                actualReturn = (futurePrice - currentPrice) / currentPrice;
                if (predictedReturn !== 0 && actualReturn !== 0) {
                    directionCorrect = (predictedReturn > 0) === (actualReturn > 0);
                    if (directionCorrect)
                        totalDirectionalCorrect++;
                    totalDirectionalTests++;
                }
                error = Math.abs(predictedReturn - actualReturn);
                totalMape += error;
                totalMapeCount++;
                returns.push(actualReturn);
            }
            const category = (0, predictionEngine_1.determineCategory)(scores, expectedReturns.expected90dReturn, priceChanges, recoveryMetrics, (0, returnCalibration_1.strongBuyThresholdForHorizon)(90, models));
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
                signalScore: expectedReturns.rawSignal,
            });
            if (priceHistory.length >= windowDays + 1) {
                allHistories.push(priceHistory);
            }
        }
        catch (err) {
            logger_1.logger.warn(`Slab backtest failed for ${card.cardName}:`, err);
        }
    }
    const cardsTested = cardResults.length;
    const directionalAccuracy = totalDirectionalTests > 0 ? totalDirectionalCorrect / totalDirectionalTests : null;
    const mape = totalMapeCount > 0 ? totalMape / totalMapeCount : null;
    const top10 = [...cardResults]
        .filter((r) => r.actualReturn !== null)
        .sort((a, b) => b.predictedReturn - a.predictedReturn)
        .slice(0, 10);
    const top10AvgReturn = top10.length > 0
        ? top10.reduce((s, r) => s + r.actualReturn, 0) / top10.length
        : null;
    const withActualReturns = cardResults.filter((r) => r.actualReturn !== null);
    const marketAvgReturn = withActualReturns.length > 0
        ? withActualReturns.reduce((s, r) => s + r.actualReturn, 0) / withActualReturns.length
        : null;
    const benchmark = (0, marketAnalyzer_1.computeMarketBenchmark)(allHistories, windowDays);
    const strongBuyCards = cardResults.filter((r) => r.category === 'strong_buy');
    const strongBuyFalsePositiveRate = strongBuyCards.length > 0
        ? strongBuyCards.filter((r) => r.actualReturn !== null && r.actualReturn < 0).length / strongBuyCards.length
        : null;
    const avoidCards = cardResults.filter((r) => r.category === 'avoid' && r.actualReturn !== null);
    const avoidAvgReturn = avoidCards.length > 0
        ? avoidCards.reduce((s, r) => { var _a; return s + ((_a = r.actualReturn) !== null && _a !== void 0 ? _a : 0); }, 0) / avoidCards.length
        : null;
    const winRate = returns.length > 0 ? returns.filter((r) => r > 0).length / returns.length : null;
    const gains = returns.filter((r) => r > 0);
    const losses = returns.filter((r) => r < 0).map((r) => Math.abs(r));
    const avgGain = gains.length > 0 ? gains.reduce((a, b) => a + b, 0) / gains.length : 0;
    const avgLoss = losses.length > 0 ? losses.reduce((a, b) => a + b, 0) / losses.length : 0;
    const profitFactor = avgLoss > 0 ? avgGain / avgLoss : null;
    let sharpeRatio = null;
    let maxDrawdown = null;
    if (returns.length > 1) {
        const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
        const variance = returns.reduce((a, r) => a + (r - mean) ** 2, 0) / returns.length;
        const stdDev = Math.sqrt(variance);
        sharpeRatio = stdDev > 0 ? (mean / stdDev) * Math.sqrt(365 / windowDays) : null;
        let peak = 1;
        let value = 1;
        let maxDd = 0;
        for (const r of returns) {
            value *= 1 + r;
            if (value > peak)
                peak = value;
            const drawdown = (peak - value) / peak;
            if (drawdown > maxDd)
                maxDd = drawdown;
        }
        maxDrawdown = maxDd;
    }
    const metrics = (0, validationMetrics_1.computeValidationMetrics)(withActualReturns.map((r) => ({ predicted: r.predictedReturn, actual: r.actualReturn })));
    const baselineAvgReturn = marketAvgReturn;
    const modelAlpha = top10AvgReturn !== null && baselineAvgReturn !== null
        ? top10AvgReturn - baselineAvgReturn
        : null;
    const categories = [
        'strong_buy', 'watch_dip', 'recovery', 'momentum', 'stagnant', 'avoid', 'downtrend',
    ];
    const categoryPerformance = categories.map((cat) => {
        const catCards = cardResults.filter((r) => r.category === cat && r.actualReturn !== null);
        const count = catCards.length;
        const avgReturn = count > 0 ? catCards.reduce((s, r) => { var _a; return s + ((_a = r.actualReturn) !== null && _a !== void 0 ? _a : 0); }, 0) / count : 0;
        const avgPredictedReturn = count > 0
            ? catCards.reduce((s, r) => s + r.predictedReturn, 0) / count
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
        rankIC: metrics.rankIC,
        meanBias: metrics.meanBias,
        hitRate: metrics.hitRate,
        baselineAvgReturn,
        modelAlpha,
    };
    await saveSlabBacktestResult(result);
    return result;
}
async function saveSlabBacktestResult(result) {
    const db = (0, database_1.getDb)();
    await new Promise((resolve, reject) => {
        db.run(`INSERT INTO slab_backtest_runs
       (backtest_date, window_days, cards_tested, directional_accuracy, mape,
        top10_avg_return, market_avg_return, strong_buy_false_positive_rate,
        avoid_avg_return, sharpe_ratio, max_drawdown, win_rate, profit_factor,
        category_performance, market_median_return, market_return_std_dev,
        rank_ic, mean_bias, baseline_avg_return, hit_rate)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
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
            result.rankIC,
            result.meanBias,
            result.baselineAvgReturn,
            result.hitRate,
        ], (err) => (err ? reject(err) : resolve()));
    });
}
async function getSlabBacktestResults() {
    const db = (0, database_1.getDb)();
    return new Promise((resolve, reject) => {
        db.all(`SELECT * FROM slab_backtest_runs ORDER BY created_at DESC LIMIT 20`, [], (err, rows) => {
            if (err)
                return reject(err);
            resolve((rows || []).map((r) => {
                var _a, _b, _c, _d;
                return ({
                    id: r.id,
                    backtestDate: r.backtest_date,
                    windowDays: r.window_days,
                    cardsTested: r.cards_tested,
                    directionalAccuracy: r.directional_accuracy,
                    mape: r.mape,
                    top10AvgReturn: r.top10_avg_return,
                    marketAvgReturn: r.market_avg_return,
                    marketMedianReturn: r.market_median_return,
                    marketReturnStdDev: r.market_return_std_dev,
                    strongBuyFalsePositiveRate: r.strong_buy_false_positive_rate,
                    avoidAvgReturn: r.avoid_avg_return,
                    sharpeRatio: r.sharpe_ratio,
                    maxDrawdown: r.max_drawdown,
                    winRate: r.win_rate,
                    profitFactor: r.profit_factor,
                    rankIC: (_a = r.rank_ic) !== null && _a !== void 0 ? _a : null,
                    meanBias: (_b = r.mean_bias) !== null && _b !== void 0 ? _b : null,
                    hitRate: (_c = r.hit_rate) !== null && _c !== void 0 ? _c : null,
                    baselineAvgReturn: (_d = r.baseline_avg_return) !== null && _d !== void 0 ? _d : null,
                    modelAlpha: r.baseline_avg_return != null && r.top10_avg_return != null
                        ? r.top10_avg_return - r.baseline_avg_return
                        : null,
                    categoryPerformance: (() => {
                        try {
                            return r.category_performance ? JSON.parse(r.category_performance) : [];
                        }
                        catch (_a) {
                            return [];
                        }
                    })(),
                });
            }));
        });
    });
}
