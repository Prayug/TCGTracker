"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updatePriceHistoryWithIdentifier = exports.getCardPriceHistoryForProduct = exports.selectPriceHistoryForVariant = exports.getCardPriceHistory = exports.findExactCardByDetails = exports.findCardByDetails = exports.findCardByIdentifier = exports.storeCardMapping = exports.generateUniqueIdentifier = void 0;
const database_1 = require("../db/database");
/**
 * Generates a unique identifier for a card based on its properties
 * Format: setId|cardNumber|cardName (normalized)
 */
const generateUniqueIdentifier = (setId, cardNumber, cardName, variantKey = 'normal') => {
    const normalizedName = cardName.toLowerCase().replace(/[^a-z0-9]/g, '');
    const normalizedSetId = setId.toLowerCase().replace(/[^a-z0-9]/g, '');
    const normalizedCardNumber = cardNumber ? cardNumber.replace(/[^a-z0-9]/g, '') : '';
    const normalizedVariantKey = variantKey.toLowerCase().replace(/[^a-z0-9]/g, '') || 'normal';
    return `${normalizedSetId}|${normalizedCardNumber}|${normalizedName}|${normalizedVariantKey}`;
};
exports.generateUniqueIdentifier = generateUniqueIdentifier;
/**
 * Stores or updates card mapping information
 */
const storeCardMapping = async (cardData) => {
    const db = (0, database_1.getDb)();
    const uniqueIdentifier = (0, exports.generateUniqueIdentifier)(cardData.setId, cardData.cardNumber, cardData.cardName, cardData.variantKey || 'normal');
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
        ], function (err) {
            if (err) {
                reject(err);
            }
            else {
                resolve(uniqueIdentifier);
            }
        });
    });
};
exports.storeCardMapping = storeCardMapping;
/**
 * Finds card mapping by unique identifier
 */
const findCardByIdentifier = async (uniqueIdentifier) => {
    const db = (0, database_1.getDb)();
    return new Promise((resolve, reject) => {
        const sql = 'SELECT * FROM card_mappings WHERE uniqueIdentifier = ?';
        db.get(sql, [uniqueIdentifier], (err, row) => {
            if (err) {
                reject(err);
            }
            else if (row) {
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
            }
            else {
                resolve(null);
            }
        });
    });
};
exports.findCardByIdentifier = findCardByIdentifier;
/**
 * Finds card mapping by card name, set, and optional card number
 */
const dbGet = (sql, params = []) => {
    const db = (0, database_1.getDb)();
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err)
                reject(err);
            else
                resolve(row);
        });
    });
};
const dbAll = (sql, params = []) => {
    const db = (0, database_1.getDb)();
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err)
                reject(err);
            else
                resolve(rows || []);
        });
    });
};
const findCardByDetails = async (cardName, setId, cardNumber, rarity, variantKey, productId) => {
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
        const row = await dbGet(`SELECT * FROM card_mappings WHERE tcgplayerProductId = ?
       ORDER BY
         CASE WHEN ? IS NOT NULL AND REPLACE(LOWER(COALESCE(variantKey, 'normal')), ' ', '') = ? THEN 0 ELSE 1 END,
         CASE WHEN ? IS NOT NULL AND REPLACE(LOWER(COALESCE(cardNumber, '')), '-', '') = ? THEN 0 ELSE 1 END,
         CASE WHEN REPLACE(LOWER(COALESCE(setId, '')), ' ', '') = ? THEN 0 ELSE 1 END,
         updatedAt DESC
       LIMIT 1`, [productId, normalizedVariantKey, normalizedVariantKey, normalizedCardNumber, normalizedCardNumber, normalizedSetId]);
        if (row)
            return row;
    }
    // Strategy 1: Exact match
    const buildConditions = () => {
        const conditions = [];
        const params = [];
        conditions.push('cardName = ?');
        params.push(cardName);
        if (isPromo) {
            conditions.push("setName LIKE '%Promo%'");
        }
        else {
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
    const orderClause = (params) => {
        if (normalizedVariantKey) {
            params.push(normalizedVariantKey);
            return "CASE WHEN REPLACE(LOWER(COALESCE(variantKey, 'normal')), ' ', '') = ? THEN 0 ELSE 1 END, length(cardNumber) ASC, createdAt DESC LIMIT 1";
        }
        return 'length(cardNumber) ASC, createdAt DESC LIMIT 1';
    };
    // Exact match
    const exact = buildConditions();
    const exactRow = await dbGet(`SELECT * FROM card_mappings WHERE ${exact.conditions.join(' AND ')} ORDER BY ${orderClause(exact.params)}`, exact.params);
    if (exactRow)
        return exactRow;
    // Strategy 2: Lenient match (ignore special characters in name)
    const lenientRow = await dbGet(`SELECT * FROM card_mappings WHERE
      REPLACE(REPLACE(REPLACE(cardName, '-', ''), ' ', ''), '★', '') =
      REPLACE(REPLACE(REPLACE(?, '-', ''), ' ', ''), '★', '')
      ${isPromo ? "AND setName LIKE '%Promo%'" : 'AND (setId = ? OR setName LIKE ?)'}
      ${cardNumber ? "AND (REPLACE(LOWER(cardNumber), '-', '') = ? OR cardNumber IS NULL)" : ''}
      ORDER BY ${orderClause([])}`, (() => {
        const p = [cardName];
        if (!isPromo) {
            p.push(setId, `%${setId}%`);
        }
        if (cardNumber) {
            p.push(cardNumber.replace(/[^a-zA-Z0-9]/g, '').toLowerCase());
        }
        if (normalizedVariantKey)
            p.push(normalizedVariantKey);
        return p;
    })());
    if (lenientRow)
        return lenientRow;
    // Strategy 3: Fuzzy match (case-insensitive LIKE)
    const fuzzyRow = await dbGet(`SELECT * FROM card_mappings WHERE LOWER(cardName) LIKE ?
     ${isPromo ? "AND setName LIKE '%Promo%'" : 'AND (setId = ? OR setName LIKE ?)'}
     ORDER BY ${orderClause([])}`, (() => {
        const p = [`%${cardName.toLowerCase()}%`];
        if (!isPromo) {
            p.push(setId, `%${setId}%`);
        }
        if (normalizedVariantKey)
            p.push(normalizedVariantKey);
        return p;
    })());
    if (fuzzyRow)
        return fuzzyRow;
    return null;
};
exports.findCardByDetails = findCardByDetails;
const findExactCardByDetails = async (params) => {
    const db = (0, database_1.getDb)();
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
        db.get(sql, [
            params.cardId || null,
            params.cardId || null,
            params.productId || null,
            params.productId || null,
            normalizedSetId,
            normalizedName,
            normalizedVariantKey,
            normalizedCardNumber,
            normalizedCardNumber,
        ], (err, row) => {
            if (err) {
                reject(err);
            }
            else {
                resolve(row || null);
            }
        });
    });
};
exports.findExactCardByDetails = findExactCardByDetails;
/**
 * Gets all TCGCSV price history for a specific card using its unique identifier
 */
