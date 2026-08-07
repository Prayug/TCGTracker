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
exports.fetchSetValueHistory = exports.trimUnreliableSetValueHistory = exports.computeSetSummary = exports.getCardMarketPrice = exports.rowToSetCardDto = exports.fetchSetCatalogRows = exports.resolveSetMeta = exports.extractReversePriceFromVariants = exports.isReverseFinish = exports.extractMarketPriceFromVariants = exports.parsePrices = exports.CATALOG_PRODUCT_EXCLUSIONS = void 0;
const database_1 = require("../db/database");
const setAliasResolver_1 = require("./setAliasResolver");
const resolveListingPrice_1 = require("../utils/resolveListingPrice");
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
    const best = (0, resolveListingPrice_1.extractBestListingPrice)(prices);
    return best.price > 0 ? best.price : null;
};
exports.extractMarketPriceFromVariants = extractMarketPriceFromVariants;
/** True for reverse / reverse-holo finishes (TCGPlayer + mapping key variants). */
const isReverseFinish = (subTypeName, variantKey) => {
    const combined = `${subTypeName} ${variantKey}`.toLowerCase().replace(/[\s_\-]/g, '');
    return combined.includes('reverseholo');
};
exports.isReverseFinish = isReverseFinish;
const extractReversePriceFromVariants = (prices) => {
    if (!prices)
        return null;
    for (const [key, fields] of Object.entries(prices)) {
        if (!(0, exports.isReverseFinish)(key, key))
            continue;
        const price = (0, resolveListingPrice_1.resolveListingPrice)(fields);
        if (price > 0)
            return price;
    }
    return null;
};
exports.extractReversePriceFromVariants = extractReversePriceFromVariants;
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
const resolveSetMeta = async (setId) => {
    const slugify = (value) => value
        .toLowerCase()
        .replace(/&/g, ' and ')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    try {
        const { enrichSetById } = await Promise.resolve().then(() => __importStar(require('./setListService')));
        const enriched = await enrichSetById(setId);
        if (enriched)
            return enriched;
    }
    catch (_a) {
        // fall through to DB lookup
    }
    let row = await dbGet(`
    SELECT setId as id, setName as name, MAX(setReleaseDate) as releaseDate, COUNT(*) as total
    FROM catalog_cards cc
    WHERE setId = ? OR setName = ?
    GROUP BY setId, setName
    ORDER BY total DESC
    LIMIT 1
    `, [setId, setId]);
    // Vault imports / Collectr slugs often use "black-bolt" instead of catalog setId.
    if (!row) {
        const needle = slugify(setId);
        const spaced = needle.replace(/-/g, ' ');
        row = await dbGet(`
      SELECT setId as id, setName as name, MAX(setReleaseDate) as releaseDate, COUNT(*) as total
      FROM catalog_cards
      WHERE lower(setName) = lower(?)
         OR lower(replace(replace(replace(setName, '&', ' and '), ' ', '-'), '--', '-')) = ?
         OR lower(setName) = lower(?)
      GROUP BY setId, setName
      ORDER BY total DESC
      LIMIT 1
      `, [spaced, needle, setId]);
    }
    if (row) {
        const { classifySetEra, getEraLabel, resolveSetImages } = await Promise.resolve().then(() => __importStar(require('../utils/setEra')));
        const { setCodeService } = await Promise.resolve().then(() => __importStar(require('./setCodeService')));
        await setCodeService.initialize();
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
            images: resolveSetImages(apiMeta === null || apiMeta === void 0 ? void 0 : apiMeta.images, (apiMeta === null || apiMeta === void 0 ? void 0 : apiMeta.id) || row.id),
        };
    }
    return null;
};
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
const considerResolvedPrice = (map, key, candidate) => {
    const existing = map.get(key);
    if (!existing ||
        candidate.priority < existing.priority ||
        (candidate.priority === existing.priority && candidate.price > existing.price)) {
        map.set(key, candidate);
    }
};
const indexResolvedPrice = (maps, row, resolved) => {
    if (row.cardId)
        considerResolvedPrice(maps.byCardId, row.cardId, resolved);
    if (row.setId && row.cardNumber) {
        considerResolvedPrice(maps.bySetNumber, `${row.setId}::${row.cardNumber}`, resolved);
    }
    if (row.setName && row.cardNumber) {
        considerResolvedPrice(maps.bySetNameNumber, `${(0, setAliasResolver_1.normalizeSetKey)(row.setName)}::${row.cardNumber}`, resolved);
    }
    if (row.cardName && row.cardNumber) {
        considerResolvedPrice(maps.byCardNameNumber, `${(0, setAliasResolver_1.normalizeSetKey)(row.cardName)}::${row.cardNumber}`, resolved);
    }
    if (row.tcgplayerProductId) {
        considerResolvedPrice(maps.byProductId, row.tcgplayerProductId, resolved);
    }
};
const emptyPriceMaps = () => ({
    byCardId: new Map(),
    bySetNumber: new Map(),
    bySetNameNumber: new Map(),
    byCardNameNumber: new Map(),
    byProductId: new Map(),
});
const buildPriceLookup = (rows) => {
    const maps = emptyPriceMaps();
    for (const row of rows) {
        if (!row.marketPrice || row.marketPrice <= 0)
            continue;
        const resolved = {
            price: row.marketPrice,
            date: row.date,
            source: 'market_sync',
            priority: variantPriority(row.rarity, row.subTypeName, row.variantKey),
            isReverse: (0, exports.isReverseFinish)(row.subTypeName, row.variantKey),
        };
        indexResolvedPrice(maps, row, resolved);
    }
    return maps;
};
/** One reverse-holo quote per card identity — used as the extra master-set slot. */
const buildReversePriceLookup = (rows) => {
    const maps = emptyPriceMaps();
    for (const row of rows) {
        if (!row.marketPrice || row.marketPrice <= 0)
            continue;
        if (!(0, exports.isReverseFinish)(row.subTypeName, row.variantKey))
            continue;
        // Among reverse listings only, prefer the higher market quote.
        const resolved = {
            price: row.marketPrice,
            date: row.date,
            source: 'market_sync',
            priority: 0,
            isReverse: true,
        };
        indexResolvedPrice(maps, row, resolved);
    }
    return maps;
};
const pickFromPriceMaps = (row, lookup) => {
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
    return fromId || fromProduct || fromSetNameNumber || fromCardNameNumber || fromNumber;
};
const fetchMarketPricesForSet = async (setId, setName) => {
    const keys = await (0, setAliasResolver_1.resolveSetSearchKeys)(setId, setName);
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
};
const resolvePriceForCatalogRow = (row, lookup, reverseLookup) => {
    const market = pickFromPriceMaps(row, lookup);
    let latestPrice = null;
    let priceDate = null;
    let priceSource = null;
    let primaryIsReverse = false;
    if (market) {
        latestPrice = market.price;
        priceDate = market.date;
        priceSource = 'market_sync';
        primaryIsReverse = market.isReverse;
    }
    else {
        const catalogBest = (0, resolveListingPrice_1.extractBestListingPrice)((0, exports.parsePrices)(row.tcgplayerPrices));
        if (catalogBest.price > 0) {
            latestPrice = catalogBest.price;
            priceDate = null;
            priceSource = 'tcgplayer_catalog';
            primaryIsReverse = !!catalogBest.variantKey && (0, exports.isReverseFinish)(catalogBest.variantKey, catalogBest.variantKey);
        }
    }
    // Master-set reverse slot: only when primary finish is not already the reverse.
    let reversePrice = null;
    let reversePriceDate = null;
    let reversePriceSource = null;
    if (!primaryIsReverse) {
        const reverse = pickFromPriceMaps(row, reverseLookup);
        if (reverse) {
            reversePrice = reverse.price;
            reversePriceDate = reverse.date;
            reversePriceSource = 'market_sync';
        }
        else {
            const fromCatalog = (0, exports.extractReversePriceFromVariants)((0, exports.parsePrices)(row.tcgplayerPrices));
            if (fromCatalog !== null && fromCatalog > 0) {
                reversePrice = fromCatalog;
                reversePriceDate = null;
                reversePriceSource = 'tcgplayer_catalog';
            }
        }
    }
    return {
        latestPrice,
        priceDate,
        priceSource,
        reversePrice,
        reversePriceDate,
        reversePriceSource,
    };
};
const fetchSetCatalogRows = async (setId) => {
    const catalogSetName = await dbGet(`SELECT setName FROM catalog_cards WHERE setId = ? OR setName = ? LIMIT 1`, [setId, setId]);
    const marketRows = await fetchMarketPricesForSet(setId, catalogSetName === null || catalogSetName === void 0 ? void 0 : catalogSetName.setName);
    const lookup = buildPriceLookup(marketRows);
    const reverseLookup = buildReversePriceLookup(marketRows);
    const catalogBase = await dbAll(`
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
        return catalogBase.map((row) => ({
            ...row,
            ...resolvePriceForCatalogRow(row, lookup, reverseLookup),
        }));
    }
    return [];
};
exports.fetchSetCatalogRows = fetchSetCatalogRows;
const rowToSetCardDto = (row, setMeta) => {
    var _a;
    const fromSync = typeof row.latestPrice === 'number' && row.latestPrice > 0 ? row.latestPrice : null;
    const fromCatalog = (0, exports.extractMarketPriceFromVariants)((0, exports.parsePrices)(row.tcgplayerPrices));
    const marketPrice = fromSync !== null && fromSync !== void 0 ? fromSync : (fromCatalog !== null && fromCatalog > 0 ? fromCatalog : 0);
    const priceSource = (_a = row.priceSource) !== null && _a !== void 0 ? _a : (fromSync !== null ? 'market_sync' : fromCatalog !== null && fromCatalog > 0 ? 'tcgplayer_catalog' : null);
    const reverseMarketPrice = typeof row.reversePrice === 'number' && row.reversePrice > 0 ? row.reversePrice : 0;
    return {
        id: row.cardId,
        name: row.cardName,
        number: row.cardNumber || '',
        rarity: row.rarity || undefined,
        marketPrice,
        reverseMarketPrice,
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
const computeSetSummary = (cards, ownedIds, wishlistIds, options = {}) => {
    var _a, _b;
    const setMeta = (_a = cards[0]) === null || _a === void 0 ? void 0 : _a.set;
    const ownedReverseIds = (_b = options.ownedReverseIds) !== null && _b !== void 0 ? _b : new Set();
    // Master-set cost only when the caller opts in (ownedReverseIds and/or flag).
    const includeReverseInCost = options.includeReverseInCost === true || options.ownedReverseIds !== undefined;
    let checklistValue = 0;
    let reverseHoloValue = 0;
    let reverseHoloCount = 0;
    let ownedValue = 0;
    let missingValue = 0;
    let missingReverseValue = 0;
    let pricedCardCount = 0;
    let ownedCount = 0;
    let ownedReverseCount = 0;
    let marketSyncCount = 0;
    let catalogPriceCount = 0;
    for (const card of cards) {
        const price = (0, exports.getCardMarketPrice)(card);
        const reverse = card.reverseMarketPrice > 0 ? card.reverseMarketPrice : 0;
        if (price > 0) {
            pricedCardCount++;
            if (card.priceSource === 'market_sync')
                marketSyncCount++;
            else if (card.priceSource === 'tcgplayer_catalog')
                catalogPriceCount++;
        }
        checklistValue += price;
        if (reverse > 0) {
            reverseHoloValue += reverse;
            reverseHoloCount++;
        }
        if (ownedIds.has(card.id)) {
            ownedCount++;
            ownedValue += price;
        }
        else {
            missingValue += price;
        }
        if (reverse > 0) {
            if (ownedReverseIds.has(card.id)) {
                ownedReverseCount++;
                ownedValue += reverse;
            }
            else if (includeReverseInCost) {
                missingReverseValue += reverse;
            }
        }
    }
    const totalCards = cards.length;
    const completionPct = totalCards > 0 ? (ownedCount / totalCards) * 100 : 0;
    const priceCoveragePct = totalCards > 0 ? (pricedCardCount / totalCards) * 100 : 0;
    const costToComplete = missingValue + (includeReverseInCost ? missingReverseValue : 0);
    return {
        setId: (setMeta === null || setMeta === void 0 ? void 0 : setMeta.id) || '',
        setName: (setMeta === null || setMeta === void 0 ? void 0 : setMeta.name) || '',
        releaseDate: (setMeta === null || setMeta === void 0 ? void 0 : setMeta.releaseDate) || '',
        totalCards,
        ownedCount,
        wishlistCount: wishlistIds.size,
        completionPct,
        checklistValue,
        reverseHoloValue,
        reverseHoloCount,
        masterSetValue: checklistValue + reverseHoloValue,
        ownedValue,
        missingValue,
        missingReverseValue,
        ownedReverseCount,
        costToComplete,
        pricedCardCount,
        priceCoveragePct,
        marketSyncCount,
        catalogPriceCount,
    };
};
exports.computeSetSummary = computeSetSummary;
/** Minimum catalog coverage and value share before a daily total is chart-worthy. */
const SET_VALUE_HISTORY_MIN_COVERAGE = 0.5;
const SET_VALUE_HISTORY_MIN_VALUE_RATIO = 0.25;
const RANGE_DAYS = {
    '1d': 1,
    '7d': 7,
    '30d': 30,
    '90d': 90,
};
/** Safety cap for "all" — unbounded price_history scans can stall the whole API. */
const ALL_RANGE_MAX_DAYS = 365 * 5;
/**
 * Drop leading days where only a handful of cards had prices (pre-sync noise).
 * Requires both enough cards priced and a total value near the series peak.
 */
const trimUnreliableSetValueHistory = (history, totalCatalogCards) => {
    if (history.length <= 1)
        return history;
    const peakPriced = totalCatalogCards && totalCatalogCards > 0
        ? totalCatalogCards
        : Math.max(...history.map((p) => p.cardsPriced));
    const peakValue = Math.max(...history.map((p) => p.setValue));
    if (peakPriced <= 0 || peakValue <= 0)
        return history;
    const minCards = Math.ceil(peakPriced * SET_VALUE_HISTORY_MIN_COVERAGE);
    const minValue = peakValue * SET_VALUE_HISTORY_MIN_VALUE_RATIO;
    const startIdx = history.findIndex((p) => p.cardsPriced >= minCards && p.setValue >= minValue);
    if (startIdx <= 0)
        return startIdx === -1 ? [] : history;
    return history.slice(startIdx);
};
exports.trimUnreliableSetValueHistory = trimUnreliableSetValueHistory;
const rangeToCutoff = (range) => {
    const days = range === 'all' ? ALL_RANGE_MAX_DAYS : RANGE_DAYS[range];
    const d = new Date();
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
const pickBetterPriceForDate = (existing, price, priority, isReverse) => {
    if (!existing || priority < existing.priority)
        return { price, priority, isReverse };
    if (priority === existing.priority && price > existing.price) {
        return { price, priority, isReverse };
    }
    return existing;
};
const pickBetterReverseForDate = (existing, price) => {
    if (existing === undefined || price > existing)
        return price;
    return existing;
};
const fetchSetValueHistory = async (setId, range = '30d') => {
    var _a, _b;
    const catalogCards = await dbAll(`
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
    const keys = await (0, setAliasResolver_1.resolveSetSearchKeys)(setId, catalogSetName);
    const where = (0, setAliasResolver_1.buildSetMappingWhereClause)(keys);
    const cutoff = rangeToCutoff(range);
    const historyRows = await dbAll(`
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
      AND ph.date >= ?
    ORDER BY ph.date ASC
    `, [...where.params, cutoff]);
    // Primary finish + optional reverse slot per catalog card per date (matches master set value)
    const byCatalogCard = new Map();
    const reverseByCatalogCard = new Map();
    const rarityByCatalogId = new Map(catalogCards.map((c) => [c.cardId, c.rarity]));
    for (const row of historyRows) {
        const catalogId = resolveHistoryRowToCatalogId(row, catalogIndex);
        if (!catalogId)
            continue;
        const isReverse = (0, exports.isReverseFinish)(row.subTypeName, row.variantKey);
        const priority = variantPriority((_b = rarityByCatalogId.get(catalogId)) !== null && _b !== void 0 ? _b : row.rarity, row.subTypeName, row.variantKey);
        if (!byCatalogCard.has(catalogId))
            byCatalogCard.set(catalogId, new Map());
        const dateMap = byCatalogCard.get(catalogId);
        const existing = dateMap.get(row.date);
        dateMap.set(row.date, pickBetterPriceForDate(existing, row.marketPrice, priority, isReverse));
        if (isReverse) {
            if (!reverseByCatalogCard.has(catalogId))
                reverseByCatalogCard.set(catalogId, new Map());
            const reverseDateMap = reverseByCatalogCard.get(catalogId);
            reverseDateMap.set(row.date, pickBetterReverseForDate(reverseDateMap.get(row.date), row.marketPrice));
        }
    }
    if (byCatalogCard.size === 0)
        return [];
    const allDates = new Set();
    for (const dateMap of byCatalogCard.values()) {
        for (const date of dateMap.keys())
            allDates.add(date);
    }
    for (const dateMap of reverseByCatalogCard.values()) {
        for (const date of dateMap.keys())
            allDates.add(date);
    }
    const sortedDates = [...allDates].sort();
    const lastPrimary = new Map();
    const lastReverse = new Map();
    const result = [];
    for (const date of sortedDates) {
        for (const [catalogId, dateMap] of byCatalogCard) {
            const point = dateMap.get(date);
            if (point)
                lastPrimary.set(catalogId, { price: point.price, isReverse: point.isReverse });
        }
        for (const [catalogId, dateMap] of reverseByCatalogCard) {
            const reversePrice = dateMap.get(date);
            if (reversePrice !== undefined)
                lastReverse.set(catalogId, reversePrice);
        }
        let setValue = 0;
        let cardsPriced = 0;
        const catalogIds = new Set([...lastPrimary.keys(), ...lastReverse.keys()]);
        for (const catalogId of catalogIds) {
            const primary = lastPrimary.get(catalogId);
            if (primary) {
                setValue += primary.price;
                cardsPriced++;
            }
            const reverse = lastReverse.get(catalogId);
            // Extra reverse slot only when primary isn't already the reverse finish
            if (reverse !== undefined && reverse > 0 && !(primary === null || primary === void 0 ? void 0 : primary.isReverse)) {
                setValue += reverse;
            }
        }
        result.push({ date, setValue, cardsPriced });
    }
    return (0, exports.trimUnreliableSetValueHistory)(result, catalogCards.length);
};
exports.fetchSetValueHistory = fetchSetValueHistory;
