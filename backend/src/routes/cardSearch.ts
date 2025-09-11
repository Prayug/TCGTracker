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
  getLocalCardsForQuery,
  mapLocalRowsToPokemonCards,
} from '../services/cardDatabase';
import { getPopulationCounts } from '../services/populationService';
import { getCardMappingImages } from '../services/cardImageBackfillService';
import { enrichCardsWithInvestmentData } from '../services/cardEnrichment';

const router = Router();

const parsePrices = (value?: string | null): Record<string, { market?: number }> | undefined => {
  if (!value) {
    return undefined;
  }
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
};

const extractMarketPriceFromVariants = (
  prices?: Record<string, { market?: number }>
): number | null => {
  if (!prices) {
    return null;
  }

  const preferredOrder = ['normal', 'holofoil', 'reverseHolofoil', '1stEditionHolofoil'];
  for (const key of preferredOrder) {
    const value = prices[key]?.market;
    if (typeof value === 'number' && value > 0) {
      return value;
    }
  }

  for (const entry of Object.values(prices)) {
    if (typeof entry?.market === 'number' && entry.market > 0) {
      return entry.market;
    }
  }

  return null;
};

const mapCatalogRowsToPokemonCards = (rows: any[]) => {
  const seen = new Map<string, any>();

  for (const row of rows) {
    if (!row.cardId || seen.has(row.cardId)) continue;

    const parsedPrices = parsePrices(row.tcgplayerPrices);
    const derivedMarketPrice =
      typeof row.latestPrice === 'number' ? row.latestPrice : extractMarketPriceFromVariants(parsedPrices);

    seen.set(row.cardId, {
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
      tcgplayer: row.tcgplayerProductId
        ? {
            productId: row.tcgplayerProductId,
            prices: parsedPrices,
          }
        : undefined,
      marketPrice: typeof derivedMarketPrice === 'number' ? derivedMarketPrice : 0,
      source: 'catalog_sync',
    });
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

    const db = getDb();
    const searchLimit = Math.min(parseInt(limit as string) || 100, 250);

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
        ph.marketPrice as latestPrice
      FROM catalog_cards cc
      LEFT JOIN (
        SELECT cm.cardId, ph.marketPrice
        FROM price_history ph
        JOIN card_mappings cm ON cm.uniqueIdentifier = ph.uniqueIdentifier
        WHERE (ph.productId, ph.date, ph.subTypeName, ph.source) IN (
          SELECT productId, MAX(date), subTypeName, source
          FROM price_history
          GROUP BY productId, subTypeName, source
        )
      ) ph ON cc.cardId = ph.cardId
      WHERE cc.cardName LIKE ?
    `;
    
    const params: any[] = [`%${query}%`];

    if (setId && typeof setId === 'string') {
      sql += ' AND (cc.setId = ? OR cc.setName LIKE ?)';
      params.push(setId, `%${setId}%`);
    }

    sql += ` ORDER BY cc.cardName ASC LIMIT ?`;
    params.push(searchLimit);

    db.all(sql, params, async (err, rows: any[]) => {
      if (err) {
        logger.error('Error searching cards:', err);
        return res.status(500).json({
          error: 'Database error',
          message: err.message
        });
      }

      let cards: any[] = mapCatalogRowsToPokemonCards(rows);
      if (cards.length === 0) {
        const imageColumns = await getImageColumnSelectFragment();
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
          ${setId && typeof setId === 'string' ? 'AND (cm.setId = ? OR cm.setName LIKE ?)' : ''}
          ORDER BY cm.cardName ASC
          LIMIT ?
        `;
        const fallbackParams: any[] = [`%${query}%`];
        if (setId && typeof setId === 'string') {
          fallbackParams.push(setId, `%${setId}%`);
        }
        fallbackParams.push(searchLimit);
        const fallbackRows = await new Promise<any[]>((resolve, reject) => {
          db.all(fallbackSql, fallbackParams, (fallbackErr, fallbackResult: any[]) => {
            if (fallbackErr) {
              reject(fallbackErr);
            } else {
              resolve(fallbackResult || []);
            }
          });
        });
        cards = await mapLocalRowsToPokemonCards(fallbackRows);
      }

      logger.info(`✅ Found ${cards.length} cards matching "${query}" from local database`);

      res.json({
        data: cards,
        count: cards.length,
        source: 'local_database'
      });
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

    return res.json(result);
  } catch (error) {
    return res.status(500).json({
      error: 'Failed to fetch population counts',
      message: (error as Error).message,
    });
  }
});

/**
 * Get a random pool of cards with latest market prices from local DB
 */
router.get('/pool', async (req, res) => {
  try {
    const db = getDb();

    const { limit = '250', minPrice = '1', maxPrice = '20000' } = req.query;
    const poolLimit = Math.min(parseInt(limit as string) || 250, 10000); // Increased max to 10000 for better pool diversity

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

    db.all(sql, [minPrice, maxPrice, ...exclusionParams, poolLimit], async (err, rows: any[]) => {
      if (err) {
        logger.error('Error fetching random card pool:', err);
        return res.status(500).json({
          error: 'Database error',
          message: err.message
        });
      }

      // Use the helper function to properly map cards with stored images
      const cards = await mapLocalRowsToPokemonCards(rows);

      res.json({
        data: cards,
        count: cards.length,
        source: 'local_database'
      });
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
      const cardName = card.name || '';
      const uniqueIdentifier = generateUniqueIdentifier(setIdNormalized, cardNumber, cardName);

      db.run(
        'UPDATE card_mappings SET rarity = ? WHERE uniqueIdentifier = ?',
        [card.rarity, uniqueIdentifier],
        (err) => {
          if (err) {
            logger.warn(`Failed to update rarity for ${cardName}:`, err);
          } else {
            logger.info(`✅ Updated rarity for ${cardName}: ${card.rarity}`);
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

export default router;

