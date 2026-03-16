"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const database_1 = require("../db/database");
const migrations_1 = require("../db/migrations");
const logger_1 = require("../utils/logger");
const imagePopulator_1 = require("../services/imagePopulator");
(async () => {
    try {
        // Initialize database and run migrations first
        logger_1.logger.info('🔧 Initializing database...');
        (0, database_1.initializeDatabase)();
        // Wait for database initialization to complete
        await new Promise(resolve => setTimeout(resolve, 1000));
        const db = (0, database_1.getDb)();
        logger_1.logger.info('🔧 Running migrations...');
        await (0, migrations_1.runMigrations)(db);
        // Wait for migrations to complete
        await new Promise(resolve => setTimeout(resolve, 500));
        logger_1.logger.info('✅ Database ready!\n');
        // Get and display stats
        const stats = await imagePopulator_1.imagePopulatorService.getImageStats();
        logger_1.logger.info('📊 Image Statistics:');
        logger_1.logger.info(`   Total cards: ${stats.total}`);
        logger_1.logger.info(`   With images: ${stats.withImages} (${stats.percentage.toFixed(1)}%)`);
        logger_1.logger.info(`   Without images: ${stats.withoutImages}`);
        process.exit(0);
    }
    catch (error) {
        logger_1.logger.error('Fatal error getting image stats', { error });
        process.exit(1);
    }
})();
