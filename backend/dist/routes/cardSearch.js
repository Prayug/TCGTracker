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
const pokemonApiClient_1 = require("../services/pokemonApiClient");
const router = (0, express_1.Router)();
const cardImageCache = new Map();
const CACHE_TTL = 1000 * 60 * 60 * 24; // 24 hours
const pokemonApiCache = new Map();
const POKEMON_CACHE_TTL = 1000 * 60 * 5; // 5 minutes
const POKEMON_PERSISTENT_CACHE_TTL = 1000 * 60 * 60 * 6; // 6 hours
const getPersistentPokemonCache = (cacheKey) => {
    const db = (0, database_1.getDb)();
    return new Promise((resolve, reject) => {
        db.get(`SELECT cacheKey, query, setId, pageSize, fetchAll, maxPages, data, totalCount, pagesFetched, fetchedAt
       FROM pokemon_cache
       WHERE cacheKey = ?`, [cacheKey], (err, row) => {
            if (err) {
                reject(err);
            }
            else {
                resolve(row || null);
            }
        });
    });
};
const savePersistentPokemonCache = (cacheKey, entry) => {
    const db = (0, database_1.getDb)();
    return new Promise((resolve, reject) => {
        db.run(`INSERT OR REPLACE INTO pokemon_cache
        (cacheKey, query, setId, pageSize, fetchAll, maxPages, data, totalCount, pagesFetched, fetchedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
            cacheKey,
            entry.query,
            entry.setId || null,
            entry.pageSize,
            entry.fetchAll ? 1 : 0,
            entry.maxPages,
            JSON.stringify(entry.data),
            entry.totalCount,
            entry.pagesFetched,
            entry.fetchedAt
        ], (err) => {
            if (err) {
                return reject(err);
            }
            resolve();
        });
    });
};
const buildPlaceholderImage = (name, set) => ('data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="245" height="342" viewBox="0 0 245 342"%3E%3Crect width="245" height="342" fill="%23f3f4f6" rx="12"/%3E%3Ctext x="50%25" y="45%25" font-family="Arial,sans-serif" font-size="16" fill="%239ca3af" text-anchor="middle"%3E' +
    encodeURIComponent(name) + '%3C/text%3E%3Ctext x="50%25" y="55%25" font-family="Arial,sans-serif" font-size="14" fill="%23d1d5db" text-anchor="middle"%3E' +
    encodeURIComponent(set) + '%3C/text%3E%3Ctext x="50%25" y="65%25" font-family="Arial,sans-serif" font-size="12" fill="%23e5e7eb" text-anchor="middle"%3ENo Image%3C/text%3E%3C/svg%3E');
const normalizeSetIdForImageUrl = (setId) => {
    const normalized = setId.toLowerCase();
    // Comprehensive mapping from database set IDs to Pokemon TCG API set codes
    const setMappings = {
        // Scarlet & Violet (SV) sets
        'sv01scarletvioletbaseset': 'sv1',
        'sv02paldeaevolved': 'sv2',
        'sv03obsidianflames': 'sv3',
        'sv04paradoxrift': 'sv4',
        'sv05temporalforces': 'sv5',
        'sv06twilightmasquerade': 'sv6',
        'sv07stellarcrown': 'sv7',
        'sv08surgingsparks': 'sv8',
        'sv09journeytogether': 'sv9',
        'sv10destinedrivals': 'sv10',
        // SV Special sets
        'svblackbolt': 'zsv10pt5',
        'svwhiteflare': 'rsv10pt5',
        'svpaldeanfates': 'sv4pt5',
        'svprismaticevolutions': 'sv8pt5',
        'svscarletviolet151': 'sv3pt5',
        'svscarletvioletbaseset': 'sv1', // Alternative name
        'svescarletvioletenergies': 'sve',
        // Sword & Shield (SWSH) sets
        'swsh01swordshieldbaseset': 'swsh1',
        'swsh02rebelclash': 'swsh2',
        'swsh03darknessablaze': 'swsh3',
        'swsh04vividvoltage': 'swsh4',
        'swsh05battlestyles': 'swsh5',
        'swsh06chillingreign': 'swsh6',
        'swsh07evolvingskies': 'swsh7',
        'swsh08fusionstrike': 'swsh8',
        'swsh09brilliantstars': 'swsh9',
        'swsh09brilliantstarstrainergallery': 'swsh9tg',
        'swsh10astralradiance': 'swsh10',
        'swsh10astralradiancetrainergallery': 'swsh10tg',
        'swsh11lostorigin': 'swsh11',
        'swsh11lostorigintrainergallery': 'swsh11tg',
        'swsh12silvertempest': 'swsh12',
        // Sun & Moon (SM) sets
        'smbaseset': 'sm1',
        'smguardiansrising': 'sm2',
        'smburningshadows': 'sm3',
        'smcrimsoninvasion': 'sm4',
        'smultrasonicunleashed': 'sm5',
        'smforbiddenlight': 'sm6',
        'smcelestialstorm': 'sm7',
        'smlostthunder': 'sm8',
        'smteamup': 'sm9',
        'smcosmiceclipse': 'sm10',
        'smunifiedminds': 'sm11',
        'smtrainerkitalolansandslashalolanninetales': 'smkit1',
        'smtrainerkitlycanrocalolanmuk': 'smkit2',
        // XY sets
        'xykalosstarterset': 'xy0',
        'xybreakthrough': 'xy8',
        'xybreakpoint': 'xy9',
        'xyfatescollide': 'xy10',
        'xysteamsiege': 'xy11',
        'xyevolutions': 'xy12',
        // Black & White (BW) sets
        'blackandwhite': 'bw1',
        'bwemergingpowers': 'bw2',
        'bwnoblevictories': 'bw3',
        'bwnextdestinies': 'bw4',
        'bwdarkexplorers': 'bw5',
        'bwdragonsvault': 'bw6',
        'bwboundariescrossed': 'bw7',
        'bwplasmablast': 'bw8',
        'bwplasmastorm': 'bw9',
        'bwtrainerkitbisharpwigglytuff': 'bwkt1',
        'bwtrainerkitexcadrillzoroark': 'bwkt2',
        // Base sets and older
        'baseset': 'base1',
        'basesetshadowless': 'basep',
        'baseset2': 'base2',
        'basejungle': 'base3',
        'basefossil': 'base4',
        'base1stedition': 'base1-1stedition',
        // Promo sets with proper era differentiation
        'svscarletvioletpromocards': 'svp',
        'svpromos': 'svp',
        'smpromos': 'smp',
        'swshpromos': 'swshp',
        'xypromos': 'xyp',
        'bwpromos': 'bwp',
        'basepromos': 'bp',
        'blackandwhitepromos': 'bwp',
        'nintendopromos': 'np',
        'alternateartpromos': 'svap',
        'bestofpromos': 'svbp',
        'pikachuworldcollectionpromos': 'pwc',
        'countdowncalendarpromos': 'cdp',
        'burgerkingpromos': 'bkp',
        'professorprogrampromos': 'ppp',
        'memegaevolutionpromo': 'smp', // SM era
        'me01megaevolution': 'xy01', // XY era
        'me02phantasmalflames': 'sv01', // SV era
        // McDonald's Promos - differentiated by year
        'mcdonaldspromos2024': 'mcd24',
        'mcdonaldspromos2023': 'mcd23',
        'mcdonaldspromos2022': 'mcd22',
        'mcdonaldspromos2021': 'mcd21',
        'mcdonaldspromos2020': 'mcd20',
        'mcdonaldspromos2019': 'mcd19',
        'mcdonaldspromos2018': 'mcd18',
        'mcdonaldspromos2017': 'mcd17',
        'mcdonaldspromos2016': 'mcd16',
        'mcdonaldspromos2015': 'mcd15',
        'mcdonaldspromos2014': 'mcd14',
        'mcdonaldspromos2013': 'mcd13',
        'mcdonaldspromos2012': 'mcd12',
        'mcdonaldspromos2011': 'mcd11',
        'mcdonaldspromos2010': 'mcd10',
        'mcdonaldspromos2009': 'mcd09',
        'mcdonaldspromos2008': 'mcd08',
        'mcdonaldspromos2007': 'mcd07',
        'mcdonaldspromos2006': 'mcd06',
        'mcdonaldspromos2005': 'mcd05',
        'mcdonaldspromos2004': 'mcd04',
        'mcdonaldspromos2003': 'mcd03',
        'mcdonaldspromos2002': 'mcd02',
        'mcdonaldspromos2001': 'mcd01',
        'mcdonaldspromos2000': 'mcd00',
        // Special collections and other sets
        'aquapolis': 'ecard1',
        'skyridge': 'ecard2',
        'exrubyandsapphire': 'ex1',
        'exsandstorm': 'ex2',
        'exdragon': 'ex3',
        'exteamrocketreturns': 'ex4',
        'exdeoxys': 'ex5',
        'excityoflegends': 'ex6',
        'expowerkeepers': 'ex7',
        'arceus': 'pl1',
        'suprememajestic': 'pl2',
        'risingrivals': 'pl3',
        'arceusmajesticdawn': 'pl4',
        'calloflegends': 'col1',
        'triumphant': 'hgss1',
        'unleashed': 'hgss2',
        'undefeated': 'hgss3',
        'triumphantarceus': 'hgss4',
        'celebrations': 'cel25',
        'celebrationsclassiccollection': 'cel25c',
        'battleacademy': 'bap1',
        'battleacademy2022': 'bap2',
        'battleacademy2024': 'bap3',
        'trainerkitnoctowl': 'tk1a',
        'trainerkitpikachu': 'tk2a',
        'ashvsteamrocketdeckkitjpexclusive': 'tk-rocket',
        'blisterexclusives': 'blisex',
        'leaguechampionshipcards': 'lc',
        'worldchampionshipdecks': 'wc',
        'trickortradebooosterbundle2024': 'tto24',
        'pokemongocards': 'pgo',
    };
    if (setMappings[normalized]) {
        return setMappings[normalized];
    }
    // Extract pattern for sets that follow standard numbering
    // Examples: sv06, swsh11, sm3, xy9, bw10
    const patterns = [
        /(sv|swsh|sm|xy|bw)(\d+)/, // Standard format
        /(zsv)(\d+)(pt\d+)/, // Special format like zsv10pt5
    ];
    for (const pattern of patterns) {
        const match = normalized.match(pattern);
        if (match) {
            if (match.length === 3) {
                // Standard format: sv06, swsh11, etc. - remove leading zeros
                const series = match[1];
                const number = parseInt(match[2], 10).toString(); // Remove leading zeros
                return `${series}${number}`;
            }
            else if (match.length === 4) {
                // Special format: zsv10pt5
                return `${match[1]}${match[2]}${match[3]}`;
            }
        }
    }
    // Fallback: try to extract any alphanumeric sequence that looks like a set code
    const fallbackMatch = normalized.match(/([a-z]+\d+)(?:[a-z]+\d+)*/);
    if (fallbackMatch) {
        return fallbackMatch[1];
    }
    // Last resort: return the original but cleaned
    return normalized.replace(/[^a-z0-9]/g, '');
};
const buildDeterministicImageUrls = (setId, cardNumber) => {
    if (!setId || !cardNumber) {
        return null;
    }
    const trimmedSet = setId.trim();
    const baseNumber = cardNumber.split('/')[0].trim();
    if (!trimmedSet || !baseNumber) {
        return null;
    }
    const sanitizedNumber = baseNumber.replace(/\s+/g, '').toLowerCase();
    const normalizedSet = normalizeSetIdForImageUrl(trimmedSet);
    const baseUrl = `https://images.pokemontcg.io/${normalizedSet}/${sanitizedNumber}`;
    return {
        small: `${baseUrl}.png`,
        large: `${baseUrl}.png`, // Use .png for both (no _hires.png as it shows card backs)
    };
};
const IMAGE_COLUMN_FRAGMENT = 'cm.imageSmall, cm.imageLarge, cm.imageSource, cm.imageLastUpdated,';
const IMAGE_COLUMN_CACHE_TTL = 1000 * 60 * 5; // 5 minutes
let imageColumnCache = null;
const hasImageMetadataColumns = () => __awaiter(void 0, void 0, void 0, function* () {
    if (imageColumnCache &&
        Date.now() - imageColumnCache.checkedAt < IMAGE_COLUMN_CACHE_TTL) {
        return imageColumnCache.hasColumns;
    }
    const db = (0, database_1.getDb)();
    const hasColumns = yield new Promise((resolve) => {
        db.all("PRAGMA table_info(card_mappings)", [], (err, rows) => {
            if (err || !rows) {
                resolve(false);
            }
            else {
                resolve(rows.some((row) => row.name === 'imageSmall'));
            }
        });
    });
    imageColumnCache = { hasColumns, checkedAt: Date.now() };
    return hasColumns;
});
const getImageColumnSelectFragment = () => __awaiter(void 0, void 0, void 0, function* () {
    return (yield hasImageMetadataColumns()) ? IMAGE_COLUMN_FRAGMENT : '';
});
const getLocalCardsForQuery = (query_1, setId_1, ...args_1) => __awaiter(void 0, [query_1, setId_1, ...args_1], void 0, function* (query, setId, limit = 250) {
    const db = (0, database_1.getDb)();
    const likeQuery = `%${query}%`;
    const params = [likeQuery];
    let whereClause = 'cm.cardName LIKE ?';
    if (setId) {
        whereClause += ' AND (cm.setId = ? OR cm.setName LIKE ?)';
        params.push(setId, `%${setId}%`);
    }
    const imageColumns = yield getImageColumnSelectFragment();
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
      ${imageColumns}
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
    WHERE ${whereClause}
    ORDER BY cm.cardName ASC
    LIMIT ?
  `;
    params.push(limit);
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) {
                return reject(err);
            }
            resolve(rows || []);
        });
    });
});
const mapLocalRowsToPokemonCards = (rows) => {
    return rows.map(row => {
        // PRIORITY ORDER for images:
        // 1. Stored images from database (most reliable)
        // 2. Deterministic Pokemon TCG API URLs
        // 3. Placeholder SVG
        let images;
        if (row.imageSmall && row.imageLarge) {
            // Use stored images (best option)
            images = {
                small: row.imageSmall,
                large: row.imageLarge
            };
        }
        else {
            // Fallback to deterministic URLs or placeholder
            const deterministicImages = buildDeterministicImageUrls(row.setId, row.cardNumber);
            const placeholder = buildPlaceholderImage(row.cardName, row.setName);
            images = deterministicImages || { small: placeholder, large: placeholder };
        }
        return {
            id: row.cardId || `${row.setId}-${row.cardNumber || 'na'}`,
            name: row.cardName,
            number: row.cardNumber,
            rarity: row.rarity,
            set: {
                id: row.setId,
                name: row.setName,
                releaseDate: '2020-01-01',
                total: 100
            },
            images,
            imageSource: row.imageSource || (row.imageSmall ? 'stored' : 'generated'),
            tcgplayer: row.latestPrice ? {
                productId: row.tcgplayerProductId,
                prices: {
                    normal: { market: row.latestPrice }
                }
            } : undefined,
            marketPrice: row.latestPrice || 0,
            uniqueIdentifier: row.uniqueIdentifier,
            isLocalDbCard: true,
            source: 'local_database'
        };
    });
};
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
        const imageColumns = yield getImageColumnSelectFragment();
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
        ${imageColumns}
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
            // Transform to Pokemon TCG API compatible format using the helper function
            const cards = mapLocalRowsToPokemonCards(rows);
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
        const imageColumns = yield getImageColumnSelectFragment();
        // Exclude fake "sets" that are actually TCGPlayer product categories
        // These will NEVER have images in the Pokemon API
        const EXCLUDED_FAKE_SETS = [
            'World Championship Decks',
            'Miscellaneous Cards & Products',
            'Prize Pack Series Cards',
            'Deck Exclusives',
            'League & Championship Cards',
            'Jumbo Cards',
            'Blister Exclusives',
            'McDonald%', // McDonald's promos
            'Burger King Promos',
            'Countdown Calendar Promos',
            'Professor Program Promos',
            'Best of Promos',
            'Pikachu World Collection Promos',
            'ME01: Mega Evolution',
            'ME: Mega Evolution Promo',
            'MEE: Mega Evolution Energies',
            'SVE: Scarlet & Violet Energies',
        ];
        // Build exclusion clauses
        const exclusionClauses = EXCLUDED_FAKE_SETS.map(set => set.includes('%') ? `cm.setName NOT LIKE '${set}'` : `cm.setName != '${set}'`).join(' AND ');
        // Select random cards with their latest market price from price_history
        // ONLY from REAL Pokemon TCG sets (excludes product categories)
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
        ${imageColumns}
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
        AND ${exclusionClauses}
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
            // Use the helper function to properly map cards with stored images
            const cards = mapLocalRowsToPokemonCards(rows);
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
router.get('/pokemon', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    let persistentCacheEntry = null;
    let buildLocalFallbackResponse = null;
    const respondWithPersistent = (entry, stale = false) => {
        try {
            const parsedData = JSON.parse(entry.data || '[]');
            return {
                data: parsedData,
                totalCount: entry.totalCount || parsedData.length,
                pageSize: entry.pageSize || 250,
                pagesFetched: entry.pagesFetched || 1,
                cached: true,
                source: 'pokemon_cache',
                persistent: true,
                stale,
            };
        }
        catch (parseError) {
            console.error('Failed to parse cached pokemon data', parseError);
            return null;
        }
    };
    try {
        const { query, setId, pageSize = '250', fetchAll = 'true', maxPages = '4' } = req.query;
        if (!query || typeof query !== 'string' || query.trim().length < 2) {
            return res.status(400).json({
                error: 'Query parameter with at least 2 characters is required.',
            });
        }
        const sanitizedQuery = query.trim();
        const normalizedSetId = typeof setId === 'string' && setId.trim().length > 0 ? setId.trim() : undefined;
        const limit = Math.min(Math.max(parseInt(pageSize, 10) || 100, 1), 250);
        const shouldFetchAll = String(fetchAll).toLowerCase() !== 'false';
        const maxPagesToFetch = Math.min(Math.max(parseInt(maxPages, 10) || 4, 1), 10);
        buildLocalFallbackResponse = () => __awaiter(void 0, void 0, void 0, function* () {
            const rows = yield getLocalCardsForQuery(sanitizedQuery, normalizedSetId, limit).catch((err) => {
                console.error('Local fallback query failed', err);
                return [];
            });
            if (!rows || rows.length === 0) {
                return null;
            }
            const cards = mapLocalRowsToPokemonCards(rows);
            return {
                data: cards,
                totalCount: cards.length,
                pageSize: limit,
                pagesFetched: 1,
                cached: false,
                source: 'local_database',
                fallback: true,
            };
        });
        const cacheKey = [
            sanitizedQuery.toLowerCase(),
            normalizedSetId ? normalizedSetId.toLowerCase() : '',
            shouldFetchAll ? 'all' : 'page',
            limit,
            maxPagesToFetch,
        ].join('|');
        const now = Date.now();
        const inMemory = pokemonApiCache.get(cacheKey);
        if (inMemory && now - inMemory.fetchedAt < POKEMON_CACHE_TTL) {
            return res.json({
                data: inMemory.data,
                totalCount: inMemory.totalCount,
                pageSize: inMemory.pageSize,
                pagesFetched: inMemory.pagesFetched,
                cached: true,
                source: 'pokemon_tcg_api',
            });
        }
        persistentCacheEntry = yield getPersistentPokemonCache(cacheKey).catch((err) => {
            console.error('Error reading persistent pokemon cache', err);
            return null;
        });
        if (persistentCacheEntry &&
            now - (persistentCacheEntry.fetchedAt || 0) < POKEMON_PERSISTENT_CACHE_TTL) {
            const payload = respondWithPersistent(Object.assign(Object.assign({}, persistentCacheEntry), { pageSize: persistentCacheEntry.pageSize || limit }));
            if (payload) {
                pokemonApiCache.set(cacheKey, {
                    data: payload.data,
                    totalCount: payload.totalCount,
                    fetchedAt: persistentCacheEntry.fetchedAt,
                    pageSize: payload.pageSize,
                    pagesFetched: payload.pagesFetched,
                });
                return res.json(payload);
            }
        }
        const apiResult = yield pokemonApiClient_1.pokemonApiClient.searchCardsBulk({
            nameQuery: sanitizedQuery,
            setId: normalizedSetId,
            pageSize: limit,
            fetchAll: shouldFetchAll,
            maxPages: maxPagesToFetch,
        });
        const uniqueCards = apiResult.cards;
        if (uniqueCards.length === 0) {
            console.warn(`⚠️ No cards from Pokemon API for query "${sanitizedQuery}", trying fallbacks...`);
            if (buildLocalFallbackResponse) {
                const localPayload = yield buildLocalFallbackResponse();
                if (localPayload) {
                    console.log(`✅ Serving ${localPayload.data.length} cards from local database fallback`);
                    return res.json(localPayload);
                }
            }
            if (persistentCacheEntry) {
                const payload = respondWithPersistent(Object.assign(Object.assign({}, persistentCacheEntry), { pageSize: persistentCacheEntry.pageSize || limit }), true);
                if (payload) {
                    console.log(`✅ Serving ${payload.data.length} stale cached cards as fallback`);
                    return res.json(payload);
                }
            }
            return res.status(404).json({
                error: 'No cards found',
                query: sanitizedQuery,
                source: 'none',
            });
        }
        const payload = {
            data: uniqueCards,
            totalCount: apiResult.totalCount || uniqueCards.length,
            pageSize: limit,
            pagesFetched: apiResult.pagesFetched,
            cached: false,
            source: 'pokemon_tcg_api',
        };
        pokemonApiCache.set(cacheKey, {
            data: uniqueCards,
            totalCount: payload.totalCount,
            fetchedAt: Date.now(),
            pageSize: limit,
            pagesFetched: apiResult.pagesFetched,
        });
        try {
            yield savePersistentPokemonCache(cacheKey, {
                query: sanitizedQuery,
                setId: normalizedSetId,
                pageSize: limit,
                fetchAll: shouldFetchAll,
                maxPages: maxPagesToFetch,
                data: uniqueCards,
                totalCount: payload.totalCount,
                pagesFetched: apiResult.pagesFetched,
                fetchedAt: Date.now(),
            });
        }
        catch (cacheError) {
            console.warn('Failed to persist pokemon search cache', cacheError);
        }
        console.log(`✅ Successfully fetched ${uniqueCards.length} cards for "${sanitizedQuery}" from Pokemon API`);
        res.json(payload);
    }
    catch (error) {
        console.error('❌ Error proxying Pokemon API search:', error);
        if (buildLocalFallbackResponse) {
            try {
                const localPayload = yield buildLocalFallbackResponse();
                if (localPayload) {
                    console.log(`✅ Serving ${localPayload.data.length} cards from local database (error fallback)`);
                    return res.status(200).json(localPayload);
                }
            }
            catch (fallbackErr) {
                console.warn('Local fallback also failed:', fallbackErr);
            }
        }
        if (persistentCacheEntry) {
            const payload = respondWithPersistent(persistentCacheEntry, true);
            if (payload) {
                console.log(`✅ Serving ${payload.data.length} stale cached cards (error fallback)`);
                return res.status(200).json(payload);
            }
        }
        res.status(502).json({
            error: 'Failed to fetch results from Pokemon TCG API',
            message: error.message,
        });
    }
}));
/**
 * Search Pokemon API for card images (proxy endpoint to avoid CORS)
 */
router.get('/search-pokemon', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d;
    try {
        const { cardName, setId, cardNumber, setName } = req.query;
        if (!cardName || typeof cardName !== 'string') {
            return res.status(400).json({
                error: 'cardName query parameter is required',
            });
        }
        const cacheKey = getCacheKey(cardName, typeof setId === 'string' && setId.trim().length > 0
            ? setId
            : setName || 'unknown', cardNumber);
        const cached = cardImageCache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
            console.log(`💾 Cache hit for ${cardName} from ${setId || setName || 'unknown set'}`);
            return res.json({
                card: cached.card,
                images: cached.images,
                id: cached.id,
                matchedSet: cached.matchedSet,
                matchedNumber: cached.matchedNumber,
                cached: true,
            });
        }
        const searchResult = yield pokemonApiClient_1.pokemonApiClient.findBestImageMatch({
            cardName,
            setId: typeof setId === 'string' ? setId.trim() : undefined,
            setName: typeof setName === 'string' ? setName.trim() : undefined,
            cardNumber: typeof cardNumber === 'string' ? cardNumber.trim() : undefined,
        });
        if (!searchResult.card || !((_a = searchResult.card.images) === null || _a === void 0 ? void 0 : _a.small) || !((_b = searchResult.card.images) === null || _b === void 0 ? void 0 : _b.large)) {
            return res.status(404).json({
                error: `Card not found or missing images`,
                searched: { cardName, setId, setName, cardNumber },
                attempts: searchResult.attempts,
                availableCards: searchResult.candidates.slice(0, 5).map((card) => {
                    var _a;
                    return ({
                        name: card.name,
                        set: (_a = card.set) === null || _a === void 0 ? void 0 : _a.id,
                        number: card.number,
                    });
                }),
            });
        }
        const responsePayload = {
            card: searchResult.card,
            images: {
                small: searchResult.card.images.small,
                large: searchResult.card.images.large,
            },
            id: searchResult.card.id,
            matchedSet: (_c = searchResult.card.set) === null || _c === void 0 ? void 0 : _c.name,
            matchedNumber: searchResult.card.number,
            cached: false,
            attempts: searchResult.attempts,
            usedFallback: searchResult.usedFallback,
        };
        cardImageCache.set(cacheKey, Object.assign(Object.assign({}, responsePayload), { timestamp: Date.now() }));
        console.log(`✅ Matched card: ${searchResult.card.name} from ${(_d = searchResult.card.set) === null || _d === void 0 ? void 0 : _d.name} (#${searchResult.card.number})`);
        res.json(responsePayload);
    }
    catch (error) {
        console.error('Error searching Pokemon API:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: error.message,
        });
    }
}));
exports.default = router;
