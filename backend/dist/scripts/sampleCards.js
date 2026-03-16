"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const database_1 = require("../db/database");
const migrations_1 = require("../db/migrations");
const logger_1 = require("../utils/logger");
(async () => {
    try {
        logger_1.logger.info('🔧 Initializing database...');
        (0, database_1.initializeDatabase)();
        await new Promise(resolve => setTimeout(resolve, 1000));
        const db = (0, database_1.getDb)();
        logger_1.logger.info('🔧 Running migrations...');
        await (0, migrations_1.runMigrations)(db);
        await new Promise(resolve => setTimeout(resolve, 500));
        logger_1.logger.info('✅ Database ready!\n');
        // Sample 20 cards that would be processed
        logger_1.logger.info('📋 Sample of cards that would be processed:\n');
        const cards = await new Promise((resolve) => {
            const sql = `
        SELECT 
          cardName,
          setId,
          setName,
          cardNumber,
          rarity
        FROM card_mappings
        WHERE cardNumber IS NOT NULL
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
        ORDER BY RANDOM()
        LIMIT 20
      `;
            db.all(sql, [], (err, rows) => {
                if (err) {
                    logger_1.logger.error('Error fetching sample cards', { error: err });
                    resolve([]);
                }
                else {
                    resolve(rows || []);
                }
            });
        });
        cards.forEach((card, index) => {
            logger_1.logger.info(`${index + 1}. ${card.cardName} (#${card.cardNumber})`);
            logger_1.logger.info(`   Set: ${card.setName} (ID: ${card.setId})`);
            logger_1.logger.info(`   Rarity: ${card.rarity || 'N/A'}\n`);
        });
        // Check what set IDs we have
        logger_1.logger.info('\n📊 Top 10 sets by card count:\n');
        const sets = await new Promise((resolve) => {
            const sql = `
        SELECT 
          setId,
          setName,
          COUNT(*) as count
        FROM card_mappings
        WHERE cardNumber IS NOT NULL
        GROUP BY setId, setName
        ORDER BY count DESC
        LIMIT 10
      `;
            db.all(sql, [], (err, rows) => {
                if (err) {
                    logger_1.logger.error('Error fetching sets', { error: err });
                    resolve([]);
                }
                else {
                    resolve(rows || []);
                }
            });
        });
        sets.forEach((set, index) => {
            logger_1.logger.info(`${index + 1}. ${set.setName} (${set.setId}) - ${set.count} cards`);
        });
        process.exit(0);
    }
    catch (error) {
        logger_1.logger.error('Fatal error', { error });
        process.exit(1);
    }
})();
