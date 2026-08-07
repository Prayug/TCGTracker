"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.enrichCardsWithInvestmentData = enrichCardsWithInvestmentData;
const database_1 = require("../db/database");
const logger_1 = require("../utils/logger");
const resolveListingPrice_1 = require("../utils/resolveListingPrice");
const GRADED_CACHE_TTL_MS = 15 * 60 * 1000;
let gradedCache = { at: 0, data: new Map() };
let populationCache = {
    at: 0,
    data: new Map(),
};
async function allRows(sql, params) {
    const db = (0, database_1.getDb)();
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err)
                reject(err);
            else
                resolve((rows || []));
        });
    });
}
/**
 * Real slab prices for a batch of cardIds (from graded_prices). Absent grades
 * stay null — never fabricated zeros.
 */
async function fetchGradedLookups(cardIds) {
    const now = Date.now();
    if (gradedCache.data.size > 0 && now - gradedCache.at < GRADED_CACHE_TTL_MS) {
        return gradedCache.data;
    }
    const map = new Map();
    const unique = [...new Set(cardIds)];
    const BATCH_SIZE = 100;
    for (let i = 0; i < unique.length; i += BATCH_SIZE) {
        const batch = unique.slice(i, i + BATCH_SIZE);
        const placeholders = batch.map(() => '?').join(',');
        const rows = await allRows(`SELECT cardId, grader, grade, price, MAX(fetchedAt) as fetchedAt
       FROM graded_prices
       WHERE cardId IN (${placeholders}) AND verified = 1 AND price IS NOT NULL AND price > 0
       GROUP BY cardId, grader, grade`, batch);
        for (const cardId of unique) {
            map.set(cardId, {
                grade10: null,
                grade9: null,
                grade8: null,
                raw: null,
                fetchedAt: null,
            });
        }
        for (const row of rows) {
            const entry = map.get(row.cardId);
            if (!entry)
                continue;
            const key = `${row.grader}::${row.grade}`;
            if (key === 'psa::10')
                entry.grade10 = row.price;
            else if (key === 'psa::9')
                entry.grade9 = row.price;
            else if (key === 'psa::8')
                entry.grade8 = row.price;
            else if (row.grader === 'ungraded')
                entry.raw = row.price;
            if (entry.fetchedAt == null || (row.fetchedAt && row.fetchedAt > entry.fetchedAt)) {
                entry.fetchedAt = row.fetchedAt;
            }
        }
    }
    gradedCache = { at: now, data: map };
    return map;
}
/**
 * Real PSA population census for a batch of cardIds. Only valid payloads with
 * a 10-element positional array (or an explicit grade10) are accepted.
 */
