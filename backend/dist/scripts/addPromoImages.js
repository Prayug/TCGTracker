"use strict";
/**
 * Script to manually add images for promo cards not in Pokemon TCG API
 *
 * This script provides image URLs for common promo sets that aren't available
 * in the Pokemon TCG API (like McDonald's promos, GameStop promos, etc.)
 *
 * Usage:
 *   npm run add-promo-images
 *
 * To add more images:
 *   1. Find the card on a site like TCGPlayer, Bulbapedia, or PokemonDB
 *   2. Get the image URL (or host it yourself)
 *   3. Add an entry to the PROMO_IMAGE_MAPPINGS below
 */
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
exports.applyPromoImages = applyPromoImages;
exports.showCardsNeedingImages = showCardsNeedingImages;
const database_1 = require("../db/database");
const logger_1 = require("../utils/logger");
/**
 * IMAGE MAPPINGS FOR PROMO CARDS
 *
 * Add your custom image URLs here for cards not in the Pokemon API.
 *
 * IMPORTANT: These are example URLs - you'll need to replace them with real ones!
 *
 * Good sources for images:
 * - TCGPlayer: https://www.tcgplayer.com
 * - Bulbapedia: https://bulbapedia.bulbagarden.net
 * - PokemonDB: https://pokemondb.net
 * - PriceCharting: https://www.pricecharting.com
 * - Or host your own in /public/assets/cards/
 */
const PROMO_IMAGE_MAPPINGS = [
    // McDonald's 2014 Promos - EXAMPLE ENTRIES
    // You need to find and add the actual image URLs
    {
        setId: 'mcdonaldspromos2014',
        cardNumber: '5/12',
        cardName: 'Pikachu',
        imageSmall: 'https://example.com/mcdonalds-2014-pikachu-small.png', // REPLACE WITH REAL URL
        imageLarge: 'https://example.com/mcdonalds-2014-pikachu-large.png', // REPLACE WITH REAL URL
        source: 'manual_mcdonalds_2014'
    },
    {
        setId: 'mcdonaldspromos2014',
        cardNumber: '1/12',
        cardName: 'Chespin',
        imageSmall: 'https://example.com/mcdonalds-2014-chespin-small.png', // REPLACE WITH REAL URL
        imageLarge: 'https://example.com/mcdonalds-2014-chespin-large.png', // REPLACE WITH REAL URL
        source: 'manual_mcdonalds_2014'
    },
    // Add more McDonald's 2014 cards here...
    // McDonald's 2015 Promos
    // {
    //   setId: 'mcdonaldspromos2015',
    //   cardNumber: '1/12',
    //   cardName: 'Pikachu',
    //   imageSmall: 'https://example.com/url-to-small-image.png',
    //   imageLarge: 'https://example.com/url-to-large-image.png',
    //   source: 'manual_mcdonalds_2015'
    // },
    // GameStop Promos
    // {
    //   setId: 'gamestoppromos',
    //   cardNumber: '1',
    //   cardName: 'Example Card',
    //   imageSmall: 'https://example.com/gamestop-card-small.png',
    //   imageLarge: 'https://example.com/gamestop-card-large.png',
    //   source: 'manual_gamestop'
    // },
];
/**
 * ALTERNATIVE: Use locally hosted images
 *
 * If you want to host images yourself:
 * 1. Create folder: /public/assets/cards/mcdonalds2014/
 * 2. Add image files: 1.png, 2.png, etc.
 * 3. Use URLs like: /assets/cards/mcdonalds2014/5.png
 *
 * Then update the mappings above to use relative URLs:
 *   imageSmall: '/assets/cards/mcdonalds2014/5.png',
 *   imageLarge: '/assets/cards/mcdonalds2014/5_hires.png',
 */
/**
 * Apply image mappings to the database
 */
