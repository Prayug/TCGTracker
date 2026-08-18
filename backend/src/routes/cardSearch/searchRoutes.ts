import { Router } from 'express';
import { logger } from '../../utils/logger';
import { pokemonApiClient } from '../../services/pokemonApiClient';
import {
  pokemonApiCache,
  POKEMON_CACHE_TTL,
  POKEMON_PERSISTENT_CACHE_TTL,
  getPersistentPokemonCache,
  savePersistentPokemonCache,
  PokemonPersistentCacheRow,
} from '../../services/cardCache';
import {
  getCatalogCardsForQuery,
  getLocalCardsForQuery,
  mapCatalogRowsToPokemonCards,
  mapLocalRowsToPokemonCards,
} from '../../services/cardDatabase';
import { upsertJapaneseCatalogCards } from '../../services/catalogSync';
import { tcgdexJaCatalogProvider } from '../../services/providers/tcgdexJaCatalogProvider';
import { enrichCardsWithInvestmentData } from '../../services/cardEnrichment';
import { queryContainsCjk } from '../../utils/scriptDetection';

const router = Router();

function respondWithPersistent(entry: PokemonPersistentCacheRow, stale = false) {
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
  } catch (parseError) {
    logger.error('Failed to parse cached pokemon data', parseError);
    return null;
  }
}

