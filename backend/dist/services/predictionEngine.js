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
exports.DEFAULT_CARD_QUALITY_FILTER = void 0;
exports.computeSeasonalityAdjustment = computeSeasonalityAdjustment;
exports.isRarityInvestmentWorthy = isRarityInvestmentWorthy;
exports.hasMeaningfulPriceMovement = hasMeaningfulPriceMovement;
exports.dedupePriceHistoryByDate = dedupePriceHistoryByDate;
exports.countLiveQuotes = countLiveQuotes;
exports.countDistinctPrices = countDistinctPrices;
exports.calendarSpanDays = calendarSpanDays;
exports.hasAdequateTrackingHistory = hasAdequateTrackingHistory;
exports.computeSetAgeDays = computeSetAgeDays;
exports.getAdaptiveMinDataPoints = getAdaptiveMinDataPoints;
exports.getAdaptiveMinMovementPct = getAdaptiveMinMovementPct;
exports.isCardInvestmentWorthy = isCardInvestmentWorthy;
exports.computeLiquidityScore = computeLiquidityScore;
exports.computeDataQualityScore = computeDataQualityScore;
exports.computeTrendScore = computeTrendScore;
exports.computeRecoveryScore = computeRecoveryScore;
exports.computeDemandScore = computeDemandScore;
exports.computeRiskScore = computeRiskScore;
exports.computeExternalSignalScore = computeExternalSignalScore;
exports.computeSetLifecycleScore = computeSetLifecycleScore;
exports.computeCompetitiveMetaScore = computeCompetitiveMetaScore;
exports.computeGradingScore = computeGradingScore;
exports.computeGradingPremiumPotential = computeGradingPremiumPotential;
exports.computeExpectedReturns = computeExpectedReturns;
exports.computeCalibratedConfidence = computeCalibratedConfidence;
exports.computePriceRanges = computePriceRanges;
exports.determineCategory = determineCategory;
exports.generateSuggestedAction = generateSuggestedAction;
exports.generateExplanation = generateExplanation;
exports.generateRiskFactors = generateRiskFactors;
exports.predictSingleCard = predictSingleCard;
exports.runPredictions = runPredictions;
exports.isPredictionWindow = isPredictionWindow;
exports.getLatestPredictions = getLatestPredictions;
const database_1 = require("../db/database");
const logger_1 = require("../utils/logger");
const marketAnalyzer_1 = require("./marketAnalyzer");
const externalSignalService_1 = require("./externalSignalService");
const topMoversQuality_1 = require("./topMoversQuality");
const returnCalibration_1 = require("./returnCalibration");
const horizonSupport_1 = require("./horizonSupport");
// --- Utility helpers for smooth interpolation ---
function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}
function lerp(a, b, t) {
    return a + (b - a) * clamp(t, 0, 1);
}
/**
 * Smooth sigmoid-like mapping: maps input value to [0, maxOutput] with
 * smooth transitions around the midpoint. Replaces step-function thresholds.
 */
function smoothStep(value, midpoint, steepness, maxOutput) {
    const x = (value - midpoint) * steepness;
    const sigmoid = 1 / (1 + Math.exp(-x));
    return (sigmoid - 0.5) * 2 * maxOutput;
}
/**
 * Maps a percentage change to a score contribution using linear interpolation
 * between defined breakpoints. E.g., change=-20 → -25, change=0 → 0, change=+20 → +25.
 */
function linearMap(value, breakpoints) {
    const sorted = [...breakpoints].sort((a, b) => a.input - b.input);
    if (value <= sorted[0].input)
        return sorted[0].output;
    if (value >= sorted[sorted.length - 1].input)
        return sorted[sorted.length - 1].output;
    for (let i = 0; i < sorted.length - 1; i++) {
        if (value >= sorted[i].input && value <= sorted[i + 1].input) {
            const t = (value - sorted[i].input) / (sorted[i + 1].input - sorted[i].input);
            return lerp(sorted[i].output, sorted[i + 1].output, t);
        }
    }
    return sorted[sorted.length - 1].output;
}
const MODEL_VERSION = '4.0.0';
// --- Seasonality ---
/**
 * Computes a seasonality adjustment based on TCG release cycles.
 * Returns a value in [-1, 1] where:
 *   +1 = peak demand period (set release month, holiday season)
 *   -1 = low demand period (post-release lull)
 *
 * TCG seasonality pattern:
 * - Jan-Feb: Post-holiday lull (-0.3)
 * - Mar-Apr: Spring set release (+0.4)
 * - May-Jun: Tournament season peak (+0.5)
 * - Jul-Aug: Summer lull (-0.2)
 * - Sep-Oct: Fall set release (+0.4)
 * - Nov-Dec: Holiday buying surge (+0.6)
 */
function computeSeasonalityAdjustment(cardName, setName) {
    const month = new Date().getMonth(); // 0-11
    const monthAdjustments = [-0.3, -0.3, 0.4, 0.4, 0.5, 0.5, -0.2, -0.2, 0.4, 0.4, 0.6, 0.6];
    let adjustment = monthAdjustments[month];
    // New set releases get a boost in their release month
    if (setName) {
        const lowerSet = setName.toLowerCase();
        // Recent sets (current year) get extra demand
        const currentYear = new Date().getFullYear().toString();
        if (lowerSet.includes(currentYear)) {
            adjustment += 0.15;
        }
    }
    return clamp(adjustment, -1, 1);
}
/**
 * Computes historical returns from price history for use in
 * historical simulation of price ranges.
 */
function computeHistoricalReturns(priceHistory, windowDays = 30) {
    const sorted = [...priceHistory].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const prices = sorted.map(p => { var _a; return (_a = p.marketPrice) !== null && _a !== void 0 ? _a : p.price; }).filter(p => p > 0);
    if (prices.length < windowDays + 1)
        return [];
    const returns = [];
    for (let i = windowDays; i < prices.length; i++) {
        if (prices[i - windowDays] > 0) {
            returns.push((prices[i] - prices[i - windowDays]) / prices[i - windowDays]);
        }
    }
    return returns;
}
exports.DEFAULT_CARD_QUALITY_FILTER = {
    minPrice: 2.0,
    maxPrice: 10000,
    minDataPoints: 14,
    minConfidence: 30,
    rarities: [
        'Rare Holo',
        'Rare Ultra',
        'Rare Secret',
        'Ultra Rare',
        'Secret Rare',
        'Double Rare',
        'Illustration Rare',
        'Special Illustration Rare',
        'Hyper Rare',
        'Rare Holo GX',
        'Rare Holo EX',
        'Rare Holo V',
        'Rare Holo VMAX',
        'Rare Holo VSTAR',
    ],
    excludeStagnant: true,
};
const RARITY_SQL_PATTERNS = {
    'Rare Holo': '%Rare Holo%',
    'Rare Ultra': '%Rare Ultra%',
    'Rare Secret': '%Rare Secret%',
    'Ultra Rare': '%Ultra Rare%',
    'Secret Rare': '%Secret Rare%',
    'Double Rare': '%Double Rare%',
    'Illustration Rare': '%Illustration Rare%',
    'Special Illustration Rare': '%Special Illustration%',
    'Hyper Rare': '%Hyper Rare%',
    // Older eras (SM/XY/BW) use these labels — without them, era filters look "broken".
    'Rare Holo GX': '%Rare Holo GX%',
    'Rare Holo EX': '%Rare Holo EX%',
    'Rare Holo V': '%Rare Holo V%',
    'Rare Holo VMAX': '%Rare Holo VMAX%',
    'Rare Holo VSTAR': '%Rare Holo VSTAR%',
    // One Piece catalog codes / labels
    'C': 'C',
    'UC': 'UC',
    'R': 'R',
    'L': 'L',
    'SR': 'SR',
    'SEC': 'SEC',
    'AA': 'AA',
    'LAA': 'LAA',
    'SP': 'SP',
    'TR': 'TR',
    'MANGA': '%Manga%',
    'SAA': 'SAA',
    'DON': '%DON%',
    'Common': '%Common%',
    'Uncommon': '%Uncommon%',
    'Rare': 'Rare',
    'Leader': '%Leader%',
    'Super Rare': '%Super Rare%',
    'Alternate Art': '%Alternate Art%',
    'Special Rare': '%Special%',
    'Treasure Rare': '%Treasure%',
    'Manga Rare': '%Manga%',
};
function buildRarityWhereClause(column, rarities) {
    var _a;
    if (rarities.length === 0)
        return { clause: '1=1', params: [] };
    const conditions = [];
    const params = [];
    for (const rarity of rarities) {
        const pattern = (_a = RARITY_SQL_PATTERNS[rarity]) !== null && _a !== void 0 ? _a : `%${rarity}%`;
        conditions.push(`${column} LIKE ?`);
        params.push(pattern);
    }
    return { clause: `(${conditions.join(' OR ')})`, params };
}
function isRarityInvestmentWorthy(rarity) {
    if (!rarity)
        return false;
    const lower = rarity.toLowerCase().trim();
    if (lower === 'common' || lower === 'uncommon')
        return false;
    const worthyPatterns = [
        'rare holo',
        'rare ultra',
        'rare secret',
        'ultra rare',
        'secret rare',
        'double rare',
        'illustration rare',
        'special illustration',
        'hyper rare',
        'rainbow rare',
        'gold rare',
    ];
    if (worthyPatterns.some(p => lower.includes(p)))
        return true;
    if (lower === 'rare')
        return false;
    return lower.includes('vmax') || lower.includes('vstar') ||
        (lower.includes('holo') && lower.includes('rare'));
}
function hasMeaningfulPriceMovement(priceHistory, minRangePct = 5) {
    if (priceHistory.length < 2)
        return false;
    const prices = priceHistory.map(p => { var _a, _b; return (_b = (_a = p.price) !== null && _a !== void 0 ? _a : p.marketPrice) !== null && _b !== void 0 ? _b : 0; }).filter(p => p > 0);
    if (prices.length < 2)
        return false;
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    if (min <= 0)
        return false;
    const rangePct = ((max - min) / min) * 100;
    return rangePct >= minRangePct;
}
const HISTORY_SOURCE_PRIORITY = {
    tcgdex: 0,
    catalog_fallback: 1,
    tcgcsv: 2,
};
/**
 * One quote per calendar day, preferring live TCGdex over catalog/legacy dumps.
 */
