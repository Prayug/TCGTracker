// Database query utilities for cards
import { getDb } from '../db/database';
import { buildDeterministicImageUrls, getImageColumnSelectFragment } from './cardImageUtils';

export const getLocalCardsForQuery = async (query: string, setId?: string, limit: number = 250) => {
  const db = getDb();
  const likeQuery = `%${query}%`;
  const params: any[] = [likeQuery];
  let whereClause = 'cm.cardName LIKE ?';

  if (setId) {
    whereClause += ' AND (cm.setId = ? OR cm.setName LIKE ?)';
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

export const mapLocalRowsToPokemonCards = async (rows: any[]) => {
  const buildFallbackImage = (cardName: string, setName: string) =>
    `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='245' height='342' viewBox='0 0 245 342'%3E%3Crect width='245' height='342' fill='%23f1f5f9' rx='8'/%3E%3Ctext x='50%25' y='46%25' font-family='Inter,sans-serif' font-size='12' fill='%2364748b' text-anchor='middle'%3E${encodeURIComponent(cardName || 'Pokemon Card')}%3C/text%3E%3Ctext x='50%25' y='54%25' font-family='Inter,sans-serif' font-size='10' fill='%2394a3b8' text-anchor='middle'%3E${encodeURIComponent(setName || 'Unknown Set')}%3C/text%3E%3C/svg%3E`;

  const seen = new Set<string>();
  const uniqueRows = rows.filter((row) => {
    const key = row.uniqueIdentifier ?? row.cardId ?? `${row.setId}-${row.cardNumber}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return await Promise.all(uniqueRows.map(async row => {
    // PRIORITY ORDER for images:
    // 1. Stored images from database (most reliable)
    // 2. Deterministic Pokemon TCG API URLs
    // No placeholder - only show real images
    
    let images;
    let imageSource = row.imageSource;
    
    if (row.imageSmall && row.imageLarge) {
      // Use stored images (best option)
      images = {
        small: row.imageSmall,
        large: row.imageLarge
      };
      imageSource = imageSource || 'stored';
    } else {
      // Try deterministic URLs - if not available, return undefined (no image)
      const deterministicImages = await buildDeterministicImageUrls(row.setId, row.cardNumber, row.setName);
      if (deterministicImages) {
        images = deterministicImages;
        imageSource = 'deterministic';
      } else {
        const fallbackImage = buildFallbackImage(row.cardName, row.setName);
        images = {
          small: fallbackImage,
          large: fallbackImage
        };
        imageSource = 'fallback';
      }
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
      imageSource,
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

