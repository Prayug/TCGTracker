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
const express_1 = require("express");
const database_1 = require("../db/database");
const logger_1 = require("../utils/logger");
const pokemonApiClient_1 = require("../services/pokemonApiClient");
const cardIdentifier_1 = require("../services/cardIdentifier");
const setCodeService_1 = require("../services/setCodeService");
const cardCache_1 = require("../services/cardCache");
const cardImageUtils_1 = require("../services/cardImageUtils");
const cardDatabase_1 = require("../services/cardDatabase");
const populationService_1 = require("../services/populationService");
const cardImageBackfillService_1 = require("../services/cardImageBackfillService");
const cardEnrichment_1 = require("../services/cardEnrichment");
const gradedPriceService_1 = require("../services/gradedPriceService");
const router = (0, express_1.Router)();
const resolveListingPrice_1 = require("../utils/resolveListingPrice");
const parsePrices = (value) => {
    if (!value) {
        return undefined;
    }
    try {
        return JSON.parse(value);
    }
    catch (_a) {
        return undefined;
    }
};
const extractMarketPriceFromVariants = (prices) => {
    const best = (0, resolveListingPrice_1.extractBestListingPrice)(prices);
    return {
        price: best.price > 0 ? best.price : null,
        variantKey: best.variantKey,
    };
};
/** Prefer the strongest daily snapshot when a card has multiple variant history rows. */
const resolveSnapshotPrice = (row) => {
    const resolved = (0, resolveListingPrice_1.resolveHistoryPointPrice)({
        marketPrice: row.latestPrice,
        lowPrice: row.latestLowPrice,
        highPrice: row.latestHighPrice,
    });
    return resolved > 0 ? resolved : null;
};
const mapCatalogRowsToPokemonCards = (rows) => {
    const seen = new Map();
    for (const row of rows) {
        if (!row.cardId)
            continue;
        const parsedPrices = parsePrices(row.tcgplayerPrices);
        const fromListing = extractMarketPriceFromVariants(parsedPrices);
        const snapshotPrice = resolveSnapshotPrice(row);
        // Backend daily snapshot is the source of truth. Listing quotes are fallback only.
        const derivedMarketPrice = snapshotPrice !== null && snapshotPrice !== void 0 ? snapshotPrice : fromListing.price;
        const productId = row.tcgplayerProductId || undefined;
        const next = {
            id: row.cardId,
            name: row.cardName,
            number: row.cardNumber || '',
            rarity: row.rarity || undefined,
            artist: row.artist || undefined,
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
            tcgplayer: parsedPrices || productId
                ? {
                    productId,
                    prices: parsedPrices,
                }
                : undefined,
            marketPrice: typeof derivedMarketPrice === 'number' ? derivedMarketPrice : 0,
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
/**
 * Read persisted card images from card_mappings (populated by the image backfill pipeline).
 */
router.get('/resolve-image', async (req, res) => {
    try {
        const { cardId, cardName, setId } = req.query;
        if (cardId && typeof cardId === 'string') {
            const stored = await (0, cardImageBackfillService_1.getCardMappingImages)(cardId);
            if ((stored === null || stored === void 0 ? void 0 : stored.imageSmall) || (stored === null || stored === void 0 ? void 0 : stored.imageLarge)) {
                return res.json({
                    images: {
                        small: stored.imageSmall || stored.imageLarge || '',
                        large: stored.imageLarge || stored.imageSmall || '',
                    },
                    cardNumber: stored.cardNumber,
                    source: 'card_mappings',
                });
            }
        }
        if (!cardName || typeof cardName !== 'string' || !setId || typeof setId !== 'string') {
            return res.status(400).json({
                error: 'Provide cardId, or both cardName and setId',
            });
        }
        const db = (0, database_1.getDb)();
        const row = await new Promise((resolve, reject) => {
            db.get(`SELECT imageSmall, imageLarge, cardNumber FROM card_mappings
         WHERE cardName = ? AND setId = ?
           AND (imageSmall IS NOT NULL OR imageLarge IS NOT NULL)
         LIMIT 1`, [cardName.trim(), setId.trim()], (err, result) => {
                if (err)
                    reject(err);
                else
                    resolve(result);
            });
        });
        if (!row) {
            return res.status(404).json({
                error: 'No persisted image found for this card',
                searched: { cardId, cardName, setId },
            });
        }
        res.json({
            images: {
                small: row.imageSmall || row.imageLarge || '',
                large: row.imageLarge || row.imageSmall || '',
            },
            cardNumber: row.cardNumber,
            source: 'card_mappings',
        });
    }
    catch (error) {
        logger_1.logger.error('Error reading card image:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: error.message,
        });
    }
});
/**
 * Search cards from local database
 * Much faster and more reliable than Pokemon TCG API
 */
router.get('/search', async (req, res) => {
    try {
        const { query, setId, limit = '100' } = req.query;
        if (!query || typeof query !== 'string') {
            return res.status(400).json({
                error: 'Query parameter is required'
            });
        }
        const db = (0, database_1.getDb)();
        const searchLimit = Math.min(parseInt(limit) || 100, 250);
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
        ph.latestPrice as latestPrice,
        ph.latestLowPrice as latestLowPrice,
        ph.latestHighPrice as latestHighPrice
      FROM catalog_cards cc
      LEFT JOIN (
        SELECT
          cm.cardId,
          -- Repair junk market vs low/high in SQL before picking the best variant snap.
          MAX(
            CASE
              WHEN ph.lowPrice IS NOT NULL AND ph.lowPrice > 0 AND ph.marketPrice < ph.lowPrice * 0.5
                THEN CASE
                  WHEN ph.highPrice IS NOT NULL AND ph.highPrice > 0 AND ph.highPrice <= ph.lowPrice * 5
                    THEN (ph.lowPrice + ph.highPrice) / 2.0
                  ELSE ph.lowPrice
                END
              ELSE ph.marketPrice
            END
          ) as latestPrice,
          NULL as latestLowPrice,
          NULL as latestHighPrice
        FROM price_history ph
        JOIN card_mappings cm ON cm.uniqueIdentifier = ph.uniqueIdentifier
        WHERE ph.source IN ('tcgcsv', 'tcgdex', 'catalog_fallback')
          AND ph.marketPrice IS NOT NULL
          AND ph.marketPrice > 0
          AND (cm.cardId, ph.date) IN (
            SELECT cm2.cardId, MAX(ph2.date)
            FROM price_history ph2
            JOIN card_mappings cm2 ON cm2.uniqueIdentifier = ph2.uniqueIdentifier
            WHERE ph2.source IN ('tcgcsv', 'tcgdex', 'catalog_fallback')
              AND ph2.marketPrice IS NOT NULL
              AND ph2.marketPrice > 0
            GROUP BY cm2.cardId
          )
        GROUP BY cm.cardId
      ) ph ON cc.cardId = ph.cardId
      WHERE cc.cardName LIKE ?
    `;
        const params = [`%${query}%`];
        if (setId && typeof setId === 'string') {
            sql += ' AND (cc.setId = ? OR cc.setName LIKE ?)';
            params.push(setId, `%${setId}%`);
        }
        sql += ` ORDER BY cc.cardName ASC LIMIT ?`;
        params.push(searchLimit);
        db.all(sql, params, async (err, rows) => {
            if (err) {
                logger_1.logger.error('Error searching cards:', err);
                return res.status(500).json({
                    error: 'Database error',
                    message: err.message
                });
            }
            let cards = mapCatalogRowsToPokemonCards(rows);
            if (cards.length === 0) {
                const imageColumns = await (0, cardImageUtils_1.getImageColumnSelectFragment)();
                const fallbackSql = `
          SELECT DISTINCT
            cm.cardId,
            cm.cardName,
            cm.setId,
            cm.setName,
            cm.cardNumber,
            cm.rarity,
            cm.tcgplayerProductId,
            cm.uniqueIdentifier,
            ${imageColumns}
            ph.marketPrice as latestPrice,
            ph.lowPrice as latestLowPrice,
            ph.highPrice as latestHighPrice,
            ph.date as priceDate
          FROM card_mappings cm
          LEFT JOIN (
            SELECT uniqueIdentifier, marketPrice, lowPrice, highPrice, date
            FROM price_history
            WHERE (uniqueIdentifier, date) IN (
              SELECT uniqueIdentifier, MAX(date)
              FROM price_history
              WHERE source IN ('tcgcsv', 'tcgdex', 'catalog_fallback')
              GROUP BY uniqueIdentifier
            )
          ) ph ON cm.uniqueIdentifier = ph.uniqueIdentifier
          WHERE cm.cardName LIKE ?
          ${setId && typeof setId === 'string' ? 'AND (cm.setId = ? OR cm.setName LIKE ?)' : ''}
          ORDER BY cm.cardName ASC
          LIMIT ?
        `;
                const fallbackParams = [`%${query}%`];
                if (setId && typeof setId === 'string') {
                    fallbackParams.push(setId, `%${setId}%`);
                }
                fallbackParams.push(searchLimit);
                const fallbackRows = await new Promise((resolve, reject) => {
                    db.all(fallbackSql, fallbackParams, (fallbackErr, fallbackResult) => {
                        if (fallbackErr) {
                            reject(fallbackErr);
                        }
                        else {
                            resolve(fallbackResult || []);
                        }
                    });
                });
                cards = await (0, cardDatabase_1.mapLocalRowsToPokemonCards)(fallbackRows);
            }
            logger_1.logger.info(`✅ Found ${cards.length} cards matching "${query}" from local database`);
            res.json({
                data: cards,
                count: cards.length,
                source: 'local_database'
            });
        });
    }
    catch (error) {
        logger_1.logger.error('Error in card search:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: error.message
        });
    }
});
/**
 * Get all unique sets from local database, enriched with era, series, and logos
 */
router.get('/sets', async (req, res) => {
    try {
        const { getEnrichedSets } = await Promise.resolve().then(() => __importStar(require('../services/setListService')));
        const sets = await getEnrichedSets();
        res.json({
            data: sets,
            count: sets.length,
            source: 'catalog_sync_enriched',
        });
    }
    catch (error) {
        logger_1.logger.error('Error fetching sets:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: error.message,
        });
    }
});
/**
 * Get card statistics
 */
router.get('/stats', async (req, res) => {
    try {
        const db = (0, database_1.getDb)();
        const sql = `
      SELECT 
        COUNT(DISTINCT cardName) as totalCards,
        COUNT(DISTINCT setId) as totalSets,
        COUNT(*) as totalEntries
      FROM card_mappings
    `;
        db.get(sql, [], (err, row) => {
            if (err) {
                logger_1.logger.error('Error fetching stats:', err);
                return res.status(500).json({
                    error: 'Database error',
                    message: err.message
                });
            }
            res.json({
                totalCards: row.totalCards || 0,
                totalSets: row.totalSets || 0,
                totalEntries: row.totalEntries || 0,
                source: 'local_database'
            });
        });
    }
    catch (error) {
        logger_1.logger.error('Error fetching stats:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: error.message
        });
    }
});
router.get('/population', async (req, res) => {
    try {
        const { cardId, cardName, setId, setName, cardNumber, variant } = req.query;
        if (!cardName || typeof cardName !== 'string') {
            return res.status(400).json({
                error: 'cardName query parameter is required',
            });
        }
        const result = await (0, populationService_1.getPopulationCounts)({
            cardId: typeof cardId === 'string' ? cardId.trim() : undefined,
            cardName: cardName.trim(),
            setId: typeof setId === 'string' ? setId.trim() : undefined,
            setName: typeof setName === 'string' ? setName.trim() : undefined,
            cardNumber: typeof cardNumber === 'string' ? cardNumber.trim() : undefined,
            variant: typeof variant === 'string' ? variant.trim() : undefined,
        });
        return res.json(result);
    }
    catch (error) {
        return res.status(500).json({
            error: 'Failed to fetch population counts',
            message: error.message,
        });
    }
});
/**
 * Get a random pool of cards with latest market prices from local DB
 */
router.get('/pool', async (req, res) => {
    try {
        const db = (0, database_1.getDb)();
        const { limit = '250', minPrice = '0', maxPrice = '100000' } = req.query;
        const poolLimit = Math.min(parseInt(limit) || 250, 10000); // Increased max to 10000 for better pool diversity
        const imageColumns = await (0, cardImageUtils_1.getImageColumnSelectFragment)();
        // Exclude fake "sets" that are actually TCGPlayer product categories
        // These will NEVER have images in the Pokemon API
        const EXCLUDED_FAKE_SET_NAMES = [
            'World Championship Decks',
            'Miscellaneous Cards & Products',
            'Prize Pack Series Cards',
            'Deck Exclusives',
            'League & Championship Cards',
            'Jumbo Cards',
            'Blister Exclusives',
            'McDonald%', // McDonald's promos
            'Burger King Promos',
            'Countdown Calendar Promos',
            'Professor Program Promos',
            'Best of Promos',
            'Pikachu World Collection Promos',
            'ME01: Mega Evolution',
            'ME: Mega Evolution Promo',
            'MEE: Mega Evolution Energies',
            'SVE: Scarlet & Violet Energies',
        ];
        const EXCLUDED_FAKE_SET_IDS = [
            'worldchampionshipdecks',
            'miscellaneouscardsproducts',
            'prizepackseriescards',
            'deckexclusives',
            'leaguechampionshipcards',
            'jumbocards',
            'blisterexclusives',
        ];
        // Exclude all promo sets (any set with "promo" in name or ID)
        const PROMO_EXCLUSION_CLAUSE = `cm.setName NOT LIKE '%promo%' AND cm.setName NOT LIKE '%Promo%' AND cm.setId NOT LIKE '%promo%' AND cm.setId NOT LIKE '%Promo%'`;
        // Build exclusion clauses with parameterized values (no string interpolation)
        const exclusionClauses = [];
        const exclusionParams = [];
        for (const setName of EXCLUDED_FAKE_SET_NAMES) {
            if (setName.includes('%')) {
                exclusionClauses.push('cm.setName NOT LIKE ?');
            }
            else {
                exclusionClauses.push('cm.setName != ?');
            }
            exclusionParams.push(setName);
        }
        for (const setId of EXCLUDED_FAKE_SET_IDS) {
            exclusionClauses.push('cm.setId != ?');
            exclusionParams.push(setId);
        }
        exclusionClauses.push(PROMO_EXCLUSION_CLAUSE);
        const exclusionSql = exclusionClauses.join(' AND ');
        // Select random cards with their latest market price from price_history
        // ONLY from REAL Pokemon TCG sets (excludes product categories and promo sets)
        const sql = `
      SELECT 
        cm.cardId,
        cm.cardName,
        cm.setId,
        cm.setName,
        cm.cardNumber,
        cm.rarity,
        cm.tcgplayerProductId,
        cm.uniqueIdentifier,
        ${imageColumns}
        ph.marketPrice as latestPrice,
        ph.date as priceDate
      FROM card_mappings cm
      JOIN (
        SELECT ph1.uniqueIdentifier, ph1.marketPrice, ph1.date
        FROM price_history ph1
        JOIN (
          SELECT uniqueIdentifier, MAX(date) AS maxDate
          FROM price_history
          WHERE source IN ('tcgcsv', 'tcgdex', 'catalog_fallback')
          GROUP BY uniqueIdentifier
        ) latest ON ph1.uniqueIdentifier = latest.uniqueIdentifier AND ph1.date = latest.maxDate
        WHERE ph1.marketPrice IS NOT NULL
      ) ph ON cm.uniqueIdentifier = ph.uniqueIdentifier
      WHERE ph.marketPrice >= ? AND ph.marketPrice <= ?
        AND cm.cardName IS NOT NULL AND TRIM(cm.cardName) <> ''
        AND cm.setId IS NOT NULL AND TRIM(cm.setId) <> ''
        AND cm.cardNumber IS NOT NULL AND TRIM(cm.cardNumber) <> ''
        AND ${exclusionSql}
      ORDER BY RANDOM()
      LIMIT ?
    `;
        db.all(sql, [minPrice, maxPrice, ...exclusionParams, poolLimit], async (err, rows) => {
            if (err) {
                logger_1.logger.error('Error fetching random card pool:', err);
                return res.status(500).json({
                    error: 'Database error',
                    message: err.message
                });
            }
            // Use the helper function to properly map cards with stored images
            const cards = await (0, cardDatabase_1.mapLocalRowsToPokemonCards)(rows);
            res.json({
                data: cards,
                count: cards.length,
                source: 'local_database'
            });
        });
    }
    catch (error) {
        logger_1.logger.error('Error building card pool:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: error.message
        });
    }
});
router.get('/pokemon', async (req, res) => {
    let persistentCacheEntry = null;
    let buildLocalFallbackResponse = null;
    const respondWithPersistent = (entry, stale = false) => {
        try {
            const parsedData = JSON.parse(entry.data || '[]');
            return {
                data: parsedData,
                totalCount: entry.totalCount || parsedData.length,
                pageSize: entry.pageSize || 250,
                pagesFetched: entry.pagesFetched || 1,
                cached: true,
                source: 'pokemon_cache',
                persistent: true,
                stale,
            };
        }
        catch (parseError) {
            logger_1.logger.error('Failed to parse cached pokemon data', parseError);
            return null;
        }
    };
    try {
        const { query, setId, pageSize = '250', fetchAll = 'true', maxPages = '4' } = req.query;
        if (!query || typeof query !== 'string' || query.trim().length < 2) {
            return res.status(400).json({
                error: 'Query parameter with at least 2 characters is required.',
            });
        }
        const sanitizedQuery = query.trim();
        const normalizedSetId = typeof setId === 'string' && setId.trim().length > 0 ? setId.trim() : undefined;
        const limit = Math.min(Math.max(parseInt(pageSize, 10) || 100, 1), 250);
        const shouldFetchAll = String(fetchAll).toLowerCase() !== 'false';
        const maxPagesToFetch = Math.min(Math.max(parseInt(maxPages, 10) || 4, 1), 10);
        buildLocalFallbackResponse = async () => {
            const rows = await (0, cardDatabase_1.getLocalCardsForQuery)(sanitizedQuery, normalizedSetId, limit).catch((err) => {
                logger_1.logger.error('Local fallback query failed', err);
                return [];
            });
            if (!rows || rows.length === 0) {
                return null;
            }
            const cards = await (0, cardEnrichment_1.enrichCardsWithInvestmentData)(await (0, cardDatabase_1.mapLocalRowsToPokemonCards)(rows));
            return {
                data: cards,
                totalCount: cards.length,
                pageSize: limit,
                pagesFetched: 1,
                cached: false,
                source: 'local_database',
                fallback: true,
            };
        };
        const cacheKey = [
            sanitizedQuery.toLowerCase(),
            normalizedSetId ? normalizedSetId.toLowerCase() : '',
            shouldFetchAll ? 'all' : 'page',
            limit,
            maxPagesToFetch,
        ].join('|');
        const now = Date.now();
        const inMemory = cardCache_1.pokemonApiCache.get(cacheKey);
        if (inMemory && now - inMemory.fetchedAt < cardCache_1.POKEMON_CACHE_TTL) {
            const enrichedData = await (0, cardEnrichment_1.enrichCardsWithInvestmentData)(inMemory.data);
            return res.json({
                data: enrichedData,
                totalCount: inMemory.totalCount,
                pageSize: inMemory.pageSize,
                pagesFetched: inMemory.pagesFetched,
                cached: true,
                source: 'pokemon_tcg_api',
            });
        }
        persistentCacheEntry = await (0, cardCache_1.getPersistentPokemonCache)(cacheKey).catch((err) => {
            logger_1.logger.error('Error reading persistent pokemon cache', err);
            return null;
        });
        if (persistentCacheEntry &&
            now - (persistentCacheEntry.fetchedAt || 0) < cardCache_1.POKEMON_PERSISTENT_CACHE_TTL) {
            const payload = respondWithPersistent({
                ...persistentCacheEntry,
                pageSize: persistentCacheEntry.pageSize || limit,
            });
            if (payload) {
                payload.data = await (0, cardEnrichment_1.enrichCardsWithInvestmentData)(payload.data);
                cardCache_1.pokemonApiCache.set(cacheKey, {
                    data: payload.data,
                    totalCount: payload.totalCount,
                    fetchedAt: persistentCacheEntry.fetchedAt,
                    pageSize: payload.pageSize,
                    pagesFetched: payload.pagesFetched,
                });
                return res.json(payload);
            }
        }
        const apiResult = await pokemonApiClient_1.pokemonApiClient.searchCardsBulk({
            nameQuery: sanitizedQuery,
            setId: normalizedSetId,
            pageSize: limit,
            fetchAll: shouldFetchAll,
            maxPages: maxPagesToFetch,
        });
        const uniqueCards = await (0, cardEnrichment_1.enrichCardsWithInvestmentData)(apiResult.cards);
        if (uniqueCards.length === 0) {
            logger_1.logger.warn(`⚠️ No cards from Pokemon API for query "${sanitizedQuery}", trying fallbacks...`);
            if (buildLocalFallbackResponse) {
                const localPayload = await buildLocalFallbackResponse();
                if (localPayload) {
                    logger_1.logger.info(`✅ Serving ${localPayload.data.length} cards from local database fallback`);
                    return res.json(localPayload);
                }
            }
            if (persistentCacheEntry) {
                const payload = respondWithPersistent({
                    ...persistentCacheEntry,
                    pageSize: persistentCacheEntry.pageSize || limit,
                }, true);
                if (payload) {
                    payload.data = await (0, cardEnrichment_1.enrichCardsWithInvestmentData)(payload.data);
                    logger_1.logger.info(`✅ Serving ${payload.data.length} stale cached cards as fallback`);
                    return res.json(payload);
                }
            }
            return res.status(404).json({
                error: 'No cards found',
                query: sanitizedQuery,
                source: 'none',
            });
        }
        const payload = {
            data: uniqueCards,
            totalCount: apiResult.totalCount || uniqueCards.length,
            pageSize: limit,
            pagesFetched: apiResult.pagesFetched,
            cached: false,
            source: 'pokemon_tcg_api',
        };
        cardCache_1.pokemonApiCache.set(cacheKey, {
            data: uniqueCards,
            totalCount: payload.totalCount,
            fetchedAt: Date.now(),
            pageSize: limit,
            pagesFetched: apiResult.pagesFetched,
        });
        try {
            await (0, cardCache_1.savePersistentPokemonCache)(cacheKey, {
                query: sanitizedQuery,
                setId: normalizedSetId,
                pageSize: limit,
                fetchAll: shouldFetchAll,
                maxPages: maxPagesToFetch,
                data: uniqueCards,
                totalCount: payload.totalCount,
                pagesFetched: apiResult.pagesFetched,
                fetchedAt: Date.now(),
            });
        }
        catch (cacheError) {
            logger_1.logger.warn('Failed to persist pokemon search cache', cacheError);
        }
        logger_1.logger.info(`✅ Successfully fetched ${uniqueCards.length} cards for "${sanitizedQuery}" from Pokemon API`);
        res.json(payload);
    }
    catch (error) {
        logger_1.logger.error('❌ Error proxying Pokemon API search:', error);
        if (buildLocalFallbackResponse) {
            try {
                const localPayload = await buildLocalFallbackResponse();
                if (localPayload) {
                    logger_1.logger.info(`✅ Serving ${localPayload.data.length} cards from local database (error fallback)`);
                    return res.status(200).json(localPayload);
                }
            }
            catch (fallbackErr) {
                logger_1.logger.warn('Local fallback also failed:', fallbackErr);
            }
        }
        if (persistentCacheEntry) {
            const payload = respondWithPersistent(persistentCacheEntry, true);
            if (payload) {
                payload.data = await (0, cardEnrichment_1.enrichCardsWithInvestmentData)(payload.data);
                logger_1.logger.info(`✅ Serving ${payload.data.length} stale cached cards (error fallback)`);
                return res.status(200).json(payload);
            }
        }
        res.status(502).json({
            error: 'Failed to fetch results from Pokemon TCG API',
            message: error.message,
        });
    }
});
/**
 * Search Pokemon API for card images (proxy endpoint to avoid CORS)
 */
router.get('/search-pokemon', async (req, res) => {
    var _a, _b, _c, _d, _e, _f;
    try {
        const { cardName, setId, cardNumber, setName } = req.query;
        if (!cardName || typeof cardName !== 'string') {
            return res.status(400).json({
                error: 'cardName query parameter is required',
            });
        }
        const cacheKey = (0, cardCache_1.getCacheKey)(cardName, typeof setId === 'string' && setId.trim().length > 0
            ? setId
            : setName || 'unknown', cardNumber);
        const cached = cardCache_1.cardImageCache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < cardCache_1.CACHE_TTL) {
            logger_1.logger.info(`💾 Cache hit for ${cardName} from ${setId || setName || 'unknown set'}`);
            return res.json({
                card: cached.card,
                images: cached.images,
                id: cached.id,
                matchedSet: cached.matchedSet,
                matchedNumber: cached.matchedNumber,
                cached: true,
            });
        }
        const searchResult = await pokemonApiClient_1.pokemonApiClient.findBestImageMatch({
            cardName,
            setId: typeof setId === 'string' ? setId.trim() : undefined,
            setName: typeof setName === 'string' ? setName.trim() : undefined,
            cardNumber: typeof cardNumber === 'string' ? cardNumber.trim() : undefined,
        });
        if (!searchResult.card || !((_a = searchResult.card.images) === null || _a === void 0 ? void 0 : _a.small) || !((_b = searchResult.card.images) === null || _b === void 0 ? void 0 : _b.large)) {
            return res.status(404).json({
                error: `Card not found or missing images`,
                searched: { cardName, setId, setName, cardNumber },
                attempts: searchResult.attempts,
                availableCards: searchResult.candidates.slice(0, 5).map((card) => {
                    var _a;
                    return ({
                        name: card.name,
                        set: (_a = card.set) === null || _a === void 0 ? void 0 : _a.id,
                        number: card.number,
                    });
                }),
            });
        }
        const responsePayload = {
            card: searchResult.card,
            images: {
                small: searchResult.card.images.small,
                large: searchResult.card.images.large,
            },
            id: searchResult.card.id,
            matchedSet: (_c = searchResult.card.set) === null || _c === void 0 ? void 0 : _c.name,
            matchedNumber: searchResult.card.number,
            rarity: searchResult.card.rarity,
            cached: false,
            attempts: searchResult.attempts,
            usedFallback: searchResult.usedFallback,
        };
        cardCache_1.cardImageCache.set(cacheKey, {
            ...responsePayload,
            timestamp: Date.now(),
        });
        logger_1.logger.info(`✅ Matched card: ${searchResult.card.name} from ${(_d = searchResult.card.set) === null || _d === void 0 ? void 0 : _d.name} (#${searchResult.card.number})`);
        // Update rarity in database if available
        if (((_e = searchResult.card) === null || _e === void 0 ? void 0 : _e.rarity) && searchResult.card.rarity.trim()) {
            const card = searchResult.card; // Store reference to avoid null checks in callback
            // We need to find the uniqueIdentifier for this card
            // Since we don't have it directly, we'll construct it based on setId, cardNumber, and cardName
            const db = (0, database_1.getDb)();
            const setIdNormalized = ((_f = card.set) === null || _f === void 0 ? void 0 : _f.id) || '';
            const cardNumber = card.number || '';
            const resolvedCardName = card.name || '';
            const uniqueIdentifier = (0, cardIdentifier_1.generateUniqueIdentifier)(setIdNormalized, cardNumber, resolvedCardName);
            db.run('UPDATE card_mappings SET rarity = ? WHERE uniqueIdentifier = ?', [card.rarity, uniqueIdentifier], (err) => {
                if (err) {
                    logger_1.logger.warn(`Failed to update rarity for ${resolvedCardName}:`, err);
                }
                else {
                    logger_1.logger.info(`Updated rarity for ${resolvedCardName}: ${card.rarity}`);
                }
            });
        }
        res.json(responsePayload);
    }
    catch (error) {
        logger_1.logger.error('Error searching Pokemon API:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: error.message,
        });
    }
});
/**
 * Refresh Pokemon TCG set mappings from API
 * This endpoint manually triggers a refresh of the set mappings cache
 */
router.post('/refresh-set-mappings', async (req, res) => {
    try {
        logger_1.logger.info('🔄 Manual refresh of Pokemon TCG set mappings requested');
        const mappings = await setCodeService_1.setCodeService.refreshSetMappings();
        res.json({
            success: true,
            message: `Refreshed ${mappings.size} set mappings`,
            mappingsCount: mappings.size,
            source: 'pokemon_tcg_api'
        });
    }
    catch (error) {
        logger_1.logger.error('❌ Failed to refresh set mappings:', error);
        res.status(500).json({
            error: 'Failed to refresh set mappings',
            message: error.message
        });
    }
});
/**
 * Get set mapping statistics
 */
router.get('/set-mappings/stats', async (req, res) => {
    try {
        const stats = await setCodeService_1.setCodeService.getSetMappingStats();
        res.json({
            totalMappingsInDb: stats.databaseMappings,
            cachedMappings: stats.cachedMappings,
            lastRefreshed: stats.lastRefreshed ? new Date(stats.lastRefreshed).toISOString() : null,
            cacheAge: stats.lastRefreshed ? Date.now() - stats.lastRefreshed : null,
            cacheTtl: stats.cacheTtl
        });
    }
    catch (error) {
        logger_1.logger.error('Error fetching set mapping stats:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: error.message
        });
    }
});
router.get('/graded-prices', async (req, res) => {
    try {
        const { cardId, cardName, setId, setName, cardNumber } = req.query;
        if (!cardId || !cardName) {
            return res.status(400).json({ error: 'cardId and cardName are required' });
        }
        const result = await (0, gradedPriceService_1.getGradedPrices)(String(cardId), String(cardName), setId ? String(setId) : undefined, setName ? String(setName) : undefined, cardNumber ? String(cardNumber) : undefined);
        res.json({ data: result });
    }
    catch (error) {
        logger_1.logger.error('Graded prices lookup failed', { error: error.message });
        res.status(500).json({ error: 'Failed to fetch graded prices' });
    }
});
exports.default = router;
