"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getGradedPrices = exports.getAllGradedPriceHistory = exports.getGradedPriceHistory = exports.saveGradedScrape = exports.backfillGradedHistoryFromCache = exports.snapshotAllGradedPricesToHistory = exports.refreshListedQuotes = exports.enrichGradedPrice = exports.canonicalGradedHistoryVariantKey = void 0;
const database_1 = require("../db/database");
const logger_1 = require("../utils/logger");
const promisified_1 = require("../db/promisified");
const normalizeVariantKey_1 = require("../utils/normalizeVariantKey");
const priceChartingResolver_1 = require("./priceChartingResolver");
const priceChartingClient_1 = require("./priceChartingClient");
const onePiecePriceCharting_1 = require("./onePiecePriceCharting");
const slabMarketMark_1 = require("./slabMarketMark");
const ebayBrowseClient_1 = require("./ebayBrowseClient");
const onePieceCatalogId_1 = require("./onePieceCatalogId");
const CACHE_TTL_MS = 1000 * 60 * 60 * 12;
const LISTED_TTL_MS = 1000 * 60 * 60 * 12;
const HISTORY_TIMEZONE = 'America/New_York';
const variantKeyOf = (variant) => (0, normalizeVariantKey_1.normalizeVariantKey)(variant !== null && variant !== void 0 ? variant : undefined);
/**
 * PriceCharting only splits reverse / 1st-edition products. Holofoil, normal,
 * unlimited, etc. all map to the same PC page — historical scrapes were stored
 * under `normal`. Keep graded history on that canonical key so Holofoil charts
 * don't look "wiped" after a finish-aware scrape.
 */