function applyPromoImages() {
    return __awaiter(this, void 0, void 0, function* () {
        const db = (0, database_1.getDb)();
        let successCount = 0;
        let failCount = 0;
        let notFoundCount = 0;
        logger_1.logger.info('🎨 Starting to apply promo image mappings...');
        logger_1.logger.info(`📦 Found ${PROMO_IMAGE_MAPPINGS.length} image mappings`);
        for (const mapping of PROMO_IMAGE_MAPPINGS) {
            try {
                // Check if this is an example URL that needs to be replaced
                if (mapping.imageSmall.includes('example.com')) {
                    logger_1.logger.warn(`⚠️  Skipping ${mapping.cardName} - EXAMPLE URL (replace with real URL)`);
                    notFoundCount++;
                    continue;
                }
                // Find the card in the database
                const card = yield new Promise((resolve, reject) => {
                    db.get(`SELECT id, cardName, setId, cardNumber, uniqueIdentifier
           FROM card_mappings
           WHERE setId = ? AND cardNumber = ? AND cardName = ?
           LIMIT 1`, [mapping.setId, mapping.cardNumber, mapping.cardName], (err, row) => {
                        if (err)
                            reject(err);
                        else
                            resolve(row);
                    });
                });
                if (!card) {
                    logger_1.logger.warn(`⚠️  Card not found in DB: ${mapping.cardName} (${mapping.setId} #${mapping.cardNumber})`);
                    notFoundCount++;
                    continue;
                }
                // Update the card with images
                yield new Promise((resolve, reject) => {
                    db.run(`UPDATE card_mappings
           SET imageSmall = ?, imageLarge = ?, imageSource = ?, imageLastUpdated = datetime('now')
           WHERE id = ?`, [mapping.imageSmall, mapping.imageLarge, mapping.source, card.id], (err) => {
                        if (err)
                            reject(err);
                        else
                            resolve();
                    });
                });
                logger_1.logger.info(`✅ Added images for: ${mapping.cardName} (#${mapping.cardNumber})`);
                successCount++;
            }
            catch (error) {
                logger_1.logger.error(`❌ Failed to add images for ${mapping.cardName}`, { error });
                failCount++;
            }
        }
        logger_1.logger.info('\n✨ Promo image update complete!');
        logger_1.logger.info(`   ✅ Success: ${successCount}`);
        logger_1.logger.info(`   ⚠️  Not found: ${notFoundCount}`);
        logger_1.logger.info(`   ❌ Failed: ${failCount}`);
    });
}
/**
 * Show all cards from a specific set that need images
 */
function showCardsNeedingImages(setId) {
    return __awaiter(this, void 0, void 0, function* () {
        const db = (0, database_1.getDb)();
        logger_1.logger.info(`\n🔍 Cards from set "${setId}" that need images:\n`);
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
            logger_1.logger.error('❌ Image columns do not exist in card_mappings table.');
            logger_1.logger.error('Migration #5 may have failed. Check database schema.');
            return;
        }
        const cards = yield new Promise((resolve, reject) => {
            db.all(`SELECT cardName, cardNumber, setName, uniqueIdentifier
       FROM card_mappings
       WHERE setId = ? AND (imageSmall IS NULL OR imageLarge IS NULL)
       ORDER BY cardNumber ASC`, [setId], (err, rows) => {
                if (err) {
                    logger_1.logger.error('SQL Error in showCardsNeedingImages', { error: err });
                    reject(err);
                }
                else {
                    resolve(rows || []);
                }
            });
        });
        if (cards.length === 0) {
            logger_1.logger.info('✅ All cards in this set have images (or set not found)!');
            return;
        }
        cards.forEach((card, index) => {
            logger_1.logger.info(`${index + 1}. ${card.cardName} (#${card.cardNumber})`);
            logger_1.logger.info(`   Set: ${card.setName}`);
            logger_1.logger.info(`   ID: ${card.uniqueIdentifier}\n`);
        });
        logger_1.logger.info(`Total: ${cards.length} cards need images`);
    });
}
/**
 * Helper: Fetch image from TCGPlayer API (if you have an API key)
 *
 * This is an advanced option - you'd need a TCGPlayer seller account
 * and API access. Most users will use manual image URLs instead.
 */
function fetchFromTCGPlayer(productId) {
    return __awaiter(this, void 0, void 0, function* () {
        // Placeholder for TCGPlayer API integration
        // You would implement this if you have TCGPlayer API access
        logger_1.logger.warn('TCGPlayer API integration not yet implemented');
        return null;
    });
}
// CLI interface
if (require.main === module) {
    const args = process.argv.slice(2);
    const command = args[0];
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
            if (command === 'apply') {
                yield applyPromoImages();
            }
            else if (command === 'list') {
                const setId = args[1];
                if (!setId) {
                    logger_1.logger.error('Usage: npm run add-promo-images list <setId>');
                    logger_1.logger.error('Example: npm run add-promo-images list mcdonaldspromos2014');
                    process.exit(1);
                }
                yield showCardsNeedingImages(setId);
            }
            else {
                logger_1.logger.info('🎴 Promo Image Management Tool\n');
                logger_1.logger.info('Commands:');
                logger_1.logger.info('  apply  - Apply image mappings from this script to database');
                logger_1.logger.info('  list   - List cards in a set that need images\n');
                logger_1.logger.info('Usage:');
                logger_1.logger.info('  npm run add-promo-images apply');
                logger_1.logger.info('  npm run add-promo-images list mcdonaldspromos2014\n');
                logger_1.logger.info('Before running "apply", edit this file to add real image URLs!');
            }
            process.exit(0);
        }
        catch (error) {
            logger_1.logger.error('Fatal error', { error });
            process.exit(1);
        }
    }))();
}
