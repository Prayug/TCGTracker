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
exports.isOnePieceCatalogIncomplete = exports.getOnePieceCatalogCount = exports.syncOnePieceData = void 0;
const database_1 = require("../db/database");
const logger_1 = require("../utils/logger");
const dbAsync_1 = require("../utils/dbAsync");
const dbJobLock_1 = require("../utils/dbJobLock");
const onePieceOptcgClient_1 = require("./providers/onePieceOptcgClient");
const onePieceMapper_1 = require("./onePieceMapper");
const getRunDateEst = () => new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
}).format(new Date());
const upsertCatalogCardSql = `
  INSERT INTO onepiece_catalog (
    catalogId,
    cardSetId,
    cardImageId,
    cardName,
    setId,
    setName,
    rarity,
    cardColor,
    cardType,
    cardCost,
    cardPower,
    counterAmount,
    life,
    subTypes,
    attribute,
    cardText,
    imageUrl,
    marketPrice,
    inventoryPrice,
    syncedAt
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  ON CONFLICT(catalogId) DO UPDATE SET
    cardSetId = excluded.cardSetId,
    cardImageId = excluded.cardImageId,
    cardName = excluded.cardName,
    setId = excluded.setId,
    setName = excluded.setName,
    rarity = excluded.rarity,
    cardColor = excluded.cardColor,
    cardType = excluded.cardType,
    cardCost = excluded.cardCost,
    cardPower = excluded.cardPower,
    counterAmount = excluded.counterAmount,
    life = excluded.life,
    subTypes = excluded.subTypes,
    attribute = excluded.attribute,
    cardText = excluded.cardText,
    imageUrl = excluded.imageUrl,
    marketPrice = excluded.marketPrice,
    inventoryPrice = excluded.inventoryPrice,
    syncedAt = datetime('now')
`;
const upsertPriceHistorySql = `
  INSERT INTO onepiece_price_history (catalogId, date, marketPrice, inventoryPrice, source)
  VALUES (?, ?, ?, ?, 'optcg')
  ON CONFLICT(catalogId, date, source) DO UPDATE SET
    marketPrice = excluded.marketPrice,
    inventoryPrice = excluded.inventoryPrice
`;
const syncOnePieceData = () => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield (0, dbJobLock_1.withDbJobLock)('onepiece_sync', () => __awaiter(void 0, void 0, void 0, function* () {
        const runDate = getRunDateEst();
        let cardsUpserted = 0;
        let pricesRecorded = 0;
        const db = (0, database_1.getDb)();
        logger_1.logger.info('One Piece sync: fetching full catalog (sets + ST + promos + Don!!)...');
        const rawCards = yield (0, onePieceOptcgClient_1.getAllOptcgCards)(true);
        logger_1.logger.info(`One Piece sync: ${rawCards.length} cards fetched from OPTCG`);
        yield new Promise((resolve, reject) => {
            db.serialize(() => {
                db.run('BEGIN TRANSACTION');
                const catalogStmt = db.prepare(upsertCatalogCardSql);
                const priceStmt = db.prepare(upsertPriceHistorySql);
                try {
                    for (const raw of rawCards) {
                        const card = (0, onePieceMapper_1.mapRawToCatalogFields)(raw);
                        catalogStmt.run([
                            card.catalogId,
                            card.cardSetId,
                            card.cardImageId,
                            card.cardName,
                            card.setId,
                            card.setName,
                            card.rarity,
                            card.cardColor,
                            card.cardType,
                            card.cardCost,
                            card.cardPower,
                            card.counterAmount,
                            card.life,
                            card.subTypes,
                            card.attribute,
                            card.cardText,
                            card.imageUrl,
                            card.marketPrice,
                            card.inventoryPrice,
                        ]);
                        cardsUpserted += 1;
                        if (card.marketPrice != null || card.inventoryPrice != null) {
                            priceStmt.run([card.catalogId, runDate, card.marketPrice, card.inventoryPrice]);
                            pricesRecorded += 1;
                        }
                    }
                    catalogStmt.finalize();
                    priceStmt.finalize();
                    db.run('COMMIT', (commitErr) => {
                        if (commitErr)
                            reject(commitErr);
                        else
                            resolve();
                    });
                }
                catch (err) {
                    catalogStmt.finalize();
                    priceStmt.finalize();
                    db.run('ROLLBACK', () => reject(err));
                }
            });
        });
        yield (0, dbAsync_1.runDb)(db, `INSERT INTO sync_runs (runType, runDate, status, totalPricesProcessed, message, completedAt)
       VALUES ('onepiece_sync', ?, 'completed', ?, ?, datetime('now'))`, [runDate, pricesRecorded, `Full catalog: ${cardsUpserted} cards`]);
        logger_1.logger.info('One Piece sync completed', { cardsUpserted, pricesRecorded, runDate });
        return { setsProcessed: 1, cardsUpserted, pricesRecorded, runDate };
    }), { skipIfBusy: true });
    if ((0, dbJobLock_1.isSkippedDbJob)(result)) {
        return { setsProcessed: 0, cardsUpserted: 0, pricesRecorded: 0, runDate: getRunDateEst() };
    }
    return result;
});
exports.syncOnePieceData = syncOnePieceData;
const getOnePieceCatalogCount = () => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    const db = (0, database_1.getDb)();
    const rows = yield (0, dbAsync_1.allDbRows)(db, 'SELECT COUNT(*) as count FROM onepiece_catalog');
    return (_b = (_a = rows[0]) === null || _a === void 0 ? void 0 : _a.count) !== null && _b !== void 0 ? _b : 0;
});
exports.getOnePieceCatalogCount = getOnePieceCatalogCount;
const EXPECTED_MIN_CARDS = 5000;
const isOnePieceCatalogIncomplete = () => __awaiter(void 0, void 0, void 0, function* () {
    const count = yield (0, exports.getOnePieceCatalogCount)();
    return count < EXPECTED_MIN_CARDS;
});
exports.isOnePieceCatalogIncomplete = isOnePieceCatalogIncomplete;
