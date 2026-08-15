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
exports.isPredictionWindow = exports.SLAB_QUALITY_FILTER = exports.SLAB_MIN_SPAN_DAYS = exports.SLAB_MIN_DATA_POINTS = exports.SLAB_GRADE = exports.SLAB_GRADER = exports.SLAB_MODEL_VERSION = void 0;
exports.slabUid = slabUid;
exports.preferCatalogOverTcgcsv = preferCatalogOverTcgcsv;
exports.fetchPsa10History = fetchPsa10History;
exports.fetchPsa10HistoryUpTo = fetchPsa10HistoryUpTo;
exports.fetchPsa10PriceNear = fetchPsa10PriceNear;
exports.fetchSlabUniverse = fetchSlabUniverse;
exports.fetchAllPsa10HistoryByCard = fetchAllPsa10HistoryByCard;
exports.getSlabPredictionRunStatus = getSlabPredictionRunStatus;
exports.startSlabPredictionsInBackground = startSlabPredictionsInBackground;
exports.runSlabPredictions = runSlabPredictions;
exports.getLatestSlabPredictions = getLatestSlabPredictions;
exports.getSlabOverview = getSlabOverview;
exports.getSlabCardPrediction = getSlabCardPrediction;
exports.getSlabPredictionResult = getSlabPredictionResult;
exports.updateSlabExplanation = updateSlabExplanation;
const database_1 = require("../db/database");
const logger_1 = require("../utils/logger");
const setEra_1 = require("../utils/setEra");
const horizonSupport_1 = require("./horizonSupport");
const predictionEngine_1 = require("./predictionEngine");
Object.defineProperty(exports, "isPredictionWindow", { enumerable: true, get: function () { return predictionEngine_1.isPredictionWindow; } });
const returnCalibration_1 = require("./returnCalibration");
exports.SLAB_MODEL_VERSION = '4.0.0-slab';
exports.SLAB_GRADER = 'psa';
exports.SLAB_GRADE = '10';
/** Nightly snapshots are ~1 point/day; 5 points is enough once span clears. */
exports.SLAB_MIN_DATA_POINTS = 5;
/**
 * Graded history is our own snapshots, not years of TCGPlayer prints.
 * Requiring 14 days emptied the universe while PSA 10 series only spanned ~8d.
 */
