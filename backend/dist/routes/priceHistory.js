"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const database_1 = require("../db/database");
const logger_1 = require("../utils/logger");
const cardIdentifier_1 = require("../services/cardIdentifier");
const onePiecePriceHistoryService_1 = require("../services/onePiecePriceHistoryService");
const topMoversQuality_1 = require("../services/topMoversQuality");
const router = (0, express_1.Router)();
const clampNumber = (value, min, max) => Math.min(Math.max(value, min), max);
/** In-memory TTL cache for /top-movers — avoids re-running heavy joins on every reload. */
const TOP_MOVERS_TTL_MS = 10 * 60 * 1000; // 10 minutes (price snapshots are daily)
const topMoversCache = new Map();
const sendTopMovers = (res, cacheKey, payload, cacheStatus = 'MISS') => {
    if (cacheStatus === 'MISS') {
        topMoversCache.set(cacheKey, {
            expiresAt: Date.now() + TOP_MOVERS_TTL_MS,
            payload,
        });
    }
    res.setHeader('X-Cache', cacheStatus);
    res.setHeader('Cache-Control', `public, max-age=${Math.floor(TOP_MOVERS_TTL_MS / 1000)}`);
    res.json(payload);
};
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
        logger_1.logger.error('Price history query failed', { error: err.message });
        res.status(500).json({
            error: 'Database error fetching price history.'
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
router.get('/history', async (req, res) => {
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
        const exactCard = await (0, cardIdentifier_1.findExactCardByDetails)({
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
                priceHistory = await (0, cardIdentifier_1.getCardPriceHistoryForProduct)(exactCard.productId, safeVariant);
            }
            const byIdentifier = await (0, cardIdentifier_1.getCardPriceHistory)(exactCard.uniqueIdentifier);
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
        const card = await (0, cardIdentifier_1.findCardByDetails)(safeCardName, safeSetId, safeCardNumber, rarity ? String(rarity) : undefined, safeVariant, productId ? String(productId) : undefined);
        if (card) {
            let priceHistory = [];
            if (card.productId) {
                priceHistory = await (0, cardIdentifier_1.getCardPriceHistoryForProduct)(card.productId, safeVariant);
            }
            const byIdentifier = await (0, cardIdentifier_1.getCardPriceHistory)(card.uniqueIdentifier);
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
// One Piece price history — prefers TCGPlayer when OPTCG data is stale
router.get('/onepiece/:catalogId', async (req, res) => {
    const catalogId = decodeURIComponent(req.params.catalogId);
    const days = req.query.days ? parseInt(req.query.days, 10) : undefined;
    if (days != null && (Number.isNaN(days) || days < 1)) {
        res.status(400).json({ error: 'Invalid days parameter' });
        return;
    }
    try {
        const result = await (0, onePiecePriceHistoryService_1.getOnePiecePriceHistory)(catalogId, days);
        if (!result) {
            res.status(404).json({ error: 'Card not found', catalogId });
            return;
        }
        if (result.priceHistory.length === 0) {
            res.status(404).json({
                message: 'No price history found for this card yet.',
                catalogId,
            });
            return;
        }
        res.json({
            catalogId: result.catalogId,
            priceSource: result.priceSource,
            currentPrice: result.currentPrice,
            priceHistory: result.priceHistory.map((point) => ({
                date: point.date,
                price: point.price,
                source: point.source,
            })),
        });
    }
    catch (error) {
        logger_1.logger.error(`One Piece price history failed for ${catalogId}:`, error);
        res.status(500).json({ error: error.message });
    }
});
// Get top movers (cards with the biggest price changes over a period)
router.get('/top-movers', (req, res) => {
    const requestedDays = parseInt(req.query.days, 10) || 7;
    const requestedLimit = parseInt(req.query.limit, 10) || 20;
    const days = clampNumber(requestedDays, 1, 365);
    const limit = Math.min(Math.max(requestedLimit, 1), 50);
    const cacheKey = `${days}:${limit}`;
    const cached = topMoversCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
        sendTopMovers(res, cacheKey, cached.payload, 'HIT');
        return;
    }
    // Floor + min dollar move: ignore penny prints and tiny noise
    const minPrice = 1;
    const minAbsDollarChange = 1;
    // Allow sparse history: find baseline on/before period start, within 2x the window
    const baselineSlackDays = Math.max(days * 2, days + 3);
    const candidatePool = 150;
    const cliffPct = (0, topMoversQuality_1.cliffPctForPeriod)(days);
    const minPoints = (0, topMoversQuality_1.minPointsForPeriod)(days);
    const db = (0, database_1.getDb)();
    const sources = `'tcgcsv', 'tcgdex', 'catalog_fallback'`;
    db.get(`SELECT date as maxDate FROM price_history
     WHERE source IN (${sources}) AND price > 0
     ORDER BY date DESC LIMIT 1`, [], (err, row) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        const latestDate = row === null || row === void 0 ? void 0 : row.maxDate;
        if (!latestDate) {
            sendTopMovers(res, cacheKey, { date: null, days, gainers: [], losers: [] });
            return;
        }
        // Query 1: all prices on the latest date with card details (+ source for same-source match)
        db.all(`
        SELECT ph.productId, ph.productName, ph.price, ph.uniqueIdentifier, ph.source,
               ph.subTypeName, ph.groupName,
               cc.imageSmall, cc.imageLarge, cc.cardId,
               cc.setId, cc.setName, cc.cardNumber, cc.rarity,
               cc.tcgplayerProductId, cc.tcgplayerPrices
        FROM price_history ph
        LEFT JOIN card_mappings cm ON cm.uniqueIdentifier = ph.uniqueIdentifier
        LEFT JOIN catalog_cards cc ON cc.cardId = cm.cardId
        WHERE ph.date = ?
          AND ph.source IN (${sources})
          AND ph.price >= ?
      `, [latestDate, minPrice], (err, currentRows) => {
            if (err) {
                res.status(500).json({ error: err.message });
                return;
            }
            if (currentRows.length === 0) {
                sendTopMovers(res, cacheKey, { date: latestDate, days, gainers: [], losers: [] });
                return;
            }
            // One current row per uniqueIdentifier (prefer tcgdex)
            const currentByUid = new Map();
            for (const r of currentRows) {
                const list = currentByUid.get(r.uniqueIdentifier) || [];
                list.push(r);
                currentByUid.set(r.uniqueIdentifier, list);
            }
            const preferredCurrent = [];
            for (const list of currentByUid.values()) {
                const pick = (0, topMoversQuality_1.pickPreferredSourceRow)(list);
                if (pick)
                    preferredCurrent.push(pick);
            }
            // Query 2: baselines per (uniqueIdentifier, source) on/before period start
            db.all(`
          SELECT p.uniqueIdentifier, p.source, p.date as prevDate, p.price as prevPrice
          FROM price_history p
          JOIN (
            SELECT uniqueIdentifier, source, MAX(date) as maxDate
            FROM price_history
            WHERE source IN (${sources})
              AND price >= ?
              AND date <= date(?, ?)
              AND date >= date(?, ?)
            GROUP BY uniqueIdentifier, source
          ) m ON p.uniqueIdentifier = m.uniqueIdentifier
            AND p.source = m.source
            AND p.date = m.maxDate
          WHERE p.price >= ?
        `, [
                minPrice,
                latestDate, `-${days} days`,
                latestDate, `-${baselineSlackDays} days`,
                minPrice,
            ], (err, prevRows) => {
                var _a, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _q;
                if (err) {
                    res.status(500).json({ error: err.message });
                    return;
                }
                // uid -> source -> { prevPrice, prevDate }
                const prevByUidSource = new Map();
                for (const prev of prevRows) {
                    let bySource = prevByUidSource.get(prev.uniqueIdentifier);
                    if (!bySource) {
                        bySource = new Map();
                        prevByUidSource.set(prev.uniqueIdentifier, bySource);
                    }
                    if (!bySource.has(prev.source)) {
                        bySource.set(prev.source, { prevPrice: prev.prevPrice, prevDate: prev.prevDate });
                    }
                }
                const entries = [];
                for (const current of preferredCurrent) {
                    const bySource = prevByUidSource.get(current.uniqueIdentifier);
                    if (!bySource || bySource.size === 0)
                        continue;
                    // Prefer same source as current; else best available source
                    let baseline = bySource.get(current.source);
                    let baselineSource = current.source;
                    if (!baseline) {
                        const fallback = (0, topMoversQuality_1.pickPreferredSourceRow)([...bySource.entries()].map(([source, b]) => ({ source, ...b })));
                        if (!fallback)
                            continue;
                        baseline = { prevPrice: fallback.prevPrice, prevDate: fallback.prevDate };
                        baselineSource = fallback.source;
                    }
                    const prevPrice = baseline.prevPrice;
                    if (!prevPrice || prevPrice < minPrice)
                        continue;
                    const absDollar = Math.abs(current.price - prevPrice);
                    if (absDollar < minAbsDollarChange)
                        continue;
                    const changePct = ((current.price - prevPrice) / prevPrice) * 100;
                    entries.push({
                        productName: current.productName,
                        currentPrice: current.price,
                        previousPrice: prevPrice,
                        changePercent: Math.round(changePct * 100) / 100,
                        uniqueIdentifier: (_a = current.uniqueIdentifier) !== null && _a !== void 0 ? _a : null,
                        source: current.source,
                        baselineSource,
                        prevDate: baseline.prevDate,
                        subTypeName: (_c = current.subTypeName) !== null && _c !== void 0 ? _c : null,
                        groupName: (_d = current.groupName) !== null && _d !== void 0 ? _d : null,
                        imageSmall: (_e = current.imageSmall) !== null && _e !== void 0 ? _e : null,
                        imageLarge: (_f = current.imageLarge) !== null && _f !== void 0 ? _f : null,
                        cardId: (_g = current.cardId) !== null && _g !== void 0 ? _g : null,
                        setId: (_h = current.setId) !== null && _h !== void 0 ? _h : null,
                        setName: (_k = (_j = current.setName) !== null && _j !== void 0 ? _j : current.groupName) !== null && _k !== void 0 ? _k : null,
                        cardNumber: (_l = current.cardNumber) !== null && _l !== void 0 ? _l : null,
                        rarity: (_m = current.rarity) !== null && _m !== void 0 ? _m : null,
                        tcgplayerProductId: (_o = current.tcgplayerProductId) !== null && _o !== void 0 ? _o : null,
                        tcgplayerPrices: (_q = current.tcgplayerPrices) !== null && _q !== void 0 ? _q : null,
                        productId: current.productId,
                    });
                }
                entries.sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent));
                const gainerPool = entries.filter((e) => e.changePercent > 0).slice(0, candidatePool);
                const loserPool = entries.filter((e) => e.changePercent < 0).slice(0, candidatePool);
                const candidates = [...gainerPool, ...loserPool];
                if (candidates.length === 0) {
                    sendTopMovers(res, cacheKey, { date: latestDate, days, gainers: [], losers: [] });
                    return;
                }
                const uids = [...new Set(candidates.map((c) => c.uniqueIdentifier).filter(Boolean))];
                const earliestPrev = candidates.reduce((min, c) => (!min || c.prevDate < min ? c.prevDate : min), '');
                const placeholders = uids.map(() => '?').join(',');
                db.all(`SELECT uniqueIdentifier, source, date, price
             FROM price_history
             WHERE uniqueIdentifier IN (${placeholders})
               AND source IN (${sources})
               AND date >= ?
               AND date <= ?
               AND price >= ?`, [...uids, earliestPrev, latestDate, minPrice], (pathErr, pathRows) => {
                    if (pathErr) {
                        res.status(500).json({ error: pathErr.message });
                        return;
                    }
                    // uid|source -> points
                    const series = new Map();
                    for (const pr of pathRows) {
                        const key = `${pr.uniqueIdentifier}||${pr.source}`;
                        const list = series.get(key) || [];
                        list.push({ date: pr.date, price: pr.price });
                        series.set(key, list);
                    }
                    const gradualOpts = { cliffPct, minPoints };
                    const survivors = candidates.filter((c) => {
                        const key = `${c.uniqueIdentifier}||${c.source}`;
                        let points = series.get(key) || [];
                        // If same-source path is thin, try baseline source path
                        if (points.length < minPoints && c.baselineSource !== c.source) {
                            points = series.get(`${c.uniqueIdentifier}||${c.baselineSource}`) || points;
                        }
                        // Restrict to [prevDate, latestDate]
                        const windowed = points.filter((p) => p.date >= c.prevDate && p.date <= latestDate);
                        return (0, topMoversQuality_1.isGradualMove)(windowed, gradualOpts);
                    });
                    survivors.sort((a, b) => b.changePercent - a.changePercent);
                    const gainers = survivors.filter((e) => e.changePercent > 0).slice(0, limit);
                    const losers = survivors
                        .filter((e) => e.changePercent < 0)
                        .sort((a, b) => a.changePercent - b.changePercent)
                        .slice(0, limit);
                    // Strip internal ranking fields from response
                    const sanitize = (e) => {
                        const { source: _s, baselineSource: _b, prevDate: _p, ...rest } = e;
                        return rest;
                    };
                    sendTopMovers(res, cacheKey, {
                        date: latestDate,
                        days,
                        gainers: gainers.map(sanitize),
                        losers: losers.map(sanitize),
                    });
                });
            });
        });
    });
});
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
        const outerData = typedRows.find(r => r.period === 'outer');
        const innerData = typedRows.find(r => r.period === 'inner');
        let priceChange = null;
        if (outerData && innerData && outerData.avgPrice > 0) {
            priceChange = ((innerData.avgPrice - outerData.avgPrice) / outerData.avgPrice) * 100;
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
