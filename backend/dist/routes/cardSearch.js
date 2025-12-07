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
const express_1 = require("express");
const database_1 = require("../db/database");
const pokemonApiClient_1 = require("../services/pokemonApiClient");
const cardIdentifier_1 = require("../services/cardIdentifier");
const setCodeService_1 = require("../services/setCodeService");
const cardCache_1 = require("../services/cardCache");
const cardImageUtils_1 = require("../services/cardImageUtils");
const cardDatabase_1 = require("../services/cardDatabase");
const router = (0, express_1.Router)();
/**
 * Search cards from local database
 * Much faster and more reliable than Pokemon TCG API
 */
router.get('/search', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { query, setId, limit = '100' } = req.query;
        if (!query || typeof query !== 'string') {
            return res.status(400).json({
                error: 'Query parameter is required'
            });
        }
        const db = (0, database_1.getDb)();
        const searchLimit = Math.min(parseInt(limit) || 100, 250);
        const imageColumns = yield (0, cardImageUtils_1.getImageColumnSelectFragment)();
        let sql = `
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
        ph.date as priceDate
      FROM card_mappings cm
      LEFT JOIN (
        SELECT uniqueIdentifier, marketPrice, date
        FROM price_history
        WHERE (uniqueIdentifier, date) IN (
          SELECT uniqueIdentifier, MAX(date)
          FROM price_history
          GROUP BY uniqueIdentifier
        )
      ) ph ON cm.uniqueIdentifier = ph.uniqueIdentifier
      WHERE cm.cardName LIKE ?
    `;
        const params = [`%${query}%`];
        if (setId && typeof setId === 'string') {
            sql += ' AND (cm.setId = ? OR cm.setName LIKE ?)';
            params.push(setId, `%${setId}%`);
        }
        sql += ` ORDER BY cm.cardName ASC LIMIT ?`;
        params.push(searchLimit);
        db.all(sql, params, (err, rows) => __awaiter(void 0, void 0, void 0, function* () {
            if (err) {
                console.error('Error searching cards:', err);
                return res.status(500).json({
                    error: 'Database error',
                    message: err.message
                });
            }
            // Transform to Pokemon TCG API compatible format using the helper function
            const cards = yield (0, cardDatabase_1.mapLocalRowsToPokemonCards)(rows);
            console.log(`✅ Found ${cards.length} cards matching "${query}" from local database`);
            res.json({
                data: cards,
                count: cards.length,
                source: 'local_database'
            });
        }));
    }
    catch (error) {
        console.error('Error in card search:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: error.message
        });
    }
}));
/**
 * Get all unique sets from local database
 */
router.get('/sets', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const db = (0, database_1.getDb)();
        const sql = `
      SELECT DISTINCT 
        setId as id,
        setName as name,
        COUNT(*) as total
      FROM card_mappings
      GROUP BY setId, setName
      ORDER BY setName ASC
    `;
        db.all(sql, [], (err, rows) => {
            if (err) {
                console.error('Error fetching sets:', err);
                return res.status(500).json({
                    error: 'Database error',
                    message: err.message
                });
            }
            const sets = rows.map(row => ({
                id: row.id,
                name: row.name,
                releaseDate: '2020-01-01',
                total: row.total,
                images: {
                    symbol: '',
                    logo: ''
                }
            }));
            res.json({
                data: sets,
                count: sets.length,
                source: 'local_database'
            });
        });
    }
    catch (error) {
        console.error('Error fetching sets:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: error.message
        });
    }
}));
/**
 * Get card statistics
 */
router.get('/stats', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
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
                console.error('Error fetching stats:', err);
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
        console.error('Error fetching stats:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: error.message
        });
    }
}));
/**
 * Get a random pool of cards with latest market prices from local DB
 */
