"use strict";
/**
 * PSA 10 slab top movers — same idea as raw /top-movers, against graded_price_history.
 * Rank on history first, then attach names/images only for the winners.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.calendarDaysBetween = calendarDaysBetween;
exports.minSpanDaysForPeriod = minSpanDaysForPeriod;
exports.seriesKey = seriesKey;
exports.productIdsMatch = productIdsMatch;
exports.seriesHasSingleProduct = seriesHasSingleProduct;
exports.getSlabTopMovers = getSlabTopMovers;
const database_1 = require("../db/database");
const topMoversQuality_1 = require("./topMoversQuality");
const TOP_MOVERS_TTL_MS = 10 * 60 * 1000;
const cache = new Map();
const MIN_PRICE = 10;
const MIN_ABS_DOLLAR = 2;
const CANDIDATE_POOL = 400;
const dbGet = (sql, params = []) => new Promise((resolve, reject) => {
    (0, database_1.getDb)().get(sql, params, (err, row) => {
        if (err)
            reject(err);
        else
            resolve(row);
    });
});
const dbAll = (sql, params = []) => new Promise((resolve, reject) => {
    (0, database_1.getDb)().all(sql, params, (err, rows) => {
        if (err)
            reject(err);
        else
            resolve((rows || []));
    });
});
function calendarDaysBetween(fromIso, toIso) {
    const a = Date.parse(`${fromIso.slice(0, 10)}T00:00:00Z`);
    const b = Date.parse(`${toIso.slice(0, 10)}T00:00:00Z`);
    if (!Number.isFinite(a) || !Number.isFinite(b))
        return 0;
    return Math.round((b - a) / 86400000);
}
/** Require a real lookback so 30d is not just an 8-day window relabeled. */
function minSpanDaysForPeriod(days) {
    if (days <= 1)
        return 1;
    if (days <= 7)
        return 3;
    return Math.max(14, Math.floor(days * 0.5));
}
function seriesKey(cardId, variantKey) {
    return `${cardId}::${variantKey || 'normal'}`;
}
/** Unknown product ids are compatible; two known ids must match. */
function productIdsMatch(a, b) {
    if (a == null || b == null || a === '' || b === '')
        return true;
    return String(a) === String(b);
}
function seriesHasSingleProduct(points) {
    const ids = new Set(points
        .map((p) => p.productId)
        .filter((id) => id != null && id !== '')
        .map(String));
    return ids.size <= 1;
}
async function getSlabTopMovers(days, limit) {
    var _a, _b, _c;
    const cacheKey = `v2:${days}:${limit}`;
    const cached = cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
        return cached.payload;
    }
    const empty = (date) => ({
        date,
        days,
        grader: 'PSA',
        grade: '10',
        gainers: [],
        losers: [],
    });
    const latestRow = await dbGet(`SELECT date AS maxDate FROM graded_price_history
     WHERE grader = 'psa' AND grade = '10' AND price > 0
     ORDER BY date DESC LIMIT 1`);
    const latestDate = latestRow === null || latestRow === void 0 ? void 0 : latestRow.maxDate;
    if (!latestDate) {
        const payload = empty(null);
        cache.set(cacheKey, { expiresAt: Date.now() + TOP_MOVERS_TTL_MS, payload });
        return payload;
    }
    const baselineSlackDays = Math.max(days * 2, days + 3);
    const minSpan = minSpanDaysForPeriod(days);
    const maxEndpointPct = (0, topMoversQuality_1.maxEndpointChangePctForPeriod)(days);
    const cliffPct = (0, topMoversQuality_1.cliffPctForPeriod)(days);
    const minPoints = (0, topMoversQuality_1.minPointsForPeriod)(days);
    const [currentRows, prevDateRow] = await Promise.all([
        dbAll(`SELECT cardId, COALESCE(variantKey, 'normal') AS variantKey, price, productId
       FROM graded_price_history
       WHERE date = ?
         AND grader = 'psa'
         AND grade = '10'
         AND price >= ?
         AND COALESCE(verified, 0) = 1`, [latestDate, MIN_PRICE]),
        dbGet(`SELECT MAX(date) AS prevDate
       FROM graded_price_history
       WHERE grader = 'psa'
         AND grade = '10'
         AND price >= ?
         AND date <= date(?, ?)
         AND date >= date(?, ?)`, [MIN_PRICE, latestDate, `-${days} days`, latestDate, `-${baselineSlackDays} days`]),
    ]);
    if (currentRows.length === 0) {
        const payload = empty(latestDate);
        cache.set(cacheKey, { expiresAt: Date.now() + TOP_MOVERS_TTL_MS, payload });
        return payload;
    }
    const prevDate = prevDateRow === null || prevDateRow === void 0 ? void 0 : prevDateRow.prevDate;
    if (!prevDate || calendarDaysBetween(prevDate, latestDate) < minSpan) {
        const payload = empty(latestDate);
        cache.set(cacheKey, { expiresAt: Date.now() + TOP_MOVERS_TTL_MS, payload });
        return payload;
    }
    const prevRows = await dbAll(`SELECT cardId, COALESCE(variantKey, 'normal') AS variantKey, date AS prevDate, price AS prevPrice, productId
     FROM graded_price_history
     WHERE date = ?
       AND grader = 'psa'
       AND grade = '10'
       AND price >= ?`, [prevDate, MIN_PRICE]);
    const prevByCard = new Map();
    for (const prev of prevRows) {
        const key = seriesKey(prev.cardId, prev.variantKey);
        if (!prevByCard.has(key)) {
            prevByCard.set(key, { price: prev.prevPrice, productId: (_a = prev.productId) !== null && _a !== void 0 ? _a : null });
        }
    }
    const ranked = [];
    for (const current of currentRows) {
        const key = seriesKey(current.cardId, current.variantKey);
        const prev = prevByCard.get(key);
        if (!(prev != null && prev.price >= MIN_PRICE))
            continue;
        if (!productIdsMatch(current.productId, prev.productId))
            continue;
        const absDollar = Math.abs(current.price - prev.price);
        if (absDollar < MIN_ABS_DOLLAR)
            continue;
        const changePct = ((current.price - prev.price) / prev.price) * 100;
        if (!Number.isFinite(changePct) || Math.abs(changePct) > maxEndpointPct)
            continue;
        ranked.push({
            cardId: current.cardId,
            variantKey: current.variantKey || 'normal',
            currentPrice: current.price,
            previousPrice: prev.price,
            changePercent: Math.round(changePct * 100) / 100,
            prevDate,
            productId: (_b = current.productId) !== null && _b !== void 0 ? _b : null,
            prevProductId: prev.productId,
        });
    }
    ranked.sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent));
    const candidates = [
        ...ranked.filter((e) => e.changePercent > 0).slice(0, CANDIDATE_POOL),
        ...ranked.filter((e) => e.changePercent < 0).slice(0, CANDIDATE_POOL),
    ];
    if (candidates.length === 0) {
        const payload = empty(latestDate);
        cache.set(cacheKey, { expiresAt: Date.now() + TOP_MOVERS_TTL_MS, payload });
        return payload;
    }
    const ids = [...new Set(candidates.map((c) => c.cardId))];
    const earliestPrev = candidates.reduce((min, c) => (!min || c.prevDate < min ? c.prevDate : min), '');
    const placeholders = ids.map(() => '?').join(',');
    const pathRows = await dbAll(`SELECT cardId, COALESCE(variantKey, 'normal') AS variantKey, date, price, productId
     FROM graded_price_history
     WHERE cardId IN (${placeholders})
       AND grader = 'psa'
       AND grade = '10'
       AND date >= ?
       AND date <= ?
       AND price >= ?`, [...ids, earliestPrev, latestDate, MIN_PRICE]);
    const series = new Map();
    for (const pr of pathRows) {
        const key = seriesKey(pr.cardId, pr.variantKey);
        const list = series.get(key) || [];
        list.push({ date: pr.date, price: pr.price, productId: (_c = pr.productId) !== null && _c !== void 0 ? _c : null });
        series.set(key, list);
    }
    const survivors = candidates.filter((c) => {
        const points = (series.get(seriesKey(c.cardId, c.variantKey)) || []).filter((p) => p.date >= c.prevDate && p.date <= latestDate);
        if (!seriesHasSingleProduct(points))
            return false;
        return (0, topMoversQuality_1.isGradualMove)(points, { cliffPct, minPoints });
    });
    survivors.sort((a, b) => b.changePercent - a.changePercent);
    const gainerRank = survivors.filter((e) => e.changePercent > 0).slice(0, limit);
    const loserRank = survivors
        .filter((e) => e.changePercent < 0)
        .sort((a, b) => a.changePercent - b.changePercent)
        .slice(0, limit);
    const [gainers, losers] = await Promise.all([
        enrichMovers(gainerRank),
        enrichMovers(loserRank),
    ]);
    const payload = {
        date: latestDate,
        days,
        grader: 'PSA',
        grade: '10',
        gainers,
        losers,
    };
    cache.set(cacheKey, { expiresAt: Date.now() + TOP_MOVERS_TTL_MS, payload });
    return payload;
}
async function enrichMovers(ranked) {
    if (ranked.length === 0)
        return [];
    const ids = [...new Set(ranked.map((r) => r.cardId))];
    const placeholders = ids.map(() => '?').join(',');
    const [catalog, mapped] = await Promise.all([
        dbAll(`SELECT
         COALESCE(cc.cardId, gp.cardId) AS cardId,
         COALESCE(gp.variantKey, 'normal') AS variantKey,
         COALESCE(gp.cardName, cc.cardName) AS cardName,
         COALESCE(gp.setId, cc.setId) AS setId,
         COALESCE(gp.setName, cc.setName) AS setName,
         cc.imageSmall,
         cc.imageLarge,
         cc.cardNumber,
         cc.rarity,
         cc.tcgplayerProductId,
         cc.tcgplayerPrices
       FROM graded_prices gp
       LEFT JOIN catalog_cards cc ON cc.cardId = gp.cardId
       WHERE gp.cardId IN (${placeholders})
         AND gp.grader = 'psa'
         AND gp.grade = '10'`, ids),
        dbAll(`SELECT cardId, MAX(imageSmall) AS imageSmall, MAX(imageLarge) AS imageLarge
       FROM card_mappings
       WHERE cardId IN (${placeholders})
         AND (imageSmall IS NOT NULL OR imageLarge IS NOT NULL)
       GROUP BY cardId`, ids),
    ]);
    const catByKey = new Map(catalog.map((r) => [seriesKey(r.cardId, r.variantKey), r]));
    const catById = new Map(catalog.map((r) => [r.cardId, r]));
    const mapById = new Map(mapped.map((r) => [r.cardId, r]));
    return ranked.map((r) => {
        var _a, _b, _c, _d;
        const variantKey = r.variantKey || 'normal';
        const cat = catByKey.get(seriesKey(r.cardId, variantKey)) || catById.get(r.cardId);
        const imgs = mapById.get(r.cardId);
        const imageSmall = (cat === null || cat === void 0 ? void 0 : cat.imageSmall) || (imgs === null || imgs === void 0 ? void 0 : imgs.imageSmall) || (cat === null || cat === void 0 ? void 0 : cat.imageLarge) || (imgs === null || imgs === void 0 ? void 0 : imgs.imageLarge) || null;
        const imageLarge = (cat === null || cat === void 0 ? void 0 : cat.imageLarge) || (imgs === null || imgs === void 0 ? void 0 : imgs.imageLarge) || imageSmall;
        const productIdNum = Number.parseInt(String(r.productId || ''), 10);
        return {
            productName: (cat === null || cat === void 0 ? void 0 : cat.cardName) || r.cardId,
            currentPrice: r.currentPrice,
            previousPrice: r.previousPrice,
            changePercent: r.changePercent,
            uniqueIdentifier: seriesKey(r.cardId, variantKey),
            subTypeName: variantKey,
            groupName: (cat === null || cat === void 0 ? void 0 : cat.setName) || null,
            imageSmall,
            imageLarge,
            cardId: r.cardId,
            setId: (cat === null || cat === void 0 ? void 0 : cat.setId) || null,
            setName: (cat === null || cat === void 0 ? void 0 : cat.setName) || null,
            cardNumber: (_a = cat === null || cat === void 0 ? void 0 : cat.cardNumber) !== null && _a !== void 0 ? _a : null,
            rarity: (_b = cat === null || cat === void 0 ? void 0 : cat.rarity) !== null && _b !== void 0 ? _b : null,
            tcgplayerProductId: (_c = cat === null || cat === void 0 ? void 0 : cat.tcgplayerProductId) !== null && _c !== void 0 ? _c : null,
            tcgplayerPrices: (_d = cat === null || cat === void 0 ? void 0 : cat.tcgplayerPrices) !== null && _d !== void 0 ? _d : null,
            productId: Number.isFinite(productIdNum) ? productIdNum : 0,
            grader: 'PSA',
            grade: '10',
        };
    });
}