const getCardPriceHistory = async (uniqueIdentifier) => {
    const db = (0, database_1.getDb)();
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
            }
            else {
                resolve(rows || []);
            }
        });
    });
};
exports.getCardPriceHistory = getCardPriceHistory;
const normalizeVariantKey = (value) => {
    if (!value)
        return 'normal';
    const compact = value.toLowerCase().replace(/[^a-z0-9]/g, '');
    return compact || 'normal';
};
/** Prefer exact variant rows; fall back to fuzzy subtype match so holofoil includes 1stEditionHolofoil. */
const selectPriceHistoryForVariant = (rows, variantKey) => {
    var _a, _b, _c, _d;
    if (!rows.length)
        return rows;
    const preferred = normalizeVariantKey(variantKey);
    const scoreRow = (subTypeName) => {
        const rowVariant = normalizeVariantKey(subTypeName);
        if (rowVariant === preferred)
            return 3;
        if (preferred !== 'normal' && rowVariant.includes(preferred))
            return 2;
        if (preferred === 'normal' && (rowVariant === 'normal' || rowVariant === 'unlimited'))
            return 2;
        return 0;
    };
    const byDate = new Map();
    for (const row of rows) {
        const price = (_b = (_a = row.marketPrice) !== null && _a !== void 0 ? _a : row.price) !== null && _b !== void 0 ? _b : 0;
        if (price <= 0)
            continue;
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
            const price = (_d = (_c = row.marketPrice) !== null && _c !== void 0 ? _c : row.price) !== null && _d !== void 0 ? _d : 0;
            if (price <= 0)
                continue;
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
exports.selectPriceHistoryForVariant = selectPriceHistoryForVariant;
const getCardPriceHistoryForProduct = async (productId, variantKey) => {
    const db = (0, database_1.getDb)();
    return new Promise((resolve, reject) => {
        const sql = `
      SELECT * FROM price_history
      WHERE productId = ?
      AND source IN ('tcgcsv', 'tcgdex', 'catalog_fallback')
      ORDER BY date ASC
    `;
        db.all(sql, [productId], (err, rows) => {
            if (err) {
                reject(err);
            }
            else {
                resolve((0, exports.selectPriceHistoryForVariant)(rows || [], variantKey));
            }
        });
    });
};
exports.getCardPriceHistoryForProduct = getCardPriceHistoryForProduct;
/**
 * Updates price history with unique identifier
 */
const updatePriceHistoryWithIdentifier = async (productId, uniqueIdentifier) => {
    const db = (0, database_1.getDb)();
    return new Promise((resolve, reject) => {
        const sql = 'UPDATE price_history SET uniqueIdentifier = ? WHERE productId = ?';
        db.run(sql, [uniqueIdentifier, productId], (err) => {
            if (err) {
                reject(err);
            }
            else {
                resolve();
            }
        });
    });
};
exports.updatePriceHistoryWithIdentifier = updatePriceHistoryWithIdentifier;
