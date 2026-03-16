"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PkmnPricesMarketProvider = void 0;
exports.createPkmnPricesProvider = createPkmnPricesProvider;
const logger_1 = require("../../utils/logger");
const normalizeVariantKey_1 = require("../../utils/normalizeVariantKey");
const PKMNPRICES_API_URL = 'https://api.pkmnprices.com/v1';
/**
 * Maps PokemonTCG API set IDs to PkmnPrices set names or patterns.
 * PkmnPrices uses different set naming conventions.
 */
function mapSetIdToSearchPattern(setId, setName) {
    // PkmnPrices uses set names like "ME: Ascended Heroes" for Mega Evolution sets
    // The PokemonTCG API uses IDs like "me2pt5"
    const setPatterns = {
        'me1': 'ME: Mega Evolution',
        'me2': 'ME: Phantasmal Flames',
        'me2pt5': 'ME: Ascended Heroes',
        'me3': 'ME: Perfect Order',
        'me4': 'ME: Chaos Rising',
        'me5': 'ME: Pitch Black',
        'sv8pt5': 'SV: Prismatic Evolutions',
        'sv8': 'SV: Surging Sparks',
        'sv7': 'SV: Paldean Fates',
        'sv6': 'SV: Obsidian Flames',
        'sv5': 'SV: 151',
        'sv4': 'SV: Paldea Evolved',
        'sv3': 'SV: Scarlet & Violet',
    };
    return setPatterns[setId] || setName;
}
class PkmnPricesMarketProvider {
    constructor(config) {
        this.timeoutMs = 10000;
        this.fetchFailureCount = 0;
        this.nextFailureLogAt = 5;
        this.cardIdCache = new Map();
        this.config = config;
    }
    get failureCount() {
        return this.fetchFailureCount;
    }
    get enabled() {
        return this.config.enabled && Boolean(this.config.apiKey);
    }
    async fetchWithAuth(url) {
        if (!this.config.apiKey) {
            throw new Error('PkmnPrices API key not configured');
        }
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
        try {
            const response = await fetch(url, {
                headers: {
                    'Accept': 'application/json',
                    'X-API-Key': this.config.apiKey,
                },
                signal: controller.signal,
            });
            return response;
        }
        finally {
            clearTimeout(timeout);
        }
    }
    /**
     * Search for a card by name and set to find the PkmnPrices card ID.
     */
    async searchCard(cardName, setId, setName) {
        const cacheKey = `${cardName}:${setId}`;
        if (this.cardIdCache.has(cacheKey)) {
            return this.cardIdCache.get(cacheKey);
        }
        const searchPattern = mapSetIdToSearchPattern(setId, setName);
        const encodedName = encodeURIComponent(cardName);
        const encodedSet = encodeURIComponent(searchPattern);
        const url = `${PKMNPRICES_API_URL}/cards?name=${encodedName}&set=${encodedSet}&per_page=5`;
        try {
            const response = await this.fetchWithAuth(url);
            if (response.status === 429) {
                logger_1.logger.warn('PkmnPrices rate limit hit', { cardName, setId });
                return null;
            }
            if (!response.ok) {
                logger_1.logger.debug('PkmnPrices search failed', { status: response.status, cardName, setId });
                return null;
            }
            const result = await response.json();
            if (!result.data || result.data.length === 0) {
                return null;
            }
            // Find the best match - prefer exact name match
            const exactMatch = result.data.find(card => card.name.toLowerCase() === cardName.toLowerCase());
            const bestMatch = exactMatch || result.data[0];
            this.cardIdCache.set(cacheKey, bestMatch.id);
            return bestMatch.id;
        }
        catch (error) {
            if (error.name === 'AbortError') {
                logger_1.logger.debug('PkmnPrices search timeout', { cardName, setId });
                return null;
            }
            throw error;
        }
    }
    /**
     * Fetch a card by ID with price data.
     */
    async fetchCard(pkmnPricesId) {
        const url = `${PKMNPRICES_API_URL}/cards/${pkmnPricesId}?currency=usd`;
        try {
            const response = await this.fetchWithAuth(url);
            if (response.status === 404) {
                return null;
            }
            if (response.status === 429) {
                logger_1.logger.warn('PkmnPrices rate limit hit', { pkmnPricesId });
                return null;
            }
            if (!response.ok) {
                throw new Error(`PkmnPrices card fetch failed (${response.status})`);
            }
            return await response.json();
        }
        catch (error) {
            if (error.name === 'AbortError') {
                return null;
            }
            throw error;
        }
    }
    async getSnapshotForCard(cardId, cardName, setId, setName) {
        if (!this.enabled) {
            return null;
        }
        if (!cardName || !setId || !setName) {
            return null;
        }
        try {
            // Step 1: Search for the card to get PkmnPrices ID
            const pkmnPricesId = await this.searchCard(cardName, setId, setName);
            if (!pkmnPricesId) {
                return null;
            }
            // Step 2: Fetch the card with prices
            const card = await this.fetchCard(pkmnPricesId);
            this.fetchFailureCount = 0;
            this.nextFailureLogAt = 25;
            if (!card || !card.prices || card.prices.length === 0) {
                return null;
            }
            // Step 3: Convert to MarketPriceSnapshot format
            const points = card.prices
                .filter(price => price.source === 'tcgplayer' && price.market_price > 0)
                .map(price => {
                const variantKey = (0, normalizeVariantKey_1.normalizeVariantKey)(price.variant || 'normal');
                return {
                    variantKey,
                    rawVariantName: price.variant || 'normal',
                    productId: pkmnPricesId,
                    marketPrice: price.market_price,
                    lowPrice: price.low_price,
                    highPrice: price.high_price,
                    volume: undefined,
                };
            })
                .filter(point => point.marketPrice > 0);
            if (points.length === 0) {
                return null;
            }
            return {
                cardId,
                cardName,
                setId,
                setName,
                cardNumber: undefined,
                points,
            };
        }
        catch (error) {
            this.fetchFailureCount += 1;
            if (this.fetchFailureCount >= this.nextFailureLogAt) {
                logger_1.logger.error('PkmnPrices market fetch failing repeatedly', {
                    failures: this.fetchFailureCount,
                    sampleCardId: cardId,
                    error: error.message,
                });
                this.nextFailureLogAt += 25;
            }
            return null;
        }
    }
}
exports.PkmnPricesMarketProvider = PkmnPricesMarketProvider;
/**
 * Create a PkmnPrices provider instance based on environment config.
 */
function createPkmnPricesProvider(apiKey) {
    const enabled = Boolean(apiKey);
    if (enabled) {
        logger_1.logger.info('PkmnPrices provider enabled');
    }
    else {
        logger_1.logger.info('PkmnPrices provider disabled (no API key)');
    }
    return new PkmnPricesMarketProvider({ apiKey, enabled });
}
