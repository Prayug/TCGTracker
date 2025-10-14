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
exports.getOnePiecePriceHistory = getOnePiecePriceHistory;
const database_1 = require("../db/database");
const dbAsync_1 = require("../utils/dbAsync");
const onePieceCatalogId_1 = require("./onePieceCatalogId");
const onePieceOptcgClient_1 = require("./providers/onePieceOptcgClient");
const onePiecePriceResolver_1 = require("./onePiecePriceResolver");
const getRunDateEst = () => new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
}).format(new Date());
function parseCatalogId(catalogId) {
    if (!(0, onePieceCatalogId_1.isOnePieceCatalogId)(catalogId))
        return null;
    const [setId, cardImageId, ...nameParts] = catalogId.split('::');
    if (!setId || !cardImageId || nameParts.length === 0)
        return null;
    const cardSetId = cardImageId.replace(/_[pr]\d+$/i, '');
    return {
        setId,
        cardImageId,
        cardName: nameParts.join('::'),
        cardSetId,
    };
}
function loadCardContext(catalogId) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c;
        const parsed = parseCatalogId(catalogId);
        if (parsed) {
            const db = (0, database_1.getDb)();
            const row = yield (0, dbAsync_1.allDbRows)(db, `SELECT setId, cardSetId, cardName, cardImageId, marketPrice, inventoryPrice
       FROM onepiece_catalog WHERE catalogId = ?`, [catalogId]);
            if (row[0]) {
                return {
                    setId: row[0].setId,
                    cardSetId: row[0].cardSetId,
                    cardName: row[0].cardName,
                    cardImageId: row[0].cardImageId,
                    optcgMarketPrice: row[0].marketPrice,
                    optcgInventoryPrice: row[0].inventoryPrice,
                    dateScraped: null,
                };
            }
            const allCards = yield (0, onePieceOptcgClient_1.getAllOptcgCards)();
            const live = allCards.find((card) => (0, onePieceCatalogId_1.buildOnePieceCatalogId)(card) === catalogId);
            if (live) {
                return {
                    setId: live.set_id,
                    cardSetId: live.card_set_id,
                    cardName: live.card_name,
                    cardImageId: live.card_image_id,
                    optcgMarketPrice: (_a = live.market_price) !== null && _a !== void 0 ? _a : null,
                    optcgInventoryPrice: (_b = live.inventory_price) !== null && _b !== void 0 ? _b : null,
                    dateScraped: (_c = live.date_scraped) !== null && _c !== void 0 ? _c : null,
                };
            }
            return {
                setId: parsed.setId,
                cardSetId: parsed.cardSetId,
                cardName: parsed.cardName,
                cardImageId: parsed.cardImageId,
                optcgMarketPrice: null,
                optcgInventoryPrice: null,
                dateScraped: null,
            };
        }
        return null;
    });
}
function rowPrice(row) {
    var _a, _b;
    return (_b = (_a = row.marketPrice) !== null && _a !== void 0 ? _a : row.inventoryPrice) !== null && _b !== void 0 ? _b : 0;
}
function isCompatibleWithResolvedPrice(price, resolved) {
    if (!resolved.marketPrice || resolved.marketPrice <= 0 || price <= 0)
        return true;
    const ratio = resolved.marketPrice / price;
    return ratio <= 1.5 && ratio >= 0.67;
}
function mergeHistoryRows(rows, resolved) {
    const byDate = new Map();
    for (const row of rows) {
        const price = rowPrice(row);
        if (price <= 0)
            continue;
        const source = row.source === 'tcgplayer' ? 'tcgplayer' : 'optcg';
        const existing = byDate.get(row.date);
        if (source === 'tcgplayer') {
            byDate.set(row.date, { date: row.date, price, source: 'tcgplayer' });
            continue;
        }
        if ((existing === null || existing === void 0 ? void 0 : existing.source) === 'tcgplayer')
            continue;
        if (resolved.priceSource === 'tcgplayer' && !isCompatibleWithResolvedPrice(price, resolved)) {
            continue;
        }
        byDate.set(row.date, { date: row.date, price, source: 'optcg' });
    }
    return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}
function recordResolvedPrice(catalogId, resolved) {
    return __awaiter(this, void 0, void 0, function* () {
        if (resolved.priceSource !== 'tcgplayer' || resolved.marketPrice == null)
            return;
        const db = (0, database_1.getDb)();
        const runDate = getRunDateEst();
        yield (0, dbAsync_1.runDb)(db, `INSERT INTO onepiece_price_history (catalogId, date, marketPrice, inventoryPrice, source)
     VALUES (?, ?, ?, ?, 'tcgplayer')
     ON CONFLICT(catalogId, date, source) DO UPDATE SET
       marketPrice = excluded.marketPrice,
       inventoryPrice = excluded.inventoryPrice`, [catalogId, runDate, resolved.marketPrice, resolved.inventoryPrice]);
    });
}
function getOnePiecePriceHistory(catalogId, days) {
    return __awaiter(this, void 0, void 0, function* () {
        const context = yield loadCardContext(catalogId);
        if (!context)
            return null;
        const resolved = yield (0, onePiecePriceResolver_1.resolveOnePiecePrice)({
            setId: context.setId,
            cardSetId: context.cardSetId,
            cardName: context.cardName,
            cardImageId: context.cardImageId,
            optcgMarketPrice: context.optcgMarketPrice,
            optcgInventoryPrice: context.optcgInventoryPrice,
            dateScraped: context.dateScraped,
        });
        yield recordResolvedPrice(catalogId, resolved);
        const db = (0, database_1.getDb)();
        let sql = `
    SELECT date, marketPrice, inventoryPrice, source
    FROM onepiece_price_history
    WHERE catalogId = ?
  `;
        const params = [catalogId];
        if (days && days > 0) {
            sql += ' AND date >= date("now", ?)';
            params.push(`-${days} days`);
        }
        sql += ' ORDER BY date ASC';
        const rows = yield (0, dbAsync_1.allDbRows)(db, sql, params);
        let priceHistory = mergeHistoryRows(rows, resolved);
        if (resolved.marketPrice != null && resolved.marketPrice > 0) {
            const runDate = getRunDateEst();
            const latest = priceHistory[priceHistory.length - 1];
            if (!latest || latest.date !== runDate || latest.price !== resolved.marketPrice) {
                priceHistory = [
                    ...priceHistory.filter((point) => point.date !== runDate),
                    {
                        date: runDate,
                        price: resolved.marketPrice,
                        source: resolved.priceSource,
                    },
                ];
            }
        }
        return {
            catalogId,
            priceHistory,
            priceSource: resolved.priceSource,
            currentPrice: resolved.marketPrice,
        };
    });
}
