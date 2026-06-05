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
exports.fetchSetValueHistory = exports.computeSetSummary = exports.getCardMarketPrice = exports.rowToSetCardDto = exports.fetchSetCatalogRows = exports.resolveSetMeta = exports.extractMarketPriceFromVariants = exports.parsePrices = exports.CATALOG_PRODUCT_EXCLUSIONS = void 0;
const database_1 = require("../db/database");
const setAliasResolver_1 = require("./setAliasResolver");
const PRICE_SOURCES = "('tcgcsv', 'tcgdex', 'catalog_fallback')";
exports.CATALOG_PRODUCT_EXCLUSIONS = `
  AND cc.cardName NOT LIKE '%Binder%'
  AND cc.cardName NOT LIKE '%binder%'
  AND cc.cardName NOT LIKE '%Collection Case%'
  AND cc.cardName NOT LIKE '%Booster Box%'
  AND cc.cardName NOT LIKE '%Elite Trainer%'
  AND cc.cardName NOT LIKE '%ETB%'
  AND cc.cardNumber NOT LIKE '%Binder%'
`;
const parsePrices = (value) => {
    if (!value)
        return undefined;
    try {
        return JSON.parse(value);
    }
    catch (_a) {
        return undefined;
    }
};
exports.parsePrices = parsePrices;
const extractMarketPriceFromVariants = (prices) => {
    var _a;
    if (!prices)
        return null;
    const preferredOrder = ['normal', 'holofoil', 'reverseHolofoil', '1stEditionHolofoil'];
    for (const key of preferredOrder) {
        const value = (_a = prices[key]) === null || _a === void 0 ? void 0 : _a.market;
        if (typeof value === 'number' && value > 0)
            return value;
    }
    for (const entry of Object.values(prices)) {
        if (typeof (entry === null || entry === void 0 ? void 0 : entry.market) === 'number' && entry.market > 0)
            return entry.market;
    }
    return null;
};
exports.extractMarketPriceFromVariants = extractMarketPriceFromVariants;
const dbAll = (sql, params = []) => new Promise((resolve, reject) => {
    (0, database_1.getDb)().all(sql, params, (err, rows) => {
        if (err)
            reject(err);
        else
            resolve(rows || []);
    });
});
const dbGet = (sql, params = []) => new Promise((resolve, reject) => {
    (0, database_1.getDb)().get(sql, params, (err, row) => {
        if (err)
            reject(err);
        else
            resolve(row);
    });
});
const resolveSetMeta = (setId) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { enrichSetById } = yield Promise.resolve().then(() => __importStar(require('./setListService')));
        const enriched = yield enrichSetById(setId);
        if (enriched)
            return enriched;
    }
    catch (_a) {
        // fall through to DB lookup
    }
    const row = yield dbGet(`
    SELECT setId as id, setName as name, MAX(setReleaseDate) as releaseDate, COUNT(*) as total
    FROM catalog_cards cc
    WHERE setId = ? OR setName = ?
    GROUP BY setId, setName
    LIMIT 1
    `, [setId, setId]);
    if (row) {
        const { classifySetEra, getEraLabel, resolveSetImages } = yield Promise.resolve().then(() => __importStar(require('../utils/setEra')));
        const { setCodeService } = yield Promise.resolve().then(() => __importStar(require('./setCodeService')));
        yield setCodeService.initialize();
        const apiMeta = setCodeService.resolveApiSet(row.id, row.name);
        const era = classifySetEra({ id: (apiMeta === null || apiMeta === void 0 ? void 0 : apiMeta.id) || row.id, name: row.name, series: apiMeta === null || apiMeta === void 0 ? void 0 : apiMeta.series });
        return {
            id: row.id,
            name: row.name,
            releaseDate: (apiMeta === null || apiMeta === void 0 ? void 0 : apiMeta.releaseDate) || row.releaseDate || '',
            total: row.total,
            series: apiMeta === null || apiMeta === void 0 ? void 0 : apiMeta.series,
            era,
            eraLabel: getEraLabel(era),
            images: resolveSetImages(apiMeta === null || apiMeta === void 0 ? void 0 : apiMeta.images),
        };
    }
    return null;
});
exports.resolveSetMeta = resolveSetMeta;
const variantPriority = (rarity, subTypeName, variantKey) => {
    const r = (rarity || '').toLowerCase();
    const wantsHolo = r.includes('holo') || r.includes('ultra') || r.includes('secret') || r.includes('illustration');
    const sub = subTypeName.toLowerCase();
    const variant = variantKey.toLowerCase();
    if (wantsHolo) {
        if (sub === 'holofoil' || variant === 'holofoil')
            return 0;
        if (sub === 'reverseholofoil' || variant === 'reverseholofoil')
            return 1;
        if (sub === 'normal' || variant === 'normal')
            return 2;
        return 3;
    }
    if (sub === 'normal' || variant === 'normal')
        return 0;
    if (sub === 'holofoil' || variant === 'holofoil')
        return 1;
    if (sub === 'reverseholofoil' || variant === 'reverseholofoil')
        return 2;
    return 3;
};
const buildPriceLookup = (rows) => {
    const byCardId = new Map();
    const bySetNumber = new Map();
    const bySetNameNumber = new Map();
    const byCardNameNumber = new Map();
    const byProductId = new Map();
    const consider = (map, key, candidate) => {
        const existing = map.get(key);
        if (!existing ||
            candidate.priority < existing.priority ||
            (candidate.priority === existing.priority && candidate.price > existing.price)) {
            map.set(key, candidate);
        }
    };
    for (const row of rows) {
        if (!row.marketPrice || row.marketPrice <= 0)
            continue;
        const resolved = {
            price: row.marketPrice,
            date: row.date,
            source: 'market_sync',
            priority: variantPriority(row.rarity, row.subTypeName, row.variantKey),
        };
        if (row.cardId)
            consider(byCardId, row.cardId, resolved);
        if (row.setId && row.cardNumber) {
            consider(bySetNumber, `${row.setId}::${row.cardNumber}`, resolved);
        }
        if (row.setName && row.cardNumber) {
            consider(bySetNameNumber, `${(0, setAliasResolver_1.normalizeSetKey)(row.setName)}::${row.cardNumber}`, resolved);
        }
        if (row.cardName && row.cardNumber) {
            consider(byCardNameNumber, `${(0, setAliasResolver_1.normalizeSetKey)(row.cardName)}::${row.cardNumber}`, resolved);
        }
        if (row.tcgplayerProductId) {
            consider(byProductId, row.tcgplayerProductId, resolved);
        }
    }
    return { byCardId, bySetNumber, bySetNameNumber, byCardNameNumber, byProductId };
};
const fetchMarketPricesForSet = (setId, setName) => __awaiter(void 0, void 0, void 0, function* () {
    const keys = yield (0, setAliasResolver_1.resolveSetSearchKeys)(setId, setName);
    const where = (0, setAliasResolver_1.buildSetMappingWhereClause)(keys);
    return dbAll(`
    SELECT
      cm.cardId,
      cm.cardName,
      cm.setId,
      cm.setName,
      cm.cardNumber,
      cm.tcgplayerProductId,
      ph.marketPrice,
      ph.date,
      COALESCE(ph.subTypeName, 'normal') as subTypeName,
      COALESCE(cm.variantKey, 'normal') as variantKey,
      cm.rarity
    FROM card_mappings cm
    INNER JOIN price_history ph ON cm.uniqueIdentifier = ph.uniqueIdentifier
    INNER JOIN (
      SELECT uniqueIdentifier, MAX(date) AS maxDate
      FROM price_history
      WHERE source IN ${PRICE_SOURCES}
      GROUP BY uniqueIdentifier
    ) latest ON ph.uniqueIdentifier = latest.uniqueIdentifier AND ph.date = latest.maxDate
    WHERE ${where.sql}
      AND ph.source IN ${PRICE_SOURCES}
      AND ph.marketPrice IS NOT NULL AND ph.marketPrice > 0
      AND cm.cardName NOT LIKE '%Binder%'
    `, where.params);
});
const resolvePriceForCatalogRow = (row, lookup) => {
    const fromId = lookup.byCardId.get(row.cardId);
    const fromNumber = row.setId && row.cardNumber
        ? lookup.bySetNumber.get(`${row.setId}::${row.cardNumber}`)
        : undefined;
    const fromSetNameNumber = row.setName && row.cardNumber
        ? lookup.bySetNameNumber.get(`${(0, setAliasResolver_1.normalizeSetKey)(row.setName)}::${row.cardNumber}`)
        : undefined;
    const fromCardNameNumber = row.cardName && row.cardNumber
        ? lookup.byCardNameNumber.get(`${(0, setAliasResolver_1.normalizeSetKey)(row.cardName)}::${row.cardNumber}`)
        : undefined;
    const fromProduct = row.tcgplayerProductId
        ? lookup.byProductId.get(row.tcgplayerProductId)
        : undefined;
    const market = fromId ||
        fromProduct ||
        fromSetNameNumber ||
        fromCardNameNumber ||
        fromNumber;
    if (market) {
        return {
            latestPrice: market.price,
            priceDate: market.date,
            priceSource: 'market_sync',
        };
    }
    const catalogPrice = (0, exports.extractMarketPriceFromVariants)((0, exports.parsePrices)(row.tcgplayerPrices));
    if (catalogPrice !== null && catalogPrice > 0) {
        return {
            latestPrice: catalogPrice,
            priceDate: null,
            priceSource: 'tcgplayer_catalog',
        };
    }
    return { latestPrice: null, priceDate: null, priceSource: null };
};
const fetchSetCatalogRows = (setId) => __awaiter(void 0, void 0, void 0, function* () {
    const catalogSetName = yield dbGet(`SELECT setName FROM catalog_cards WHERE setId = ? OR setName = ? LIMIT 1`, [setId, setId]);
    const marketRows = yield fetchMarketPricesForSet(setId, catalogSetName === null || catalogSetName === void 0 ? void 0 : catalogSetName.setName);
    const lookup = buildPriceLookup(marketRows);
    const catalogBase = yield dbAll(`
    SELECT
      cc.cardId,
      cc.cardName,
      cc.setId,
      cc.setName,
      cc.setReleaseDate,
      cc.cardNumber,
      cc.rarity,
      cc.imageSmall,
      cc.imageLarge,
      cc.tcgplayerPrices,
      cc.tcgplayerProductId
    FROM catalog_cards cc
    WHERE (cc.setId = ? OR cc.setName = ?)
    ${exports.CATALOG_PRODUCT_EXCLUSIONS}
    GROUP BY cc.cardId
    ORDER BY
      CASE WHEN cc.cardNumber GLOB '[0-9]*' THEN CAST(cc.cardNumber AS INTEGER) ELSE 9999 END,
      cc.cardNumber,
      cc.cardName
    `, [setId, setId]);
    if (catalogBase.length > 0) {
        return catalogBase.map((row) => (Object.assign(Object.assign({}, row), resolvePriceForCatalogRow(row, lookup))));
    }
    return [];
});
exports.fetchSetCatalogRows = fetchSetCatalogRows;
const rowToSetCardDto = (row, setMeta) => {
    var _a;
    const fromSync = typeof row.latestPrice === 'number' && row.latestPrice > 0 ? row.latestPrice : null;
    const fromCatalog = (0, exports.extractMarketPriceFromVariants)((0, exports.parsePrices)(row.tcgplayerPrices));
    const marketPrice = fromSync !== null && fromSync !== void 0 ? fromSync : (fromCatalog !== null && fromCatalog > 0 ? fromCatalog : 0);
    const priceSource = (_a = row.priceSource) !== null && _a !== void 0 ? _a : (fromSync !== null ? 'market_sync' : fromCatalog !== null && fromCatalog > 0 ? 'tcgplayer_catalog' : null);
    return {
        id: row.cardId,
        name: row.cardName,
        number: row.cardNumber || '',
        rarity: row.rarity || undefined,
        marketPrice,
        hasPriceData: marketPrice > 0,
        priceSource,
        priceDate: row.priceDate,
        images: {
            small: row.imageSmall || row.imageLarge || '',
            large: row.imageLarge || row.imageSmall || '',
        },
        set: {
            id: setMeta.id,
            name: setMeta.name,
            releaseDate: setMeta.releaseDate,
            total: setMeta.total,
        },
    };
};
exports.rowToSetCardDto = rowToSetCardDto;
const getCardMarketPrice = (card) => card.marketPrice;
exports.getCardMarketPrice = getCardMarketPrice;
const computeSetSummary = (cards, ownedIds, wishlistIds) => {
    var _a;
    const setMeta = (_a = cards[0]) === null || _a === void 0 ? void 0 : _a.set;
    let masterSetValue = 0;
    let ownedValue = 0;
    let missingValue = 0;
    let pricedCardCount = 0;
    let ownedCount = 0;
    let marketSyncCount = 0;
    let catalogPriceCount = 0;
    for (const card of cards) {
        const price = (0, exports.getCardMarketPrice)(card);
        if (price > 0) {
            pricedCardCount++;
            if (card.priceSource === 'market_sync')
                marketSyncCount++;
            else if (card.priceSource === 'tcgplayer_catalog')
                catalogPriceCount++;
        }
        masterSetValue += price;
        if (ownedIds.has(card.id)) {
            ownedCount++;
            ownedValue += price;
        }
        else {
            missingValue += price;
        }
    }
    const totalCards = cards.length;
    const completionPct = totalCards > 0 ? (ownedCount / totalCards) * 100 : 0;
    const priceCoveragePct = totalCards > 0 ? (pricedCardCount / totalCards) * 100 : 0;
    return {
        setId: (setMeta === null || setMeta === void 0 ? void 0 : setMeta.id) || '',
        setName: (setMeta === null || setMeta === void 0 ? void 0 : setMeta.name) || '',
        releaseDate: (setMeta === null || setMeta === void 0 ? void 0 : setMeta.releaseDate) || '',
        totalCards,
        ownedCount,
        wishlistCount: wishlistIds.size,
        completionPct,
        masterSetValue,
        ownedValue,
        missingValue,
        costToComplete: missingValue,
        pricedCardCount,
        priceCoveragePct,
        marketSyncCount,
        catalogPriceCount,
    };
};
exports.computeSetSummary = computeSetSummary;
const rangeToCutoff = (range) => {
    const now = new Date();
    const days = range === '30d' ? 30 : range === '90d' ? 90 : range === '1y' ? 365 : null;
    if (days === null)
        return null;
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - days);
    return d.toISOString().slice(0, 10);
};
const buildCatalogMatchIndex = (catalogCards) => {
    const byId = new Map();
    const bySetNameNumber = new Map();
    const byCardNameNumber = new Map();
    const byProductId = new Map();
    for (const card of catalogCards) {
        byId.set(card.cardId, card);
        if (card.setName && card.cardNumber) {
            bySetNameNumber.set(`${(0, setAliasResolver_1.normalizeSetKey)(card.setName)}::${card.cardNumber}`, card.cardId);
        }
        if (card.cardName && card.cardNumber) {
            byCardNameNumber.set(`${(0, setAliasResolver_1.normalizeSetKey)(card.cardName)}::${card.cardNumber}`, card.cardId);
        }
        if (card.tcgplayerProductId) {
            byProductId.set(card.tcgplayerProductId, card.cardId);
        }
    }
    return { byId, bySetNameNumber, byCardNameNumber, byProductId };
};
const resolveHistoryRowToCatalogId = (row, index) => {
    if (index.byId.has(row.cardId))
        return row.cardId;
    if (row.tcgplayerProductId && index.byProductId.has(row.tcgplayerProductId)) {
        return index.byProductId.get(row.tcgplayerProductId);
    }
    if (row.setName && row.cardNumber) {
        const hit = index.bySetNameNumber.get(`${(0, setAliasResolver_1.normalizeSetKey)(row.setName)}::${row.cardNumber}`);
        if (hit)
            return hit;
    }
    if (row.cardName && row.cardNumber) {
        const hit = index.byCardNameNumber.get(`${(0, setAliasResolver_1.normalizeSetKey)(row.cardName)}::${row.cardNumber}`);
        if (hit)
            return hit;
    }
    return null;
};
const pickBetterPriceForDate = (existing, price, priority) => {
    if (!existing || priority < existing.priority)
        return { price, priority };
    if (priority === existing.priority && price > existing.price)
        return { price, priority };
    return existing;
};
const fetchSetValueHistory = (setId_1, ...args_1) => __awaiter(void 0, [setId_1, ...args_1], void 0, function* (setId, range = '90d') {
    var _a, _b;
    const catalogCards = yield dbAll(`
    SELECT cardId, cardName, setName, cardNumber, rarity, tcgplayerProductId
    FROM catalog_cards cc
    WHERE (cc.setId = ? OR cc.setName = ?)
    ${exports.CATALOG_PRODUCT_EXCLUSIONS}
    GROUP BY cc.cardId
    `, [setId, setId]);
    if (catalogCards.length === 0)
        return [];
    const catalogIndex = buildCatalogMatchIndex(catalogCards);
    const catalogSetName = (_a = catalogCards[0]) === null || _a === void 0 ? void 0 : _a.setName;
    const keys = yield (0, setAliasResolver_1.resolveSetSearchKeys)(setId, catalogSetName);
    const where = (0, setAliasResolver_1.buildSetMappingWhereClause)(keys);
    const cutoff = rangeToCutoff(range);
    const historyRows = yield dbAll(`
    SELECT
      cm.cardId,
      cm.cardName,
      cm.setName,
      cm.cardNumber,
      cm.tcgplayerProductId,
      cm.rarity,
      ph.date,
      ph.marketPrice,
      COALESCE(ph.subTypeName, 'normal') as subTypeName,
      COALESCE(cm.variantKey, 'normal') as variantKey
    FROM card_mappings cm
    INNER JOIN price_history ph ON cm.uniqueIdentifier = ph.uniqueIdentifier
    WHERE ${where.sql}
      AND ph.source IN ${PRICE_SOURCES}
      AND ph.marketPrice IS NOT NULL AND ph.marketPrice > 0
      AND cm.cardName NOT LIKE '%Binder%'
      ${cutoff ? 'AND ph.date >= ?' : ''}
    ORDER BY ph.date ASC
    `, cutoff ? [...where.params, cutoff] : where.params);
    // One best price per catalog card per date (same card list as master set value)
    const byCatalogCard = new Map();
    const rarityByCatalogId = new Map(catalogCards.map((c) => [c.cardId, c.rarity]));
    for (const row of historyRows) {
        const catalogId = resolveHistoryRowToCatalogId(row, catalogIndex);
        if (!catalogId)
            continue;
        const priority = variantPriority((_b = rarityByCatalogId.get(catalogId)) !== null && _b !== void 0 ? _b : row.rarity, row.subTypeName, row.variantKey);
        if (!byCatalogCard.has(catalogId))
            byCatalogCard.set(catalogId, new Map());
        const dateMap = byCatalogCard.get(catalogId);
        const existing = dateMap.get(row.date);
        dateMap.set(row.date, pickBetterPriceForDate(existing, row.marketPrice, priority));
    }
    if (byCatalogCard.size === 0)
        return [];
    const allDates = new Set();
    for (const dateMap of byCatalogCard.values()) {
        for (const date of dateMap.keys())
            allDates.add(date);
    }
    const sortedDates = [...allDates].sort();
    const lastPrice = new Map();
    const result = [];
    for (const date of sortedDates) {
        for (const [catalogId, dateMap] of byCatalogCard) {
            const point = dateMap.get(date);
            if (point)
                lastPrice.set(catalogId, point.price);
        }
        let setValue = 0;
        let cardsPriced = 0;
        for (const price of lastPrice.values()) {
            setValue += price;
            cardsPriced++;
        }
        result.push({ date, setValue, cardsPriced });
    }
    return result;
});
exports.fetchSetValueHistory = fetchSetValueHistory;
