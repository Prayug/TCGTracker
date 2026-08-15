"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updatePriceHistoryWithIdentifier = exports.getCardPriceHistoryForProduct = exports.selectPriceHistoryForVariant = exports.getCardPriceHistory = exports.siblingIdentifiersForLookup = exports.siblingIdentifierPrefix = exports.findExactCardByDetails = exports.findCardByDetails = exports.findCardByIdentifier = exports.storeCardMapping = exports.generateUniqueIdentifier = void 0;
const database_1 = require("../db/database");
const resolveListingPrice_1 = require("../utils/resolveListingPrice");
const variantMatch_1 = require("../utils/variantMatch");
const topMoversQuality_1 = require("./topMoversQuality");
const setPrintFamily_1 = require("../utils/setPrintFamily");
const normalizeAsciiKey = (value) => value.toLowerCase().replace(/[^a-z0-9]/g, '');
/**
 * Generates a unique identifier for a card based on its properties.
 * Format: setId|cardNumber|name|variantKey (normalized).
 * For Japanese cards, uses matchName (ASCII) so CJK display names do not wipe the key.
 */
const generateUniqueIdentifier = (setId, cardNumber, cardName, variantKey = 'normal', options) => {
    var _a;
    const language = ((options === null || options === void 0 ? void 0 : options.language) || 'en').toLowerCase();
    const nameForKey = language === 'ja' && ((_a = options === null || options === void 0 ? void 0 : options.matchName) === null || _a === void 0 ? void 0 : _a.trim())
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
exports.generateUniqueIdentifier = generateUniqueIdentifier;
/**
 * Stores or updates card mapping information
 */
const storeCardMapping = async (cardData) => {
    const db = (0, database_1.getDb)();
    const language = (cardData.language || 'en');
    const matchName = cardData.matchName || cardData.cardName;
    const uniqueIdentifier = (0, exports.generateUniqueIdentifier)(cardData.setId, cardData.cardNumber, cardData.cardName, cardData.variantKey || 'normal', { language, matchName });
    return new Promise((resolve, reject) => {
        const sql = `
      INSERT OR REPLACE INTO card_mappings 
      (cardId, productId, cardName, setId, setName, cardNumber, rarity, variantKey, tcgplayerProductId,
       uniqueIdentifier, language, matchName, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
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
            uniqueIdentifier,
            language,
            matchName,
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
                    uniqueIdentifier: row.uniqueIdentifier,
                    language: row.language || 'en',
                    matchName: row.matchName || row.cardName,
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
const findCardByDetails = async (cardName, setId, cardNumber, rarity, variantKey, productId, language) => {
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
        const conditions = [];
        const params = [];
        conditions.push('(cardName = ? OR matchName = ?)');
        params.push(cardName, cardName);
        if (langFilter) {
            conditions.push("COALESCE(language, 'en') = ?");
            params.push(langFilter);
        }
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
    // Identity (set + collector number + name) wins over productId. Stale main-set
    // productIds on Trainer Gallery cards previously remapped TG16 → Brilliant Stars #68.
    if (cardNumber && setId) {
        const exact = buildConditions();
        const exactRow = await dbGet(`SELECT * FROM card_mappings WHERE ${exact.conditions.join(' AND ')} ORDER BY ${orderClause(exact.params)}`, exact.params);
        if (exactRow)
            return exactRow;
    }
    // productId is only a hint — reject when collector number or print family disagree.
    if (productId) {
        const row = await dbGet(`SELECT * FROM card_mappings WHERE tcgplayerProductId = ?
       ${langFilter ? 'AND COALESCE(language, \'en\') = ?' : ''}
       ORDER BY
         CASE WHEN ? IS NOT NULL AND REPLACE(LOWER(COALESCE(variantKey, 'normal')), ' ', '') = ? THEN 0 ELSE 1 END,
         CASE WHEN ? IS NOT NULL AND REPLACE(LOWER(COALESCE(cardNumber, '')), '-', '') = ? THEN 0 ELSE 1 END,
         CASE WHEN REPLACE(LOWER(COALESCE(setId, '')), ' ', '') = ? THEN 0 ELSE 1 END,
         updatedAt DESC
       LIMIT 1`, langFilter
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
            ]);
        if (row) {
            const mapped = row;
            const mappedNumber = mapped.cardNumber
                ? mapped.cardNumber.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()
                : null;
            // Stale main-set productIds must not win when the caller asked for TG16/SV49/etc.
            const numberConflicts = Boolean(normalizedCardNumber) &&
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
        const exactRow = await dbGet(`SELECT * FROM card_mappings WHERE ${exact.conditions.join(' AND ')} ORDER BY ${orderClause(exact.params)}`, exact.params);
        if (exactRow)
            return exactRow;
    }
    // Strategy 2: Lenient match (ignore special characters in name)
    const lenientParams = [cardName, cardName];
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
    if (langFilter)
        lenientParams.push(langFilter);
    if (normalizedVariantKey)
        lenientParams.push(normalizedVariantKey);
    const lenientRow = await dbGet(`${lenientSql} ORDER BY ${orderClause([])}`, lenientParams);
    if (lenientRow)
        return lenientRow;
    // Strategy 3: Fuzzy match (case-insensitive LIKE)
    const fuzzyParams = [`%${cardName.toLowerCase()}%`, `%${cardName.toLowerCase()}%`];
    let fuzzySql = `SELECT * FROM card_mappings WHERE
     (LOWER(cardName) LIKE ? OR LOWER(COALESCE(matchName, '')) LIKE ?)
     ${isPromo ? "AND setName LIKE '%Promo%'" : 'AND (setId = ? OR setName LIKE ?)'}`;
    if (langFilter)
        fuzzySql += ` AND COALESCE(language, 'en') = ?`;
    if (!isPromo) {
        fuzzyParams.push(setId, `%${setId}%`);
    }
    if (langFilter)
        fuzzyParams.push(langFilter);
    if (normalizedVariantKey)
        fuzzyParams.push(normalizedVariantKey);
    const fuzzyRow = await dbGet(`${fuzzySql} ORDER BY ${orderClause([])}`, fuzzyParams);
    if (fuzzyRow)
        return fuzzyRow;
    return null;
};
exports.findCardByDetails = findCardByDetails;
const findExactCardByDetails = async (params) => {
    const db = (0, database_1.getDb)();
    const normalizedVariantKey = (params.variantKey || 'normal').toLowerCase().replace(/[^a-z0-9]/g, '') || 'normal';
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
        db.get(sql, [
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
        ], (err, row) => {
            if (err)
                reject(err);
            else
                resolve(row || null);
        });
    });
};
exports.findExactCardByDetails = findExactCardByDetails;
/**
 * Gets all TCGCSV price history for a specific card using its unique identifier
 */
/** `set|number|name|` so Cardmarket sibling UIDs share one chart series. */
const siblingIdentifierPrefix = (uniqueIdentifier) => uniqueIdentifier.replace(/\|[^|]+$/, '|');
exports.siblingIdentifierPrefix = siblingIdentifierPrefix;
const HISTORY_FINISH_SIBLINGS = [
    'holofoil',
    'unlimitedholofoil',
    '1steditionholofoil',
    'normal',
    'unlimited',
    'reverseholofoil',
    '1stedition',
];
const siblingIdentifiersForLookup = (uniqueIdentifier) => {
    const prefix = (0, exports.siblingIdentifierPrefix)(uniqueIdentifier);
    return Array.from(new Set([uniqueIdentifier, ...HISTORY_FINISH_SIBLINGS.map((finish) => `${prefix}${finish}`)]));
};
exports.siblingIdentifiersForLookup = siblingIdentifiersForLookup;
const getCardPriceHistory = async (uniqueIdentifier) => {
    const db = (0, database_1.getDb)();
    const identifiers = (0, exports.siblingIdentifiersForLookup)(uniqueIdentifier);
    const placeholders = identifiers.map(() => '?').join(', ');
    return new Promise((resolve, reject) => {
        const sql = `
      SELECT * FROM price_history 
      WHERE uniqueIdentifier IN (${placeholders})
      AND source IN ('tcgcsv', 'tcgdex', 'catalog_fallback', 'tcgdex_ja', 'cardmarket', 'pricecharting_raw')
      ORDER BY date ASC
    `;
        db.all(sql, identifiers, (err, rows) => {
            if (err) {
                reject(err);
            }
            else {
                resolve((rows || []).map(sanitizeHistoryRow));
            }
        });
    });
};
exports.getCardPriceHistory = getCardPriceHistory;
const sanitizeHistoryRow = (row) => {
    const resolved = (0, resolveListingPrice_1.resolveHistoryPointPrice)(row);
    if (resolved <= 0)
        return row;
    return {
        ...row,
        marketPrice: resolved,
        price: resolved,
    };
};
/** Prefer exact variant rows; holofoil must NOT match reverseHolofoil via substring. */
const selectPriceHistoryForVariant = (rows, variantKey) => {
    var _a, _b;
    if (!rows.length)
        return rows;
    const byDate = new Map();
    for (const row of rows) {
        const price = (_b = (_a = row.marketPrice) !== null && _a !== void 0 ? _a : row.price) !== null && _b !== void 0 ? _b : 0;
        if (price <= 0)
            continue;
        const dateKey = row.date.includes('T') ? row.date.split('T')[0] : row.date;
        const score = (0, variantMatch_1.scoreVariantMatch)(variantKey, row.subTypeName);
        if (score <= 0)
            continue;
        const existing = byDate.get(dateKey);
        const betterSource = existing &&
            score === existing.score &&
            (0, topMoversQuality_1.sourceRank)(row.source || '') < (0, topMoversQuality_1.sourceRank)(existing.row.source || '');
        if (!existing || score > existing.score || betterSource) {
            byDate.set(dateKey, { row, score });
        }
    }
    // Never fall back to mismatched finishes — sparse exact history beats a polluted chart.
    return Array.from(byDate.values())
        .map(({ row }) => row)
        .sort((a, b) => a.date.localeCompare(b.date));
};
exports.selectPriceHistoryForVariant = selectPriceHistoryForVariant;
const getCardPriceHistoryForProduct = async (productId, variantKey, options) => {
    const db = (0, database_1.getDb)();
    return new Promise((resolve, reject) => {
        const sql = `
      SELECT * FROM price_history
      WHERE productId = ?
      AND source IN ('tcgcsv', 'tcgdex', 'catalog_fallback', 'tcgdex_ja', 'cardmarket', 'pricecharting_raw')
      ORDER BY date ASC
    `;
        db.all(sql, [productId], (err, rows) => {
            if (err) {
                reject(err);
            }
            else {
                let filtered = (rows || []).map(sanitizeHistoryRow);
                // Never stitch main-set history onto a Trainer Gallery / subset SKU that
                // accidentally shares a TCGPlayer productId.
                if (options === null || options === void 0 ? void 0 : options.uniqueIdentifier) {
                    filtered = filtered.filter((r) => r.uniqueIdentifier === options.uniqueIdentifier);
                }
                else if (options === null || options === void 0 ? void 0 : options.setName) {
                    filtered = filtered.filter((r) => !r.groupName || (0, setPrintFamily_1.setsSharePrintFamily)(r.groupName, options.setName));
                }
                resolve((0, exports.selectPriceHistoryForVariant)(filtered, variantKey));
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
