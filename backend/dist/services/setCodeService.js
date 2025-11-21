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
exports.setCodeService = exports.SetCodeService = void 0;
const pokemonApiClient_1 = require("./pokemonApiClient");
const logger_1 = require("../utils/logger");
/**
 * Service for managing Pokemon TCG set codes and mappings
 * Eliminates the need for manual mapping by using actual API data
 */
class SetCodeService {
    constructor() {
        this.setCodeMap = new Map();
        this.initialized = false;
        this.initializationPromise = null;
    }
    /**
     * Initialize the service by loading all set codes from Pokemon TCG API
     */
    initialize() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.initialized)
                return;
            if (this.initializationPromise) {
                return this.initializationPromise;
            }
            this.initializationPromise = this.loadSetCodes();
            yield this.initializationPromise;
        });
    }
    /**
     * Load all set codes from Pokemon TCG API
     */
    loadSetCodes() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                logger_1.logger.info('Loading Pokemon TCG set codes...');
                this.setCodeMap = yield pokemonApiClient_1.pokemonApiClient.getSetCodeMap();
                this.initialized = true;
                logger_1.logger.info(`Successfully loaded ${this.setCodeMap.size} set codes`);
            }
            catch (error) {
                logger_1.logger.error('Failed to load set codes from API', { error: error.message });
                // Continue with empty map - fallback will be used
                this.setCodeMap = new Map();
                this.initialized = true;
            }
        });
    }
    /**
     * Get the correct Pokemon TCG API set code for a database set ID
     * This replaces the manual mapping with API-driven lookup
     */
    getApiSetCode(databaseSetId) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.initialize();
            if (!databaseSetId)
                return null;
            const normalizedDbId = databaseSetId.toLowerCase();
            // Direct lookup by exact match
            if (this.setCodeMap.has(normalizedDbId)) {
                const set = this.setCodeMap.get(normalizedDbId);
                logger_1.logger.debug(`Found exact match for ${databaseSetId}: ${set.id}`);
                return set.id;
            }
            // Try fuzzy matching based on patterns
            const apiCode = this.findBestMatch(normalizedDbId);
            if (apiCode) {
                logger_1.logger.debug(`Found fuzzy match for ${databaseSetId}: ${apiCode}`);
                return apiCode;
            }
            // Fallback to pattern-based extraction
            const fallbackCode = this.extractSetCodeFromPattern(normalizedDbId);
            if (fallbackCode) {
                logger_1.logger.debug(`Using pattern fallback for ${databaseSetId}: ${fallbackCode}`);
                return fallbackCode;
            }
            logger_1.logger.warn(`Could not find API set code for database ID: ${databaseSetId}`);
            return null;
        });
    }
    /**
     * Find the best matching API set code using various strategies
     */
    findBestMatch(normalizedDbId) {
        // Strategy 1: Remove common suffixes and try again
        const suffixes = ['baseset', 'promocards', 'promos', 'trainerkit'];
        for (const suffix of suffixes) {
            if (normalizedDbId.endsWith(suffix)) {
                const withoutSuffix = normalizedDbId.replace(new RegExp(`${suffix}$`), '');
                if (this.setCodeMap.has(withoutSuffix)) {
                    return this.setCodeMap.get(withoutSuffix).id;
                }
            }
        }
        // Strategy 2: Extract series and number patterns
        const seriesPatterns = [
            /(sv|swsh|sm|xy|bw)(\d+)/, // Main series
            /(base)(\d+)/, // Base sets
            /(ex|pl|hgss|col)(\d+)/, // Special series
        ];
        for (const pattern of seriesPatterns) {
            const match = normalizedDbId.match(pattern);
            if (match) {
                const series = match[1];
                const number = parseInt(match[2], 10);
                // Try exact match
                const exactKey = `${series}${number}`;
                if (this.setCodeMap.has(exactKey)) {
                    return this.setCodeMap.get(exactKey).id;
                }
                // Try with series prefix
                const seriesKey = `${series}${number}`;
                if (this.setCodeMap.has(seriesKey)) {
                    return this.setCodeMap.get(seriesKey).id;
                }
            }
        }
        // Strategy 3: Check for special set names
        const specialMappings = {
            'svscarletvioletbaseset': 'sv1',
            'svpaldeanfates': 'svp',
            'svprismaticevolutions': 'svpe',
            'svscarletviolet151': 'svu',
            'svescarletvioletenergies': 'sve',
            'blackandwhite': 'bw1',
            'boundariescrossed': 'bw7',
            'plasmablast': 'bw8',
            'plasmastorm': 'bw9',
            'celebrations': 'cel25',
            'calloflegends': 'col1',
            'triumphant': 'hgss1',
            'unleashed': 'hgss2',
            'undefeated': 'hgss3',
            'triumphantarceus': 'hgss4',
            'aquapolis': 'ecard1',
            'skyridge': 'ecard2',
            'arceus': 'pl1',
            'suprememajestic': 'pl2',
            'risingrivals': 'pl3',
            'arceusmajesticdawn': 'pl4',
        };
        if (specialMappings[normalizedDbId]) {
            return specialMappings[normalizedDbId];
        }
        return null;
    }
    /**
     * Extract set code using pattern recognition as last resort
     */
    extractSetCodeFromPattern(normalizedDbId) {
        // Extract alphanumeric sequences that look like set codes
        const patterns = [
            /(sv|swsh|sm|xy|bw|ex|pl|hgss|col|cel|ecard)(\d+)/,
            /(base|p|bp|np)(\d*)/,
        ];
        for (const pattern of patterns) {
            const match = normalizedDbId.match(pattern);
            if (match) {
                const series = match[1];
                const number = match[2] || '';
                // Remove leading zeros from numbers
                const cleanNumber = number ? parseInt(number, 10).toString() : '';
                return `${series}${cleanNumber}`;
            }
        }
        return null;
    }
    /**
     * Get all available set codes
     */
    getAllSetCodes() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.initialize();
            return Array.from(this.setCodeMap.keys());
        });
    }
    /**
     * Get set data by API set code
     */
    getSetByCode(apiSetCode) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.initialize();
            for (const [key, set] of this.setCodeMap) {
                if (set.id.toLowerCase() === apiSetCode.toLowerCase()) {
                    return set;
                }
            }
            return null;
        });
    }
    /**
     * Check if service is ready
     */
    isInitialized() {
        return this.initialized;
    }
    /**
     * Clear cache and reload (useful for testing)
     */
    reload() {
        return __awaiter(this, void 0, void 0, function* () {
            this.initialized = false;
            this.initializationPromise = null;
            this.setCodeMap.clear();
            yield this.initialize();
        });
    }
}
exports.SetCodeService = SetCodeService;
exports.setCodeService = new SetCodeService();
