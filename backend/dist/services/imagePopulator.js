"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
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
exports.imagePopulatorService = void 0;
const database_1 = require("../db/database");
const logger_1 = require("../utils/logger");
const cardImageBackfillService_1 = require("./cardImageBackfillService");
/**
 * Image Populator Service
 *
 * This service fetches card images from the Pokemon TCG API and stores them
 * in the database for cards that don't have images yet.
 *
 * Usage:
 *   - Run manually: npm run populate-images
 *   - Or import and call: await populateCardImages()
 */
class ImagePopulatorService {
    constructor() {
        this.apiKey = process.env.POKEMON_TCG_API_KEY || '';
        this.baseUrl = 'https://api.pokemontcg.io/v2/cards';
        this.rateLimit = 50; // ms between requests (reduced from 100)
        this.maxRetries = 1; // Reduced from 3 - fail fast!
    }
    /**
     * Main function to populate all missing images
     */
    populateAllMissingImages() {
        return __awaiter(this, void 0, void 0, function* () {
            logger_1.logger.info('🎨 Starting image population process...');
            try {
                const cardsWithoutImages = yield this.getCardsWithoutImages();
                logger_1.logger.info(`📊 Found ${cardsWithoutImages.length} cards without images`);
                if (cardsWithoutImages.length === 0) {
                    logger_1.logger.info('✅ All cards already have images!');
                    return;
                }
                let successCount = 0;
                let failCount = 0;
                let skippedCount = 0;
                // Process in batches to avoid overwhelming the API
                const batchSize = 100;
                for (let i = 0; i < cardsWithoutImages.length; i += batchSize) {
                    const batch = cardsWithoutImages.slice(i, i + batchSize);
                    logger_1.logger.info(`\n📦 Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(cardsWithoutImages.length / batchSize)}`);
                    for (const card of batch) {
                        try {
                            const result = yield this.fetchAndStoreImage(card);
                            if (result === 'success') {
                                successCount++;
                                logger_1.logger.info(`✅ [${successCount + failCount + skippedCount}/${cardsWithoutImages.length}] ${card.cardName} (#${card.cardNumber})`);
                            }
                            else if (result === 'skipped') {
                                skippedCount++;
                                // Don't log every skip - too verbose
                                if (skippedCount % 50 === 0) {
                                    logger_1.logger.info(`⏭️  Skipped ${skippedCount} cards so far...`);
                                }
                            }
                            // Minimal rate limiting
                            yield this.sleep(this.rateLimit);
                        }
                        catch (error) {
                            failCount++;
                            // Only log first 10 failures
                            if (failCount <= 10) {
                                logger_1.logger.warn(`❌ [${successCount + failCount + skippedCount}/${cardsWithoutImages.length}] Failed: ${card.cardName} - ${error.message}`);
                            }
                        }
                    }
                    // Shorter pause between batches
                    if (i + batchSize < cardsWithoutImages.length) {
                        logger_1.logger.info(`⏸️  Progress: ${successCount} success, ${skippedCount} skipped, ${failCount} failed`);
                        yield this.sleep(2000);
                    }
                }
                logger_1.logger.info(`\n✨ Image population complete!`);
                logger_1.logger.info(`   ✅ Success: ${successCount}`);
                logger_1.logger.info(`   ⏭️  Skipped: ${skippedCount} (not in Pokemon API)`);
                logger_1.logger.info(`   ❌ Failed: ${failCount}`);
            }
            catch (error) {
                logger_1.logger.error('Error in image population process', { error });
                throw error;
            }
        });
    }
    /**
     * Fetch images for a single card and store in database
     */
    fetchAndStoreImage(card) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            try {
                const catalogImages = yield (0, cardImageBackfillService_1.copyCatalogImagesToMapping)(card.cardName, card.setId, card.setName, card.cardNumber);
                if ((catalogImages === null || catalogImages === void 0 ? void 0 : catalogImages.imageSmall) || (catalogImages === null || catalogImages === void 0 ? void 0 : catalogImages.imageLarge)) {
                    yield this.storeCardImages(card.id, catalogImages.imageSmall || catalogImages.imageLarge || '', catalogImages.imageLarge || catalogImages.imageSmall || '', 'catalog_match');
                    return 'success';
                }
                const apiCard = yield this.searchPokemonApi(card);
                if (!apiCard || !((_a = apiCard.images) === null || _a === void 0 ? void 0 : _a.large) || !((_b = apiCard.images) === null || _b === void 0 ? void 0 : _b.small)) {
                    // Card not found in API - this is common for promo cards
                    return 'skipped';
                }
                // Store images in database
                yield this.storeCardImages(card.id, apiCard.images.small, apiCard.images.large, 'pokemon_api');
                return 'success';
            }
            catch (error) {
                logger_1.logger.debug(`Search failed for ${card.cardName}`, { error });
                return 'skipped';
            }
        });
    }
    /**
     * Search Pokemon API for a card using FAST strategies only
     */
    searchPokemonApi(card) {
        return __awaiter(this, void 0, void 0, function* () {
            const headers = {
                'Accept': 'application/json',
            };
            if (this.apiKey) {
                headers['X-Api-Key'] = this.apiKey;
            }
            if (card.cardNumber) {
                try {
                    const url = new URL(this.baseUrl);
                    const cardNumberBase = card.cardNumber.split('/')[0].trim();
                    // Search by name, number, and set ID to avoid cross-set matches
                    let query = `name:"${card.cardName}" number:${cardNumberBase}`;
                    if (card.setId) {
                        query += ` set.id:${card.setId}`;
                    }
                    url.searchParams.append('q', query);
                    url.searchParams.append('pageSize', '5');
                    const result = yield this.fetchWithRetry(url.toString(), headers);
                    if (result && result.length > 0) {
                        return this.findBestMatch(result, card);
                    }
                }
                catch (error) {
                    // Fail fast - don't log debug
                    return null;
                }
            }
            // Fallback: try without set ID (in case DB set ID format differs)
            if (!card.cardNumber) {
                try {
                    const url = new URL(this.baseUrl);
                    let query = `name:"${card.cardName}"`;
                    if (card.setId) {
                        query += ` set.id:${card.setId}`;
                    }
                    url.searchParams.append('q', query);
                    url.searchParams.append('pageSize', '5');
                    const result = yield this.fetchWithRetry(url.toString(), headers);
                    if (result && result.length > 0) {
                        return this.findBestMatch(result, card);
                    }
                }
                catch (error) {
                    return null;
                }
            }
            return null;
        });
    }
    /**
     * Find the best matching card from API results
     */
    findBestMatch(apiCards, card) {
        // Exact name match
        let exactMatches = apiCards.filter((c) => c.name.toLowerCase() === card.cardName.toLowerCase());
        if (exactMatches.length === 0) {
            // Fuzzy match
            exactMatches = apiCards.filter((c) => c.name.toLowerCase().includes(card.cardName.toLowerCase()));
        }
        if (exactMatches.length === 0) {
            return null;
        }
        // If we have a card number, try to match it
        if (card.cardNumber) {
            const normalizedRequestNumber = this.normalizeCardNumber(card.cardNumber);
            const numberMatch = exactMatches.find((c) => this.normalizeCardNumber(c.number) === normalizedRequestNumber);
            if (numberMatch) {
                return numberMatch;
            }
        }
        // Return first exact match
        return exactMatches[0];
    }
    /**
     * Normalize card number for comparison
     */
    normalizeCardNumber(num) {
        if (!num)
            return '';
        const beforeSlash = num.split('/')[0].trim();
        return beforeSlash.toLowerCase().replace(/^0+/, '').replace(/[^a-z0-9]/g, '');
    }
    /**
     * Fetch from API with FAST retry logic
     */
    fetchWithRetry(url, headers) {
        return __awaiter(this, void 0, void 0, function* () {
            let lastError = null;
            for (let attempt = 0; attempt < this.maxRetries; attempt++) {
                try {
                    const controller = new AbortController();
                    const timeout = setTimeout(() => controller.abort(), 3000); // 3 second timeout (reduced from 15!)
                    const response = yield fetch(url, {
                        headers,
                        signal: controller.signal,
                    });
                    clearTimeout(timeout);
                    if (!response.ok) {
                        if (response.status === 429) {
                            // Rate limited - wait briefly
                            yield this.sleep(1000);
                            continue;
                        }
                        throw new Error(`API request failed: ${response.status}`);
                    }
                    const json = yield response.json();
                    return json.data || [];
                }
                catch (error) {
                    lastError = error;
                    if (attempt < this.maxRetries - 1) {
                        yield this.sleep(500); // Short retry delay
                    }
                }
            }
            throw lastError || new Error('Unknown fetch error');
        });
    }
    /**
     * Get all cards that don't have images
     */
    getCardsWithoutImages() {
        return __awaiter(this, void 0, void 0, function* () {
            const db = (0, database_1.getDb)();
            // First check if image columns exist
            const hasImageColumns = yield new Promise((resolve) => {
                db.all("PRAGMA table_info(card_mappings)", [], (err, rows) => {
                    if (err || !rows) {
                        resolve(false);
                    }
                    else {
                        const hasImages = rows.some((r) => r.name === 'imageSmall');
                        resolve(hasImages);
                    }
                });
            });
            if (!hasImageColumns) {
                logger_1.logger.error('Image columns do not exist in card_mappings table. Migration may have failed.');
                return [];
            }
            return new Promise((resolve, reject) => {
                // EXCLUDE fake "sets" that are actually TCGPlayer product categories
                // These will NEVER have images in the Pokemon API - don't waste time!
                const sql = `
        SELECT 
          id,
          cardId,
          cardName,
          setId,
          setName,
          cardNumber,
          uniqueIdentifier,
          imageSmall,
          imageLarge
        FROM card_mappings
        WHERE (imageSmall IS NULL OR imageLarge IS NULL)
          AND cardName IS NOT NULL 
          AND TRIM(cardName) <> ''
          AND cardNumber IS NOT NULL
          AND cardNumber NOT LIKE '%Bundle%'
          AND cardNumber NOT LIKE '%Case%'
          AND cardNumber NOT LIKE '%Display%'
          AND cardNumber NOT LIKE '%Collection%'
          AND cardNumber NOT LIKE '%Binder%'
          AND cardNumber NOT LIKE '%Box%'
          AND cardName NOT LIKE '%Bundle%'
          AND cardName NOT LIKE '%Case%'
          AND cardName NOT LIKE '%Display%'
          AND cardName NOT LIKE '%Collection%'
          AND cardName NOT LIKE '%Binder%'
          AND cardName NOT LIKE '%Booster Box%'
          AND cardName NOT LIKE '%Elite Trainer%'
          AND setName NOT IN (
            'World Championship Decks',
            'Miscellaneous Cards & Products',
            'Prize Pack Series Cards',
            'Deck Exclusives',
            'League & Championship Cards',
            'Jumbo Cards',
            'Blister Exclusives',
            'Burger King Promos',
            'Countdown Calendar Promos',
            'Professor Program Promos',
            'Best of Promos',
            'Pikachu World Collection Promos',
            'ME01: Mega Evolution',
            'ME: Mega Evolution Promo',
            'MEE: Mega Evolution Energies',
            'SVE: Scarlet & Violet Energies'
          )
          AND setName NOT LIKE 'McDonald%'
        ORDER BY cardName ASC
        LIMIT 1000
      `;
                db.all(sql, [], (err, rows) => {
                    if (err) {
                        logger_1.logger.error('SQL Error in getCardsWithoutImages', { error: err, sql });
                        reject(err);
                    }
                    else {
                        resolve(rows);
                    }
                });
            });
        });
    }
    /**
     * Store card images in database
     */
    storeCardImages(cardId, imageSmall, imageLarge, source) {
        return __awaiter(this, void 0, void 0, function* () {
            const db = (0, database_1.getDb)();
            return new Promise((resolve, reject) => {
                const sql = `
        UPDATE card_mappings
        SET 
          imageSmall = ?,
          imageLarge = ?,
          imageSource = ?,
          imageLastUpdated = datetime('now')
        WHERE id = ?
      `;
                db.run(sql, [imageSmall, imageLarge, source, cardId], (err) => {
                    if (err) {
                        reject(err);
                    }
                    else {
                        resolve();
                    }
                });
            });
        });
    }
    /**
     * Manually add images for a specific card (useful for promo cards)
     */
    manuallyAddImages(uniqueIdentifier_1, imageSmall_1, imageLarge_1) {
        return __awaiter(this, arguments, void 0, function* (uniqueIdentifier, imageSmall, imageLarge, source = 'manual') {
            const db = (0, database_1.getDb)();
            return new Promise((resolve, reject) => {
                const sql = `
        UPDATE card_mappings
        SET 
          imageSmall = ?,
          imageLarge = ?,
          imageSource = ?,
          imageLastUpdated = datetime('now')
        WHERE uniqueIdentifier = ?
      `;
                db.run(sql, [imageSmall, imageLarge, source, uniqueIdentifier], (err) => {
                    if (err) {
                        logger_1.logger.error(`Failed to manually add images for ${uniqueIdentifier}`, { error: err });
                        reject(err);
                    }
                    else {
                        logger_1.logger.info(`✅ Manually added images for ${uniqueIdentifier}`);
                        resolve();
                    }
                });
            });
        });
    }
    /**
     * Get statistics about images in the database
     */
    getImageStats() {
        return __awaiter(this, void 0, void 0, function* () {
            const db = (0, database_1.getDb)();
            // First check if image columns exist
            const hasImageColumns = yield new Promise((resolve) => {
                db.all("PRAGMA table_info(card_mappings)", [], (err, rows) => {
                    if (err || !rows) {
                        resolve(false);
                    }
                    else {
                        const hasImages = rows.some((r) => r.name === 'imageSmall');
                        resolve(hasImages);
                    }
                });
            });
            if (!hasImageColumns) {
                logger_1.logger.warn('Image columns do not exist yet. Returning empty stats.');
                return {
                    total: 0,
                    withImages: 0,
                    withoutImages: 0,
                    percentage: 0,
                };
            }
            return new Promise((resolve, reject) => {
                // Only count REAL cards from real Pokemon TCG sets (exclude fake sets)
                const sql = `
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN imageSmall IS NOT NULL AND imageLarge IS NOT NULL THEN 1 ELSE 0 END) as withImages,
          SUM(CASE WHEN imageSmall IS NULL OR imageLarge IS NULL THEN 1 ELSE 0 END) as withoutImages
        FROM card_mappings
        WHERE cardName IS NOT NULL AND TRIM(cardName) <> ''
          AND setName NOT IN (
            'World Championship Decks',
            'Miscellaneous Cards & Products',
            'Prize Pack Series Cards',
            'Deck Exclusives',
            'League & Championship Cards',
            'Jumbo Cards',
            'Blister Exclusives',
            'Burger King Promos',
            'Countdown Calendar Promos',
            'Professor Program Promos',
            'Best of Promos',
            'Pikachu World Collection Promos',
            'ME01: Mega Evolution',
            'ME: Mega Evolution Promo',
            'MEE: Mega Evolution Energies',
            'SVE: Scarlet & Violet Energies'
          )
          AND setName NOT LIKE 'McDonald%'
      `;
                db.get(sql, [], (err, row) => {
                    if (err) {
                        logger_1.logger.error('SQL Error in getImageStats', { error: err, sql });
                        reject(err);
                    }
                    else {
                        const total = row.total || 0;
                        const withImages = row.withImages || 0;
                        const withoutImages = row.withoutImages || 0;
                        const percentage = total > 0 ? (withImages / total) * 100 : 0;
                        resolve({
                            total,
                            withImages,
                            withoutImages,
                            percentage,
                        });
                    }
                });
            });
        });
    }
    sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
}
// Export singleton instance
exports.imagePopulatorService = new ImagePopulatorService();
// CLI script to run manually
if (require.main === module) {
    (() => __awaiter(void 0, void 0, void 0, function* () {
        try {
            // Initialize database and run migrations first
            const { initializeDatabase } = yield Promise.resolve().then(() => __importStar(require('../db/database')));
            const { runMigrations } = yield Promise.resolve().then(() => __importStar(require('../db/migrations')));
            logger_1.logger.info('🔧 Initializing database...');
            initializeDatabase();
            // Wait for database initialization to complete
            yield new Promise(resolve => setTimeout(resolve, 1000));
            const db = (0, database_1.getDb)();
            logger_1.logger.info('🔧 Running migrations...');
            yield runMigrations(db);
            // Wait for migrations to complete
            yield new Promise(resolve => setTimeout(resolve, 500));
            logger_1.logger.info('✅ Database ready!\n');
            // First show stats
            const stats = yield exports.imagePopulatorService.getImageStats();
            logger_1.logger.info('📊 Current Image Statistics:');
            logger_1.logger.info(`   Total cards: ${stats.total}`);
            logger_1.logger.info(`   With images: ${stats.withImages} (${stats.percentage.toFixed(1)}%)`);
            logger_1.logger.info(`   Without images: ${stats.withoutImages}`);
            logger_1.logger.info('');
            if (stats.withoutImages === 0) {
                logger_1.logger.info('✅ All cards already have images!');
                process.exit(0);
            }
            // Run population
            yield exports.imagePopulatorService.populateAllMissingImages();
            // Show final stats
            const finalStats = yield exports.imagePopulatorService.getImageStats();
            logger_1.logger.info('\n📊 Final Image Statistics:');
            logger_1.logger.info(`   Total cards: ${finalStats.total}`);
            logger_1.logger.info(`   With images: ${finalStats.withImages} (${finalStats.percentage.toFixed(1)}%)`);
            logger_1.logger.info(`   Without images: ${finalStats.withoutImages}`);
            process.exit(0);
        }
        catch (error) {
            logger_1.logger.error('Fatal error in image population', { error });
            process.exit(1);
        }
    }))();
}