router.get('/pool', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const db = (0, database_1.getDb)();
        const { limit = '250', minPrice = '1', maxPrice = '20000' } = req.query;
        const poolLimit = Math.min(parseInt(limit) || 250, 10000); // Increased max to 10000 for better pool diversity
        const imageColumns = yield (0, cardImageUtils_1.getImageColumnSelectFragment)();
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
        // Build exclusion clauses
        const nameExclusionClauses = EXCLUDED_FAKE_SET_NAMES.map(set => set.includes('%') ? `cm.setName NOT LIKE '${set}'` : `cm.setName != '${set}'`);
        const idExclusionClauses = EXCLUDED_FAKE_SET_IDS.map(setId => `cm.setId != '${setId}'`);
        const exclusionClauses = [...nameExclusionClauses, ...idExclusionClauses, PROMO_EXCLUSION_CLAUSE].join(' AND ');
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
          WHERE source = 'tcgcsv'
          GROUP BY uniqueIdentifier
        ) latest ON ph1.uniqueIdentifier = latest.uniqueIdentifier AND ph1.date = latest.maxDate
        WHERE ph1.marketPrice IS NOT NULL
      ) ph ON cm.uniqueIdentifier = ph.uniqueIdentifier
      WHERE ph.marketPrice >= ? AND ph.marketPrice <= ?
        AND cm.cardName IS NOT NULL AND TRIM(cm.cardName) <> ''
        AND cm.setId IS NOT NULL AND TRIM(cm.setId) <> ''
        AND cm.cardNumber IS NOT NULL AND TRIM(cm.cardNumber) <> ''
        AND ${exclusionClauses}
      ORDER BY RANDOM()
      LIMIT ?
    `;
        db.all(sql, [minPrice, maxPrice, poolLimit], (err, rows) => __awaiter(void 0, void 0, void 0, function* () {
            if (err) {
                console.error('Error fetching random card pool:', err);
                return res.status(500).json({
                    error: 'Database error',
                    message: err.message
                });
            }
            // Use the helper function to properly map cards with stored images
            const cards = yield (0, cardDatabase_1.mapLocalRowsToPokemonCards)(rows);
            res.json({
                data: cards,
                count: cards.length,
                source: 'local_database'
            });
        }));
    }
    catch (error) {
        console.error('Error building card pool:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: error.message
        });
    }
}));
router.get('/pokemon', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
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
            console.error('Failed to parse cached pokemon data', parseError);
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
        buildLocalFallbackResponse = () => __awaiter(void 0, void 0, void 0, function* () {
            const rows = yield (0, cardDatabase_1.getLocalCardsForQuery)(sanitizedQuery, normalizedSetId, limit).catch((err) => {
                console.error('Local fallback query failed', err);
                return [];
            });
            if (!rows || rows.length === 0) {
                return null;
            }
            const cards = yield (0, cardDatabase_1.mapLocalRowsToPokemonCards)(rows);
            return {
                data: cards,
                totalCount: cards.length,
                pageSize: limit,
                pagesFetched: 1,
                cached: false,
                source: 'local_database',
                fallback: true,
            };
        });
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
            return res.json({
                data: inMemory.data,
                totalCount: inMemory.totalCount,
                pageSize: inMemory.pageSize,
                pagesFetched: inMemory.pagesFetched,
                cached: true,
                source: 'pokemon_tcg_api',
            });
        }
        persistentCacheEntry = yield (0, cardCache_1.getPersistentPokemonCache)(cacheKey).catch((err) => {
            console.error('Error reading persistent pokemon cache', err);
            return null;
        });
        if (persistentCacheEntry &&
            now - (persistentCacheEntry.fetchedAt || 0) < cardCache_1.POKEMON_PERSISTENT_CACHE_TTL) {
            const payload = respondWithPersistent(Object.assign(Object.assign({}, persistentCacheEntry), { pageSize: persistentCacheEntry.pageSize || limit }));
            if (payload) {
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
        const apiResult = yield pokemonApiClient_1.pokemonApiClient.searchCardsBulk({
            nameQuery: sanitizedQuery,
            setId: normalizedSetId,
            pageSize: limit,
            fetchAll: shouldFetchAll,
            maxPages: maxPagesToFetch,
        });
        const uniqueCards = apiResult.cards;
        if (uniqueCards.length === 0) {
            console.warn(`⚠️ No cards from Pokemon API for query "${sanitizedQuery}", trying fallbacks...`);
            if (buildLocalFallbackResponse) {
                const localPayload = yield buildLocalFallbackResponse();
                if (localPayload) {
                    console.log(`✅ Serving ${localPayload.data.length} cards from local database fallback`);
                    return res.json(localPayload);
                }
            }
            if (persistentCacheEntry) {
                const payload = respondWithPersistent(Object.assign(Object.assign({}, persistentCacheEntry), { pageSize: persistentCacheEntry.pageSize || limit }), true);
                if (payload) {
                    console.log(`✅ Serving ${payload.data.length} stale cached cards as fallback`);
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
            yield (0, cardCache_1.savePersistentPokemonCache)(cacheKey, {
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
            console.warn('Failed to persist pokemon search cache', cacheError);
        }
        console.log(`✅ Successfully fetched ${uniqueCards.length} cards for "${sanitizedQuery}" from Pokemon API`);
        res.json(payload);
    }
    catch (error) {
        console.error('❌ Error proxying Pokemon API search:', error);
        if (buildLocalFallbackResponse) {
            try {
                const localPayload = yield buildLocalFallbackResponse();
                if (localPayload) {
                    console.log(`✅ Serving ${localPayload.data.length} cards from local database (error fallback)`);
                    return res.status(200).json(localPayload);
                }
            }
            catch (fallbackErr) {
                console.warn('Local fallback also failed:', fallbackErr);
            }
        }
        if (persistentCacheEntry) {
            const payload = respondWithPersistent(persistentCacheEntry, true);
            if (payload) {
                console.log(`✅ Serving ${payload.data.length} stale cached cards (error fallback)`);
                return res.status(200).json(payload);
            }
        }
        res.status(502).json({
            error: 'Failed to fetch results from Pokemon TCG API',
            message: error.message,
        });
    }
}));
/**
 * Search Pokemon API for card images (proxy endpoint to avoid CORS)
 */
router.get('/search-pokemon', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
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
            console.log(`💾 Cache hit for ${cardName} from ${setId || setName || 'unknown set'}`);
            return res.json({
                card: cached.card,
                images: cached.images,
                id: cached.id,
                matchedSet: cached.matchedSet,
                matchedNumber: cached.matchedNumber,
                cached: true,
            });
        }
        const searchResult = yield pokemonApiClient_1.pokemonApiClient.findBestImageMatch({
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
        cardCache_1.cardImageCache.set(cacheKey, Object.assign(Object.assign({}, responsePayload), { timestamp: Date.now() }));
        console.log(`✅ Matched card: ${searchResult.card.name} from ${(_d = searchResult.card.set) === null || _d === void 0 ? void 0 : _d.name} (#${searchResult.card.number})`);
        // Update rarity in database if available
        if (((_e = searchResult.card) === null || _e === void 0 ? void 0 : _e.rarity) && searchResult.card.rarity.trim()) {
            const card = searchResult.card; // Store reference to avoid null checks in callback
            // We need to find the uniqueIdentifier for this card
            // Since we don't have it directly, we'll construct it based on setId, cardNumber, and cardName
            const db = (0, database_1.getDb)();
            const setIdNormalized = ((_f = card.set) === null || _f === void 0 ? void 0 : _f.id) || '';
            const cardNumber = card.number || '';
            const cardName = card.name || '';
            const uniqueIdentifier = (0, cardIdentifier_1.generateUniqueIdentifier)(setIdNormalized, cardNumber, cardName);
            db.run('UPDATE card_mappings SET rarity = ? WHERE uniqueIdentifier = ?', [card.rarity, uniqueIdentifier], (err) => {
                if (err) {
                    console.warn(`Failed to update rarity for ${cardName}:`, err);
                }
                else {
                    console.log(`✅ Updated rarity for ${cardName}: ${card.rarity}`);
                }
            });
        }
        res.json(responsePayload);
    }
    catch (error) {
        console.error('Error searching Pokemon API:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: error.message,
        });
    }
}));
/**
 * Refresh Pokemon TCG set mappings from API
 * This endpoint manually triggers a refresh of the set mappings cache
 */
router.post('/refresh-set-mappings', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        console.log('🔄 Manual refresh of Pokemon TCG set mappings requested');
        const mappings = yield setCodeService_1.setCodeService.refreshSetMappings();
        res.json({
            success: true,
            message: `Refreshed ${mappings.size} set mappings`,
            mappingsCount: mappings.size,
            source: 'pokemon_tcg_api'
        });
    }
    catch (error) {
        console.error('❌ Failed to refresh set mappings:', error);
        res.status(500).json({
            error: 'Failed to refresh set mappings',
            message: error.message
        });
    }
}));
/**
 * Get set mapping statistics
 */
router.get('/set-mappings/stats', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const stats = yield setCodeService_1.setCodeService.getSetMappingStats();
        res.json({
            totalMappingsInDb: stats.databaseMappings,
            cachedMappings: stats.cachedMappings,
            lastRefreshed: stats.lastRefreshed ? new Date(stats.lastRefreshed).toISOString() : null,
            cacheAge: stats.lastRefreshed ? Date.now() - stats.lastRefreshed : null,
            cacheTtl: stats.cacheTtl
        });
    }
    catch (error) {
        console.error('Error fetching set mapping stats:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: error.message
        });
    }
}));
exports.default = router;
