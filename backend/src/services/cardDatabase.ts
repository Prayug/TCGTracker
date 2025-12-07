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
  return await Promise.all(rows.map(async row => {
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
        // No image available - return undefined
        images = undefined;
        imageSource = undefined;
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

