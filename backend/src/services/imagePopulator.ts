import { getDb } from '../db/database';
import { logger } from '../utils/logger';
import { copyCatalogImagesToMapping } from './cardImageBackfillService';

interface CardRow {
  id: number;
  cardId: string;
  cardName: string;
  setId: string;
  setName: string;
  cardNumber: string;
  uniqueIdentifier: string;
  imageSmall: string | null;
  imageLarge: string | null;
}

interface PokemonApiCard {
  id: string;
  name: string;
  number: string;
  images: {
    small: string;
    large: string;
  };
  set: {
    id: string;
    name: string;
  };
}

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
  private apiKey: string = process.env.POKEMON_TCG_API_KEY || '';
  private baseUrl: string = 'https://api.pokemontcg.io/v2/cards';
  private rateLimit: number = 50; // ms between requests (reduced from 100)
  private maxRetries: number = 1; // Reduced from 3 - fail fast!

  /**
   * Main function to populate all missing images
   */
  async populateAllMissingImages(): Promise<void> {
    logger.info('🎨 Starting image population process...');

    try {
      const cardsWithoutImages = await this.getCardsWithoutImages();
      logger.info(`📊 Found ${cardsWithoutImages.length} cards without images`);

      if (cardsWithoutImages.length === 0) {
        logger.info('✅ All cards already have images!');
        return;
      }

      let successCount = 0;
      let failCount = 0;
      let skippedCount = 0;

      // Process in batches to avoid overwhelming the API
      const batchSize = 100;
      for (let i = 0; i < cardsWithoutImages.length; i += batchSize) {
        const batch = cardsWithoutImages.slice(i, i + batchSize);
        logger.info(`\n📦 Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(cardsWithoutImages.length / batchSize)}`);

        for (const card of batch) {
          try {
            const result = await this.fetchAndStoreImage(card);
            if (result === 'success') {
              successCount++;
              logger.info(`✅ [${successCount + failCount + skippedCount}/${cardsWithoutImages.length}] ${card.cardName} (#${card.cardNumber})`);
            } else if (result === 'skipped') {
              skippedCount++;
              // Don't log every skip - too verbose
              if (skippedCount % 50 === 0) {
                logger.info(`⏭️  Skipped ${skippedCount} cards so far...`);
              }
            }

            // Minimal rate limiting
            await this.sleep(this.rateLimit);
          } catch (error) {
            failCount++;
            // Only log first 10 failures
            if (failCount <= 10) {
              logger.warn(`❌ [${successCount + failCount + skippedCount}/${cardsWithoutImages.length}] Failed: ${card.cardName} - ${(error as Error).message}`);
            }
          }
        }

        // Shorter pause between batches
        if (i + batchSize < cardsWithoutImages.length) {
          logger.info(`⏸️  Progress: ${successCount} success, ${skippedCount} skipped, ${failCount} failed`);
          await this.sleep(2000);
        }
      }

      logger.info(`\n✨ Image population complete!`);
      logger.info(`   ✅ Success: ${successCount}`);
      logger.info(`   ⏭️  Skipped: ${skippedCount} (not in Pokemon API)`);
      logger.info(`   ❌ Failed: ${failCount}`);
    } catch (error) {
      logger.error('Error in image population process', { error });
      throw error;
    }
  }

  /**
   * Fetch images for a single card and store in database
   */
  async fetchAndStoreImage(card: CardRow): Promise<'success' | 'skipped'> {
    try {
      const catalogImages = await copyCatalogImagesToMapping(
        card.cardName,
        card.setId,
        card.setName,
        card.cardNumber
      );

      if (catalogImages?.imageSmall || catalogImages?.imageLarge) {
        await this.storeCardImages(
          card.id,
          catalogImages.imageSmall || catalogImages.imageLarge || '',
          catalogImages.imageLarge || catalogImages.imageSmall || '',
          'catalog_match'
        );
        return 'success';
      }

      const apiCard = await this.searchPokemonApi(card);

      if (!apiCard || !apiCard.images?.large || !apiCard.images?.small) {
        // Card not found in API - this is common for promo cards
        return 'skipped';
      }

      // Store images in database
      await this.storeCardImages(
        card.id,
        apiCard.images.small,
        apiCard.images.large,
        'pokemon_api'
      );

      return 'success';
    } catch (error) {
      logger.debug(`Search failed for ${card.cardName}`, { error });
      return 'skipped';
    }
  }

  /**
   * Search Pokemon API for a card using FAST strategies only
   */
  private async searchPokemonApi(card: CardRow): Promise<PokemonApiCard | null> {
    const headers: HeadersInit = {
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

        const result = await this.fetchWithRetry(url.toString(), headers);
        if (result && result.length > 0) {
          return this.findBestMatch(result, card);
        }
      } catch (error) {
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

        const result = await this.fetchWithRetry(url.toString(), headers);
        if (result && result.length > 0) {
          return this.findBestMatch(result, card);
        }
      } catch (error) {
        return null;
      }
    }

    return null;
  }

  /**
   * Find the best matching card from API results
   */
  private findBestMatch(apiCards: any[], card: CardRow): PokemonApiCard | null {
    // Exact name match
    let exactMatches = apiCards.filter(
      (c) => c.name.toLowerCase() === card.cardName.toLowerCase()
    );

    if (exactMatches.length === 0) {
      // Fuzzy match
      exactMatches = apiCards.filter(
        (c) => c.name.toLowerCase().includes(card.cardName.toLowerCase())
      );
    }

    if (exactMatches.length === 0) {
      return null;
    }

    // If we have a card number, try to match it
    if (card.cardNumber) {
      const normalizedRequestNumber = this.normalizeCardNumber(card.cardNumber);
      const numberMatch = exactMatches.find(
        (c) => this.normalizeCardNumber(c.number) === normalizedRequestNumber
      );
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
  private normalizeCardNumber(num: string): string {
    if (!num) return '';
    const beforeSlash = num.split('/')[0].trim();
    return beforeSlash.toLowerCase().replace(/^0+/, '').replace(/[^a-z0-9]/g, '');
  }

  /**
   * Fetch from API with FAST retry logic
   */
  private async fetchWithRetry(url: string, headers: HeadersInit): Promise<any[]> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3000); // 3 second timeout (reduced from 15!)

        const response = await fetch(url, {
          headers,
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (!response.ok) {
          if (response.status === 429) {
            // Rate limited - wait briefly
            await this.sleep(1000);
            continue;
          }
          throw new Error(`API request failed: ${response.status}`);
        }

        const json = await response.json();
        return json.data || [];
      } catch (error) {
        lastError = error as Error;
        if (attempt < this.maxRetries - 1) {
          await this.sleep(500); // Short retry delay
        }
      }
    }

    throw lastError || new Error('Unknown fetch error');
  }

  /**
   * Get all cards that don't have images
   */
  private async getCardsWithoutImages(): Promise<CardRow[]> {
    const db = getDb();

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
      logger.error('Image columns do not exist in card_mappings table. Migration may have failed.');
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

      db.all(sql, [], (err, rows: any[]) => {
        if (err) {
          logger.error('SQL Error in getCardsWithoutImages', { error: err, sql });
          reject(err);
        } else {
          resolve(rows as CardRow[]);
        }
      });
    });
  }

  /**
   * Store card images in database
   */
  private async storeCardImages(
    cardId: number,
    imageSmall: string,
    imageLarge: string,
    source: string
  ): Promise<void> {
    const db = getDb();

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
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Manually add images for a specific card (useful for promo cards)
   */
  async manuallyAddImages(
    uniqueIdentifier: string,
    imageSmall: string,
    imageLarge: string,
    source: string = 'manual'
  ): Promise<void> {
    const db = getDb();

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
          logger.error(`Failed to manually add images for ${uniqueIdentifier}`, { error: err });
          reject(err);
        } else {
          logger.info(`✅ Manually added images for ${uniqueIdentifier}`);
          resolve();
        }
      });
    });
  }

  /**
   * Get statistics about images in the database
   */
  async getImageStats(): Promise<{
    total: number;
    withImages: number;
    withoutImages: number;
    percentage: number;
  }> {
    const db = getDb();

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
      logger.warn('Image columns do not exist yet. Returning empty stats.');
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

      db.get(sql, [], (err, row: any) => {
        if (err) {
          logger.error('SQL Error in getImageStats', { error: err, sql });
          reject(err);
        } else {
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
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Export singleton instance
export const imagePopulatorService = new ImagePopulatorService();

// CLI script to run manually
if (require.main === module) {
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
      
      // First show stats
      const stats = await imagePopulatorService.getImageStats();
      logger.info('📊 Current Image Statistics:');
      logger.info(`   Total cards: ${stats.total}`);
      logger.info(`   With images: ${stats.withImages} (${stats.percentage.toFixed(1)}%)`);
      logger.info(`   Without images: ${stats.withoutImages}`);
      logger.info('');

      if (stats.withoutImages === 0) {
        logger.info('✅ All cards already have images!');
        process.exit(0);
      }

      // Run population
      await imagePopulatorService.populateAllMissingImages();

      // Show final stats
      const finalStats = await imagePopulatorService.getImageStats();
      logger.info('\n📊 Final Image Statistics:');
      logger.info(`   Total cards: ${finalStats.total}`);
      logger.info(`   With images: ${finalStats.withImages} (${finalStats.percentage.toFixed(1)}%)`);
      logger.info(`   Without images: ${finalStats.withoutImages}`);

      process.exit(0);
    } catch (error) {
      logger.error('Fatal error in image population', { error });
      process.exit(1);
    }
  })();
}

