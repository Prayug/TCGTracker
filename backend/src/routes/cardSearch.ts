import { Router } from 'express';
import { getDb } from '../db/database';
import { logger } from '../utils/logger';
import {
  pokemonApiClient,
  CardImageMatchResult,
} from '../services/pokemonApiClient';
import { generateUniqueIdentifier } from '../services/cardIdentifier';
import { setCodeService } from '../services/setCodeService';
import {
  cardImageCache,
  pokemonApiCache,
  CACHE_TTL,
  POKEMON_CACHE_TTL,
  POKEMON_PERSISTENT_CACHE_TTL,
  getPersistentPokemonCache,
  savePersistentPokemonCache,
  getCacheKey,
  PokemonPersistentCacheRow,
} from '../services/cardCache';
import { getImageColumnSelectFragment } from '../services/cardImageUtils';
import {
  getCatalogCardsForQuery,
  getLocalCardsForQuery,
  mapCatalogRowsToPokemonCards,
  mapLocalRowsToPokemonCards,
} from '../services/cardDatabase';
import { getPopulationCounts } from '../services/populationService';
import { getCardMappingImages } from '../services/cardImageBackfillService';
import { enrichCardsWithInvestmentData } from '../services/cardEnrichment';
import {
  getGradedPrices,
  getGradedPriceHistory,
  getAllGradedPriceHistory,
} from '../services/gradedPriceService';
import { recordGradedRequest } from '../services/gradedRefreshService';
import { dedupePackPoolCards } from '../utils/packPoolDedupe';
import {
  buildStratifiedPackPoolSql,
  packEraBandFromSet,
  stratifiedPoolSliceSizes,
  PACK_ERA_BANDS,
} from '../utils/packEraBand';

const router = Router();

/**
 * Read persisted card images from card_mappings (populated by the image backfill pipeline).
 */
