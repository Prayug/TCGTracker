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
const router = (0, express_1.Router)();
/**
 * Search cards from local database
 * Much faster and more reliable than Pokemon TCG API
 */
router.get('/search', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { query, setId, limit = '100' } = req.query;
        if (!query || typeof query !== 'string') {
            return res.status(400).json({
                error: 'Query parameter is required'
            });
        }
        const db = (0, database_1.getDb)();
        const searchLimit = Math.min(parseInt(limit) || 100, 250);
        let sql = `
      SELECT DISTINCT
        cm.cardId,
        cm.cardName,
        cm.setId,
        cm.setName,
        cm.cardNumber,
        cm.rarity,
        cm.tcgplayerProductId,
        cm.uniqueIdentifier,
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
      WHERE cm.cardName LIKE ?
    `;
        const params = [`%${query}%`];
        if (setId && typeof setId === 'string') {
            sql += ' AND (cm.setId = ? OR cm.setName LIKE ?)';
            params.push(setId, `%${setId}%`);
        }
        sql += ` ORDER BY cm.cardName ASC LIMIT ?`;
        params.push(searchLimit);
        db.all(sql, params, (err, rows) => {
            if (err) {
                console.error('Error searching cards:', err);
                return res.status(500).json({
                    error: 'Database error',
                    message: err.message
                });
            }
            // Transform to Pokemon TCG API compatible format
            const cards = rows.map(row => {
                // Use a placeholder image for local database cards (no Pokemon TCG API images)
                const placeholderImage = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="245" height="342" viewBox="0 0 245 342"%3E%3Crect width="245" height="342" fill="%23f3f4f6" rx="12"/%3E%3Ctext x="50%25" y="45%25" font-family="Arial,sans-serif" font-size="16" fill="%239ca3af" text-anchor="middle"%3E' + encodeURIComponent(row.cardName) + '%3C/text%3E%3Ctext x="50%25" y="55%25" font-family="Arial,sans-serif" font-size="14" fill="%23d1d5db" text-anchor="middle"%3E' + encodeURIComponent(row.setName) + '%3C/text%3E%3Ctext x="50%25" y="65%25" font-family="Arial,sans-serif" font-size="12" fill="%23e5e7eb" text-anchor="middle"%3ENo Image%3C/text%3E%3C/svg%3E';
                return {
                    id: row.cardId || `${row.setId}-${row.cardNumber}`,
                    name: row.cardName,
                    number: row.cardNumber,
                    rarity: row.rarity,
                    set: {
                        id: row.setId,
                        name: row.setName,
                        releaseDate: '2020-01-01', // Default date
                        total: 100
                    },
                    images: {
                        small: placeholderImage,
                        large: placeholderImage
                    },
                    tcgplayer: {
                        productId: row.tcgplayerProductId,
                        prices: row.latestPrice ? {
                            normal: { market: row.latestPrice }
                        } : undefined
                    },
                    marketPrice: row.latestPrice || 0,
                    uniqueIdentifier: row.uniqueIdentifier,
                    isLocalDbCard: true // Flag to indicate this is from local DB
                };
            });
            console.log(`✅ Found ${cards.length} cards matching "${query}" from local database`);
            res.json({
                data: cards,
                count: cards.length,
                source: 'local_database'
            });
        });
    }
    catch (error) {
        console.error('Error in card search:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: error.message
        });
    }
}));
/**
 * Get all unique sets from local database
 */
router.get('/sets', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const db = (0, database_1.getDb)();
        const sql = `
      SELECT DISTINCT 
        setId as id,
        setName as name,
        COUNT(*) as total
      FROM card_mappings
      GROUP BY setId, setName
      ORDER BY setName ASC
    `;
        db.all(sql, [], (err, rows) => {
            if (err) {
                console.error('Error fetching sets:', err);
                return res.status(500).json({
                    error: 'Database error',
                    message: err.message
                });
            }
            const sets = rows.map(row => ({
                id: row.id,
                name: row.name,
                releaseDate: '2020-01-01',
                total: row.total,
                images: {
                    symbol: '',
                    logo: ''
                }
            }));
            res.json({
                data: sets,
                count: sets.length,
                source: 'local_database'
            });
        });
    }
    catch (error) {
        console.error('Error fetching sets:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: error.message
        });
    }
}));
/**
 * Get card statistics
 */
router.get('/stats', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const db = (0, database_1.getDb)();
        const sql = `
      SELECT 
        COUNT(DISTINCT cardName) as totalCards,
        COUNT(DISTINCT setId) as totalSets,
        COUNT(*) as totalEntries
      FROM card_mappings
    `;
        db.get(sql, [], (err, row) => {
            if (err) {
                console.error('Error fetching stats:', err);
                return res.status(500).json({
                    error: 'Database error',
                    message: err.message
                });
            }
            res.json({
                totalCards: row.totalCards || 0,
                totalSets: row.totalSets || 0,
                totalEntries: row.totalEntries || 0,
                source: 'local_database'
            });
        });
    }
    catch (error) {
        console.error('Error fetching stats:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: error.message
        });
    }
}));
exports.default = router;
