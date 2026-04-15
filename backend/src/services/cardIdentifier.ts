import { getDb } from '../db/database';

export interface CardIdentifier {
  cardId: string;
  productId?: number;
  cardName: string;
  setId: string;
  setName: string;
  cardNumber?: string;
  rarity?: string;
  variantKey?: string;
  tcgplayerProductId?: string;
  uniqueIdentifier: string;
}

/**
 * Generates a unique identifier for a card based on its properties
 * Format: setId|cardNumber|cardName (normalized)
 */
export const generateUniqueIdentifier = (
  setId: string, 
  cardNumber: string | undefined, 
  cardName: string,
  variantKey: string = 'normal'
): string => {
  const normalizedName = cardName.toLowerCase().replace(/[^a-z0-9]/g, '');
  const normalizedSetId = setId.toLowerCase().replace(/[^a-z0-9]/g, '');
  const normalizedCardNumber = cardNumber ? cardNumber.replace(/[^a-z0-9]/g, '') : '';
  const normalizedVariantKey = variantKey.toLowerCase().replace(/[^a-z0-9]/g, '') || 'normal';

  return `${normalizedSetId}|${normalizedCardNumber}|${normalizedName}|${normalizedVariantKey}`;
};

/**
 * Stores or updates card mapping information
 */
export const storeCardMapping = async (cardData: Omit<CardIdentifier, 'uniqueIdentifier'>): Promise<string> => {
  const db = getDb();
  const uniqueIdentifier = generateUniqueIdentifier(
    cardData.setId,
    cardData.cardNumber,
    cardData.cardName,
    cardData.variantKey || 'normal'
  );
  
  return new Promise((resolve, reject) => {
    const sql = `
      INSERT OR REPLACE INTO card_mappings 
      (cardId, productId, cardName, setId, setName, cardNumber, rarity, variantKey, tcgplayerProductId, uniqueIdentifier, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `;
    
    db.run(sql, [
      cardData.cardId,
      cardData.productId || null,
      cardData.cardName,
      cardData.setId,
      cardData.setName,
      cardData.cardNumber || null,
      cardData.rarity || null,
      cardData.variantKey || 'normal',
      cardData.tcgplayerProductId || null,
      uniqueIdentifier
    ], function(err) {
      if (err) {
        reject(err);
      } else {
        resolve(uniqueIdentifier);
      }
    });
  });
};

/**
 * Finds card mapping by unique identifier
 */
export const findCardByIdentifier = async (uniqueIdentifier: string): Promise<CardIdentifier | null> => {
  const db = getDb();
  
  return new Promise((resolve, reject) => {
    const sql = 'SELECT * FROM card_mappings WHERE uniqueIdentifier = ?';
    
    db.get(sql, [uniqueIdentifier], (err, row: any) => {
      if (err) {
        reject(err);
      } else if (row) {
        resolve({
          cardId: row.cardId,
          productId: row.productId,
          cardName: row.cardName,
          setId: row.setId,
          setName: row.setName,
          cardNumber: row.cardNumber,
          rarity: row.rarity,
          variantKey: row.variantKey || 'normal',
          tcgplayerProductId: row.tcgplayerProductId,
          uniqueIdentifier: row.uniqueIdentifier
        });
      } else {
        resolve(null);
      }
    });
  });
};

/**
 * Finds card mapping by card name, set, and optional card number
 */
