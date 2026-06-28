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
exports.enrichCardsWithInvestmentData = enrichCardsWithInvestmentData;
const database_1 = require("../db/database");
const logger_1 = require("../utils/logger");
function mapCategoryToFlags(category) {
    switch (category) {
        case 'strong_buy':
        case 'recovery':
            return { isUndervalued: true, isOvervalued: false };
        case 'avoid':
        case 'downtrend':
            return { isUndervalued: false, isOvervalued: true };
        default:
            return { isUndervalued: false, isOvervalued: false };
    }
}
function mapReturnToTrend(expected30dReturn) {
    if (expected30dReturn > 10)
        return 'BULLISH';
    if (expected30dReturn < -10)
        return 'BEARISH';
    return 'NEUTRAL';
}
function mapRiskScoreToLevel(riskScore) {
    if (riskScore < 40)
        return 'LOW';
    if (riskScore <= 70)
        return 'MEDIUM';
    return 'HIGH';
}
function mapSuggestedAction(action) {
    const upper = (action === null || action === void 0 ? void 0 : action.toUpperCase()) || '';
    if (upper === 'BUY' || upper === 'STRONG BUY')
        return 'BUY';
    if (upper === 'SELL' || upper === 'AVOID')
        return 'SELL';
    if (upper === 'HOLD')
        return 'HOLD';
    return 'WATCH';
}
function computePriceChanges(prices) {
    if (prices.length === 0)
        return { change30d: 0, change90d: 0, change1y: 0 };
    const current = prices[prices.length - 1];
    if (!current || current <= 0)
        return { change30d: 0, change90d: 0, change1y: 0 };
    const getChange = (daysBack) => {
        const idx = Math.max(0, prices.length - 1 - daysBack);
        const past = prices[idx];
        if (!past || past <= 0)
            return 0;
        return ((current - past) / past) * 100;
    };
    return {
        change30d: getChange(30),
        change90d: getChange(90),
        change1y: getChange(365),
    };
}
function computeVolatility(prices) {
    if (prices.length < 7)
        return 0.1;
    const logReturns = [];
    for (let i = 1; i < prices.length; i++) {
        if (prices[i - 1] > 0 && prices[i] > 0) {
            logReturns.push(Math.log(prices[i] / prices[i - 1]));
        }
    }
    if (logReturns.length === 0)
        return 0.1;
    const mean = logReturns.reduce((a, b) => a + b, 0) / logReturns.length;
    const variance = logReturns.reduce((a, b) => a + (b - mean) ** 2, 0) / logReturns.length;
    return Math.sqrt(variance) * Math.sqrt(30); // monthly volatility
}
function computeFairValue(prices) {
    if (prices.length === 0)
        return 0;
    const recent = prices.slice(-30);
    return recent.reduce((a, b) => a + b, 0) / recent.length;
}
/**
 * Fetches card_mappings rows for the given card IDs, returning a map of cardId -> uniqueIdentifier.
 */
function fetchCardMappings(cardIds) {
    return __awaiter(this, void 0, void 0, function* () {
        const db = (0, database_1.getDb)();
        const map = new Map();
        if (cardIds.length === 0)
            return map;
        // Query in batches to avoid SQLITE_MAX_VARIABLE_NUMBER
        const BATCH_SIZE = 50;
        for (let i = 0; i < cardIds.length; i += BATCH_SIZE) {
            const batch = cardIds.slice(i, i + BATCH_SIZE);
            const placeholders = batch.map(() => '?').join(',');
            const rows = yield new Promise((resolve, reject) => {
                db.all(`SELECT cardId, uniqueIdentifier FROM card_mappings
         WHERE cardId IN (${placeholders})
         GROUP BY cardId`, batch, (err, rows) => {
                    if (err)
                        return reject(err);
                    resolve(rows || []);
                });
            });
            for (const row of rows) {
                if (row.cardId && row.uniqueIdentifier) {
                    map.set(row.cardId, row.uniqueIdentifier);
                }
            }
        }
        return map;
    });
}
/**
 * Fetches latest predictions for the given card IDs from the most recent prediction run.
 */
function fetchLatestPredictions(cardIds) {
    return __awaiter(this, void 0, void 0, function* () {
        const db = (0, database_1.getDb)();
        const map = new Map();
        if (cardIds.length === 0)
            return map;
        const BATCH_SIZE = 50;
        for (let i = 0; i < cardIds.length; i += BATCH_SIZE) {
            const batch = cardIds.slice(i, i + BATCH_SIZE);
            const placeholders = batch.map(() => '?').join(',');
            const rows = yield new Promise((resolve, reject) => {
                db.all(`SELECT card_id, current_price, expected_30d_return, expected_90d_return,
                confidence_score, risk_score, category, suggested_action
         FROM card_predictions
         WHERE card_id IN (${placeholders})
           AND run_id = (SELECT MAX(id) FROM prediction_runs)`, batch, (err, rows) => {
                    if (err)
                        return reject(err);
                    resolve(rows || []);
                });
            });
            for (const row of rows) {
                map.set(row.card_id, row);
            }
        }
        return map;
    });
}
/**
 * Fetches price history for a batch of uniqueIdentifiers.
 */
