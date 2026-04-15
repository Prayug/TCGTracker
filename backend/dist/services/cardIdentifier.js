"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateRollingAveragesWithIdentifier = exports.updatePriceHistoryWithIdentifier = exports.getCardPriceHistoryForProduct = exports.getCardPriceHistory = exports.findExactCardByDetails = exports.findCardByDetails = exports.findCardByIdentifier = exports.storeCardMapping = exports.generateUniqueIdentifier = void 0;
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
const storeCardMapping = (cardData) => __awaiter(void 0, void 0, void 0, function* () {
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
});
exports.storeCardMapping = storeCardMapping;
/**
 * Finds card mapping by unique identifier
 */
const findCardByIdentifier = (uniqueIdentifier) => __awaiter(void 0, void 0, void 0, function* () {
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
});
exports.findCardByIdentifier = findCardByIdentifier;
/**
 * Finds card mapping by card name, set, and optional card number
 */
const findCardByDetails = (cardName, setId, cardNumber, rarity, variantKey, productId) => __awaiter(void 0, void 0, void 0, function* () {
    const db = (0, database_1.getDb)();
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
            db.get(sql, [
                productId,
                normalizedVariantKey,
                normalizedVariantKey,
                normalizedCardNumber,
                normalizedCardNumber,
                normalizedSetId,
            ], (err, row) => {
                if (err)
                    return reject(err);
                if (row)
                    return resolve(row);
                // If not found, continue to other checks
                findWithOtherDetails();
            });
        }
        else {
            findWithOtherDetails();
        }
        function findWithOtherDetails() {
            const isPromo = (rarity === 'Promo' || setId.toLowerCase().includes('promo'));
            // Try multiple matching strategies
            tryExactMatch()
                .then(result => {
                if (result) {
                    resolve(result);
                    return null; // Stop the chain
                }
                return tryLenientMatch();
            })
                .then(result => {
                if (result) {
                    resolve(result);
                    return null; // Stop the chain
                }
                return tryFuzzyMatch();
            })
                .then(result => {
                if (result) {
                    resolve(result);
                }
                else {
                    resolve(null);
                }
            })
                .catch(reject);
            // Strategy 1: Exact match
            function tryExactMatch() {
                return new Promise((res, rej) => {
                    let sql = 'SELECT * FROM card_mappings';
                    const params = [];
                    const conditions = [];
                    // Exact card name match
                    conditions.push('cardName = ?');
                    params.push(cardName);
                    // Set matching
                    if (isPromo) {
                        conditions.push("setName LIKE '%Promo%'");
                    }
                    else {
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
                    }
                    else {
                        sql += ' ORDER BY length(cardNumber) ASC, createdAt DESC LIMIT 1';
                    }
                    db.get(sql, params, (err, row) => {
                        if (err)
                            rej(err);
                        else
                            res(row || null);
                    });
                });
            }
            // Strategy 2: Lenient match (ignore special characters in name)
            function tryLenientMatch() {
                return new Promise((res, rej) => {
                    // Normalize the card name by removing special characters
                    const normalizedName = cardName.replace(/[^a-zA-Z0-9\s]/g, '').trim();
                    let sql = `SELECT * FROM card_mappings WHERE 
            REPLACE(REPLACE(REPLACE(cardName, '-', ''), ' ', ''), '★', '') = 
            REPLACE(REPLACE(REPLACE(?, '-', ''), ' ', ''), '★', '')`;
                    const params = [cardName];
                    // Set matching
                    if (isPromo) {
                        sql += " AND setName LIKE '%Promo%'";
                    }
                    else {
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
                    }
                    else {
                        sql += ' ORDER BY length(cardNumber) ASC, createdAt DESC LIMIT 1';
                    }
                    db.get(sql, params, (err, row) => {
                        if (err)
                            rej(err);
                        else
                            res(row || null);
                    });
                });
            }
            // Strategy 3: Fuzzy match (case-insensitive LIKE)
            function tryFuzzyMatch() {
                return new Promise((res, rej) => {
                    let sql = 'SELECT * FROM card_mappings WHERE LOWER(cardName) LIKE ?';
                    const params = [`%${cardName.toLowerCase()}%`];
                    // Set matching
                    if (isPromo) {
                        sql += " AND setName LIKE '%Promo%'";
                    }
                    else {
                        sql += ' AND (setId = ? OR setName LIKE ?)';
                        params.push(setId, `%${setId}%`);
                    }
                    if (normalizedVariantKey) {
                        sql += " ORDER BY CASE WHEN REPLACE(LOWER(COALESCE(variantKey, 'normal')), ' ', '') = ? THEN 0 ELSE 1 END, length(cardNumber) ASC, createdAt DESC LIMIT 1";
                        params.push(normalizedVariantKey);
                    }
                    else {
                        sql += ' ORDER BY length(cardNumber) ASC, createdAt DESC LIMIT 1';
                    }
                    db.get(sql, params, (err, row) => {
                        if (err)
                            rej(err);
                        else
                            res(row || null);
                    });
                });
            }
        }
    });
});
exports.findCardByDetails = findCardByDetails;
const findExactCardByDetails = (params) => __awaiter(void 0, void 0, void 0, function* () {
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
});
exports.findExactCardByDetails = findExactCardByDetails;
/**
 * Gets all TCGCSV price history for a specific card using its unique identifier
 */
const getCardPriceHistory = (uniqueIdentifier) => __awaiter(void 0, void 0, void 0, function* () {
    const db = (0, database_1.getDb)();
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
            }
            else {
                resolve(rows || []);
            }
        });
    });
});
exports.getCardPriceHistory = getCardPriceHistory;
const getCardPriceHistoryForProduct = (productId, variantKey) => __awaiter(void 0, void 0, void 0, function* () {
    const db = (0, database_1.getDb)();
    const normalizedVariantKey = variantKey
        ? variantKey.toLowerCase().replace(/[^a-z0-9]/g, '')
        : null;
    return new Promise((resolve, reject) => {
        let sql = `
      SELECT * FROM price_history
      WHERE productId = ?
      AND source IN ('tcgcsv', 'tcgdex', 'catalog_fallback')
    `;
        const params = [productId];
        if (normalizedVariantKey) {
            sql += ` AND REPLACE(LOWER(COALESCE(subTypeName, 'normal')), ' ', '') = ?`;
            params.push(normalizedVariantKey);
        }
        sql += ' ORDER BY date ASC';
        db.all(sql, params, (err, rows) => {
            if (err) {
                reject(err);
            }
            else {
                resolve(rows || []);
            }
        });
    });
});
exports.getCardPriceHistoryForProduct = getCardPriceHistoryForProduct;
/**
 * Updates price history with unique identifier
 */
const updatePriceHistoryWithIdentifier = (productId, uniqueIdentifier) => __awaiter(void 0, void 0, void 0, function* () {
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
});
exports.updatePriceHistoryWithIdentifier = updatePriceHistoryWithIdentifier;
/**
 * Updates rolling averages with unique identifier
 */
const updateRollingAveragesWithIdentifier = (cardId, uniqueIdentifier) => __awaiter(void 0, void 0, void 0, function* () {
    const db = (0, database_1.getDb)();
    return new Promise((resolve, reject) => {
        const sql = 'UPDATE rolling_averages SET uniqueIdentifier = ? WHERE cardId = ?';
        db.run(sql, [uniqueIdentifier, cardId], (err) => {
            if (err) {
                reject(err);
            }
            else {
                resolve();
            }
        });
    });
});
exports.updateRollingAveragesWithIdentifier = updateRollingAveragesWithIdentifier;
