import { Router } from 'express';
import { getDb } from '../db/database';
import {
  pokemonApiClient,
  CardImageMatchResult,
  CardSearchAttempt,
  PokemonApiSet,
} from '../services/pokemonApiClient';
import { generateUniqueIdentifier } from '../services/cardIdentifier';

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
  usedFallback?: boolean;
  attempts?: CardSearchAttempt[];
}

const cardImageCache = new Map<string, CachedCard>();
const CACHE_TTL = 1000 * 60 * 60 * 24; // 24 hours

// Dynamic set mapping cache
let globalSetMap: Map<string, string> | null = null;
let setMapLastRefreshed = 0;
const SET_MAP_CACHE_TTL = 1000 * 60 * 60 * 24; // 24 hours

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

// Helper functions for removing leading zeros
const removeLeadingZeros = (str: string): string => {
  // Remove leading zeros from numbers, but preserve zeros in the middle
  return str.replace(/^0+/, '') || '0';
};

const normalizeSetIdWithZeroRemoval = (setId: string): string => {
  // Handle patterns like sv01 -> sv1, swsh01 -> swsh1, etc.
  const patterns = [
    /(sv|swsh|sm|xy|bw)(\d+)/,  // Standard format
    /(zsv)(\d+)(pt\d+)/,        // Special format like zsv10pt5
    /(base|dp|ex|hgss|pop|bw)(\d+)/,  // Older format like base1, dp6, ex12
    /(neo)(\d+)/,               // Neo series
    /(pl)(\d+)/,                // Platinum series
    /(col)(\d+)/,               // Call of Legends
    /(mcd)(\d+)/,               // McDonald's series
  ];

  for (const pattern of patterns) {
    const match = setId.match(pattern);
    if (match) {
      if (match.length === 3) {
        // Standard format: sv06, swsh11, base1, dp6, etc. - remove leading zeros
        const series = match[1];
        const number = removeLeadingZeros(match[2]);
        return `${series}${number}`;
      } else if (match.length === 4) {
        // Special format: zsv10pt5
        return `${match[1]}${match[2]}${match[3]}`;
      }
    }
  }

  return setId; // Return as-is if no pattern matches
};

// Dynamic set mapping functions
const loadSetMappingsFromDb = (): Promise<Map<string, string>> => {
  const db = getDb();
  return new Promise((resolve) => {
    db.all('SELECT normalizedKey, apiSetId FROM set_mappings', [], (err, rows: any[]) => {
      if (err) {
        console.error('Error loading set mappings from DB:', err);
        resolve(new Map());
        return;
      }

      const map = new Map<string, string>();
      rows.forEach(row => {
        map.set(row.normalizedKey, row.apiSetId);
      });

      console.log(`✅ Loaded ${map.size} set mappings from database`);
      resolve(map);
    });
  });
};

const saveSetMappingsToDb = async (mappings: Map<string, string>, sets: PokemonApiSet[]): Promise<void> => {
  const db = getDb();

  return new Promise<void>((resolve, reject) => {
    db.serialize(() => {
      db.run('BEGIN TRANSACTION');

      // Clear existing mappings
      db.run('DELETE FROM set_mappings', [], (err) => {
        if (err) {
          console.error('Error deleting set mappings:', err);
          db.run('ROLLBACK');
          reject(err);
          return;
        }

        // Insert new mappings
        const now = Date.now();
        let inserted = 0;
        let failed = 0;

        const stmt = db.prepare(`
          INSERT INTO set_mappings (normalizedKey, apiSetId, apiSetName, series, ptcgoCode, totalCards, updatedAt)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `);

        for (const [key, apiSetId] of mappings.entries()) {
          // Find the corresponding set data
          const setData = sets.find(set => set.id === apiSetId);
          if (!setData) {
            console.warn(`No set data found for ${apiSetId}`);
            continue;
          }

          try {
            stmt.run([
              key,
              apiSetId,
              setData.name,
              setData.series || '',
              (setData as any).ptcgoCode || '',
              (setData as any).printedTotal || (setData as any).total || 0,
              now
            ]);
            inserted++;
          } catch (err) {
            console.error(`Error inserting mapping for ${key}:`, err);
            failed++;
          }
        }

        stmt.finalize();

        db.run('COMMIT', (err) => {
          if (err) {
            console.error('Error committing transaction:', err);
            db.run('ROLLBACK');
            reject(err);
          } else {
            console.log(`✅ Saved ${inserted} set mappings to database (${failed} failed)`);
            resolve();
          }
        });
      });
    });
  });
};