export const findCardByDetails = async (
  cardName: string, 
  setId: string, 
  cardNumber?: string,
  rarity?: string,
  variantKey?: string,
  productId?: string
): Promise<CardIdentifier | null> => {
  const db = getDb();
  const normalizedVariantKey = variantKey
    ? variantKey.toLowerCase().replace(/[^a-z0-9]/g, '')
    : null;
  
  return new Promise((resolve, reject) => {
    // Priority 1: Match by tcgplayerProductId if available
    if (productId) {
      const sql = `
        SELECT *
        FROM card_mappings
        WHERE tcgplayerProductId = ?
        ORDER BY
          CASE
            WHEN ? IS NOT NULL AND REPLACE(LOWER(COALESCE(variantKey, 'normal')), ' ', '') = ? THEN 0
            ELSE 1
          END,
          CASE
            WHEN ? IS NOT NULL AND REPLACE(LOWER(COALESCE(cardNumber, '')), '-', '') = ? THEN 0
            ELSE 1
          END,
          CASE
            WHEN REPLACE(LOWER(COALESCE(setId, '')), ' ', '') = ? THEN 0
            ELSE 1
          END,
          updatedAt DESC
        LIMIT 1
      `;
      const normalizedCardNumber = cardNumber
        ? cardNumber.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()
        : null;
      const normalizedSetId = setId.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
      db.get(
        sql,
        [
          productId,
          normalizedVariantKey,
          normalizedVariantKey,
          normalizedCardNumber,
          normalizedCardNumber,
          normalizedSetId,
        ],
        (err, row: any) => {
        if (err) return reject(err);
        if (row) return resolve(row as CardIdentifier);
        // If not found, continue to other checks
        findWithOtherDetails();
      });
    } else {
      findWithOtherDetails();
    }

    function findWithOtherDetails() {
      const isPromo = (rarity === 'Promo' || setId.toLowerCase().includes('promo'));
      
      // Try multiple matching strategies
      tryExactMatch()
        .then(result => {
          if (result) {
            resolve(result);
            return null;  // Stop the chain
          }
          return tryLenientMatch();
        })
        .then(result => {
          if (result) {
            resolve(result);
            return null;  // Stop the chain
          }
          return tryFuzzyMatch();
        })
        .then(result => {
          if (result) {
            resolve(result);
          } else {
            resolve(null);
          }
        })
        .catch(reject);

      // Strategy 1: Exact match
      function tryExactMatch(): Promise<CardIdentifier | null> {
        return new Promise((res, rej) => {
          let sql = 'SELECT * FROM card_mappings';
          const params: any[] = [];
          const conditions: string[] = [];

          // Exact card name match
          conditions.push('cardName = ?');
          params.push(cardName);

          // Set matching
          if (isPromo) {
            conditions.push("setName LIKE '%Promo%'");
          } else {
            conditions.push('(setId = ? OR setName LIKE ?)');
            params.push(setId, `%${setId}%`);
          }

          // Card number matching
          if (cardNumber) {
            const normalizedCardNumber = cardNumber.replace(/[^a-zA-Z0-9]/g, '');
            conditions.push("REPLACE(LOWER(cardNumber), '-', '') = ?");
            params.push(normalizedCardNumber.toLowerCase());
          }

          sql += ' WHERE ' + conditions.join(' AND ');
          if (normalizedVariantKey) {
            sql += " ORDER BY CASE WHEN REPLACE(LOWER(COALESCE(variantKey, 'normal')), ' ', '') = ? THEN 0 ELSE 1 END, length(cardNumber) ASC, createdAt DESC LIMIT 1";
            params.push(normalizedVariantKey);
          } else {
            sql += ' ORDER BY length(cardNumber) ASC, createdAt DESC LIMIT 1';
          }

          db.get(sql, params, (err, row: any) => {
            if (err) rej(err);
            else res(row as CardIdentifier || null);
          });
        });
      }

      // Strategy 2: Lenient match (ignore special characters in name)
      function tryLenientMatch(): Promise<CardIdentifier | null> {
        return new Promise((res, rej) => {
          // Normalize the card name by removing special characters
          const normalizedName = cardName.replace(/[^a-zA-Z0-9\s]/g, '').trim();
          
          let sql = `SELECT * FROM card_mappings WHERE 
            REPLACE(REPLACE(REPLACE(cardName, '-', ''), ' ', ''), '★', '') = 
            REPLACE(REPLACE(REPLACE(?, '-', ''), ' ', ''), '★', '')`;
          const params: any[] = [cardName];

          // Set matching
          if (isPromo) {
            sql += " AND setName LIKE '%Promo%'";
          } else {
            sql += ' AND (setId = ? OR setName LIKE ?)';
            params.push(setId, `%${setId}%`);
          }

          // Card number matching (optional, less strict)
          if (cardNumber) {
            const normalizedCardNumber = cardNumber.replace(/[^a-zA-Z0-9]/g, '');
            sql += " AND (REPLACE(LOWER(cardNumber), '-', '') = ? OR cardNumber IS NULL)";
            params.push(normalizedCardNumber.toLowerCase());
          }
          if (normalizedVariantKey) {
            sql += " ORDER BY CASE WHEN REPLACE(LOWER(COALESCE(variantKey, 'normal')), ' ', '') = ? THEN 0 ELSE 1 END, length(cardNumber) ASC, createdAt DESC LIMIT 1";
            params.push(normalizedVariantKey);
          } else {
            sql += ' ORDER BY length(cardNumber) ASC, createdAt DESC LIMIT 1';
          }

          db.get(sql, params, (err, row: any) => {
            if (err) rej(err);
            else res(row as CardIdentifier || null);
          });
        });
      }

      // Strategy 3: Fuzzy match (case-insensitive LIKE)
      function tryFuzzyMatch(): Promise<CardIdentifier | null> {
        return new Promise((res, rej) => {
          let sql = 'SELECT * FROM card_mappings WHERE LOWER(cardName) LIKE ?';
          const params: any[] = [`%${cardName.toLowerCase()}%`];

          // Set matching
          if (isPromo) {
            sql += " AND setName LIKE '%Promo%'";
          } else {
            sql += ' AND (setId = ? OR setName LIKE ?)';
            params.push(setId, `%${setId}%`);
          }
          if (normalizedVariantKey) {
            sql += " ORDER BY CASE WHEN REPLACE(LOWER(COALESCE(variantKey, 'normal')), ' ', '') = ? THEN 0 ELSE 1 END, length(cardNumber) ASC, createdAt DESC LIMIT 1";
            params.push(normalizedVariantKey);
          } else {
            sql += ' ORDER BY length(cardNumber) ASC, createdAt DESC LIMIT 1';
          }

          db.get(sql, params, (err, row: any) => {
            if (err) rej(err);
            else res(row as CardIdentifier || null);
          });
        });
      }
    }
  });
};