function localFallbackPayload(
  cards: any[],
  limit: number,
  lang: string,
  source: 'catalog_database' | 'local_database'
) {
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

function liveJaCatalogRow(card: any) {
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

async function mergeLiveJaCatalogRows(
  sanitizedQuery: string,
  limit: number,
  catalogRows: any[]
): Promise<any[]> {
  try {
    const live = await tcgdexJaCatalogProvider.searchCardsByName(sanitizedQuery, limit);
    if (live.length > 0) {
      const byId = new Map<string, any>();
      for (const row of catalogRows) {
        if (row?.cardId) byId.set(String(row.cardId).toLowerCase(), row);
      }
      for (const card of live) {
        const id = String(card.cardId).toLowerCase();
        if (!byId.has(id)) {
          byId.set(id, liveJaCatalogRow(card));
        }
      }
      catalogRows = Array.from(byId.values()).slice(0, limit);
      void upsertJapaneseCatalogCards(live).catch((err) => {
        logger.warn('Failed to upsert live JA search hits', {
          error: (err as Error).message,
        });
      });
    }
  } catch (liveErr) {
    logger.warn('Live TCGdex JA search failed', {
      error: (liveErr as Error).message,
    });
  }
  return catalogRows;
}

async function buildLocalFallback(
  sanitizedQuery: string,
  normalizedSetId: string | undefined,
  limit: number,
  lang: string
): Promise<any | null> {
  // Prefer catalog_cards (complete number + art) over raw TCGCSV mappings.
  // Mappings include sealed SKUs and rows with null cardNumber/images that
  // previously produced white SVG placeholders and "#—" in Browse.
  let catalogRows = await getCatalogCardsForQuery(
    sanitizedQuery,
    normalizedSetId,
    limit,
    lang
  ).catch((err) => {
    logger.error('Catalog fallback query failed', err);
    return [] as any[];
  });

  // Live TCGdex JA search fills unsynced sets/promos so Browse isn't stuck on priority sets.
  if (lang === 'ja' && !normalizedSetId) {
    catalogRows = await mergeLiveJaCatalogRows(sanitizedQuery, limit, catalogRows);
  }

  if (catalogRows.length > 0) {
    const cards = await enrichCardsWithInvestmentData(
      mapCatalogRowsToPokemonCards(catalogRows)
    );
    return localFallbackPayload(cards, limit, lang, 'catalog_database');
  }

  const rows = await getLocalCardsForQuery(
    sanitizedQuery,
    normalizedSetId,
    limit,
    lang
  ).catch((err) => {
    logger.error('Local fallback query failed', err);
    return [] as any[];
  });
  if (!rows || rows.length === 0) {
    return null;
  }
  const cards = await enrichCardsWithInvestmentData(await mapLocalRowsToPokemonCards(rows));
  return localFallbackPayload(cards, limit, lang, 'local_database');
}

/**
 * Search cards from local database
 * Much faster and more reliable than Pokemon TCG API
 */
router.get('/search', async (req, res) => {
  try {
    const { query, setId, limit = '100', language = 'en' } = req.query;
    
    if (!query || typeof query !== 'string') {
      return res.status(400).json({ 
        error: 'Query parameter is required' 
      });
    }

    const searchLimit = Math.min(parseInt(limit as string) || 100, 250);
    const normalizedSetId =
      typeof setId === 'string' && setId.trim().length > 0 ? setId.trim() : undefined;
    const lang =
      typeof language === 'string' && ['en', 'ja', 'all'].includes(language.toLowerCase())
        ? language.toLowerCase()
        : 'en';

    let cards: any[] = mapCatalogRowsToPokemonCards(
      await getCatalogCardsForQuery(query, normalizedSetId, searchLimit, lang)
    );

    if (cards.length === 0) {
      cards = await mapLocalRowsToPokemonCards(
        await getLocalCardsForQuery(query, normalizedSetId, searchLimit, lang)
      );
    }

    logger.info(`✅ Found ${cards.length} cards matching "${query}" from local database`, {
      language: lang,
    });

    res.json({
      data: cards,
      count: cards.length,
      language: lang,
      source: cards[0]?.source === 'catalog_sync' ? 'catalog_database' : 'local_database',
    });
  } catch (error) {
    logger.error('Error in card search:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: (error as Error).message 
    });
  }
});

router.get('/pokemon', async (req, res) => {
  let persistentCacheEntry: PokemonPersistentCacheRow | null = null;
  let buildLocalFallbackResponse: (() => Promise<any | null>) | null = null;

  try {
    const { query, setId, pageSize = '250', fetchAll = 'true', maxPages = '4', language = 'en' } =
      req.query;

    if (!query || typeof query !== 'string' || query.trim().length < 2) {
      return res.status(400).json({
        error: 'Query parameter with at least 2 characters is required.',
      });
    }

    const sanitizedQuery = query.trim();
    const normalizedSetId =
      typeof setId === 'string' && setId.trim().length > 0 ? setId.trim() : undefined;
    // JA catalog searches can exceed the EN Pokemon-API pageSize cap (promos + variants).
    const limitCap = queryContainsCjk(sanitizedQuery) || String(language).toLowerCase() === 'ja' ? 500 : 250;
    const limit = Math.min(Math.max(parseInt(pageSize as string, 10) || 100, 1), limitCap);
    const shouldFetchAll = String(fetchAll).toLowerCase() !== 'false';
    const maxPagesToFetch = Math.min(Math.max(parseInt(maxPages as string, 10) || 4, 1), 10);
    const requestedLang =
      typeof language === 'string' && ['en', 'ja', 'all'].includes(language.toLowerCase())
        ? language.toLowerCase()
        : 'en';
    // CJK queries always resolve against the JA catalog — pokemontcg.io rejects them (400/5xx).
    const lang = queryContainsCjk(sanitizedQuery) ? 'ja' : requestedLang;

    buildLocalFallbackResponse = async () =>
      buildLocalFallback(sanitizedQuery, normalizedSetId, limit, lang);

    // Japanese cards live only in our TCGdex JA catalog — skip Pokemon TCG API.
    if (lang === 'ja') {
      const local = await buildLocalFallbackResponse();
      if (local) return res.json(local);
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
    const inMemory = pokemonApiCache.get(cacheKey);
    if (inMemory && now - inMemory.fetchedAt < POKEMON_CACHE_TTL) {
      const enrichedData = await enrichCardsWithInvestmentData(inMemory.data);
      return res.json({
        data: enrichedData,
        totalCount: inMemory.totalCount,
        pageSize: inMemory.pageSize,
        pagesFetched: inMemory.pagesFetched,
        cached: true,
        source: 'pokemon_tcg_api',
      });
    }

    persistentCacheEntry = await getPersistentPokemonCache(cacheKey).catch((err) => {
      logger.error('Error reading persistent pokemon cache', err);
      return null;
    });

    if (
      persistentCacheEntry &&
      now - (persistentCacheEntry.fetchedAt || 0) < POKEMON_PERSISTENT_CACHE_TTL
    ) {
      const payload = respondWithPersistent({
        ...persistentCacheEntry,
        pageSize: persistentCacheEntry.pageSize || limit,
      });
      if (payload) {
        payload.data = await enrichCardsWithInvestmentData(payload.data);
        pokemonApiCache.set(cacheKey, {
          data: payload.data,
          totalCount: payload.totalCount,
          fetchedAt: persistentCacheEntry.fetchedAt,
          pageSize: payload.pageSize,
          pagesFetched: payload.pagesFetched,
        });
        return res.json(payload);
      }
    }

    const apiResult = await pokemonApiClient.searchCardsBulk({
      nameQuery: sanitizedQuery,
      setId: normalizedSetId,
      pageSize: limit,
      fetchAll: shouldFetchAll,
      maxPages: maxPagesToFetch,
    });

    const uniqueCards = await enrichCardsWithInvestmentData(apiResult.cards);

    if (uniqueCards.length === 0) {
      logger.warn(
        `⚠️ No cards from Pokemon API for query "${sanitizedQuery}", trying fallbacks...`
      );

      if (buildLocalFallbackResponse) {
        const localPayload = await buildLocalFallbackResponse();
        if (localPayload) {
          logger.info(`✅ Serving ${localPayload.data.length} cards from local database fallback`);
          return res.json(localPayload);
        }
      }

      if (persistentCacheEntry) {
        const payload = respondWithPersistent(
          {
            ...persistentCacheEntry,
            pageSize: persistentCacheEntry.pageSize || limit,
          },
          true
        );
        if (payload) {
          payload.data = await enrichCardsWithInvestmentData(payload.data);
          logger.info(`✅ Serving ${payload.data.length} stale cached cards as fallback`);
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

    pokemonApiCache.set(cacheKey, {
      data: uniqueCards,
      totalCount: payload.totalCount,
      fetchedAt: Date.now(),
      pageSize: limit,
      pagesFetched: apiResult.pagesFetched,
    });

    try {
      await savePersistentPokemonCache(cacheKey, {
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
    } catch (cacheError) {
      logger.warn('Failed to persist pokemon search cache', cacheError);
    }

    logger.info(
      `✅ Successfully fetched ${uniqueCards.length} cards for "${sanitizedQuery}" from Pokemon API`
    );
    res.json(payload);
  } catch (error) {
    logger.error('❌ Error proxying Pokemon API search:', error);

    if (buildLocalFallbackResponse) {
      try {
        const localPayload = await buildLocalFallbackResponse();
        if (localPayload) {
          logger.info(
            `✅ Serving ${localPayload.data.length} cards from local database (error fallback)`
          );
          return res.status(200).json(localPayload);
        }
      } catch (fallbackErr) {
        logger.warn('Local fallback also failed:', fallbackErr);
      }
    }

    if (persistentCacheEntry) {
      const payload = respondWithPersistent(persistentCacheEntry, true);
      if (payload) {
        payload.data = await enrichCardsWithInvestmentData(payload.data);
        logger.info(`✅ Serving ${payload.data.length} stale cached cards (error fallback)`);
        return res.status(200).json(payload);
      }
    }

    res.status(502).json({
      error: 'Failed to fetch results from Pokemon TCG API',
      message: (error as Error).message,
    });
  }
});

export default router;
