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
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const database_1 = require("../db/database");
const router = (0, express_1.Router)();
const cardImageCache = new Map();
const CACHE_TTL = 1000 * 60 * 60 * 24; // 24 hours
// Helper to generate cache key
const getCacheKey = (cardName, setId, cardNumber) => {
    return `${cardName}|${setId}|${cardNumber || 'none'}`.toLowerCase();
};
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
/**
 * Get a random pool of cards with latest market prices from local DB
 */
router.get('/pool', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const db = (0, database_1.getDb)();
        const { limit = '250', minPrice = '1', maxPrice = '20000' } = req.query;
        const poolLimit = Math.min(parseInt(limit) || 250, 5000); // Increased max to 5000
        // Select random cards with their latest market price from price_history
        const sql = `
      SELECT 
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
      JOIN (
        SELECT ph1.uniqueIdentifier, ph1.marketPrice, ph1.date
        FROM price_history ph1
        JOIN (
          SELECT uniqueIdentifier, MAX(date) AS maxDate
          FROM price_history
          WHERE source = 'tcgcsv'
          GROUP BY uniqueIdentifier
        ) latest ON ph1.uniqueIdentifier = latest.uniqueIdentifier AND ph1.date = latest.maxDate
        WHERE ph1.marketPrice IS NOT NULL
      ) ph ON cm.uniqueIdentifier = ph.uniqueIdentifier
      WHERE ph.marketPrice >= ? AND ph.marketPrice <= ?
        AND cm.cardName IS NOT NULL AND TRIM(cm.cardName) <> ''
        AND cm.setId IS NOT NULL AND TRIM(cm.setId) <> ''
        AND cm.cardNumber IS NOT NULL AND TRIM(cm.cardNumber) <> ''
      ORDER BY RANDOM()
      LIMIT ?
    `;
        db.all(sql, [minPrice, maxPrice, poolLimit], (err, rows) => {
            if (err) {
                console.error('Error fetching random card pool:', err);
                return res.status(500).json({
                    error: 'Database error',
                    message: err.message
                });
            }
            const placeholder = (name, set) => ('data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="245" height="342" viewBox="0 0 245 342"%3E%3Crect width="245" height="342" fill="%23f3f4f6" rx="12"/%3E%3Ctext x="50%25" y="45%25" font-family="Arial,sans-serif" font-size="16" fill="%239ca3af" text-anchor="middle"%3E' +
                encodeURIComponent(name) + '%3C/text%3E%3Ctext x="50%25" y="55%25" font-family="Arial,sans-serif" font-size="14" fill="%23d1d5db" text-anchor="middle"%3E' +
                encodeURIComponent(set) + '%3C/text%3E%3Ctext x="50%25" y="65%25" font-family="Arial,sans-serif" font-size="12" fill="%23e5e7eb" text-anchor="middle"%3ENo Image%3C/text%3E%3C/svg%3E');
            const cards = rows.map(row => ({
                id: row.cardId || `${row.setId}-${row.cardNumber}`,
                name: row.cardName,
                number: row.cardNumber,
                rarity: row.rarity,
                set: {
                    id: row.setId,
                    name: row.setName,
                    releaseDate: '2020-01-01',
                    total: 100
                },
                images: {
                    small: placeholder(row.cardName, row.setName),
                    large: placeholder(row.cardName, row.setName)
                },
                tcgplayer: {
                    productId: row.tcgplayerProductId,
                    prices: row.latestPrice ? {
                        normal: { market: row.latestPrice }
                    } : undefined
                },
                marketPrice: row.latestPrice || 0,
                uniqueIdentifier: row.uniqueIdentifier,
                isLocalDbCard: true
            }));
            res.json({
                data: cards,
                count: cards.length,
                source: 'local_database'
            });
        });
    }
    catch (error) {
        console.error('Error building card pool:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: error.message
        });
    }
}));
/**
 * Search Pokemon API for card images (proxy endpoint to avoid CORS)
 */
