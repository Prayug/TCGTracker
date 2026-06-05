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
const dbGet = (sql: string, params: any[] = []): Promise<any> => {
  const db = getDb();
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

const dbAll = (sql: string, params: any[] = []): Promise<any[]> => {
  const db = getDb();
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
};

export const findCardByDetails = async (
  cardName: string,
  setId: string,
  cardNumber?: string,
  rarity?: string,
  variantKey?: string,
  productId?: string
): Promise<CardIdentifier | null> => {
  const normalizedVariantKey = variantKey
    ? variantKey.toLowerCase().replace(/[^a-z0-9]/g, '')
    : null;
  const isPromo = (rarity === 'Promo' || setId.toLowerCase().includes('promo'));
  const normalizedCardNumber = cardNumber
    ? cardNumber.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()
    : null;

  // Priority 1: Match by tcgplayerProductId if available
  if (productId) {
    const normalizedSetId = setId.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    const row = await dbGet(
      `SELECT * FROM card_mappings WHERE tcgplayerProductId = ?
       ORDER BY
         CASE WHEN ? IS NOT NULL AND REPLACE(LOWER(COALESCE(variantKey, 'normal')), ' ', '') = ? THEN 0 ELSE 1 END,
         CASE WHEN ? IS NOT NULL AND REPLACE(LOWER(COALESCE(cardNumber, '')), '-', '') = ? THEN 0 ELSE 1 END,
         CASE WHEN REPLACE(LOWER(COALESCE(setId, '')), ' ', '') = ? THEN 0 ELSE 1 END,
         updatedAt DESC
       LIMIT 1`,
      [productId, normalizedVariantKey, normalizedVariantKey, normalizedCardNumber, normalizedCardNumber, normalizedSetId]
    );
    if (row) return row as CardIdentifier;
  }

  // Strategy 1: Exact match
  const buildConditions = () => {
    const conditions: string[] = [];
    const params: any[] = [];
    conditions.push('cardName = ?');
    params.push(cardName);
    if (isPromo) {
      conditions.push("setName LIKE '%Promo%'");
    } else {
      conditions.push('(setId = ? OR setName LIKE ?)');
      params.push(setId, `%${setId}%`);
    }
    if (cardNumber) {
      const ccn = cardNumber.replace(/[^a-zA-Z0-9]/g, '');
      conditions.push("REPLACE(LOWER(cardNumber), '-', '') = ?");
      params.push(ccn.toLowerCase());
    }
    return { conditions, params };
  };

  const orderClause = (params: any[]) => {
    if (normalizedVariantKey) {
      params.push(normalizedVariantKey);
      return "CASE WHEN REPLACE(LOWER(COALESCE(variantKey, 'normal')), ' ', '') = ? THEN 0 ELSE 1 END, length(cardNumber) ASC, createdAt DESC LIMIT 1";
    }
    return 'length(cardNumber) ASC, createdAt DESC LIMIT 1';
  };

  // Exact match
  const exact = buildConditions();
  const exactRow = await dbGet(
    `SELECT * FROM card_mappings WHERE ${exact.conditions.join(' AND ')} ORDER BY ${orderClause(exact.params)}`,
    exact.params
  );
  if (exactRow) return exactRow as CardIdentifier;

  // Strategy 2: Lenient match (ignore special characters in name)
  const lenientRow = await dbGet(
    `SELECT * FROM card_mappings WHERE
      REPLACE(REPLACE(REPLACE(cardName, '-', ''), ' ', ''), '★', '') =
      REPLACE(REPLACE(REPLACE(?, '-', ''), ' ', ''), '★', '')
      ${isPromo ? "AND setName LIKE '%Promo%'" : 'AND (setId = ? OR setName LIKE ?)'}
      ${cardNumber ? "AND (REPLACE(LOWER(cardNumber), '-', '') = ? OR cardNumber IS NULL)" : ''}
      ORDER BY ${orderClause([])}`,
    (() => {
      const p: any[] = [cardName];
      if (!isPromo) { p.push(setId, `%${setId}%`); }
      if (cardNumber) { p.push(cardNumber.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()); }
      if (normalizedVariantKey) p.push(normalizedVariantKey);
      return p;
    })()
  );
  if (lenientRow) return lenientRow as CardIdentifier;

  // Strategy 3: Fuzzy match (case-insensitive LIKE)
  const fuzzyRow = await dbGet(
    `SELECT * FROM card_mappings WHERE LOWER(cardName) LIKE ?
     ${isPromo ? "AND setName LIKE '%Promo%'" : 'AND (setId = ? OR setName LIKE ?)'}
     ORDER BY ${orderClause([])}`,
    (() => {
      const p: any[] = [`%${cardName.toLowerCase()}%`];
      if (!isPromo) { p.push(setId, `%${setId}%`); }
      if (normalizedVariantKey) p.push(normalizedVariantKey);
      return p;
    })()
  );
  if (fuzzyRow) return fuzzyRow as CardIdentifier;

  return null;
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
  
  return new Promise((resolve, reject) => {
    const sql = `
      SELECT * FROM price_history 
      WHERE uniqueIdentifier = ?
      AND source IN ('tcgcsv', 'tcgdex', 'catalog_fallback')
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

const normalizeVariantKey = (value?: string | null): string => {
  if (!value) return 'normal';
  const compact = value.toLowerCase().replace(/[^a-z0-9]/g, '');
  return compact || 'normal';
};

/** Prefer exact variant rows; fall back to fuzzy subtype match so holofoil includes 1stEditionHolofoil. */
export const selectPriceHistoryForVariant = (
  rows: Array<{ date: string; subTypeName?: string | null; marketPrice?: number; price?: number }>,
  variantKey?: string
): typeof rows => {
  if (!rows.length) return rows;

  const preferred = normalizeVariantKey(variantKey);
  const scoreRow = (subTypeName?: string | null): number => {
    const rowVariant = normalizeVariantKey(subTypeName);
    if (rowVariant === preferred) return 3;
    if (preferred !== 'normal' && rowVariant.includes(preferred)) return 2;
    if (preferred === 'normal' && (rowVariant === 'normal' || rowVariant === 'unlimited')) return 2;
    return 0;
  };

  const byDate = new Map<string, { row: (typeof rows)[0]; score: number }>();
  for (const row of rows) {
    const price = row.marketPrice ?? row.price ?? 0;
    if (price <= 0) continue;
    const dateKey = row.date.includes('T') ? row.date.split('T')[0] : row.date;
    const score = scoreRow(row.subTypeName);
    const existing = byDate.get(dateKey);
    if (!existing || score > existing.score) {
      byDate.set(dateKey, { row, score });
    }
  }

  const deduped = Array.from(byDate.values())
    .filter(({ score }) => score > 0)
    .map(({ row }) => row);

  // If variant filter removed almost everything, keep best row per date from full set.
  if (deduped.length === 0 || deduped.length < Math.min(10, rows.length * 0.25)) {
    byDate.clear();
    for (const row of rows) {
      const price = row.marketPrice ?? row.price ?? 0;
      if (price <= 0) continue;
      const dateKey = row.date.includes('T') ? row.date.split('T')[0] : row.date;
      const score = scoreRow(row.subTypeName);
      const existing = byDate.get(dateKey);
      if (!existing || score > existing.score) {
        byDate.set(dateKey, { row, score });
      }
    }
    return Array.from(byDate.values())
      .sort((a, b) => a.row.date.localeCompare(b.row.date))
      .map(({ row }) => row);
  }

  return deduped.sort((a, b) => a.date.localeCompare(b.date));
};

export const getCardPriceHistoryForProduct = async (
  productId: number,
  variantKey?: string
): Promise<any[]> => {
  const db = getDb();

  return new Promise((resolve, reject) => {
    const sql = `
      SELECT * FROM price_history
      WHERE productId = ?
      AND source IN ('tcgcsv', 'tcgdex', 'catalog_fallback')
      ORDER BY date ASC
    `;

    db.all(sql, [productId], (err, rows: any[]) => {
      if (err) {
        reject(err);
      } else {
        resolve(selectPriceHistoryForVariant(rows || [], variantKey));
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

 