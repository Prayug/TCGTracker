"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const database_1 = require("../db/database");
const cardIdentifier_1 = require("../services/cardIdentifier");
const router = (0, express_1.Router)();
// Get price history for a specific card using card details
router.get('/card', (req, res) => {
    const { cardName, setId, cardNumber } = req.query;
    if (!cardName || !setId) {
        res.status(400).json({
            error: 'cardName and setId are required query parameters.'
        });
        return;
    }
    const safeCardName = String(cardName).trim();
    const safeSetId = String(setId).trim();
    const safeCardNumber = cardNumber ? String(cardNumber).trim() : undefined;
    // Generate unique identifier
    const uniqueIdentifier = (0, cardIdentifier_1.generateUniqueIdentifier)(safeSetId, safeCardNumber, safeCardName);
    // Get price history using the unique identifier
    Promise.all([
        (0, cardIdentifier_1.getCardPriceHistory)(uniqueIdentifier),
        (0, cardIdentifier_1.getCardRollingAverages)(uniqueIdentifier)
    ])
        .then(([priceHistory, rollingAverages]) => {
        if (priceHistory.length === 0 && rollingAverages.length === 0) {
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
                cardNumber: safeCardNumber
            },
            priceHistory,
            rollingAverages
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
    const { cardName, setName, cardNumber, setId } = req.query;
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
    // First try to find using our card mappings
    (0, cardIdentifier_1.findCardByDetails)(safeCardName, safeSetId, safeCardNumber)
        .then(mapping => {
        if (mapping) {
            // Found in our mappings, get the price history
            return Promise.all([
                (0, cardIdentifier_1.getCardPriceHistory)(mapping.uniqueIdentifier),
                (0, cardIdentifier_1.getCardRollingAverages)(mapping.uniqueIdentifier)
            ]).then(([priceHistory, rollingAverages]) => ({
                matchedProduct: {
                    productId: mapping.productId,
                    productName: mapping.cardName,
                    groupName: mapping.setName,
                    uniqueIdentifier: mapping.uniqueIdentifier
                },
                priceHistory,
                rollingAverages
            }));
        }
        else {
            // Fallback to old matching logic for backward compatibility
            return fallbackMatch(safeCardName, safeSetName, safeCardNumber, db);
        }
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
            const historySql = 'SELECT * FROM price_history WHERE productId = ? ORDER BY date ASC';
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
                    priceHistory: rows || [],
                    rollingAverages: []
                });
            });
        });
    });
};
// Get price history for a specific product
router.get('/:productId', (req, res) => {
    const { productId } = req.params;
    const { source, days } = req.query;
    const db = (0, database_1.getDb)();
    let sql = 'SELECT * FROM price_history WHERE productId = ?';
    const params = [productId];
    if (source) {
        sql += ' AND source = ?';
        params.push(source);
    }
    if (days) {
        sql += ' AND date >= date("now", "-' + parseInt(days) + ' days")';
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
// Get rolling averages for a Pokemon TCG card
router.get('/rolling/:cardId', (req, res) => {
    const { cardId } = req.params;
    const { source, condition, days } = req.query;
    const db = (0, database_1.getDb)();
    let sql = 'SELECT * FROM rolling_averages WHERE cardId = ?';
    const params = [cardId];
    if (source) {
        sql += ' AND source = ?';
        params.push(source);
    }
    if (condition) {
        sql += ' AND condition = ?';
        params.push(condition);
    }
    if (days) {
        sql += ' AND date >= date("now", "-' + parseInt(days) + ' days")';
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
    // Add sorting
    const validSortColumns = ['avgPrice', 'minPrice', 'maxPrice', 'latestDate', 'dataPoints'];
    if (validSortColumns.includes(sortBy)) {
        sql += ` ORDER BY ${sortBy} DESC`;
    }
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
    const { period1, period2 } = req.query; // e.g., "30", "90" for days ago
    const db = (0, database_1.getDb)();
    const sql = `
    SELECT 
      'period1' as period,
      AVG(price) as avgPrice,
      MIN(price) as minPrice,
      MAX(price) as maxPrice,
      COUNT(*) as dataPoints
    FROM price_history 
    WHERE productId = ? 
      AND date >= date('now', '-${period1} days')
      AND date < date('now', '-${Math.min(parseInt(period1 || '30'), parseInt(period2 || '7'))} days')
    
    UNION ALL
    
    SELECT 
      'period2' as period,
      AVG(price) as avgPrice,
      MIN(price) as minPrice,
      MAX(price) as maxPrice,
      COUNT(*) as dataPoints
    FROM price_history 
    WHERE productId = ? 
      AND date >= date('now', '-${period2} days')
  `;
    db.all(sql, [productId, productId], (err, rows) => {
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
    const { days = 30 } = req.query;
    const db = (0, database_1.getDb)();
    const sql = `
    SELECT 
      date,
      COUNT(DISTINCT productId) as totalCards,
      AVG(marketPrice) as avgPrice,
      SUM(volume) as totalVolume
    FROM price_history
    WHERE date >= date('now', '-${days} days')
    GROUP BY date
    ORDER BY date ASC
  `;
    db.all(sql, [], (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json({ data: rows });
    });
});
// Get market trends and analytics
router.get('/analytics/trends', (req, res) => {
    const { days = 30, groupName } = req.query;
    const db = (0, database_1.getDb)();
    let sql = `
    SELECT 
      date,
      COUNT(DISTINCT productId) as totalCards,
      AVG(price) as avgPrice
    FROM price_history
    WHERE date >= date('now', '-${days} days')
  `;
    const params = [];
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
// Price alerts management
router.post('/alerts', (req, res) => {
    const { cardId, productId, targetPrice, alertType, threshold } = req.body;
    const db = (0, database_1.getDb)();
    const sql = 'INSERT INTO price_alerts (cardId, productId, targetPrice, alertType, threshold) VALUES (?, ?, ?, ?, ?)';
    db.run(sql, [cardId, productId, targetPrice, alertType, threshold], function (err) {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.status(201).json({ id: this.lastID });
    });
});
router.get('/alerts', (req, res) => {
    const { isActive = 1 } = req.query;
    const db = (0, database_1.getDb)();
    const sql = 'SELECT * FROM price_alerts WHERE isActive = ?';
    db.all(sql, [isActive], (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json({ data: rows });
    });
});
router.delete('/alerts/:alertId', (req, res) => {
    const { alertId } = req.params;
    const db = (0, database_1.getDb)();
    const sql = 'DELETE FROM price_alerts WHERE id = ?';
    db.run(sql, [alertId], function (err) {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        if (this.changes === 0) {
            res.status(404).json({ message: "Alert not found or already deleted." });
            return;
        }
        res.status(200).json({ message: 'Alert deleted successfully.' });
    });
});
// Export price data
router.get('/export/:productId', (req, res) => {
    const { productId } = req.params;
    const { format = 'json' } = req.query;
    const db = (0, database_1.getDb)();
    const sql = 'SELECT * FROM price_history WHERE productId = ? ORDER BY date ASC';
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
            const headers = Object.keys(rows[0]).join(',');
            const csvRows = rows.map(row => Object.values(row).join(',')).join('\n');
            return res.send(`${headers}\n${csvRows}`);
        }
        else {
            res.json({ data: rows });
        }
    });
});
exports.default = router;