const generateNormalizedKeys = (set: PokemonApiSet): string[] => {
  const keys: string[] = [];

  // Basic variations
  keys.push(set.id.toLowerCase());
  keys.push(normalizeSetIdWithZeroRemoval(set.id.toLowerCase())); // Also add version with leading zeros removed
  keys.push(set.name.toLowerCase().replace(/[^a-z0-9]/g, ''));

  // Series + name combination
  if (set.series) {
    const seriesNormalized = set.series.toLowerCase().replace(/[^a-z0-9]/g, '');
    const nameNormalized = set.name.toLowerCase().replace(/[^a-z0-9]/g, '');
    keys.push(seriesNormalized + nameNormalized);
  }

  // PTCGO code if available
  if ((set as any).ptcgoCode) {
    keys.push((set as any).ptcgoCode.toLowerCase());
  }

  // Set ID with total cards
  if ((set as any).total && (set as any).total > 0) {
    const totalStr = (set as any).total.toString();
    keys.push(`${set.id.toLowerCase()}${totalStr}`);
    keys.push(`${set.id.toLowerCase()}${removeLeadingZeros(totalStr)}`); // Also with leading zeros removed
  }

  // Series with total
  if (set.series && (set as any).total && (set as any).total > 0) {
    const seriesNormalized = set.series.toLowerCase().replace(/[^a-z0-9]/g, '');
    const totalStr = (set as any).total.toString();
    keys.push(`${seriesNormalized}${totalStr}`);
    keys.push(`${seriesNormalized}${removeLeadingZeros(totalStr)}`); // Also with leading zeros removed
  }

  // Common variations from DB data
  const nameVariations = [
    set.name.toLowerCase().replace(/\s+/g, ''), // no spaces
    set.name.toLowerCase().replace(/\s+/g, ''), // original with spaces removed
    `${set.id.toLowerCase()}${set.name.toLowerCase().replace(/[^a-z0-9]/g, '')}`, // id + name
  ];

  // Add legacy DB-style names that might not match API exactly
  if (set.id === 'smp') {
    keys.push('smpromos', 'smspromos', 'sm-promos');
  }
  if (set.id === 'swshp') {
    keys.push('swshpromos', 'swordshieldpromos');
  }
  if (set.id === 'xyp') {
    keys.push('xypromos');
  }
  if (set.id === 'bwp') {
    keys.push('bwblackwhitepromos', 'blackandwhitepromos');
  }
  if (set.id === 'base1') {
    keys.push('baseset', 'base-set');
  }

  keys.push(...nameVariations);

  // Remove duplicates
  return [...new Set(keys)].filter(key => key.length > 0);
};

const refreshSetMappings = async (): Promise<Map<string, string>> => {
  try {
    console.log('🔄 Refreshing Pokemon TCG set mappings from API...');

    const sets = await pokemonApiClient.getSets(1000);
    if (sets.length === 0) {
      console.warn('⚠️ No sets returned from Pokemon API, using cached mappings');
      return globalSetMap || new Map();
    }

    const mappings = new Map<string, string>();

    sets.forEach(set => {
      const keys = generateNormalizedKeys(set);
      keys.forEach(key => {
        mappings.set(key, set.id);
      });
    });

    // Save to database
    await saveSetMappingsToDb(mappings, sets);

    globalSetMap = mappings;
    setMapLastRefreshed = Date.now();

    console.log(`✅ Refreshed ${mappings.size} set mappings from ${sets.length} sets`);
    return mappings;
  } catch (error) {
    console.error('❌ Failed to refresh set mappings:', error);
    // Return cached version or empty map
    return globalSetMap || new Map();
  }
};

const getSetMappings = async (): Promise<Map<string, string>> => {
  const now = Date.now();

  // If we have a cached version and it's not expired, return it
  if (globalSetMap && (now - setMapLastRefreshed) < SET_MAP_CACHE_TTL) {
    return globalSetMap;
  }

  // Try to load from database first
  if (!globalSetMap) {
    globalSetMap = await loadSetMappingsFromDb();
    if (globalSetMap.size > 0) {
      setMapLastRefreshed = now; // Assume DB data is recent enough
      return globalSetMap;
    }
  }

  // Refresh from API
  return await refreshSetMappings();
};