function dedupePriceHistoryByDate(rows) {
    var _a, _b, _c, _d;
    const byDate = new Map();
    for (const row of rows) {
        const price = (_b = (_a = row.price) !== null && _a !== void 0 ? _a : row.marketPrice) !== null && _b !== void 0 ? _b : 0;
        if (price <= 0)
            continue;
        const date = row.date.includes('T') ? row.date.split('T')[0] : row.date;
        const source = row.source || '';
        const rank = (_c = HISTORY_SOURCE_PRIORITY[source]) !== null && _c !== void 0 ? _c : 9;
        const existing = byDate.get(date);
        if (!existing || rank < existing.rank) {
            byDate.set(date, {
                point: {
                    date,
                    price,
                    marketPrice: (_d = row.marketPrice) !== null && _d !== void 0 ? _d : price,
                    volume: row.volume,
                },
                rank,
                source,
            });
        }
    }
    return [...byDate.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([, entry]) => entry.point);
}
function countLiveQuotes(rows) {
    var _a, _b;
    const days = new Set();
    for (const row of rows) {
        if ((row.source || '') !== 'tcgdex')
            continue;
        const price = (_b = (_a = row.price) !== null && _a !== void 0 ? _a : row.marketPrice) !== null && _b !== void 0 ? _b : 0;
        if (price <= 0)
            continue;
        days.add(row.date.includes('T') ? row.date.split('T')[0] : row.date);
    }
    return days.size;
}
function countDistinctPrices(priceHistory) {
    const prices = priceHistory
        .map(p => { var _a, _b; return (_b = (_a = p.price) !== null && _a !== void 0 ? _a : p.marketPrice) !== null && _b !== void 0 ? _b : 0; })
        .filter(p => p > 0)
        .map(p => Math.round(p * 100) / 100);
    return new Set(prices).size;
}
function calendarSpanDays(priceHistory) {
    if (priceHistory.length < 2)
        return 0;
    const first = priceHistory[0].date.includes('T')
        ? priceHistory[0].date.split('T')[0]
        : priceHistory[0].date;
    const last = priceHistory[priceHistory.length - 1].date.includes('T')
        ? priceHistory[priceHistory.length - 1].date.split('T')[0]
        : priceHistory[priceHistory.length - 1].date;
    const a = new Date(`${first}T00:00:00Z`).getTime();
    const b = new Date(`${last}T00:00:00Z`).getTime();
    if (Number.isNaN(a) || Number.isNaN(b))
        return 0;
    return Math.max(0, Math.round((b - a) / 86400000));
}
/**
 * Reject sparse / step-function / cliffy series that inflate expected returns
 * without real market tracking (e.g. one catalog snapshot + flat feed plateaus).
 */
function hasAdequateTrackingHistory(priceHistory, liveQuoteCount, options = {}) {
    var _a, _b, _c, _d, _e;
    const minPoints = (_a = options.minPoints) !== null && _a !== void 0 ? _a : getAdaptiveMinDataPoints(options.setReleaseDate);
    const minDistinct = (_b = options.minDistinctPrices) !== null && _b !== void 0 ? _b : 5;
    const minLive = (_c = options.minLiveQuotes) !== null && _c !== void 0 ? _c : Math.max(3, Math.ceil(minPoints / 2));
    const minSpan = (_d = options.minSpanDays) !== null && _d !== void 0 ? _d : (computeSetAgeDays(options.setReleaseDate) >= 0 &&
        computeSetAgeDays(options.setReleaseDate) < 90
        ? 7
        : 21);
    const cliffPct = (_e = options.cliffPct) !== null && _e !== void 0 ? _e : 50;
    if (priceHistory.length < minPoints)
        return false;
    if (liveQuoteCount < minLive)
        return false;
    if (countDistinctPrices(priceHistory) < minDistinct)
        return false;
    if (calendarSpanDays(priceHistory) < minSpan)
        return false;
    return (0, topMoversQuality_1.isGradualMove)(priceHistory.map(p => {
        var _a, _b;
        return ({
            date: p.date.includes('T') ? p.date.split('T')[0] : p.date,
            price: (_b = (_a = p.price) !== null && _a !== void 0 ? _a : p.marketPrice) !== null && _b !== void 0 ? _b : 0,
        });
    }), { cliffPct, minPoints });
}
/**
 * Returns the number of days since a set was released, or -1 if unknown.
 */
