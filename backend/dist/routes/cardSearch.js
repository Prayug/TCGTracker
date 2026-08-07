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
const gradedRefreshService_1 = require("../services/gradedRefreshService");
const packPoolDedupe_1 = require("../utils/packPoolDedupe");
const packEraBand_1 = require("../utils/packEraBand");
const router = (0, express_1.Router)();
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
    var _a;
    try {
        const { query, setId, limit = '100' } = req.query;
        if (!query || typeof query !== 'string') {
            return res.status(400).json({
                error: 'Query parameter is required'
            });
        }
        const searchLimit = Math.min(parseInt(limit) || 100, 250);
        const normalizedSetId = typeof setId === 'string' && setId.trim().length > 0 ? setId.trim() : undefined;
        let cards = (0, cardDatabase_1.mapCatalogRowsToPokemonCards)(await (0, cardDatabase_1.getCatalogCardsForQuery)(query, normalizedSetId, searchLimit));
        if (cards.length === 0) {
            cards = await (0, cardDatabase_1.mapLocalRowsToPokemonCards)(await (0, cardDatabase_1.getLocalCardsForQuery)(query, normalizedSetId, searchLimit));
        }
        logger_1.logger.info(`✅ Found ${cards.length} cards matching "${query}" from local database`);
        res.json({
            data: cards,
            count: cards.length,
            source: ((_a = cards[0]) === null || _a === void 0 ? void 0 : _a.source) === 'catalog_sync' ? 'catalog_database' : 'local_database',
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
        if (result.cardId) {
            void (0, gradedRefreshService_1.recordGradedRequest)({
                cardId: result.cardId,
                cardName: result.cardName,
                setId: result.setId,
                setName: result.setName,
                cardNumber: result.cardNumber,
            });
        }
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
 * Get a random pool of cards with latest market prices from local DB.
 * Pass includeSlabs=1 to attach verified PSA 10 prices (psa10Price) via a
 * second batched lookup — keep this off the RANDOM() query so pack opens
 * don't hang on a graded_prices join.
 */
router.get('/pool', async (req, res) => {
    try {
        const db = (0, database_1.getDb)();
        const { limit = '250', minPrice = '0', maxPrice = '100000', includeSlabs } = req.query;
        const poolLimit = Math.min(parseInt(limit) || 250, 10000); // Increased max to 10000 for better pool diversity
        const withSlabs = includeSlabs === '1' ||
            includeSlabs === 'true' ||
            includeSlabs === 'yes';
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
        // Canonicalize duplicate API/TCGCSV rows, then take equal random slices
        // from each era band (bulk + chase) so EX-era cards cannot fill the pool.
        const sql = (0, packEraBand_1.buildStratifiedPackPoolSql)(imageColumns, exclusionSql);
        const { bulk, chase } = (0, packEraBand_1.stratifiedPoolSliceSizes)(poolLimit);
        const sliceLimits = packEraBand_1.PACK_ERA_BANDS.flatMap(() => [bulk, chase]);
        db.all(sql, [minPrice, maxPrice, ...exclusionParams, ...sliceLimits], async (err, rows) => {
            if (err) {
                logger_1.logger.error('Error fetching random card pool:', err);
                return res.status(500).json({
                    error: 'Database error',
                    message: err.message
                });
            }
            try {
                // Use the helper function to properly map cards with stored images
                let cards = await (0, cardDatabase_1.mapLocalRowsToPokemonCards)(rows);
                if (withSlabs && cards.length > 0) {
                    const cardIds = [...new Set(cards.map((c) => c.id).filter(Boolean))];
                    const psa10ByCardId = new Map();
                    const BATCH = 400;
                    for (let i = 0; i < cardIds.length; i += BATCH) {
                        const batch = cardIds.slice(i, i + BATCH);
                        const placeholders = batch.map(() => '?').join(',');
                        const gradedRows = await new Promise((resolve, reject) => {
                            db.all(`SELECT cardId, price
                 FROM graded_prices
                 WHERE cardId IN (${placeholders})
                   AND grader = 'psa'
                   AND grade = '10'
                   AND verified = 1
                   AND price IS NOT NULL
                   AND price > 0`, batch, (gradedErr, result) => {
                                if (gradedErr)
                                    reject(gradedErr);
                                else
                                    resolve((result || []));
                            });
                        });
                        for (const gr of gradedRows) {
                            if (typeof gr.price === 'number' && gr.price > 0) {
                                psa10ByCardId.set(gr.cardId, gr.price);
                            }
                        }
                    }
                    cards = cards.map((card) => {
                        const psa10Price = psa10ByCardId.get(card.id);
                        return psa10Price != null ? { ...card, psa10Price } : card;
                    });
                }
                cards = (0, packPoolDedupe_1.dedupePackPoolCards)(cards).map((card) => ({
                    ...card,
                    eraBand: (0, packEraBand_1.packEraBandFromSet)(card.set),
                }));
                res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
                res.json({
                    data: cards,
                    count: cards.length,
                    source: 'local_database',
                    includeSlabs: withSlabs,
                });
            }
            catch (mapErr) {
                logger_1.logger.error('Error mapping/enriching card pool:', mapErr);
                res.status(500).json({
                    error: 'Internal server error',
                    message: mapErr.message,
                });
            }
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
            // Prefer catalog_cards (complete number + art) over raw TCGCSV mappings.
            // Mappings include sealed SKUs and rows with null cardNumber/images that
            // previously produced white SVG placeholders and "#—" in Browse.
            const catalogRows = await (0, cardDatabase_1.getCatalogCardsForQuery)(sanitizedQuery, normalizedSetId, limit).catch((err) => {
                logger_1.logger.error('Catalog fallback query failed', err);
                return [];
            });
            if (catalogRows.length > 0) {
                const cards = await (0, cardEnrichment_1.enrichCardsWithInvestmentData)((0, cardDatabase_1.mapCatalogRowsToPokemonCards)(catalogRows));
                return {
                    data: cards,
                    totalCount: cards.length,
                    pageSize: limit,
                    pagesFetched: 1,
                    cached: false,
                    source: 'catalog_database',
                    fallback: true,
                };
            }
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
        void (0, gradedRefreshService_1.recordGradedRequest)({
            cardId: String(cardId),
            cardName: String(cardName),
            setId: setId ? String(setId) : undefined,
            setName: setName ? String(setName) : undefined,
            cardNumber: cardNumber ? String(cardNumber) : undefined,
        });
        res.json({ data: result });
    }
    catch (error) {
        logger_1.logger.error('Graded prices lookup failed', { error: error.message });
        res.status(500).json({ error: 'Failed to fetch graded prices' });
    }
});
router.get('/graded-price-history', async (req, res) => {
    try {
        const cardId = req.query.cardId ? String(req.query.cardId) : '';
        const days = req.query.days ? parseInt(String(req.query.days), 10) : 365;
        const safeDays = Number.isFinite(days) ? days : 365;
        if (!cardId) {
            return res.status(400).json({ error: 'cardId is required' });
        }
        // Omit grader to fetch every series for a multi-line chart.
        if (!req.query.grader) {
            const all = await (0, gradedPriceService_1.getAllGradedPriceHistory)(cardId, safeDays);
            return res.json({ data: all });
        }
        const grader = String(req.query.grader);
        const grade = req.query.grade ? String(req.query.grade) : '10';
        const result = await (0, gradedPriceService_1.getGradedPriceHistory)(cardId, grader, grade, safeDays);
        res.json({ data: result });
    }
    catch (error) {
        logger_1.logger.error('Graded price history lookup failed', { error: error.message });
        res.status(500).json({ error: 'Failed to fetch graded price history' });
    }
});
router.get('/graded-spreads', async (req, res) => {
    try {
        const { getGradedSpreadsForCard, getTopGradedPremiums, getPsa10SpreadsForCards, } = await Promise.resolve().then(() => __importStar(require('../services/gradedSpreadService')));
        const cardId = req.query.cardId ? String(req.query.cardId) : null;
        if (cardId) {
            const summary = await getGradedSpreadsForCard(cardId);
            return res.json({ data: summary });
        }
        const cardIds = parseCsvParam(req.query.cardIds);
        if (cardIds && cardIds.length > 0) {
            const batch = await getPsa10SpreadsForCards(cardIds);
            return res.json({ data: batch, count: batch.length });
        }
        const limit = Math.min(parseInt(String(req.query.limit || '50'), 10) || 50, 200);
        const tradeableOnly = String(req.query.tradeableOnly || '') === '1' ||
            String(req.query.tradeableOnly || '').toLowerCase() === 'true';
        const top = await getTopGradedPremiums(limit, { tradeableOnly });
        res.json({ data: top, count: top.length });
    }
    catch (error) {
        logger_1.logger.error('Graded spreads lookup failed', { error: error.message });
        res.status(500).json({ error: 'Failed to fetch graded spreads' });
    }
});
router.get('/graded-premium-movers', async (req, res) => {
    try {
        const { getTopPremiumMovers } = await Promise.resolve().then(() => __importStar(require('../services/gradedSpreadService')));
        const days = Math.min(parseInt(String(req.query.days || '30'), 10) || 30, 90);
        const limit = Math.min(parseInt(String(req.query.limit || '12'), 10) || 12, 50);
        const movers = await getTopPremiumMovers({ days, limit });
        res.json({ data: movers, count: movers.length, days });
    }
    catch (error) {
        logger_1.logger.error('Graded premium movers lookup failed', { error: error.message });
        res.status(500).json({ error: 'Failed to fetch premium movers' });
    }
});
router.get('/cross-grader-arbs', async (req, res) => {
    try {
        const { getCrossGraderArbs } = await Promise.resolve().then(() => __importStar(require('../services/gradedSpreadService')));
        const limit = Math.min(parseInt(String(req.query.limit || '12'), 10) || 12, 50);
        const rows = await getCrossGraderArbs(limit);
        res.json({ data: rows, count: rows.length });
    }
    catch (error) {
        logger_1.logger.error('Cross-grader arb lookup failed', { error: error.message });
        res.status(500).json({ error: 'Failed to fetch cross-grader arbs' });
    }
});
/**
 * Cards most worth submitting for a PSA 10: high slab premium × easy gem rate.
 * Optional ?cardIds=a,b,c (or POST body) scopes to a vault / subset.
 */
const parseCsvParam = (value) => {
    if (value == null || value === '')
        return undefined;
    if (Array.isArray(value)) {
        return value.map((s) => String(s).trim()).filter(Boolean);
    }
    return String(value)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
};
router.get('/grade-worthiness', async (req, res) => {
    try {
        const { getGradeWorthinessLeaderboard, parseGradeWorthinessSort } = await Promise.resolve().then(() => __importStar(require('../services/gradeWorthinessService')));
        const limit = Math.min(parseInt(String(req.query.limit || '40'), 10) || 40, 200);
        const result = await getGradeWorthinessLeaderboard({
            limit,
            cardIds: parseCsvParam(req.query.cardIds),
            eras: parseCsvParam(req.query.eras),
            setIds: parseCsvParam(req.query.setIds),
            sort: parseGradeWorthinessSort(req.query.sort),
        });
        res.json({ data: result });
    }
    catch (error) {
        logger_1.logger.error('Grade worthiness lookup failed', { error: error.message });
        res.status(500).json({ error: 'Failed to fetch grade worthiness' });
    }
});
router.post('/grade-worthiness', async (req, res) => {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    try {
        const { getGradeWorthinessLeaderboard, parseGradeWorthinessSort } = await Promise.resolve().then(() => __importStar(require('../services/gradeWorthinessService')));
        const limit = Math.min(parseInt(String(req.query.limit || ((_a = req.body) === null || _a === void 0 ? void 0 : _a.limit) || '40'), 10) || 40, 200);
        const result = await getGradeWorthinessLeaderboard({
            limit,
            cardIds: parseCsvParam((_b = req.body) === null || _b === void 0 ? void 0 : _b.cardIds),
            eras: parseCsvParam((_d = (_c = req.body) === null || _c === void 0 ? void 0 : _c.eras) !== null && _d !== void 0 ? _d : req.query.eras),
            setIds: parseCsvParam((_f = (_e = req.body) === null || _e === void 0 ? void 0 : _e.setIds) !== null && _f !== void 0 ? _f : req.query.setIds),
            sort: parseGradeWorthinessSort((_h = (_g = req.body) === null || _g === void 0 ? void 0 : _g.sort) !== null && _h !== void 0 ? _h : req.query.sort),
        });
        res.json({ data: result });
    }
    catch (error) {
        logger_1.logger.error('Grade worthiness lookup failed', { error: error.message });
        res.status(500).json({ error: 'Failed to fetch grade worthiness' });
    }
});
/**
 * Submit vs buy PSA 10 decision engine.
 */
router.get('/submit-vs-buy', async (req, res) => {
    try {
        const { getSubmitVsBuyLeaderboard } = await Promise.resolve().then(() => __importStar(require('../services/slabInsightsService')));
        const limit = Math.min(parseInt(String(req.query.limit || '20'), 10) || 20, 100);
        const result = await getSubmitVsBuyLeaderboard({
            limit,
            cardIds: parseCsvParam(req.query.cardIds),
        });
        res.json({ data: result });
    }
    catch (error) {
        logger_1.logger.error('Submit vs buy lookup failed', { error: error.message });
        res.status(500).json({ error: 'Failed to fetch submit vs buy' });
    }
});
router.post('/submit-vs-buy', async (req, res) => {
    var _a, _b, _c;
    try {
        const { getSubmitVsBuyLeaderboard } = await Promise.resolve().then(() => __importStar(require('../services/slabInsightsService')));
        const limit = Math.min(parseInt(String(req.query.limit || ((_a = req.body) === null || _a === void 0 ? void 0 : _a.limit) || '20'), 10) || 20, 100);
        const result = await getSubmitVsBuyLeaderboard({
            limit,
            cardIds: parseCsvParam((_c = (_b = req.body) === null || _b === void 0 ? void 0 : _b.cardIds) !== null && _c !== void 0 ? _c : req.query.cardIds),
        });
        res.json({ data: result });
    }
    catch (error) {
        logger_1.logger.error('Submit vs buy lookup failed', { error: error.message });
        res.status(500).json({ error: 'Failed to fetch submit vs buy' });
    }
});
/** Set-level slab heatmap / regime map */
router.get('/set-slab-heatmap', async (req, res) => {
    try {
        const { getSetSlabHeatmap } = await Promise.resolve().then(() => __importStar(require('../services/slabInsightsService')));
        const limit = Math.min(parseInt(String(req.query.limit || '40'), 10) || 40, 100);
        const minCards = Math.min(parseInt(String(req.query.minCards || '3'), 10) || 3, 50);
        const result = await getSetSlabHeatmap({ limit, minCards });
        res.json({ data: result });
    }
    catch (error) {
        logger_1.logger.error('Set slab heatmap failed', { error: error.message });
        res.status(500).json({ error: 'Failed to fetch set slab heatmap' });
    }
});
/** Population regime / pop-report radar */
router.get('/pop-regime', async (req, res) => {
    try {
        const { getPopRegimeRadar } = await Promise.resolve().then(() => __importStar(require('../services/slabInsightsService')));
        const days = Math.min(parseInt(String(req.query.days || '30'), 10) || 30, 90);
        const limit = Math.min(parseInt(String(req.query.limit || '20'), 10) || 20, 50);
        const result = await getPopRegimeRadar({ days, limit });
        res.json({ data: result });
    }
    catch (error) {
        logger_1.logger.error('Pop regime radar failed', { error: error.message });
        res.status(500).json({ error: 'Failed to fetch pop regime' });
    }
});
/** Full grade-ladder economics */
router.get('/grade-ladder', async (req, res) => {
    try {
        const { getGradeLadderLeaderboard } = await Promise.resolve().then(() => __importStar(require('../services/slabInsightsService')));
        const limit = Math.min(parseInt(String(req.query.limit || '15'), 10) || 15, 50);
        const result = await getGradeLadderLeaderboard({
            limit,
            cardIds: parseCsvParam(req.query.cardIds),
        });
        res.json({ data: result });
    }
    catch (error) {
        logger_1.logger.error('Grade ladder lookup failed', { error: error.message });
        res.status(500).json({ error: 'Failed to fetch grade ladder' });
    }
});
/** Crack-and-regrade EV scanner */
router.get('/crack-regrade', async (req, res) => {
    try {
        const { getCrackRegradeScanner } = await Promise.resolve().then(() => __importStar(require('../services/slabInsightsService')));
        const limit = Math.min(parseInt(String(req.query.limit || '12'), 10) || 12, 50);
        const result = await getCrackRegradeScanner(limit);
        res.json({ data: result });
    }
    catch (error) {
        logger_1.logger.error('Crack-regrade scanner failed', { error: error.message });
        res.status(500).json({ error: 'Failed to fetch crack-regrade opportunities' });
    }
});
/** Mark-to-market for owned slab book lots */
router.post('/slab-marks', async (req, res) => {
    var _a;
    try {
        const { getSlabMarksForLots } = await Promise.resolve().then(() => __importStar(require('../services/slabInsightsService')));
        const lots = Array.isArray((_a = req.body) === null || _a === void 0 ? void 0 : _a.lots) ? req.body.lots : [];
        const normalized = lots
            .map((l) => ({
            cardId: String((l === null || l === void 0 ? void 0 : l.cardId) || '').trim(),
            grader: String((l === null || l === void 0 ? void 0 : l.grader) || 'PSA').trim(),
            grade: String((l === null || l === void 0 ? void 0 : l.grade) || '10').trim(),
        }))
            .filter((l) => l.cardId);
        const marks = await getSlabMarksForLots(normalized);
        res.json({ data: marks, count: marks.length });
    }
    catch (error) {
        logger_1.logger.error('Slab marks lookup failed', { error: error.message });
        res.status(500).json({ error: 'Failed to fetch slab marks' });
    }
});
/**
 * Manually trigger the nightly slab-price + population refresh. One request per
 * card serves both tables; data is strictly matched against PriceCharting.
 * ?all=1 runs the full-catalog sweep instead of the priority queue.
 */
router.post('/refresh-graded-data', async (req, res) => {
    try {
        const { runGradedRefresh, runAllCardsRefresh } = await Promise.resolve().then(() => __importStar(require('../services/gradedRefreshService')));
        const { withDbJobLock } = await Promise.resolve().then(() => __importStar(require('../utils/dbJobLock')));
        const limit = Math.min(parseInt(String(req.query.limit || '50'), 10) || 50, 200);
        const all = String(req.query.all || '') === '1';
        const result = await withDbJobLock('graded-refresh', () => (all ? runAllCardsRefresh({ limit, delayMs: 1000 }) : runGradedRefresh(limit)), { skipIfBusy: true });
        res.json({ data: result });
    }
    catch (error) {
        logger_1.logger.error('Graded data refresh failed', { error: error.message });
        res.status(500).json({ error: 'Failed to refresh graded data' });
    }
});
exports.default = router;
