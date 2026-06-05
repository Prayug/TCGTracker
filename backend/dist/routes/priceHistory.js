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
const express_1 = require("express");
const database_1 = require("../db/database");
const logger_1 = require("../utils/logger");
const cardIdentifier_1 = require("../services/cardIdentifier");
const router = (0, express_1.Router)();
const clampNumber = (value, min, max) => Math.min(Math.max(value, min), max);
// Get price history for a specific card using card details
router.get('/card', (req, res) => {
    const { cardName, setId, cardNumber, variant = 'normal' } = req.query;
    if (!cardName || !setId) {
        res.status(400).json({
            error: 'cardName and setId are required query parameters.'
        });
        return;
    }
    const safeCardName = String(cardName).trim();
    const safeSetId = String(setId).trim();
    const safeCardNumber = cardNumber ? String(cardNumber).trim() : undefined;
    const safeVariant = String(variant).trim();
    // Generate unique identifier
    const uniqueIdentifier = (0, cardIdentifier_1.generateUniqueIdentifier)(safeSetId, safeCardNumber, safeCardName, safeVariant);
    // Get price history using the unique identifier
    (0, cardIdentifier_1.getCardPriceHistory)(uniqueIdentifier)
        .then((priceHistory) => {
        if (priceHistory.length === 0) {
            res.status(404).json({
                message: 'No price history found for the specified card',
                uniqueIdentifier
            });
            return;
        }
        res.json({
            uniqueIdentifier,
            cardDetails: {
                cardName: safeCardName,
                setId: safeSetId,
                cardNumber: safeCardNumber,
                variant: safeVariant,
            },
            priceHistory
        });
    })
        .catch(err => {
        res.status(500).json({
            error: 'Database error fetching price history.',
            details: err.message
        });
    });
});
// Enhanced match endpoint with better card identification
router.get('/match', (req, res) => {
    const { cardName, setName, cardNumber, setId, variant = 'normal', productId } = req.query;
    const db = (0, database_1.getDb)();
    if (!cardName || (!setName && !setId)) {
        res.status(400).json({
            error: 'cardName and either setName or setId are required query parameters.'
        });
        return;
    }
    const safeCardName = String(cardName).trim();
    const safeSetName = setName ? String(setName).trim() : '';
    const safeSetId = setId ? String(setId).trim() : safeSetName.toLowerCase().replace(/[^a-z0-9]/g, '');
    const safeCardNumber = cardNumber ? String(cardNumber).trim() : undefined;
    const safeVariant = String(variant).trim();
    const safeProductId = productId ? String(productId).trim() : undefined;
    // First try to find using our card mappings
    (0, cardIdentifier_1.findCardByDetails)(safeCardName, safeSetId, safeCardNumber, undefined, safeVariant, safeProductId)
        .then(mapping => {
        if (mapping) {
            // Found in our mappings, fetch history for exact product first.
            const historyPromise = mapping.productId
                ? (0, cardIdentifier_1.getCardPriceHistoryForProduct)(mapping.productId, safeVariant)
                : (0, cardIdentifier_1.getCardPriceHistory)(mapping.uniqueIdentifier);
            return historyPromise
                .then((priceHistory) => ({
                matchedProduct: {
                    productId: mapping.productId,
                    productName: mapping.cardName,
                    groupName: mapping.setName,
                    uniqueIdentifier: mapping.uniqueIdentifier,
                    variant: mapping.variantKey || safeVariant,
                },
                priceHistory
            }));
        }
        return fallbackMatch(safeCardName, safeSetName, safeCardNumber, db);
    })
        .then(result => {
        res.json(result);
    })
        .catch(err => {
        res.status(500).json({
            error: 'Database error during card matching.',
            details: err.message
        });
    });
});
// New endpoint specifically for getting price history by card details
router.get('/history', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { cardId, cardName, setName, cardNumber, setId, rarity, productId, variant = 'normal' } = req.query;
    if (!cardName || !setName) {
        return res.status(400).json({ error: 'cardName and setName are required.' });
    }
    try {
        const safeCardName = String(cardName);
        const safeSetName = String(setName);
        const safeSetId = String(setId || setName);
        const safeCardNumber = cardNumber ? String(cardNumber) : '';
        const safeVariant = String(variant || 'normal');
        const safeCardId = cardId ? String(cardId) : undefined;
        const exactCard = yield (0, cardIdentifier_1.findExactCardByDetails)({
            cardId: safeCardId,
            productId: productId ? String(productId) : undefined,
            cardName: safeCardName,
            setId: safeSetId,
            cardNumber: safeCardNumber || undefined,
            variantKey: safeVariant,
        });
        if (exactCard) {
            let priceHistory = [];
            if (exactCard.productId) {
                priceHistory = yield (0, cardIdentifier_1.getCardPriceHistoryForProduct)(exactCard.productId, safeVariant);
            }
            const byIdentifier = yield (0, cardIdentifier_1.getCardPriceHistory)(exactCard.uniqueIdentifier);
            if (byIdentifier.length > priceHistory.length) {
                priceHistory = byIdentifier;
            }
            return res.json({
                priceHistory,
                productId: exactCard.productId,
                uniqueIdentifier: exactCard.uniqueIdentifier,
                variant: exactCard.variantKey || safeVariant,
            });
        }
        const card = yield (0, cardIdentifier_1.findCardByDetails)(safeCardName, safeSetId, safeCardNumber, rarity ? String(rarity) : undefined, safeVariant, productId ? String(productId) : undefined);
        if (card) {
            let priceHistory = [];
            if (card.productId) {
                priceHistory = yield (0, cardIdentifier_1.getCardPriceHistoryForProduct)(card.productId, safeVariant);
            }
            const byIdentifier = yield (0, cardIdentifier_1.getCardPriceHistory)(card.uniqueIdentifier);
            if (byIdentifier.length > priceHistory.length) {
                priceHistory = byIdentifier;
            }
            if (priceHistory.length === 0) {
                return res.status(404).json({
                    message: 'No exact price history found for this card variant.',
                    strictMatching: true,
                });
            }
            return res.json({
                priceHistory,
                productId: card.productId,
                uniqueIdentifier: card.uniqueIdentifier,
                variant: card.variantKey || safeVariant,
            });
        }
        return res.status(404).json({
            message: 'No exact price history found for this card.',
            strictMatching: true,
            searched: {
                cardName: safeCardName,
                setName: safeSetName,
                setId: safeSetId,
                cardNumber: safeCardNumber || null,
                variant: safeVariant,
            },
        });
    }
    catch (error) {
        logger_1.logger.error('Error fetching price history:', error);
        res.status(500).json({ error: 'Failed to fetch price history.' });
    }
}));
// Fallback matching function for cards not in our mapping system
const fallbackMatch = (cardName, setName, cardNumber, db) => {
    return new Promise((resolve, reject) => {
        const findProductSql = `
      SELECT 
        productId, 
        productName, 
        groupName
      FROM price_history
      WHERE 
        (productName LIKE ? OR productName LIKE ?)
        AND groupName LIKE ?
        AND source IN ('tcgcsv', 'tcgdex', 'catalog_fallback')
      GROUP BY productId, productName, groupName
      ORDER BY
        CASE WHEN groupName = ? THEN 0 ELSE 1 END,
        CASE WHEN ? IS NOT NULL AND productName LIKE '%' || ? || '%' THEN 0 ELSE 1 END,
        CASE WHEN groupName LIKE ? THEN 0 ELSE 1 END,
        COUNT(productId) DESC
      LIMIT 1;
    `;
        const cardNamePattern = `%${cardName}%`;
        const cardNameWithNumberPattern = cardNumber ? `%${cardName}%(${cardNumber})%` : cardNamePattern;
        const setNamePattern = `%${setName}%`;
        const params = [
            cardNamePattern,
            cardNameWithNumberPattern,
            setNamePattern,
            setName,
            cardNumber,
            cardNumber,
            setNamePattern
        ];
        db.get(findProductSql, params, (err, row) => {
            if (err) {
                reject(err);
                return;
            }
            if (!row) {
                resolve({
                    message: 'No matching product found for the given criteria.',
                    searchCriteria: { cardName, setName, cardNumber }
                });
                return;
            }
            const matchedProduct = row;
            const historySql = 'SELECT * FROM price_history WHERE productId = ? AND source IN (\'tcgcsv\', \'tcgdex\', \'catalog_fallback\') ORDER BY date ASC';
            db.all(historySql, [matchedProduct.productId], (historyErr, rows) => {
                if (historyErr) {
                    reject(historyErr);
                    return;
                }
                resolve({
                    matchedProduct: {
                        productId: matchedProduct.productId,
                        productName: matchedProduct.productName,
                        groupName: matchedProduct.groupName
                    },
                    priceHistory: rows || []
                });
            });
        });
    });
};
// Get price history for a specific product
router.get('/:productId', (req, res) => {
    const { productId } = req.params;
    const { days } = req.query;
    const db = (0, database_1.getDb)();
    let sql = 'SELECT * FROM price_history WHERE productId = ? AND source IN (\'tcgcsv\', \'tcgdex\', \'catalog_fallback\')';
    const params = [productId];
    if (days) {
        const daysNum = parseInt(days, 10);
        if (isNaN(daysNum) || daysNum < 1) {
            res.status(400).json({ error: 'Invalid days parameter' });
            return;
        }
        sql += ' AND date >= date("now", ?)';
        params.push(`-${daysNum} days`);
    }
    sql += ' ORDER BY date ASC';
    db.all(sql, params, (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json({ data: rows });
    });
});
// Search for cards by name with price history summary
router.get('/search/:cardName', (req, res) => {
    const { cardName } = req.params;
    const { minPrice, maxPrice, sortBy = 'avgPrice' } = req.query;
    const db = (0, database_1.getDb)();
    let sql = `
    SELECT DISTINCT productId, productName, groupName, 
           MAX(date) as latestDate, 
           AVG(price) as avgPrice,
           MIN(price) as minPrice,
           MAX(price) as maxPrice,
           COUNT(*) as dataPoints,
           source
    FROM price_history 
    WHERE productName LIKE ?
      AND source IN ('tcgcsv', 'tcgdex', 'catalog_fallback')
  `;
    const params = [`%${cardName}%`];
    if (minPrice) {
        sql += ' AND price >= ?';
        params.push(minPrice);
    }
    if (maxPrice) {
        sql += ' AND price <= ?';
        params.push(maxPrice);
    }
    sql += ` GROUP BY productId, productName, groupName, source`;
    // Add sorting using whitelist mapping (never interpolate raw input)
    const orderMap = {
        avgPrice: 'avgPrice DESC',
        minPrice: 'minPrice DESC',
        maxPrice: 'maxPrice DESC',
        latestDate: 'latestDate DESC',
        dataPoints: 'dataPoints DESC',
    };
    const orderClause = orderMap[sortBy] || 'avgPrice DESC';
    sql += ` ORDER BY ${orderClause}`;
    sql += ' LIMIT 20';
    db.all(sql, params, (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json({ data: rows });
    });
});
// Get price comparison between two time periods
router.get('/compare/:productId', (req, res) => {
    const { productId } = req.params;
    const { outer, inner } = req.query; // e.g., "90" (outer window) and "7" (inner window) for days ago
    const db = (0, database_1.getDb)();
    const outerDays = clampNumber(parseInt(outer, 10) || 90, 2, 365);
    const innerDays = clampNumber(parseInt(inner, 10) || 7, 1, outerDays - 1);
    const sql = `
    SELECT 
      'outer' as period,
      AVG(price) as avgPrice,
      MIN(price) as minPrice,
      MAX(price) as maxPrice,
      COUNT(*) as dataPoints
    FROM price_history 
    WHERE productId = ? 
      AND source IN ('tcgcsv', 'tcgdex', 'catalog_fallback')
      AND date >= date('now', ?)
      AND date < date('now', ?)
    
    UNION ALL
    
    SELECT 
      'inner' as period,
      AVG(price) as avgPrice,
      MIN(price) as minPrice,
      MAX(price) as maxPrice,
      COUNT(*) as dataPoints
    FROM price_history 
    WHERE productId = ? 
      AND source IN ('tcgcsv', 'tcgdex', 'catalog_fallback')
      AND date >= date('now', ?)
  `;
    const params = [
        productId,
        `-${outerDays} days`,
        `-${innerDays} days`,
        productId,
        `-${innerDays} days`,
    ];
    db.all(sql, params, (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        const typedRows = rows;
        // Calculate percentage changes
        const period1Data = typedRows.find(r => r.period === 'period1');
        const period2Data = typedRows.find(r => r.period === 'period2');
        let priceChange = null;
        if (period1Data && period2Data && period1Data.avgPrice > 0) {
            priceChange = ((period2Data.avgPrice - period1Data.avgPrice) / period1Data.avgPrice) * 100;
        }
        res.json({
            data: typedRows,
            analysis: {
                priceChange: priceChange ? parseFloat(priceChange.toFixed(2)) : null,
                trend: priceChange ? (priceChange > 0 ? 'UP' : priceChange < 0 ? 'DOWN' : 'STABLE') : 'UNKNOWN'
            }
        });
    });
});
// Get daily market snapshot
router.get('/snapshots/daily', (req, res) => {
    const requestedDays = parseInt(req.query.days, 10) || 30;
    const days = clampNumber(requestedDays, 1, 365);
    const db = (0, database_1.getDb)();
    const sql = `
    SELECT 
      date,
      COUNT(DISTINCT productId) as totalCards,
      AVG(marketPrice) as avgPrice,
      SUM(volume) as totalVolume
    FROM price_history
    WHERE date >= date('now', ?)
      AND source IN ('tcgcsv', 'tcgdex', 'catalog_fallback')
    GROUP BY date
    ORDER BY date ASC
  `;
    db.all(sql, [`-${days} days`], (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json({ data: rows });
    });
});
// Get market trends and analytics
router.get('/analytics/trends', (req, res) => {
    const requestedDays = parseInt(req.query.days, 10) || 30;
    const days = clampNumber(requestedDays, 1, 365);
    const { groupName } = req.query;
    const db = (0, database_1.getDb)();
    let sql = `
    SELECT 
      date,
      COUNT(DISTINCT productId) as totalCards,
      AVG(price) as avgPrice
    FROM price_history
    WHERE date >= date('now', ?)
      AND source IN ('tcgcsv', 'tcgdex', 'catalog_fallback')
  `;
    const params = [`-${days} days`];
    if (groupName) {
        sql += ' AND groupName LIKE ?';
        params.push(`%${groupName}%`);
    }
    sql += ' GROUP BY date ORDER BY date ASC';
    db.all(sql, params, (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json({ data: rows });
    });
});
// Export price data
router.get('/export/:productId', (req, res) => {
    const { productId } = req.params;
    const { format = 'json' } = req.query;
    const db = (0, database_1.getDb)();
    const sql = 'SELECT * FROM price_history WHERE productId = ? AND source IN (\'tcgcsv\', \'tcgdex\', \'catalog_fallback\') ORDER BY date ASC';
    db.all(sql, [productId], (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        if (format === 'csv') {
            res.header('Content-Type', 'text/csv');
            res.attachment(`price_history_${productId}.csv`);
            if (rows.length === 0) {
                return res.send('');
            }
            const escapeCsv = (val) => {
                const str = val == null ? '' : String(val);
                if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
                    return `"${str.replace(/"/g, '""')}"`;
                }
                return str;
            };
            const headers = Object.keys(rows[0]).map(escapeCsv).join(',');
            const csvRows = rows.map(row => Object.values(row).map(escapeCsv).join(',')).join('\n');
            return res.send(`${headers}\n${csvRows}`);
        }
        else {
            res.json({ data: rows });
        }
    });
});
exports.default = router;
