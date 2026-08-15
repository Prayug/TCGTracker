"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const logger_1 = require("../../utils/logger");
const pokemonApiClient_1 = require("../../services/pokemonApiClient");
const cardCache_1 = require("../../services/cardCache");
const cardDatabase_1 = require("../../services/cardDatabase");
const catalogSync_1 = require("../../services/catalogSync");
const tcgdexJaCatalogProvider_1 = require("../../services/providers/tcgdexJaCatalogProvider");
const cardEnrichment_1 = require("../../services/cardEnrichment");
const scriptDetection_1 = require("../../utils/scriptDetection");
const router = (0, express_1.Router)();
function respondWithPersistent(entry, stale = false) {
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
}
function localFallbackPayload(cards, limit, lang, source) {
    return {
        data: cards,
        totalCount: cards.length,
        pageSize: limit,
        pagesFetched: 1,
        cached: false,
        source,
        fallback: true,
        language: lang,
    };
}
function liveJaCatalogRow(card) {
    return {
        cardId: card.cardId,
        cardName: card.cardName,
        setId: card.setId,
        setName: card.setName,
        setReleaseDate: card.setReleaseDate,
        cardNumber: card.cardNumber,
        rarity: card.rarity,
        types: card.types ? JSON.stringify(card.types) : null,
        artist: card.artist,
        imageSmall: card.imageSmall,
        imageLarge: card.imageLarge,
        tcgplayerProductId: card.tcgplayerProductId,
        tcgplayerPrices: card.tcgplayerPrices
            ? JSON.stringify(card.tcgplayerPrices)
            : null,
        language: 'ja',
        matchName: card.matchName,
        latestPrice: null,
        latestLowPrice: null,
        latestHighPrice: null,
    };
}
async function mergeLiveJaCatalogRows(sanitizedQuery, limit, catalogRows) {
    try {
        const live = await tcgdexJaCatalogProvider_1.tcgdexJaCatalogProvider.searchCardsByName(sanitizedQuery, limit);
        if (live.length > 0) {
            const byId = new Map();
            for (const row of catalogRows) {
                if (row === null || row === void 0 ? void 0 : row.cardId)
                    byId.set(String(row.cardId).toLowerCase(), row);
            }
            for (const card of live) {
                const id = String(card.cardId).toLowerCase();
                if (!byId.has(id)) {
                    byId.set(id, liveJaCatalogRow(card));
                }
            }
            catalogRows = Array.from(byId.values()).slice(0, limit);
            void (0, catalogSync_1.upsertJapaneseCatalogCards)(live).catch((err) => {
                logger_1.logger.warn('Failed to upsert live JA search hits', {
                    error: err.message,
                });
            });
        }
    }
    catch (liveErr) {
        logger_1.logger.warn('Live TCGdex JA search failed', {
            error: liveErr.message,
        });
    }
    return catalogRows;
}
async function buildLocalFallback(sanitizedQuery, normalizedSetId, limit, lang) {
    // Prefer catalog_cards (complete number + art) over raw TCGCSV mappings.
    // Mappings include sealed SKUs and rows with null cardNumber/images that
    // previously produced white SVG placeholders and "#—" in Browse.
    let catalogRows = await (0, cardDatabase_1.getCatalogCardsForQuery)(sanitizedQuery, normalizedSetId, limit, lang).catch((err) => {
        logger_1.logger.error('Catalog fallback query failed', err);
        return [];
    });
    // Live TCGdex JA search fills unsynced sets/promos so Browse isn't stuck on priority sets.
    if (lang === 'ja' && !normalizedSetId) {
        catalogRows = await mergeLiveJaCatalogRows(sanitizedQuery, limit, catalogRows);
    }
    if (catalogRows.length > 0) {
        const cards = await (0, cardEnrichment_1.enrichCardsWithInvestmentData)((0, cardDatabase_1.mapCatalogRowsToPokemonCards)(catalogRows));
        return localFallbackPayload(cards, limit, lang, 'catalog_database');
    }
    const rows = await (0, cardDatabase_1.getLocalCardsForQuery)(sanitizedQuery, normalizedSetId, limit, lang).catch((err) => {
        logger_1.logger.error('Local fallback query failed', err);
        return [];
    });
    if (!rows || rows.length === 0) {
        return null;
    }
    const cards = await (0, cardEnrichment_1.enrichCardsWithInvestmentData)(await (0, cardDatabase_1.mapLocalRowsToPokemonCards)(rows));
    return localFallbackPayload(cards, limit, lang, 'local_database');
}
/**
 * Search cards from local database
 * Much faster and more reliable than Pokemon TCG API
 */