const normalizeSetIdDynamically = async (input: string): Promise<string | null> => {
  if (!input || typeof input !== 'string') {
    return null;
  }

  const normalizedInput = input.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!normalizedInput) {
    return null;
  }

  const mappings = await getSetMappings();
  return mappings.get(normalizedInput) || null;
};

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

// Dynamic set normalization using live Pokemon TCG API data
const normalizeSetIdForImageUrl = async (setId: string): Promise<string | null> => {
  return await normalizeSetIdDynamically(setId);
};

const buildDeterministicImageUrls = async (setId?: string | null, cardNumber?: string | null) => {
  if (!setId || !cardNumber) {
    return null;
  }
  const trimmedSet = setId.trim();
  const baseNumber = cardNumber.split('/')[0].trim();
  if (!trimmedSet || !baseNumber) {
    return null;
  }
  const sanitizedNumber = removeLeadingZeros(baseNumber.replace(/\s+/g, '').toLowerCase());
  const normalizedSet = await normalizeSetIdForImageUrl(trimmedSet);

  if (!normalizedSet) {
    return null;
  }

  const baseUrl = `https://images.pokemontcg.io/${normalizedSet}/${sanitizedNumber}`;
  return {
    small: `${baseUrl}.png`,
    large: `${baseUrl}.png`, // Use .png for both (no _hires.png as it shows card backs)
  };
};

const IMAGE_COLUMN_FRAGMENT =
  'cm.imageSmall, cm.imageLarge, cm.imageSource, cm.imageLastUpdated,';
const IMAGE_COLUMN_CACHE_TTL = 1000 * 60 * 5; // 5 minutes
let imageColumnCache: { hasColumns: boolean; checkedAt: number } | null = null;

const hasImageMetadataColumns = async (): Promise<boolean> => {
  if (
    imageColumnCache &&
    Date.now() - imageColumnCache.checkedAt < IMAGE_COLUMN_CACHE_TTL
  ) {
    return imageColumnCache.hasColumns;
  }

  const db = getDb();
  const hasColumns = await new Promise<boolean>((resolve) => {
    db.all("PRAGMA table_info(card_mappings)", [], (err, rows: any[]) => {
      if (err || !rows) {
        resolve(false);
      } else {
        resolve(rows.some((row: any) => row.name === 'imageSmall'));
      }
    });
  });

  imageColumnCache = { hasColumns, checkedAt: Date.now() };
  return hasColumns;
};

