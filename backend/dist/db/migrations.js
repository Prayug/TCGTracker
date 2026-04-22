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
exports.rollbackLastMigration = exports.runMigrations = exports.migrations = void 0;
const logger_1 = require("../utils/logger");
// Migration tracking table
const createMigrationsTable = (db) => {
    return new Promise((resolve, reject) => {
        db.run(`CREATE TABLE IF NOT EXISTS migrations (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        executed_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`, (err) => {
            if (err)
                reject(err);
            else
                resolve();
        });
    });
};
// Check if migration has been run
const isMigrationExecuted = (db, migrationId) => {
    return new Promise((resolve, reject) => {
        db.get('SELECT id FROM migrations WHERE id = ?', [migrationId], (err, row) => {
            if (err)
                reject(err);
            else
                resolve(!!row);
        });
    });
};
// Record migration execution
const recordMigration = (db, migration) => {
    return new Promise((resolve, reject) => {
        db.run('INSERT INTO migrations (id, name) VALUES (?, ?)', [migration.id, migration.name], (err) => {
            if (err)
                reject(err);
            else
                resolve();
        });
    });
};
// Define migrations
exports.migrations = [
    {
        id: 1,
        name: 'create_users_table',
        up: (db) => __awaiter(void 0, void 0, void 0, function* () {
            return new Promise((resolve, reject) => {
                db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )`, (err) => {
                    if (err)
                        reject(err);
                    else {
                        logger_1.logger.info('Created users table');
                        resolve();
                    }
                });
            });
        }),
        down: (db) => __awaiter(void 0, void 0, void 0, function* () {
            return new Promise((resolve, reject) => {
                db.run('DROP TABLE IF EXISTS users', (err) => {
                    if (err)
                        reject(err);
                    else
                        resolve();
                });
            });
        }),
    },
    {
        id: 2,
        name: 'create_price_alerts_table',
        up: (db) => __awaiter(void 0, void 0, void 0, function* () {
            return new Promise((resolve, reject) => {
                // Drop old table if it exists (with wrong schema)
                db.run('DROP TABLE IF EXISTS price_alerts', (dropErr) => {
                    if (dropErr) {
                        logger_1.logger.warn('Error dropping old price_alerts table', { error: dropErr });
                        // Continue anyway - table might not exist
                    }
                    // Create table with correct schema
                    db.run(`CREATE TABLE IF NOT EXISTS price_alerts (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              user_id INTEGER NOT NULL,
              card_id TEXT NOT NULL,
              card_name TEXT NOT NULL,
              target_price REAL NOT NULL,
              condition TEXT CHECK(condition IN ('above', 'below')) NOT NULL,
              is_active BOOLEAN DEFAULT 1,
              created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
              triggered_at DATETIME,
              FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )`, (err) => {
                        if (err)
                            reject(err);
                        else {
                            logger_1.logger.info('Created price_alerts table');
                            resolve();
                        }
                    });
                });
            });
        }),
        down: (db) => __awaiter(void 0, void 0, void 0, function* () {
            return new Promise((resolve, reject) => {
                db.run('DROP TABLE IF EXISTS price_alerts', (err) => {
                    if (err)
                        reject(err);
                    else
                        resolve();
                });
            });
        }),
    },
    {
        id: 3,
        name: 'create_indexes',
        up: (db) => __awaiter(void 0, void 0, void 0, function* () {
            const indexes = [
                'CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)',
                'CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)',
                'CREATE INDEX IF NOT EXISTS idx_alerts_user ON price_alerts(user_id)',
                'CREATE INDEX IF NOT EXISTS idx_alerts_card ON price_alerts(card_id)',
                'CREATE INDEX IF NOT EXISTS idx_alerts_active ON price_alerts(is_active)',
            ];
            for (const indexSql of indexes) {
                yield new Promise((resolve, reject) => {
                    db.run(indexSql, (err) => {
                        if (err)
                            reject(err);
                        else
                            resolve();
                    });
                });
            }
            logger_1.logger.info('Created database indexes');
        }),
        down: (db) => __awaiter(void 0, void 0, void 0, function* () {
            const indexes = [
                'DROP INDEX IF EXISTS idx_users_email',
                'DROP INDEX IF EXISTS idx_users_username',
                'DROP INDEX IF EXISTS idx_alerts_user',
                'DROP INDEX IF EXISTS idx_alerts_card',
                'DROP INDEX IF EXISTS idx_alerts_active',
            ];
            for (const indexSql of indexes) {
                yield new Promise((resolve, reject) => {
                    db.run(indexSql, (err) => {
                        if (err)
                            reject(err);
                        else
                            resolve();
                    });
                });
            }
        }),
    },
    {
        id: 4,
        name: 'create_user_collections_table',
        up: (db) => __awaiter(void 0, void 0, void 0, function* () {
            return new Promise((resolve, reject) => {
                db.run(`CREATE TABLE IF NOT EXISTS user_collections (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            card_id TEXT NOT NULL,
            card_name TEXT NOT NULL,
            quantity INTEGER DEFAULT 1,
            purchase_price REAL,
            purchase_date DATETIME,
            condition TEXT,
            notes TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            UNIQUE(user_id, card_id, condition)
          )`, (err) => {
                    if (err)
                        reject(err);
                    else {
                        logger_1.logger.info('Created user_collections table');
                        resolve();
                    }
                });
            });
        }),
        down: (db) => __awaiter(void 0, void 0, void 0, function* () {
            return new Promise((resolve, reject) => {
                db.run('DROP TABLE IF EXISTS user_collections', (err) => {
                    if (err)
                        reject(err);
                    else
                        resolve();
                });
            });
        }),
    },
    {
        id: 5,
        name: 'add_image_fields_to_card_mappings',
        up: (db) => __awaiter(void 0, void 0, void 0, function* () {
            // Add image URL columns to card_mappings table (snake_case - will be fixed in migration 6)
            const columns = [
                'ALTER TABLE card_mappings ADD COLUMN image_small TEXT',
                'ALTER TABLE card_mappings ADD COLUMN image_large TEXT',
            ];
            for (const sql of columns) {
                yield new Promise((resolve, reject) => {
                    db.run(sql, (err) => {
                        if (err && !err.message.includes('duplicate column')) {
                            reject(err);
                        }
                        else {
                            resolve();
                        }
                    });
                });
            }
            logger_1.logger.info('Added image fields to card_mappings table');
        }),
        down: (db) => __awaiter(void 0, void 0, void 0, function* () {
            logger_1.logger.info('Skipping rollback of image columns (SQLite limitation)');
        }),
    },
    {
        id: 6,
        name: 'fix_image_column_names_camelCase',
        up: (db) => __awaiter(void 0, void 0, void 0, function* () {
            // Add properly named camelCase columns
            const columns = [
                'ALTER TABLE card_mappings ADD COLUMN imageSmall TEXT',
                'ALTER TABLE card_mappings ADD COLUMN imageLarge TEXT',
                'ALTER TABLE card_mappings ADD COLUMN imageSource TEXT',
                'ALTER TABLE card_mappings ADD COLUMN imageLastUpdated TEXT',
            ];
            for (const sql of columns) {
                yield new Promise((resolve, reject) => {
                    db.run(sql, (err) => {
                        if (err && !err.message.includes('duplicate column')) {
                            reject(err);
                        }
                        else {
                            resolve();
                        }
                    });
                });
            }
            // Copy data from old snake_case columns if they exist
            const existingColumns = yield new Promise((resolve) => {
                db.all('PRAGMA table_info(card_mappings)', [], (err, rows) => {
                    if (err || !rows) {
                        resolve([]);
                    }
                    else {
                        resolve(rows.map((r) => r.name));
                    }
                });
            });
            if (existingColumns.includes('image_small')) {
                yield new Promise((resolve) => {
                    db.run(`UPDATE card_mappings 
             SET imageSmall = image_small, 
                 imageLarge = image_large 
             WHERE image_small IS NOT NULL`, (err) => {
                        if (err) {
                            logger_1.logger.warn('Could not copy data from old columns', { error: err });
                        }
                        resolve();
                    });
                });
                logger_1.logger.info('Copied data from snake_case to camelCase columns');
            }
            logger_1.logger.info('Fixed image column names to camelCase');
        }),
        down: (db) => __awaiter(void 0, void 0, void 0, function* () {
            logger_1.logger.info('Skipping rollback (SQLite limitation)');
        }),
    },
    {
        id: 7,
        name: 'add_variant_and_catalog_tables',
        up: (db) => __awaiter(void 0, void 0, void 0, function* () {
            const alterStatements = [
                `ALTER TABLE card_mappings ADD COLUMN variantKey TEXT DEFAULT 'normal'`,
            ];
            for (const statement of alterStatements) {
                yield new Promise((resolve, reject) => {
                    db.run(statement, (err) => {
                        if (err && !err.message.includes('duplicate column')) {
                            reject(err);
                            return;
                        }
                        resolve();
                    });
                });
            }
            yield new Promise((resolve, reject) => {
                db.run(`CREATE TABLE IF NOT EXISTS catalog_cards (
            cardId TEXT PRIMARY KEY,
            cardName TEXT NOT NULL,
            setId TEXT NOT NULL,
            setName TEXT NOT NULL,
            setReleaseDate TEXT,
            cardNumber TEXT,
            rarity TEXT,
            types TEXT,
            artist TEXT,
            imageSmall TEXT,
            imageLarge TEXT,
            tcgplayerProductId TEXT,
            tcgplayerPrices TEXT,
            syncedAt TEXT DEFAULT (datetime('now'))
          )`, (err) => {
                    if (err) {
                        reject(err);
                    }
                    else {
                        resolve();
                    }
                });
            });
            const indexes = [
                'CREATE INDEX IF NOT EXISTS idx_card_mappings_variant ON card_mappings(variantKey)',
                'CREATE INDEX IF NOT EXISTS idx_catalog_cards_name ON catalog_cards(cardName)',
                'CREATE INDEX IF NOT EXISTS idx_catalog_cards_set ON catalog_cards(setId, setName)',
                'CREATE INDEX IF NOT EXISTS idx_catalog_cards_tcgplayer_product ON catalog_cards(tcgplayerProductId)',
            ];
            for (const indexSql of indexes) {
                yield new Promise((resolve, reject) => {
                    db.run(indexSql, (err) => {
                        if (err) {
                            reject(err);
                        }
                        else {
                            resolve();
                        }
                    });
                });
            }
            logger_1.logger.info('Added variant-aware mappings and catalog tables');
        }),
        down: (db) => __awaiter(void 0, void 0, void 0, function* () {
            yield new Promise((resolve, reject) => {
                db.run('DROP TABLE IF EXISTS catalog_cards', (err) => {
                    if (err) {
                        reject(err);
                    }
                    else {
                        resolve();
                    }
                });
            });
            logger_1.logger.info('Rolled back catalog_cards table');
        }),
    },
];
// Run pending migrations
const runMigrations = (db) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        yield createMigrationsTable(db);
        logger_1.logger.info('Starting database migrations...');
        for (const migration of exports.migrations) {
            const isExecuted = yield isMigrationExecuted(db, migration.id);
            if (!isExecuted) {
                logger_1.logger.info(`Running migration ${migration.id}: ${migration.name}`);
                yield migration.up(db);
                yield recordMigration(db, migration);
                logger_1.logger.info(`Migration ${migration.id} completed`);
            }
            else {
                logger_1.logger.debug(`Migration ${migration.id} already executed, skipping`);
            }
        }
        logger_1.logger.info('All migrations completed successfully');
    }
    catch (error) {
        logger_1.logger.error('Migration failed', { error });
        throw error;
    }
});
exports.runMigrations = runMigrations;
// Rollback last migration
const rollbackLastMigration = (db) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const lastMigration = yield new Promise((resolve, reject) => {
            db.get('SELECT id, name FROM migrations ORDER BY id DESC LIMIT 1', (err, row) => {
                if (err)
                    reject(err);
                else
                    resolve(row);
            });
        });
        if (!lastMigration) {
            logger_1.logger.info('No migrations to rollback');
            return;
        }
        const migration = exports.migrations.find((m) => m.id === lastMigration.id);
        if (!migration) {
            throw new Error(`Migration ${lastMigration.id} not found`);
        }
        logger_1.logger.info(`Rolling back migration ${migration.id}: ${migration.name}`);
        yield migration.down(db);
        yield new Promise((resolve, reject) => {
            db.run('DELETE FROM migrations WHERE id = ?', [migration.id], (err) => {
                if (err)
                    reject(err);
                else
                    resolve();
            });
        });
        logger_1.logger.info(`Migration ${migration.id} rolled back successfully`);
    }
    catch (error) {
        logger_1.logger.error('Rollback failed', { error });
        throw error;
    }
});
exports.rollbackLastMigration = rollbackLastMigration;
