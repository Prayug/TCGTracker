"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.maybeRecoverStalePrices = exports.recoverMissedPriceUpdates = exports.updatePriceData = exports.getPriceFreshness = exports.revertIsolatedDailySpikes = exports.getPopulatedPriceHistoryDates = exports.getCompletedPriceUpdateDates = exports.getMaxPriceHistoryDate = exports.deterministicProductId = exports.hasCompletedPriceUpdateFor = exports.failStalePriceUpdateRuns = exports.carryForwardPricesToDate = exports.listPriceCatchUpDates = exports.easternHourNow = exports.PRICE_SNAPSHOT_HOUR_ET = exports.PRICE_CATCHUP_LOOKBACK_DAYS = exports.shiftIsoDate = exports.getRunDate = exports.isValidPrice = exports.normalizeVariantKey = void 0;
const database_1 = require("../db/database");
const cardIdentifier_1 = require("./cardIdentifier");
const cloudBackupService_1 = require("./cloudBackupService");
const logger_1 = require("../utils/logger");
const dbJobLock_1 = require("../utils/dbJobLock");
const catalogSync_1 = require("./catalogSync");
const tcgdexMarketProvider_1 = require("./providers/tcgdexMarketProvider");
const normalizeVariantKey_1 = require("../utils/normalizeVariantKey");
const pkmnPricesProvider_1 = require("./providers/pkmnPricesProvider");
const env_1 = require("../config/env");
const resolveListingPrice_1 = require("../utils/resolveListingPrice");
const priceChartingResolver_1 = require("./priceChartingResolver");
const canonicalPriceService_1 = require("./canonicalPriceService");
const topMoversQuality_1 = require("./topMoversQuality");
const productIdGuard_1 = require("../utils/productIdGuard");
var normalizeVariantKey_2 = require("../utils/normalizeVariantKey");
Object.defineProperty(exports, "normalizeVariantKey", { enumerable: true, get: function () { return normalizeVariantKey_2.normalizeVariantKey; } });
const SYNC_TIMEZONE = 'America/New_York';
const MAX_REASONABLE_PRICE = 50000;
const MIN_PRICE = 0.01;
// Initialize PkmnPrices provider
const pkmnPricesProvider = (0, pkmnPricesProvider_1.createPkmnPricesProvider)(env_1.env.apis.pkmnprices);
/**
 * Multi-provider wrapper that tries TCGdex first, then PkmnPrices, then returns null.
 */
