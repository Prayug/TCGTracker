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

import { getDb } from '../db/database';
import { logger } from '../utils/logger';

interface PromoImageMapping {
  setId: string;
  cardNumber: string;
  cardName: string;
  imageSmall: string;
  imageLarge: string;
  source: string; // Where the image came from
}

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
const PROMO_IMAGE_MAPPINGS: PromoImageMapping[] = [
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
async function applyPromoImages(): Promise<void> {
  const db = getDb();
  let successCount = 0;
  let failCount = 0;
  let notFoundCount = 0;

  logger.info('🎨 Starting to apply promo image mappings...');
  logger.info(`📦 Found ${PROMO_IMAGE_MAPPINGS.length} image mappings`);

  for (const mapping of PROMO_IMAGE_MAPPINGS) {
    try {
      // Check if this is an example URL that needs to be replaced
      if (mapping.imageSmall.includes('example.com')) {
        logger.warn(`⚠️  Skipping ${mapping.cardName} - EXAMPLE URL (replace with real URL)`);
        notFoundCount++;
        continue;
      }

      // Find the card in the database
      const card: any = await new Promise((resolve, reject) => {
        db.get(
          `SELECT id, cardName, setId, cardNumber, uniqueIdentifier
           FROM card_mappings
           WHERE setId = ? AND cardNumber = ? AND cardName = ?
           LIMIT 1`,
          [mapping.setId, mapping.cardNumber, mapping.cardName],
          (err, row) => {
            if (err) reject(err);
            else resolve(row);
          }
        );
      });

      if (!card) {
        logger.warn(`⚠️  Card not found in DB: ${mapping.cardName} (${mapping.setId} #${mapping.cardNumber})`);
        notFoundCount++;
        continue;
      }

      // Update the card with images
      await new Promise<void>((resolve, reject) => {
        db.run(
          `UPDATE card_mappings
           SET imageSmall = ?, imageLarge = ?, imageSource = ?, imageLastUpdated = datetime('now')
           WHERE id = ?`,
          [mapping.imageSmall, mapping.imageLarge, mapping.source, card.id],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      logger.info(`✅ Added images for: ${mapping.cardName} (#${mapping.cardNumber})`);
      successCount++;
    } catch (error) {
      logger.error(`❌ Failed to add images for ${mapping.cardName}`, { error });
      failCount++;
    }
  }

  logger.info('\n✨ Promo image update complete!');
  logger.info(`   ✅ Success: ${successCount}`);
  logger.info(`   ⚠️  Not found: ${notFoundCount}`);
  logger.info(`   ❌ Failed: ${failCount}`);
}

/**
 * Show all cards from a specific set that need images
 */
async function showCardsNeedingImages(setId: string): Promise<void> {
  const db = getDb();

  logger.info(`\n🔍 Cards from set "${setId}" that need images:\n`);

  // First check if image columns exist
  const hasImageColumns = await new Promise<boolean>((resolve) => {
    db.all("PRAGMA table_info(card_mappings)", [], (err, rows: any[]) => {
      if (err || !rows) {
        resolve(false);
      } else {
        const hasImages = rows.some((r: any) => r.name === 'imageSmall');
        resolve(hasImages);
      }
    });
  });

  if (!hasImageColumns) {
    logger.error('❌ Image columns do not exist in card_mappings table.');
    logger.error('Migration #5 may have failed. Check database schema.');
    return;
  }

  const cards: any[] = await new Promise((resolve, reject) => {
    db.all(
      `SELECT cardName, cardNumber, setName, uniqueIdentifier
       FROM card_mappings
       WHERE setId = ? AND (imageSmall IS NULL OR imageLarge IS NULL)
       ORDER BY cardNumber ASC`,
      [setId],
      (err, rows) => {
        if (err) {
          logger.error('SQL Error in showCardsNeedingImages', { error: err });
          reject(err);
        } else {
          resolve(rows || []);
        }
      }
    );
  });

  if (cards.length === 0) {
    logger.info('✅ All cards in this set have images (or set not found)!');
    return;
  }

  cards.forEach((card, index) => {
    logger.info(`${index + 1}. ${card.cardName} (#${card.cardNumber})`);
    logger.info(`   Set: ${card.setName}`);
    logger.info(`   ID: ${card.uniqueIdentifier}\n`);
  });

  logger.info(`Total: ${cards.length} cards need images`);
}

/**
 * Helper: Fetch image from TCGPlayer API (if you have an API key)
 * 
 * This is an advanced option - you'd need a TCGPlayer seller account
 * and API access. Most users will use manual image URLs instead.
 */
async function fetchFromTCGPlayer(productId: string): Promise<{ small: string; large: string } | null> {
  // Placeholder for TCGPlayer API integration
  // You would implement this if you have TCGPlayer API access
  logger.warn('TCGPlayer API integration not yet implemented');
  return null;
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  (async () => {
    try {
      // Initialize database and run migrations first
      const { initializeDatabase } = await import('../db/database');
      const { runMigrations } = await import('../db/migrations');
      
      logger.info('🔧 Initializing database...');
      initializeDatabase();
      
      // Wait for database initialization to complete
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const db = getDb();
      
      logger.info('🔧 Running migrations...');
      await runMigrations(db);
      
      // Wait for migrations to complete
      await new Promise(resolve => setTimeout(resolve, 500));
      
      logger.info('✅ Database ready!\n');
      
      if (command === 'apply') {
        await applyPromoImages();
      } else if (command === 'list') {
        const setId = args[1];
        if (!setId) {
          logger.error('Usage: npm run add-promo-images list <setId>');
          logger.error('Example: npm run add-promo-images list mcdonaldspromos2014');
          process.exit(1);
        }
        await showCardsNeedingImages(setId);
      } else {
        logger.info('🎴 Promo Image Management Tool\n');
        logger.info('Commands:');
        logger.info('  apply  - Apply image mappings from this script to database');
        logger.info('  list   - List cards in a set that need images\n');
        logger.info('Usage:');
        logger.info('  npm run add-promo-images apply');
        logger.info('  npm run add-promo-images list mcdonaldspromos2014\n');
        logger.info('Before running "apply", edit this file to add real image URLs!');
      }

      process.exit(0);
    } catch (error) {
      logger.error('Fatal error', { error });
      process.exit(1);
    }
  })();
}

export { applyPromoImages, showCardsNeedingImages };

