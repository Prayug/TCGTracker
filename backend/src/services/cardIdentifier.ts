import { getDb } from '../db/database';
import { resolveHistoryPointPrice } from '../utils/resolveListingPrice';
import { scoreVariantMatch } from '../utils/variantMatch';
import { sourceRank } from './topMoversQuality';
import { setsSharePrintFamily } from '../utils/setPrintFamily';
import type { CardLanguage } from './providers/contracts';

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
  language?: CardLanguage;
  matchName?: string;
}

export interface UniqueIdentifierOptions {
  language?: CardLanguage | string;
  /** ASCII name for JA cards; falls back to cardName when omitted. */
  matchName?: string;
}

const normalizeAsciiKey = (value: string): string =>
  value.toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Generates a unique identifier for a card based on its properties.
 * Format: setId|cardNumber|name|variantKey (normalized).
 * For Japanese cards, uses matchName (ASCII) so CJK display names do not wipe the key.
 */
export const generateUniqueIdentifier = (
  setId: string,
  cardNumber: string | undefined,
  cardName: string,
  variantKey: string = 'normal',
  options?: UniqueIdentifierOptions
): string => {
  const language = (options?.language || 'en').toLowerCase();
  const nameForKey =
    language === 'ja' && options?.matchName?.trim()
      ? options.matchName
      : cardName;
  const normalizedName = normalizeAsciiKey(nameForKey);
  const normalizedSetId = setId.toLowerCase().replace(/[^a-z0-9]/g, '');
  const normalizedCardNumber = cardNumber ? cardNumber.toLowerCase().replace(/[^a-z0-9]/g, '') : '';
  const normalizedVariantKey = variantKey.toLowerCase().replace(/[^a-z0-9]/g, '') || 'normal';
  const base = `${normalizedSetId}|${normalizedCardNumber}|${normalizedName}|${normalizedVariantKey}`;
  // Prefix JA UIDs so they never collide with EN rows that share set codes.
  return language === 'ja' ? `ja|${base}` : base;
};

/**
 * Stores or updates card mapping information
 */
export const storeCardMapping = async (
  cardData: Omit<CardIdentifier, 'uniqueIdentifier'>
): Promise<string> => {
  const db = getDb();
  const language = (cardData.language || 'en') as CardLanguage;
  const matchName = cardData.matchName || cardData.cardName;
  const uniqueIdentifier = generateUniqueIdentifier(
    cardData.setId,
    cardData.cardNumber,
    cardData.cardName,
    cardData.variantKey || 'normal',
    { language, matchName }
  );

  return new Promise((resolve, reject) => {
    const sql = `
      INSERT OR REPLACE INTO card_mappings 
      (cardId, productId, cardName, setId, setName, cardNumber, rarity, variantKey, tcgplayerProductId,
       uniqueIdentifier, language, matchName, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `;

    db.run(
      sql,
      [
        cardData.cardId,
        cardData.productId || null,
        cardData.cardName,
        cardData.setId,
        cardData.setName,
        cardData.cardNumber || null,
        cardData.rarity || null,
        cardData.variantKey || 'normal',
        cardData.tcgplayerProductId || null,
        uniqueIdentifier,
        language,
        matchName,
      ],
      function (err) {
        if (err) {
          reject(err);
        } else {
          resolve(uniqueIdentifier);
        }
      }
    );
  });
};

/**
 * Finds card mapping by unique identifier
 */
