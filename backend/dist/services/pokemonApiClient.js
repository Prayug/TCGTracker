"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pokemonApiClient = void 0;
const env_1 = require("../config/env");
const logger_1 = require("../utils/logger");
const RETRYABLE_STATUS = new Set([408, 409, 425, 429, 500, 502, 503, 504]);
const BASE_URL = 'https://api.pokemontcg.io/v2';
class PokemonApiClient {
    constructor() {
        this.apiKey = env_1.env.apis.pokemonTcg || '';
        this.maxRetries = 2;
        this.defaultTimeout = 30000; // Increased to 30 seconds for large requests
    }
    buildHeaders() {
        const headers = {
            Accept: 'application/json',
        };
        if (this.apiKey) {
            headers['X-Api-Key'] = this.apiKey;
        }
        return headers;
    }
    buildQuery(params) {
        if (params.rawQuery) {
            return params.rawQuery;
        }
        const parts = [];
        if (params.nameQuery && params.nameQuery.trim().length > 0) {
            const sanitizedName = params.nameQuery.trim();
            parts.push(`name:*${sanitizedName}*`);
        }
        if (params.setId) {
            parts.push(`set.id:${params.setId}`);
        }
        return parts.length > 0 ? parts.join(' ') : undefined;
    }
    async delay(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
    shouldRetry(status) {
        return RETRYABLE_STATUS.has(status);
    }
    async request(endpoint, params, timeoutMs = this.defaultTimeout) {
        const url = new URL(`${BASE_URL}${endpoint}`);
        if (params) {
            Object.entries(params).forEach(([key, value]) => {
                if (typeof value === 'string' && value.length > 0) {
                    url.searchParams.append(key, value);
                }
            });
        }
        let attempt = 0;
        let lastError = null;
        while (attempt <= this.maxRetries) {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), timeoutMs);
            try {
                const response = await fetch(url.toString(), {
                    headers: this.buildHeaders(),
                    signal: controller.signal,
                });
                clearTimeout(timeout);
                if (!response.ok) {
                    if (this.shouldRetry(response.status) && attempt < this.maxRetries) {
                        attempt += 1;
                        const backoff = 1500 * attempt;
                        logger_1.logger.warn(`Pokemon API ${response.status}. Retrying in ${backoff}ms...`, {
                            endpoint,
                            params,
                        });
                        await this.delay(backoff);
                        continue;
                    }
                    throw new Error(`Pokemon API ${response.status} ${response.statusText}`);
                }
                return (await response.json());
            }
            catch (error) {
                clearTimeout(timeout);
                lastError = error;
                if (attempt >= this.maxRetries) {
                    break;
                }
                attempt += 1;
                const backoff = 1500 * attempt;
                logger_1.logger.warn(`Pokemon API request failed (attempt ${attempt}). Retrying in ${backoff}ms`, {
                    endpoint,
                    params,
                    error: lastError.message,
                });
                await this.delay(backoff);
            }
        }
        throw lastError || new Error('Pokemon API request failed');
    }
    async searchCards(params) {
        var _a, _b, _c, _d, _e;
        const page = (_a = params.page) !== null && _a !== void 0 ? _a : 1;
        const pageSize = (_b = params.pageSize) !== null && _b !== void 0 ? _b : 250;
        const query = this.buildQuery(params);
        const requestParams = {
            page: page.toString(),
            pageSize: pageSize.toString(),
        };
        if (query) {
            requestParams.q = query;
        }
        const response = await this.request('/cards', requestParams);
        return {
            cards: (_c = response.data) !== null && _c !== void 0 ? _c : [],
            totalCount: (_e = (_d = response.totalCount) !== null && _d !== void 0 ? _d : response.total) !== null && _e !== void 0 ? _e : 0,
            page,
            pageSize,
        };
    }
    async searchCardsBulk(options) {
        var _a, _b, _c;
        const fetchAll = options.fetchAll !== false;
        const maxPages = (_a = options.maxPages) !== null && _a !== void 0 ? _a : 4;
        const pageSize = (_b = options.pageSize) !== null && _b !== void 0 ? _b : 250;
        let currentPage = (_c = options.startPage) !== null && _c !== void 0 ? _c : 1;
        let pagesFetched = 0;
        let totalCount = 0;
        const collected = [];
        while (true) {
            const pageResult = await this.searchCards({
                nameQuery: options.nameQuery,
                setId: options.setId,
                rawQuery: options.rawQuery,
                page: currentPage,
                pageSize,
            });
            pagesFetched += 1;
            if (!totalCount && pageResult.totalCount) {
                totalCount = pageResult.totalCount;
            }
            if (pageResult.cards.length > 0) {
                collected.push(...pageResult.cards);
            }
            if (!fetchAll || pageResult.cards.length < pageSize || pagesFetched >= maxPages) {
                break;
            }
            currentPage += 1;
        }
        return {
            cards: this.uniqueCards(collected),
            totalCount: totalCount || collected.length,
            pagesFetched,
        };
    }
    async findBestImageMatch(options) {
        const strategies = this.buildImageSearchStrategies(options);
        const attempts = [];
        const strategyResults = await Promise.all(strategies.map(async (strategy) => {
            try {
                const page = await this.searchCards({
                    rawQuery: strategy.rawQuery,
                    pageSize: strategy.pageSize,
                });
                attempts.push({
                    strategy: strategy.label,
                    results: page.cards.length,
                });
                return page.cards;
            }
            catch (error) {
                attempts.push({
                    strategy: strategy.label,
                    results: 0,
                    error: error.message,
                });
                return [];
            }
        }));
        const combined = this.uniqueCards(strategyResults.flat());
        if (combined.length === 0) {
            return {
                card: null,
                attempts,
                candidates: [],
                usedFallback: false,
            };
        }
        const selection = this.selectBestCard(combined, options);
        return {
            card: selection.card,
            attempts,
            candidates: combined.slice(0, 25),
            usedFallback: selection.usedFallback,
        };
    }
    async getSets(limit = 250) {
        var _a;
        try {
            // Use longer timeout for set fetching (can be a large request)
            const response = await this.request('/sets', {
                orderBy: '-releaseDate',
                pageSize: String(limit),
            }, 45000); // 45 second timeout for large set lists
            return (_a = response.data) !== null && _a !== void 0 ? _a : [];
        }
        catch (error) {
            logger_1.logger.warn('Pokemon API failed, falling back to cached/empty data', { error: error.message });
            // Return empty array so callers can surface the API miss directly.
            return [];
        }
    }
    /**
     * Get all sets and return them as a map of set codes to set data
     */
    async getSetCodeMap() {
        try {
            const sets = await this.getSets(1000); // Get many sets
            const setMap = new Map();
            sets.forEach(set => {
                if (set.id && set.name) {
                    setMap.set(set.id.toLowerCase(), set);
                    // Also map by name for fuzzy matching
                    setMap.set(set.name.toLowerCase().replace(/[^a-z0-9]/g, ''), set);
                }
            });
            logger_1.logger.info(`Loaded ${setMap.size} sets into code map`);
            return setMap;
        }
        catch (error) {
            logger_1.logger.error('Failed to load set code map', { error: error.message });
            return new Map();
        }
    }
    /**
     * Get cards from a specific set with improved error handling
     */
    async getCardsFromSet(setId, pageSize = 250) {
        var _a;
        try {
            const response = await this.request('/cards', {
                q: `set.id:${setId}`,
                pageSize: String(pageSize),
                orderBy: 'number'
            });
            return (_a = response.data) !== null && _a !== void 0 ? _a : [];
        }
        catch (error) {
            logger_1.logger.warn(`Failed to fetch cards for set ${setId}`, { error: error.message });
            return [];
        }
    }
    uniqueCards(cards) {
        const map = new Map();
        cards.forEach((card) => {
            if (!map.has(card.id)) {
                map.set(card.id, card);
            }
        });
        return Array.from(map.values());
    }
    normalizeCardNumber(value) {
        if (!value)
            return '';
        const beforeSlash = value.split('/')[0].trim();
        return beforeSlash.toLowerCase().replace(/^0+/, '').replace(/[^a-z0-9]/g, '');
    }
    selectBestCard(candidates, options) {
        const normalizedName = options.cardName.toLowerCase();
        const exactNameMatches = candidates.filter((card) => card.name.toLowerCase() === normalizedName);
        const nameMatches = exactNameMatches.length > 0 ? exactNameMatches : candidates;
        if (nameMatches.length === 0) {
            return { card: null, usedFallback: false };
        }
        if (options.cardNumber) {
            const requestedNumber = this.normalizeCardNumber(options.cardNumber);
            const strictMatch = nameMatches.find((card) => this.normalizeCardNumber(card.number) === requestedNumber);
            if (strictMatch) {
                return { card: strictMatch, usedFallback: false };
            }
            return { card: null, usedFallback: false };
        }
        if (!options.cardNumber && options.setId) {
            const sameSet = nameMatches.find((card) => { var _a, _b; return ((_b = (_a = card.set) === null || _a === void 0 ? void 0 : _a.id) === null || _b === void 0 ? void 0 : _b.toLowerCase()) === options.setId.toLowerCase(); });
            if (sameSet) {
                return { card: sameSet, usedFallback: false };
            }
        }
        if (!options.cardNumber && options.setName) {
            const normalizedSet = options.setName.toLowerCase();
            const sameSetName = nameMatches.find((card) => { var _a, _b; return ((_b = (_a = card.set) === null || _a === void 0 ? void 0 : _a.name) === null || _b === void 0 ? void 0 : _b.toLowerCase()) === normalizedSet; });
            if (sameSetName) {
                return { card: sameSetName, usedFallback: false };
            }
        }
        return { card: null, usedFallback: false };
    }
    buildImageSearchStrategies(options) {
        const cardName = options.cardName.replace(/"/g, '').trim();
        const strategies = [];
        if (options.cardNumber) {
            const numberOnly = options.cardNumber.split('/')[0].trim();
            if (options.setId) {
                strategies.push({
                    label: 'name+set+num',
                    rawQuery: `name:${cardName} set.id:${options.setId} number:${numberOnly}`,
                    pageSize: 5,
                });
            }
            strategies.push({
                label: 'name+num',
                rawQuery: `name:${cardName} number:${numberOnly}`,
                pageSize: 10,
            });
        }
        if (options.setId) {
            strategies.push({
                label: 'name+set',
                rawQuery: `name:${cardName} set.id:${options.setId}`,
                pageSize: 10,
            });
        }
        if (options.setName) {
            const sanitizedSet = options.setName.replace(/"/g, '').trim();
            strategies.push({
                label: 'name+set.name',
                rawQuery: `name:${cardName} set.name:"${sanitizedSet}"`,
                pageSize: 10,
            });
        }
        strategies.push({
            label: 'name-only',
            rawQuery: `name:${cardName}`,
            pageSize: 20,
        });
        return strategies;
    }
}
exports.pokemonApiClient = new PokemonApiClient();