router.get('/resolve-image', async (req, res) => {
  try {
    const { cardId, cardName, setId } = req.query;

    if (cardId && typeof cardId === 'string') {
      const stored = await getCardMappingImages(cardId);
      if (stored?.imageSmall || stored?.imageLarge) {
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

    const db = getDb();
    const row: any = await new Promise((resolve, reject) => {
      db.get(
        `SELECT imageSmall, imageLarge, cardNumber FROM card_mappings
         WHERE cardName = ? AND setId = ?
           AND (imageSmall IS NOT NULL OR imageLarge IS NOT NULL)
         LIMIT 1`,
        [cardName.trim(), setId.trim()],
        (err, result) => {
          if (err) reject(err);
          else resolve(result);
        }
      );
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
  } catch (error) {
    logger.error('Error reading card image:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: (error as Error).message,
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

    const searchLimit = Math.min(parseInt(limit as string) || 100, 250);
    const normalizedSetId =
      typeof setId === 'string' && setId.trim().length > 0 ? setId.trim() : undefined;

    let cards: any[] = mapCatalogRowsToPokemonCards(
      await getCatalogCardsForQuery(query, normalizedSetId, searchLimit)
    );

    if (cards.length === 0) {
      cards = await mapLocalRowsToPokemonCards(
        await getLocalCardsForQuery(query, normalizedSetId, searchLimit)
      );
    }

    logger.info(`✅ Found ${cards.length} cards matching "${query}" from local database`);

    res.json({
      data: cards,
      count: cards.length,
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

/**
 * Get all unique sets from local database, enriched with era, series, and logos
 */
router.get('/sets', async (req, res) => {
  try {
    const { getEnrichedSets } = await import('../services/setListService');
    const sets = await getEnrichedSets();

    res.json({
      data: sets,
      count: sets.length,
      source: 'catalog_sync_enriched',
    });
  } catch (error) {
    logger.error('Error fetching sets:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: (error as Error).message,
    });
  }
});

/**
 * Get card statistics
 */
router.get('/stats', async (req, res) => {
  try {
    const db = getDb();

    const sql = `
      SELECT 
        COUNT(DISTINCT cardName) as totalCards,
        COUNT(DISTINCT setId) as totalSets,
        COUNT(*) as totalEntries
      FROM card_mappings
    `;

    db.get(sql, [], (err, row: any) => {
      if (err) {
        logger.error('Error fetching stats:', err);
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

  } catch (error) {
    logger.error('Error fetching stats:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: (error as Error).message 
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

    const result = await getPopulationCounts({
      cardId: typeof cardId === 'string' ? cardId.trim() : undefined,
      cardName: cardName.trim(),
      setId: typeof setId === 'string' ? setId.trim() : undefined,
      setName: typeof setName === 'string' ? setName.trim() : undefined,
      cardNumber: typeof cardNumber === 'string' ? cardNumber.trim() : undefined,
      variant: typeof variant === 'string' ? variant.trim() : undefined,
    });

    if (result.cardId) {
      void recordGradedRequest({
        cardId: result.cardId,
        cardName: result.cardName,
        setId: result.setId,
        setName: result.setName,
        cardNumber: result.cardNumber,
      });
    }

    return res.json(result);
  } catch (error) {
    return res.status(500).json({
      error: 'Failed to fetch population counts',
      message: (error as Error).message,
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
    const db = getDb();

    const { limit = '250', minPrice = '0', maxPrice = '100000', includeSlabs } = req.query;
    const poolLimit = Math.min(parseInt(limit as string) || 250, 10000); // Increased max to 10000 for better pool diversity
    const withSlabs =
      includeSlabs === '1' ||
      includeSlabs === 'true' ||
      includeSlabs === 'yes';

    const imageColumns = await getImageColumnSelectFragment();

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
      'McDonald%',  // McDonald's promos
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
    const exclusionClauses: string[] = [];
    const exclusionParams: string[] = [];

    for (const setName of EXCLUDED_FAKE_SET_NAMES) {
      if (setName.includes('%')) {
        exclusionClauses.push('cm.setName NOT LIKE ?');
      } else {
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
    const sql = buildStratifiedPackPoolSql(imageColumns, exclusionSql);
    const { bulk, chase } = stratifiedPoolSliceSizes(poolLimit);
    const sliceLimits = PACK_ERA_BANDS.flatMap(() => [bulk, chase]);

    db.all(sql, [minPrice, maxPrice, ...exclusionParams, ...sliceLimits], async (err, rows: any[]) => {
      if (err) {
        logger.error('Error fetching random card pool:', err);
        return res.status(500).json({
          error: 'Database error',
          message: err.message
        });
      }

      try {
        // Use the helper function to properly map cards with stored images
        let cards = await mapLocalRowsToPokemonCards(rows);

        if (withSlabs && cards.length > 0) {
          const cardIds = [...new Set(cards.map((c: any) => c.id).filter(Boolean))] as string[];
          const psa10ByCardId = new Map<string, number>();
          const BATCH = 400;

          for (let i = 0; i < cardIds.length; i += BATCH) {
            const batch = cardIds.slice(i, i + BATCH);
            const placeholders = batch.map(() => '?').join(',');
            const gradedRows = await new Promise<
              Array<{ cardId: string; price: number }>
            >((resolve, reject) => {
              db.all(
                `SELECT cardId, price
                 FROM graded_prices
                 WHERE cardId IN (${placeholders})
                   AND grader = 'psa'
                   AND grade = '10'
                   AND verified = 1
                   AND price IS NOT NULL
                   AND price > 0`,
                batch,
                (gradedErr, result) => {
                  if (gradedErr) reject(gradedErr);
                  else resolve((result || []) as Array<{ cardId: string; price: number }>);
                }
              );
            });
            for (const gr of gradedRows) {
              if (typeof gr.price === 'number' && gr.price > 0) {
                psa10ByCardId.set(gr.cardId, gr.price);
              }
            }
          }

          cards = cards.map((card: any) => {
            const psa10Price = psa10ByCardId.get(card.id);
            return psa10Price != null ? { ...card, psa10Price } : card;
          });
        }

        cards = dedupePackPoolCards(cards).map((card) => ({
          ...card,
          eraBand: packEraBandFromSet(card.set),
        }));

        res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
        res.json({
          data: cards,
          count: cards.length,
          source: 'local_database',
          includeSlabs: withSlabs,
        });
      } catch (mapErr) {
        logger.error('Error mapping/enriching card pool:', mapErr);
        res.status(500).json({
          error: 'Internal server error',
          message: (mapErr as Error).message,
        });
      }
    });
  } catch (error) {
    logger.error('Error building card pool:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: (error as Error).message 
    });
  }
});


router.get('/pokemon', async (req, res) => {
  let persistentCacheEntry: PokemonPersistentCacheRow | null = null;
  let buildLocalFallbackResponse: (() => Promise<any | null>) | null = null;

  const respondWithPersistent = (entry: PokemonPersistentCacheRow, stale = false) => {
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
  };

  try {
    const { query, setId, pageSize = '250', fetchAll = 'true', maxPages = '4' } = req.query;

    if (!query || typeof query !== 'string' || query.trim().length < 2) {
      return res.status(400).json({
        error: 'Query parameter with at least 2 characters is required.',
      });
    }

    const sanitizedQuery = query.trim();
    const normalizedSetId =
      typeof setId === 'string' && setId.trim().length > 0 ? setId.trim() : undefined;
    const limit = Math.min(Math.max(parseInt(pageSize as string, 10) || 100, 1), 250);
    const shouldFetchAll = String(fetchAll).toLowerCase() !== 'false';
    const maxPagesToFetch = Math.min(Math.max(parseInt(maxPages as string, 10) || 4, 1), 10);

    buildLocalFallbackResponse = async () => {
      // Prefer catalog_cards (complete number + art) over raw TCGCSV mappings.
      // Mappings include sealed SKUs and rows with null cardNumber/images that
      // previously produced white SVG placeholders and "#—" in Browse.
      const catalogRows = await getCatalogCardsForQuery(
        sanitizedQuery,
        normalizedSetId,
        limit
      ).catch((err) => {
        logger.error('Catalog fallback query failed', err);
        return [] as any[];
      });

      if (catalogRows.length > 0) {
        const cards = await enrichCardsWithInvestmentData(
          mapCatalogRowsToPokemonCards(catalogRows)
        );
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

      const rows = await getLocalCardsForQuery(sanitizedQuery, normalizedSetId, limit).catch(
        (err) => {
          logger.error('Local fallback query failed', err);
          return [] as any[];
        }
      );
      if (!rows || rows.length === 0) {
        return null;
      }
      const cards = await enrichCardsWithInvestmentData(await mapLocalRowsToPokemonCards(rows));
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

/**
 * Search Pokemon API for card images (proxy endpoint to avoid CORS)
 */
router.get('/search-pokemon', async (req, res) => {
  try {
    const { cardName, setId, cardNumber, setName } = req.query;

    if (!cardName || typeof cardName !== 'string') {
      return res.status(400).json({
        error: 'cardName query parameter is required',
      });
    }

    const cacheKey = getCacheKey(
      cardName,
      typeof setId === 'string' && setId.trim().length > 0
        ? setId
        : (setName as string) || 'unknown',
      cardNumber as string | undefined
    );

    const cached = cardImageCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      logger.info(`💾 Cache hit for ${cardName} from ${setId || setName || 'unknown set'}`);
      return res.json({
        card: cached.card,
        images: cached.images,
        id: cached.id,
        matchedSet: cached.matchedSet,
        matchedNumber: cached.matchedNumber,
        cached: true,
      });
    }

    const searchResult: CardImageMatchResult = await pokemonApiClient.findBestImageMatch({
      cardName,
      setId: typeof setId === 'string' ? setId.trim() : undefined,
      setName: typeof setName === 'string' ? setName.trim() : undefined,
      cardNumber: typeof cardNumber === 'string' ? cardNumber.trim() : undefined,
    });

    if (!searchResult.card || !searchResult.card.images?.small || !searchResult.card.images?.large) {
      return res.status(404).json({
        error: `Card not found or missing images`,
        searched: { cardName, setId, setName, cardNumber },
        attempts: searchResult.attempts,
        availableCards: searchResult.candidates.slice(0, 5).map((card) => ({
          name: card.name,
          set: card.set?.id,
          number: card.number,
        })),
      });
    }

    const responsePayload = {
      card: searchResult.card,
      images: {
        small: searchResult.card.images.small,
        large: searchResult.card.images.large,
      },
      id: searchResult.card.id,
      matchedSet: searchResult.card.set?.name,
      matchedNumber: searchResult.card.number,
      rarity: searchResult.card.rarity,
      cached: false,
      attempts: searchResult.attempts,
      usedFallback: searchResult.usedFallback,
    };

    cardImageCache.set(cacheKey, {
      ...responsePayload,
      timestamp: Date.now(),
    });

    logger.info(
      `✅ Matched card: ${searchResult.card.name} from ${searchResult.card.set?.name} (#${searchResult.card.number})`
    );

    // Update rarity in database if available
    if (searchResult.card?.rarity && searchResult.card.rarity.trim()) {
      const card = searchResult.card; // Store reference to avoid null checks in callback
      // We need to find the uniqueIdentifier for this card
      // Since we don't have it directly, we'll construct it based on setId, cardNumber, and cardName
      const db = getDb();
      const setIdNormalized = card.set?.id || '';
      const cardNumber = card.number || '';
      const resolvedCardName = card.name || '';
      const uniqueIdentifier = generateUniqueIdentifier(setIdNormalized, cardNumber, resolvedCardName);

      db.run(
        'UPDATE card_mappings SET rarity = ? WHERE uniqueIdentifier = ?',
        [card.rarity, uniqueIdentifier],
        (err) => {
          if (err) {
            logger.warn(`Failed to update rarity for ${resolvedCardName}:`, err);
          } else {
            logger.info(`Updated rarity for ${resolvedCardName}: ${card.rarity}`);
          }
        }
      );
    }

    res.json(responsePayload);
  } catch (error) {
    logger.error('Error searching Pokemon API:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: (error as Error).message,
    });
  }
});

/**
 * Refresh Pokemon TCG set mappings from API
 * This endpoint manually triggers a refresh of the set mappings cache
 */
router.post('/refresh-set-mappings', async (req, res) => {
  try {
    logger.info('🔄 Manual refresh of Pokemon TCG set mappings requested');

    const mappings = await setCodeService.refreshSetMappings();

    res.json({
      success: true,
      message: `Refreshed ${mappings.size} set mappings`,
      mappingsCount: mappings.size,
      source: 'pokemon_tcg_api'
    });
  } catch (error) {
    logger.error('❌ Failed to refresh set mappings:', error);
    res.status(500).json({
      error: 'Failed to refresh set mappings',
      message: (error as Error).message
    });
  }
});

/**
 * Get set mapping statistics
 */
router.get('/set-mappings/stats', async (req, res) => {
  try {
    const stats = await setCodeService.getSetMappingStats();

    res.json({
      totalMappingsInDb: stats.databaseMappings,
      cachedMappings: stats.cachedMappings,
      lastRefreshed: stats.lastRefreshed ? new Date(stats.lastRefreshed).toISOString() : null,
      cacheAge: stats.lastRefreshed ? Date.now() - stats.lastRefreshed : null,
      cacheTtl: stats.cacheTtl
    });
  } catch (error) {
    logger.error('Error fetching set mapping stats:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: (error as Error).message
    });
  }
});

router.get('/graded-prices', async (req, res) => {
  try {
    const { cardId, cardName, setId, setName, cardNumber } = req.query;

    if (!cardId || !cardName) {
      return res.status(400).json({ error: 'cardId and cardName are required' });
    }

    const result = await getGradedPrices(
      String(cardId),
      String(cardName),
      setId ? String(setId) : undefined,
      setName ? String(setName) : undefined,
      cardNumber ? String(cardNumber) : undefined
    );

    void recordGradedRequest({
      cardId: String(cardId),
      cardName: String(cardName),
      setId: setId ? String(setId) : undefined,
      setName: setName ? String(setName) : undefined,
      cardNumber: cardNumber ? String(cardNumber) : undefined,
    });

    res.json({ data: result });
  } catch (error: any) {
    logger.error('Graded prices lookup failed', { error: error.message });
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
      const all = await getAllGradedPriceHistory(cardId, safeDays);
      return res.json({ data: all });
    }

    const grader = String(req.query.grader);
    const grade = req.query.grade ? String(req.query.grade) : '10';
    const result = await getGradedPriceHistory(cardId, grader, grade, safeDays);
    res.json({ data: result });
  } catch (error: any) {
    logger.error('Graded price history lookup failed', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch graded price history' });
  }
});

router.get('/graded-spreads', async (req, res) => {
  try {
    const {
      getGradedSpreadsForCard,
      getTopGradedPremiums,
      getPsa10SpreadsForCards,
    } = await import('../services/gradedSpreadService');
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
    const tradeableOnly =
      String(req.query.tradeableOnly || '') === '1' ||
      String(req.query.tradeableOnly || '').toLowerCase() === 'true';
    const top = await getTopGradedPremiums(limit, { tradeableOnly });
    res.json({ data: top, count: top.length });
  } catch (error: any) {
    logger.error('Graded spreads lookup failed', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch graded spreads' });
  }
});

router.get('/graded-premium-movers', async (req, res) => {
  try {
    const { getTopPremiumMovers } = await import('../services/gradedSpreadService');
    const days = Math.min(parseInt(String(req.query.days || '30'), 10) || 30, 90);
    const limit = Math.min(parseInt(String(req.query.limit || '12'), 10) || 12, 50);
    const movers = await getTopPremiumMovers({ days, limit });
    res.json({ data: movers, count: movers.length, days });
  } catch (error: any) {
    logger.error('Graded premium movers lookup failed', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch premium movers' });
  }
});

router.get('/cross-grader-arbs', async (req, res) => {
  try {
    const { getCrossGraderArbs } = await import('../services/gradedSpreadService');
    const limit = Math.min(parseInt(String(req.query.limit || '12'), 10) || 12, 50);
    const rows = await getCrossGraderArbs(limit);
    res.json({ data: rows, count: rows.length });
  } catch (error: any) {
    logger.error('Cross-grader arb lookup failed', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch cross-grader arbs' });
  }
});

/**
 * Cards most worth submitting for a PSA 10: high slab premium × easy gem rate.
 * Optional ?cardIds=a,b,c (or POST body) scopes to a vault / subset.
 */
const parseCsvParam = (value: unknown): string[] | undefined => {
  if (value == null || value === '') return undefined;
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
    const { getGradeWorthinessLeaderboard, parseGradeWorthinessSort } = await import(
      '../services/gradeWorthinessService'
    );
    const limit = Math.min(parseInt(String(req.query.limit || '40'), 10) || 40, 200);
    const result = await getGradeWorthinessLeaderboard({
      limit,
      cardIds: parseCsvParam(req.query.cardIds),
      eras: parseCsvParam(req.query.eras),
      setIds: parseCsvParam(req.query.setIds),
      sort: parseGradeWorthinessSort(req.query.sort),
    });
    res.json({ data: result });
  } catch (error: any) {
    logger.error('Grade worthiness lookup failed', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch grade worthiness' });
  }
});

router.post('/grade-worthiness', async (req, res) => {
  try {
    const { getGradeWorthinessLeaderboard, parseGradeWorthinessSort } = await import(
      '../services/gradeWorthinessService'
    );
    const limit = Math.min(
      parseInt(String(req.query.limit || req.body?.limit || '40'), 10) || 40,
      200
    );
    const result = await getGradeWorthinessLeaderboard({
      limit,
      cardIds: parseCsvParam(req.body?.cardIds),
      eras: parseCsvParam(req.body?.eras ?? req.query.eras),
      setIds: parseCsvParam(req.body?.setIds ?? req.query.setIds),
      sort: parseGradeWorthinessSort(req.body?.sort ?? req.query.sort),
    });
    res.json({ data: result });
  } catch (error: any) {
    logger.error('Grade worthiness lookup failed', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch grade worthiness' });
  }
});

/**
 * Submit vs buy PSA 10 decision engine.
 */
router.get('/submit-vs-buy', async (req, res) => {
  try {
    const { getSubmitVsBuyLeaderboard } = await import('../services/slabInsightsService');
    const limit = Math.min(parseInt(String(req.query.limit || '20'), 10) || 20, 100);
    const result = await getSubmitVsBuyLeaderboard({
      limit,
      cardIds: parseCsvParam(req.query.cardIds),
    });
    res.json({ data: result });
  } catch (error: any) {
    logger.error('Submit vs buy lookup failed', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch submit vs buy' });
  }
});

router.post('/submit-vs-buy', async (req, res) => {
  try {
    const { getSubmitVsBuyLeaderboard } = await import('../services/slabInsightsService');
    const limit = Math.min(
      parseInt(String(req.query.limit || req.body?.limit || '20'), 10) || 20,
      100
    );
    const result = await getSubmitVsBuyLeaderboard({
      limit,
      cardIds: parseCsvParam(req.body?.cardIds ?? req.query.cardIds),
    });
    res.json({ data: result });
  } catch (error: any) {
    logger.error('Submit vs buy lookup failed', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch submit vs buy' });
  }
});

/** Set-level slab heatmap / regime map */
router.get('/set-slab-heatmap', async (req, res) => {
  try {
    const { getSetSlabHeatmap } = await import('../services/slabInsightsService');
    const limit = Math.min(parseInt(String(req.query.limit || '40'), 10) || 40, 100);
    const minCards = Math.min(parseInt(String(req.query.minCards || '3'), 10) || 3, 50);
    const result = await getSetSlabHeatmap({ limit, minCards });
    res.json({ data: result });
  } catch (error: any) {
    logger.error('Set slab heatmap failed', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch set slab heatmap' });
  }
});

/** Population regime / pop-report radar */
router.get('/pop-regime', async (req, res) => {
  try {
    const { getPopRegimeRadar } = await import('../services/slabInsightsService');
    const days = Math.min(parseInt(String(req.query.days || '30'), 10) || 30, 90);
    const limit = Math.min(parseInt(String(req.query.limit || '20'), 10) || 20, 50);
    const result = await getPopRegimeRadar({ days, limit });
    res.json({ data: result });
  } catch (error: any) {
    logger.error('Pop regime radar failed', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch pop regime' });
  }
});

/** Full grade-ladder economics */
router.get('/grade-ladder', async (req, res) => {
  try {
    const { getGradeLadderLeaderboard } = await import('../services/slabInsightsService');
    const limit = Math.min(parseInt(String(req.query.limit || '15'), 10) || 15, 50);
    const result = await getGradeLadderLeaderboard({
      limit,
      cardIds: parseCsvParam(req.query.cardIds),
    });
    res.json({ data: result });
  } catch (error: any) {
    logger.error('Grade ladder lookup failed', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch grade ladder' });
  }
});

/** Crack-and-regrade EV scanner */
router.get('/crack-regrade', async (req, res) => {
  try {
    const { getCrackRegradeScanner } = await import('../services/slabInsightsService');
    const limit = Math.min(parseInt(String(req.query.limit || '12'), 10) || 12, 50);
    const result = await getCrackRegradeScanner(limit);
    res.json({ data: result });
  } catch (error: any) {
    logger.error('Crack-regrade scanner failed', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch crack-regrade opportunities' });
  }
});

/** Mark-to-market for owned slab book lots */
router.post('/slab-marks', async (req, res) => {
  try {
    const { getSlabMarksForLots } = await import('../services/slabInsightsService');
    const lots = Array.isArray(req.body?.lots) ? req.body.lots : [];
    const normalized = lots
      .map((l: any) => ({
        cardId: String(l?.cardId || '').trim(),
        grader: String(l?.grader || 'PSA').trim(),
        grade: String(l?.grade || '10').trim(),
      }))
      .filter((l: { cardId: string }) => l.cardId);
    const marks = await getSlabMarksForLots(normalized);
    res.json({ data: marks, count: marks.length });
  } catch (error: any) {
    logger.error('Slab marks lookup failed', { error: error.message });
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
    const { runGradedRefresh, runAllCardsRefresh } = await import('../services/gradedRefreshService');
    const { withDbJobLock } = await import('../utils/dbJobLock');
    const limit = Math.min(parseInt(String(req.query.limit || '50'), 10) || 50, 200);
    const all = String(req.query.all || '') === '1';
    const result = await withDbJobLock(
      'graded-refresh',
      () => (all ? runAllCardsRefresh({ limit, delayMs: 1000 }) : runGradedRefresh(limit)),
      { skipIfBusy: true }
    );
    res.json({ data: result });
  } catch (error: any) {
    logger.error('Graded data refresh failed', { error: error.message });
    res.status(500).json({ error: 'Failed to refresh graded data' });
  }
});

export default router;