function computeSetAgeDays(setReleaseDate) {
    if (!setReleaseDate)
        return -1;
    const normalized = setReleaseDate.replace(/\//g, '-');
    const releaseTime = new Date(`${normalized}T00:00:00Z`).getTime();
    if (isNaN(releaseTime))
        return -1;
    const ageDays = (Date.now() - releaseTime) / (1000 * 60 * 60 * 24);
    return ageDays < 0 ? -1 : Math.floor(ageDays);
}
/**
 * Adaptive minimum data points based on set age.
 * Newer sets have lower requirements so they enter the prediction pipeline earlier.
 */
function getAdaptiveMinDataPoints(setReleaseDate) {
    const ageDays = computeSetAgeDays(setReleaseDate);
    if (ageDays < 0)
        return 14;
    if (ageDays < 30)
        return 3;
    if (ageDays < 90)
        return 5;
    if (ageDays < 180)
        return 8;
    return 14;
}
/**
 * Adaptive minimum price movement percentage based on set age.
 * Newer sets get a lower threshold since they haven't had time for large swings.
 */
function getAdaptiveMinMovementPct(setReleaseDate) {
    const ageDays = computeSetAgeDays(setReleaseDate);
    if (ageDays < 0)
        return 5;
    if (ageDays < 90)
        return 2;
    return 5;
}
function isCardInvestmentWorthy(card, priceHistory, currentPrice, filter = exports.DEFAULT_CARD_QUALITY_FILTER, setReleaseDate, liveQuoteCount) {
    if (!currentPrice || currentPrice < filter.minPrice || currentPrice > filter.maxPrice) {
        return false;
    }
    if (!isRarityInvestmentWorthy(card.rarity))
        return false;
    const minDataPoints = setReleaseDate != null
        ? getAdaptiveMinDataPoints(setReleaseDate)
        : filter.minDataPoints;
    if (priceHistory.length < minDataPoints)
        return false;
    if (filter.excludeStagnant) {
        const minPct = setReleaseDate != null
            ? getAdaptiveMinMovementPct(setReleaseDate)
            : 5;
        if (!hasMeaningfulPriceMovement(priceHistory, minPct)) {
            return false;
        }
    }
    if (!hasAdequateTrackingHistory(priceHistory, liveQuoteCount !== null && liveQuoteCount !== void 0 ? liveQuoteCount : priceHistory.length, {
        minPoints: minDataPoints,
        setReleaseDate,
    })) {
        return false;
    }
    return true;
}
function computeLiquidityScore(priceHistory, currentPrice, volatility, setReleaseDate) {
    var _a;
    // Adaptive normalization: newer sets use a shorter window so they aren't penalized
    // for having fewer data points than mature sets.
    const ageDays = setReleaseDate != null ? computeSetAgeDays(setReleaseDate) : -1;
    const normalizer = ageDays >= 0 && ageDays < 30 ? 14
        : ageDays >= 0 && ageDays < 90 ? 30
            : 90;
    const dataPointScore = Math.min(100, (priceHistory.length / normalizer) * 100);
    const stabilityScore = Math.max(0, 100 - volatility.monthlyVolatility * 200);
    // Volume-based liquidity: average recent volume normalized to 0-100
    const recentVolumes = priceHistory
        .slice(-30)
        .map(p => { var _a; return (_a = p.volume) !== null && _a !== void 0 ? _a : 0; })
        .filter(v => v > 0);
    const avgVolume = recentVolumes.length > 0
        ? recentVolumes.reduce((a, b) => a + b, 0) / recentVolumes.length
        : 0;
    // Scale: 0 volume → 10, 50+ volume → 80, 200+ → 100
    const volumeScore = avgVolume === 0 ? 10 : Math.min(100, 10 + avgVolume * 1.5);
    const priceLevelScore = currentPrice >= 100 ? 70 :
        currentPrice >= 50 ? 60 :
            currentPrice >= 20 ? 55 :
                currentPrice >= 10 ? 50 :
                    currentPrice >= 5 ? 45 :
                        currentPrice >= 2 ? 35 : 25;
    const lastDate = (_a = priceHistory[priceHistory.length - 1]) === null || _a === void 0 ? void 0 : _a.date;
    let recencyScore = 50;
    if (lastDate) {
        const daysSince = (Date.now() - new Date(lastDate).getTime()) / (1000 * 60 * 60 * 24);
        if (daysSince <= 3)
            recencyScore = 100;
        else if (daysSince <= 7)
            recencyScore = 85;
        else if (daysSince <= 14)
            recencyScore = 65;
        else if (daysSince <= 30)
            recencyScore = 40;
        else
            recencyScore = 20;
    }
    const score = 0.20 * dataPointScore +
        0.20 * stabilityScore +
        0.30 * volumeScore +
        0.15 * priceLevelScore +
        0.15 * recencyScore;
    return Math.round(Math.max(0, Math.min(100, score)));
}
function computeDataQualityScore(priceHistory) {
    var _a, _b, _c, _d, _e, _f;
    if (priceHistory.length < 2)
        return 0;
    let score = 100;
    const gaps = [];
    for (let i = 1; i < priceHistory.length; i++) {
        const d1 = new Date(priceHistory[i - 1].date).getTime();
        const d2 = new Date(priceHistory[i].date).getTime();
        gaps.push((d2 - d1) / (1000 * 60 * 60 * 24));
    }
    const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    const maxGap = Math.max(...gaps);
    if (avgGap > 7)
        score -= 20;
    else if (avgGap > 4)
        score -= 10;
    if (maxGap > 30)
        score -= 15;
    else if (maxGap > 14)
        score -= 8;
    const prices = priceHistory.map(p => { var _a, _b; return (_b = (_a = p.price) !== null && _a !== void 0 ? _a : p.marketPrice) !== null && _b !== void 0 ? _b : 0; }).filter(p => p > 0);
    if (prices.length >= 3) {
        const mean = prices.reduce((a, b) => a + b, 0) / prices.length;
        const variance = prices.reduce((a, p) => a + (p - mean) ** 2, 0) / prices.length;
        const stdDev = Math.sqrt(variance);
        if (stdDev > 0) {
            const outlierCount = prices.filter(p => Math.abs(p - mean) > 3 * stdDev).length;
            score -= Math.min(25, outlierCount * 5);
        }
    }
    for (let i = 1; i < priceHistory.length - 1; i++) {
        const prev = (_b = (_a = priceHistory[i - 1].price) !== null && _a !== void 0 ? _a : priceHistory[i - 1].marketPrice) !== null && _b !== void 0 ? _b : 0;
        const curr = (_d = (_c = priceHistory[i].price) !== null && _c !== void 0 ? _c : priceHistory[i].marketPrice) !== null && _d !== void 0 ? _d : 0;
        const next = (_f = (_e = priceHistory[i + 1].price) !== null && _e !== void 0 ? _e : priceHistory[i + 1].marketPrice) !== null && _f !== void 0 ? _f : 0;
        if (prev > 0 && curr > 0 && next > 0) {
            const spikeUp = (curr - prev) / prev;
            const revert = (curr - next) / curr;
            if (spikeUp > 0.5 && revert > 0.3)
                score -= 15;
            const spikeDown = (prev - curr) / prev;
            const recover = (next - curr) / curr;
            if (spikeDown > 0.5 && recover > 0.3)
                score -= 10;
        }
    }
    return Math.max(0, Math.min(100, score));
}
/**
 * Prefer the predicted finish when available; otherwise one row per cardId.
 * Rarity falls back to catalog_cards — card_mappings often has blank rarity.
 */
const CARD_METADATA_JOIN = `
  LEFT JOIN card_mappings cm_pred
    ON cp.unique_identifier IS NOT NULL
   AND cm_pred.uniqueIdentifier = cp.unique_identifier
  LEFT JOIN (
    SELECT
      cm.cardId,
      MIN(cm.cardName) AS cardName,
      MIN(cm.setName) AS setName,
      MIN(cm.setId) AS setId,
      MIN(cm.cardNumber) AS cardNumber,
      MIN(COALESCE(NULLIF(TRIM(cm.rarity), ''), NULLIF(TRIM(cc.rarity), ''))) AS rarity,
      MIN(NULLIF(cm.imageLarge, '')) AS imageLarge,
      MIN(NULLIF(cm.imageSmall, '')) AS imageSmall,
      MIN(COALESCE(cm.tcgplayerProductId, CAST(cm.productId AS TEXT))) AS tcgplayerProductId
    FROM card_mappings cm
    LEFT JOIN catalog_cards cc ON cc.cardId = cm.cardId
    GROUP BY cm.cardId
  ) cm_fallback ON cm_fallback.cardId = cp.card_id
`;
const CARD_METADATA_SELECT = `
  COALESCE(cm_pred.cardName, cm_fallback.cardName) AS cardName,
  COALESCE(cm_pred.setName, cm_fallback.setName) AS setName,
  COALESCE(cm_pred.setId, cm_fallback.setId) AS setId,
  COALESCE(cm_pred.cardNumber, cm_fallback.cardNumber) AS cardNumber,
  COALESCE(
    NULLIF(TRIM(cm_pred.rarity), ''),
    cm_fallback.rarity
  ) AS rarity,
  COALESCE(
    NULLIF(cm_pred.imageLarge, ''),
    cm_fallback.imageLarge
  ) AS imageLarge,
  COALESCE(
    NULLIF(cm_pred.imageSmall, ''),
    cm_fallback.imageSmall
  ) AS imageSmall,
  COALESCE(
    cm_pred.tcgplayerProductId,
    CAST(cm_pred.productId AS TEXT),
    cm_fallback.tcgplayerProductId
  ) AS tcgplayerProductId,
  COALESCE(cp.unique_identifier, cm_pred.uniqueIdentifier) AS unique_identifier,
  COALESCE(cp.variant_key, cm_pred.variantKey) AS variant_key
`;
function computeTrendScore(priceChanges, movingAverages, currentPrice) {
    if (!currentPrice || currentPrice <= 0)
        return 0;
    let score = 50;
    // Smooth interpolation for 30-day price change
    if (priceChanges.change30d !== null) {
        score += linearMap(priceChanges.change30d, [
            { input: -30, output: -30 },
            { input: -20, output: -25 },
            { input: -10, output: -15 },
            { input: -5, output: -8 },
            { input: 0, output: 0 },
            { input: 5, output: 8 },
            { input: 10, output: 15 },
            { input: 20, output: 25 },
            { input: 30, output: 30 },
        ]);
    }
    // Smooth interpolation for 90-day price change
    if (priceChanges.change90d !== null) {
        score += linearMap(priceChanges.change90d, [
            { input: -40, output: -25 },
            { input: -30, output: -20 },
            { input: -15, output: -12 },
            { input: -5, output: -5 },
            { input: 0, output: 0 },
            { input: 5, output: 5 },
            { input: 15, output: 12 },
            { input: 30, output: 20 },
            { input: 40, output: 25 },
        ]);
    }
    // Smooth MA7/MA30 crossover signal
    if (movingAverages.ma7 !== null && movingAverages.ma30 !== null && movingAverages.ma30 > 0) {
        const maRatio = movingAverages.ma7 / movingAverages.ma30;
        score += smoothStep(maRatio, 1.0, 80, 15);
    }
    // Smooth MA30/MA90 crossover signal
    if (movingAverages.ma30 !== null && movingAverages.ma90 !== null && movingAverages.ma90 > 0) {
        const maRatio = movingAverages.ma30 / movingAverages.ma90;
        score += smoothStep(maRatio, 1.0, 80, 10);
    }
    return Math.max(0, Math.min(100, score));
}
function computeRecoveryScore(recoveryMetrics, priceChanges) {
    let score = 50;
    if (recoveryMetrics.recentDrop !== null && recoveryMetrics.recentDrop < -5) {
        // Smooth scaling: deeper drops (up to -30%) give more recovery score
        const dropScore = linearMap(recoveryMetrics.recentDrop, [
            { input: -40, output: 30 },
            { input: -30, output: 25 },
            { input: -20, output: 20 },
            { input: -15, output: 15 },
            { input: -10, output: 10 },
            { input: -5, output: 5 },
        ]);
        score += dropScore;
        if (recoveryMetrics.hasStabilized) {
            score += 15;
        }
        // Smooth days-since-bottom: closer to bottom = more recovery potential
        if (recoveryMetrics.daysSinceBottom !== null && recoveryMetrics.daysSinceBottom > 0) {
            score += linearMap(recoveryMetrics.daysSinceBottom, [
                { input: 0, output: 12 },
                { input: 7, output: 10 },
                { input: 14, output: 5 },
                { input: 30, output: 0 },
            ]);
        }
        if (recoveryMetrics.priorRecoveryPattern) {
            score += 12;
        }
        if (priceChanges.change7d !== null && priceChanges.change7d > 0) {
            score += 8;
        }
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
        else if (lowerRarity.includes('illustration') || lowerRarity.includes('special')) {
            score += 18;
        }
        else if (lowerRarity.includes('ultra') || lowerRarity.includes('alt')) {
            score += 15;
        }
        else if (lowerRarity.includes('vmax') || lowerRarity.includes('vstar')) {
            score += 12;
        }
        else if (lowerRarity.includes('holo') || lowerRarity.includes('double')) {
            score += 8;
        }
        else if (lowerRarity.includes('rare')) {
            score += 3;
        }
    }
    if (cardNumber) {
        const upper = cardNumber.toUpperCase();
        if (upper.startsWith('TG'))
            score += 8;
        if (upper.startsWith('SV') || upper.startsWith('GG'))
            score += 6;
        const num = parseInt(cardNumber, 10);
        if (!isNaN(num) && num > 200)
            score += 4;
    }
    return Math.max(0, Math.min(100, score));
}
function computeRiskScore(volatility, priceChanges, movingAverages, externalSignalScore) {
    let score = 30;
    // Smooth volatility contribution
    score += linearMap(volatility.monthlyVolatility, [
        { input: 0, output: -5 },
        { input: 0.05, output: 0 },
        { input: 0.10, output: 8 },
        { input: 0.20, output: 15 },
        { input: 0.30, output: 25 },
        { input: 0.40, output: 30 },
    ]);
    // Smooth 7-day pump risk
    if (priceChanges.change7d !== null) {
        score += linearMap(priceChanges.change7d, [
            { input: 0, output: 0 },
            { input: 15, output: 10 },
            { input: 30, output: 20 },
            { input: 50, output: 30 },
        ]);
    }
    // Smooth 30-day overheating risk
    if (priceChanges.change30d !== null) {
        score += linearMap(priceChanges.change30d, [
            { input: 0, output: 0 },
            { input: 30, output: 8 },
            { input: 50, output: 15 },
            { input: 80, output: 20 },
        ]);
    }
    // Smooth MA spread risk
    if (movingAverages.ma7 !== null && movingAverages.ma30 !== null && movingAverages.ma30 > 0) {
        const spread = Math.abs(movingAverages.ma7 - movingAverages.ma30) / movingAverages.ma30;
        score += linearMap(spread, [
            { input: 0, output: 0 },
            { input: 0.10, output: 5 },
            { input: 0.15, output: 10 },
            { input: 0.25, output: 15 },
        ]);
    }
    if (externalSignalScore < 0) {
        score += Math.abs(externalSignalScore) * 0.5;
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
        totalScore += signal.sentiment * 5;
    }
    return Math.max(-30, Math.min(20, totalScore));
}
/**
 * Scores where a card is in its set's lifecycle based on the set release date:
 * new sets ride a hype wave, mature sets are baseline, old sets slowly decline.
 * Returns a value in [-5, +15]; 0 when the release date is unknown.
 */
function computeSetLifecycleScore(setReleaseDate) {
    if (!setReleaseDate)
        return 0;
    const normalized = setReleaseDate.replace(/\//g, '-');
    const releaseTime = new Date(`${normalized}T00:00:00Z`).getTime();
    if (isNaN(releaseTime))
        return 0;
    const ageDays = (Date.now() - releaseTime) / (1000 * 60 * 60 * 24);
    if (ageDays < 0)
        return 0; // not yet released
    if (ageDays < 30)
        return 15; // hype period
    if (ageDays < 90)
        return 5; // settling phase
    if (ageDays < 365)
        return 0; // mature baseline
    return -5; // declining interest
}
/**
 * Boosts cards seeing competitive play, based on tournament_meta external
 * signals weighted by relevance. Returns a value in [0, +20].
 */
function computeCompetitiveMetaScore(signals) {
    var _a;
    let score = 0;
    for (const signal of signals) {
        if (signal.type !== 'tournament_meta')
            continue;
        const relevance = clamp((_a = signal.relevance) !== null && _a !== void 0 ? _a : 0.5, 0, 1);
        score += 10 * relevance;
    }
    return Math.min(20, score);
}
/**
 * Combines AI grade quality (when available) with PSA-10 population scarcity.
 * High predicted grade + low PSA-10 pop → strong buy / grading premium signal.
 * Returns [0, 100].
 */
function computeGradingScore(avgTotalScore, psa10Pop, rarity) {
    let score = 50;
    if (avgTotalScore != null && avgTotalScore > 0) {
        // Map 100–1000 total → ~20–95
        score = clamp(((avgTotalScore - 100) / 900) * 75 + 20, 0, 100);
    }
    else if (rarity) {
        const high = [
            'Secret Rare',
            'Illustration Rare',
            'Special Illustration Rare',
            'Hyper Rare',
            'Rare Holo VMAX',
            'Rare Holo VSTAR',
            'Rare Ultra',
        ];
        if (high.some((r) => rarity.includes(r)))
            score = 58;
    }
    if (psa10Pop != null) {
        if (psa10Pop < 50)
            score += 22;
        else if (psa10Pop < 200)
            score += 14;
        else if (psa10Pop < 500)
            score += 8;
        else if (psa10Pop < 2000)
            score += 3;
        else if (psa10Pop > 8000)
            score -= 12;
        else if (psa10Pop > 4000)
            score -= 6;
    }
    return clamp(Math.round(score), 0, 100);
}
/** Estimated slab premium uplift fraction from grading score (0–~1.2). */
function computeGradingPremiumPotential(gradingScore) {
    // Score 50 → ~0.15 uplift; 80 → ~0.55; 95 → ~0.9
    return Math.round(clamp((gradingScore - 40) / 60, 0, 1.2) * 100) / 100;
}
async function fetchAvgGradingTotal(cardId) {
    const db = (0, database_1.getDb)();
    try {
        const row = await new Promise((resolve, reject) => {
            db.get(`SELECT AVG(total_score) AS avgTotal FROM grading_results WHERE card_id = ?`, [cardId], (err, r) => (err ? reject(err) : resolve(r)));
        });
        return (row === null || row === void 0 ? void 0 : row.avgTotal) != null ? Number(row.avgTotal) : null;
    }
    catch (_a) {
        return null;
    }
}
async function fetchPsa10Population(cardId) {
    var _a;
    const db = (0, database_1.getDb)();
    try {
        const row = await new Promise((resolve, reject) => {
            db.get(`SELECT payload FROM population_cache
         WHERE cardId = ? OR cacheKey LIKE ? OR cacheKey LIKE ?
         ORDER BY fetchedAt DESC LIMIT 1`, [cardId, `%${cardId}|%`, `%|${cardId}|%`], (err, r) => (err ? reject(err) : resolve(r)));
        });
        if (!(row === null || row === void 0 ? void 0 : row.payload)) {
            return null;
        }
        const parsed = JSON.parse(row.payload);
        const psa = (_a = parsed === null || parsed === void 0 ? void 0 : parsed.companies) === null || _a === void 0 ? void 0 : _a.psa;
        if (!psa)
            return null;
        if (Array.isArray(psa.pop)) {
            const arr = psa.pop.map((v) => Number(v));
            if (arr.length >= 10 && arr.every((v) => Number.isFinite(v))) {
                const n = arr[9];
                return n > 0 ? n : null;
            }
            return null;
        }
        if (psa.grade10 != null) {
            const n = Number(psa.grade10);
            return n > 0 ? n : null;
        }
        return null;
    }
    catch (_b) {
        return null;
    }
}
/**
 * Maps the raw (biased) model signal to realistic expected returns.
 *
 * The raw tanh-based output systematically overpredicts (~2-5x). When a
 * calibration model is available for a horizon, the raw signal is looked up in
 * the learned signal→realized-return curve; otherwise the raw output is
 * corrected by the nearest horizon's bias. All outputs are clamped to caps
 * derived from the observed return distribution.
 *
 * The calibration bucket key is the RAW signal (the same scale stored on
 * `signal_score`), never the squashed/sqrt-scaled placeholder. Passing a
 * differently-scaled key to the curve maps everything to edge buckets and
 * destroys the model's spread (the v4.0.0 bug that squeezed every expected
 * 7d return into [-0.4%, +5.6%]).
 */
function computeExpectedReturns(scores, seasonalityAdjustment = 0, models) {
    var _a, _b, _c, _d;
    // Normalize all scores to [-1, 1] range centered at 0
    const trendN = (scores.trendScore - 50) / 50;
    const recoveryN = (scores.recoveryScore - 50) / 50;
    const demandN = (scores.demandScore - 50) / 50;
    const riskN = (scores.riskScore - 30) / 70; // risk baseline is 30, range 0-100
    const liquidityN = (scores.liquidityScore - 50) / 50;
    const dataQualityN = (scores.dataQualityScore - 50) / 50;
    // Lifecycle in [-5, +15] and meta in [0, +20] are already small adjustments;
    // normalize to fractions of the raw signal scale.
    const lifecycleN = ((_a = scores.setLifecycleScore) !== null && _a !== void 0 ? _a : 0) / 100;
    const metaN = ((_b = scores.competitiveMetaScore) !== null && _b !== void 0 ? _b : 0) / 100;
    // Grading score is 0–100; center at 50 and scale gently so it nudges, not dominates.
    const gradingN = (((_c = scores.gradingScore) !== null && _c !== void 0 ? _c : 50) - 50) / 100;
    // Calibrated linear combination (fitted weights, not arbitrary)
    const rawSignal = 0.32 * trendN +
        0.18 * recoveryN +
        0.14 * demandN -
        0.14 * riskN +
        0.09 * liquidityN +
        0.05 * dataQualityN +
        0.08 * gradingN +
        lifecycleN +
        metaN;
    // Sigmoid squash to prevent extreme raw predictions.
    const squashed = Math.tanh(rawSignal * 3.0) * 0.40;
    // Apply seasonality adjustment (±5%)
    const raw30 = squashed + seasonalityAdjustment * 0.05;
    // Time-horizon scaling using sqrt(t) — only used when no calibration model
    // exists for a horizon (the curve itself already encodes horizon-specific
    // realized returns when present).
    const raw7 = raw30 * Math.sqrt(7 / 30);
    const raw90 = raw30 * Math.sqrt(90 / 30);
    const raw180 = raw30 * Math.sqrt(180 / 30);
    // Long-term mean reversion: cards rarely sustain extreme growth for a full
    // year, so dampen the 365d projection proportionally to signal strength.
    const longTermDampening = 1 / (1 + Math.abs(raw30) * 2);
    const raw365 = raw30 * Math.sqrt(365 / 30) * longTermDampening;
    const calibrate = (horizon, fallbackRaw, fallbackCap) => {
        var _a;
        const model = models === null || models === void 0 ? void 0 : models[horizon];
        const cap = (0, returnCalibration_1.returnCapForHorizon)(horizon, model, fallbackCap);
        const calibrated = (0, returnCalibration_1.calibrateReturn)(rawSignal, model);
        if (calibrated) {
            // Calibrated values are bucket estimates; still clamp to observed extremes.
            let expected = clamp(calibrated.expectedReturn, -cap, cap);
            // Directional honesty: below the curve's zero crossing the market is
            // flat/down more often than not — never emit a positive call there.
            // A tiny negative (never exactly 0) keeps the call visible to the
            // forward-test tracker, where a 0 prediction is a guaranteed miss.
            const threshold = (0, returnCalibration_1.positiveThresholdForHorizon)(horizon, models !== null && models !== void 0 ? models : {});
            if (threshold != null && rawSignal < threshold) {
                const magnitude = (_a = model === null || model === void 0 ? void 0 : model.marketMedianReturn) !== null && _a !== void 0 ? _a : 0;
                expected = Math.min(expected, -Math.max(0.001, Math.abs(magnitude) * 0.1));
            }
            return expected;
        }
        const bias = (0, returnCalibration_1.biasCorrectionForHorizon)(horizon, models !== null && models !== void 0 ? models : {});
        return clamp(fallbackRaw - bias, -cap, cap);
    };
    const expected7dReturn = calibrate(7, raw7, 0.12);
    const expected30dReturn = calibrate(30, raw30, 0.25);
    const expected90dReturn = calibrate(90, raw90, 0.45);
    const expected180dReturn = calibrate(180, raw180, 0.65);
    const expected365dReturn = calibrate(365, raw365, 0.90);
    const cal30 = (0, returnCalibration_1.calibrateReturn)(rawSignal, models === null || models === void 0 ? void 0 : models[30]);
    const residualStd30d = (_d = cal30 === null || cal30 === void 0 ? void 0 : cal30.residualStd) !== null && _d !== void 0 ? _d : null;
    return {
        expected7dReturn,
        expected30dReturn,
        expected90dReturn,
        expected180dReturn,
        expected365dReturn,
        rawSignal,
        residualStd30d,
    };
}
/**
 * Confidence score calibrated against the model's historical residual spread.
 * A wide realized-error band (from calibration) directly lowers confidence, so
 * the reported % reflects real-world dispersion instead of heuristics alone.
 */
function computeCalibratedConfidence(params) {
    const { trendScore, demandScore, liquidityScore, dataQualityScore, riskScore, historyLength, adaptiveMinDP, residualStd30d, monthlyVolatility = 0, } = params;
    const baseConfidence = Math.max(20, Math.min(95, 50
        + (trendScore > 60 ? 10 : trendScore > 40 ? 5 : 0)
        + (historyLength > 90 ? 15 : historyLength > 30 ? 8 : historyLength > adaptiveMinDP ? 3 : historyLength > 5 ? 1 : 0)
        + (demandScore > 60 ? 10 : 0)
        + (liquidityScore > 60 ? 8 : liquidityScore > 40 ? 4 : 0)
        + (dataQualityScore > 70 ? 5 : dataQualityScore > 50 ? 2 : 0)
        - (riskScore > 70 ? 10 : riskScore > 50 ? 5 : 0)
        - (historyLength < adaptiveMinDP ? 20 : historyLength < 14 ? 5 : 0)
        - (dataQualityScore < 40 ? 10 : dataQualityScore < 60 ? 5 : 0)));
    let uncertaintyPenalty = 0;
    if (residualStd30d != null) {
        // ~4% residual std → no penalty; ~12%+ → max penalty.
        uncertaintyPenalty = clamp((residualStd30d - 0.04) * 450, 0, 35);
    }
    else {
        // Fallback: volatility-based uncertainty (legacy behavior).
        uncertaintyPenalty = clamp(monthlyVolatility * 0.5 * 100 * 0.35, 0, 35);
    }
    let confidenceScore = Math.max(10, Math.min(95, Math.round(baseConfidence - uncertaintyPenalty)));
    return confidenceScore;
}
function computePriceRanges(currentPrice, expectedReturn, volatility, days, confidence, historicalReturns) {
    const mid = currentPrice * (1 + expectedReturn);
    // Long horizons carry extra structural uncertainty beyond sqrt(t) scaling —
    // widen the band by 10% at 180d and 20% at 365d.
    const spreadWiden = days >= 365 ? 1.2 : days >= 180 ? 1.1 : 1.0;
    if (historicalReturns && historicalReturns.length >= 10) {
        // Historical simulation: use actual return distribution
        const scaledReturns = historicalReturns.map(r => r * Math.sqrt(days / 30));
        const sorted = [...scaledReturns].sort((a, b) => a - b);
        // Use confidence to select percentile range
        // confidence=90 → use 5th-95th percentiles, confidence=50 → use 25th-75th
        const lowerPct = (100 - confidence) / 200;
        const upperPct = 1 - lowerPct;
        const lowerIdx = Math.floor(lowerPct * sorted.length);
        const upperIdx = Math.min(sorted.length - 1, Math.ceil(upperPct * sorted.length));
        const lowReturn = sorted[lowerIdx] * spreadWiden;
        const highReturn = sorted[upperIdx] * spreadWiden;
        return {
            low: Math.round(Math.max(0, currentPrice * (1 + lowReturn)) * 100) / 100,
            mid: Math.round(mid * 100) / 100,
            high: Math.round(currentPrice * (1 + highReturn) * 100) / 100,
        };
    }
    // Fallback: volatility-scaled range with fat-tail adjustment
    // Use t-distribution-inspired scaling (fatter tails than normal)
    const confidenceFactor = (100 - confidence + 50) / 100;
    const tDistFactor = 1.3; // accounts for fat tails in TCG price data
    const volAdjustment = volatility * Math.sqrt(days / 365) * 1.96 * confidenceFactor * tDistFactor * spreadWiden;
    const low = mid * (1 - volAdjustment);
    const high = mid * (1 + volAdjustment);
    return {
        low: Math.round(Math.max(0, low) * 100) / 100,
        mid: Math.round(mid * 100) / 100,
        high: Math.round(high * 100) / 100,
    };
}
function determineCategory(scores, expected90dReturn, priceChanges, recoveryMetrics, strongBuyThreshold = 0.06) {
    var _a;
    const sq = expected90dReturn;
    // Thresholds are calibrated to realistic (post-calibration) 90d return
    // magnitudes: the market median sits near ~2-4%, so meaningful signals are
    // far smaller than the old uncalibrated ±15%+ bands.
    // Priority 1: Strong buy — a genuinely selective top-slice call. The bar is
    // derived from the calibration curve (75th-percentile bucket mean) so only a
    // small fraction of cards qualify instead of 45-82%.
    if (sq >= strongBuyThreshold && scores.riskScore < 65 && scores.liquidityScore >= 40) {
        return 'strong_buy';
    }
    // Priority 2: Avoid — very high risk regardless of expected return
    if (scores.riskScore > 80) {
        return 'avoid';
    }
    // Priority 3: Downtrend — sustained decline with no recovery signal
    if (priceChanges.change90d !== null && priceChanges.change90d <= -15 &&
        !(recoveryMetrics.recentDrop !== null && recoveryMetrics.recentDrop <= -15 && recoveryMetrics.hasStabilized)) {
        return 'downtrend';
    }
    // Priority 4: Recovery — recent significant drop with stabilization
    if (recoveryMetrics.recentDrop !== null && recoveryMetrics.recentDrop <= -15 && recoveryMetrics.hasStabilized && scores.liquidityScore >= 30) {
        return 'recovery';
    }
    // Priority 5: Momentum — strong recent gains
    if (priceChanges.change30d !== null && priceChanges.change30d >= 8 && scores.liquidityScore >= 35) {
        return 'momentum';
    }
    // Priority 6: Watch dip — moderate expected return
    if (sq >= 0.03 && scores.riskScore < 75 && scores.liquidityScore >= 35) {
        return 'watch_dip';
    }
    // Priority 7: Stagnant — low movement and low liquidity
    const changeMagnitude = Math.abs((_a = priceChanges.change90d) !== null && _a !== void 0 ? _a : 0);
    if (changeMagnitude < 3 && scores.liquidityScore < 50) {
        return 'stagnant';
    }
    // Default: lean toward watch_dip if positive expected return, else stagnant
    return sq > 0 ? 'watch_dip' : 'stagnant';
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
        default:
            return 'No recommendation available';
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
const setReleaseDateCache = new Map();
/** Set release date from catalog_cards, cached per set for the process lifetime. */
function fetchSetReleaseDate(setId) {
    var _a;
    if (setReleaseDateCache.has(setId)) {
        return Promise.resolve((_a = setReleaseDateCache.get(setId)) !== null && _a !== void 0 ? _a : null);
    }
    const db = (0, database_1.getDb)();
    return new Promise((resolve) => {
        db.get(`SELECT setReleaseDate FROM catalog_cards
       WHERE setId = ? AND setReleaseDate IS NOT NULL AND TRIM(setReleaseDate) <> ''
       LIMIT 1`, [setId], (err, row) => {
            const releaseDate = err || !row ? null : row.setReleaseDate;
            setReleaseDateCache.set(setId, releaseDate);
            resolve(releaseDate);
        });
    });
}
function isOnePieceUid(uniqueIdentifier) {
    return uniqueIdentifier.startsWith('op:');
}
function fetchCardPriceHistory(uniqueIdentifier) {
    const db = (0, database_1.getDb)();
    // One Piece series lives in a parallel table; UID is namespaced `op:{catalogId}`.
    if (isOnePieceUid(uniqueIdentifier)) {
        const catalogId = uniqueIdentifier.slice(3);
        return new Promise((resolve, reject) => {
            db.all(`SELECT date, marketPrice, inventoryPrice, source FROM onepiece_price_history
         WHERE catalogId = ?
         ORDER BY date ASC`, [catalogId], (err, rows) => {
                if (err)
                    return reject(err);
                resolve((rows || []).map((r) => {
                    var _a, _b, _c;
                    return ({
                        date: r.date,
                        price: (_b = (_a = r.marketPrice) !== null && _a !== void 0 ? _a : r.inventoryPrice) !== null && _b !== void 0 ? _b : 0,
                        marketPrice: (_c = r.marketPrice) !== null && _c !== void 0 ? _c : r.inventoryPrice,
                        volume: undefined,
                        source: r.source || 'optcg',
                    });
                }));
            });
        });
    }
    return new Promise((resolve, reject) => {
        db.all(`SELECT date, price, marketPrice, volume, source FROM price_history
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
                    source: r.source,
                });
            }));
        });
    });
}
/** Resolved rarity from card_mappings with catalog_cards fallback. */
const RESOLVED_RARITY_EXPR = "COALESCE(NULLIF(TRIM(cm.rarity), ''), cc.rarity)";
function fetchPokemonCards(filter = exports.DEFAULT_CARD_QUALITY_FILTER) {
    const db = (0, database_1.getDb)();
    const { clause: rarityClause, params: rarityParams } = buildRarityWhereClause(RESOLVED_RARITY_EXPR, filter.rarities);
    return new Promise((resolve, reject) => {
        db.all(`SELECT cm.cardId, cm.cardName, cm.setId, cm.setName, cm.cardNumber,
              ${RESOLVED_RARITY_EXPR} AS rarity,
              cm.uniqueIdentifier, cm.variantKey, ph_stats.latest_price, ph_stats.data_point_count,
              cc.setReleaseDate, 'pokemon' AS game
       FROM card_mappings cm
       LEFT JOIN catalog_cards cc ON cc.cardId = cm.cardId
       INNER JOIN (
         SELECT
           ph.uniqueIdentifier,
           COUNT(DISTINCT ph.date) AS data_point_count,
           (
             SELECT COALESCE(ph2.marketPrice, ph2.price)
             FROM price_history ph2
             WHERE ph2.uniqueIdentifier = ph.uniqueIdentifier
               AND ph2.source IN ('tcgcsv', 'tcgdex', 'catalog_fallback')
             ORDER BY ph2.date DESC
             LIMIT 1
           ) AS latest_price
         FROM price_history ph
         WHERE ph.source IN ('tcgcsv', 'tcgdex', 'catalog_fallback')
         GROUP BY ph.uniqueIdentifier
         HAVING data_point_count >= 1
           AND latest_price >= ?
           AND latest_price <= ?
       ) ph_stats ON ph_stats.uniqueIdentifier = cm.uniqueIdentifier
       WHERE cm.cardName IS NOT NULL AND TRIM(cm.cardName) <> ''
         AND ${rarityClause}
         AND ph_stats.data_point_count >= CASE
           WHEN cc.setReleaseDate IS NULL THEN 14
           WHEN julianday('now') - julianday(cc.setReleaseDate) < 30 THEN 3
           WHEN julianday('now') - julianday(cc.setReleaseDate) < 90 THEN 5
           WHEN julianday('now') - julianday(cc.setReleaseDate) < 180 THEN 8
           ELSE 14
         END
       ORDER BY cm.cardName ASC`, [filter.minPrice, filter.maxPrice, ...rarityParams], (err, rows) => {
            if (err)
                return reject(err);
            resolve(rows || []);
        });
    });
}
/** One Piece cards with enough price history for prediction scoring. */
function fetchOnePieceCards(filter = exports.DEFAULT_CARD_QUALITY_FILTER) {
    const db = (0, database_1.getDb)();
    return new Promise((resolve, reject) => {
        db.all(`SELECT
         'op:' || oc.catalogId AS cardId,
         oc.cardName,
         oc.setId,
         oc.setName,
         oc.cardSetId AS cardNumber,
         oc.rarity,
         'op:' || oc.catalogId AS uniqueIdentifier,
         'normal' AS variantKey,
         ph_stats.latest_price,
         ph_stats.data_point_count,
         NULL AS setReleaseDate,
         'onepiece' AS game
       FROM onepiece_catalog oc
       INNER JOIN (
         SELECT
           catalogId,
           COUNT(DISTINCT date) AS data_point_count,
           (
             SELECT COALESCE(oph2.marketPrice, oph2.inventoryPrice)
             FROM onepiece_price_history oph2
             WHERE oph2.catalogId = oph.catalogId
             ORDER BY oph2.date DESC
             LIMIT 1
           ) AS latest_price
         FROM onepiece_price_history oph
         GROUP BY catalogId
         HAVING data_point_count >= 5
           AND latest_price >= ?
           AND latest_price <= ?
       ) ph_stats ON ph_stats.catalogId = oc.catalogId
       WHERE oc.cardName IS NOT NULL AND TRIM(oc.cardName) <> ''
       ORDER BY oc.cardName ASC`, [filter.minPrice, filter.maxPrice], (err, rows) => {
            if (err)
                return reject(err);
            resolve(rows || []);
        });
    });
}
async function fetchAllCards(filter = exports.DEFAULT_CARD_QUALITY_FILTER) {
    const [pokemon, onePiece] = await Promise.all([
        fetchPokemonCards(filter),
        fetchOnePieceCards(filter).catch((err) => {
            logger_1.logger.warn('One Piece card fetch for predictions failed:', err);
            return [];
        }),
    ]);
    return [...pokemon, ...onePiece];
}
async function predictSingleCard(card, allCardReturns, filter = exports.DEFAULT_CARD_QUALITY_FILTER, calibrationModels) {
    var _a, _b, _c, _d;
    try {
        const uid = card.uniqueIdentifier;
        if (!uid)
            return null;
        const rawHistory = await fetchCardPriceHistory(uid);
        const liveQuoteCount = countLiveQuotes(rawHistory);
        const priceHistory = dedupePriceHistoryByDate(rawHistory);
        const setReleaseDate = (_a = card.setReleaseDate) !== null && _a !== void 0 ? _a : await fetchSetReleaseDate(card.setId);
        const minDataPoints = getAdaptiveMinDataPoints(setReleaseDate);
        if (priceHistory.length < minDataPoints)
            return null;
        const currentPrice = (0, marketAnalyzer_1.getLatestPrice)(priceHistory);
        if (!currentPrice || currentPrice <= 0)
            return null;
        if (!isCardInvestmentWorthy(card, priceHistory, currentPrice, filter, setReleaseDate, liveQuoteCount)) {
            return null;
        }
        const movingAverages = (0, marketAnalyzer_1.computeMovingAverages)(priceHistory);
        const priceChanges = (0, marketAnalyzer_1.computePriceChanges)(priceHistory);
        const volatility = (0, marketAnalyzer_1.computeVolatility)(priceHistory);
        const supportResistance = (0, marketAnalyzer_1.findSupportResistance)(priceHistory);
        const recoveryMetrics = (0, marketAnalyzer_1.computeRecoveryMetrics)(priceHistory);
        const liquidityScore = computeLiquidityScore(priceHistory, currentPrice, volatility, setReleaseDate);
        const dataQualityScore = computeDataQualityScore(priceHistory);
        const externalSignals = await (0, externalSignalService_1.searchExternalSignals)(card.cardName, card.setName);
        const externalSignalScore = computeExternalSignalScore(externalSignals);
        const competitiveMetaScore = computeCompetitiveMetaScore(externalSignals);
        const setLifecycleScore = computeSetLifecycleScore(setReleaseDate);
        const avgGradingTotal = await fetchAvgGradingTotal(card.cardId);
        const psa10Pop = await fetchPsa10Population(card.cardId);
        const gradingScore = computeGradingScore(avgGradingTotal, psa10Pop, card.rarity);
        const gradingPremiumPotential = computeGradingPremiumPotential(gradingScore);
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
            liquidityScore,
            dataQualityScore,
            setLifecycleScore,
            competitiveMetaScore,
            gradingScore,
        };
        const models = calibrationModels !== null && calibrationModels !== void 0 ? calibrationModels : (await (0, returnCalibration_1.getCalibrationModels)());
        const seasonalityAdjustment = computeSeasonalityAdjustment(card.cardName, card.setName);
        const expectedReturns = computeExpectedReturns(scores, seasonalityAdjustment, models);
        const horizonStatus = await (0, horizonSupport_1.getHorizonSupportStatus)();
        const honestReturn = (days, value) => horizonStatus.unsupported.includes(days) ? null : value;
        const historicalReturns30d = computeHistoricalReturns(priceHistory, 30);
        const historicalReturns90d = computeHistoricalReturns(priceHistory, 90);
        // Adaptive confidence scoring — use set-age-aware thresholds so newer cards
        // aren't penalized as heavily for having less historical data.
        const adaptiveMinDP = getAdaptiveMinDataPoints(setReleaseDate);
        const confidenceScore = computeCalibratedConfidence({
            trendScore,
            demandScore,
            liquidityScore,
            dataQualityScore,
            riskScore,
            historyLength: priceHistory.length,
            adaptiveMinDP,
            residualStd30d: expectedReturns.residualStd30d,
            monthlyVolatility: volatility.monthlyVolatility,
        });
        if (confidenceScore < filter.minConfidence)
            return null;
        const category = determineCategory(scores, expectedReturns.expected90dReturn, priceChanges, recoveryMetrics, (0, returnCalibration_1.strongBuyThresholdForHorizon)(90, models));
        const er7 = (_b = honestReturn(7, expectedReturns.expected7dReturn)) !== null && _b !== void 0 ? _b : expectedReturns.expected7dReturn;
        const er30 = (_c = honestReturn(30, expectedReturns.expected30dReturn)) !== null && _c !== void 0 ? _c : expectedReturns.expected30dReturn;
        const er90 = (_d = honestReturn(90, expectedReturns.expected90dReturn)) !== null && _d !== void 0 ? _d : expectedReturns.expected90dReturn;
        const er180 = honestReturn(180, expectedReturns.expected180dReturn);
        const er365 = honestReturn(365, expectedReturns.expected365dReturn);
        const predicted7d = computePriceRanges(currentPrice, er7, volatility.dailyVolatility, 7, confidenceScore, historicalReturns30d);
        const predicted30d = computePriceRanges(currentPrice, er30, volatility.dailyVolatility, 30, confidenceScore, historicalReturns30d);
        const predicted90d = computePriceRanges(currentPrice, er90, volatility.dailyVolatility, 90, confidenceScore, historicalReturns90d);
        const zeroBand = { low: currentPrice, mid: currentPrice, high: currentPrice };
        const predicted180d = er180 == null
            ? zeroBand
            : computePriceRanges(currentPrice, er180, volatility.dailyVolatility, 180, confidenceScore, historicalReturns90d);
        const predicted365d = er365 == null
            ? zeroBand
            : computePriceRanges(currentPrice, er365, volatility.dailyVolatility, 365, confidenceScore, historicalReturns90d);
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
            uniqueIdentifier: uid,
            variantKey: card.variantKey || uid.split('|').pop() || 'normal',
            currentPrice,
            predicted7d,
            predicted30d,
            predicted90d,
            predicted180d,
            predicted365d,
            expected7dReturn: er7,
            expected30dReturn: er30,
            expected90dReturn: er90,
            expected180dReturn: er180 !== null && er180 !== void 0 ? er180 : 0,
            expected365dReturn: er365 !== null && er365 !== void 0 ? er365 : 0,
            confidenceScore,
            riskScore,
            category,
            suggestedAction,
            explanation,
            riskFactors,
            externalSignals: externalSignalsJson,
            modelVersion: MODEL_VERSION,
            gradingScore,
            gradingPremiumPotential,
            signalScore: expectedReturns.rawSignal,
        };
    }
    catch (err) {
        logger_1.logger.error(`Prediction failed for card ${card.cardId}:`, err);
        return null;
    }
}
async function runPredictions() {
    const db = (0, database_1.getDb)();
    const horizonSupport = await (0, horizonSupport_1.getHorizonSupportStatus)(true);
    const runId = await new Promise((resolve, reject) => {
        db.run(`INSERT INTO prediction_runs (model_version, notes) VALUES (?, ?)`, [
            MODEL_VERSION,
            `Scheduled prediction run; historyDays=${horizonSupport.historyDays}; experimental=[${horizonSupport.experimental.join(',')}]`,
        ], function (err) {
            if (err)
                reject(err);
            else
                resolve(this.lastID);
        });
    });
    const cards = await fetchAllCards();
    let succeeded = 0;
    let failed = 0;
    const calibrationModels = await (0, returnCalibration_1.getCalibrationModels)();
    const insertStmt = `INSERT OR IGNORE INTO card_predictions (
    run_id, card_id, prediction_date, current_price,
    predicted_7d_low, predicted_7d_mid, predicted_7d_high,
    predicted_30d_low, predicted_30d_mid, predicted_30d_high,
    predicted_90d_low, predicted_90d_mid, predicted_90d_high,
    predicted_180d_low, predicted_180d_mid, predicted_180d_high,
    predicted_365d_low, predicted_365d_mid, predicted_365d_high,
    expected_7d_return, expected_30d_return, expected_90d_return,
    expected_180d_return, expected_365d_return,
    confidence_score, risk_score, category, suggested_action,
    explanation, risk_factors, external_signals_json, model_version,
    unique_identifier, variant_key, signal_score
  ) VALUES (?, ?, date('now'), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    for (const card of cards) {
        try {
            const prediction = await predictSingleCard(card, undefined, exports.DEFAULT_CARD_QUALITY_FILTER, calibrationModels);
            if (!prediction) {
                failed++;
                continue;
            }
            await new Promise((resolve, reject) => {
                var _a;
                db.run(insertStmt, [
                    runId, prediction.cardId, prediction.currentPrice,
                    prediction.predicted7d.low, prediction.predicted7d.mid, prediction.predicted7d.high,
                    prediction.predicted30d.low, prediction.predicted30d.mid, prediction.predicted30d.high,
                    prediction.predicted90d.low, prediction.predicted90d.mid, prediction.predicted90d.high,
                    prediction.predicted180d.low, prediction.predicted180d.mid, prediction.predicted180d.high,
                    prediction.predicted365d.low, prediction.predicted365d.mid, prediction.predicted365d.high,
                    prediction.expected7dReturn, prediction.expected30dReturn, prediction.expected90dReturn,
                    prediction.expected180dReturn, prediction.expected365dReturn,
                    prediction.confidenceScore, prediction.riskScore, prediction.category, prediction.suggestedAction,
                    prediction.explanation, prediction.riskFactors, prediction.externalSignals, prediction.modelVersion,
                    prediction.uniqueIdentifier || null, prediction.variantKey || null,
                    (_a = prediction.signalScore) !== null && _a !== void 0 ? _a : null,
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
    // Closed loop: harvest matured outcomes and rebuild calibration curves so the
    // next run maps raw signals to realistic returns.
    try {
        const { collectForwardTestSamples, rebuildAllCalibrationModels } = await Promise.resolve().then(() => __importStar(require('./returnCalibration')));
        const collected = await collectForwardTestSamples(runId);
        if (collected > 0) {
            logger_1.logger.info(`Calibration: ${collected} new forward-test samples`);
        }
        await rebuildAllCalibrationModels();
        logger_1.logger.info('Calibration models rebuilt after prediction run');
    }
    catch (err) {
        logger_1.logger.warn('Calibration rebuild after prediction run failed:', err);
    }
    logger_1.logger.info(`Prediction run ${runId} complete: ${succeeded} succeeded, ${failed} failed`, {
        historyDays: horizonSupport.historyDays,
        supportedHorizons: horizonSupport.supported,
        experimentalHorizons: horizonSupport.experimental,
    });
    return { runId, total: cards.length, succeeded, failed, horizonSupport };
}
const WINDOW_RETURN_COLUMNS = {
    '7d': 'expected_7d_return',
    '30d': 'expected_30d_return',
    '90d': 'expected_90d_return',
    '180d': 'expected_180d_return',
    '365d': 'expected_365d_return',
};
function isPredictionWindow(value) {
    return value in WINDOW_RETURN_COLUMNS;
}
/**
 * Resolves era IDs to matching set IDs by classifying all sets in catalog_cards.
 * Returns a flat list of set IDs that belong to any of the requested eras.
 */
async function resolveEraToSetIds(eras) {
    const db = (0, database_1.getDb)();
    const rows = await new Promise((resolve, reject) => {
        db.all(`SELECT DISTINCT setId, setName FROM catalog_cards`, [], (err, r) => err ? reject(err) : resolve(r || []));
    });
    // Import classifySetEra dynamically to avoid circular deps at top-level
    const { classifySetEra } = await Promise.resolve().then(() => __importStar(require('../utils/setEra')));
    return rows
        .filter(row => eras.includes(classifySetEra({ id: row.setId, name: row.setName })))
        .map(row => row.setId);
}
async function getLatestPredictions(limit = 100, category, filters, window = '90d') {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
    const db = (0, database_1.getDb)();
    // Resolve era filter to set IDs up-front (single DB query)
    let eraSetIds = null;
    if ((filters === null || filters === void 0 ? void 0 : filters.eras) && filters.eras.length > 0) {
        eraSetIds = await resolveEraToSetIds(filters.eras);
        if (eraSetIds.length === 0)
            return []; // no sets match these eras
    }
    // Merge explicit setIds with era-resolved setIds (intersection if both provided)
    let effectiveSetIds = (_a = filters === null || filters === void 0 ? void 0 : filters.setIds) !== null && _a !== void 0 ? _a : null;
    if (eraSetIds && effectiveSetIds) {
        effectiveSetIds = effectiveSetIds.filter(id => eraSetIds.includes(id));
        if (effectiveSetIds.length === 0)
            return [];
    }
    else if (eraSetIds) {
        effectiveSetIds = eraSetIds;
    }
    let sql = `
    SELECT cp.*,
           ${CARD_METADATA_SELECT}
    FROM card_predictions cp
    ${CARD_METADATA_JOIN}
    WHERE cp.run_id = (SELECT MAX(id) FROM prediction_runs)
  `;
    const params = [];
    if (category) {
        sql += ' AND cp.category = ?';
        params.push(category);
    }
    if ((filters === null || filters === void 0 ? void 0 : filters.game) === 'onepiece') {
        sql += ` AND cp.card_id LIKE 'op:%'`;
    }
    else if ((filters === null || filters === void 0 ? void 0 : filters.game) === 'pokemon') {
        sql += ` AND cp.card_id NOT LIKE 'op:%'`;
    }
    if ((filters === null || filters === void 0 ? void 0 : filters.minPrice) !== undefined) {
        sql += ' AND cp.current_price >= ?';
        params.push(filters.minPrice);
    }
    if ((filters === null || filters === void 0 ? void 0 : filters.maxPrice) !== undefined) {
        sql += ' AND cp.current_price <= ?';
        params.push(filters.maxPrice);
    }
    if ((filters === null || filters === void 0 ? void 0 : filters.minConfidence) !== undefined) {
        sql += ' AND cp.confidence_score >= ?';
        params.push(filters.minConfidence);
    }
    const rarityColumn = `COALESCE(NULLIF(TRIM(cm_pred.rarity), ''), cm_fallback.rarity)`;
    if ((filters === null || filters === void 0 ? void 0 : filters.rarities) && filters.rarities.length > 0) {
        const { clause, params: rarityParams } = buildRarityWhereClause(rarityColumn, filters.rarities);
        sql += ` AND ${clause}`;
        params.push(...rarityParams);
    }
    const setIdColumn = `COALESCE(cm_pred.setId, cm_fallback.setId)`;
    // Era/Set filtering: use IN clause with resolved set IDs
    if (effectiveSetIds && effectiveSetIds.length > 0) {
        const placeholders = effectiveSetIds.map(() => '?').join(',');
        sql += ` AND ${setIdColumn} IN (${placeholders})`;
        params.push(...effectiveSetIds);
    }
    // Release date range filtering: join catalog_cards for setReleaseDate
    if ((filters === null || filters === void 0 ? void 0 : filters.releaseDateFrom) || (filters === null || filters === void 0 ? void 0 : filters.releaseDateTo)) {
        sql += ` LEFT JOIN (
      SELECT cardId, setReleaseDate FROM catalog_cards
      GROUP BY cardId
    ) cc_dates ON cc_dates.cardId = cp.card_id`;
        if (filters.releaseDateFrom) {
            sql += ' AND cc_dates.setReleaseDate >= ?';
            params.push(filters.releaseDateFrom);
        }
        if (filters.releaseDateTo) {
            sql += ' AND cc_dates.setReleaseDate <= ?';
            params.push(filters.releaseDateTo);
        }
    }
    if (filters === null || filters === void 0 ? void 0 : filters.search) {
        sql += ' AND (cm_fallback.cardName LIKE ? OR cm_pred.cardName LIKE ?)';
        const like = `%${filters.search}%`;
        params.push(like, like);
    }
    const sortColumn = (() => {
        var _a;
        switch (filters === null || filters === void 0 ? void 0 : filters.sortBy) {
            case 'confidence': return 'cp.confidence_score';
            case 'price': return 'cp.current_price';
            case 'name': return 'COALESCE(cm_pred.cardName, cm_fallback.cardName)';
            case 'risk': return 'cp.risk_score';
            default: {
                const col = (_a = WINDOW_RETURN_COLUMNS[window]) !== null && _a !== void 0 ? _a : WINDOW_RETURN_COLUMNS['90d'];
                return `COALESCE(cp.${col}, cp.expected_90d_return)`;
            }
        }
    })();
    const sortDir = (filters === null || filters === void 0 ? void 0 : filters.sortOrder) === 'asc' ? 'ASC' : 'DESC';
    // Over-fetch so post-filter for tracking quality can still fill the page.
    const fetchLimit = Math.min(Math.max(limit * 4, limit + 50), 2000);
    sql += ` ORDER BY ${sortColumn} ${sortDir} LIMIT ?`;
    params.push(fetchLimit);
    const rows = await new Promise((resolve, reject) => {
        db.all(sql, params, (err, r) => {
            if (err)
                return reject(err);
            resolve(r || []);
        });
    });
    // Resolve UIDs up front (old runs lack unique_identifier).
    const resolvedMappings = await Promise.all(rows.map(async (r) => {
        const stored = r.unique_identifier;
        if (stored) {
            const meta = await lookupMappingMeta(stored);
            return {
                uid: stored,
                variantKey: r.variant_key || (meta === null || meta === void 0 ? void 0 : meta.variantKey) || stored.split('|').pop() || undefined,
                productId: (meta === null || meta === void 0 ? void 0 : meta.productId) || r.tcgplayerProductId || undefined,
            };
        }
        return resolveMappingForPrediction(r.card_id, r.current_price);
    }));
    // Batch-load history for unique UIDs only.
    const uniqueUids = [
        ...new Set(resolvedMappings.map((m) => m === null || m === void 0 ? void 0 : m.uid).filter((u) => !!u)),
    ];
    const historyByUid = new Map();
    await Promise.all(uniqueUids.map(async (uid) => {
        historyByUid.set(uid, await fetchCardPriceHistory(uid));
    }));
    const mapped = [];
    for (let i = 0; i < rows.length; i++) {
        if (mapped.length >= limit)
            break;
        const r = rows[i];
        const resolved = resolvedMappings[i];
        if (!(resolved === null || resolved === void 0 ? void 0 : resolved.uid))
            continue;
        const rawHistory = historyByUid.get(resolved.uid) || [];
        const liveQuoteCount = countLiveQuotes(rawHistory);
        const priceHistory = dedupePriceHistoryByDate(rawHistory);
        if (!hasAdequateTrackingHistory(priceHistory, liveQuoteCount)) {
            continue;
        }
        mapped.push({
            id: r.id,
            cardId: r.card_id,
            cardName: r.cardName || '',
            setId: r.setId || '',
            setName: r.setName || '',
            cardNumber: r.cardNumber || '',
            rarity: r.rarity || '',
            uniqueIdentifier: resolved.uid,
            variantKey: resolved.variantKey,
            imageSmall: r.imageSmall || undefined,
            imageLarge: r.imageLarge || undefined,
            tcgplayerProductId: resolved.productId || r.tcgplayerProductId || undefined,
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
            predicted180dLow: (_b = r.predicted_180d_low) !== null && _b !== void 0 ? _b : null,
            predicted180dMid: (_c = r.predicted_180d_mid) !== null && _c !== void 0 ? _c : null,
            predicted180dHigh: (_d = r.predicted_180d_high) !== null && _d !== void 0 ? _d : null,
            predicted365dLow: (_e = r.predicted_365d_low) !== null && _e !== void 0 ? _e : null,
            predicted365dMid: (_f = r.predicted_365d_mid) !== null && _f !== void 0 ? _f : null,
            predicted365dHigh: (_g = r.predicted_365d_high) !== null && _g !== void 0 ? _g : null,
            expected7dReturn: r.expected_7d_return,
            expected30dReturn: r.expected_30d_return,
            expected90dReturn: r.expected_90d_return,
            expected180dReturn: (_h = r.expected_180d_return) !== null && _h !== void 0 ? _h : null,
            expected365dReturn: (_j = r.expected_365d_return) !== null && _j !== void 0 ? _j : null,
            confidenceScore: r.confidence_score,
            riskScore: r.risk_score,
            category: r.category,
            suggestedAction: r.suggested_action,
            explanation: r.explanation,
            riskFactors: r.risk_factors,
            externalSignals: r.external_signals_json,
            modelVersion: r.model_version,
            signalScore: (_k = r.signal_score) !== null && _k !== void 0 ? _k : undefined,
        });
    }
    // Enrich with grading premium signals (AI grades + PSA-10 scarcity)
    await Promise.all(mapped.map(async (row) => {
        const [avgTotal, psa10] = await Promise.all([
            fetchAvgGradingTotal(row.cardId),
            fetchPsa10Population(row.cardId),
        ]);
        const gradingScore = computeGradingScore(avgTotal, psa10, row.rarity);
        row.gradingScore = gradingScore;
        row.gradingPremiumPotential = computeGradingPremiumPotential(gradingScore);
    }));
    return mapped;
}
/** Match a stored prediction price back to the mapping UID used at score time. */
async function resolveMappingForPrediction(cardId, currentPrice) {
    if (!cardId || currentPrice == null)
        return null;
    const db = (0, database_1.getDb)();
    const row = await new Promise((resolve, reject) => {
        db.get(`SELECT cm.uniqueIdentifier, cm.variantKey,
              COALESCE(cm.tcgplayerProductId, CAST(cm.productId AS TEXT)) AS productId
       FROM card_mappings cm
       WHERE cm.cardId = ?
         AND ABS(
           COALESCE((
             SELECT COALESCE(ph.marketPrice, ph.price)
             FROM price_history ph
             WHERE ph.uniqueIdentifier = cm.uniqueIdentifier
               AND ph.source IN ('tcgcsv', 'tcgdex', 'catalog_fallback')
             ORDER BY ph.date DESC
             LIMIT 1
           ), -1) - ?
         ) < 0.02
       ORDER BY (
         SELECT COUNT(DISTINCT ph.date)
         FROM price_history ph
         WHERE ph.uniqueIdentifier = cm.uniqueIdentifier
           AND ph.source IN ('tcgcsv', 'tcgdex', 'catalog_fallback')
       ) DESC
       LIMIT 1`, [cardId, currentPrice], (err, r) => (err ? reject(err) : resolve(r || null)));
    });
    if (!(row === null || row === void 0 ? void 0 : row.uniqueIdentifier))
        return null;
    return {
        uid: row.uniqueIdentifier,
        variantKey: row.variantKey || row.uniqueIdentifier.split('|').pop() || undefined,
        productId: row.productId || undefined,
    };
}
async function lookupMappingMeta(uniqueIdentifier) {
    const db = (0, database_1.getDb)();
    const row = await new Promise((resolve, reject) => {
        db.get(`SELECT variantKey,
              COALESCE(tcgplayerProductId, CAST(productId AS TEXT)) AS productId
       FROM card_mappings
       WHERE uniqueIdentifier = ?
       LIMIT 1`, [uniqueIdentifier], (err, r) => (err ? reject(err) : resolve(r || null)));
    });
    if (!row)
        return null;
    return {
        variantKey: row.variantKey || undefined,
        productId: row.productId || undefined,
    };
}
