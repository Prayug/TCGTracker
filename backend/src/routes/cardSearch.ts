import { Router } from 'express';
import { getDb } from '../db/database';
import { env } from '../config/env';

const router = Router();

// In-memory cache for Pokemon TCG API card searches
// This prevents repeated API calls for the same card
interface CachedCard {
  card: any;
  images: { small: string; large: string };
  id: string;
  matchedSet: string;
  matchedNumber: string;
  timestamp: number;
}

const cardImageCache = new Map<string, CachedCard>();
const CACHE_TTL = 1000 * 60 * 60 * 24; // 24 hours

interface PokemonApiCacheEntry {
  data: any[];
  totalCount: number;
  fetchedAt: number;
  pageSize: number;
  pagesFetched: number;
}

const pokemonApiCache = new Map<string, PokemonApiCacheEntry>();
const POKEMON_CACHE_TTL = 1000 * 60 * 5; // 5 minutes


const POKEMON_PERSISTENT_CACHE_TTL = 1000 * 60 * 60 * 6; // 6 hours

interface PokemonPersistentCacheRow {
  cacheKey: string;
  query: string | null;
  setId: string | null;
  pageSize: number;
  fetchAll: number;
  maxPages: number;
  data: string;
  totalCount: number;
  pagesFetched: number;
  fetchedAt: number;
}

const getPersistentPokemonCache = (cacheKey: string): Promise<PokemonPersistentCacheRow | null> => {
  const db = getDb();
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT cacheKey, query, setId, pageSize, fetchAll, maxPages, data, totalCount, pagesFetched, fetchedAt
       FROM pokemon_cache
       WHERE cacheKey = ?`,
      [cacheKey],
      (err, row: PokemonPersistentCacheRow | null) => {
        if (err) {
          reject(err);
        } else {
          resolve(row || null);
        }
      }
    );
  });
};

const savePersistentPokemonCache = (
  cacheKey: string,
  entry: {
    query: string;
    setId?: string;
    pageSize: number;
    fetchAll: boolean;
    maxPages: number;
    data: any[];
    totalCount: number;
    pagesFetched: number;
    fetchedAt: number;
  }
): Promise<void> => {
  const db = getDb();
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT OR REPLACE INTO pokemon_cache
        (cacheKey, query, setId, pageSize, fetchAll, maxPages, data, totalCount, pagesFetched, fetchedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        cacheKey,
        entry.query,
        entry.setId || null,
        entry.pageSize,
        entry.fetchAll ? 1 : 0,
        entry.maxPages,
        JSON.stringify(entry.data),
        entry.totalCount,
        entry.pagesFetched,
        entry.fetchedAt
      ],
      (err) => {
        if (err) {
          return reject(err);
        }
        resolve();
      }
    );
  });
};

const buildPlaceholderImage = (name: string, set: string) => (
  'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="245" height="342" viewBox="0 0 245 342"%3E%3Crect width="245" height="342" fill="%23f3f4f6" rx="12"/%3E%3Ctext x="50%25" y="45%25" font-family="Arial,sans-serif" font-size="16" fill="%239ca3af" text-anchor="middle"%3E' +
  encodeURIComponent(name) + '%3C/text%3E%3Ctext x="50%25" y="55%25" font-family="Arial,sans-serif" font-size="14" fill="%23d1d5db" text-anchor="middle"%3E' +
  encodeURIComponent(set) + '%3C/text%3E%3Ctext x="50%25" y="65%25" font-family="Arial,sans-serif" font-size="12" fill="%23e5e7eb" text-anchor="middle"%3ENo Image%3C/text%3E%3C/svg%3E'
);

const buildDeterministicImageUrls = (setId?: string | null, cardNumber?: string | null) => {
  if (!setId || !cardNumber) {
    return null;
  }
  const trimmedSet = setId.trim();
  const baseNumber = cardNumber.split('/')[0].trim();
  if (!trimmedSet || !baseNumber) {
    return null;
  }
  const sanitizedNumber = baseNumber.replace(/\s+/g, '').toLowerCase();
  const normalizedSet = trimmedSet.toLowerCase();
  const baseUrl = `https://images.pokemontcg.io/${normalizedSet}/${sanitizedNumber}`;
  return {
    small: `${baseUrl}.png`,
    large: `${baseUrl}_hires.png`,
  };
};