const canonicalGradedHistoryVariantKey = (variant) => {
    const key = variantKeyOf(variant);
    const family = (0, priceChartingClient_1.expectedPcFinishFamily)(key);
    if (family === 'reverse')
        return 'reverseholofoil';
    if (family === '1steditionreverse')
        return key.includes('holo') ? '1steditionholofoil' : '1stedition';
    if (family === '1stedition')
        return '1stedition';
    return 'normal';
};
exports.canonicalGradedHistoryVariantKey = canonicalGradedHistoryVariantKey;
/** Calendar date in ET — same convention as raw price_history run dates. */
const getHistoryDate = () => new Intl.DateTimeFormat('en-CA', {
    timeZone: HISTORY_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
}).format(new Date());
const enrichGradedPrice = (p) => {
    if (p.price == null || !Number.isFinite(p.price) || p.price <= 0)
        return p;
    const blended = (0, slabMarketMark_1.blendSlabMarketMark)({
        soldGuide: p.price,
        lastSoldDate: p.lastSoldDate,
        lastSoldPrice: p.lastSoldPrice,
        listedLow: p.listedLow,
        listedAvg: p.listedAvg,
        listedCount: p.listedCount,
    });
    return {
        ...p,
        marketMark: blended.mark,
        marketMarkReason: blended.reason,
        staleSold: blended.staleSold,
        lastSoldAgeDays: blended.lastSoldAgeDays,
        listedPremiumPct: blended.listedPremiumPct,
    };
};
exports.enrichGradedPrice = enrichGradedPrice;
const priceFromRow = (row) => (0, exports.enrichGradedPrice)({
    grader: row.grader,
    grade: row.grade,
    price: row.price != null ? Number(row.price) : null,
    soldListings: Number(row.soldListings) || 0,
    lastSoldDate: row.lastSoldDate || null,
    lastSoldPrice: row.lastSoldPrice != null ? Number(row.lastSoldPrice) : null,
    listedLow: row.listedLow != null ? Number(row.listedLow) : null,
    listedAvg: row.listedAvg != null ? Number(row.listedAvg) : null,
    listedCount: row.listedCount != null ? Number(row.listedCount) : null,
    listedFetchedAt: row.listedFetchedAt || null,
});
const resultFromRows = (rows, stale) => {
    var _a, _b, _c;
    const first = rows[0];
    const fetchedAt = rows.reduce((latest, r) => (r.fetchedAt > latest ? r.fetchedAt : latest), first.fetchedAt);
    const fetchedMs = new Date(fetchedAt + 'Z').getTime();
    const age = Date.now() - fetchedMs;
    const verified = rows.some((r) => Number(r.verified) === 1);
    return {
        cardId: first.cardId,
        cardName: first.cardName,
        setName: first.setName,
        prices: rows.map(priceFromRow),
        fetchedAt,
        cached: true,
        verified,
        productId: ((_a = rows.find((r) => r.productId)) === null || _a === void 0 ? void 0 : _a.productId) || null,
        matchScore: (_c = (_b = rows.find((r) => r.matchScore != null)) === null || _b === void 0 ? void 0 : _b.matchScore) !== null && _c !== void 0 ? _c : null,
        stale,
        ageHours: Number.isFinite(age) ? Math.max(0, Math.round(age / 3600000)) : null,
    };
};
const serveCachedGradedPrices = (rows, stale, variantKey) => {
    const result = resultFromRows(rows, stale);
    try {
        snapshotHistoryFromPrices(result.cardId, variantKey, result.prices, {
            productId: result.productId,
            verified: result.verified,
        });
    }
    catch (error) {
        logger_1.logger.warn('Failed to snapshot graded price history from cache', {
            cardId: result.cardId,
            variantKey,
            error: error.message,
        });
    }
    return result;
};
const listedIsFresh = (rows) => {
    const psa10 = rows.find((r) => r.grader === 'psa' && r.grade === '10');
    if (!(psa10 === null || psa10 === void 0 ? void 0 : psa10.listedFetchedAt))
        return false;
    const ms = new Date(psa10.listedFetchedAt + 'Z').getTime();
    return Number.isFinite(ms) && Date.now() - ms < LISTED_TTL_MS;
};
const refreshListedQuotes = async (cardId, input, variantKey = 'normal') => {
    if (!(0, ebayBrowseClient_1.isEbayBrowseConfigured)())
        return null;
    try {
        const quote = await (0, ebayBrowseClient_1.fetchPsa10ListingQuote)(input);
        if (!quote)
            return null;
        await (0, promisified_1.dbRun)(`UPDATE graded_prices
       SET listedLow = ?, listedAvg = ?, listedCount = ?, listedFetchedAt = datetime('now')
       WHERE cardId = ? AND variantKey = ? AND grader = 'psa' AND grade = '10'`, [quote.listedLow, quote.listedAvg, quote.listedCount, cardId, variantKey]);
        // Stamp the observation onto today's history row so listing-count history
        // accrues alongside price history (used by buyout supply-drain detection).
        await (0, promisified_1.dbRun)(`UPDATE graded_price_history
       SET listedCount = ?
       WHERE cardId = ? AND variantKey = ? AND UPPER(grader) = 'PSA' AND grade = '10' AND date = ?`, [quote.listedCount, cardId, variantKey, getHistoryDate()]);
        return quote;
    }
    catch (error) {
        logger_1.logger.warn('Listed-quote refresh failed', {
            cardId,
            variantKey,
            error: error.message,
        });
        return null;
    }
};
exports.refreshListedQuotes = refreshListedQuotes;
/** Ensure today's history point exists from the live cache (idempotent upsert). */
const snapshotHistoryFromPrices = (cardId, variantKey, prices, meta) => {
    var _a;
    const db = (0, database_1.getDb)();
    const runDate = getHistoryDate();
    // Prefer the PC product's finish for history. Reverse/1st requests that were
    // aliased onto an untagged PC page must write under `normal` so charts reuse
    // the existing series (Southern Islands, etc.).
    const historyVariantKey = meta.sourceUrl
        ? (0, exports.canonicalGradedHistoryVariantKey)((0, priceChartingClient_1.inferVariantKeyFromPc)(null, meta.sourceUrl))
        : (0, exports.canonicalGradedHistoryVariantKey)(variantKey);
    const stmt = db.prepare(`INSERT INTO graded_price_history
      (cardId, variantKey, date, grader, grade, price, soldListings, productId, verified, sourceUrl, source)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pricecharting')
     ON CONFLICT(cardId, variantKey, date, grader, grade) DO UPDATE SET
       price = excluded.price,
       soldListings = excluded.soldListings,
       productId = excluded.productId,
       verified = excluded.verified,
       sourceUrl = excluded.sourceUrl`);
    for (const p of prices) {
        // Skip PriceCharting "ungraded" — raw belongs on the TCGPlayer chart, not slabs.
        if (p.grader === 'ungraded')
            continue;
        if (p.price == null || !Number.isFinite(p.price) || p.price <= 0)
            continue;
        stmt.run([
            cardId,
            historyVariantKey,
            runDate,
            p.grader,
            p.grade,
            p.price,
            p.soldListings,
            meta.productId,
            meta.verified ? 1 : 0,
            (_a = meta.sourceUrl) !== null && _a !== void 0 ? _a : null,
        ]);
    }
    stmt.finalize();
};
/**
 * Snapshot EVERY live slab quote into today's graded_price_history.
 * Scrape coverage is time-budgeted; this makes history densify like raw prices
 * for all cards we already have quotes for — no PriceCharting request needed.
 */