exports.SLAB_MIN_SPAN_DAYS = 3;
exports.SLAB_QUALITY_FILTER = {
    minPrice: 10,
    maxPrice: 100000,
    minDataPoints: exports.SLAB_MIN_DATA_POINTS,
    minConfidence: 10,
    rarities: [],
    excludeStagnant: false,
};
const WINDOW_RETURN_COLUMNS = {
    '7d': 'expected_7d_return',
    '30d': 'expected_30d_return',
    '90d': 'expected_90d_return',
    '180d': 'expected_180d_return',
    '365d': 'expected_365d_return',
};
function all(sql, params = []) {
    return new Promise((resolve, reject) => {
        (0, database_1.getDb)().all(sql, params, (err, rows) => (err ? reject(err) : resolve((rows || []))));
    });
}
function get(sql, params = []) {
    return new Promise((resolve, reject) => {
        (0, database_1.getDb)().get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
    });
}
function run(sql, params = []) {
    return new Promise((resolve, reject) => {
        (0, database_1.getDb)().run(sql, params, function (err) {
            if (err)
                reject(err);
            else
                resolve(this.lastID);
        });
    });
}
function slabUid(cardId) {
    return `slab:psa10:${cardId}`;
}
function preferCatalogOverTcgcsv(rows) {
    var _a, _b;
    const byProduct = new Map();
    const unique = [];
    for (const row of rows) {
        const pid = row.productId;
        if (!pid) {
            unique.push(row);
            continue;
        }
        const group = (_a = byProduct.get(pid)) !== null && _a !== void 0 ? _a : [];
        group.push(row);
        byProduct.set(pid, group);
    }
    for (const group of byProduct.values()) {
        if (group.length === 1) {
            unique.push(group[0]);
            continue;
        }
        unique.push((_b = group.find((g) => !g.cardId.startsWith('tcgcsv-'))) !== null && _b !== void 0 ? _b : group[0]);
    }
    return unique;
}
async function fetchPsa10History(cardId) {
    const rows = await all(`SELECT date, price, source
     FROM graded_price_history
     WHERE cardId = ?
       AND LOWER(grader) = ?
       AND grade = ?
       AND price > 0
     ORDER BY date ASC`, [cardId, exports.SLAB_GRADER, exports.SLAB_GRADE]);
    return rows.map((r) => ({
        date: r.date,
        price: r.price,
        marketPrice: r.price,
        source: r.source || 'pricecharting',
    }));
}
async function fetchPsa10HistoryUpTo(cardId, cutoffDate) {
    const rows = await all(`SELECT date, price, source
     FROM graded_price_history
     WHERE cardId = ?
       AND LOWER(grader) = ?
       AND grade = ?
       AND price > 0
       AND date <= ?
     ORDER BY date ASC`, [cardId, exports.SLAB_GRADER, exports.SLAB_GRADE, cutoffDate]);
    return rows.map((r) => ({
        date: r.date,
        price: r.price,
        marketPrice: r.price,
        source: r.source || 'pricecharting',
    }));
}
async function fetchPsa10PriceNear(cardId, fromDate, toDate) {
    var _a;
    const row = await get(`SELECT price
     FROM graded_price_history
     WHERE cardId = ?
       AND LOWER(grader) = ?
       AND grade = ?
       AND price > 0
       AND date >= ?
       AND date <= ?
     ORDER BY date DESC
     LIMIT 1`, [cardId, exports.SLAB_GRADER, exports.SLAB_GRADE, fromDate, toDate]);
    return (_a = row === null || row === void 0 ? void 0 : row.price) !== null && _a !== void 0 ? _a : null;
}
async function fetchSlabUniverse(filter = exports.SLAB_QUALITY_FILTER) {
    const rows = await all(`SELECT
       gp.cardId,
       COALESCE(NULLIF(TRIM(cm.cardName), ''), gp.cardName) AS cardName,
       COALESCE(cm.setId, gp.setId) AS setId,
       COALESCE(cm.setName, gp.setName) AS setName,
       cm.cardNumber,
       COALESCE(NULLIF(TRIM(cm.rarity), ''), cc.rarity) AS rarity,
       gp.productId,
       gp.price AS latestPrice,
       hist.data_point_count AS dataPointCount,
       cc.setReleaseDate,
       MIN(NULLIF(cm.imageSmall, '')) AS imageSmall,
       MIN(NULLIF(cm.imageLarge, '')) AS imageLarge
     FROM graded_prices gp
     LEFT JOIN card_mappings cm ON cm.cardId = gp.cardId
     LEFT JOIN catalog_cards cc ON cc.cardId = gp.cardId
     INNER JOIN (
       SELECT cardId,
              COUNT(*) AS data_point_count,
              MIN(date) AS min_date,
              MAX(date) AS max_date
       FROM graded_price_history
       WHERE LOWER(grader) = 'psa' AND grade = '10' AND price > 0
       GROUP BY cardId
       HAVING data_point_count >= ?
         AND julianday(max_date) - julianday(min_date) >= ?
     ) hist ON hist.cardId = gp.cardId
     WHERE LOWER(gp.grader) = 'psa'
       AND gp.grade = '10'
       AND gp.price >= ?
       AND gp.price <= ?
       AND COALESCE(gp.verified, 0) = 1
       AND COALESCE(NULLIF(TRIM(cm.cardName), ''), gp.cardName) IS NOT NULL
     GROUP BY gp.cardId
     ORDER BY gp.price DESC`, [filter.minDataPoints, exports.SLAB_MIN_SPAN_DAYS, filter.minPrice, filter.maxPrice]);
    return preferCatalogOverTcgcsv(rows).map((r) => ({
        cardId: r.cardId,
        cardName: r.cardName,
        setId: r.setId || '',
        setName: r.setName || '',
        cardNumber: r.cardNumber || undefined,
        rarity: r.rarity || undefined,
        productId: r.productId,
        uniqueIdentifier: slabUid(r.cardId),
        variantKey: 'psa10',
        setReleaseDate: r.setReleaseDate,
        latestPrice: r.latestPrice,
        dataPointCount: r.dataPointCount,
        imageSmall: r.imageSmall,
        imageLarge: r.imageLarge,
    }));
}
async function fetchAllPsa10HistoryByCard() {
    var _a;
    const rows = await all(`SELECT cardId, date, price, source
     FROM graded_price_history
     WHERE LOWER(grader) = ? AND grade = ? AND price > 0
     ORDER BY cardId ASC, date ASC`, [exports.SLAB_GRADER, exports.SLAB_GRADE]);
    const byCard = new Map();
    for (const r of rows) {
        const list = (_a = byCard.get(r.cardId)) !== null && _a !== void 0 ? _a : [];
        list.push({
            date: r.date,
            price: r.price,
            marketPrice: r.price,
            source: r.source || 'pricecharting',
        });
        byCard.set(r.cardId, list);
    }
    return byCard;
}
let slabRunLock = null;
let slabRunMeta = {
    running: false,
    startedAt: null,
    last: null,
};
function getSlabPredictionRunStatus() {
    return { ...slabRunMeta };
}
/** Fire-and-forget so the HTTP request isn't killed by the 30s axios timeout. */
function startSlabPredictionsInBackground() {
    if (slabRunLock) {
        return { started: false, alreadyRunning: true };
    }
    slabRunMeta = { running: true, startedAt: new Date().toISOString(), last: slabRunMeta.last };
    slabRunLock = runSlabPredictions()
        .then((last) => {
        slabRunMeta = { running: false, startedAt: null, last };
        return last;
    })
        .catch((err) => {
        logger_1.logger.error('Background slab prediction run failed', { error: err.message });
        slabRunMeta = { running: false, startedAt: null, last: slabRunMeta.last };
        return {
            runId: 0,
            total: 0,
            succeeded: 0,
            failed: 0,
            historyDays: 0,
            historyMinDate: null,
            historyMaxDate: null,
        };
    })
        .finally(() => {
        slabRunLock = null;
    });
    return { started: true, alreadyRunning: false };
}
async function runSlabPredictions() {
    var _a, _b;
    const horizonSupport = await (0, horizonSupport_1.getGradedHorizonSupportStatus)(true);
    const span = await (0, horizonSupport_1.getGradedPriceHistorySpanDays)();
    const runId = await run(`INSERT INTO slab_prediction_runs (model_version, notes) VALUES (?, ?)`, [
        exports.SLAB_MODEL_VERSION,
        `PSA 10 slab run; historyDays=${horizonSupport.historyDays}; experimental=[${horizonSupport.experimental.join(',')}]`,
    ]);
    const cards = await fetchSlabUniverse();
    const historyByCard = await fetchAllPsa10HistoryByCard();
    let succeeded = 0;
    let failed = 0;
    const calibrationModels = await (0, returnCalibration_1.getCalibrationModels)();
    const insertStmt = `INSERT OR IGNORE INTO slab_predictions (
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
    unique_identifier, variant_key, signal_score, grader, grade
  ) VALUES (?, ?, date('now'), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    for (const card of cards) {
        try {
            const history = (_a = historyByCard.get(card.cardId)) !== null && _a !== void 0 ? _a : [];
            const prediction = await (0, predictionEngine_1.predictSingleCard)(card, undefined, exports.SLAB_QUALITY_FILTER, calibrationModels, {
                priceHistory: history,
                skipInvestmentFilter: true,
                skipAuxiliaryLookups: true,
                minDataPoints: exports.SLAB_MIN_DATA_POINTS,
                horizonSupport,
            });
            if (!prediction) {
                failed++;
                continue;
            }
            await run(insertStmt, [
                runId,
                prediction.cardId,
                prediction.currentPrice,
                prediction.predicted7d.low, prediction.predicted7d.mid, prediction.predicted7d.high,
                prediction.predicted30d.low, prediction.predicted30d.mid, prediction.predicted30d.high,
                prediction.predicted90d.low, prediction.predicted90d.mid, prediction.predicted90d.high,
                prediction.predicted180d.low, prediction.predicted180d.mid, prediction.predicted180d.high,
                prediction.predicted365d.low, prediction.predicted365d.mid, prediction.predicted365d.high,
                prediction.expected7dReturn, prediction.expected30dReturn, prediction.expected90dReturn,
                prediction.expected180dReturn, prediction.expected365dReturn,
                prediction.confidenceScore, prediction.riskScore, prediction.category, prediction.suggestedAction,
                prediction.explanation, prediction.riskFactors, prediction.externalSignals, exports.SLAB_MODEL_VERSION,
                prediction.uniqueIdentifier || slabUid(card.cardId), prediction.variantKey || 'psa10',
                (_b = prediction.signalScore) !== null && _b !== void 0 ? _b : null,
                exports.SLAB_GRADER, exports.SLAB_GRADE,
            ]);
            succeeded++;
        }
        catch (err) {
            logger_1.logger.warn(`Slab prediction failed for ${card.cardName}:`, err);
            failed++;
        }
    }
    logger_1.logger.info(`Slab prediction run ${runId} complete: ${succeeded} succeeded, ${failed} failed`, {
        historyDays: horizonSupport.historyDays,
        universe: cards.length,
    });
    if (cards.length === 0) {
        logger_1.logger.warn('Slab prediction universe was empty', {
            minDataPoints: exports.SLAB_MIN_DATA_POINTS,
            minSpanDays: exports.SLAB_MIN_SPAN_DAYS,
            historyDays: span.days,
            historyMinDate: span.minDate,
            historyMaxDate: span.maxDate,
        });
    }
    try {
        const { updateSlabActualResults } = await Promise.resolve().then(() => __importStar(require('./slabForwardTest')));
        const ft = await updateSlabActualResults();
        logger_1.logger.info(`Slab forward-test update after prediction run: ${ft.updated} rows`);
    }
    catch (err) {
        logger_1.logger.warn('Slab forward-test update after prediction run failed:', err);
    }
    return {
        runId,
        total: cards.length,
        succeeded,
        failed,
        historyDays: span.days,
        historyMinDate: span.minDate,
        historyMaxDate: span.maxDate,
    };
}
async function resolveEraToSetIds(eras) {
    const rows = await all(`SELECT DISTINCT setId, setName FROM catalog_cards`);
    return rows
        .filter((row) => eras.includes((0, setEra_1.classifySetEra)({ id: row.setId, name: row.setName })))
        .map((row) => row.setId);
}
const SLAB_METADATA_JOIN = `
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
  ) cm ON cm.cardId = sp.card_id