const getLocalCardsForQuery = async (query: string, setId?: string, limit: number = 250) => {
  const db = getDb();
  const likeQuery = `%${query}%`;
  const params: any[] = [likeQuery];
  let whereClause = 'cm.cardName LIKE ?';

  if (setId) {
    whereClause += ' AND (cm.setId = ? OR cm.setName LIKE ?)' ;
    params.push(setId, `%${setId}%`);
  }

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
    WHERE ${whereClause}
    ORDER BY cm.cardName ASC
    LIMIT ?
  `;

  params.push(limit);

  return new Promise<any[]>((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) {
        return reject(err);
      }
      resolve(rows || []);
    });
  });
};

const mapLocalRowsToPokemonCards = (rows: any[]) => {
  return rows.map(row => {
    const deterministicImages = buildDeterministicImageUrls(row.setId, row.cardNumber);
    const placeholder = buildPlaceholderImage(row.cardName, row.setName);
    const images = deterministicImages || { small: placeholder, large: placeholder };

    return {
      id: row.cardId || `${row.setId}-${row.cardNumber || 'na'}`,
      name: row.cardName,
      number: row.cardNumber,
      rarity: row.rarity,
      set: {
        id: row.setId,
        name: row.setName,
        releaseDate: '2020-01-01',
        total: 100
      },
      images,
      tcgplayer: row.latestPrice ? {
        productId: row.tcgplayerProductId,
        prices: {
          normal: { market: row.latestPrice }
        }
      } : undefined,
      marketPrice: row.latestPrice || 0,
      uniqueIdentifier: row.uniqueIdentifier,
      isLocalDbCard: true,
      source: 'local_database'
    };
  });
};

// Helper to generate cache key
const getCacheKey = (cardName: string, setId: string, cardNumber?: string): string => {
  return `${cardName}|${setId}|${cardNumber || 'none'}`.toLowerCase();
};

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
      SELECT DISTINCT
        cm.cardId,
        cm.cardName,
        cm.setId,
        cm.setName,
        cm.cardNumber,
        cm.rarity,
        cm.tcgplayerProductId,
        cm.uniqueIdentifier,
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
    
    const params: any[] = [`%${query}%`];

    if (setId && typeof setId === 'string') {
      sql += ' AND (cm.setId = ? OR cm.setName LIKE ?)';
      params.push(setId, `%${setId}%`);
    }

    sql += ` ORDER BY cm.cardName ASC LIMIT ?`;
    params.push(searchLimit);

    db.all(sql, params, (err, rows: any[]) => {
      if (err) {
        console.error('Error searching cards:', err);
        return res.status(500).json({ 
          error: 'Database error',
          message: err.message 
        });
      }

      // Transform to Pokemon TCG API compatible format
      const cards = rows.map(row => {
        // Use a placeholder image for local database cards (no Pokemon TCG API images)
        const placeholderImage = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="245" height="342" viewBox="0 0 245 342"%3E%3Crect width="245" height="342" fill="%23f3f4f6" rx="12"/%3E%3Ctext x="50%25" y="45%25" font-family="Arial,sans-serif" font-size="16" fill="%239ca3af" text-anchor="middle"%3E' + encodeURIComponent(row.cardName) + '%3C/text%3E%3Ctext x="50%25" y="55%25" font-family="Arial,sans-serif" font-size="14" fill="%23d1d5db" text-anchor="middle"%3E' + encodeURIComponent(row.setName) + '%3C/text%3E%3Ctext x="50%25" y="65%25" font-family="Arial,sans-serif" font-size="12" fill="%23e5e7eb" text-anchor="middle"%3ENo Image%3C/text%3E%3C/svg%3E';
        
        return {
          id: row.cardId || `${row.setId}-${row.cardNumber}`,
          name: row.cardName,
          number: row.cardNumber,
          rarity: row.rarity,
          set: {
            id: row.setId,
            name: row.setName,
            releaseDate: '2020-01-01', // Default date
            total: 100
          },
          images: {
            small: placeholderImage,
            large: placeholderImage
          },
          tcgplayer: {
            productId: row.tcgplayerProductId,
            prices: row.latestPrice ? {
              normal: { market: row.latestPrice }
            } : undefined
          },
          marketPrice: row.latestPrice || 0,
          uniqueIdentifier: row.uniqueIdentifier,
          isLocalDbCard: true // Flag to indicate this is from local DB
        };
      });

      console.log(`✅ Found ${cards.length} cards matching "${query}" from local database`);

      res.json({
        data: cards,
        count: cards.length,
        source: 'local_database'
      });
    });

  } catch (error) {
    console.error('Error in card search:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: (error as Error).message 
    });
  }
});

/**
 * Get all unique sets from local database
 */
router.get('/sets', async (req, res) => {
  try {
    const db = getDb();

    const sql = `
      SELECT DISTINCT 
        setId as id,
        setName as name,
        COUNT(*) as total
      FROM card_mappings
      GROUP BY setId, setName
      ORDER BY setName ASC
    `;

    db.all(sql, [], (err, rows: any[]) => {
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

  } catch (error) {
    console.error('Error fetching sets:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: (error as Error).message 
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

  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: (error as Error).message 
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
    const poolLimit = Math.min(parseInt(limit as string) || 250, 5000); // Increased max to 5000

    // Select random cards with their latest market price from price_history
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
      ORDER BY RANDOM()
      LIMIT ?
    `;

    db.all(sql, [minPrice, maxPrice, poolLimit], (err, rows: any[]) => {
      if (err) {
        console.error('Error fetching random card pool:', err);
        return res.status(500).json({ 
          error: 'Database error',
          message: err.message 
        });
      }

      const placeholder = (name: string, set: string) => (
        'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="245" height="342" viewBox="0 0 245 342"%3E%3Crect width="245" height="342" fill="%23f3f4f6" rx="12"/%3E%3Ctext x="50%25" y="45%25" font-family="Arial,sans-serif" font-size="16" fill="%239ca3af" text-anchor="middle"%3E' +
        encodeURIComponent(name) + '%3C/text%3E%3Ctext x="50%25" y="55%25" font-family="Arial,sans-serif" font-size="14" fill="%23d1d5db" text-anchor="middle"%3E' +
        encodeURIComponent(set) + '%3C/text%3E%3Ctext x="50%25" y="65%25" font-family="Arial,sans-serif" font-size="12" fill="%23e5e7eb" text-anchor="middle"%3ENo Image%3C/text%3E%3C/svg%3E'
      );

      const cards = rows.map(row => ({
        id: row.cardId || `${row.setId}-${row.cardNumber}`,
        name: row.cardName,
        number: row.cardNumber,
        rarity: row.rarity,
        set: {
          id: row.setId,
          name: row.setName,
          releaseDate: '2020-01-01',
          total: 100
        },
        images: {
          small: placeholder(row.cardName, row.setName),
          large: placeholder(row.cardName, row.setName)
        },
        tcgplayer: {
          productId: row.tcgplayerProductId,
          prices: row.latestPrice ? {
            normal: { market: row.latestPrice }
          } : undefined
        },
        marketPrice: row.latestPrice || 0,
        uniqueIdentifier: row.uniqueIdentifier,
        isLocalDbCard: true
      }));

      res.json({
        data: cards,
        count: cards.length,
        source: 'local_database'
      });
    });
  } catch (error) {
    console.error('Error building card pool:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: (error as Error).message 
    });
  }
});


