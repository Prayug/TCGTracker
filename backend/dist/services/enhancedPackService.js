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
exports.enhancedPackService = exports.EnhancedPackService = void 0;
const database_1 = require("../db/database");
const pokemonApiClient_1 = require("./pokemonApiClient");
const logger_1 = require("../utils/logger");
const setCodeService_1 = require("./setCodeService");
/**
 * Enhanced pack service that combines Pokemon TCG API with local database
 * for more reliable and consistent pack opening
 */
class EnhancedPackService {
    constructor() {
        this.defaultPackConfig = {
            name: 'Standard Pack',
            price: 4.99,
            guaranteedCards: 10,
            rarityDistribution: {
                common: 60,
                uncommon: 28,
                rare: 8,
                rareHolo: 2.5,
                rareUltra: 0.8,
                rareSecret: 0.15,
                rareRainbow: 0.05,
                promo: 0.5
            }
        };
    }
    /**
     * Open a pack using enhanced logic with fallback to local database
     */
    openPack(setId_1) {
        return __awaiter(this, arguments, void 0, function* (setId, config = {}) {
            const packConfig = Object.assign(Object.assign({}, this.defaultPackConfig), config);
            logger_1.logger.info(`Opening enhanced pack for set ${setId} with config: ${packConfig.name}`);
            try {
                // Try to get cards from Pokemon API first
                let apiCards = yield pokemonApiClient_1.pokemonApiClient.getCardsFromSet(setId, 500);
                // If API fails or returns no cards, fall back to local database
                if (apiCards.length === 0) {
                    logger_1.logger.warn(`No cards from Pokemon API for set ${setId}, using local database`);
                    apiCards = yield this.getCardsFromLocalDb(setId);
                }
                if (apiCards.length === 0) {
                    throw new Error(`No cards available for set ${setId}`);
                }
                // Group cards by rarity
                const cardsByRarity = this.groupCardsByRarity(apiCards);
                // Generate pack contents
                const packCards = yield this.generatePackContents(cardsByRarity, packConfig);
                // Calculate pricing
                const totalValue = packCards.reduce((sum, card) => sum + (card.marketPrice || 0), 0);
                const profit = totalValue - packConfig.price;
                const result = {
                    cards: packCards,
                    totalValue,
                    profit,
                    packPrice: packConfig.price
                };
                logger_1.logger.info(`Pack opened: ${packCards.length} cards, value $${totalValue.toFixed(2)}, profit $${profit.toFixed(2)}`);
                return result;
            }
            catch (error) {
                logger_1.logger.error('Error opening enhanced pack:', error);
                throw error;
            }
        });
    }
    /**
     * Get cards from local database as fallback
     */
    getCardsFromLocalDb(setId) {
        return __awaiter(this, void 0, void 0, function* () {
            const db = (0, database_1.getDb)();
            return new Promise((resolve, reject) => {
                const sql = `
        SELECT
          cm.cardId as id,
          cm.cardName as name,
          cm.cardNumber as number,
          cm.rarity,
          cm.setId,
          cm.setName,
          ph.marketPrice,
          cm.imageSmall,
          cm.imageLarge
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
        WHERE cm.setId = ? OR cm.setName LIKE ?
        ORDER BY cm.cardNumber ASC
      `;
                db.all(sql, [setId, `%${setId}%`], (err, rows) => __awaiter(this, void 0, void 0, function* () {
                    if (err) {
                        reject(err);
                        return;
                    }
                    const cards = yield Promise.all(rows.map((row) => __awaiter(this, void 0, void 0, function* () {
                        const storedImages = row.imageSmall || row.imageLarge ? {
                            small: row.imageSmall,
                            large: row.imageLarge
                        } : null;
                        const deterministicImages = storedImages
                            ? null
                            : yield setCodeService_1.setCodeService.buildDeterministicImageUrls(row.setId, row.cardNumber, row.setName);
                        return {
                            id: row.id,
                            name: row.name,
                            number: row.number,
                            rarity: row.rarity,
                            set: {
                                id: row.setId,
                                name: row.setName
                            },
                            images: storedImages || deterministicImages || undefined,
                            tcgplayer: row.marketPrice ? {
                                prices: {
                                    normal: { market: row.marketPrice }
                                }
                            } : undefined
                        };
                    })));
                    resolve(cards);
                }));
            });
        });
    }
    /**
     * Group cards by their rarity
     */
    groupCardsByRarity(cards) {
        const grouped = {};
        cards.forEach(card => {
            const rarity = this.normalizeRarity(card.rarity || 'Common');
            if (!grouped[rarity]) {
                grouped[rarity] = [];
            }
            grouped[rarity].push(card);
        });
        return grouped;
    }
    /**
     * Normalize rarity names to standard format
     */
    normalizeRarity(rarity) {
        const rarityMap = {
            'Common': 'Common',
            'Uncommon': 'Uncommon',
            'Rare': 'Rare',
            'Rare Holo': 'Rare Holo',
            'Rare Ultra': 'Rare Ultra',
            'Rare Secret': 'Rare Secret',
            'Rare Rainbow': 'Rare Rainbow',
            'Promo': 'Promo',
            'Amazing Rare': 'Rare Ultra',
            '1st Edition': 'Rare Holo',
            // Add more mappings as needed
        };
        return rarityMap[rarity] || rarity;
    }
    /**
     * Generate pack contents based on rarity distribution
     */
    generatePackContents(cardsByRarity, config) {
        return __awaiter(this, void 0, void 0, function* () {
            const packCards = [];
            // Generate guaranteed cards based on distribution
            const rarityKeys = Object.keys(config.rarityDistribution);
            const totalWeight = Object.values(config.rarityDistribution).reduce((sum, weight) => sum + weight, 0);
            for (let i = 0; i < config.guaranteedCards; i++) {
                const selectedRarity = this.selectRarityByWeight(config.rarityDistribution, totalWeight);
                const cardsForRarity = cardsByRarity[selectedRarity] || cardsByRarity['Common'] || [];
                if (cardsForRarity.length > 0) {
                    const randomCard = cardsForRarity[Math.floor(Math.random() * cardsForRarity.length)];
                    packCards.push(this.convertToPackCard(randomCard));
                }
            }
            // Add bonus cards if configured
            if (config.bonusCards) {
                for (let i = 0; i < config.bonusCards; i++) {
                    // Bonus cards are typically commons/uncommons
                    const bonusRarities = ['Common', 'Uncommon'];
                    const selectedRarity = bonusRarities[Math.floor(Math.random() * bonusRarities.length)];
                    const cardsForRarity = cardsByRarity[selectedRarity] || [];
                    if (cardsForRarity.length > 0) {
                        const randomCard = cardsForRarity[Math.floor(Math.random() * cardsForRarity.length)];
                        packCards.push(this.convertToPackCard(randomCard));
                    }
                }
            }
            return packCards;
        });
    }
    /**
     * Select rarity based on weighted distribution
     */
    selectRarityByWeight(distribution, totalWeight) {
        const rand = Math.random() * totalWeight;
        let cumulative = 0;
        for (const [rarity, weight] of Object.entries(distribution)) {
            cumulative += weight;
            if (rand <= cumulative) {
                return rarity;
            }
        }
        return 'Common'; // Fallback
    }
    /**
     * Convert PokemonApiCard to PackCard format
     */
    convertToPackCard(card) {
        return {
            id: card.id,
            name: card.name,
            number: card.number,
            rarity: card.rarity,
            set: {
                id: card.set.id,
                name: card.set.name
            },
            images: card.images,
            marketPrice: this.extractCardPrice(card),
            source: 'pokemon_api'
        };
    }
    /**
     * Extract price from card data
     */
    extractCardPrice(card) {
        var _a, _b, _c;
        if ((_a = card.tcgplayer) === null || _a === void 0 ? void 0 : _a.prices) {
            const prices = card.tcgplayer.prices;
            // Priority order for price variants
            const variants = ['normal', 'holofoil', 'reverseHolofoil', '1stEdition', 'unlimited'];
            for (const variant of variants) {
                if ((_b = prices[variant]) === null || _b === void 0 ? void 0 : _b.market) {
                    return prices[variant].market;
                }
                if ((_c = prices[variant]) === null || _c === void 0 ? void 0 : _c.mid) {
                    return prices[variant].mid;
                }
            }
            // Fallback to any available price
            for (const priceData of Object.values(prices)) {
                if (typeof priceData === 'object' && priceData !== null) {
                    if ('market' in priceData && priceData.market)
                        return priceData.market;
                    if ('mid' in priceData && priceData.mid)
                        return priceData.mid;
                }
            }
        }
        return 0;
    }
    /**
     * Get available sets for pack opening
     */
    getAvailableSets() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                // Try Pokemon API first
                const apiSets = yield pokemonApiClient_1.pokemonApiClient.getSets(50);
                if (apiSets.length > 0) {
                    return apiSets
                        .filter(set => set.id && set.name)
                        .map(set => ({
                        id: set.id,
                        name: set.name,
                        totalCards: 0 // API doesn't provide this directly
                    }));
                }
            }
            catch (error) {
                logger_1.logger.warn('Pokemon API sets failed, using local database', { error: error.message });
            }
            // Fallback to local database
            const db = (0, database_1.getDb)();
            return new Promise((resolve, reject) => {
                const sql = `
        SELECT setId as id, setName as name, COUNT(*) as totalCards
        FROM card_mappings
        WHERE setId IS NOT NULL AND setName IS NOT NULL
        GROUP BY setId, setName
        ORDER BY setName ASC
        LIMIT 50
      `;
                db.all(sql, [], (err, rows) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    resolve(rows.map(row => ({
                        id: row.id,
                        name: row.name,
                        totalCards: row.totalCards
                    })));
                });
            });
        });
    }
}
exports.EnhancedPackService = EnhancedPackService;
exports.enhancedPackService = new EnhancedPackService();
