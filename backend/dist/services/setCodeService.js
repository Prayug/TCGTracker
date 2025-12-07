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
 * Simple, dynamic set code service using Pokemon TCG API
 * No hard-coded mappings - everything is loaded from the official API
 */
class SetCodeService {
    constructor() {
        this.dynamicSetMap = new Map();
        this.initialized = false;
        this.initializationPromise = null;
        this.lastRefresh = 0;
        this.REFRESH_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours
    }
    /**
     * Initialize by loading all sets from Pokemon TCG API
     */
    initialize() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.initialized && this.dynamicSetMap.size > 0) {
                logger_1.logger.info('SetCodeService already initialized with ' + this.dynamicSetMap.size + ' mappings');
                return;
            }
            if (this.initializationPromise) {
                logger_1.logger.info('SetCodeService initialization already in progress, waiting...');
                return this.initializationPromise;
            }
            logger_1.logger.info('Starting SetCodeService initialization...');
            this.initializationPromise = this.loadSets();
            yield this.initializationPromise;
            this.initializationPromise = null; // Reset for future re-initializations
        });
    }
    /**
     * Load all sets from Pokemon TCG API and build dynamic mapping
     */
    loadSets() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                logger_1.logger.info('Loading Pokemon TCG sets from API...');
                const allSets = yield pokemonApiClient_1.pokemonApiClient.getSets(1000);
                if (allSets.length === 0) {
                    logger_1.logger.error('❌ Pokemon TCG API returned 0 sets! This will cause image loading issues.');
                    throw new Error('Pokemon TCG API returned no sets');
                }
                this.dynamicSetMap.clear();
                for (const set of allSets) {
                    if (!set.id || !set.name) {
                        logger_1.logger.warn(`Skipping invalid set: ${JSON.stringify(set)}`);
                        continue;
                    }
                    // Map by normalized set name (multiple variations)
                    const normalizedName = set.name.toLowerCase().replace(/[^a-z0-9]/g, '');
                    this.dynamicSetMap.set(normalizedName, set.id);
                    // Also map without common words
                    const nameWithoutCommon = normalizedName
                        .replace(/^pokemon/, '')
                        .replace(/pokemon$/, '')
                        .replace(/^tcg/, '')
                        .replace(/tcg$/, '')
                        .replace(/^set/, '')
                        .replace(/set$/, '');
                    if (nameWithoutCommon && nameWithoutCommon !== normalizedName) {
                        this.dynamicSetMap.set(nameWithoutCommon, set.id);
                    }
                    // Map by PTCGO code if available
                    if (set.ptcgoCode) {
                        this.dynamicSetMap.set(set.ptcgoCode.toLowerCase(), set.id);
                        // Also normalize PTCGO code
                        this.dynamicSetMap.set(set.ptcgoCode.toLowerCase().replace(/[^a-z0-9]/g, ''), set.id);
                    }
                    // Map by set ID itself (normalized and as-is)
                    const normalizedId = set.id.toLowerCase();
                    this.dynamicSetMap.set(normalizedId, set.id);
                    this.dynamicSetMap.set(normalizedId.replace(/[^a-z0-9]/g, ''), set.id);
                    // Map by series + name combination
                    if (set.series) {
                        const seriesNormalized = set.series.toLowerCase().replace(/[^a-z0-9]/g, '');
                        const nameNormalized = set.name.toLowerCase().replace(/[^a-z0-9]/g, '');
                        this.dynamicSetMap.set(seriesNormalized + nameNormalized, set.id);
                        this.dynamicSetMap.set(nameNormalized + seriesNormalized, set.id);
                    }
                }
                this.initialized = true;
                this.lastRefresh = Date.now();
                logger_1.logger.info(`✅ Loaded ${allSets.length} sets, created ${this.dynamicSetMap.size} mappings from Pokemon TCG API`);
                // Log first 10 mappings for debugging
                const sampleMappings = Array.from(this.dynamicSetMap.entries()).slice(0, 10);
                logger_1.logger.info(`Sample mappings: ${JSON.stringify(sampleMappings)}`);
            }
            catch (error) {
                logger_1.logger.error('❌ CRITICAL: Failed to load sets from Pokemon TCG API', {
                    error: error.message,
                    stack: error.stack
                });
                // Don't mark as initialized on error - allow retry
                this.initialized = false;
                throw error; // Re-throw to allow caller to handle
            }
        });
    }
    /**
     * Refresh set mappings (called periodically)
     */
    refreshSetMappings() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.loadSets();
            return this.dynamicSetMap;
        });
    }
    /**
     * Normalize a set ID to the correct Pokemon TCG API set code
     * Tries multiple strategies to find the correct mapping
     */
    normalizeSetIdForImageUrl(setId, setName) {
        return __awaiter(this, void 0, void 0, function* () {
            // Ensure service is initialized
            yield this.initialize();
            if (!setId) {
                logger_1.logger.warn('normalizeSetIdForImageUrl called with empty setId');
                return null;
            }
            if (this.dynamicSetMap.size === 0) {
                logger_1.logger.error('❌ dynamicSetMap is empty! Cannot normalize set IDs. Images will not load.');
                return null;
            }
            // Strategy 1: Try normalized setId directly
            const normalizedId = setId.toLowerCase().replace(/[^a-z0-9]/g, '');
            const directMatch = this.dynamicSetMap.get(normalizedId);
            if (directMatch) {
                logger_1.logger.debug(`✅ Direct match for ${setId} -> ${directMatch}`);
                return directMatch;
            }
            // Strategy 2: Try setName if provided
            if (setName) {
                const normalizedName = setName.toLowerCase().replace(/[^a-z0-9]/g, '');
                const nameMatch = this.dynamicSetMap.get(normalizedName);
                if (nameMatch) {
                    logger_1.logger.debug(`✅ Name match for ${setName} -> ${nameMatch}`);
                    return nameMatch;
                }
            }
            // Strategy 3: Try partial matches - check if any key contains the setId or vice versa
            for (const [key, apiSetId] of this.dynamicSetMap.entries()) {
                if (key.length >= 3 && normalizedId.length >= 3) {
                    if (key.includes(normalizedId) || normalizedId.includes(key)) {
                        logger_1.logger.debug(`✅ Partial match for ${setId} (${normalizedId} matches ${key}) -> ${apiSetId}`);
                        return apiSetId;
                    }
                }
            }
            // Strategy 4: Try with common variations (remove common prefixes/suffixes)
            const variations = [
                normalizedId.replace(/^set/, '').replace(/set$/, ''),
                normalizedId.replace(/^pokemon/, '').replace(/pokemon$/, ''),
                normalizedId.replace(/^tcg/, '').replace(/tcg$/, ''),
            ];
            for (const variation of variations) {
                if (variation && variation !== normalizedId) {
                    const match = this.dynamicSetMap.get(variation);
                    if (match) {
                        logger_1.logger.debug(`✅ Variation match for ${setId} -> ${match}`);
                        return match;
                    }
                }
            }
            logger_1.logger.warn(`❌ Could not normalize set ID: "${setId}"${setName ? ` (setName: "${setName}")` : ''}. Tried ${this.dynamicSetMap.size} mappings.`);
            return null;
        });
    }
    /**
     * Get API set code (alias for normalizeSetIdForImageUrl for compatibility)
     */
    getApiSetCode(databaseSetId) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.normalizeSetIdForImageUrl(databaseSetId);
        });
    }
    /**
     * Normalize set ID (alias for compatibility)
     */
    normalizeSetId(input) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.normalizeSetIdForImageUrl(input);
        });
    }
    /**
     * Build deterministic image URLs using normalized set ID
     */
    buildDeterministicImageUrls(setId, cardNumber, setName) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!setId || !cardNumber) {
                if (!setId)
                    logger_1.logger.debug('buildDeterministicImageUrls: missing setId');
                if (!cardNumber)
                    logger_1.logger.debug('buildDeterministicImageUrls: missing cardNumber');
                return null;
            }
            const normalizedSet = yield this.normalizeSetIdForImageUrl(setId, setName || undefined);
            if (!normalizedSet) {
                logger_1.logger.warn(`Could not normalize set ID for image URL: "${setId}"${setName ? ` (setName: "${setName}")` : ''}`);
                return null;
            }
            // Normalize card number: extract first part and remove leading zeros from numeric card numbers
            // Format: https://images.pokemontcg.io/{setId}/{cardNumber}.png
            const baseNumber = cardNumber.split('/')[0].trim();
            if (!baseNumber) {
                logger_1.logger.warn(`Invalid card number format: "${cardNumber}"`);
                return null;
            }
            // Remove leading zeros from purely numeric card numbers
            // Some sets (like ex13) don't use leading zeros, so "026" should become "26"
            // But keep letters/special chars as-is (e.g., "001a" stays "001a")
            let normalizedCardNumber = baseNumber;
            if (/^\d+$/.test(baseNumber)) {
                // Purely numeric - remove leading zeros by converting to int and back
                normalizedCardNumber = parseInt(baseNumber, 10).toString();
            }
            const imageUrl = `https://images.pokemontcg.io/${normalizedSet}/${normalizedCardNumber}.png`;
            logger_1.logger.debug(`Built deterministic image URL: ${imageUrl} (from setId: ${setId}, cardNumber: ${cardNumber} -> normalized: ${normalizedCardNumber})`);
            return {
                small: imageUrl,
                large: imageUrl, // Use same URL for both
            };
        });
    }
    /**
     * Get statistics about the set mappings
     */
    getSetMappingStats() {
        return {
            databaseMappings: 0, // No longer using database
            cachedMappings: this.dynamicSetMap.size,
            lastRefreshed: this.lastRefresh,
            cacheTtl: this.REFRESH_INTERVAL,
        };
    }
    /**
     * Check if service is initialized
     */
    isInitialized() {
        return this.initialized;
    }
    /**
     * Auto-refresh if cache is stale
     */
    ensureFresh() {
        return __awaiter(this, void 0, void 0, function* () {
            const now = Date.now();
            if (now - this.lastRefresh > this.REFRESH_INTERVAL) {
                logger_1.logger.info('Set mappings cache expired, refreshing...');
                yield this.refreshSetMappings();
            }
        });
    }
}
exports.SetCodeService = SetCodeService;
exports.setCodeService = new SetCodeService();
// Auto-refresh every 24 hours
setInterval(() => {
    exports.setCodeService.ensureFresh().catch((error) => {
        logger_1.logger.error('Failed to auto-refresh set mappings', { error: error.message });
    });
}, 24 * 60 * 60 * 1000);
