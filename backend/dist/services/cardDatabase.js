"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mapLocalRowsToPokemonCards = exports.getLocalCardsForQuery = exports.mapCatalogRowsToPokemonCards = exports.getCatalogCardsForQuery = exports.looksLikeNonSingleCard = exports.extractCardNumberFromName = void 0;
// Database query utilities for cards
const database_1 = require("../db/database");
const cardImageUtils_1 = require("./cardImageUtils");
const resolveListingPrice_1 = require("../utils/resolveListingPrice");
/** Sealed / non-single SKUs that pollute name search when Pokemon API is down. */
const NON_SINGLE_CARD_PATTERN = /\b(elite trainer box|etb|tin|blister|collection|booster|code card|premium collection|special collection|deck|box set|bundle|case)\b/i;
/**
 * Pull a printable card number out of TCGCSV-style names like
 * "Jolteon (H12)", "Jolteon (4)", "Jolteon - 169 (Cosmos Holo)".
 */
const extractCardNumberFromName = (cardName) => {
    if (!cardName)
        return null;
    const dashMatch = cardName.match(/\s-\s(\d{1,4}[a-zA-Z]?)\b/);
    if (dashMatch === null || dashMatch === void 0 ? void 0 : dashMatch[1])
        return dashMatch[1];
    const parenMatch = cardName.match(/\(([A-Za-z]?\d{1,4}[A-Za-z]?|[A-Z]{1,3}\d{1,4})\)\s*$/);
    if ((parenMatch === null || parenMatch === void 0 ? void 0 : parenMatch[1]) && !/^(delta species|team plasma|master ball pattern|poke ball pattern|cosmos holo)$/i.test(parenMatch[1])) {
        return parenMatch[1];
    }
    return null;
};
exports.extractCardNumberFromName = extractCardNumberFromName;
const looksLikeNonSingleCard = (cardName) => {
    if (!cardName)
        return false;
    return NON_SINGLE_CARD_PATTERN.test(cardName);
};
exports.looksLikeNonSingleCard = looksLikeNonSingleCard;
const getCatalogCardsForQuery = async (query, setId, limit = 250, language = 'en') => {
    const db = (0, database_1.getDb)();
    const trimmed = query.trim();
    const lang = (language || 'en').toLowerCase();
    const langClause = lang === 'all' ? '' : `AND COALESCE(cc.language, 'en') = '${lang === 'ja' ? 'ja' : 'en'}'`;
    // Fast path: exact catalog id lookups (base1-4, bw6-90, …) skip the heavy price join.
    const looksLikeCardId = /^[a-z0-9][a-z0-9_-]{1,40}$/i.test(trimmed) && trimmed.includes('-');
    if (looksLikeCardId && !setId) {
        const exact = await new Promise((resolve, reject) => {
            db.all(`SELECT
           cc.cardId, cc.cardName, cc.setId, cc.setName, cc.setReleaseDate,
           cc.cardNumber, cc.rarity, cc.types, cc.artist,
           cc.imageSmall, cc.imageLarge, cc.tcgplayerProductId, cc.tcgplayerPrices,
           COALESCE(cc.language, 'en') AS language,
           COALESCE(cc.matchName, cc.cardName) AS matchName,
           NULL as latestPrice, NULL as latestLowPrice, NULL as latestHighPrice
         FROM catalog_cards cc
         WHERE cc.cardId = ?
         LIMIT 1`, [trimmed], (err, rows) => {
                if (err)
                    reject(err);
                else
                    resolve(rows || []);
            });
        });
        if (exact.length > 0)
            return exact;
        // Exact id miss (tcgcsv-197651, etc.): do NOT fall through to LIKE '%id%'
        // plus a full price_history scan — that locks SQLite and 500s /auth/me.
        return [];
    }
    const likeQuery = `%${trimmed}%`;
    // Exact cardId first so getCardById("base1-4") / "bw6-90" resolves.
    const params = [trimmed, likeQuery, likeQuery, likeQuery];
    let sql = `
    SELECT
      cc.cardId,
      cc.cardName,
      cc.setId,
      cc.setName,
      cc.setReleaseDate,
      cc.cardNumber,
      cc.rarity,
      cc.types,
      cc.artist,
      cc.imageSmall,
      cc.imageLarge,
      cc.tcgplayerProductId,
      cc.tcgplayerPrices,
      COALESCE(cc.language, 'en') AS language,
      COALESCE(cc.matchName, cc.cardName) AS matchName,
      ph.marketPrice as latestPrice,
      ph.lowPrice as latestLowPrice,
      ph.highPrice as latestHighPrice
    FROM catalog_cards cc
    LEFT JOIN card_mappings cm ON cm.cardId = cc.cardId
    LEFT JOIN price_history ph ON ph.uniqueIdentifier = cm.uniqueIdentifier
      AND ph.rowid = (
        SELECT ph2.rowid FROM price_history ph2
        WHERE ph2.uniqueIdentifier = cm.uniqueIdentifier
          AND ph2.source IN ('tcgcsv', 'tcgdex', 'catalog_fallback', 'tcgdex_ja', 'cardmarket', 'pricecharting_raw')
          AND IFNULL(ph2.marketPrice, 0) > 0
        ORDER BY ph2.date DESC
        LIMIT 1
      )
    WHERE (
      cc.cardId = ?
      OR cc.cardId LIKE ?
      OR cc.cardName LIKE ?
      OR IFNULL(cc.matchName, '') LIKE ?
    )
    ${langClause}
  `;
    if (setId) {
        sql += ' AND (cc.setId = ? OR cc.setName LIKE ?)';
        params.push(setId, `%${setId}%`);
    }
    sql += ` ORDER BY
      CASE WHEN cc.cardId = ? THEN 0 ELSE 1 END,
      cc.cardName ASC
    LIMIT ?`;
    params.push(trimmed, limit);
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err)
                return reject(err);
            resolve(rows || []);
        });
    });
};
exports.getCatalogCardsForQuery = getCatalogCardsForQuery;
const mapCatalogRowsToPokemonCards = (rows) => {
    const seen = new Map();
    for (const row of rows) {
        if (!row.cardId)
            continue;
        let catalogPrices;
        if (row.tcgplayerPrices) {
            try {
                catalogPrices = JSON.parse(row.tcgplayerPrices);
            }
            catch (_a) {
                catalogPrices = undefined;
            }
        }
        const fromListing = (0, resolveListingPrice_1.extractBestListingPrice)(catalogPrices);
        const snapshotPrice = (0, resolveListingPrice_1.resolveHistoryPointPrice)({
            marketPrice: row.latestPrice,
            lowPrice: row.latestLowPrice,
            highPrice: row.latestHighPrice,
        });
        const derivedMarketPrice = snapshotPrice > 0 ? snapshotPrice : fromListing.price > 0 ? fromListing.price : 0;
        const productId = row.tcgplayerProductId || undefined;
        const next = {
            id: row.cardId,
            name: row.cardName,
            number: row.cardNumber || '',
            rarity: row.rarity || undefined,
            artist: row.artist || undefined,
            language: row.language || 'en',
            matchName: row.matchName || row.cardName,
            images: {
                small: row.imageSmall || row.imageLarge || '',
                large: row.imageLarge || row.imageSmall || '',
            },
            set: {
                id: row.setId,
                name: row.setName,
                releaseDate: row.setReleaseDate || '2020-01-01',
                total: 0,
            },
            tcgplayer: catalogPrices || productId
                ? {
                    productId,
                    prices: catalogPrices,
                }
                : undefined,
            marketPrice: derivedMarketPrice,
            preferredVariant: fromListing.variantKey || undefined,
            source: 'catalog_sync',
        };
        const existing = seen.get(row.cardId);
        if (!existing || (next.marketPrice || 0) > (existing.marketPrice || 0)) {
            seen.set(row.cardId, next);
        }
    }
    return Array.from(seen.values());
};
exports.mapCatalogRowsToPokemonCards = mapCatalogRowsToPokemonCards;
const getLocalCardsForQuery = async (query, setId, limit = 250, language = 'en') => {
    const db = (0, database_1.getDb)();
    const trimmed = query.trim();
    const likeQuery = `%${trimmed}%`;
    const params = [trimmed, likeQuery, likeQuery, likeQuery];
    let whereClause = '(cm.cardId = ? OR cm.cardId LIKE ? OR cm.cardName LIKE ? OR IFNULL(cm.matchName, \'\') LIKE ?)';
    const lang = (language || 'en').toLowerCase();
    if (lang !== 'all') {
        whereClause += ` AND COALESCE(cm.language, 'en') = ?`;
        params.push(lang === 'ja' ? 'ja' : 'en');
    }
    if (setId) {
        whereClause += ' AND (cm.setId = ? OR cm.setName LIKE ?)';
        params.push(setId, `%${setId}%`);
    }
    const imageColumns = await (0, cardImageUtils_1.getImageColumnSelectFragment)();
    const sql = `
    SELECT 
      cm.cardId,
      cm.cardName,
      cm.setId,
      cm.setName,
      COALESCE(NULLIF(cm.cardNumber, ''), cc.cardNumber) as cardNumber,
      cm.rarity,
      cm.tcgplayerProductId,
      cm.uniqueIdentifier,
      COALESCE(cm.language, cc.language, 'en') AS language,
      COALESCE(cm.matchName, cc.matchName, cm.cardName) AS matchName,
      ${imageColumns
        ? `COALESCE(NULLIF(cm.imageSmall, ''), cc.imageSmall) as imageSmall,
             COALESCE(NULLIF(cm.imageLarge, ''), cc.imageLarge) as imageLarge,
             cm.imageSource as imageSource,
             cm.imageLastUpdated,`
        : `cc.imageSmall as imageSmall,
             cc.imageLarge as imageLarge,
             NULL as imageSource,`}
      ph.marketPrice as latestPrice,
      ph.lowPrice as latestLowPrice,
      ph.highPrice as latestHighPrice,
      ph.date as priceDate,
      cc.tcgplayerPrices as catalogPrices
    FROM card_mappings cm
    LEFT JOIN price_history ph ON ph.uniqueIdentifier = cm.uniqueIdentifier
      AND ph.rowid = (
        SELECT ph2.rowid FROM price_history ph2
        WHERE ph2.uniqueIdentifier = cm.uniqueIdentifier
        ORDER BY ph2.date DESC
        LIMIT 1
      )
    LEFT JOIN catalog_cards cc ON cc.cardId = cm.cardId
    WHERE ${whereClause}
    ORDER BY
      CASE WHEN cm.cardId = ? THEN 0 ELSE 1 END,
      cm.cardName ASC
    LIMIT ?
  `;
    params.push(trimmed, limit);
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) {
                return reject(err);
            }
            resolve(rows || []);
        });
    });
};
exports.getLocalCardsForQuery = getLocalCardsForQuery;
const mapLocalRowsToPokemonCards = async (rows) => {
    const seen = new Map();
    for (const row of rows) {
        const key = row.cardId || row.uniqueIdentifier || `${row.setId}-${row.cardNumber}`;
        const existing = seen.get(key);
        if (!existing) {
            seen.set(key, row);
            continue;
        }
        // Prefer the mapping row with the strongest resolved latest price.
        const existingPrice = (0, resolveListingPrice_1.resolveHistoryPointPrice)({
            marketPrice: existing.latestPrice,
            lowPrice: existing.latestLowPrice,
            highPrice: existing.latestHighPrice,
        });
        const nextPrice = (0, resolveListingPrice_1.resolveHistoryPointPrice)({
            marketPrice: row.latestPrice,
            lowPrice: row.latestLowPrice,
            highPrice: row.latestHighPrice,
        });
        if (nextPrice > existingPrice) {
            seen.set(key, row);
        }
    }
    const uniqueRows = Array.from(seen.values());
    const mapped = await Promise.all(uniqueRows.map(async (row) => {
        const cardNumber = (typeof row.cardNumber === 'string' && row.cardNumber.trim()) ||
            (0, exports.extractCardNumberFromName)(row.cardName) ||
            null;
        // Skip sealed / product SKUs that have no printable card identity.
        if ((0, exports.looksLikeNonSingleCard)(row.cardName) && !cardNumber && !row.imageSmall && !row.imageLarge) {
            return null;
        }
        let images;
        let imageSource = row.imageSource;
        if (row.imageSmall || row.imageLarge) {
            images = {
                small: row.imageSmall || row.imageLarge,
                large: row.imageLarge || row.imageSmall,
            };
            imageSource = imageSource || 'stored';
        }
        else if (cardNumber) {
            const deterministicImages = await (0, cardImageUtils_1.buildDeterministicImageUrls)(row.setId, cardNumber, row.setName);
            if (deterministicImages) {
                images = deterministicImages;
                imageSource = 'deterministic';
            }
        }
        // No SVG data-URI placeholders — leave images undefined so the UI shows "No image".
        const resolvedLatest = (0, resolveListingPrice_1.resolveHistoryPointPrice)({
            marketPrice: row.latestPrice,
            lowPrice: row.latestLowPrice,
            highPrice: row.latestHighPrice,
        });
        let catalogPrices;
        if (row.catalogPrices) {
            try {
                catalogPrices = JSON.parse(row.catalogPrices);
            }
            catch (_a) {
                catalogPrices = undefined;
            }
        }
        const fromCatalog = (0, resolveListingPrice_1.extractBestListingPrice)(catalogPrices);
        const marketPrice = resolvedLatest > 0 ? resolvedLatest : fromCatalog.price > 0 ? fromCatalog.price : 0;
        const psa10Price = typeof row.psa10Price === 'number' && Number.isFinite(row.psa10Price) && row.psa10Price > 0
            ? row.psa10Price
            : undefined;
        return {
            id: row.cardId || `${row.setId}-${cardNumber || 'na'}`,
            name: row.cardName,
            number: cardNumber || '',
            rarity: row.rarity,
            language: row.language || 'en',
            matchName: row.matchName || row.cardName,
            set: {
                id: row.setId,
                name: row.setName,
                releaseDate: '2020-01-01',
                total: 100,
            },
            images: images !== null && images !== void 0 ? images : { small: '', large: '' },
            imageSource,
            tcgplayer: catalogPrices
                ? {
                    productId: row.tcgplayerProductId,
                    prices: catalogPrices,
                }
                : marketPrice > 0
                    ? {
                        productId: row.tcgplayerProductId,
                        prices: {
                            [fromCatalog.variantKey || 'normal']: { market: marketPrice },
                        },
                    }
                    : undefined,
            marketPrice,
            ...(psa10Price != null ? { psa10Price } : {}),
            preferredVariant: fromCatalog.variantKey || undefined,
            uniqueIdentifier: row.uniqueIdentifier,
            isLocalDbCard: true,
            source: 'local_database',
        };
    }));
    return mapped.filter((card) => card !== null);
};
exports.mapLocalRowsToPokemonCards = mapLocalRowsToPokemonCards;