router.get('/pokemon', async (req, res) => {
  let persistentCacheEntry: PokemonPersistentCacheRow | null = null;
  let buildLocalFallbackResponse: (() => Promise<any | null>) | null = null;
  const respondWithPersistent = (entry: PokemonPersistentCacheRow, stale: boolean = false) => {
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
        stale
      };
    } catch (parseError) {
      console.error('Failed to parse cached pokemon data', parseError);
      return null;
    }
  };

  try {
    const { query, setId, pageSize = '250', fetchAll = 'true', maxPages = '4' } = req.query;

    if (!query || typeof query !== 'string' || query.trim().length < 2) {
      return res.status(400).json({
        error: 'Query parameter with at least 2 characters is required.'
      });
    }

    const sanitizedQuery = query.trim();
    const limit = Math.min(Math.max(parseInt(pageSize as string, 10) || 100, 1), 250);
    const shouldFetchAll = String(fetchAll).toLowerCase() !== 'false';
    const maxPagesToFetch = Math.min(Math.max(parseInt(maxPages as string, 10) || 4, 1), 10);
    const normalizedSetId = typeof setId === 'string' ? setId.trim() : undefined;

    buildLocalFallbackResponse = async () => {
      const rows = await getLocalCardsForQuery(sanitizedQuery, normalizedSetId, limit).catch((err) => {
        console.error('Local fallback query failed', err);
        return [] as any[];
      });
      if (!rows || rows.length === 0) {
        return null;
      }
      const cards = mapLocalRowsToPokemonCards(rows);
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
      typeof setId === 'string' ? setId.toLowerCase() : '',
      shouldFetchAll ? 'all' : 'page',
      limit,
      maxPagesToFetch
    ].join('|');

    const inMemory = pokemonApiCache.get(cacheKey);
    const now = Date.now();
    if (inMemory && now - inMemory.fetchedAt < POKEMON_CACHE_TTL) {
      return res.json({
        data: inMemory.data,
        totalCount: inMemory.totalCount,
        pageSize: inMemory.pageSize,
        pagesFetched: inMemory.pagesFetched,
        cached: true,
        source: 'pokemon_tcg_api'
      });
    }

    persistentCacheEntry = await getPersistentPokemonCache(cacheKey).catch((err) => {
      console.error('Error reading persistent pokemon cache', err);
      return null;
    });

    if (persistentCacheEntry && now - (persistentCacheEntry.fetchedAt || 0) < POKEMON_PERSISTENT_CACHE_TTL) {
      const payload = respondWithPersistent({ ...persistentCacheEntry, pageSize: persistentCacheEntry.pageSize || limit });
      if (payload) {
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

    const headers: HeadersInit = {
      'Accept': 'application/json',
    };

    if (env.apis.pokemonTcg) {
      headers['X-Api-Key'] = env.apis.pokemonTcg;
    }

    const buildQuery = () => {
      const parts = [`name:*${sanitizedQuery}*`];
      if (setId && typeof setId === 'string' && setId.trim().length > 0) {
        parts.push(`set.id:${setId.trim()}`);
      }
      return parts.join(' ');
    };

    const fetchPage = async (page: number): Promise<{ cards: any[]; totalCount: number }> => {
      const url = new URL('https://api.pokemontcg.io/v2/cards');
      url.searchParams.append('page', page.toString());
      url.searchParams.append('pageSize', limit.toString());
      url.searchParams.append('q', buildQuery());

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000); // Increased to 30 seconds

      try {
        const response = await fetch(url.toString(), {
          headers,
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (!response.ok) {
          const retryable = [429, 500, 502, 503, 504].includes(response.status);
          if (retryable) {
            throw new Error(`Retryable error ${response.status}`);
          }
          throw new Error(`Pokemon API request failed: ${response.status} ${response.statusText}`);
        }

        const json = await response.json();
        return {
          cards: Array.isArray(json?.data) ? json.data : [],
          totalCount: typeof json?.totalCount === 'number' ? json.totalCount : json?.total ?? 0,
        };
      } catch (error) {
        clearTimeout(timeout);
        throw error;
      }
    };

    const results: any[] = [];
    let totalCount = 0;
    let currentPage = 1;
    let pagesFetched = 0;
    let consecutiveErrors = 0;

    while (true) {
      try {
        const { cards, totalCount: countFromApi } = await fetchPage(currentPage);
        pagesFetched += 1;
        consecutiveErrors = 0;

        if (cards.length > 0) {
          results.push(...cards);
        }

        if (totalCount === 0 && countFromApi > 0) {
          totalCount = countFromApi;
        }

        if (!shouldFetchAll || cards.length < limit || pagesFetched >= maxPagesToFetch) {
          break;
        }

        currentPage += 1;
      } catch (error) {
        consecutiveErrors += 1;
        const errorMsg = (error as Error).message;
        
        console.warn(`⚠️ Pokemon API page ${currentPage} failed (attempt ${consecutiveErrors}/3):`, errorMsg);
        
        if (consecutiveErrors > 2) {
          console.error('❌ Failed to fetch Pokemon API after 3 attempts', {
            query: sanitizedQuery,
            page: currentPage,
            error: errorMsg,
          });
          break;
        }

        const backoff = 2000 * consecutiveErrors; // 2s, 4s
        console.log(`⏳ Retrying in ${backoff}ms...`);
        await new Promise(resolve => setTimeout(resolve, backoff));
      }
    }

    const uniqueCards = Array.from(new Map(results.map(card => [card.id, card])).values());

    if (uniqueCards.length === 0) {
      console.warn(`⚠️ No cards from Pokemon API for query "${sanitizedQuery}", trying fallbacks...`);
      
      if (buildLocalFallbackResponse) {
        const localPayload = await buildLocalFallbackResponse();
        if (localPayload) {
          console.log(`✅ Serving ${localPayload.data.length} cards from local database fallback`);
          return res.json(localPayload);
        }
      }

      if (persistentCacheEntry) {
        const payload = respondWithPersistent({ ...persistentCacheEntry, pageSize: persistentCacheEntry.pageSize || limit }, true);
        if (payload) {
          console.log(`✅ Serving ${payload.data.length} stale cached cards as fallback`);
          return res.json(payload);
        }
      }
      
      console.error(`❌ No cards found for query "${sanitizedQuery}" from any source`);
      return res.status(404).json({
        error: 'No cards found',
        query: sanitizedQuery,
        source: 'none'
      });
    }

    const payload = {
      data: uniqueCards,
      totalCount: totalCount || uniqueCards.length,
      pageSize: limit,
      pagesFetched,
      cached: false,
      source: 'pokemon_tcg_api'
    };

    pokemonApiCache.set(cacheKey, {
      data: uniqueCards,
      totalCount: payload.totalCount,
      fetchedAt: Date.now(),
      pageSize: limit,
      pagesFetched,
    });

    try {
      await savePersistentPokemonCache(cacheKey, {
        query: sanitizedQuery,
        setId: typeof setId === 'string' ? setId.trim() : undefined,
        pageSize: limit,
        fetchAll: shouldFetchAll,
        maxPages: maxPagesToFetch,
        data: uniqueCards,
        totalCount: payload.totalCount,
        pagesFetched,
        fetchedAt: Date.now(),
      });
    } catch (cacheError) {
      console.warn('Failed to persist pokemon search cache', cacheError);
    }

    console.log(`✅ Successfully fetched ${uniqueCards.length} cards for "${sanitizedQuery}" from Pokemon API`);
    res.json(payload);
  } catch (error) {
    console.error('❌ Error proxying Pokemon API search:', error);
    
    // Try local database fallback first
    if (buildLocalFallbackResponse) {
      try {
        const localPayload = await buildLocalFallbackResponse();
        if (localPayload) {
          console.log(`✅ Serving ${localPayload.data.length} cards from local database (error fallback)`);
          return res.status(200).json(localPayload);
        }
      } catch (fallbackErr) {
        console.warn('Local fallback also failed:', fallbackErr);
      }
    }
    
    // Try stale cache as last resort
    if (persistentCacheEntry) {
      const payload = respondWithPersistent(persistentCacheEntry, true);
      if (payload) {
        console.log(`✅ Serving ${payload.data.length} stale cached cards (error fallback)`);
        return res.status(200).json(payload);
      }
    }
    
    console.error('❌ All fallback options exhausted');
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
        error: 'cardName query parameter is required' 
      });
    }

    const hasSetId = typeof setId === 'string' && setId.trim().length > 0;
    const hasSetName = typeof setName === 'string' && setName.trim().length > 0;

    // setId/setName is optional now - if not provided, search across all sets
    // This is useful when the database has incorrect set IDs

    // Check cache first
    const cacheKey = getCacheKey(
      cardName,
      hasSetId ? (setId as string) : ((setName as string) || 'unknown'),
      cardNumber as string | undefined
    );
    const cached = cardImageCache.get(cacheKey);
    
    if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
      console.log(`💾 Cache hit for ${cardName} from ${setId || setName || 'unknown set'}`);
      return res.json({
        card: cached.card,
        images: cached.images,
        id: cached.id,
        matchedSet: cached.matchedSet,
        matchedNumber: cached.matchedNumber,
        cached: true
      });
    }

    const pokemonApiUrl = 'https://api.pokemontcg.io/v2/cards';
    const apiKey = env.apis.pokemonTcg;
    const headers: HeadersInit = {
      'Accept': 'application/json',
    };
    if (apiKey) {
      headers['X-Api-Key'] = apiKey;
    }
    
    // Helper to fetch with timeout
    const fetchWithTimeout = async (url: string, timeoutMs: number = 10000): Promise<Response> => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      
      try {
        const response = await fetch(url, { 
          headers,
          signal: controller.signal 
        });
        clearTimeout(timeout);
        return response;
      } catch (error) {
        clearTimeout(timeout);
        throw error;
      }
    };

    // Normalize the card number for better matching
    const normalizeCardNumber = (num: string | undefined): string => {
      if (!num) return '';
      // Take only the part before the slash (e.g., "188/132" → "188")
      const beforeSlash = num.split('/')[0].trim();
      // Remove leading zeros, convert to lowercase, remove special chars except letters and numbers
      return beforeSlash.toLowerCase().replace(/^0+/, '').replace(/[^a-z0-9]/g, '');
    };

    const normalizedRequestNumber = normalizeCardNumber(cardNumber as string | undefined);
    const effectiveSetId = hasSetId ? (setId as string) : '';
    const effectiveSetName = hasSetName ? (setName as string) : '';

    // AGGRESSIVE PARALLEL SEARCH - Try ALL strategies at once with SHORT timeouts!
    let cards: any[] = [];
    let searchAttempts: string[] = [];

    try {
      const searchPromises: Promise<any>[] = [];
      
      // STRATEGY 1: Exact name + set + number (if we have number)
      if (cardNumber) {
        const beforeSlash = String(cardNumber).split('/')[0].trim();
        const url1 = new URL(pokemonApiUrl);
        // DON'T use quotes around name - Pokemon API doesn't like them!
        const setFilterExact = hasSetId ? ` set.id:${effectiveSetId}` : '';
        url1.searchParams.append('q', `name:${cardName}${setFilterExact} number:${beforeSlash}`);
        url1.searchParams.append('pageSize', '5');
        
        searchPromises.push(
          fetchWithTimeout(url1.toString(), 3000)
            .then(r => r.ok ? r.json() : null)
            .then(data => ({ strategy: 'exact+set+num', data: data?.data || [] }))
            .catch(() => ({ strategy: 'exact+set+num', data: [] }))
        );
        
        // STRATEGY 2: Name + number ONLY (ignore set - for when set ID is wrong!)
        const url2 = new URL(pokemonApiUrl);
        url2.searchParams.append('q', `name:${cardName} number:${beforeSlash}`);
        url2.searchParams.append('pageSize', '10');
        
        searchPromises.push(
          fetchWithTimeout(url2.toString(), 3000)
            .then(r => r.ok ? r.json() : null)
            .then(data => ({ strategy: 'name+num', data: data?.data || [] }))
            .catch(() => ({ strategy: 'name+num', data: [] }))
        );
      }
      
      // STRATEGY 3: Name + set (no number)
      if (hasSetId) {
        const url3 = new URL(pokemonApiUrl);
        url3.searchParams.append('q', `name:${cardName} set.id:${effectiveSetId}`);
        url3.searchParams.append('pageSize', '10');
        
        searchPromises.push(
          fetchWithTimeout(url3.toString(), 3000)
            .then(r => r.ok ? r.json() : null)
            .then(data => ({ strategy: 'name+set', data: data?.data || [] }))
            .catch(() => ({ strategy: 'name+set', data: [] }))
        );
      }

      if (effectiveSetName) {
        const urlSetName = new URL(pokemonApiUrl);
        const sanitizedSetName = effectiveSetName.replace(/"/g, '');
        urlSetName.searchParams.append('q', `name:${cardName} set.name:"${sanitizedSetName}"`);
        urlSetName.searchParams.append('pageSize', '10');

        searchPromises.push(
          fetchWithTimeout(urlSetName.toString(), 3000)
            .then(r => r.ok ? r.json() : null)
            .then(data => ({ strategy: 'name+set.name', data: data?.data || [] }))
            .catch(() => ({ strategy: 'name+set.name', data: [] }))
        );
      }

      // STRATEGY 4: Name ONLY (broadest search - always works!)
      const url4 = new URL(pokemonApiUrl);
      url4.searchParams.append('q', `name:${cardName}`);
      url4.searchParams.append('pageSize', '20');
      
      searchPromises.push(
        fetchWithTimeout(url4.toString(), 3000)
          .then(r => r.ok ? r.json() : null)
          .then(data => ({ strategy: 'name-only', data: data?.data || [] }))
          .catch(() => ({ strategy: 'name-only', data: [] }))
      );
      
      // Wait for ALL searches to complete (in parallel!)
      const results = await Promise.all(searchPromises);
      
      // Use the first result that found cards (priority order)
      for (const result of results) {
        searchAttempts.push(`${result.strategy}: ${result.data.length}`);
        if (result.data.length > 0 && cards.length === 0) {
          cards = result.data;
          console.log(`✅ Found ${cards.length} cards using ${result.strategy} strategy`);
        }
      }
      
    } catch (error) {
      console.error('Search error:', error);
    }

    if (cards.length === 0) {
      return res.status(404).json({
        error: `No cards found matching "${cardName}"`,
        searched: { cardName, setId, setName, cardNumber },
        searchAttempts: searchAttempts,
        hint: 'Card may not exist in Pokemon TCG API database'
      });
    }

    // Filter to exact matches by name
    let exactMatches = cards.filter((card: any) => 
      card.name.toLowerCase() === cardName.toLowerCase()
    );

    // If we have a card number, prioritize matches with that number
    let matchedCard = null;
    if (cardNumber && exactMatches.length > 0) {
      // First, try exact card number match
      matchedCard = exactMatches.find((card: any) => 
        card.number === cardNumber || 
        card.number === normalizedRequestNumber ||
        normalizeCardNumber(card.number) === normalizedRequestNumber
      );

      // If no exact match, try both with and without the slash part
      // (handles "188/132" vs "188" and "01" vs "1", etc.)
      if (!matchedCard && normalizedRequestNumber) {
        const requestedNumberOnly = String(cardNumber).split('/')[0].trim();
        matchedCard = exactMatches.find((card: any) => {
          const cardNormalized = normalizeCardNumber(card.number);
          const cardWithoutSlash = card.number.split('/')[0].trim();
          return cardNormalized === normalizedRequestNumber ||
                 cardWithoutSlash === requestedNumberOnly;
        });
      }

      // STRICT MODE: If a card number was requested but we can't find an exact match,
      // DO NOT fallback to other variants. This prevents matching wrong variants of cards
      // like different "Mega Lucario ex" cards (#077 vs #188 etc.)
      if (!matchedCard) {
        console.warn(`⚠️ Card number mismatch: Requested ${cardNumber} for "${cardName}" but no exact match found`);
        console.log(`📋 Available variants: ${exactMatches.map((c: any) => `#${c.number}`).join(', ')}`);
        
        // Only fallback if the card number difference is very small (like "1" vs "01")
        if (normalizedRequestNumber && /^\d+$/.test(normalizedRequestNumber)) {
          const requestedNum = parseInt(normalizedRequestNumber);
          const closeMatches = exactMatches.filter((card: any) => {
            const cardNum = parseInt(normalizeCardNumber(card.number));
            return !isNaN(cardNum) && Math.abs(cardNum - requestedNum) <= 1;
          });
          
          if (closeMatches.length === 1) {
            matchedCard = closeMatches[0];
            console.log(`✅ Using close match: #${matchedCard.number} (requested #${cardNumber})`);
          }
        }
      }
    }

    // Fallback 1: If NO card number was provided, use set-based matching
    if (!matchedCard && !cardNumber && exactMatches.length > 0) {
      const sameSetMatches = exactMatches.filter((card: any) => 
        card.set.id.toLowerCase() === effectiveSetId.toLowerCase()
      );
      if (sameSetMatches.length > 0) {
        matchedCard = sameSetMatches[0];
        console.log(`✅ Matched by set: ${matchedCard.name} #${matchedCard.number}`);
      }
    }

    // Fallback 2: Use first exact name match (ONLY if no card number was requested)
    if (!matchedCard && !cardNumber && exactMatches.length > 0) {
      matchedCard = exactMatches[0];
      console.warn(`⚠️ Using fallback match for ${cardName} #${matchedCard.number} - may not be the exact variant`);
    }

    // Fallback 3: If no exact matches and NO card number, try fuzzy matching on name
    if (!matchedCard && !cardNumber && cards.length > 0) {
      const fuzzyMatches = cards.filter((card: any) => 
        card.name.toLowerCase().includes(cardName.toLowerCase()) ||
        cardName.toLowerCase().includes(card.name.toLowerCase())
      );
      if (fuzzyMatches.length > 0) {
        matchedCard = fuzzyMatches[0];
        console.warn(`⚠️ Using fuzzy match for ${cardName}: ${matchedCard.name} #${matchedCard.number}`);
      }
    }
    
    // If a card number was provided but we still don't have a match, return error
    if (!matchedCard && cardNumber) {
      const relaxedFallback = exactMatches[0] || cards[0];

      if (relaxedFallback) {
        matchedCard = relaxedFallback;
        console.warn(`⚠️ Using relaxed fallback for ${cardName} - variant may differ (requested #${cardNumber})`);
      } else {
        return res.status(404).json({
          error: `Card number ${cardNumber} not found for "${cardName}" in set ${effectiveSetId || setName}`,
          searched: { cardName, setId, setName, cardNumber },
          message: `Please check that the card number is correct. Found ${exactMatches.length} variants with this name.`,
          availableVariants: exactMatches.map((c: any) => ({ 
            name: c.name, 
            set: c.set.id, 
            number: c.number,
            rarity: c.rarity 
          }))
        });
      }
    }

    if (!matchedCard || !matchedCard.images?.large || !matchedCard.images?.small) {
      return res.status(404).json({
        error: `Card not found or missing images`,
        searched: { cardName, setId, setName, cardNumber },
        totalResults: cards.length,
        exactMatches: exactMatches.length,
        searchAttempts: searchAttempts,
        availableCards: cards.slice(0, 5).map((c: any) => ({ 
          name: c.name, 
          set: c.set.id, 
          number: c.number 
        }))
      });
    }

    console.log(`✅ Matched card: ${matchedCard.name} from ${matchedCard.set.name} (#${matchedCard.number})`);

    // Store in cache
    const result = {
      card: matchedCard,
      images: {
        small: matchedCard.images.small,
        large: matchedCard.images.large
      },
      id: matchedCard.id,
      matchedSet: matchedCard.set.name,
      matchedNumber: matchedCard.number,
      timestamp: Date.now()
    };
    
    cardImageCache.set(cacheKey, result);
    console.log(`💾 Cached result for ${cardName} (cache size: ${cardImageCache.size})`);

    // Return without the timestamp
    const { timestamp, ...response } = result;
    res.json(response);

  } catch (error) {
    console.error('Error searching Pokemon API:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: (error as Error).message 
    });
  }
});

export default router;