function fetchPriceHistories(identifiers) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        const db = (0, database_1.getDb)();
        const map = new Map();
        if (identifiers.length === 0)
            return map;
        const BATCH_SIZE = 50;
        for (let i = 0; i < identifiers.length; i += BATCH_SIZE) {
            const batch = identifiers.slice(i, i + BATCH_SIZE);
            const placeholders = batch.map(() => '?').join(',');
            const rows = yield new Promise((resolve, reject) => {
                db.all(`SELECT uniqueIdentifier, date, price, marketPrice
           FROM price_history
           WHERE uniqueIdentifier IN (${placeholders})
             AND source IN ('tcgcsv', 'tcgdex', 'catalog_fallback')
           ORDER BY date ASC`, batch, (err, rows) => {
                    if (err)
                        return reject(err);
                    resolve(rows || []);
                });
            });
            for (const row of rows) {
                const existing = map.get(row.uniqueIdentifier) || [];
                existing.push({
                    date: row.date,
                    price: (_b = (_a = row.marketPrice) !== null && _a !== void 0 ? _a : row.price) !== null && _b !== void 0 ? _b : 0,
                    marketPrice: row.marketPrice,
                });
                map.set(row.uniqueIdentifier, existing);
            }
        }
        return map;
    });
}
/**
 * Enriches an array of PokemonCard objects with investmentData from the backend database.
 * Cards that don't have a matching prediction or price history will not be enriched.
 */
function enrichCardsWithInvestmentData(cards) {
    return __awaiter(this, void 0, void 0, function* () {
        if (cards.length === 0)
            return cards;
        // Extract card IDs (PokemonCard uses `id`, local DB cards use `cardId`)
        const cardIds = cards
            .map(c => c.id || c.cardId)
            .filter(Boolean);
        if (cardIds.length === 0)
            return cards;
        try {
            // 1. Fetch card mappings to get uniqueIdentifiers
            const mappings = yield fetchCardMappings(cardIds);
            // 2. Fetch latest predictions
            const predictions = yield fetchLatestPredictions(cardIds);
            // 3. Fetch price histories for cards that have mappings
            const uniqueIdentifiers = [...new Set(mappings.values())];
            const priceHistories = yield fetchPriceHistories(uniqueIdentifiers);
            // 4. Enrich each card
            return cards.map(card => {
                const cardId = card.id || card.cardId;
                if (!cardId)
                    return card;
                const prediction = predictions.get(cardId);
                const uniqueId = mappings.get(cardId);
                const priceHistory = uniqueId ? priceHistories.get(uniqueId) || [] : [];
                // If no prediction and no price history, skip enrichment
                if (!prediction && priceHistory.length === 0)
                    return card;
                // Build marketAnalysis from prediction + price data
                const prices = priceHistory.map(p => p.price).filter(p => p > 0);
                const { change30d, change90d, change1y } = computePriceChanges(prices);
                const volatility = computeVolatility(prices);
                const fairValue = computeFairValue(prices);
                const category = (prediction === null || prediction === void 0 ? void 0 : prediction.category) || '';
                const expected30dReturn = (prediction === null || prediction === void 0 ? void 0 : prediction.expected_30d_return) || 0;
                const { isUndervalued, isOvervalued } = mapCategoryToFlags(category);
                const investmentData = {
                    psaData: {
                        population: { grade10: 0, grade9: 0, grade8: 0, grade7: 0, total: 0 },
                        prices: { grade10: 0, grade9: 0, grade8: 0, raw: (prediction === null || prediction === void 0 ? void 0 : prediction.current_price) || 0 },
                        popReport: {
                            lowPop: false,
                            grade10Percentage: 0,
                            totalSubmissions: 0,
                        },
                        returnRate: 0,
                    },
                    priceHistory: priceHistory.map(p => ({ date: p.date, price: p.price })),
                    marketAnalysis: {
                        trend: mapReturnToTrend(expected30dReturn),
                        volatility,
                        priceChange30d: change30d,
                        priceChange90d: change90d,
                        priceChange1y: change1y,
                        isUndervalued,
                        isOvervalued,
                        fairValue,
                        confidence: (prediction === null || prediction === void 0 ? void 0 : prediction.confidence_score) || 50,
                    },
                    investmentScore: (prediction === null || prediction === void 0 ? void 0 : prediction.confidence_score) || 50,
                    riskLevel: mapRiskScoreToLevel((prediction === null || prediction === void 0 ? void 0 : prediction.risk_score) || 50),
                    recommendation: mapSuggestedAction((prediction === null || prediction === void 0 ? void 0 : prediction.suggested_action) || 'WATCH'),
                };
                return Object.assign(Object.assign({}, card), { investmentData });
            });
        }
        catch (error) {
            logger_1.logger.error('Error enriching cards with investment data:', error);
            // Return cards without enrichment on error
            return cards;
        }
    });
}
