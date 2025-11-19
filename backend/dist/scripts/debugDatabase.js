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
const database_1 = require("../db/database");
const migrations_1 = require("../db/migrations");
const logger_1 = require("../utils/logger");
(() => __awaiter(void 0, void 0, void 0, function* () {
    try {
        logger_1.logger.info('🔧 Initializing database...');
        (0, database_1.initializeDatabase)();
        yield new Promise(resolve => setTimeout(resolve, 1000));
        const db = (0, database_1.getDb)();
        logger_1.logger.info('🔧 Running migrations...');
        yield (0, migrations_1.runMigrations)(db);
        yield new Promise(resolve => setTimeout(resolve, 500));
        logger_1.logger.info('✅ Database ready!\n');
        // Check migrations table
        logger_1.logger.info('📋 Checking migrations table:');
        const migrations = yield new Promise((resolve) => {
            db.all('SELECT * FROM migrations ORDER BY id ASC', [], (err, rows) => {
                if (err) {
                    logger_1.logger.error('Error reading migrations table', { error: err });
                    resolve([]);
                }
                else {
                    resolve(rows || []);
                }
            });
        });
        migrations.forEach((m) => {
            logger_1.logger.info(`   ✅ Migration ${m.id}: ${m.name} (executed at ${m.executed_at})`);
        });
        logger_1.logger.info('');
        // Check card_mappings table schema
        logger_1.logger.info('📋 card_mappings table schema:');
        const schema = yield new Promise((resolve) => {
            db.all('PRAGMA table_info(card_mappings)', [], (err, rows) => {
                if (err) {
                    logger_1.logger.error('Error reading table schema', { error: err });
                    resolve([]);
                }
                else {
                    resolve(rows || []);
                }
            });
        });
        schema.forEach((col) => {
            const marker = ['imageSmall', 'imageLarge', 'imageSource', 'imageLastUpdated'].includes(col.name) ? '🎨' : '  ';
            logger_1.logger.info(`   ${marker} ${col.name} (${col.type}${col.notnull ? ', NOT NULL' : ''})`);
        });
        logger_1.logger.info('');
        // Check if image columns exist
        const hasImageSmall = schema.some((col) => col.name === 'imageSmall');
        const hasImageLarge = schema.some((col) => col.name === 'imageLarge');
        const hasImageSource = schema.some((col) => col.name === 'imageSource');
        const hasImageLastUpdated = schema.some((col) => col.name === 'imageLastUpdated');
        if (hasImageSmall && hasImageLarge && hasImageSource && hasImageLastUpdated) {
            logger_1.logger.info('✅ All image columns exist!');
        }
        else {
            logger_1.logger.error('❌ Missing image columns:');
            if (!hasImageSmall)
                logger_1.logger.error('   - imageSmall');
            if (!hasImageLarge)
                logger_1.logger.error('   - imageLarge');
            if (!hasImageSource)
                logger_1.logger.error('   - imageSource');
            if (!hasImageLastUpdated)
                logger_1.logger.error('   - imageLastUpdated');
        }
        logger_1.logger.info('');
        // Count cards
        const count = yield new Promise((resolve) => {
            db.get('SELECT COUNT(*) as count FROM card_mappings', [], (err, row) => {
                if (err) {
                    logger_1.logger.error('Error counting cards', { error: err });
                    resolve({ count: 0 });
                }
                else {
                    resolve(row);
                }
            });
        });
        logger_1.logger.info(`📊 Total cards in database: ${count.count}`);
        process.exit(0);
    }
    catch (error) {
        logger_1.logger.error('Fatal error', { error });
        process.exit(1);
    }
}))();