class MultiSourceMarketProvider {
    constructor(providers) {
        this.providers = providers;
    }
    async getSnapshotForCard(cardId, cardName, setId, setName) {
        for (const provider of this.providers) {
            try {
                const snapshot = await provider.getSnapshotForCard(cardId, cardName, setId, setName);
                if (snapshot && snapshot.points.length > 0) {
                    return snapshot;
                }
            }
            catch (error) {
                logger_1.logger.debug('Provider failed, trying next', {
                    provider: provider.constructor.name,
                    cardId,
                    error: error.message,
                });
            }
        }
        return null;
    }
}
const multiSourceProvider = new MultiSourceMarketProvider([
    tcgdexMarketProvider_1.tcgdexMarketProvider,
    pkmnPricesProvider,
]);
const isValidPrice = (price) => {
    if (price == null || !Number.isFinite(price))
        return false;
    return price >= MIN_PRICE && price <= MAX_REASONABLE_PRICE;
};
exports.isValidPrice = isValidPrice;
const getRunDate = () => {
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: SYNC_TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    });
    return formatter.format(new Date());
};
exports.getRunDate = getRunDate;
const shiftIsoDate = (isoDate, days) => {
    const [year, month, day] = isoDate.split('-').map(Number);
    const next = new Date(Date.UTC(year, month - 1, day + days));
    return next.toISOString().slice(0, 10);
};
exports.shiftIsoDate = shiftIsoDate;
exports.PRICE_CATCHUP_LOOKBACK_DAYS = 14;
exports.PRICE_SNAPSHOT_HOUR_ET = 2;
const MIN_HISTORY_ROWS_FOR_DAY = 1000;
const MAX_LIVE_FETCHES_PER_PASS = 3;
const easternHourNow = (now = new Date()) => {
    const hour = parseInt(new Intl.DateTimeFormat('en-US', {
        timeZone: SYNC_TIMEZONE,
        hour: 'numeric',
        hourCycle: 'h23',
    }).format(now), 10);
    return Number.isFinite(hour) ? ((hour % 24) + 24) % 24 : 0;
};
exports.easternHourNow = easternHourNow;
/** Dates in [today-lookback, today] that still need a completed price_update. */
const listPriceCatchUpDates = (today, completedDates, options) => {
    var _a, _b;
    const lookback = (_a = options === null || options === void 0 ? void 0 : options.lookbackDays) !== null && _a !== void 0 ? _a : exports.PRICE_CATCHUP_LOOKBACK_DAYS;
    const hour = (_b = options === null || options === void 0 ? void 0 : options.easternHour) !== null && _b !== void 0 ? _b : (0, exports.easternHourNow)();
    const includeToday = hour >= exports.PRICE_SNAPSHOT_HOUR_ET;
    const dates = [];
    for (let offset = lookback; offset >= 0; offset -= 1) {
        const date = (0, exports.shiftIsoDate)(today, -offset);
        if (date === today && !includeToday)
            continue;
        if (!completedDates.has(date))
            dates.push(date);
    }
    return dates;
};
exports.listPriceCatchUpDates = listPriceCatchUpDates;
/** Copy the latest raw quote per UID/source onto a missed calendar day so charts stay daily. */
const carryForwardPricesToDate = async (runDate) => {
    const db = (0, database_1.getDb)();
    const sourceDate = await new Promise((resolve, reject) => {
        db.get(`SELECT MAX(date) AS d FROM price_history WHERE date < ?`, [runDate], (err, row) => {
            if (err)
                reject(err);
            else
                resolve((row === null || row === void 0 ? void 0 : row.d) || null);
        });
    });
    if (!sourceDate) {
        return { sourceDate: null, rowsCopied: 0 };
    }
    const rowsCopied = await new Promise((resolve, reject) => {
        db.run(`INSERT INTO price_history (
         productId, date, price, subTypeName, productName, groupName,
         source, lowPrice, highPrice, marketPrice, volume, uniqueIdentifier
       )
       SELECT
         ph.productId, ?, ph.price, ph.subTypeName, ph.productName, ph.groupName,
         ph.source, ph.lowPrice, ph.highPrice, ph.marketPrice, ph.volume, ph.uniqueIdentifier
       FROM price_history ph
       INNER JOIN (
         SELECT uniqueIdentifier, source, MAX(date) AS lastDate
         FROM price_history
         WHERE date < ?
         GROUP BY uniqueIdentifier, source
       ) latest
         ON latest.uniqueIdentifier = ph.uniqueIdentifier
        AND latest.source = ph.source
        AND latest.lastDate = ph.date
       ON CONFLICT(uniqueIdentifier, date, source) DO NOTHING`, [runDate, runDate], function (err) {
            var _a;
            if (err)
                reject(err);
            else
                resolve((_a = this.changes) !== null && _a !== void 0 ? _a : 0);
        });
    });
    logger_1.logger.info('Carried forward raw prices', { runDate, sourceDate, rowsCopied });
    return { sourceDate, rowsCopied };
};
exports.carryForwardPricesToDate = carryForwardPricesToDate;
const failStalePriceUpdateRuns = async (staleHours = 2) => {
    const db = (0, database_1.getDb)();
    return new Promise((resolve, reject) => {
        db.run(`UPDATE sync_runs
       SET status = 'failed',
           message = 'orphaned running job (process crashed or stuck)',
           completedAt = datetime('now')
       WHERE runType = 'price_update'
         AND status = 'running'
         AND startedAt <= datetime('now', ?)`, [`-${Math.max(1, staleHours)} hours`], function (err) {
            var _a;
            if (err)
                reject(err);
            else
                resolve((_a = this.changes) !== null && _a !== void 0 ? _a : 0);
        });
    });
};
exports.failStalePriceUpdateRuns = failStalePriceUpdateRuns;
const hasCompletedPriceUpdateFor = async (runDate) => {
    const db = (0, database_1.getDb)();
    return new Promise((resolve, reject) => {
        db.get(`SELECT 1 FROM sync_runs
       WHERE runType = 'price_update' AND runDate = ? AND status = 'completed'
       LIMIT 1`, [runDate], (err, row) => (err ? reject(err) : resolve(!!row)));
    });
};
exports.hasCompletedPriceUpdateFor = hasCompletedPriceUpdateFor;
const createSyncRun = async (runType, runDate) => {
    const db = (0, database_1.getDb)();
    return new Promise((resolve, reject) => {
        db.run(`INSERT INTO sync_runs (runType, runDate, status, startedAt)
       VALUES (?, ?, 'running', datetime('now'))`, [runType, runDate], function (err) {
            if (err) {
                reject(err);
            }
            else {
                resolve(this.lastID);
            }
        });
    });
};
const finalizeSyncRun = async (runId, status, payload) => {
    const db = (0, database_1.getDb)();
    return new Promise((resolve, reject) => {
        db.run(`UPDATE sync_runs
       SET status = ?,
           totalPricesProcessed = ?,
           groupsProcessed = ?,
           groupsFailed = ?,
           message = ?,
           completedAt = datetime('now')
       WHERE id = ?`, [
            status,
            payload.totalPricesProcessed || 0,
            payload.groupsProcessed || 0,
            payload.groupsFailed || 0,
            payload.message || null,
            runId,
        ], (err) => {
            if (err) {
                reject(err);
            }
            else {
                resolve();
            }
        });
    });
};
const loadCatalogCards = async (language) => {
    const db = (0, database_1.getDb)();
    const fetchRows = () => new Promise((resolve, reject) => {
        const where = language ? `WHERE COALESCE(language, 'en') = ?` : '';
        const params = language ? [language] : [];
        db.all(`SELECT cardId, cardName, setId, setName, cardNumber, tcgplayerProductId, tcgplayerPrices,
                imageSmall, imageLarge,
                COALESCE(language, 'en') AS language,
                COALESCE(matchName, cardName) AS matchName
         FROM catalog_cards ${where}`, params, (err, rows) => {
            if (err)
                reject(err);
            else
                resolve(rows || []);
        });
    });
    const rows = await fetchRows();
    if (rows.length > 0 || language === 'ja') {
        return rows;
    }
    logger_1.logger.info('Catalog empty for market snapshot, syncing catalog first...');
    await (0, catalogSync_1.syncCatalogData)();
    return fetchRows();
};
const extractCatalogFallbackPoints = (row, preferredProductId) => {
    if (!row.tcgplayerPrices) {
        return [];
    }
    try {
        const parsed = JSON.parse(row.tcgplayerPrices);
        return Object.entries(parsed)
            .map(([rawVariant, price]) => {
            const marketPrice = (0, resolveListingPrice_1.resolveListingPrice)({
                market: price.market,
                mid: price.mid,
                low: price.low,
                high: price.high,
            });
            if (!marketPrice || marketPrice <= 0) {
                return null;
            }
            const variantKey = (0, normalizeVariantKey_1.normalizeVariantKey)(rawVariant);
            const parsedProductId = row.tcgplayerProductId
                ? Number.parseInt(String(row.tcgplayerProductId), 10)
                : Number.NaN;
            const productId = preferredProductId && preferredProductId > 0
                ? preferredProductId
                : Number.isFinite(parsedProductId)
                    ? parsedProductId
                    : (0, exports.deterministicProductId)(row.cardId, variantKey);
            return {
                variantKey,
                subTypeName: rawVariant,
                productId,
                marketPrice,
                lowPrice: price.low,
                highPrice: price.high,
            };
        })
            .filter((point) => Boolean(point));
    }
    catch (_a) {
        return [];
    }
};
const createDailySnapshot = async (date) => {
    const db = (0, database_1.getDb)();
    return new Promise((resolve, reject) => {
        // Calculate daily statistics
        const statsSql = `
      SELECT 
        COUNT(*) as totalCards,
        AVG(price) as avgPrice,
        COUNT(*) as totalVolume
      FROM price_history 
      WHERE date = ?
    `;
        db.get(statsSql, [date], (err, stats) => {
            if (err) {
                reject(err);
                return;
            }
            // Compute median price using SQLite's PERCENTILE-style approach
            const medianSql = `
        SELECT AVG(price) as medianPrice FROM (
          SELECT price FROM price_history
          WHERE date = ? AND price > 0
          ORDER BY price
          LIMIT 2 - (SELECT COUNT(*) FROM price_history WHERE date = ? AND price > 0) % 2
          OFFSET (SELECT (COUNT(*) - 1) / 2 FROM price_history WHERE date = ? AND price > 0)
        )
      `;
            db.get(medianSql, [date, date, date], (err, medianRow) => {
                if (err) {
                    reject(err);
                    return;
                }
                // Get top gainers and losers
                const gainersSql = `
          SELECT 
            ph1.productName,
            ph1.price as currentPrice,
            ph2.price as previousPrice,
            ((ph1.price - ph2.price) / ph2.price * 100) as changePercent
          FROM price_history ph1
          JOIN price_history ph2 ON ph1.uniqueIdentifier = ph2.uniqueIdentifier
          WHERE ph1.date = ? 
            AND ph2.date = date(?, '-1 day')
            AND ph1.price > 0 AND ph2.price > 0
          ORDER BY changePercent DESC
          LIMIT 10
        `;
                db.all(gainersSql, [date, date], (err, gainers) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    const losersSql = gainersSql.replace('DESC', 'ASC');
                    db.all(losersSql, [date, date], (err, losers) => {
                        var _a;
                        if (err) {
                            reject(err);
                            return;
                        }
                        // Insert snapshot
                        const insertSnapshotSql = `
              INSERT OR REPLACE INTO price_snapshots 
              (date, totalCards, avgPrice, medianPrice, totalVolume, topGainers, topLosers)
              VALUES (?, ?, ?, ?, ?, ?, ?)
            `;
                        db.run(insertSnapshotSql, [
                            date,
                            (stats === null || stats === void 0 ? void 0 : stats.totalCards) || 0,
                            (stats === null || stats === void 0 ? void 0 : stats.avgPrice) || 0,
                            (_a = medianRow === null || medianRow === void 0 ? void 0 : medianRow.medianPrice) !== null && _a !== void 0 ? _a : null,
                            (stats === null || stats === void 0 ? void 0 : stats.totalVolume) || 0,
                            JSON.stringify(gainers || []),
                            JSON.stringify(losers || [])
                        ], (err) => {
                            if (err) {
                                reject(err);
                            }
                            else {
                                resolve();
                            }
                        });
                    });
                });
            });
        });
    });
};
const crypto_1 = __importDefault(require("crypto"));
const deterministicProductId = (cardId, variantKey) => {
    const input = `${cardId}|${variantKey}`;
    const hash = crypto_1.default.createHash('sha256').update(input).digest();
    // Use first 4 bytes as a 32-bit unsigned integer
    // SHA-256 collision probability for N items is ~N^2 / 2^257, negligible for ~20k cards
    return (hash.readUInt32BE(0) >>> 0) % 100000000 + 1;
};
exports.deterministicProductId = deterministicProductId;
const snapshotFromPokemonCatalog = async (date) => {
    var _a, _b;
    const db = (0, database_1.getDb)();
    const priceInsertSql = `
    INSERT INTO price_history (
      productId, date, price, subTypeName, productName, groupName,
      source, lowPrice, highPrice, marketPrice, volume, uniqueIdentifier
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(uniqueIdentifier, date, source) DO UPDATE SET
      price = excluded.price,
      lowPrice = excluded.lowPrice,
      highPrice = excluded.highPrice,
      marketPrice = excluded.marketPrice,
      productName = excluded.productName,
      groupName = excluded.groupName,
      productId = excluded.productId;
  `;
    const rows = await new Promise((resolve, reject) => {
        db.all(`SELECT cardId, cardName, setId, setName, cardNumber, tcgplayerProductId, tcgplayerPrices
       FROM catalog_cards
       WHERE tcgplayerPrices IS NOT NULL
       AND tcgplayerPrices <> ''`, [], (err, resultRows) => {
            if (err) {
                reject(err);
            }
            else {
                resolve(resultRows || []);
            }
        });
    });
    if (rows.length === 0) {
        logger_1.logger.info('Catalog empty for fallback snapshot, syncing catalog first...');
        await (0, catalogSync_1.syncCatalogData)();
    }
    const refreshedRows = rows.length > 0
        ? rows
        : await new Promise((resolve, reject) => {
            db.all(`SELECT cardId, cardName, setId, setName, cardNumber, tcgplayerProductId, tcgplayerPrices
           FROM catalog_cards
           WHERE tcgplayerPrices IS NOT NULL
           AND tcgplayerPrices <> ''`, [], (err, resultRows) => {
                if (err) {
                    reject(err);
                }
                else {
                    resolve(resultRows || []);
                }
            });
        });
    const stmt = db.prepare(priceInsertSql);
    let inserted = 0;
    const runStmt = (params) => new Promise((resolve, reject) => {
        stmt.run(params, (err) => {
            if (err)
                reject(err);
            else
                resolve();
        });
    });
    try {
        await new Promise((resolve, reject) => {
            db.run('BEGIN TRANSACTION', (err) => (err ? reject(err) : resolve()));
        });
        for (const row of refreshedRows) {
            const parsedPrices = JSON.parse(row.tcgplayerPrices || '{}');
            for (const [rawVariantKey, variantValue] of Object.entries(parsedPrices)) {
                const priceData = variantValue;
                const market = (0, resolveListingPrice_1.resolveListingPrice)({
                    market: priceData.market,
                    mid: priceData.mid,
                    low: priceData.low,
                    high: priceData.high,
                });
                if (!market || market <= 0) {
                    continue;
                }
                if (!(0, exports.isValidPrice)(market)) {
                    continue;
                }
                const variantKey = (0, normalizeVariantKey_1.normalizeVariantKey)(rawVariantKey);
                const uniqueIdentifier = (0, cardIdentifier_1.generateUniqueIdentifier)(row.setId, row.cardNumber, row.cardName, variantKey, {
                    language: row.language || 'en',
                    matchName: row.matchName || row.cardName,
                });
                const parsedProductId = row.tcgplayerProductId
                    ? Number.parseInt(String(row.tcgplayerProductId), 10)
                    : Number.NaN;
                const productId = Number.isFinite(parsedProductId)
                    ? parsedProductId
                    : (0, exports.deterministicProductId)(row.cardId || `${row.setId}-${row.cardNumber}-${row.cardName}`, variantKey);
                await runStmt([
                    productId,
                    date,
                    market,
                    variantKey,
                    row.cardName,
                    row.setName,
                    'catalog_fallback',
                    (_a = priceData.low) !== null && _a !== void 0 ? _a : null,
                    (_b = priceData.high) !== null && _b !== void 0 ? _b : null,
                    market,
                    null,
                    uniqueIdentifier,
                ]);
                inserted += 1;
            }
        }
        stmt.finalize();
        await new Promise((resolve, reject) => {
            db.run('COMMIT', (err) => (err ? reject(err) : resolve()));
        });
    }
    catch (err) {
        stmt.finalize();
        await new Promise((resolve) => {
            db.run('ROLLBACK', () => resolve());
        });
        throw err;
    }
    return inserted;
};
const snapshotFromMarketProvider = async (date, marketProvider, options) => {
    var _a, _b, _c;
    const db = (0, database_1.getDb)();
    const language = (options === null || options === void 0 ? void 0 : options.language) || 'en';
    const rows = await loadCatalogCards(language);
    if (rows.length === 0) {
        return { pricesWritten: 0, cardsProcessed: 0, cardsFailed: 0 };
    }
    const mappingOwners = await new Promise((resolve, reject) => {
        db.all(`SELECT cardId, cardName, setName, cardNumber, productId
       FROM card_mappings
       WHERE productId IS NOT NULL AND productId > 0`, [], (err, result) => {
            if (err)
                reject(err);
            else
                resolve((result || []));
        });
    });
    const ownersByProductId = new Map();
    const tcgcsvCandidates = [];
    for (const owner of mappingOwners) {
        const list = ownersByProductId.get(owner.productId) || [];
        list.push({
            cardId: owner.cardId,
            setName: owner.setName,
            cardNumber: owner.cardNumber,
        });
        ownersByProductId.set(owner.productId, list);
        if (String(owner.cardId).startsWith('tcgcsv-')) {
            tcgcsvCandidates.push(owner);
        }
    }
    const resolveTrustedProductId = (row, tcgdexProductId) => {
        // TCGCSV name+number+print-family is authoritative. Catalog/TCGdex often
        // store the main-set SKU on Trainer Gallery rows (Mimikyu V TG16 → #68).
        const fromTcgcsv = (0, productIdGuard_1.resolveProductIdFromOwners)(row.cardName, row.setName, row.cardNumber, tcgcsvCandidates);
        if (fromTcgcsv)
            return fromTcgcsv;
        const catalogId = row.tcgplayerProductId
            ? Number.parseInt(String(row.tcgplayerProductId), 10)
            : Number.NaN;
        if (Number.isFinite(catalogId) &&
            catalogId > 0 &&
            !(0, productIdGuard_1.productIdConflictsWithPrintFamily)(catalogId, row.setName, ownersByProductId.get(catalogId) || [])) {
            return catalogId;
        }
        if (tcgdexProductId &&
            tcgdexProductId > 0 &&
            !(0, productIdGuard_1.productIdConflictsWithPrintFamily)(tcgdexProductId, row.setName, ownersByProductId.get(tcgdexProductId) || [])) {
            return tcgdexProductId;
        }
        return null;
    };
    const priceInsertSql = `
    INSERT INTO price_history (
      productId, date, price, subTypeName, productName, groupName,
      source, lowPrice, highPrice, marketPrice, volume, uniqueIdentifier
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(uniqueIdentifier, date, source) DO UPDATE SET
      price = excluded.price,
      lowPrice = excluded.lowPrice,
      highPrice = excluded.highPrice,
      marketPrice = excluded.marketPrice,
      productName = excluded.productName,
      groupName = excluded.groupName,
      productId = excluded.productId;
  `;
    const mappingInsertSql = `
    INSERT OR REPLACE INTO card_mappings 
    (cardId, productId, cardName, setId, setName, cardNumber, rarity, variantKey, tcgplayerProductId,
     uniqueIdentifier, catalogSetId, imageSmall, imageLarge, imageSource, imageLastUpdated,
     language, matchName, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?, ?, datetime('now'))
  `;
    const priceStmt = db.prepare(priceInsertSql);
    const mappingStmt = db.prepare(mappingInsertSql);
    const concurrency = 6;
    const chunkSize = Math.ceil(rows.length / concurrency);
    const chunks = Array.from({ length: concurrency }, (_, i) => rows.slice(i * chunkSize, (i + 1) * chunkSize));
    const defaultSource = (options === null || options === void 0 ? void 0 : options.sourceOverride) ||
        (language === 'ja' ? 'tcgdex_ja' : 'tcgdex');
    const workerResults = await Promise.all(chunks.map(async (chunk) => {
        var _a, _b, _c;
        const entries = [];
        let cardsProcessed = 0;
        let cardsFailed = 0;
        let tcgdexAttempted = 0;
        let tcgdexSuccessful = 0;
        for (const row of chunk) {
            const trustedCatalogProductId = resolveTrustedProductId(row);
            const snapshot = await marketProvider.getSnapshotForCard(row.cardId);
            const tcgdexPoints = (_a = snapshot === null || snapshot === void 0 ? void 0 : snapshot.points) !== null && _a !== void 0 ? _a : [];
            tcgdexAttempted += 1;
            const trustedTcgplayerId = trustedCatalogProductId != null ? String(trustedCatalogProductId) : null;
            const pushFallback = () => {
                const fallbackPoints = extractCatalogFallbackPoints(row, trustedCatalogProductId);
                if (fallbackPoints.length === 0)
                    return false;
                for (const point of fallbackPoints) {
                    const variantKey = (0, normalizeVariantKey_1.normalizeVariantKey)(point.subTypeName || point.variantKey);
                    if (!(0, exports.isValidPrice)(point.marketPrice))
                        continue;
                    entries.push({
                        row,
                        variantKey,
                        subTypeName: point.subTypeName || variantKey,
                        productId: point.productId,
                        tcgplayerProductId: trustedTcgplayerId ||
                            (point.productId > 0 ? String(point.productId) : row.tcgplayerProductId || null),
                        marketPrice: point.marketPrice,
                        lowPrice: (0, exports.isValidPrice)(point.lowPrice) ? point.lowPrice : undefined,
                        highPrice: (0, exports.isValidPrice)(point.highPrice) ? point.highPrice : undefined,
                        source: 'catalog_fallback',
                    });
                }
                return true;
            };
            if (tcgdexPoints.length === 0) {
                if (!pushFallback())
                    cardsFailed += 1;
                else
                    cardsProcessed += 1;
                continue;
            }
            const isSubsetCard = (0, productIdGuard_1.cardLooksLikeSubsetPrint)(row.setName, row.cardNumber);
            let acceptedTcgdex = 0;
            for (const point of tcgdexPoints) {
                const rawVariantName = String((_c = (_b = point.rawVariantName) !== null && _b !== void 0 ? _b : point.subTypeName) !== null && _c !== void 0 ? _c : point.variantKey);
                const variantKey = (0, normalizeVariantKey_1.canonicalFinishVariantKey)(point.variantKey || rawVariantName);
                const candidateProductId = Number(point.productId);
                const tcgdexProductId = Number.isFinite(candidateProductId) && candidateProductId > 0
                    ? candidateProductId
                    : undefined;
                const trustedForPoint = resolveTrustedProductId(row, tcgdexProductId);
                const owners = tcgdexProductId
                    ? ownersByProductId.get(tcgdexProductId) || []
                    : [];
                // Reject TCGdex SKUs that belong to a different print family, or that
                // disagree with the TCGCSV SKU for this name/number/family. Stamping a
                // main-set price onto a Trainer Gallery UID is what caused chart cliffs.
                if (tcgdexProductId &&
                    (0, productIdGuard_1.productIdConflictsWithPrintFamily)(tcgdexProductId, row.setName, owners)) {
                    continue;
                }
                if (trustedForPoint &&
                    tcgdexProductId &&
                    tcgdexProductId !== trustedForPoint) {
                    continue;
                }
                if (isSubsetCard && trustedForPoint && !tcgdexProductId) {
                    // Subset cards without a SKU from TCGdex are unreliable (name collision).
                    continue;
                }
                const productId = trustedForPoint !== null && trustedForPoint !== void 0 ? trustedForPoint : (tcgdexProductId && tcgdexProductId > 0
                    ? tcgdexProductId
                    : (0, exports.deterministicProductId)(row.cardId, variantKey));
                if (!(0, exports.isValidPrice)(point.marketPrice)) {
                    continue;
                }
                const isCardmarket = /cardmarket/i.test(rawVariantName);
                entries.push({
                    row,
                    variantKey,
                    subTypeName: variantKey,
                    productId,
                    tcgplayerProductId: trustedForPoint != null
                        ? String(trustedForPoint)
                        : row.tcgplayerProductId || null,
                    marketPrice: point.marketPrice,
                    lowPrice: (0, exports.isValidPrice)(point.lowPrice) ? point.lowPrice : undefined,
                    highPrice: (0, exports.isValidPrice)(point.highPrice) ? point.highPrice : undefined,
                    volume: point.volume,
                    source: isCardmarket && language === 'ja' ? 'cardmarket' : defaultSource,
                });
                acceptedTcgdex += 1;
            }
            if (acceptedTcgdex === 0) {
                // All TCGdex points were print-family collisions — keep catalog prices.
                if (!pushFallback())
                    cardsFailed += 1;
                else
                    cardsProcessed += 1;
                continue;
            }
            tcgdexSuccessful += 1;
            cardsProcessed += 1;
        }
        return { entries, cardsProcessed, cardsFailed, tcgdexAttempted, tcgdexSuccessful };
    }));
    const collected = workerResults.flatMap((r) => r.entries);
    let cardsProcessed = workerResults.reduce((s, r) => s + r.cardsProcessed, 0);
    let cardsFailed = workerResults.reduce((s, r) => s + r.cardsFailed, 0);
    const runPriceStmt = (params) => new Promise((resolve, reject) => {
        priceStmt.run(params, (err) => {
            if (err)
                reject(err);
            else
                resolve();
        });
    });
    const runMappingStmt = (params) => new Promise((resolve, reject) => {
        mappingStmt.run(params, (err) => {
            if (err)
                reject(err);
            else
                resolve();
        });
    });
    try {
        await new Promise((resolve, reject) => {
            db.run('BEGIN TRANSACTION', (err) => (err ? reject(err) : resolve()));
        });
        for (const entry of collected) {
            const lang = (entry.row.language || language || 'en');
            const matchName = entry.row.matchName || entry.row.cardName;
            const uniqueIdentifier = (0, cardIdentifier_1.generateUniqueIdentifier)(entry.row.setId, entry.row.cardNumber, entry.row.cardName, entry.variantKey, { language: lang, matchName });
            await runPriceStmt([
                entry.productId,
                date,
                entry.marketPrice,
                entry.subTypeName,
                entry.row.cardName,
                entry.row.setName,
                entry.source,
                (_a = entry.lowPrice) !== null && _a !== void 0 ? _a : null,
                (_b = entry.highPrice) !== null && _b !== void 0 ? _b : null,
                entry.marketPrice,
                (_c = entry.volume) !== null && _c !== void 0 ? _c : null,
                uniqueIdentifier,
            ]);
            await runMappingStmt([
                entry.row.cardId,
                entry.productId,
                entry.row.cardName,
                entry.row.setId,
                entry.row.setName,
                entry.row.cardNumber || null,
                null,
                entry.variantKey,
                entry.tcgplayerProductId || entry.row.tcgplayerProductId || null,
                uniqueIdentifier,
                entry.row.setId,
                entry.row.imageSmall || null,
                entry.row.imageLarge || null,
                entry.row.imageSmall || entry.row.imageLarge ? 'catalog_sync' : null,
                lang,
                matchName,
            ]);
        }
        priceStmt.finalize();
        mappingStmt.finalize();
        await new Promise((resolve, reject) => {
            db.run('COMMIT', (err) => (err ? reject(err) : resolve()));
        });
    }
    catch (err) {
        priceStmt.finalize();
        mappingStmt.finalize();
        await new Promise((resolve) => {
            db.run('ROLLBACK', () => resolve());
        });
        throw err;
    }
    return {
        pricesWritten: collected.length,
        cardsProcessed,
        cardsFailed,
    };
};
/** Fill gaps for Japanese cards using PriceCharting ungraded column (US proxy market). */
const snapshotJapaneseFromPriceCharting = async (date, limit = 80) => {
    const db = (0, database_1.getDb)();
    const rows = await new Promise((resolve, reject) => {
        db.all(`SELECT cc.cardId, cc.cardName, cc.setId, cc.setName, cc.cardNumber,
              cc.tcgplayerProductId, cc.imageSmall, cc.imageLarge,
              COALESCE(cc.language, 'ja') AS language,
              COALESCE(cc.matchName, cc.cardName) AS matchName
       FROM catalog_cards cc
       LEFT JOIN card_mappings cm ON cm.cardId = cc.cardId
       LEFT JOIN price_history ph ON ph.uniqueIdentifier = cm.uniqueIdentifier
         AND ph.date = ? AND ph.source IN ('tcgdex_ja', 'cardmarket', 'pricecharting_raw')
       WHERE COALESCE(cc.language, 'en') = 'ja'
         AND ph.uniqueIdentifier IS NULL
         AND COALESCE(cc.matchName, '') != ''
         AND cc.matchName GLOB '[A-Za-z]*'
       ORDER BY cc.setId, CAST(cc.cardNumber AS INTEGER)
       LIMIT ?`, [date, limit], (err, result) => {
            if (err)
                reject(err);
            else
                resolve(result || []);
        });
    });
    let pricesWritten = 0;
    let cardsProcessed = 0;
    for (const row of rows) {
        cardsProcessed += 1;
        try {
            const resolved = await (0, priceChartingResolver_1.resolveProduct)({
                cardName: row.cardName,
                matchName: row.matchName,
                setId: row.setId,
                setName: row.setName,
                cardNumber: row.cardNumber,
                language: 'ja',
                variant: 'normal',
            }, 1200);
            if (!resolved)
                continue;
            const ungraded = resolved.pageData.gradedPrices.find((p) => p.grader === 'ungraded' && p.price != null && p.price > 0);
            if (!(ungraded === null || ungraded === void 0 ? void 0 : ungraded.price) || !(0, exports.isValidPrice)(ungraded.price))
                continue;
            const variantKey = 'normal';
            const uniqueIdentifier = (0, cardIdentifier_1.generateUniqueIdentifier)(row.setId, row.cardNumber, row.cardName, variantKey, { language: 'ja', matchName: row.matchName || row.cardName });
            const productId = Number.parseInt(String(resolved.match.productId).replace(/\D/g, ''), 10) || 0;
            await new Promise((resolve, reject) => {
                db.run(`INSERT INTO price_history (
             productId, date, price, subTypeName, productName, groupName,
             source, lowPrice, highPrice, marketPrice, volume, uniqueIdentifier
           ) VALUES (?, ?, ?, ?, ?, ?, 'pricecharting_raw', NULL, NULL, ?, NULL, ?)
           ON CONFLICT(uniqueIdentifier, date, source) DO UPDATE SET
             price = excluded.price, marketPrice = excluded.marketPrice`, [
                    productId,
                    date,
                    ungraded.price,
                    variantKey,
                    row.cardName,
                    row.setName,
                    ungraded.price,
                    uniqueIdentifier,
                ], (err) => (err ? reject(err) : resolve()));
            });
            await new Promise((resolve, reject) => {
                db.run(`INSERT OR REPLACE INTO card_mappings
           (cardId, productId, cardName, setId, setName, cardNumber, rarity, variantKey,
            tcgplayerProductId, uniqueIdentifier, catalogSetId, imageSmall, imageLarge,
            imageSource, language, matchName, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?, NULL, ?, NULL, ?, ?, ?, ?, 'catalog_sync', 'ja', ?, datetime('now'))`, [
                    row.cardId,
                    productId,
                    row.cardName,
                    row.setId,
                    row.setName,
                    row.cardNumber || null,
                    variantKey,
                    uniqueIdentifier,
                    row.setId,
                    row.imageSmall || null,
                    row.imageLarge || null,
                    row.matchName || row.cardName,
                ], (err) => (err ? reject(err) : resolve()));
            });
            pricesWritten += 1;
        }
        catch (error) {
            logger_1.logger.debug('JA PriceCharting raw snapshot failed', {
                cardId: row.cardId,
                error: error.message,
            });
        }
    }
    return { pricesWritten, cardsProcessed };
};
const queryColumn = (sql, params) => {
    const db = (0, database_1.getDb)();
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err)
                reject(err);
            else
                resolve(rows || []);
        });
    });
};
const getMaxPriceHistoryDate = async () => {
    var _a;
    const rows = await queryColumn(`SELECT MAX(date) AS d FROM price_history`, []);
    return ((_a = rows[0]) === null || _a === void 0 ? void 0 : _a.d) || null;
};
exports.getMaxPriceHistoryDate = getMaxPriceHistoryDate;
const getCompletedPriceUpdateDates = async (sinceDate) => {
    const rows = await queryColumn(`SELECT DISTINCT runDate FROM sync_runs
     WHERE runType = 'price_update' AND status = 'completed' AND runDate >= ?`, [sinceDate]);
    return new Set(rows.map((row) => row.runDate));
};
exports.getCompletedPriceUpdateDates = getCompletedPriceUpdateDates;
const getPopulatedPriceHistoryDates = async (sinceDate) => {
    const rows = await queryColumn(`SELECT date FROM price_history
     WHERE date >= ?
     GROUP BY date
     HAVING COUNT(*) >= ?`, [sinceDate, MIN_HISTORY_ROWS_FOR_DAY]);
    return new Set(rows.map((row) => row.date));
};
exports.getPopulatedPriceHistoryDates = getPopulatedPriceHistoryDates;
/** Roll back one-day TCGdex quote spikes off a flat baseline so movers/charts stay honest. */
const revertIsolatedDailySpikes = async (runDate) => {
    const db = (0, database_1.getDb)();
    const yesterday = (0, exports.shiftIsoDate)(runDate, -1);
    const sinceDate = (0, exports.shiftIsoDate)(runDate, -6);
    const candidates = await queryColumn(`SELECT t.uniqueIdentifier, t.source, t.price AS todayPrice, y.price AS ydayPrice
     FROM price_history t
     INNER JOIN price_history y
       ON y.uniqueIdentifier = t.uniqueIdentifier
      AND y.source = t.source
      AND y.date = date(t.date, '-1 day')
     WHERE t.date = ?
       AND t.source IN ('tcgdex', 'tcgdex_ja')
       AND y.price >= ?
       AND ABS(t.price - y.price) / y.price >= 0.40`, [runDate, MIN_PRICE]);
    if (candidates.length === 0) {
        return { checked: 0, reverted: 0 };
    }
    const uids = [...new Set(candidates.map((c) => c.uniqueIdentifier))];
    const placeholders = uids.map(() => '?').join(',');
    const history = await queryColumn(`SELECT uniqueIdentifier, source, date, price
     FROM price_history
     WHERE uniqueIdentifier IN (${placeholders})
       AND source IN ('tcgdex', 'tcgdex_ja')
       AND date >= ?
       AND date <= ?`, [...uids, sinceDate, runDate]);
    const series = new Map();
    for (const row of history) {
        const key = `${row.uniqueIdentifier}||${row.source}`;
        const list = series.get(key) || [];
        list.push({ date: row.date, price: row.price });
        series.set(key, list);
    }
    let reverted = 0;
    for (const candidate of candidates) {
        const points = series.get(`${candidate.uniqueIdentifier}||${candidate.source}`) || [];
        if (!(0, topMoversQuality_1.isIsolatedEndpointSpike)(points))
            continue;
        await new Promise((resolve, reject) => {
            db.run(`UPDATE price_history
         SET price = ?, marketPrice = ?
         WHERE uniqueIdentifier = ? AND source = ? AND date = ?`, [
                candidate.ydayPrice,
                candidate.ydayPrice,
                candidate.uniqueIdentifier,
                candidate.source,
                runDate,
            ], (err) => (err ? reject(err) : resolve()));
        });
        reverted += 1;
    }
    if (reverted > 0) {
        logger_1.logger.warn('Reverted isolated TCGdex quote spikes', {
            runDate,
            checked: candidates.length,
            reverted,
        });
    }
    return { checked: candidates.length, reverted };
};
exports.revertIsolatedDailySpikes = revertIsolatedDailySpikes;
const getPriceFreshness = async () => {
    const today = (0, exports.getRunDate)();
    const hour = (0, exports.easternHourNow)();
    const expectedDate = hour >= exports.PRICE_SNAPSHOT_HOUR_ET ? today : (0, exports.shiftIsoDate)(today, -1);
    const latestDate = await (0, exports.getMaxPriceHistoryDate)();
    const stale = !latestDate || latestDate < expectedDate;
    return { today, expectedDate, latestDate, stale, easternHour: hour };
};
exports.getPriceFreshness = getPriceFreshness;
const updatePriceData = async (options) => {
    var _a;
    const runDate = (options === null || options === void 0 ? void 0 : options.runDate) || (0, exports.getRunDate)();
    await (0, exports.failStalePriceUpdateRuns)();
    const result = await (0, dbJobLock_1.withDbJobLock)('price_update', () => performPriceUpdate(runDate), {
        skipIfBusy: (_a = options === null || options === void 0 ? void 0 : options.skipIfBusy) !== null && _a !== void 0 ? _a : true,
        maxWaitMs: options === null || options === void 0 ? void 0 : options.maxWaitMs,
    });
    if ((0, dbJobLock_1.isSkippedDbJob)(result)) {
        return {
            syncRunId: null,
            started: false,
            skipped: true,
            runDate,
            reason: result.reason,
        };
    }
    return result;
};
exports.updatePriceData = updatePriceData;
const fillMissingHistoryDays = async (dates) => {
    const filled = [];
    for (const runDate of dates) {
        try {
            const carried = await (0, exports.carryForwardPricesToDate)(runDate);
            filled.push({ runDate, rowsCopied: carried.rowsCopied });
        }
        catch (error) {
            logger_1.logger.warn('Carry-forward failed', {
                runDate,
                error: error.message,
            });
        }
    }
    return filled;
};
let recoverMutex = null;
/** Fill every missed day in the lookback window; live-fetch today's prices after 2:00 ET. */
const recoverMissedPriceUpdates = async () => {
    if (recoverMutex) {
        return recoverMutex;
    }
    recoverMutex = runPriceCatchUp().finally(() => {
        recoverMutex = null;
    });
    return recoverMutex;
};
exports.recoverMissedPriceUpdates = recoverMissedPriceUpdates;
const runPriceCatchUp = async () => {
    var _a;
    await (0, exports.failStalePriceUpdateRuns)();
    const today = (0, exports.getRunDate)();
    const sinceDate = (0, exports.shiftIsoDate)(today, -exports.PRICE_CATCHUP_LOOKBACK_DAYS);
    const [completedDates, populatedDates] = await Promise.all([
        (0, exports.getCompletedPriceUpdateDates)(sinceDate),
        (0, exports.getPopulatedPriceHistoryDates)(sinceDate),
    ]);
    const hour = (0, exports.easternHourNow)();
    const datesNeedingFetch = (0, exports.listPriceCatchUpDates)(today, completedDates, { easternHour: hour });
    const datesNeedingRows = (0, exports.listPriceCatchUpDates)(today, populatedDates, { easternHour: hour });
    const carried = datesNeedingRows.length > 0 ? await fillMissingHistoryDays(datesNeedingRows) : [];
    if (carried.some((row) => row.rowsCopied > 0)) {
        logger_1.logger.warn('Carried forward missed price days so charts stay continuous', { carried });
    }
    if (datesNeedingFetch.length === 0) {
        return {
            syncRunId: null,
            started: false,
            skipped: true,
            runDate: today,
            reason: 'already completed',
            carried,
        };
    }
    const toFetch = datesNeedingFetch.slice(0, MAX_LIVE_FETCHES_PER_PASS);
    logger_1.logger.warn('Backfilling missed price updates', { dates: toFetch, remaining: datesNeedingFetch.length - toFetch.length });
    const results = [];
    for (const runDate of toFetch) {
        const result = await (0, exports.updatePriceData)({
            runDate,
            skipIfBusy: false,
            maxWaitMs: 5 * 60 * 1000,
        });
        results.push(result);
        if (result.skipped) {
            logger_1.logger.warn('Price backfill stopped early', { runDate, reason: result.reason });
            break;
        }
    }
    const last = results[results.length - 1];
    return {
        syncRunId: (_a = last === null || last === void 0 ? void 0 : last.syncRunId) !== null && _a !== void 0 ? _a : null,
        started: Boolean(last === null || last === void 0 ? void 0 : last.started),
        skipped: Boolean(last === null || last === void 0 ? void 0 : last.skipped),
        runDate: (last === null || last === void 0 ? void 0 : last.runDate) || toFetch[0],
        fetched: results,
        carried,
        pendingDates: datesNeedingFetch.slice(results.length),
    };
};
let recoverInFlight = null;
let lastRecoverAttemptAt = 0;
const RECOVER_DEBOUNCE_MS = 60 * 1000;
/** Fire-and-forget catch-up so opening the app heals a stalled ingest. */
const maybeRecoverStalePrices = () => {
    if (recoverInFlight)
        return;
    if (Date.now() - lastRecoverAttemptAt < RECOVER_DEBOUNCE_MS)
        return;
    lastRecoverAttemptAt = Date.now();
    recoverInFlight = (0, exports.recoverMissedPriceUpdates)()
        .catch((error) => {
        logger_1.logger.warn('Background price catch-up failed', { error: error.message });
    })
        .finally(() => {
        recoverInFlight = null;
    });
};
exports.maybeRecoverStalePrices = maybeRecoverStalePrices;
const performPriceUpdate = async (runDate) => {
    let syncRunId = null;
    try {
        logger_1.logger.info('Starting market price data update...', { runDate, timezone: SYNC_TIMEZONE });
        syncRunId = await createSyncRun('price_update', runDate);
        tcgdexMarketProvider_1.tcgdexMarketProvider.resetCircuit();
        tcgdexMarketProvider_1.tcgdexJaMarketProvider.resetCircuit();
        const carried = await (0, exports.carryForwardPricesToDate)(runDate);
        let totalPricesProcessed = carried.rowsCopied;
        let groupsProcessed = 0;
        let groupsFailed = 0;
        let usedFallback = false;
        try {
            const marketSnapshot = await snapshotFromMarketProvider(runDate, tcgdexMarketProvider_1.tcgdexMarketProvider, {
                language: 'en',
            });
            totalPricesProcessed = marketSnapshot.pricesWritten;
            groupsProcessed = marketSnapshot.cardsProcessed;
            groupsFailed = marketSnapshot.cardsFailed;
            logger_1.logger.info('TCGdex snapshot complete', { runDate, ...marketSnapshot });
            const spikeFix = await (0, exports.revertIsolatedDailySpikes)(runDate);
            if (spikeFix.reverted > 0) {
                logger_1.logger.info('Isolated TCGdex spikes reverted', spikeFix);
            }
        }
        catch (marketError) {
            logger_1.logger.warn('TCGdex snapshot failed, using catalog fallback', {
                error: marketError.message,
            });
            const fallbackRows = await snapshotFromPokemonCatalog(runDate);
            totalPricesProcessed = fallbackRows;
            groupsProcessed = fallbackRows > 0 ? 1 : 0;
            groupsFailed = 0;
            usedFallback = true;
        }
        try {
            const jaSnapshot = await snapshotFromMarketProvider(runDate, tcgdexMarketProvider_1.tcgdexJaMarketProvider, {
                language: 'ja',
            });
            totalPricesProcessed += jaSnapshot.pricesWritten;
            groupsProcessed += jaSnapshot.cardsProcessed;
            groupsFailed += jaSnapshot.cardsFailed;
            logger_1.logger.info('TCGdex JA snapshot complete', { runDate, ...jaSnapshot });
            const pcRaw = await snapshotJapaneseFromPriceCharting(runDate, 60);
            totalPricesProcessed += pcRaw.pricesWritten;
            logger_1.logger.info('PriceCharting JA raw snapshot complete', { runDate, ...pcRaw });
        }
        catch (jaError) {
            logger_1.logger.warn('Japanese price snapshot failed', {
                error: jaError.message,
            });
        }
        try {
            await (0, canonicalPriceService_1.materializeCanonicalPrices)({ sinceDate: runDate });
        }
        catch (canonErr) {
            logger_1.logger.warn('Canonical price materialization failed', {
                error: canonErr.message,
            });
        }
        logger_1.logger.info('Creating daily market snapshot...');
        await createDailySnapshot(runDate);
        logger_1.logger.info('Daily market snapshot created.');
        const cloudBackup = await (0, cloudBackupService_1.backupDatabaseToCloud)(runDate);
        logger_1.logger.info('Cloud backup result', cloudBackup);
        if (syncRunId) {
            await finalizeSyncRun(syncRunId, 'completed', {
                totalPricesProcessed,
                groupsProcessed,
                groupsFailed,
                message: usedFallback
                    ? `fallback_source=catalog_cards; ${cloudBackup.message}`
                    : cloudBackup.message,
            });
        }
        return {
            syncRunId,
            started: true,
            skipped: false,
            runDate,
            totalPricesProcessed,
            groupsProcessed,
            groupsFailed,
            cloudBackup,
        };
    }
    catch (error) {
        logger_1.logger.error('An error occurred during the price data update process', {
            error: error.message,
        });
        if (syncRunId) {
            await finalizeSyncRun(syncRunId, 'failed', {
                message: error.message,
            }).catch((finalizeErr) => {
                logger_1.logger.error('Failed to finalize sync run', { error: finalizeErr.message });
            });
        }
        return {
            syncRunId,
            started: true,
            skipped: false,
            runDate,
            error: error.message,
        };
    }
};
