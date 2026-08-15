"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setCodeService = exports.SetCodeService = void 0;
const pokemonApiClient_1 = require("./pokemonApiClient");
const logger_1 = require("../utils/logger");
const database_1 = require("../db/database");
const resolvePokemonSetId_1 = require("../utils/resolvePokemonSetId");
/**
 * Simple, dynamic set code service using Pokemon TCG API
 * No hard-coded mappings - everything is loaded from the official API
 */
class SetCodeService {
    constructor() {
        this.dynamicSetMap = new Map();
        this.setById = new Map();
        this.catalogSetIds = new Set();
        this.initialized = false;
        this.initializationPromise = null;
        this.lastRefresh = 0;
        this.REFRESH_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours
    }
    /**
     * Initialize by loading all sets from Pokemon TCG API
     */
    async initialize() {
        // Retry when we only have local name→id maps and no API set metadata (images/series).
        if (this.initialized && this.dynamicSetMap.size > 0 && this.setById.size > 0) {
            if (this.catalogSetIds.size === 0) {
                await this.loadCatalogSetIds();
            }
            logger_1.logger.debug('SetCodeService already initialized with ' + this.dynamicSetMap.size + ' mappings');
            return;
        }
        if (this.initializationPromise) {
            logger_1.logger.info('SetCodeService initialization already in progress, waiting...');
            return this.initializationPromise;
        }
        logger_1.logger.info('Starting SetCodeService initialization...');
        this.initializationPromise = this.loadSets();
        try {
            await this.initializationPromise;
        }
        finally {
            this.initializationPromise = null; // Always reset, even on failure
        }
    }
    /**
     * Load all sets from Pokemon TCG API and build dynamic mapping
     */
    async loadSets() {
        try {
            logger_1.logger.info('Loading Pokemon TCG sets from API...');
            const allSets = await pokemonApiClient_1.pokemonApiClient.getSets(1000);
            if (allSets.length === 0) {
                logger_1.logger.error('❌ Pokemon TCG API returned 0 sets! This will cause image loading issues.');
                throw new Error('Pokemon TCG API returned no sets');
            }
            this.dynamicSetMap.clear();
            this.setById.clear();
            allSets.forEach((set) => {
                this.setById.set(set.id, set);
                this.addSetMappings(set);
            });
            await this.loadCatalogSetIds();
            this.initialized = true;
            this.lastRefresh = Date.now();
            logger_1.logger.info(`✅ Loaded ${allSets.length} sets, created ${this.dynamicSetMap.size} mappings from Pokemon TCG API`);
            // Log first 10 mappings for debugging
            const sampleMappings = Array.from(this.dynamicSetMap.entries()).slice(0, 10);
            logger_1.logger.info(`Sample mappings: ${JSON.stringify(sampleMappings)}`);
        }
        catch (error) {
            logger_1.logger.error('❌ Failed to load sets from Pokemon TCG API', {
                error: error.message,
                stack: error.stack
            });
            const localFallbackCount = await this.loadSetsFromLocalCatalog();
            if (localFallbackCount > 0) {
                logger_1.logger.warn(`⚠️ Using local set mapping fallback with ${localFallbackCount} sets; API unavailable.`);
                return;
            }
            // Don't mark as initialized on error - allow retry
            this.initialized = false;
            throw error; // Re-throw to allow caller to handle
        }
    }
    getSetById(setId) {
        if (!setId)
            return undefined;
        return (this.setById.get(setId) ||
            this.setById.get(setId.toLowerCase()) ||
            [...this.setById.values()].find((set) => set.id.toLowerCase() === setId.toLowerCase()));
    }
    getSetByName(setName) {
        if (!setName)
            return undefined;
        const exact = [...this.setById.values()].find((set) => set.name.toLowerCase() === setName.toLowerCase());
        if (exact)
            return exact;
        const mappedId = this.dynamicSetMap.get((0, resolvePokemonSetId_1.foldSetToken)(setName)) ||
            this.dynamicSetMap.get((0, resolvePokemonSetId_1.foldSetTokenCompact)(setName));
        if (mappedId)
            return this.setById.get(mappedId);
        const folded = (0, resolvePokemonSetId_1.foldSetToken)(setName);
        return [...this.setById.values()].find((set) => (0, resolvePokemonSetId_1.foldSetToken)(set.name) === folded);
    }
    resolveApiSet(catalogId, setName) {
        const direct = this.getSetById(catalogId);
        if (direct)
            return direct;
        const apiId = (0, resolvePokemonSetId_1.resolvePokemonApiSetId)(catalogId, setName, [...this.setById.values()]);
        if (apiId)
            return this.getSetById(apiId);
        return setName ? this.getSetByName(setName) : undefined;
    }
    addSetMappings(set) {
        if (!set.id || !set.name) {
            logger_1.logger.warn(`Skipping invalid set: ${JSON.stringify(set)}`);
            return;
        }
        const normalizedName = (0, resolvePokemonSetId_1.foldSetToken)(set.name);
        this.dynamicSetMap.set(normalizedName, set.id);
        const compactName = (0, resolvePokemonSetId_1.foldSetTokenCompact)(set.name);
        if (compactName !== normalizedName) {
            this.dynamicSetMap.set(compactName, set.id);
        }
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
    async loadSetsFromLocalCatalog() {
        const db = (0, database_1.getDb)();
        const localSets = await new Promise((resolve, reject) => {
            db.all(`SELECT DISTINCT setId, setName
         FROM catalog_cards
         WHERE setId IS NOT NULL AND setId <> ''
           AND setName IS NOT NULL AND setName <> ''
         UNION
         SELECT DISTINCT setId, setName
         FROM card_mappings
         WHERE setId IS NOT NULL AND setId <> ''
           AND setName IS NOT NULL AND setName <> ''`, [], (err, rows) => {
                if (err)
                    reject(err);
                else
                    resolve((rows || []));
            });
        }).catch((err) => {
            logger_1.logger.error('Failed to load local set mappings', { error: err.message });
            return [];
        });
        if (localSets.length === 0) {
            return 0;
        }
        this.dynamicSetMap.clear();
        localSets.forEach((entry) => {
            const images = {
                logo: `https://images.pokemontcg.io/${entry.setId}/logo.png`,
                symbol: `https://images.pokemontcg.io/${entry.setId}/symbol.png`,
            };
            const stub = {
                id: entry.setId,
                name: entry.setName,
                images,
            };
            this.setById.set(entry.setId, stub);
            this.addSetMappings(stub);
        });
        this.initialized = true;
        this.lastRefresh = Date.now();
        await this.loadCatalogSetIds();
        return localSets.length;
    }
    async loadCatalogSetIds() {
        const db = (0, database_1.getDb)();
        const rows = await new Promise((resolve, reject) => {
            db.all(`SELECT DISTINCT setId FROM catalog_cards WHERE setId IS NOT NULL AND TRIM(setId) <> ''`, [], (err, result) => {
                if (err)
                    reject(err);
                else
                    resolve((result || []));
            });
        }).catch((err) => {
            logger_1.logger.debug('Could not load catalog set IDs', { error: err.message });
            return [];
        });
        this.catalogSetIds = new Set(rows.map((row) => row.setId));
    }
    /**
     * Refresh set mappings (called periodically)
     */
    async refreshSetMappings() {
        await this.loadSets();
        return this.dynamicSetMap;
    }
    /**
     * Normalize a set ID to a Pokemon TCG API set code, or a native catalog set id
     * (Japanese TCGdex codes). Uses exact / suffix / era rules — not substrings.
     */
    async normalizeSetIdForImageUrl(setId, setName) {
        await this.initialize();
        if (!setId) {
            logger_1.logger.debug('normalizeSetIdForImageUrl called with empty setId');
            return null;
        }
        if (this.setById.size === 0 && this.catalogSetIds.size === 0) {
            logger_1.logger.error('❌ No set metadata loaded. Cannot normalize set IDs.');
            return null;
        }
        const resolved = (0, resolvePokemonSetId_1.resolveCatalogSetId)(setId, setName, [...this.setById.values()], this.catalogSetIds);
        if (resolved) {
            logger_1.logger.debug(`✅ Normalized ${setId} -> ${resolved}`);
            return resolved;
        }
        logger_1.logger.debug(`No catalog/API set mapping for "${setId}"${setName ? ` (${setName})` : ''}`);
        return null;
    }
    /**
     * Get API set code (alias for normalizeSetIdForImageUrl for compatibility)
     */
    async getApiSetCode(databaseSetId) {
        return this.normalizeSetIdForImageUrl(databaseSetId);
    }
    /**
     * Normalize set ID (alias for compatibility)
     */
    async normalizeSetId(input) {
        return this.normalizeSetIdForImageUrl(input);
    }
    /**
     * Build deterministic image URLs using normalized set ID
     */
    async buildDeterministicImageUrls(setId, cardNumber, setName) {
        if (!setId || !cardNumber) {
            if (!setId)
                logger_1.logger.debug('buildDeterministicImageUrls: missing setId');
            if (!cardNumber)
                logger_1.logger.debug('buildDeterministicImageUrls: missing cardNumber');
            return null;
        }
        const normalizedSet = await this.normalizeSetIdForImageUrl(setId, setName || undefined);
        if (!normalizedSet || !this.getSetById(normalizedSet)) {
            logger_1.logger.debug(`Could not build pokemontcg.io URL for set "${setId}"${setName ? ` (${setName})` : ''}`);
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
    async ensureFresh() {
        const now = Date.now();
        if (now - this.lastRefresh > this.REFRESH_INTERVAL) {
            logger_1.logger.info('Set mappings cache expired, refreshing...');
            await this.refreshSetMappings();
        }
    }
}
exports.SetCodeService = SetCodeService;
exports.setCodeService = new SetCodeService();
