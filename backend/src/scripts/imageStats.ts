import { getDb, initializeDatabase } from '../db/database';
import { runMigrations } from '../db/migrations';
import { logger } from '../utils/logger';
import { imagePopulatorService } from '../services/imagePopulator';

(async () => {
  try {
    // Initialize database and run migrations first
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
    
    // Get and display stats
    const stats = await imagePopulatorService.getImageStats();
    
    logger.info('📊 Image Statistics:');
    logger.info(`   Total cards: ${stats.total}`);
    logger.info(`   With images: ${stats.withImages} (${stats.percentage.toFixed(1)}%)`);
    logger.info(`   Without images: ${stats.withoutImages}`);
    
    process.exit(0);
  } catch (error) {
    logger.error('Fatal error getting image stats', { error });
    process.exit(1);
  }
})();