const getImageColumnSelectFragment = async () => {
  return (await hasImageMetadataColumns()) ? IMAGE_COLUMN_FRAGMENT : '';
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

  const imageColumns = await getImageColumnSelectFragment();

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

const mapLocalRowsToPokemonCards = async (rows: any[]) => {
  return await Promise.all(rows.map(async row => {
    // PRIORITY ORDER for images:
    // 1. Stored images from database (most reliable)
    // 2. Deterministic Pokemon TCG API URLs
    // 3. Placeholder SVG
    
    let images;
    if (row.imageSmall && row.imageLarge) {
      // Use stored images (best option)
      images = {
        small: row.imageSmall,
        large: row.imageLarge
      };
    } else {
      // Fallback to deterministic URLs or placeholder
      const deterministicImages = await buildDeterministicImageUrls(row.setId, row.cardNumber);
      const placeholder = buildPlaceholderImage(row.cardName, row.setName);
      images = deterministicImages || { small: placeholder, large: placeholder };
    }

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
      imageSource: row.imageSource || (row.imageSmall ? 'stored' : 'generated'),
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
  }));
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

    const imageColumns = await getImageColumnSelectFragment();

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
    
    const params: any[] = [`%${query}%`];

    if (setId && typeof setId === 'string') {
      sql += ' AND (cm.setId = ? OR cm.setName LIKE ?)';
      params.push(setId, `%${setId}%`);
    }

    sql += ` ORDER BY cm.cardName ASC LIMIT ?`;
    params.push(searchLimit);

    db.all(sql, params, async (err, rows: any[]) => {
      if (err) {
        console.error('Error searching cards:', err);
        return res.status(500).json({
          error: 'Database error',
          message: err.message
        });
      }

      // Transform to Pokemon TCG API compatible format using the helper function
      const cards = await mapLocalRowsToPokemonCards(rows);

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

    // Build exclusion clauses
    const nameExclusionClauses = EXCLUDED_FAKE_SET_NAMES.map(set =>
      set.includes('%') ? `cm.setName NOT LIKE '${set}'` : `cm.setName != '${set}'`
    );

    const idExclusionClauses = EXCLUDED_FAKE_SET_IDS.map(setId =>
      `cm.setId != '${setId}'`
    );

    const exclusionClauses = [...nameExclusionClauses, ...idExclusionClauses].join(' AND ');

    // Select random cards with their latest market price from price_history
    // ONLY from REAL Pokemon TCG sets (excludes product categories)
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

    db.all(sql, [minPrice, maxPrice, poolLimit], async (err, rows: any[]) => {
      if (err) {
        console.error('Error fetching random card pool:', err);
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
    const normalizedSetId =
      typeof setId === 'string' && setId.trim().length > 0 ? setId.trim() : undefined;
    const limit = Math.min(Math.max(parseInt(pageSize as string, 10) || 100, 1), 250);
    const shouldFetchAll = String(fetchAll).toLowerCase() !== 'false';
    const maxPagesToFetch = Math.min(Math.max(parseInt(maxPages as string, 10) || 4, 1), 10);

    buildLocalFallbackResponse = async () => {
      const rows = await getLocalCardsForQuery(sanitizedQuery, normalizedSetId, limit).catch(
        (err) => {
          console.error('Local fallback query failed', err);
          return [] as any[];
        }
      );
      if (!rows || rows.length === 0) {
        return null;
      }
      const cards = await mapLocalRowsToPokemonCards(rows);
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
      return res.json({
        data: inMemory.data,
        totalCount: inMemory.totalCount,
        pageSize: inMemory.pageSize,
        pagesFetched: inMemory.pagesFetched,
        cached: true,
        source: 'pokemon_tcg_api',
      });
    }

    persistentCacheEntry = await getPersistentPokemonCache(cacheKey).catch((err) => {
      console.error('Error reading persistent pokemon cache', err);
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

    const uniqueCards = apiResult.cards;

    if (uniqueCards.length === 0) {
      console.warn(
        `⚠️ No cards from Pokemon API for query "${sanitizedQuery}", trying fallbacks...`
      );

      if (buildLocalFallbackResponse) {
        const localPayload = await buildLocalFallbackResponse();
        if (localPayload) {
          console.log(`✅ Serving ${localPayload.data.length} cards from local database fallback`);
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
      console.warn('Failed to persist pokemon search cache', cacheError);
    }

    console.log(
      `✅ Successfully fetched ${uniqueCards.length} cards for "${sanitizedQuery}" from Pokemon API`
    );
    res.json(payload);
  } catch (error) {
    console.error('❌ Error proxying Pokemon API search:', error);

    if (buildLocalFallbackResponse) {
      try {
        const localPayload = await buildLocalFallbackResponse();
        if (localPayload) {
          console.log(
            `✅ Serving ${localPayload.data.length} cards from local database (error fallback)`
          );
          return res.status(200).json(localPayload);
        }
      } catch (fallbackErr) {
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

    console.log(
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
            console.warn(`Failed to update rarity for ${cardName}:`, err);
          } else {
            console.log(`✅ Updated rarity for ${cardName}: ${card.rarity}`);
          }
        }
      );
    }

    res.json(responsePayload);
  } catch (error) {
    console.error('Error searching Pokemon API:', error);
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
    console.log('🔄 Manual refresh of Pokemon TCG set mappings requested');

    const mappings = await refreshSetMappings();

    res.json({
      success: true,
      message: `Refreshed ${mappings.size} set mappings`,
      mappingsCount: mappings.size,
      source: 'pokemon_tcg_api'
    });
  } catch (error) {
    console.error('❌ Failed to refresh set mappings:', error);
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
    const db = getDb();

    db.get('SELECT COUNT(*) as totalMappings FROM set_mappings', [], (err, row: any) => {
      if (err) {
        console.error('Error fetching set mapping stats:', err);
        return res.status(500).json({
          error: 'Database error',
          message: err.message
        });
      }

      const mappings = globalSetMap ? globalSetMap.size : 0;
      const lastRefreshed = setMapLastRefreshed || null;

      res.json({
        totalMappingsInDb: row.totalMappings || 0,
        cachedMappings: mappings,
        lastRefreshed: lastRefreshed ? new Date(lastRefreshed).toISOString() : null,
        cacheAge: lastRefreshed ? Date.now() - lastRefreshed : null,
        cacheTtl: SET_MAP_CACHE_TTL
      });
    });
  } catch (error) {
    console.error('Error fetching set mapping stats:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: (error as Error).message
    });
  }
});

export default router;

