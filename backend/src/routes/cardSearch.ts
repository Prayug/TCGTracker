import { Router } from 'express';
import { getDb } from '../db/database';

const router = Router();

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

/**
 * Search Pokemon API for card images (proxy endpoint to avoid CORS)
 */
router.get('/search-pokemon', async (req, res) => {
  try {
    const { cardName, setId, cardNumber } = req.query;
    
    if (!cardName || typeof cardName !== 'string') {
      return res.status(400).json({ 
        error: 'cardName query parameter is required' 
      });
    }

    if (!setId || typeof setId !== 'string') {
      return res.status(400).json({ 
        error: 'setId query parameter is required' 
      });
    }

    const pokemonApiUrl = 'https://api.pokemontcg.io/v2/cards';
    const apiKey = process.env.POKEMON_TCG_API_KEY;
    const headers: HeadersInit = {
      'Accept': 'application/json',
    };
    if (apiKey) {
      headers['X-Api-Key'] = apiKey;
    }

    // Try multiple search strategies
    let cards: any[] = [];
    let searchAttempts = [];

    // Strategy 1: Exact name + set ID
    try {
      const queryParts = [`name:"${cardName.replace(/"/g, '\\"')}"`, `set.id:${setId}`];
      const queryString = queryParts.join(' ');
      const url = new URL(pokemonApiUrl);
      url.searchParams.append('q', queryString);
      url.searchParams.append('pageSize', '50');
      
      const response = await fetch(url.toString(), { headers });
      if (response.ok) {
        const data = await response.json();
        cards = data.data || [];
        searchAttempts.push(`exact name + set: ${cards.length} results`);
      }
    } catch (e) {
      searchAttempts.push(`exact name + set: failed`);
    }

    // Strategy 2: If no results, try wildcard name + set ID
    if (cards.length === 0) {
      try {
        const queryParts = [`name:*${cardName.replace(/"/g, '\\"')}*`, `set.id:${setId}`];
        const queryString = queryParts.join(' ');
        const url = new URL(pokemonApiUrl);
        url.searchParams.append('q', queryString);
        url.searchParams.append('pageSize', '50');
        
        const response = await fetch(url.toString(), { headers });
        if (response.ok) {
          const data = await response.json();
          cards = data.data || [];
          searchAttempts.push(`wildcard name + set: ${cards.length} results`);
        }
      } catch (e) {
        searchAttempts.push(`wildcard name + set: failed`);
      }
    }

    // Strategy 3: If still no results, try exact name only (no set filter)
    if (cards.length === 0) {
      try {
        const queryParts = [`name:"${cardName.replace(/"/g, '\\"')}"`];
        const queryString = queryParts.join(' ');
        const url = new URL(pokemonApiUrl);
        url.searchParams.append('q', queryString);
        url.searchParams.append('pageSize', '50');
        
        const response = await fetch(url.toString(), { headers });
        if (response.ok) {
          const data = await response.json();
          cards = data.data || [];
          searchAttempts.push(`exact name only: ${cards.length} results`);
        }
      } catch (e) {
        searchAttempts.push(`exact name only: failed`);
      }
    }

    // Filter to exact matches by name (set ID might differ)
    const exactMatches = cards.filter((card: any) => 
      card.name === cardName
    );

    // If cardNumber provided, prefer that match
    let matchedCard = null;
    if (cardNumber && exactMatches.length > 0) {
      matchedCard = exactMatches.find((card: any) => 
        card.number === cardNumber
      ) || null;
    }

    // Fallback to first exact match
    if (!matchedCard && exactMatches.length > 0) {
      matchedCard = exactMatches[0];
    }

    if (!matchedCard || !matchedCard.images?.large || !matchedCard.images?.small) {
      return res.status(404).json({
        error: `Card not found or missing images`,
        searched: { cardName, setId, cardNumber },
        totalResults: cards.length,
        exactMatches: exactMatches.length,
        searchAttempts: searchAttempts
      });
    }

    res.json({
      card: matchedCard,
      images: {
        small: matchedCard.images.small,
        large: matchedCard.images.large
      },
      id: matchedCard.id
    });

  } catch (error) {
    console.error('Error searching Pokemon API:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: (error as Error).message 
    });
  }
});

export default router;