const snapshotAllGradedPricesToHistory = async (date = getHistoryDate()) => {
    var _a, _b;
    const db = (0, database_1.getDb)();
    const result = await new Promise((resolve, reject) => {
        db.run(`INSERT INTO graded_price_history
         (cardId, variantKey, date, grader, grade, price, soldListings, listedCount, productId, verified, sourceUrl, source)
       SELECT
         cardId,
         CASE
           WHEN REPLACE(LOWER(COALESCE(variantKey, '')), ' ', '') LIKE '%reverse%'
             THEN CASE
               WHEN REPLACE(LOWER(COALESCE(variantKey, '')), ' ', '') LIKE '%1stedition%'
                 OR REPLACE(LOWER(COALESCE(variantKey, '')), ' ', '') LIKE '%firstedition%'
               THEN COALESCE(NULLIF(variantKey, ''), '1steditionholofoil')
               ELSE 'reverseholofoil'
             END
           WHEN REPLACE(LOWER(COALESCE(variantKey, '')), ' ', '') LIKE '%1stedition%'
             OR REPLACE(LOWER(COALESCE(variantKey, '')), ' ', '') LIKE '%firstedition%'
             THEN '1stedition'
           ELSE 'normal'
         END,
         ?,
         grader,
         grade,
         price,
         COALESCE(soldListings, 0),
         CASE WHEN date(listedFetchedAt) = ? THEN listedCount ELSE NULL END,
         productId,
         COALESCE(verified, 0),
         sourceUrl,
         'pricecharting'
       FROM graded_prices
       WHERE grader != 'ungraded'
         AND price IS NOT NULL
         AND price > 0
       ON CONFLICT(cardId, variantKey, date, grader, grade) DO UPDATE SET
         price = excluded.price,
         soldListings = excluded.soldListings,
         listedCount = COALESCE(excluded.listedCount, graded_price_history.listedCount),
         productId = COALESCE(excluded.productId, graded_price_history.productId),
         verified = excluded.verified,
         sourceUrl = COALESCE(excluded.sourceUrl, graded_price_history.sourceUrl)`, [date, date], function onDone(err) {
            var _a;
            if (err)
                reject(err);
            else
                resolve({ changes: (_a = this.changes) !== null && _a !== void 0 ? _a : 0 });
        });
    });
    const cards = await (0, promisified_1.dbGet)(`SELECT COUNT(DISTINCT cardId) AS n FROM graded_price_history WHERE date = ? AND grader != 'ungraded'`, [date]);
    logger_1.logger.info('Snapshotted graded_prices into history', {
        date,
        upserted: result.changes,
        cards: (_a = cards === null || cards === void 0 ? void 0 : cards.n) !== null && _a !== void 0 ? _a : 0,
    });
    return { upserted: result.changes, cards: (_b = cards === null || cards === void 0 ? void 0 : cards.n) !== null && _b !== void 0 ? _b : 0, date };
};
exports.snapshotAllGradedPricesToHistory = snapshotAllGradedPricesToHistory;
/**
 * One-shot / catch-up: for every live slab quote, ensure a history row exists on
 * date(fetchedAt). Fills gaps for cards scraped before history was written.
 */