export const findCardByIdentifier = async (
  uniqueIdentifier: string
): Promise<CardIdentifier | null> => {
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
          uniqueIdentifier: row.uniqueIdentifier,
          language: row.language || 'en',
          matchName: row.matchName || row.cardName,
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

export const findCardByDetails = async (
  cardName: string,
  setId: string,
  cardNumber?: string,
  rarity?: string,
  variantKey?: string,
  productId?: string,
  language?: CardLanguage | string
): Promise<CardIdentifier | null> => {
  const normalizedVariantKey = variantKey
    ? variantKey.toLowerCase().replace(/[^a-z0-9]/g, '')
    : null;
  const isPromo = rarity === 'Promo' || setId.toLowerCase().includes('promo');
  const normalizedCardNumber = cardNumber
    ? cardNumber.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()
    : null;
  const normalizedSetId = setId.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  const langFilter = language ? String(language).toLowerCase() : null;

  const buildConditions = () => {
    const conditions: string[] = [];
    const params: any[] = [];
    conditions.push('(cardName = ? OR matchName = ?)');
    params.push(cardName, cardName);
    if (langFilter) {
      conditions.push("COALESCE(language, 'en') = ?");
      params.push(langFilter);
    }
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

  // Identity (set + collector number + name) wins over productId. Stale main-set
  // productIds on Trainer Gallery cards previously remapped TG16 → Brilliant Stars #68.
  if (cardNumber && setId) {
    const exact = buildConditions();
    const exactRow = await dbGet(
      `SELECT * FROM card_mappings WHERE ${exact.conditions.join(' AND ')} ORDER BY ${orderClause(exact.params)}`,
      exact.params
    );
    if (exactRow) return exactRow as CardIdentifier;
  }

  // productId is only a hint — reject when collector number or print family disagree.
  if (productId) {
    const row = await dbGet(
      `SELECT * FROM card_mappings WHERE tcgplayerProductId = ?
       ${langFilter ? 'AND COALESCE(language, \'en\') = ?' : ''}
       ORDER BY
         CASE WHEN ? IS NOT NULL AND REPLACE(LOWER(COALESCE(variantKey, 'normal')), ' ', '') = ? THEN 0 ELSE 1 END,
         CASE WHEN ? IS NOT NULL AND REPLACE(LOWER(COALESCE(cardNumber, '')), '-', '') = ? THEN 0 ELSE 1 END,
         CASE WHEN REPLACE(LOWER(COALESCE(setId, '')), ' ', '') = ? THEN 0 ELSE 1 END,
         updatedAt DESC
       LIMIT 1`,
      langFilter
        ? [
            productId,
            langFilter,
            normalizedVariantKey,
            normalizedVariantKey,
            normalizedCardNumber,
            normalizedCardNumber,
            normalizedSetId,
          ]
        : [
            productId,
            normalizedVariantKey,
            normalizedVariantKey,
            normalizedCardNumber,
            normalizedCardNumber,
            normalizedSetId,
          ]
    );
    if (row) {
      const mapped = row as CardIdentifier;
      const mappedNumber = mapped.cardNumber
        ? mapped.cardNumber.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()
        : null;
      // Stale main-set productIds must not win when the caller asked for TG16/SV49/etc.
      const numberConflicts =
        Boolean(normalizedCardNumber) &&
        Boolean(mappedNumber) &&
        mappedNumber !== normalizedCardNumber;
      if (!numberConflicts) {
        return mapped;
      }
    }
  }

  // Strategy 1: Exact match on cardName OR matchName (when not already tried)
  if (!(cardNumber && setId)) {
    const exact = buildConditions();
    const exactRow = await dbGet(
      `SELECT * FROM card_mappings WHERE ${exact.conditions.join(' AND ')} ORDER BY ${orderClause(exact.params)}`,
      exact.params
    );
    if (exactRow) return exactRow as CardIdentifier;
  }

  // Strategy 2: Lenient match (ignore special characters in name)
  const lenientParams: any[] = [cardName, cardName];
  let lenientSql = `SELECT * FROM card_mappings WHERE
      (REPLACE(REPLACE(REPLACE(cardName, '-', ''), ' ', ''), '★', '') =
       REPLACE(REPLACE(REPLACE(?, '-', ''), ' ', ''), '★', '')
       OR REPLACE(REPLACE(REPLACE(COALESCE(matchName, ''), '-', ''), ' ', ''), '★', '') =
       REPLACE(REPLACE(REPLACE(?, '-', ''), ' ', ''), '★', ''))
      ${isPromo ? "AND setName LIKE '%Promo%'" : 'AND (setId = ? OR setName LIKE ?)'}
      ${cardNumber ? "AND (REPLACE(LOWER(cardNumber), '-', '') = ? OR cardNumber IS NULL)" : ''}`;
  if (langFilter) {
    lenientSql += ` AND COALESCE(language, 'en') = ?`;
  }
  if (!isPromo) {
    lenientParams.push(setId, `%${setId}%`);
  }
  if (cardNumber) {
    lenientParams.push(cardNumber.replace(/[^a-zA-Z0-9]/g, '').toLowerCase());
  }
  if (langFilter) lenientParams.push(langFilter);
  if (normalizedVariantKey) lenientParams.push(normalizedVariantKey);

  const lenientRow = await dbGet(
    `${lenientSql} ORDER BY ${orderClause([])}`,
    lenientParams
  );
  if (lenientRow) return lenientRow as CardIdentifier;

  // Strategy 3: Fuzzy match (case-insensitive LIKE)
  const fuzzyParams: any[] = [`%${cardName.toLowerCase()}%`, `%${cardName.toLowerCase()}%`];
  let fuzzySql = `SELECT * FROM card_mappings WHERE
     (LOWER(cardName) LIKE ? OR LOWER(COALESCE(matchName, '')) LIKE ?)
     ${isPromo ? "AND setName LIKE '%Promo%'" : 'AND (setId = ? OR setName LIKE ?)'}`;
  if (langFilter) fuzzySql += ` AND COALESCE(language, 'en') = ?`;
  if (!isPromo) {
    fuzzyParams.push(setId, `%${setId}%`);
  }
  if (langFilter) fuzzyParams.push(langFilter);
  if (normalizedVariantKey) fuzzyParams.push(normalizedVariantKey);

  const fuzzyRow = await dbGet(`${fuzzySql} ORDER BY ${orderClause([])}`, fuzzyParams);
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
  language?: CardLanguage | string;
}): Promise<CardIdentifier | null> => {
  const db = getDb();
  const normalizedVariantKey =
    (params.variantKey || 'normal').toLowerCase().replace(/[^a-z0-9]/g, '') || 'normal';
  const normalizedSetId = params.setId.toLowerCase().replace(/[^a-z0-9]/g, '');
  const normalizedName = params.cardName.toLowerCase().replace(/[^a-z0-9]/g, '');
  const normalizedCardNumber = params.cardNumber
    ? params.cardNumber.toLowerCase().replace(/[^a-z0-9]/g, '')
    : null;
  const langFilter = params.language ? String(params.language).toLowerCase() : null;
  // When identity is known, ignore productId — stale SKUs must not exclude the right row.
  const useProductId = Boolean(params.productId) && !params.cardId && !normalizedCardNumber;

  return new Promise((resolve, reject) => {
    const sql = `
      SELECT *
      FROM card_mappings
      WHERE
        (? IS NULL OR cardId = ?)
        AND (? IS NULL OR tcgplayerProductId = ?)
        AND REPLACE(LOWER(setId), ' ', '') = ?
        AND (
          REPLACE(LOWER(cardName), ' ', '') = ?
          OR REPLACE(LOWER(COALESCE(matchName, '')), ' ', '') = ?
        )
        AND REPLACE(LOWER(COALESCE(variantKey, 'normal')), ' ', '') = ?
        AND (
          ? IS NULL
          OR REPLACE(LOWER(COALESCE(cardNumber, '')), '-', '') = ?
        )
        AND (? IS NULL OR COALESCE(language, 'en') = ?)
      ORDER BY updatedAt DESC
      LIMIT 1
    `;

    db.get(
      sql,
      [
        params.cardId || null,
        params.cardId || null,
        useProductId ? params.productId : null,
        useProductId ? params.productId : null,
        normalizedSetId,
        normalizedName,
        normalizedName,
        normalizedVariantKey,
        normalizedCardNumber,
        normalizedCardNumber,
        langFilter,
        langFilter,
      ],
      (err, row) => {
        if (err) reject(err);
        else resolve((row as CardIdentifier) || null);
      }
    );
  });
};

/**
 * Gets all TCGCSV price history for a specific card using its unique identifier
 */
/** `set|number|name|` so Cardmarket sibling UIDs share one chart series. */
export const siblingIdentifierPrefix = (uniqueIdentifier: string): string =>
  uniqueIdentifier.replace(/\|[^|]+$/, '|');

const HISTORY_FINISH_SIBLINGS = [
  'holofoil',
  'unlimitedholofoil',
  '1steditionholofoil',
  'normal',
  'unlimited',
  'reverseholofoil',
  '1stedition',
] as const;

export const siblingIdentifiersForLookup = (uniqueIdentifier: string): string[] => {
  const prefix = siblingIdentifierPrefix(uniqueIdentifier);
  return Array.from(
    new Set([uniqueIdentifier, ...HISTORY_FINISH_SIBLINGS.map((finish) => `${prefix}${finish}`)])
  );
};

export const getCardPriceHistory = async (uniqueIdentifier: string): Promise<any[]> => {
  const db = getDb();
  const identifiers = siblingIdentifiersForLookup(uniqueIdentifier);
  const placeholders = identifiers.map(() => '?').join(', ');

  return new Promise((resolve, reject) => {
    const sql = `
      SELECT * FROM price_history 
      WHERE uniqueIdentifier IN (${placeholders})
      AND source IN ('tcgcsv', 'tcgdex', 'catalog_fallback', 'tcgdex_ja', 'cardmarket', 'pricecharting_raw')
      ORDER BY date ASC
    `;

    db.all(sql, identifiers, (err, rows: any[]) => {
      if (err) {
        reject(err);
      } else {
        resolve((rows || []).map(sanitizeHistoryRow));
      }
    });
  });
};

const sanitizeHistoryRow = <
  T extends {
    marketPrice?: number | null;
    price?: number | null;
    lowPrice?: number | null;
    highPrice?: number | null;
  },
>(
  row: T
): T => {
  const resolved = resolveHistoryPointPrice(row);
  if (resolved <= 0) return row;
  return {
    ...row,
    marketPrice: resolved,
    price: resolved,
  };
};

/** Prefer exact variant rows; holofoil must NOT match reverseHolofoil via substring. */
export const selectPriceHistoryForVariant = (
  rows: Array<{
    date: string;
    subTypeName?: string | null;
    marketPrice?: number;
    price?: number;
    source?: string | null;
  }>,
  variantKey?: string
): typeof rows => {
  if (!rows.length) return rows;

  const byDate = new Map<string, { row: (typeof rows)[0]; score: number }>();
  for (const row of rows) {
    const price = row.marketPrice ?? row.price ?? 0;
    if (price <= 0) continue;
    const dateKey = row.date.includes('T') ? row.date.split('T')[0] : row.date;
    const score = scoreVariantMatch(variantKey, row.subTypeName);
    if (score <= 0) continue;
    const existing = byDate.get(dateKey);
    const betterSource =
      existing &&
      score === existing.score &&
      sourceRank(row.source || '') < sourceRank(existing.row.source || '');
    if (!existing || score > existing.score || betterSource) {
      byDate.set(dateKey, { row, score });
    }
  }

  // Never fall back to mismatched finishes — sparse exact history beats a polluted chart.
  return Array.from(byDate.values())
    .map(({ row }) => row)
    .sort((a, b) => a.date.localeCompare(b.date));
};

export const getCardPriceHistoryForProduct = async (
  productId: number,
  variantKey?: string,
  options?: { setName?: string | null; uniqueIdentifier?: string | null }
): Promise<any[]> => {
  const db = getDb();

  return new Promise((resolve, reject) => {
    const sql = `
      SELECT * FROM price_history
      WHERE productId = ?
      AND source IN ('tcgcsv', 'tcgdex', 'catalog_fallback', 'tcgdex_ja', 'cardmarket', 'pricecharting_raw')
      ORDER BY date ASC
    `;

    db.all(sql, [productId], (err, rows: any[]) => {
      if (err) {
        reject(err);
      } else {
        let filtered = (rows || []).map(sanitizeHistoryRow);
        // Never stitch main-set history onto a Trainer Gallery / subset SKU that
        // accidentally shares a TCGPlayer productId.
        if (options?.uniqueIdentifier) {
          filtered = filtered.filter((r) => r.uniqueIdentifier === options.uniqueIdentifier);
        } else if (options?.setName) {
          filtered = filtered.filter(
            (r) => !r.groupName || setsSharePrintFamily(r.groupName, options.setName)
          );
        }
        resolve(selectPriceHistoryForVariant(filtered, variantKey));
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