router.get('/search', async (req, res) => {
    var _a;
    try {
        const { query, setId, limit = '100', language = 'en' } = req.query;
        if (!query || typeof query !== 'string') {
            return res.status(400).json({
                error: 'Query parameter is required'
            });
        }
        const searchLimit = Math.min(parseInt(limit) || 100, 250);
        const normalizedSetId = typeof setId === 'string' && setId.trim().length > 0 ? setId.trim() : undefined;
        const lang = typeof language === 'string' && ['en', 'ja', 'all'].includes(language.toLowerCase())
            ? language.toLowerCase()
            : 'en';
        let cards = (0, cardDatabase_1.mapCatalogRowsToPokemonCards)(await (0, cardDatabase_1.getCatalogCardsForQuery)(query, normalizedSetId, searchLimit, lang));
        if (cards.length === 0) {
            cards = await (0, cardDatabase_1.mapLocalRowsToPokemonCards)(await (0, cardDatabase_1.getLocalCardsForQuery)(query, normalizedSetId, searchLimit, lang));
        }
        logger_1.logger.info(`✅ Found ${cards.length} cards matching "${query}" from local database`, {
            language: lang,
        });
        res.json({
            data: cards,
            count: cards.length,
            language: lang,
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
router.get('/pokemon', async (req, res) => {
    let persistentCacheEntry = null;
    let buildLocalFallbackResponse = null;
    try {
        const { query, setId, pageSize = '250', fetchAll = 'true', maxPages = '4', language = 'en' } = req.query;
        if (!query || typeof query !== 'string' || query.trim().length < 2) {
            return res.status(400).json({
                error: 'Query parameter with at least 2 characters is required.',
            });
        }
        const sanitizedQuery = query.trim();
        const normalizedSetId = typeof setId === 'string' && setId.trim().length > 0 ? setId.trim() : undefined;
        // JA catalog searches can exceed the EN Pokemon-API pageSize cap (promos + variants).
        const limitCap = (0, scriptDetection_1.queryContainsCjk)(sanitizedQuery) || String(language).toLowerCase() === 'ja' ? 500 : 250;
        const limit = Math.min(Math.max(parseInt(pageSize, 10) || 100, 1), limitCap);
        const shouldFetchAll = String(fetchAll).toLowerCase() !== 'false';
        const maxPagesToFetch = Math.min(Math.max(parseInt(maxPages, 10) || 4, 1), 10);
        const requestedLang = typeof language === 'string' && ['en', 'ja', 'all'].includes(language.toLowerCase())
            ? language.toLowerCase()
            : 'en';
        // CJK queries always resolve against the JA catalog — pokemontcg.io rejects them (400/5xx).
        const lang = (0, scriptDetection_1.queryContainsCjk)(sanitizedQuery) ? 'ja' : requestedLang;
        buildLocalFallbackResponse = async () => buildLocalFallback(sanitizedQuery, normalizedSetId, limit, lang);
        // Japanese cards live only in our TCGdex JA catalog — skip Pokemon TCG API.
        if (lang === 'ja') {
            const local = await buildLocalFallbackResponse();
            if (local)
                return res.json(local);
            return res.json({
                data: [],
                totalCount: 0,
                pageSize: limit,
                pagesFetched: 0,
                cached: false,
                source: 'catalog_database',
                language: lang,
            });
        }
        const cacheKey = [
            sanitizedQuery.toLowerCase(),
            normalizedSetId ? normalizedSetId.toLowerCase() : '',
            shouldFetchAll ? 'all' : 'page',
            limit,
            maxPagesToFetch,
            lang,
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
exports.default = router;