const backfillGradedHistoryFromCache = async () => {
    var _a, _b;
    const db = (0, database_1.getDb)();
    const result = await new Promise((resolve, reject) => {
        db.run(`INSERT INTO graded_price_history
         (cardId, variantKey, date, grader, grade, price, soldListings, listedCount, productId, verified, sourceUrl, source)
       SELECT
         cardId,
         COALESCE(NULLIF(variantKey, ''), 'normal'),
         date(fetchedAt),
         grader,
         grade,
         price,
         COALESCE(soldListings, 0),
         CASE WHEN date(listedFetchedAt) = date(fetchedAt) THEN listedCount ELSE NULL END,
         productId,
         COALESCE(verified, 0),
         sourceUrl,
         'pricecharting'
       FROM graded_prices
       WHERE grader != 'ungraded'
         AND price IS NOT NULL
         AND price > 0
         AND fetchedAt IS NOT NULL
         AND date(fetchedAt) IS NOT NULL
       ON CONFLICT(cardId, variantKey, date, grader, grade) DO UPDATE SET
         price = excluded.price,
         soldListings = excluded.soldListings,
         listedCount = COALESCE(excluded.listedCount, graded_price_history.listedCount),
         productId = COALESCE(excluded.productId, graded_price_history.productId),
         verified = excluded.verified,
         sourceUrl = COALESCE(excluded.sourceUrl, graded_price_history.sourceUrl)`, [], function onDone(err) {
            var _a;
            if (err)
                reject(err);
            else
                resolve({ changes: (_a = this.changes) !== null && _a !== void 0 ? _a : 0 });
        });
    });
    const cards = await (0, promisified_1.dbGet)(`SELECT COUNT(DISTINCT cardId) AS n FROM graded_price_history WHERE grader != 'ungraded'`);
    logger_1.logger.info('Backfilled graded history from graded_prices cache', {
        upserted: result.changes,
        cards: (_a = cards === null || cards === void 0 ? void 0 : cards.n) !== null && _a !== void 0 ? _a : 0,
    });
    return { upserted: result.changes, cards: (_b = cards === null || cards === void 0 ? void 0 : cards.n) !== null && _b !== void 0 ? _b : 0 };
};
exports.backfillGradedHistoryFromCache = backfillGradedHistoryFromCache;
/**
 * Persist slab prices parsed from a shared product-page scrape (nightly refresh).
 * Also appends a daily history row so graded series can be graphed like raw prices.
 */