export const findExactCardByDetails = async (params: {
  cardId?: string;
  productId?: string;
  cardName: string;
  setId: string;
  cardNumber?: string;
  variantKey?: string;
}): Promise<CardIdentifier | null> => {
  const db = getDb();
  const normalizedVariantKey = (params.variantKey || 'normal')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '') || 'normal';
  const normalizedSetId = params.setId.toLowerCase().replace(/[^a-z0-9]/g, '');
  const normalizedName = params.cardName.toLowerCase().replace(/[^a-z0-9]/g, '');
  const normalizedCardNumber = params.cardNumber
    ? params.cardNumber.toLowerCase().replace(/[^a-z0-9]/g, '')
    : null;

  return new Promise((resolve, reject) => {
    const sql = `
      SELECT *
      FROM card_mappings
      WHERE
        (? IS NULL OR cardId = ?)
        AND (? IS NULL OR tcgplayerProductId = ?)
        AND REPLACE(LOWER(setId), ' ', '') = ?
        AND REPLACE(LOWER(cardName), ' ', '') = ?
        AND REPLACE(LOWER(COALESCE(variantKey, 'normal')), ' ', '') = ?
        AND (
          ? IS NULL
          OR REPLACE(LOWER(COALESCE(cardNumber, '')), '-', '') = ?
        )
      ORDER BY updatedAt DESC
      LIMIT 1
    `;

    db.get(
      sql,
      [
        params.cardId || null,
        params.cardId || null,
        params.productId || null,
        params.productId || null,
        normalizedSetId,
        normalizedName,
        normalizedVariantKey,
        normalizedCardNumber,
        normalizedCardNumber,
      ],
      (err, row: any) => {
        if (err) {
          reject(err);
        } else {
          resolve((row as CardIdentifier) || null);
        }
      }
    );
  });
};

/**
 * Gets all TCGCSV price history for a specific card using its unique identifier
 */
export const getCardPriceHistory = async (uniqueIdentifier: string): Promise<any[]> => {
  const db = getDb();
  const parts = uniqueIdentifier.split('|');
  const legacyIdentifier = parts.length > 3 ? parts.slice(0, 3).join('|') : uniqueIdentifier;
  
  return new Promise((resolve, reject) => {
    const sql = `
      SELECT * FROM price_history 
      WHERE (uniqueIdentifier = ? OR uniqueIdentifier = ?)
      AND source IN ('tcgcsv', 'tcgdex', 'catalog_fallback')
      ORDER BY date ASC
    `;

    db.all(sql, [uniqueIdentifier, legacyIdentifier], (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows || []);
      }
    });
  });
};

export const getCardPriceHistoryForProduct = async (
  productId: number,
  variantKey?: string
): Promise<any[]> => {
  const db = getDb();
  const normalizedVariantKey = variantKey
    ? variantKey.toLowerCase().replace(/[^a-z0-9]/g, '')
    : null;

  return new Promise((resolve, reject) => {
    let sql = `
      SELECT * FROM price_history
      WHERE productId = ?
      AND source IN ('tcgcsv', 'tcgdex', 'catalog_fallback')
    `;
    const params: Array<number | string> = [productId];

    if (normalizedVariantKey) {
      sql += ` AND REPLACE(LOWER(COALESCE(subTypeName, 'normal')), ' ', '') = ?`;
      params.push(normalizedVariantKey);
    }

    sql += ' ORDER BY date ASC';

    db.all(sql, params, (err, rows: any[]) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows || []);
      }
    });
  });
};

/**
 * Updates price history with unique identifier
 */
export const updatePriceHistoryWithIdentifier = async (
  productId: number,
  uniqueIdentifier: string
): Promise<void> => {
  const db = getDb();
  
  return new Promise((resolve, reject) => {
    const sql = 'UPDATE price_history SET uniqueIdentifier = ? WHERE productId = ?';
    
    db.run(sql, [uniqueIdentifier, productId], (err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
};

/**
 * Updates rolling averages with unique identifier
 */
export const updateRollingAveragesWithIdentifier = async (
  cardId: string,
  uniqueIdentifier: string
): Promise<void> => {
  const db = getDb();
  
  return new Promise((resolve, reject) => {
    const sql = 'UPDATE rolling_averages SET uniqueIdentifier = ? WHERE cardId = ?';
    
    db.run(sql, [uniqueIdentifier, cardId], (err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}; 