`;
const SLAB_METADATA_SELECT = `
  COALESCE(cm.cardName, sp.card_id) AS cardName,
  COALESCE(cm.setName, '') AS setName,
  COALESCE(cm.setId, '') AS setId,
  COALESCE(cm.cardNumber, '') AS cardNumber,
  COALESCE(cm.rarity, '') AS rarity,
  cm.imageLarge AS imageLarge,
  cm.imageSmall AS imageSmall,
  cm.tcgplayerProductId AS tcgplayerProductId
`;
async function getLatestSlabPredictions(limit = 100, category, filters, window = '90d') {
    var _a;
    let eraSetIds = null;
    if ((filters === null || filters === void 0 ? void 0 : filters.eras) && filters.eras.length > 0) {
        eraSetIds = await resolveEraToSetIds(filters.eras);
        if (eraSetIds.length === 0)
            return [];
    }
    let effectiveSetIds = (_a = filters === null || filters === void 0 ? void 0 : filters.setIds) !== null && _a !== void 0 ? _a : null;
    if (eraSetIds && effectiveSetIds) {
        effectiveSetIds = effectiveSetIds.filter((id) => eraSetIds.includes(id));
        if (effectiveSetIds.length === 0)
            return [];
    }
    else if (eraSetIds) {
        effectiveSetIds = eraSetIds;
    }
    let sql = `
    SELECT sp.*,
           ${SLAB_METADATA_SELECT}
    FROM slab_predictions sp
    ${SLAB_METADATA_JOIN}
    WHERE sp.run_id = (SELECT MAX(id) FROM slab_prediction_runs)
  `;
    const params = [];
    if (category) {
        sql += ' AND sp.category = ?';
        params.push(category);
    }
    if ((filters === null || filters === void 0 ? void 0 : filters.minPrice) !== undefined) {
        sql += ' AND sp.current_price >= ?';
        params.push(filters.minPrice);
    }
    if ((filters === null || filters === void 0 ? void 0 : filters.maxPrice) !== undefined) {
        sql += ' AND sp.current_price <= ?';
        params.push(filters.maxPrice);
    }
    if ((filters === null || filters === void 0 ? void 0 : filters.minConfidence) !== undefined) {
        sql += ' AND sp.confidence_score >= ?';
        params.push(filters.minConfidence);
    }
    if (effectiveSetIds && effectiveSetIds.length > 0) {
        const placeholders = effectiveSetIds.map(() => '?').join(',');
        sql += ` AND COALESCE(cm.setId, '') IN (${placeholders})`;
        params.push(...effectiveSetIds);
    }
    if ((filters === null || filters === void 0 ? void 0 : filters.releaseDateFrom) || (filters === null || filters === void 0 ? void 0 : filters.releaseDateTo)) {
        sql += ` LEFT JOIN (
      SELECT cardId, setReleaseDate FROM catalog_cards GROUP BY cardId
    ) cc_dates ON cc_dates.cardId = sp.card_id`;
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
        sql += ' AND cm.cardName LIKE ?';
        params.push(`%${filters.search}%`);
    }
    const sortColumn = (() => {
        var _a;
        switch (filters === null || filters === void 0 ? void 0 : filters.sortBy) {
            case 'confidence': return 'sp.confidence_score';
            case 'price': return 'sp.current_price';
            case 'name': return 'cm.cardName';
            case 'risk': return 'sp.risk_score';
            default: {
                const col = (_a = WINDOW_RETURN_COLUMNS[window]) !== null && _a !== void 0 ? _a : WINDOW_RETURN_COLUMNS['90d'];
                return `COALESCE(sp.${col}, sp.expected_90d_return)`;
            }
        }
    })();
    const sortDir = (filters === null || filters === void 0 ? void 0 : filters.sortOrder) === 'asc' ? 'ASC' : 'DESC';
    sql += ` ORDER BY ${sortColumn} ${sortDir} LIMIT ?`;
    params.push(Math.min(Math.max(limit, 1), 500));
    const rows = await all(sql, params);
    return rows.map((r) => {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j;
        return ({
            id: r.id,
            cardId: r.card_id,
            cardName: r.cardName || '',
            setId: r.setId || '',
            setName: r.setName || '',
            cardNumber: r.cardNumber || '',
            rarity: r.rarity || '',
            uniqueIdentifier: r.unique_identifier || slabUid(r.card_id),
            variantKey: r.variant_key || 'psa10',
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
            predicted180dLow: (_a = r.predicted_180d_low) !== null && _a !== void 0 ? _a : null,
            predicted180dMid: (_b = r.predicted_180d_mid) !== null && _b !== void 0 ? _b : null,
            predicted180dHigh: (_c = r.predicted_180d_high) !== null && _c !== void 0 ? _c : null,
            predicted365dLow: (_d = r.predicted_365d_low) !== null && _d !== void 0 ? _d : null,
            predicted365dMid: (_e = r.predicted_365d_mid) !== null && _e !== void 0 ? _e : null,
            predicted365dHigh: (_f = r.predicted_365d_high) !== null && _f !== void 0 ? _f : null,
            expected7dReturn: r.expected_7d_return,
            expected30dReturn: r.expected_30d_return,
            expected90dReturn: r.expected_90d_return,
            expected180dReturn: (_g = r.expected_180d_return) !== null && _g !== void 0 ? _g : null,
            expected365dReturn: (_h = r.expected_365d_return) !== null && _h !== void 0 ? _h : null,
            confidenceScore: r.confidence_score,
            riskScore: r.risk_score,
            category: r.category,
            suggestedAction: r.suggested_action,
            explanation: r.explanation,
            riskFactors: r.risk_factors,
            externalSignals: r.external_signals_json,
            modelVersion: r.model_version,
            signalScore: (_j = r.signal_score) !== null && _j !== void 0 ? _j : undefined,
        });
    });
}
async function getSlabOverview() {
    var _a, _b, _c, _d;
    const latestRun = `(SELECT MAX(id) FROM slab_prediction_runs)`;
    const statsRow = await get(`SELECT
      COUNT(*) AS totalPredictions,
      ROUND(AVG(confidence_score), 1) AS avgConfidence,
      ROUND(AVG(risk_score), 1) AS avgRisk,
      ROUND(AVG(expected_90d_return), 4) AS avgExpectedReturn90d,
      ROUND(AVG(expected_30d_return), 4) AS avgExpectedReturn30d,
      SUM(CASE WHEN expected_90d_return > 0.01 THEN 1 ELSE 0 END) AS bullishCount,
      SUM(CASE WHEN expected_90d_return < -0.01 THEN 1 ELSE 0 END) AS bearishCount
     FROM slab_predictions
     WHERE run_id = ${latestRun}`);
    const categoryRows = await all(`SELECT category, COUNT(*) AS count
     FROM slab_predictions
     WHERE run_id = ${latestRun}
     GROUP BY category
     ORDER BY count DESC`);
    const topGainers = await all(`SELECT sp.card_id, cm.cardName, sp.current_price, sp.expected_90d_return,
            sp.confidence_score, sp.category
     FROM slab_predictions sp
     LEFT JOIN (
       SELECT cardId, MIN(cardName) AS cardName FROM card_mappings GROUP BY cardId
     ) cm ON cm.cardId = sp.card_id
     WHERE sp.run_id = ${latestRun}
       AND sp.expected_90d_return IS NOT NULL
       AND sp.confidence_score >= 40
     ORDER BY sp.expected_90d_return DESC
     LIMIT 5`);
    const topLosers = await all(`SELECT sp.card_id, cm.cardName, sp.current_price, sp.expected_90d_return,
            sp.confidence_score, sp.category
     FROM slab_predictions sp
     LEFT JOIN (
       SELECT cardId, MIN(cardName) AS cardName FROM card_mappings GROUP BY cardId
     ) cm ON cm.cardId = sp.card_id
     WHERE sp.run_id = ${latestRun}
       AND sp.expected_90d_return IS NOT NULL
       AND sp.confidence_score >= 40
     ORDER BY sp.expected_90d_return ASC
     LIMIT 5`);
    const confidenceBuckets = await all(`SELECT
        CASE
          WHEN confidence_score >= 80 THEN '80-100'
          WHEN confidence_score >= 60 THEN '60-79'
          WHEN confidence_score >= 40 THEN '40-59'
          WHEN confidence_score >= 20 THEN '20-39'
          ELSE '0-19'
        END AS bucket,
        COUNT(*) AS count
     FROM slab_predictions
     WHERE run_id = ${latestRun}
     GROUP BY bucket
     ORDER BY bucket DESC`);
    const bullishCount = (statsRow === null || statsRow === void 0 ? void 0 : statsRow.bullishCount) || 0;
    const bearishCount = (statsRow === null || statsRow === void 0 ? void 0 : statsRow.bearishCount) || 0;
    const totalDirectional = bullishCount + bearishCount;
    let marketDirection = 'neutral';
    if (totalDirectional > 0) {
        const bullishShare = bullishCount / totalDirectional;
        if (bullishShare > 0.55)
            marketDirection = 'bullish';
        else if (bullishShare < 0.45)
            marketDirection = 'bearish';
    }
    const calibrationModels = await (0, returnCalibration_1.getCalibrationModels)();
    const mapMover = (r) => ({
        cardId: r.card_id,
        cardName: r.cardName || r.card_id,
        currentPrice: r.current_price,
        expectedReturn: r.expected_90d_return,
        confidence: r.confidence_score,
        category: r.category,
    });
    return {
        totalPredictions: (statsRow === null || statsRow === void 0 ? void 0 : statsRow.totalPredictions) || 0,
        avgConfidence: (statsRow === null || statsRow === void 0 ? void 0 : statsRow.avgConfidence) || 0,
        avgRisk: (statsRow === null || statsRow === void 0 ? void 0 : statsRow.avgRisk) || 0,
        avgExpectedReturn90d: (statsRow === null || statsRow === void 0 ? void 0 : statsRow.avgExpectedReturn90d) || 0,
        avgExpectedReturn30d: (statsRow === null || statsRow === void 0 ? void 0 : statsRow.avgExpectedReturn30d) || 0,
        marketDirection,
        categoryBreakdown: categoryRows.reduce((acc, row) => {
            acc[row.category] = row.count;
            return acc;
        }, {}),
        topGainers: topGainers.map(mapMover),
        topLosers: topLosers.map(mapMover),
        confidenceBuckets,
        marketBenchmark90d: (_b = (_a = calibrationModels[90]) === null || _a === void 0 ? void 0 : _a.marketMedianReturn) !== null && _b !== void 0 ? _b : null,
        marketBenchmark30d: (_d = (_c = calibrationModels[30]) === null || _c === void 0 ? void 0 : _c.marketMedianReturn) !== null && _d !== void 0 ? _d : null,
    };
}
async function getSlabCardPrediction(cardId) {
    return get(`SELECT sp.*,
            cm.cardName, cm.setName, cm.setId, cm.cardNumber,
            COALESCE(NULLIF(TRIM(cm.rarity), ''), cc.rarity) AS rarity,
            cm.imageSmall, cm.imageLarge, cm.tcgplayerProductId
     FROM slab_predictions sp
     LEFT JOIN (
       SELECT cardId, MIN(cardName) AS cardName, MIN(setName) AS setName, MIN(setId) AS setId,
              MIN(cardNumber) AS cardNumber, MIN(rarity) AS rarity,
              MIN(NULLIF(imageLarge, '')) AS imageLarge,
              MIN(NULLIF(imageSmall, '')) AS imageSmall,
              MIN(COALESCE(tcgplayerProductId, CAST(productId AS TEXT))) AS tcgplayerProductId
       FROM card_mappings
       GROUP BY cardId
     ) cm ON cm.cardId = sp.card_id
     LEFT JOIN catalog_cards cc ON cc.cardId = sp.card_id
     WHERE sp.card_id = ? AND sp.run_id = (SELECT MAX(id) FROM slab_prediction_runs)
     LIMIT 1`, [cardId]);
}
async function getSlabPredictionResult(predictionId) {
    return get(`SELECT * FROM slab_prediction_results WHERE prediction_id = ?`, [predictionId]);
}
async function updateSlabExplanation(predictionId, explanation) {
    await run(`UPDATE slab_predictions SET explanation = ? WHERE id = ?`, [explanation, predictionId]);
}
