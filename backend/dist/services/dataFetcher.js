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
exports.updatePriceData = void 0;
const database_1 = require("../db/database");
const cardIdentifier_1 = require("./cardIdentifier");
const TCGCSV_BASE_URL = 'https://tcgcsv.com/tcgplayer';
const POKEMON_CATEGORY_ID = '3';
const POKEMON_TCG_API_BASE = 'https://api.pokemontcg.io/v2';
const fetchPokemonGroups = () => __awaiter(void 0, void 0, void 0, function* () {
    const response = yield fetch(`${TCGCSV_BASE_URL}/${POKEMON_CATEGORY_ID}/groups`);
    if (!response.ok) {
        throw new Error(`Failed to fetch Pokemon groups: ${response.statusText}`);
    }
    const data = yield response.json();
    return data.results;
});
const fetchGroupProducts = (groupId) => __awaiter(void 0, void 0, void 0, function* () {
    const response = yield fetch(`${TCGCSV_BASE_URL}/${POKEMON_CATEGORY_ID}/${groupId}/products`);
    if (!response.ok) {
        throw new Error(`Failed to fetch products for group ${groupId}: ${response.statusText}`);
    }
    const data = yield response.json();
    return data.results;
});
const fetchGroupPrices = (groupId) => __awaiter(void 0, void 0, void 0, function* () {
    const response = yield fetch(`${TCGCSV_BASE_URL}/${POKEMON_CATEGORY_ID}/${groupId}/prices`);
    if (!response.ok) {
        throw new Error(`Failed to fetch prices for group ${groupId}: ${response.statusText}`);
    }
    const data = yield response.json();
    return data.results;
});
const fetchPokemonTCGCards = (setId_1, ...args_1) => __awaiter(void 0, [setId_1, ...args_1], void 0, function* (setId, page = 1) {
    const pageSize = 250;
    let url = `${POKEMON_TCG_API_BASE}/cards?pageSize=${pageSize}&page=${page}`;
    if (setId) {
        url += `&q=set.id:${setId}`;
    }
    const response = yield fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to fetch Pokemon TCG cards: ${response.statusText}`);
    }
    const data = yield response.json();
    return data.data;
});
const storePriceData = (prices, products, groupName, date) => __awaiter(void 0, void 0, void 0, function* () {
    const db = (0, database_1.getDb)();
    const insertSql = `
    INSERT OR REPLACE INTO price_history (
      productId, date, price, subTypeName, productName, groupName, 
      source, lowPrice, highPrice, marketPrice, volume, uniqueIdentifier
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;
    const stmt = db.prepare(insertSql);
    // Create a map of productId to product name for quick lookup
    const productMap = new Map(products.map(p => [p.productId, p.name]));
    return new Promise((resolve, reject) => {
        db.serialize(() => {
            db.run('BEGIN TRANSACTION');
            for (const price of prices) {
                if (price.midPrice && price.midPrice > 0) {
                    const productName = productMap.get(price.productId) || '';
                    // Extract card details from product name for better identification
                    const cardDetails = extractCardDetails(productName, groupName);
                    const uniqueIdentifier = (0, cardIdentifier_1.generateUniqueIdentifier)(cardDetails.setId, cardDetails.cardNumber, cardDetails.cardName);
                    // Store card mapping if we have enough information
                    if (cardDetails.cardName && cardDetails.setId) {
                        (0, cardIdentifier_1.storeCardMapping)({
                            cardId: `tcgcsv-${price.productId}`,
                            productId: price.productId,
                            cardName: cardDetails.cardName,
                            setId: cardDetails.setId,
                            setName: groupName,
                            cardNumber: cardDetails.cardNumber,
                            tcgplayerProductId: price.productId.toString()
                        }).catch(err => console.warn('Error storing card mapping:', err));
                    }
                    stmt.run([
                        price.productId,
                        date,
                        price.midPrice,
                        price.subTypeName || 'Normal',
                        productName,
                        groupName,
                        'tcgcsv',
                        price.lowPrice || null,
                        price.highPrice || null,
                        price.marketPrice || null,
                        null, // volume not available from TCGCSV
                        uniqueIdentifier
                    ]);
                }
            }
            db.run('COMMIT', (err) => {
                if (err) {
                    reject(err);
                }
                else {
                    resolve();
                }
            });
        });
    });
});
const storePokemonTCGData = (cards, date) => __awaiter(void 0, void 0, void 0, function* () {
    const db = (0, database_1.getDb)();
    const insertSql = `
    INSERT OR REPLACE INTO rolling_averages (
      cardId, date, avg1, avg7, avg30, lowPrice, trendPrice, marketPrice, source, condition, uniqueIdentifier
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;
    const stmt = db.prepare(insertSql);
    return new Promise((resolve, reject) => {
        db.serialize(() => {
            var _a, _b, _c;
            db.run('BEGIN TRANSACTION');
            for (const card of cards) {
                // Generate unique identifier for this card
                const cardNumber = extractCardNumber(card.id);
                const uniqueIdentifier = (0, cardIdentifier_1.generateUniqueIdentifier)(card.set.id, cardNumber, card.name);
                // Extract TCGPlayer product ID from URL if available
                let tcgplayerProductId = undefined;
                if ((_a = card.tcgplayer) === null || _a === void 0 ? void 0 : _a.url) {
                    const urlParts = card.tcgplayer.url.split('/');
                    tcgplayerProductId = urlParts[urlParts.length - 1];
                }
                // Store card mapping
                (0, cardIdentifier_1.storeCardMapping)({
                    cardId: card.id,
                    cardName: card.name,
                    setId: card.set.id,
                    setName: card.set.name,
                    cardNumber: cardNumber,
                    tcgplayerProductId: tcgplayerProductId
                }).catch(err => console.warn('Error storing card mapping:', err));
                // Store TCGPlayer data if available
                if ((_b = card.tcgplayer) === null || _b === void 0 ? void 0 : _b.prices) {
                    Object.entries(card.tcgplayer.prices).forEach(([condition, priceData]) => {
                        if (priceData.market && priceData.market > 0) {
                            stmt.run([
                                card.id,
                                date,
                                null, // avg1 not directly available
                                null, // avg7 not directly available  
                                null, // avg30 not directly available
                                priceData.low || null,
                                null, // trendPrice not available
                                priceData.market,
                                'pokemontcg',
                                condition,
                                uniqueIdentifier
                            ]);
                        }
                    });
                }
                // Store Cardmarket rolling averages if available
                if ((_c = card.cardmarket) === null || _c === void 0 ? void 0 : _c.prices) {
                    const prices = card.cardmarket.prices;
                    stmt.run([
                        card.id,
                        date,
                        prices.avg1 || null,
                        prices.avg7 || null,
                        prices.avg30 || null,
                        prices.lowPrice || null,
                        prices.trendPrice || null,
                        prices.averageSellPrice || null,
                        'cardmarket',
                        'normal',
                        uniqueIdentifier
                    ]);
                }
            }
            db.run('COMMIT', (err) => {
                if (err) {
                    reject(err);
                }
                else {
                    resolve();
                }
            });
        });
    });
});
/**
 * Extracts card details from TCGCSV product name
 */
const extractCardDetails = (productName, setName) => {
    // Common patterns in TCGCSV product names:
    // "Charizard ex (003/165)" 
    // "Pikachu - 25/102 - Common"
    // "Rayquaza VMAX (111/203) [Evolving Skies]"
    let cardName = productName;
    let cardNumber = '';
    let setId = setName.toLowerCase().replace(/[^a-z0-9]/g, '');
    // Extract card number from parentheses or after dash
    const numberMatches = productName.match(/\((\d+\/\d+)\)/) || productName.match(/(\d+\/\d+)/);
    if (numberMatches) {
        cardNumber = numberMatches[1];
        cardName = productName.replace(/\s*\([^)]*\)/, '').replace(/\s*-\s*\d+\/\d+.*$/, '').trim();
    }
    // Clean up card name
    cardName = cardName.replace(/\s*-\s*(Common|Uncommon|Rare|Ultra Rare|Secret Rare).*$/i, '').trim();
    return {
        cardName,
        cardNumber,
        setId
    };
};
/**
 * Extracts card number from Pokemon TCG API card ID
 */
const extractCardNumber = (cardId) => {
    // Pokemon TCG API card IDs are like: "xy1-1", "base1-4", "swsh1-25"
    const parts = cardId.split('-');
    return parts.length > 1 ? parts[parts.length - 1] : '';
};
const createDailySnapshot = (date) => __awaiter(void 0, void 0, void 0, function* () {
    const db = (0, database_1.getDb)();
    return new Promise((resolve, reject) => {
        // Calculate daily statistics
        const statsSql = `
      SELECT 
        COUNT(*) as totalCards,
        AVG(price) as avgPrice,
        COUNT(*) as totalVolume
      FROM price_history 
      WHERE date = ?
    `;
        db.get(statsSql, [date], (err, stats) => {
            if (err) {
                reject(err);
                return;
            }
            // Get top gainers and losers
            const gainersSql = `
        SELECT 
          ph1.productName,
          ph1.price as currentPrice,
          ph2.price as previousPrice,
          ((ph1.price - ph2.price) / ph2.price * 100) as changePercent
        FROM price_history ph1
        JOIN price_history ph2 ON ph1.productId = ph2.productId
        WHERE ph1.date = ? 
          AND ph2.date = date(?, '-1 day')
          AND ph1.price > 0 AND ph2.price > 0
        ORDER BY changePercent DESC
        LIMIT 10
      `;
            db.all(gainersSql, [date, date], (err, gainers) => {
                if (err) {
                    reject(err);
                    return;
                }
                const losersSql = gainersSql.replace('DESC', 'ASC');
                db.all(losersSql, [date, date], (err, losers) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    // Insert snapshot
                    const insertSnapshotSql = `
            INSERT OR REPLACE INTO price_snapshots 
            (date, totalCards, avgPrice, totalVolume, topGainers, topLosers)
            VALUES (?, ?, ?, ?, ?, ?)
          `;
                    db.run(insertSnapshotSql, [
                        date,
                        (stats === null || stats === void 0 ? void 0 : stats.totalCards) || 0,
                        (stats === null || stats === void 0 ? void 0 : stats.avgPrice) || 0,
                        (stats === null || stats === void 0 ? void 0 : stats.totalVolume) || 0,
                        JSON.stringify(gainers || []),
                        JSON.stringify(losers || [])
                    ], (err) => {
                        if (err) {
                            reject(err);
                        }
                        else {
                            resolve();
                        }
                    });
                });
            });
        });
    });
});
const updatePriceData = () => __awaiter(void 0, void 0, void 0, function* () {
    try {
        console.log('Starting comprehensive price data update...');
        const currentDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
        // 1. Update TCGCSV data (existing logic)
        console.log('Fetching TCGCSV data...');
        const groups = yield fetchPokemonGroups();
        console.log(`Found ${groups.length} Pokemon groups/sets`);
        let totalPricesProcessed = 0;
        // Process groups in batches to avoid overwhelming the API
        for (let i = 0; i < groups.length; i += 5) {
            const batch = groups.slice(i, i + 5);
            yield Promise.all(batch.map((group) => __awaiter(void 0, void 0, void 0, function* () {
                try {
                    console.log(`Processing group: ${group.name} (${group.groupId})`);
                    // Fetch both products and prices for this group
                    const [products, prices] = yield Promise.all([
                        fetchGroupProducts(group.groupId),
                        fetchGroupPrices(group.groupId)
                    ]);
                    if (prices.length > 0) {
                        yield storePriceData(prices, products, group.name, currentDate);
                        totalPricesProcessed += prices.length;
                        console.log(`Stored ${prices.length} prices for ${group.name}`);
                    }
                    // Small delay to be respectful to the API
                    yield new Promise(resolve => setTimeout(resolve, 100));
                }
                catch (error) {
                    console.error(`Error processing group ${group.name}:`, error);
                }
            })));
            // Longer delay between batches
            yield new Promise(resolve => setTimeout(resolve, 500));
        }
        // 2. Update Pokemon TCG API rolling averages
        console.log('Fetching Pokemon TCG API rolling averages...');
        let page = 1;
        let totalTCGCards = 0;
        while (true) {
            try {
                const cards = yield fetchPokemonTCGCards(undefined, page);
                if (cards.length === 0)
                    break;
                yield storePokemonTCGData(cards, currentDate);
                totalTCGCards += cards.length;
                console.log(`Processed ${cards.length} cards from Pokemon TCG API (page ${page})`);
                page++;
                // Rate limiting - be respectful to the API
                yield new Promise(resolve => setTimeout(resolve, 200));
                // Don't fetch too many pages at once (can be adjusted)
                if (page > 10)
                    break;
            }
            catch (error) {
                console.error(`Error fetching Pokemon TCG API page ${page}:`, error);
                break;
            }
        }
        // 3. Create daily snapshot for analytics
        console.log('Creating daily market snapshot...');
        yield createDailySnapshot(currentDate);
        console.log(`
      Price data update completed:
      - TCGCSV prices: ${totalPricesProcessed}
      - Pokemon TCG cards: ${totalTCGCards}
      - Daily snapshot created
    `);
    }
    catch (error) {
        console.error('Failed to update price data:', error);
    }
});
exports.updatePriceData = updatePriceData;