const saveGradedScrape = async (cardId, input, match, pageData, options) => {
    var _a, _b;
    const variantKey = variantKeyOf((options === null || options === void 0 ? void 0 : options.variantKey) || input.variant);
    const wantFinish = (0, priceChartingClient_1.expectedPcFinishFamily)(variantKey);
    const gotFinish = (0, priceChartingClient_1.detectPcFinishFamily)(undefined, match.url);
    const finishOk = gotFinish === wantFinish ||
        Boolean((options === null || options === void 0 ? void 0 : options.allowStandardFinishAlias) &&
            wantFinish !== 'standard' &&
            gotFinish === 'standard');
    if (!finishOk) {
        logger_1.logger.warn('Refusing to save slab scrape with mismatched finish', {
            cardId,
            variantKey,
            wantFinish,
            gotFinish,
            url: match.url,
        });
        return null;
    }
    if (input.game === 'onepiece') {
        const wantFamily = (0, onePiecePriceCharting_1.expectedOpPrintFamily)(input);
        const gotFamily = (0, onePiecePriceCharting_1.detectOpPrintFamily)(undefined, match.url);
        if (!(0, onePiecePriceCharting_1.opPrintFamiliesMatch)(wantFamily, gotFamily)) {
            logger_1.logger.warn('Refusing to save slab scrape with mismatched One Piece print family', {
                cardId,
                variantKey,
                wantFamily,
                gotFamily,
                url: match.url,
            });
            return null;
        }
    }
    const db = (0, database_1.getDb)();
    const verified = pageData.productId === match.productId;
    const stmt = db.prepare(`INSERT INTO graded_prices
      (cardId, variantKey, cardName, setId, setName, grader, grade, price, soldListings,
       fetchedAt, productId, matchScore, verified, sourceUrl, lastSoldDate, lastSoldPrice)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?, ?, ?, ?, ?, ?)
     ON CONFLICT(cardId, variantKey, grader, grade) DO UPDATE SET
       cardName = excluded.cardName,
       setName = COALESCE(excluded.setName, graded_prices.setName),
       price = excluded.price,
       soldListings = excluded.soldListings,
       fetchedAt = excluded.fetchedAt,
       productId = excluded.productId,
       matchScore = excluded.matchScore,
       verified = excluded.verified,
       sourceUrl = excluded.sourceUrl,
       lastSoldDate = excluded.lastSoldDate,
       lastSoldPrice = excluded.lastSoldPrice`);
    for (const p of pageData.gradedPrices) {
        stmt.run([
            cardId,
            variantKey,
            input.cardName,
            null,
            input.setName || null,
            p.grader,
            p.grade,
            p.price,
            p.soldListings,
            match.productId,
            match.matchScore,
            verified ? 1 : 0,
            match.url,
            (_a = p.lastSoldDate) !== null && _a !== void 0 ? _a : null,
            (_b = p.lastSoldPrice) !== null && _b !== void 0 ? _b : null,
        ]);
    }
    stmt.finalize();
    snapshotHistoryFromPrices(cardId, variantKey, pageData.gradedPrices, {
        productId: match.productId,
        verified,
        sourceUrl: match.url,
    });
    if (options === null || options === void 0 ? void 0 : options.fetchListings) {
        return (0, exports.refreshListedQuotes)(cardId, input, variantKey);
    }
    return null;
};
exports.saveGradedScrape = saveGradedScrape;
/** When reverse/1st is backed by an untagged PC product, reuse `normal` history. */
const historyVariantKeysForRead = async (cardId, variantKey) => {
    const historyKey = (0, exports.canonicalGradedHistoryVariantKey)(variantKey);
    const keys = new Set([variantKey, historyKey]);
    if ((0, priceChartingClient_1.expectedPcFinishFamily)(variantKey) === 'standard') {
        return [...keys];
    }
    const row = await (0, promisified_1.dbGet)(`SELECT sourceUrl FROM graded_prices
     WHERE cardId = ? AND variantKey = ? AND sourceUrl IS NOT NULL
     LIMIT 1`, [cardId, variantKey]);
    const url = row === null || row === void 0 ? void 0 : row.sourceUrl;
    if (!url || (0, priceChartingClient_1.detectPcFinishFamily)(undefined, url) === 'standard') {
        keys.add('normal');
    }
    return [...keys];
};
const getGradedPriceHistory = async (cardId, grader, grade, days = 365, variant) => {
    const variantKey = variantKeyOf(variant);
    const historyKeys = await historyVariantKeysForRead(cardId, variantKey);
    const clampedDays = Math.min(Math.max(days, 1), 2000);
    const placeholders = historyKeys.map(() => '?').join(', ');
    // Prefer the requested finish when both exist for a date; fall back to the
    // canonical / aliased series that holds the real history.
    const rows = await (0, promisified_1.dbAll)(`SELECT date, price, COALESCE(soldListings, 0) AS soldListings, variantKey
     FROM graded_price_history
     WHERE cardId = ?
       AND variantKey IN (${placeholders})
       AND grader = ?
       AND grade = ?
       AND price IS NOT NULL
       AND price > 0
       AND date >= date('now', ?)
     ORDER BY date ASC,
       CASE WHEN variantKey = ? THEN 0 ELSE 1 END`, [cardId, ...historyKeys, grader, grade, `-${clampedDays} days`, variantKey]);
    const byDate = new Map();
    for (const r of rows) {
        if (byDate.has(r.date))
            continue;
        byDate.set(r.date, {
            date: r.date,
            price: Number(r.price),
            soldListings: Number(r.soldListings) || 0,
        });
    }
    return {
        cardId,
        grader,
        grade,
        points: [...byDate.values()],
    };
};
exports.getGradedPriceHistory = getGradedPriceHistory;
/** All grader/grade series for one card — for Collectr-style multi-line charts. */
const getAllGradedPriceHistory = async (cardId, days = 365, variant) => {
    const variantKey = variantKeyOf(variant);
    const historyKeys = await historyVariantKeysForRead(cardId, variantKey);
    const clampedDays = Math.min(Math.max(days, 1), 2000);
    const placeholders = historyKeys.map(() => '?').join(', ');
    const rows = await (0, promisified_1.dbAll)(`SELECT date, grader, grade, price, COALESCE(soldListings, 0) AS soldListings, variantKey
     FROM graded_price_history
     WHERE cardId = ?
       AND variantKey IN (${placeholders})
       AND grader != 'ungraded'
       AND price IS NOT NULL
       AND price > 0
       AND date >= date('now', ?)
     ORDER BY grader ASC, grade ASC, date ASC,
       CASE WHEN variantKey = ? THEN 0 ELSE 1 END`, [cardId, ...historyKeys, `-${clampedDays} days`, variantKey]);
    const byKey = new Map();
    const seenDates = new Map();
    for (const r of rows) {
        const key = `${r.grader}::${r.grade}`;
        let series = byKey.get(key);
        if (!series) {
            series = {
                cardId,
                grader: r.grader,
                grade: r.grade,
                points: [],
                latestPrice: null,
            };
            byKey.set(key, series);
            seenDates.set(key, new Set());
        }
        const dates = seenDates.get(key);
        if (dates.has(r.date))
            continue;
        dates.add(r.date);
        const price = Number(r.price);
        series.points.push({
            date: r.date,
            price,
            soldListings: Number(r.soldListings) || 0,
        });
        series.latestPrice = price;
    }
    return { cardId, series: [...byKey.values()] };
};
exports.getAllGradedPriceHistory = getAllGradedPriceHistory;
const getGradedPrices = async (cardId, cardName, setId, setName, cardNumber, options) => {
    var _a, _b, _c;
    const allowLiveScrape = (options === null || options === void 0 ? void 0 : options.allowLiveScrape) !== false;
    const matchName = (options === null || options === void 0 ? void 0 : options.matchName) || cardName;
    const language = (options === null || options === void 0 ? void 0 : options.language) || 'en';
    const parsedOp = (0, onePieceCatalogId_1.parseOnePieceCatalogId)(cardId);
    const game = (options === null || options === void 0 ? void 0 : options.game) || ((0, onePieceCatalogId_1.isOnePieceCatalogId)(cardId) ? 'onepiece' : 'pokemon');
    const cardImageId = (options === null || options === void 0 ? void 0 : options.cardImageId) || (parsedOp === null || parsedOp === void 0 ? void 0 : parsedOp.cardImageId);
    const variantKey = variantKeyOf(options === null || options === void 0 ? void 0 : options.variant);
    const input = {
        cardName: matchName,
        setName,
        cardNumber,
        variant: variantKey,
        game,
        cardImageId,
    };
    const resolverInput = {
        cardName,
        matchName,
        setId,
        setName,
        cardNumber,
        language,
        variant: variantKey,
        game,
        cardImageId,
    };
    const cachedRows = await (0, promisified_1.dbAll)(`SELECT cardId, cardName, setId, setName, grader, grade, price, soldListings,
            fetchedAt, verified, productId, matchScore,
            lastSoldDate, lastSoldPrice, listedLow, listedAvg, listedCount, listedFetchedAt,
            sourceUrl
     FROM graded_prices
     WHERE cardId = ? AND variantKey = ? AND COALESCE(verified, 0) = 1`, [cardId, variantKey]);
    let usableCache = cachedRows;
    if (game === 'onepiece' && cachedRows.length > 0) {
        const wantFamily = (0, onePiecePriceCharting_1.expectedOpPrintFamily)(input);
        const cachedUrl = ((_a = cachedRows.find((r) => r.sourceUrl)) === null || _a === void 0 ? void 0 : _a.sourceUrl) || '';
        const cachedFamily = (0, onePiecePriceCharting_1.detectOpPrintFamily)(undefined, cachedUrl);
        if (!(0, onePiecePriceCharting_1.opPrintFamiliesMatch)(wantFamily, cachedFamily)) {
            logger_1.logger.info('Discarding graded cache with wrong One Piece print family', {
                cardId,
                variantKey,
                wantFamily,
                cachedFamily,
                sourceUrl: cachedUrl || null,
            });
            await (0, promisified_1.dbRun)('DELETE FROM graded_prices WHERE cardId = ? AND variantKey = ?', [
                cardId,
                variantKey,
            ]);
            await (0, promisified_1.dbRun)('DELETE FROM graded_price_history WHERE cardId = ? AND variantKey = ?', [
                cardId,
                variantKey,
            ]);
            usableCache = [];
        }
    }
    const applyListed = (prices, quote) => prices.map((p) => {
        if (p.grader !== 'psa' || p.grade !== '10' || !quote)
            return (0, exports.enrichGradedPrice)(p);
        return (0, exports.enrichGradedPrice)({
            ...p,
            listedLow: quote.listedLow,
            listedAvg: quote.listedAvg,
            listedCount: quote.listedCount,
            listedFetchedAt: new Date().toISOString(),
        });
    });
    // Stale-while-revalidate: always paint cached slabs immediately.
    // Live PriceCharting scrapes are slow and should never block the modal.
    if (usableCache.length > 0) {
        const fetchedAt = usableCache.reduce((latest, r) => (r.fetchedAt > latest ? r.fetchedAt : latest), usableCache[0].fetchedAt);
        const fetchedMs = new Date(fetchedAt + 'Z').getTime();
        const age = Date.now() - fetchedMs;
        const fresh = Number.isFinite(age) && age < CACHE_TTL_MS;
        if (!listedIsFresh(usableCache) && (0, ebayBrowseClient_1.isEbayBrowseConfigured)()) {
            void (0, exports.refreshListedQuotes)(cardId, input, variantKey);
        }
        if (fresh || !allowLiveScrape) {
            return serveCachedGradedPrices(usableCache, !fresh, variantKey);
        }
        void (async () => {
            try {
                const resolved = await (0, priceChartingResolver_1.resolveProduct)(resolverInput, 1500);
                if (resolved && resolved.pageData.gradedPrices.length > 0) {
                    await (0, exports.saveGradedScrape)(cardId, input, resolved.match, resolved.pageData, {
                        fetchListings: true,
                        variantKey,
                        allowStandardFinishAlias: Boolean(resolved.finishAliasedToStandard),
                    });
                }
            }
            catch (error) {
                logger_1.logger.warn('Background graded price refresh failed', {
                    cardId,
                    variantKey,
                    error: error.message,
                });
            }
        })();
        return serveCachedGradedPrices(usableCache, true, variantKey);
    }
    const empty = (extra = {}) => ({
        cardId,
        cardName,
        setName: setName || '',
        prices: [],
        fetchedAt: new Date().toISOString(),
        cached: false,
        verified: false,
        productId: null,
        matchScore: null,
        stale: false,
        ageHours: null,
        ...extra,
    });
    if (!allowLiveScrape) {
        return empty({ stale: true });
    }
    try {
        const resolved = await (0, priceChartingResolver_1.resolveProduct)(resolverInput, 1500);
        if (!resolved || resolved.pageData.gradedPrices.length === 0) {
            return empty({
                productId: (_b = resolved === null || resolved === void 0 ? void 0 : resolved.pageData.productId) !== null && _b !== void 0 ? _b : null,
                matchScore: (_c = resolved === null || resolved === void 0 ? void 0 : resolved.match.matchScore) !== null && _c !== void 0 ? _c : null,
            });
        }
        const { match, pageData } = resolved;
        const verified = pageData.productId === match.productId;
        const listed = await (0, exports.saveGradedScrape)(cardId, input, match, pageData, {
            fetchListings: true,
            variantKey,
            allowStandardFinishAlias: Boolean(resolved.finishAliasedToStandard),
        });
        return {
            cardId,
            cardName,
            setName: setName || '',
            prices: applyListed(pageData.gradedPrices, listed),
            fetchedAt: new Date().toISOString(),
            cached: false,
            verified,
            productId: match.productId,
            matchScore: match.matchScore,
            stale: false,
            ageHours: 0,
        };
    }
    catch (error) {
        logger_1.logger.warn('Graded price scrape failed', {
            cardId,
            cardName,
            error: error.message,
        });
        return empty();
    }
};
exports.getGradedPrices = getGradedPrices;
