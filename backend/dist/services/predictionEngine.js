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
exports.computeTrendScore = computeTrendScore;
exports.computeRecoveryScore = computeRecoveryScore;
exports.computeDemandScore = computeDemandScore;
exports.computeRiskScore = computeRiskScore;
exports.computeExternalSignalScore = computeExternalSignalScore;
exports.computeExpectedReturns = computeExpectedReturns;
exports.computePriceRanges = computePriceRanges;
exports.determineCategory = determineCategory;
exports.generateSuggestedAction = generateSuggestedAction;
exports.generateExplanation = generateExplanation;
exports.generateRiskFactors = generateRiskFactors;
exports.predictSingleCard = predictSingleCard;
exports.runPredictions = runPredictions;
exports.getLatestPredictions = getLatestPredictions;
const database_1 = require("../db/database");
const logger_1 = require("../utils/logger");
const marketAnalyzer_1 = require("./marketAnalyzer");
const externalSignalService_1 = require("./externalSignalService");
const MODEL_VERSION = '1.0.0';
/** One mapping row per cardId — images are persisted on card_mappings by the backfill pipeline. */
const CARD_METADATA_JOIN = `
  LEFT JOIN (
    SELECT
      cm.cardId,
      MIN(cm.cardName) AS cardName,
      MIN(cm.setName) AS setName,
      MIN(cm.setId) AS setId,
      MIN(cm.cardNumber) AS cardNumber,
      MIN(cm.rarity) AS rarity,
      MIN(COALESCE(NULLIF(cm.imageLarge, ''), NULLIF(cm.image_large, ''))) AS imageLarge,
      MIN(COALESCE(NULLIF(cm.imageSmall, ''), NULLIF(cm.image_small, ''))) AS imageSmall,
      MIN(COALESCE(cm.tcgplayerProductId, CAST(cm.productId AS TEXT))) AS tcgplayerProductId
    FROM card_mappings cm
    GROUP BY cm.cardId
  ) cm ON cm.cardId = cp.card_id
`;
function computeTrendScore(priceChanges, movingAverages, currentPrice) {
    if (!currentPrice || currentPrice <= 0)
        return 0;
    let score = 50;
    if (priceChanges.change30d !== null) {
        if (priceChanges.change30d > 20)
            score += 25;
        else if (priceChanges.change30d > 10)
            score += 15;
        else if (priceChanges.change30d > 5)
            score += 8;
        else if (priceChanges.change30d > 0)
            score += 3;
        else if (priceChanges.change30d < -20)
            score -= 25;
        else if (priceChanges.change30d < -10)
            score -= 15;
        else if (priceChanges.change30d < -5)
            score -= 8;
        else
            score -= 3;
    }
    if (priceChanges.change90d !== null) {
        if (priceChanges.change90d > 30)
            score += 20;
        else if (priceChanges.change90d > 15)
            score += 12;
        else if (priceChanges.change90d > 5)
            score += 5;
        else if (priceChanges.change90d < -30)
            score -= 20;
        else if (priceChanges.change90d < -15)
            score -= 12;
        else if (priceChanges.change90d < -5)
            score -= 5;
    }
    if (movingAverages.ma7 !== null && movingAverages.ma30 !== null && movingAverages.ma30 > 0) {
        const maRatio = movingAverages.ma7 / movingAverages.ma30;
        if (maRatio > 1.05)
            score += 15;
        else if (maRatio > 1.02)
            score += 8;
        else if (maRatio < 0.95)
            score -= 15;
        else if (maRatio < 0.98)
            score -= 8;
    }
    if (movingAverages.ma30 !== null && movingAverages.ma90 !== null && movingAverages.ma90 > 0) {
        const maRatio = movingAverages.ma30 / movingAverages.ma90;
        if (maRatio > 1.05)
            score += 10;
        else if (maRatio < 0.95)
            score -= 10;
    }
    return Math.max(0, Math.min(100, score));
}
function computeRecoveryScore(recoveryMetrics, priceChanges) {
    let score = 50;
    if (recoveryMetrics.recentDrop !== null && recoveryMetrics.recentDrop < -15) {
        score += 20;
        if (recoveryMetrics.hasStabilized) {
            score += 20;
        }
        if (recoveryMetrics.daysSinceBottom !== null && recoveryMetrics.daysSinceBottom > 0) {
            if (recoveryMetrics.daysSinceBottom <= 7)
                score += 10;
            else if (recoveryMetrics.daysSinceBottom <= 14)
                score += 5;
        }
        if (recoveryMetrics.priorRecoveryPattern) {
            score += 15;
        }
        if (priceChanges.change7d !== null && priceChanges.change7d > 0) {
            score += 10;
        }
    }
    else if (recoveryMetrics.recentDrop !== null && recoveryMetrics.recentDrop < -5) {
        score += 10;
        if (recoveryMetrics.hasStabilized)
            score += 10;
    }
    return Math.max(0, Math.min(100, score));
}
function computeDemandScore(rarity, cardNumber) {
    let score = 50;
    if (rarity) {
        const lowerRarity = rarity.toLowerCase();
        if (lowerRarity.includes('secret') || lowerRarity.includes('rainbow') || lowerRarity.includes('gold')) {
            score += 20;
        }
        else if (lowerRarity.includes('ultra') || lowerRarity.includes('alt')) {
            score += 15;
        }
        else if (lowerRarity.includes('holo') || lowerRarity.includes('vmax') || lowerRarity.includes('vstar')) {
            score += 10;
        }
        else if (lowerRarity.includes('rare')) {
            score += 5;
        }
    }
    if (cardNumber) {
        if (cardNumber.toUpperCase().startsWith('TG'))
            score += 10;
        const num = parseInt(cardNumber, 10);
        if (!isNaN(num) && num > 200)
            score += 5;
    }
    return Math.max(0, Math.min(100, score));
}
function computeRiskScore(volatility, priceChanges, movingAverages, externalSignalScore) {
    let score = 30;
    if (volatility.monthlyVolatility > 0.3)
        score += 25;
    else if (volatility.monthlyVolatility > 0.2)
        score += 15;
    else if (volatility.monthlyVolatility > 0.1)
        score += 8;
    else
        score -= 5;
    if (priceChanges.change7d !== null && priceChanges.change7d > 30) {
        score += 20;
    }
    else if (priceChanges.change7d !== null && priceChanges.change7d > 15) {
        score += 10;
    }
    if (priceChanges.change30d !== null && priceChanges.change30d > 50) {
        score += 15;
    }
    else if (priceChanges.change30d !== null && priceChanges.change30d > 30) {
        score += 8;
    }
    if (movingAverages.ma7 !== null && movingAverages.ma30 !== null && movingAverages.ma30 > 0) {
        const spread = Math.abs(movingAverages.ma7 - movingAverages.ma30) / movingAverages.ma30;
        if (spread > 0.15)
            score += 10;
    }
    if (externalSignalScore < 0) {
        score += Math.abs(externalSignalScore);
    }
    return Math.max(0, Math.min(100, score));
}
function computeExternalSignalScore(signals) {
    if (signals.length === 0)
        return 0;
    let totalScore = 0;
    for (const signal of signals) {
        if (signal.type === 'reprint')
            totalScore -= 15;
        else if (signal.type === 'upcoming_set')
            totalScore += 8;
        else if (signal.type === 'tournament_meta')
            totalScore += 10;
        else if (signal.type === 'character_hype')
            totalScore += 10;
        else if (signal.type === 'influencer')
            totalScore -= 5;
        else if (signal.type === 'manipulation')
            totalScore -= 20;
        else if (signal.type === 'buyout')
            totalScore -= 10;
        else if (signal.type === 'announcement')
            totalScore += 5;
        else if (signal.type === 'leak')
            totalScore += 3;
        if (signal.sentiment > 0)
            totalScore += signal.sentiment * 5;
        else if (signal.sentiment < 0)
            totalScore += signal.sentiment * 5;
    }
    return Math.max(-30, Math.min(20, totalScore));
}
function computeExpectedReturns(scores, currentPrice) {
    const trendN = scores.trendScore / 100;
    const recoveryN = scores.recoveryScore / 100;
    const demandN = scores.demandScore / 100;
    const externalN = (scores.externalSignalScore + 30) / 50;
    const riskN = scores.riskScore / 100;
    const raw30d = 0.30 * trendN +
        0.25 * recoveryN +
        0.20 * demandN +
        0.15 * externalN -
        0.10 * riskN;
    const scaled30d = (raw30d - 0.5) * 0.4;
    const expected30dReturn = scaled30d;
    const expected7dReturn = scaled30d * 0.35;
    const expected90dReturn = scaled30d * 1.8;
    return { expected7dReturn, expected30dReturn, expected90dReturn };
}
function computePriceRanges(currentPrice, expectedReturn, volatility, days, confidence) {
    const mid = currentPrice * (1 + expectedReturn);
    const confidenceFactor = (100 - confidence + 50) / 100;
    const volAdjustment = volatility * Math.sqrt(days / 365) * 1.96 * confidenceFactor;
    const low = mid * (1 - volAdjustment);
    const high = mid * (1 + volAdjustment);
    return {
        low: Math.round(low * 100) / 100,
        mid: Math.round(mid * 100) / 100,
        high: Math.round(high * 100) / 100,
    };
}
function determineCategory(scores, expected90dReturn, priceChanges, recoveryMetrics) {
    var _a;
    if (expected90dReturn >= 0.20 && scores.riskScore < 65) {
        return 'strong_buy';
    }
    if (expected90dReturn >= 0.10 && expected90dReturn < 0.20 && scores.riskScore < 70) {
        return 'watch_dip';
    }
    if (recoveryMetrics.recentDrop !== null && recoveryMetrics.recentDrop <= -15 && recoveryMetrics.hasStabilized) {
        return 'recovery';
    }
    if (priceChanges.change30d !== null && priceChanges.change30d >= 10) {
        return 'momentum';
    }
    if (scores.riskScore > 75) {
        return 'avoid';
    }
    if (priceChanges.change90d !== null && priceChanges.change90d <= -15) {
        return 'downtrend';
    }
    const changeMagnitude = Math.abs((_a = priceChanges.change90d) !== null && _a !== void 0 ? _a : 0);
    if (changeMagnitude < 5) {
        return 'stagnant';
    }
    return expected90dReturn > 0 ? 'watch_dip' : 'stagnant';
}
function generateSuggestedAction(category, scores) {
    switch (category) {
        case 'strong_buy':
            return 'Buy at current levels';
        case 'watch_dip':
            return 'Watch / Buy on dips';
        case 'recovery':
            return 'Buy near support levels';
        case 'momentum':
            return 'Hold / Take partial profits';
        case 'stagnant':
            return 'Hold no position / Look elsewhere';
        case 'avoid':
            return 'Avoid / Reduce position';
        case 'downtrend':
            return 'Sell / Avoid';
    }
}
function generateExplanation(category, scores, priceChanges, recoveryMetrics, movingAverages, currentPrice, externalSignals) {
    const parts = [];
    const hasExternal = externalSignals && externalSignals !== '[]' && !externalSignals.includes('unavailable');
    if (scores.trendScore > 60) {
        if (priceChanges.change90d !== null && priceChanges.change90d > 0) {
            parts.push(`Up ${priceChanges.change90d.toFixed(0)}% over 90 days`);
        }
        if (movingAverages.ma7 !== null && movingAverages.ma30 !== null && movingAverages.ma30 > 0) {
            const maRatio = ((movingAverages.ma7 - movingAverages.ma30) / movingAverages.ma30 * 100);
            if (Math.abs(maRatio) > 2) {
                parts.push(`price is ${maRatio > 0 ? 'above' : 'below'} its 30-day moving average by ${Math.abs(maRatio).toFixed(1)}%`);
            }
        }
    }
    if (category === 'recovery' && recoveryMetrics.recentDrop !== null) {
        parts.push(`dropped ${Math.abs(recoveryMetrics.recentDrop).toFixed(0)}% recently`);
        if (recoveryMetrics.hasStabilized)
            parts.push('price has stabilized');
        if (recoveryMetrics.priorRecoveryPattern)
            parts.push('similar past drops recovered strongly');
    }
    if (category === 'momentum' && priceChanges.change30d !== null && priceChanges.change30d > 10) {
        parts.push(`strong ${priceChanges.change30d.toFixed(0)}% gain over 30 days`);
    }
    if (category === 'avoid' && scores.riskScore > 75) {
        parts.push('high volatility and risk score');
    }
    if (category === 'downtrend') {
        if (movingAverages.ma30 !== null && movingAverages.ma90 !== null && movingAverages.ma90 > 0) {
            if (movingAverages.ma30 < movingAverages.ma90) {
                parts.push('price below both 30-day and 90-day moving averages');
            }
        }
        if (priceChanges.change90d !== null) {
            parts.push(`down ${Math.abs(priceChanges.change90d).toFixed(0)}% over 90 days`);
        }
    }
    if (category === 'stagnant') {
        parts.push('minimal price movement with no clear trend');
    }
    if (hasExternal) {
        parts.push('external signals analyzed');
    }
    if (parts.length === 0) {
        return 'No clear signals detected. Prediction is based on available historical price data.';
    }
    return parts.join('. ') + '.';
}
function generateRiskFactors(scores, volatility, priceChanges, externalSignals) {
    const risks = [];
    if (scores.riskScore > 70)
        risks.push('high overall risk');
    if (volatility.monthlyVolatility > 0.2)
        risks.push('high price volatility');
    if (priceChanges.change7d !== null && priceChanges.change7d > 20) {
        risks.push('recent pump may be unsustainable');
    }
    const hasExternal = externalSignals && externalSignals !== '[]' && !externalSignals.includes('unavailable');
    if (hasExternal && externalSignals.includes('reprint')) {
        risks.push('possible reprint risk');
    }
    if (risks.length === 0) {
        return 'Low identifiable risk factors.';
    }
    return risks.join('; ') + '.';
}
function fetchCardPriceHistory(uniqueIdentifier) {
    const db = (0, database_1.getDb)();
    return new Promise((resolve, reject) => {
        db.all(`SELECT date, price, marketPrice, volume FROM price_history
       WHERE uniqueIdentifier = ? AND source IN ('tcgcsv', 'tcgdex', 'catalog_fallback')
       ORDER BY date ASC`, [uniqueIdentifier], (err, rows) => {
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
function fetchAllCards() {
    const db = (0, database_1.getDb)();
    return new Promise((resolve, reject) => {
        db.all(`SELECT cm.cardId, cm.cardName, cm.setId, cm.setName, cm.cardNumber, cm.rarity,
              cm.uniqueIdentifier
       FROM card_mappings cm
       WHERE cm.cardName IS NOT NULL AND TRIM(cm.cardName) <> ''
       ORDER BY cm.cardName ASC`, [], (err, rows) => {
            if (err)
                return reject(err);
            resolve(rows || []);
        });
    });
}
function predictSingleCard(card, allCardReturns) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const uid = card.uniqueIdentifier;
            if (!uid)
                return null;
            const priceHistory = yield fetchCardPriceHistory(uid);
            if (priceHistory.length < 14)
                return null;
            const currentPrice = (0, marketAnalyzer_1.getLatestPrice)(priceHistory);
            if (!currentPrice || currentPrice <= 0)
                return null;
            const movingAverages = (0, marketAnalyzer_1.computeMovingAverages)(priceHistory);
            const priceChanges = (0, marketAnalyzer_1.computePriceChanges)(priceHistory);
            const volatility = (0, marketAnalyzer_1.computeVolatility)(priceHistory);
            const supportResistance = (0, marketAnalyzer_1.findSupportResistance)(priceHistory);
            const recoveryMetrics = (0, marketAnalyzer_1.computeRecoveryMetrics)(priceHistory);
            const externalSignals = yield (0, externalSignalService_1.searchExternalSignals)(card.cardName, card.setName);
            const externalSignalScore = computeExternalSignalScore(externalSignals);
            const trendScore = computeTrendScore(priceChanges, movingAverages, currentPrice);
            const recoveryScore = computeRecoveryScore(recoveryMetrics, priceChanges);
            const demandScore = computeDemandScore(card.rarity, card.cardNumber);
            const riskScore = computeRiskScore(volatility, priceChanges, movingAverages, externalSignalScore);
            const scores = {
                trendScore,
                recoveryScore,
                demandScore,
                riskScore,
                externalSignalScore,
            };
            const expectedReturns = computeExpectedReturns(scores, currentPrice);
            const baseConfidence = Math.max(20, Math.min(95, 50
                + (trendScore > 60 ? 10 : trendScore > 40 ? 5 : 0)
                + (priceHistory.length > 90 ? 15 : priceHistory.length > 30 ? 8 : 0)
                + (demandScore > 60 ? 10 : 0)
                - (riskScore > 70 ? 10 : riskScore > 50 ? 5 : 0)));
            const volatilityAdjust = volatility.monthlyVolatility;
            const confidenceScore = Math.max(10, Math.min(95, Math.round(baseConfidence * (1 - volatilityAdjust * 0.5))));
            const category = determineCategory(scores, expectedReturns.expected90dReturn, priceChanges, recoveryMetrics);
            const predicted7d = computePriceRanges(currentPrice, expectedReturns.expected7dReturn, volatility.dailyVolatility, 7, confidenceScore);
            const predicted30d = computePriceRanges(currentPrice, expectedReturns.expected30dReturn, volatility.dailyVolatility, 30, confidenceScore);
            const predicted90d = computePriceRanges(currentPrice, expectedReturns.expected90dReturn, volatility.dailyVolatility, 90, confidenceScore);
            const externalSignalsJson = JSON.stringify(externalSignals);
            const explanation = generateExplanation(category, scores, priceChanges, recoveryMetrics, movingAverages, currentPrice, externalSignalsJson);
            const riskFactors = generateRiskFactors(scores, volatility, priceChanges, externalSignalsJson);
            const suggestedAction = generateSuggestedAction(category, scores);
            return {
                cardId: card.cardId,
                cardName: card.cardName,
                setName: card.setName,
                setId: card.setId,
                cardNumber: card.cardNumber,
                rarity: card.rarity,
                currentPrice,
                predicted7d,
                predicted30d,
                predicted90d,
                expected7dReturn: expectedReturns.expected7dReturn,
                expected30dReturn: expectedReturns.expected30dReturn,
                expected90dReturn: expectedReturns.expected90dReturn,
                confidenceScore,
                riskScore,
                category,
                suggestedAction,
                explanation,
                riskFactors,
                externalSignals: externalSignalsJson,
                modelVersion: MODEL_VERSION,
            };
        }
        catch (err) {
            logger_1.logger.error(`Prediction failed for card ${card.cardId}:`, err);
            return null;
        }
    });
}
function runPredictions() {
    return __awaiter(this, void 0, void 0, function* () {
        const db = (0, database_1.getDb)();
        const runId = yield new Promise((resolve, reject) => {
            db.run(`INSERT INTO prediction_runs (model_version, notes) VALUES (?, ?)`, [MODEL_VERSION, 'Scheduled prediction run'], function (err) {
                if (err)
                    reject(err);
                else
                    resolve(this.lastID);
            });
        });
        const cards = yield fetchAllCards();
        let succeeded = 0;
        let failed = 0;
        const insertStmt = `INSERT INTO card_predictions (
    run_id, card_id, prediction_date, current_price,
    predicted_7d_low, predicted_7d_mid, predicted_7d_high,
    predicted_30d_low, predicted_30d_mid, predicted_30d_high,
    predicted_90d_low, predicted_90d_mid, predicted_90d_high,
    expected_7d_return, expected_30d_return, expected_90d_return,
    confidence_score, risk_score, category, suggested_action,
    explanation, risk_factors, external_signals_json, model_version
  ) VALUES (?, ?, date('now'), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
        for (const card of cards) {
            try {
                const prediction = yield predictSingleCard(card);
                if (!prediction) {
                    failed++;
                    continue;
                }
                yield new Promise((resolve, reject) => {
                    db.run(insertStmt, [
                        runId, prediction.cardId, prediction.currentPrice,
                        prediction.predicted7d.low, prediction.predicted7d.mid, prediction.predicted7d.high,
                        prediction.predicted30d.low, prediction.predicted30d.mid, prediction.predicted30d.high,
                        prediction.predicted90d.low, prediction.predicted90d.mid, prediction.predicted90d.high,
                        prediction.expected7dReturn, prediction.expected30dReturn, prediction.expected90dReturn,
                        prediction.confidenceScore, prediction.riskScore, prediction.category, prediction.suggestedAction,
                        prediction.explanation, prediction.riskFactors, prediction.externalSignals, prediction.modelVersion,
                    ], function (err) {
                        if (err)
                            reject(err);
                        else
                            resolve();
                    });
                });
                succeeded++;
            }
            catch (err) {
                logger_1.logger.warn(`Prediction failed for ${card.cardName}:`, err);
                failed++;
            }
        }
        logger_1.logger.info(`Prediction run ${runId} complete: ${succeeded} succeeded, ${failed} failed`);
        return { runId, total: cards.length, succeeded, failed };
    });
}
function getLatestPredictions() {
    return __awaiter(this, arguments, void 0, function* (limit = 100, category) {
        const db = (0, database_1.getDb)();
        let sql = `
    SELECT cp.*, cm.cardName, cm.setName, cm.setId, cm.cardNumber, cm.rarity,
           cm.imageSmall, cm.imageLarge, cm.tcgplayerProductId
    FROM card_predictions cp
    ${CARD_METADATA_JOIN}
    WHERE cp.run_id = (SELECT MAX(id) FROM prediction_runs)
  `;
        const params = [];
        if (category) {
            sql += ' AND cp.category = ?';
            params.push(category);
        }
        sql += ' ORDER BY cp.expected_90d_return DESC LIMIT ?';
        params.push(limit);
        return new Promise((resolve, reject) => {
            db.all(sql, params, (err, rows) => {
                if (err)
                    return reject(err);
                resolve(rows.map(r => ({
                    id: r.id,
                    cardId: r.card_id,
                    cardName: r.cardName || '',
                    setId: r.setId || '',
                    setName: r.setName || '',
                    cardNumber: r.cardNumber || '',
                    rarity: r.rarity || '',
                    imageSmall: r.imageSmall || undefined,
                    imageLarge: r.imageLarge || undefined,
                    tcgplayerProductId: r.tcgplayerProductId || undefined,
                    currentPrice: r.current_price,
                    predicted7dLow: r.predicted_7d_low,
                    predicted7dMid: r.predicted_7d_mid,
                    predicted7dHigh: r.predicted_7d_high,
                    predicted30dLow: r.predicted_30d_low,
                    predicted30dMid: r.predicted_30d_mid,
                    predicted30dHigh: r.predicted_30d_high,
                    predicted90dLow: r.predicted_90d_low,
                    predicted90dMid: r.predicted_90d_mid,
                    predicted90dHigh: r.predicted_90d_high,
                    expected7dReturn: r.expected_7d_return,
                    expected30dReturn: r.expected_30d_return,
                    expected90dReturn: r.expected_90d_return,
                    confidenceScore: r.confidence_score,
                    riskScore: r.risk_score,
                    category: r.category,
                    suggestedAction: r.suggested_action,
                    explanation: r.explanation,
                    riskFactors: r.risk_factors,
                    externalSignals: r.external_signals_json,
                    modelVersion: r.model_version,
                })));
            });
        });
    });
}
