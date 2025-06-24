import { getDb } from '../db/database';

export interface CardIdentifier {
  cardId: string;
  productId?: number;
  cardName: string;
  setId: string;
  setName: string;
  cardNumber?: string;
  rarity?: string;
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
  cardName: string
): string => {
  const normalizedName = cardName.toLowerCase().replace(/[^a-z0-9]/g, '');
  const normalizedSetId = setId.toLowerCase().replace(/[^a-z0-9]/g, '');
  const normalizedCardNumber = cardNumber ? cardNumber.replace(/[^a-z0-9]/g, '') : '';
  
  return `${normalizedSetId}|${normalizedCardNumber}|${normalizedName}`;
};

/**
 * Stores or updates card mapping information
 */
export const storeCardMapping = async (cardData: Omit<CardIdentifier, 'uniqueIdentifier'>): Promise<string> => {
  const db = getDb();
  const uniqueIdentifier = generateUniqueIdentifier(cardData.setId, cardData.cardNumber, cardData.cardName);
  
  return new Promise((resolve, reject) => {
    const sql = `
      INSERT OR REPLACE INTO card_mappings 
      (cardId, productId, cardName, setId, setName, cardNumber, rarity, tcgplayerProductId, uniqueIdentifier, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `;
    
    db.run(sql, [
      cardData.cardId,
      cardData.productId || null,
      cardData.cardName,
      cardData.setId,
      cardData.setName,
      cardData.cardNumber || null,
      cardData.rarity || null,
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
  productId?: string
): Promise<CardIdentifier | null> => {
  const db = getDb();
  
  return new Promise((resolve, reject) => {
    // Priority 1: Match by tcgplayerProductId if available
    if (productId) {
      const sql = 'SELECT * FROM card_mappings WHERE tcgplayerProductId = ? LIMIT 1';
      db.get(sql, [productId], (err, row: any) => {
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
      
      let sql = 'SELECT * FROM card_mappings';
      const params: any[] = [];
      const conditions: string[] = [];

      // Card Name is always required
      conditions.push('cardName = ?');
      params.push(cardName);

      // Set matching logic
      if (isPromo) {
        // For promos, be more lenient with the set name
        conditions.push("setName LIKE '%Promo%'");
      } else {
        // For standard sets, be stricter
        conditions.push('(setId = ? OR setName LIKE ?)');
        params.push(setId, `%${setId}%`);
      }

      // Number matching logic
      if (cardNumber) {
        // Normalize both numbers by removing non-alphanumeric chars for a better match
        const normalizedCardNumber = cardNumber.replace(/[^a-zA-Z0-9]/g, '');
        conditions.push("(REPLACE(LOWER(cardNumber), '-', '') = ? OR REPLACE(LOWER(cardNumber), ' ', '') = ?)");
        params.push(normalizedCardNumber.toLowerCase(), normalizedCardNumber.toLowerCase());
      }
      
      // Rarity matching
      if (rarity) {
        conditions.push('rarity = ?');
        params.push(rarity);
      }

      sql += ' WHERE ' + conditions.join(' AND ');
      sql += ' ORDER BY length(cardNumber) ASC, createdAt DESC LIMIT 1';

      db.get(sql, params, (err, row: any) => {
        if (err) {
          reject(err);
        } else if (row) {
          resolve(row as CardIdentifier);
        } else {
          // If no match, try generating a unique identifier as a fallback
          const uniqueIdentifier = generateUniqueIdentifier(setId, cardNumber, cardName);
          findCardByIdentifier(uniqueIdentifier).then(resolve).catch(reject);
        }
      });
    }
  });
};

/**
 * Gets all TCGCSV price history for a specific card using its unique identifier
 */
export const getCardPriceHistory = async (uniqueIdentifier: string): Promise<any[]> => {
  const db = getDb();
  
  return new Promise((resolve, reject) => {
    const sql = `
      SELECT * FROM price_history 
      WHERE uniqueIdentifier = ? 
      AND source = 'tcgcsv'
      ORDER BY date ASC
    `;
    
    db.all(sql, [uniqueIdentifier], (err, rows) => {
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