async function fetchPopulationLookups(cardIds) {
    var _a;
    const now = Date.now();
    if (populationCache.data.size > 0 && now - populationCache.at < GRADED_CACHE_TTL_MS) {
        return populationCache.data;
    }
    const map = new Map();
    const unique = [...new Set(cardIds)];
    const BATCH_SIZE = 100;
    for (let i = 0; i < unique.length; i += BATCH_SIZE) {
        const batch = unique.slice(i, i + BATCH_SIZE);
        const placeholders = batch.map(() => '?').join(',');
        const rows = await allRows(`SELECT cardId, payload, MAX(fetchedAt) as fetchedAt
       FROM population_cache
       WHERE cardId IN (${placeholders})
       GROUP BY cardId`, batch);
        for (const cardId of unique) {
            map.set(cardId, { grade10: null, grade9: null, total: null, fetchedAt: null });
        }
        for (const row of rows) {
            try {
                const parsed = JSON.parse(row.payload);
                const psa = (_a = parsed === null || parsed === void 0 ? void 0 : parsed.companies) === null || _a === void 0 ? void 0 : _a.psa;
                if (!psa)
                    continue;
                let grade10 = null;
                let grade9 = null;
                if (Array.isArray(psa.pop)) {
                    const arr = psa.pop.map((v) => Number(v));
                    if (arr.length >= 10 && arr.every((v) => Number.isFinite(v))) {
                        grade10 = arr[9];
                        grade9 = arr[8];
                    }
                }
                else {
                    if (psa.grade10 != null)
                        grade10 = Number(psa.grade10) || null;
                    if (psa.grade9 != null)
                        grade9 = Number(psa.grade9) || null;
                }
                const total = typeof psa.total === 'number' ? psa.total : null;
                if (grade10 == null && grade9 == null && total == null)
                    continue;
                const existing = map.get(row.cardId);
                if (!existing)
                    continue;
                existing.grade10 = grade10;
                existing.grade9 = grade9;
                existing.total = total;
                existing.fetchedAt = new Date(row.fetchedAt).toISOString();
            }
            catch (_b) {
                // skip malformed payloads
            }
        }
    }
    populationCache = { at: now, data: map };
    return map;
}
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
function computePriceChangesLocal(prices) {
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
function computeVolatilityLocal(prices) {
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
    return Math.sqrt(variance) * Math.sqrt(30);
}
function computeFairValue(prices) {
    if (prices.length === 0)
        return 0;
    const recent = prices.slice(-30);
    return recent.reduce((a, b) => a + b, 0) / recent.length;
}
/**
 * Fetches card_mappings rows for the given card IDs, returning a map of cardId -> uniqueIdentifier.
 * Prefers premium printings when a card has multiple variant mappings.
 */
async function fetchCardMappings(cardIds) {
    const db = (0, database_1.getDb)();
    const map = new Map();
    if (cardIds.length === 0)
        return map;
    const variantRank = (variantKey) => {
        const key = (variantKey || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        if (key.includes('1steditionholofoil'))
            return 100;
        if (key.includes('1stedition'))
            return 90;
        if (key === 'holofoil')
            return 80;
        if (key.includes('unlimitedholofoil'))
            return 70;
        if (key.includes('reverse'))
            return 60;
        if (key === 'normal' || key === 'unlimited')
            return 40;
        return 10;
    };
    const BATCH_SIZE = 50;
    for (let i = 0; i < cardIds.length; i += BATCH_SIZE) {
        const batch = cardIds.slice(i, i + BATCH_SIZE);
        const placeholders = batch.map(() => '?').join(',');
        const rows = await new Promise((resolve, reject) => {
            db.all(`SELECT cardId, uniqueIdentifier, variantKey FROM card_mappings
           WHERE cardId IN (${placeholders})`, batch, (err, rows) => {
                if (err)
                    return reject(err);
                resolve(rows || []);
            });
        });
        const best = new Map();
        for (const row of rows) {
            if (!row.cardId || !row.uniqueIdentifier)
                continue;
            const rank = variantRank(row.variantKey);
            const existing = best.get(row.cardId);
            if (!existing || rank > existing.rank) {
                best.set(row.cardId, { uniqueIdentifier: row.uniqueIdentifier, rank });
            }
        }
        for (const [cardId, entry] of best) {
            map.set(cardId, entry.uniqueIdentifier);
        }
    }
    return map;
}
/**
 * Latest repaired snapshot price per cardId (across all variant mappings).
 */
async function fetchLatestSnapshots(cardIds) {
    const db = (0, database_1.getDb)();
    const map = new Map();
    if (cardIds.length === 0)
        return map;
    const BATCH_SIZE = 50;
    for (let i = 0; i < cardIds.length; i += BATCH_SIZE) {
        const batch = cardIds.slice(i, i + BATCH_SIZE);
        const placeholders = batch.map(() => '?').join(',');
        const rows = await new Promise((resolve, reject) => {
            db.all(`SELECT cm.cardId, ph.marketPrice, ph.lowPrice, ph.highPrice, ph.date
         FROM price_history ph
         JOIN card_mappings cm ON cm.uniqueIdentifier = ph.uniqueIdentifier
         WHERE cm.cardId IN (${placeholders})
           AND ph.source IN ('tcgcsv', 'tcgdex', 'catalog_fallback')
           AND ph.marketPrice IS NOT NULL
           AND ph.marketPrice > 0
           AND (cm.cardId, ph.date) IN (
             SELECT cm2.cardId, MAX(ph2.date)
             FROM price_history ph2
             JOIN card_mappings cm2 ON cm2.uniqueIdentifier = ph2.uniqueIdentifier
             WHERE cm2.cardId IN (${placeholders})
               AND ph2.source IN ('tcgcsv', 'tcgdex', 'catalog_fallback')
               AND ph2.marketPrice IS NOT NULL
               AND ph2.marketPrice > 0
             GROUP BY cm2.cardId
           )`, [...batch, ...batch], (err, rows) => {
                if (err)
                    return reject(err);
                resolve(rows || []);
            });
        });
        for (const row of rows) {
            const resolved = (0, resolveListingPrice_1.resolveHistoryPointPrice)(row);
            if (resolved <= 0)
                continue;
            const existing = map.get(row.cardId) || 0;
            // Prefer the strongest coherent snap when multiple variants share the latest date.
            if (resolved > existing)
                map.set(row.cardId, resolved);
        }
    }
    return map;
}
/**
 * Fetches latest predictions for the given card IDs from the most recent prediction run.
 */
async function fetchLatestPredictions(cardIds) {
    const db = (0, database_1.getDb)();
    const map = new Map();
    if (cardIds.length === 0)
        return map;
    const BATCH_SIZE = 50;
    for (let i = 0; i < cardIds.length; i += BATCH_SIZE) {
        const batch = cardIds.slice(i, i + BATCH_SIZE);
        const placeholders = batch.map(() => '?').join(',');
        const rows = await new Promise((resolve, reject) => {
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
}
/**
 * Fetches price history for a batch of uniqueIdentifiers.
 */
async function fetchPriceHistories(identifiers) {
    const db = (0, database_1.getDb)();
    const map = new Map();
    if (identifiers.length === 0)
        return map;
    const BATCH_SIZE = 50;
    for (let i = 0; i < identifiers.length; i += BATCH_SIZE) {
        const batch = identifiers.slice(i, i + BATCH_SIZE);
        const placeholders = batch.map(() => '?').join(',');
        const rows = await new Promise((resolve, reject) => {
            db.all(`SELECT uniqueIdentifier, date, price, marketPrice, lowPrice, highPrice
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
            const repaired = (0, resolveListingPrice_1.resolveHistoryPointPrice)(row);
            existing.push({
                date: row.date,
                price: repaired,
                marketPrice: repaired,
            });
            map.set(row.uniqueIdentifier, existing);
        }
    }
    return map;
}
/**
 * Enriches an array of PokemonCard objects with investmentData from the backend database.
 * Cards that don't have a matching prediction or price history will not be enriched.
 */
async function enrichCardsWithInvestmentData(cards) {
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
        const mappings = await fetchCardMappings(cardIds);
        // 2. Fetch latest predictions
        const predictions = await fetchLatestPredictions(cardIds);
        // 3. Fetch price histories for cards that have mappings
        const uniqueIdentifiers = [...new Set(mappings.values())];
        const priceHistories = await fetchPriceHistories(uniqueIdentifiers);
        const latestSnapshots = await fetchLatestSnapshots(cardIds);
        // 4. Fetch real graded prices + population census (batched)
        const gradedLookups = await fetchGradedLookups(cardIds);
        const populationLookups = await fetchPopulationLookups(cardIds);
        // 4. Enrich each card
        return cards.map(card => {
            var _a, _b, _c, _d, _e, _f, _g;
            const cardId = card.id || card.cardId;
            if (!cardId)
                return card;
            const prediction = predictions.get(cardId);
            const uniqueId = mappings.get(cardId);
            const priceHistory = uniqueId ? priceHistories.get(uniqueId) || [] : [];
            const latestSnapshot = latestSnapshots.get(cardId) ||
                (priceHistory.length > 0 ? priceHistory[priceHistory.length - 1].price : 0);
            // If no prediction and no price history, skip enrichment
            if (!prediction && priceHistory.length === 0)
                return card;
            // Build marketAnalysis from prediction + price data
            const prices = priceHistory.map(p => p.price).filter(p => p > 0);
            const { change30d, change90d, change1y } = computePriceChangesLocal(prices);
            const volatility = computeVolatilityLocal(prices);
            const fairValue = computeFairValue(prices);
            const category = (prediction === null || prediction === void 0 ? void 0 : prediction.category) || '';
            const expected30dReturn = (prediction === null || prediction === void 0 ? void 0 : prediction.expected_30d_return) || 0;
            const { isUndervalued, isOvervalued } = mapCategoryToFlags(category);
            const graded = gradedLookups.get(cardId);
            const pop = populationLookups.get(cardId);
            const grade10 = (_a = pop === null || pop === void 0 ? void 0 : pop.grade10) !== null && _a !== void 0 ? _a : null;
            const total = (_b = pop === null || pop === void 0 ? void 0 : pop.total) !== null && _b !== void 0 ? _b : null;
            const grade10Percentage = grade10 != null && total != null && total > 0
                ? (grade10 / total) * 100
                : 0;
            const lowPop = grade10 != null && total != null && grade10 > 0 && grade10 < 500 && grade10Percentage < 5;
            const psaFetchedAt = (_d = (_c = graded === null || graded === void 0 ? void 0 : graded.fetchedAt) !== null && _c !== void 0 ? _c : pop === null || pop === void 0 ? void 0 : pop.fetchedAt) !== null && _d !== void 0 ? _d : null;
            const psaStale = psaFetchedAt != null
                ? Date.now() - new Date(psaFetchedAt).getTime() > 12 * 60 * 60 * 1000
                : false;
            const investmentData = {
                psaData: {
                    population: {
                        grade10: grade10 != null && grade10 > 0 ? grade10 : null,
                        grade9: (pop === null || pop === void 0 ? void 0 : pop.grade9) != null && pop.grade9 > 0 ? pop.grade9 : null,
                        grade8: null,
                        grade7: null,
                        total: total != null && total > 0 ? total : null,
                    },
                    prices: {
                        grade10: (_e = graded === null || graded === void 0 ? void 0 : graded.grade10) !== null && _e !== void 0 ? _e : null,
                        grade9: (_f = graded === null || graded === void 0 ? void 0 : graded.grade9) !== null && _f !== void 0 ? _f : null,
                        grade8: (_g = graded === null || graded === void 0 ? void 0 : graded.grade8) !== null && _g !== void 0 ? _g : null,
                        raw: (prediction === null || prediction === void 0 ? void 0 : prediction.current_price) || latestSnapshot || 0,
                    },
                    popReport: {
                        lowPop,
                        grade10Percentage,
                        totalSubmissions: total !== null && total !== void 0 ? total : 0,
                    },
                    returnRate: 0,
                    fetchedAt: psaFetchedAt,
                    stale: psaStale,
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
            // Force display price to the latest backend snapshot when we have one.
            const withSnapshot = latestSnapshot > 0
                ? { ...card, marketPrice: latestSnapshot, investmentData }
                : { ...card, investmentData };
            return withSnapshot;
        });
    }
    catch (error) {
        logger_1.logger.error('Error enriching cards with investment data:', error);
        // Return cards without enrichment on error
        return cards;
    }
}