router.get('/search-pokemon', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const { cardName, setId, cardNumber } = req.query;
        if (!cardName || typeof cardName !== 'string') {
            return res.status(400).json({
                error: 'cardName query parameter is required'
            });
        }
        if (!setId || typeof setId !== 'string') {
            return res.status(400).json({
                error: 'setId query parameter is required'
            });
        }
        // Check cache first
        const cacheKey = getCacheKey(cardName, setId, cardNumber);
        const cached = cardImageCache.get(cacheKey);
        if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
            console.log(`💾 Cache hit for ${cardName} from ${setId}`);
            return res.json({
                card: cached.card,
                images: cached.images,
                id: cached.id,
                matchedSet: cached.matchedSet,
                matchedNumber: cached.matchedNumber,
                cached: true
            });
        }
        const pokemonApiUrl = 'https://api.pokemontcg.io/v2/cards';
        const apiKey = process.env.POKEMON_TCG_API_KEY;
        const headers = {
            'Accept': 'application/json',
        };
        if (apiKey) {
            headers['X-Api-Key'] = apiKey;
        }
        // Helper to fetch with timeout
        const fetchWithTimeout = (url_1, ...args_1) => __awaiter(void 0, [url_1, ...args_1], void 0, function* (url, timeoutMs = 10000) {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), timeoutMs);
            try {
                const response = yield fetch(url, {
                    headers,
                    signal: controller.signal
                });
                clearTimeout(timeout);
                return response;
            }
            catch (error) {
                clearTimeout(timeout);
                throw error;
            }
        });
        // Normalize the card number for better matching
        const normalizeCardNumber = (num) => {
            if (!num)
                return '';
            // Take only the part before the slash (e.g., "188/132" → "188")
            const beforeSlash = num.split('/')[0].trim();
            // Remove leading zeros, convert to lowercase, remove special chars except letters and numbers
            return beforeSlash.toLowerCase().replace(/^0+/, '').replace(/[^a-z0-9]/g, '');
        };
        const normalizedRequestNumber = normalizeCardNumber(cardNumber);
        // AGGRESSIVE PARALLEL SEARCH - Try ALL strategies at once with SHORT timeouts!
        let cards = [];
        let searchAttempts = [];
        try {
            const searchPromises = [];
            // STRATEGY 1: Exact name + set + number (if we have number)
            if (cardNumber) {
                const beforeSlash = String(cardNumber).split('/')[0].trim();
                const url1 = new URL(pokemonApiUrl);
                // DON'T use quotes around name - Pokemon API doesn't like them!
                url1.searchParams.append('q', `name:${cardName} set.id:${setId} number:${beforeSlash}`);
                url1.searchParams.append('pageSize', '5');
                searchPromises.push(fetchWithTimeout(url1.toString(), 3000)
                    .then(r => r.ok ? r.json() : null)
                    .then(data => ({ strategy: 'exact+set+num', data: (data === null || data === void 0 ? void 0 : data.data) || [] }))
                    .catch(() => ({ strategy: 'exact+set+num', data: [] })));
                // STRATEGY 2: Name + number ONLY (ignore set - for when set ID is wrong!)
                const url2 = new URL(pokemonApiUrl);
                url2.searchParams.append('q', `name:${cardName} number:${beforeSlash}`);
                url2.searchParams.append('pageSize', '10');
                searchPromises.push(fetchWithTimeout(url2.toString(), 3000)
                    .then(r => r.ok ? r.json() : null)
                    .then(data => ({ strategy: 'name+num', data: (data === null || data === void 0 ? void 0 : data.data) || [] }))
                    .catch(() => ({ strategy: 'name+num', data: [] })));
            }
            // STRATEGY 3: Name + set (no number)
            const url3 = new URL(pokemonApiUrl);
            url3.searchParams.append('q', `name:${cardName} set.id:${setId}`);
            url3.searchParams.append('pageSize', '10');
            searchPromises.push(fetchWithTimeout(url3.toString(), 3000)
                .then(r => r.ok ? r.json() : null)
                .then(data => ({ strategy: 'name+set', data: (data === null || data === void 0 ? void 0 : data.data) || [] }))
                .catch(() => ({ strategy: 'name+set', data: [] })));
            // STRATEGY 4: Name ONLY (broadest search - always works!)
            const url4 = new URL(pokemonApiUrl);
            url4.searchParams.append('q', `name:${cardName}`);
            url4.searchParams.append('pageSize', '20');
            searchPromises.push(fetchWithTimeout(url4.toString(), 3000)
                .then(r => r.ok ? r.json() : null)
                .then(data => ({ strategy: 'name-only', data: (data === null || data === void 0 ? void 0 : data.data) || [] }))
                .catch(() => ({ strategy: 'name-only', data: [] })));
            // Wait for ALL searches to complete (in parallel!)
            const results = yield Promise.all(searchPromises);
            // Use the first result that found cards (priority order)
            for (const result of results) {
                searchAttempts.push(`${result.strategy}: ${result.data.length}`);
                if (result.data.length > 0 && cards.length === 0) {
                    cards = result.data;
                    console.log(`✅ Found ${cards.length} cards using ${result.strategy} strategy`);
                }
            }
        }
        catch (error) {
            console.error('Search error:', error);
        }
        if (cards.length === 0) {
            return res.status(404).json({
                error: `No cards found matching "${cardName}"`,
                searched: { cardName, setId, cardNumber },
                searchAttempts: searchAttempts,
                hint: 'Card may not exist in Pokemon TCG API database'
            });
        }
        // Filter to exact matches by name
        let exactMatches = cards.filter((card) => card.name.toLowerCase() === cardName.toLowerCase());
        // If we have a card number, prioritize matches with that number
        let matchedCard = null;
        if (cardNumber && exactMatches.length > 0) {
            // First, try exact card number match
            matchedCard = exactMatches.find((card) => card.number === cardNumber ||
                card.number === normalizedRequestNumber ||
                normalizeCardNumber(card.number) === normalizedRequestNumber);
            // If no exact match, try both with and without the slash part
            // (handles "188/132" vs "188" and "01" vs "1", etc.)
            if (!matchedCard && normalizedRequestNumber) {
                const requestedNumberOnly = String(cardNumber).split('/')[0].trim();
                matchedCard = exactMatches.find((card) => {
                    const cardNormalized = normalizeCardNumber(card.number);
                    const cardWithoutSlash = card.number.split('/')[0].trim();
                    return cardNormalized === normalizedRequestNumber ||
                        cardWithoutSlash === requestedNumberOnly;
                });
            }
            // STRICT MODE: If a card number was requested but we can't find an exact match,
            // DO NOT fallback to other variants. This prevents matching wrong variants of cards
            // like different "Mega Lucario ex" cards (#077 vs #188 etc.)
            if (!matchedCard) {
                console.warn(`⚠️ Card number mismatch: Requested ${cardNumber} for "${cardName}" but no exact match found`);
                console.log(`📋 Available variants: ${exactMatches.map((c) => `#${c.number}`).join(', ')}`);
                // Only fallback if the card number difference is very small (like "1" vs "01")
                if (normalizedRequestNumber && /^\d+$/.test(normalizedRequestNumber)) {
                    const requestedNum = parseInt(normalizedRequestNumber);
                    const closeMatches = exactMatches.filter((card) => {
                        const cardNum = parseInt(normalizeCardNumber(card.number));
                        return !isNaN(cardNum) && Math.abs(cardNum - requestedNum) <= 1;
                    });
                    if (closeMatches.length === 1) {
                        matchedCard = closeMatches[0];
                        console.log(`✅ Using close match: #${matchedCard.number} (requested #${cardNumber})`);
                    }
                }
            }
        }
        // Fallback 1: If NO card number was provided, use set-based matching
        if (!matchedCard && !cardNumber && exactMatches.length > 0) {
            const sameSetMatches = exactMatches.filter((card) => card.set.id.toLowerCase() === setId.toLowerCase());
            if (sameSetMatches.length > 0) {
                matchedCard = sameSetMatches[0];
                console.log(`✅ Matched by set: ${matchedCard.name} #${matchedCard.number}`);
            }
        }
        // Fallback 2: Use first exact name match (ONLY if no card number was requested)
        if (!matchedCard && !cardNumber && exactMatches.length > 0) {
            matchedCard = exactMatches[0];
            console.warn(`⚠️ Using fallback match for ${cardName} #${matchedCard.number} - may not be the exact variant`);
        }
        // Fallback 3: If no exact matches and NO card number, try fuzzy matching on name
        if (!matchedCard && !cardNumber && cards.length > 0) {
            const fuzzyMatches = cards.filter((card) => card.name.toLowerCase().includes(cardName.toLowerCase()) ||
                cardName.toLowerCase().includes(card.name.toLowerCase()));
            if (fuzzyMatches.length > 0) {
                matchedCard = fuzzyMatches[0];
                console.warn(`⚠️ Using fuzzy match for ${cardName}: ${matchedCard.name} #${matchedCard.number}`);
            }
        }
        // If a card number was provided but we still don't have a match, return error
        if (!matchedCard && cardNumber) {
            return res.status(404).json({
                error: `Card number ${cardNumber} not found for "${cardName}" in set ${setId}`,
                searched: { cardName, setId, cardNumber },
                message: `Please check that the card number is correct. Found ${exactMatches.length} variants with this name.`,
                availableVariants: exactMatches.map((c) => ({
                    name: c.name,
                    set: c.set.id,
                    number: c.number,
                    rarity: c.rarity
                }))
            });
        }
        if (!matchedCard || !((_a = matchedCard.images) === null || _a === void 0 ? void 0 : _a.large) || !((_b = matchedCard.images) === null || _b === void 0 ? void 0 : _b.small)) {
            return res.status(404).json({
                error: `Card not found or missing images`,
                searched: { cardName, setId, cardNumber },
                totalResults: cards.length,
                exactMatches: exactMatches.length,
                searchAttempts: searchAttempts,
                availableCards: cards.slice(0, 5).map((c) => ({
                    name: c.name,
                    set: c.set.id,
                    number: c.number
                }))
            });
        }
        console.log(`✅ Matched card: ${matchedCard.name} from ${matchedCard.set.name} (#${matchedCard.number})`);
        // Store in cache
        const result = {
            card: matchedCard,
            images: {
                small: matchedCard.images.small,
                large: matchedCard.images.large
            },
            id: matchedCard.id,
            matchedSet: matchedCard.set.name,
            matchedNumber: matchedCard.number,
            timestamp: Date.now()
        };
        cardImageCache.set(cacheKey, result);
        console.log(`💾 Cached result for ${cardName} (cache size: ${cardImageCache.size})`);
        // Return without the timestamp
        const { timestamp } = result, response = __rest(result, ["timestamp"]);
        res.json(response);
    }
    catch (error) {
        console.error('Error searching Pokemon API:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: error.message
        });
    }
}));
exports.default = router;
