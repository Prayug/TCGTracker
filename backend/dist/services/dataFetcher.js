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
exports.updatePriceData = void 0;
const database_1 = require("../db/database");
const cardIdentifier_1 = require("./cardIdentifier");
const cloudBackupService_1 = require("./cloudBackupService");
const logger_1 = require("../utils/logger");
const catalogSync_1 = require("./catalogSync");
const tcgdexMarketProvider_1 = require("./providers/tcgdexMarketProvider");
const SYNC_TIMEZONE = 'America/New_York';
let isUpdateRunning = false;
const normalizeVariantKey = (value) => {
    if (!value)
        return 'normal';
    const normalized = value.toLowerCase().replace(/[^a-z0-9]/g, '');
    return normalized || 'normal';
};
const getRunDate = () => {
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: SYNC_TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    });
    return formatter.format(new Date());
};
const createSyncRun = (runType, runDate) => __awaiter(void 0, void 0, void 0, function* () {
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
});
const finalizeSyncRun = (runId, status, payload) => __awaiter(void 0, void 0, void 0, function* () {
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
});
const loadCatalogCards = () => __awaiter(void 0, void 0, void 0, function* () {
    const db = (0, database_1.getDb)();
    const fetchRows = () => new Promise((resolve, reject) => {
        db.all(`SELECT cardId, cardName, setId, setName, cardNumber, tcgplayerProductId, tcgplayerPrices
         FROM catalog_cards`, [], (err, rows) => {
            if (err)
                reject(err);
            else
                resolve(rows || []);
        });
    });
    const rows = yield fetchRows();
    if (rows.length > 0) {
        return rows;
    }
    logger_1.logger.info('Catalog empty for market snapshot, syncing catalog first...');
    yield (0, catalogSync_1.syncCatalogData)();
    return fetchRows();
});
const extractCatalogFallbackPoints = (row) => {
    if (!row.tcgplayerPrices) {
        return [];
    }
    try {
        const parsed = JSON.parse(row.tcgplayerPrices);
        return Object.entries(parsed)
            .map(([rawVariant, price]) => {
            var _a, _b, _c;
            const marketPrice = (_c = (_b = (_a = price.market) !== null && _a !== void 0 ? _a : price.mid) !== null && _b !== void 0 ? _b : price.low) !== null && _c !== void 0 ? _c : 0;
            if (!marketPrice || marketPrice <= 0) {
                return null;
            }
            const variantKey = normalizeVariantKey(rawVariant);
            const parsedProductId = row.tcgplayerProductId
                ? Number.parseInt(String(row.tcgplayerProductId), 10)
                : Number.NaN;
            const productId = Number.isFinite(parsedProductId)
                ? parsedProductId
                : deterministicProductId(row.cardId, variantKey);
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
const createDailySnapshot = (date) => __awaiter(void 0, void 0, void 0, function* () {
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
            // Get top gainers and losers
            const gainersSql = `
        SELECT 
          ph1.productName,
          ph1.price as currentPrice,
          ph2.price as previousPrice,
          ((ph1.price - ph2.price) / ph2.price * 100) as changePercent
        FROM price_history ph1
        JOIN price_history ph2 ON ph1.productId = ph2.productId
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
                    if (err) {
                        reject(err);
                        return;
                    }
                    // Insert snapshot
                    const insertSnapshotSql = `
            INSERT OR REPLACE INTO price_snapshots 
            (date, totalCards, avgPrice, totalVolume, topGainers, topLosers)
            VALUES (?, ?, ?, ?, ?, ?)
          `;
                    db.run(insertSnapshotSql, [
                        date,
                        (stats === null || stats === void 0 ? void 0 : stats.totalCards) || 0,
                        (stats === null || stats === void 0 ? void 0 : stats.avgPrice) || 0,
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
const deterministicProductId = (cardId, variantKey) => {
    const input = `${cardId}|${variantKey}`;
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
        hash = ((hash << 5) - hash + input.charCodeAt(i)) | 0;
    }
    return Math.abs(hash) + 1;
};
const snapshotFromPokemonCatalog = (date) => __awaiter(void 0, void 0, void 0, function* () {
    const db = (0, database_1.getDb)();
    const priceInsertSql = `
    INSERT INTO price_history (
      productId, date, price, subTypeName, productName, groupName,
      source, lowPrice, highPrice, marketPrice, volume, uniqueIdentifier
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(productId, date, source, subTypeName) DO UPDATE SET
      price = excluded.price,
      lowPrice = excluded.lowPrice,
      highPrice = excluded.highPrice,
      marketPrice = excluded.marketPrice,
      productName = excluded.productName,
      groupName = excluded.groupName,
      uniqueIdentifier = excluded.uniqueIdentifier;
  `;
    const rows = yield new Promise((resolve, reject) => {
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
        yield (0, catalogSync_1.syncCatalogData)();
    }
    const refreshedRows = rows.length > 0
        ? rows
        : yield new Promise((resolve, reject) => {
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
    yield new Promise((resolve, reject) => {
        db.serialize(() => {
            var _a, _b, _c, _d, _e, _f;
            db.run('BEGIN TRANSACTION');
            try {
                for (const row of refreshedRows) {
                    const parsedPrices = JSON.parse(row.tcgplayerPrices || '{}');
                    for (const [variantKey, variantValue] of Object.entries(parsedPrices)) {
                        const priceData = variantValue;
                        const market = (_c = (_b = (_a = priceData.market) !== null && _a !== void 0 ? _a : priceData.mid) !== null && _b !== void 0 ? _b : priceData.low) !== null && _c !== void 0 ? _c : 0;
                        if (!market || market <= 0) {
                            continue;
                        }
                        const uniqueIdentifier = (0, cardIdentifier_1.generateUniqueIdentifier)(row.setId, row.cardNumber, row.cardName, variantKey);
                        const parsedProductId = row.tcgplayerProductId
                            ? Number.parseInt(String(row.tcgplayerProductId), 10)
                            : Number.NaN;
                        const productId = Number.isFinite(parsedProductId)
                            ? parsedProductId
                            : deterministicProductId(row.cardId || `${row.setId}-${row.cardNumber}-${row.cardName}`, variantKey);
                        stmt.run([
                            productId,
                            date,
                            market,
                            variantKey,
                            row.cardName,
                            row.setName,
                            'catalog_fallback',
                            (_d = priceData.low) !== null && _d !== void 0 ? _d : null,
                            (_e = priceData.high) !== null && _e !== void 0 ? _e : null,
                            (_f = priceData.market) !== null && _f !== void 0 ? _f : market,
                            null,
                            uniqueIdentifier,
                        ]);
                        inserted += 1;
                    }
                }
                stmt.finalize();
                db.run('COMMIT', (commitErr) => {
                    if (commitErr) {
                        reject(commitErr);
                        return;
                    }
                    resolve();
                });
            }
            catch (err) {
                stmt.finalize();
                db.run('ROLLBACK', () => reject(err));
            }
        });
    });
    return inserted;
});
const snapshotFromMarketProvider = (date, marketProvider) => __awaiter(void 0, void 0, void 0, function* () {
    const db = (0, database_1.getDb)();
    const rows = yield loadCatalogCards();
    if (rows.length === 0) {
        return { pricesWritten: 0, cardsProcessed: 0, cardsFailed: 0 };
    }
    const priceInsertSql = `
    INSERT INTO price_history (
      productId, date, price, subTypeName, productName, groupName,
      source, lowPrice, highPrice, marketPrice, volume, uniqueIdentifier
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(productId, date, source, subTypeName) DO UPDATE SET
      price = excluded.price,
      lowPrice = excluded.lowPrice,
      highPrice = excluded.highPrice,
      marketPrice = excluded.marketPrice,
      productName = excluded.productName,
      groupName = excluded.groupName,
      uniqueIdentifier = excluded.uniqueIdentifier;
  `;
    const mappingInsertSql = `
    INSERT OR REPLACE INTO card_mappings 
    (cardId, productId, cardName, setId, setName, cardNumber, rarity, variantKey, tcgplayerProductId, uniqueIdentifier, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `;
    const priceStmt = db.prepare(priceInsertSql);
    const mappingStmt = db.prepare(mappingInsertSql);
    const concurrency = 6;
    let index = 0;
    const collected = [];
    let cardsProcessed = 0;
    let cardsFailed = 0;
    let tcgdexAttempted = 0;
    let tcgdexSuccessful = 0;
    let tcgdexDisabledForRun = false;
    yield Promise.all(Array.from({ length: concurrency }).map(() => __awaiter(void 0, void 0, void 0, function* () {
        var _a;
        while (true) {
            const nextIndex = index;
            index += 1;
            if (nextIndex >= rows.length) {
                return;
            }
            const row = rows[nextIndex];
            const snapshot = tcgdexDisabledForRun
                ? null
                : yield marketProvider.getSnapshotForCard(row.cardId);
            const tcgdexPoints = (_a = snapshot === null || snapshot === void 0 ? void 0 : snapshot.points) !== null && _a !== void 0 ? _a : [];
            if (!tcgdexDisabledForRun) {
                tcgdexAttempted += 1;
                if (tcgdexPoints.length > 0) {
                    tcgdexSuccessful += 1;
                }
                if (tcgdexAttempted >= 200 && tcgdexSuccessful === 0) {
                    tcgdexDisabledForRun = true;
                    logger_1.logger.warn('TCGdex appears unavailable for this run; switching to catalog fallback only', {
                        attempted: tcgdexAttempted,
                    });
                }
            }
            const fallbackPoints = tcgdexPoints.length > 0 ? [] : extractCatalogFallbackPoints(row);
            const chosenPoints = tcgdexPoints.length > 0 ? tcgdexPoints : fallbackPoints;
            if (chosenPoints.length === 0) {
                cardsFailed += 1;
                continue;
            }
            for (const point of chosenPoints) {
                const rawVariantName = 'rawVariantName' in point
                    ? point.rawVariantName
                    : 'subTypeName' in point
                        ? point.subTypeName
                        : point.variantKey;
                const variantKey = normalizeVariantKey(rawVariantName || point.variantKey);
                const candidateProductId = Number(point.productId);
                const productId = Number.isFinite(candidateProductId) && candidateProductId > 0
                    ? candidateProductId
                    : deterministicProductId(row.cardId, variantKey);
                collected.push({
                    row,
                    variantKey,
                    subTypeName: rawVariantName || variantKey,
                    productId,
                    marketPrice: point.marketPrice,
                    lowPrice: point.lowPrice,
                    highPrice: point.highPrice,
                    source: tcgdexPoints.length > 0 ? 'tcgdex' : 'catalog_fallback',
                });
            }
            cardsProcessed += 1;
        }
    })));
    yield new Promise((resolve, reject) => {
        db.serialize(() => {
            var _a, _b;
            db.run('BEGIN TRANSACTION');
            try {
                for (const entry of collected) {
                    const uniqueIdentifier = (0, cardIdentifier_1.generateUniqueIdentifier)(entry.row.setId, entry.row.cardNumber, entry.row.cardName, entry.variantKey);
                    priceStmt.run([
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
                        null,
                        uniqueIdentifier,
                    ]);
                    mappingStmt.run([
                        entry.row.cardId,
                        entry.productId,
                        entry.row.cardName,
                        entry.row.setId,
                        entry.row.setName,
                        entry.row.cardNumber || null,
                        null,
                        entry.variantKey,
                        entry.row.tcgplayerProductId || null,
                        uniqueIdentifier,
                    ]);
                }
                priceStmt.finalize();
                mappingStmt.finalize();
                db.run('COMMIT', (commitErr) => {
                    if (commitErr) {
                        reject(commitErr);
                        return;
                    }
                    resolve();
                });
            }
            catch (err) {
                priceStmt.finalize();
                mappingStmt.finalize();
                db.run('ROLLBACK', () => reject(err));
            }
        });
    });
    return {
        pricesWritten: collected.length,
        cardsProcessed,
        cardsFailed,
    };
});
const updatePriceData = () => __awaiter(void 0, void 0, void 0, function* () {
    if (isUpdateRunning) {
        return {
            started: false,
            skipped: true,
            reason: 'Update already running',
        };
    }
    isUpdateRunning = true;
    const runDate = getRunDate();
    let syncRunId = null;
    try {
        logger_1.logger.info('Starting market price data update...', { runDate, timezone: SYNC_TIMEZONE });
        syncRunId = yield createSyncRun('price_update', runDate);
        let totalPricesProcessed = 0;
        let groupsProcessed = 0;
        let groupsFailed = 0;
        let usedFallback = false;
        try {
            const marketSnapshot = yield snapshotFromMarketProvider(runDate, tcgdexMarketProvider_1.tcgdexMarketProvider);
            totalPricesProcessed = marketSnapshot.pricesWritten;
            groupsProcessed = marketSnapshot.cardsProcessed;
            groupsFailed = marketSnapshot.cardsFailed;
            logger_1.logger.info('TCGdex snapshot complete', Object.assign({ runDate }, marketSnapshot));
        }
        catch (marketError) {
            logger_1.logger.warn('TCGdex snapshot failed, using catalog fallback', {
                error: marketError.message,
            });
            const fallbackRows = yield snapshotFromPokemonCatalog(runDate);
            totalPricesProcessed = fallbackRows;
            groupsProcessed = fallbackRows > 0 ? 1 : 0;
            groupsFailed = 0;
            usedFallback = true;
        }
        logger_1.logger.info('Creating daily market snapshot...');
        yield createDailySnapshot(runDate);
        logger_1.logger.info('Daily market snapshot created.');
        const cloudBackup = yield (0, cloudBackupService_1.backupDatabaseToCloud)(runDate);
        logger_1.logger.info('Cloud backup result', cloudBackup);
        if (syncRunId) {
            yield finalizeSyncRun(syncRunId, 'completed', {
                totalPricesProcessed,
                groupsProcessed,
                groupsFailed,
                message: usedFallback
                    ? `fallback_source=catalog_cards; ${cloudBackup.message}`
                    : cloudBackup.message,
            });
        }
        return {
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
            yield finalizeSyncRun(syncRunId, 'failed', {
                message: error.message,
            }).catch((finalizeErr) => {
                logger_1.logger.error('Failed to finalize sync run', { error: finalizeErr.message });
            });
        }
        return {
            started: true,
            skipped: false,
            runDate,
            error: error.message,
        };
    }
    finally {
        isUpdateRunning = false;
    }
});
exports.updatePriceData = updatePriceData;
