import { getDb, initializeDatabase } from '../db/database';
import { runMigrations } from '../db/migrations';
import { logger } from '../utils/logger';

(async () => {
  try {
    logger.info('🔧 Initializing database...');
    initializeDatabase();
    
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const db = getDb();
    
    logger.info('🔧 Running migrations...');
    await runMigrations(db);
    
    await new Promise(resolve => setTimeout(resolve, 500));
    
    logger.info('✅ Database ready!\n');
    
    // Check migrations table
    logger.info('📋 Checking migrations table:');
    const migrations: any[] = await new Promise((resolve) => {
      db.all('SELECT * FROM migrations ORDER BY id ASC', [], (err, rows) => {
        if (err) {
          logger.error('Error reading migrations table', { error: err });
          resolve([]);
        } else {
          resolve(rows || []);
        }
      });
    });
    
    migrations.forEach((m: any) => {
      logger.info(`   ✅ Migration ${m.id}: ${m.name} (executed at ${m.executed_at})`);
    });
    
    logger.info('');
    
    // Check card_mappings table schema
    logger.info('📋 card_mappings table schema:');
    const schema: any[] = await new Promise((resolve) => {
      db.all('PRAGMA table_info(card_mappings)', [], (err, rows) => {
        if (err) {
          logger.error('Error reading table schema', { error: err });
          resolve([]);
        } else {
          resolve(rows || []);
        }
      });
    });
    
    schema.forEach((col: any) => {
      const marker = ['imageSmall', 'imageLarge', 'imageSource', 'imageLastUpdated'].includes(col.name) ? '🎨' : '  ';
      logger.info(`   ${marker} ${col.name} (${col.type}${col.notnull ? ', NOT NULL' : ''})`);
    });
    
    logger.info('');
    
    // Check if image columns exist
    const hasImageSmall = schema.some((col: any) => col.name === 'imageSmall');
    const hasImageLarge = schema.some((col: any) => col.name === 'imageLarge');
    const hasImageSource = schema.some((col: any) => col.name === 'imageSource');
    const hasImageLastUpdated = schema.some((col: any) => col.name === 'imageLastUpdated');
    
    if (hasImageSmall && hasImageLarge && hasImageSource && hasImageLastUpdated) {
      logger.info('✅ All image columns exist!');
    } else {
      logger.error('❌ Missing image columns:');
      if (!hasImageSmall) logger.error('   - imageSmall');
      if (!hasImageLarge) logger.error('   - imageLarge');
      if (!hasImageSource) logger.error('   - imageSource');
      if (!hasImageLastUpdated) logger.error('   - imageLastUpdated');
    }
    
    logger.info('');
    
    // Count cards
    const count: any = await new Promise((resolve) => {
      db.get('SELECT COUNT(*) as count FROM card_mappings', [], (err, row) => {
        if (err) {
          logger.error('Error counting cards', { error: err });
          resolve({ count: 0 });
        } else {
          resolve(row);
        }
      });
    });
    
    logger.info(`📊 Total cards in database: ${count.count}`);
    
    process.exit(0);
  } catch (error) {
    logger.error('Fatal error', { error });
    process.exit(1);
  }
})();

