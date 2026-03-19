import { Database } from 'sqlite3';
import { logger } from '../utils/logger';

export interface Migration {
  id: number;
  name: string;
  up: (db: Database) => Promise<void>;
  down: (db: Database) => Promise<void>;
}

// Migration tracking table
const createMigrationsTable = (db: Database): Promise<void> => {
  return new Promise((resolve, reject) => {
    db.run(
      `CREATE TABLE IF NOT EXISTS migrations (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        executed_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      (err) => {
        if (err) reject(err);
        else resolve();
      }
    );
  });
};

// Check if migration has been run
const isMigrationExecuted = (db: Database, migrationId: number): Promise<boolean> => {
  return new Promise((resolve, reject) => {
    db.get('SELECT id FROM migrations WHERE id = ?', [migrationId], (err, row) => {
      if (err) reject(err);
      else resolve(!!row);
    });
  });
};

// Record migration execution
const recordMigration = (db: Database, migration: Migration): Promise<void> => {
  return new Promise((resolve, reject) => {
    db.run(
      'INSERT INTO migrations (id, name) VALUES (?, ?)',
      [migration.id, migration.name],
      (err) => {
        if (err) reject(err);
        else resolve();
      }
    );
  });
};

// Define migrations
export const migrations: Migration[] = [
  {
    id: 1,
    name: 'create_users_table',
    up: async (db: Database) => {
      return new Promise((resolve, reject) => {
        db.run(
          `CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )`,
          (err) => {
            if (err) reject(err);
            else {
              logger.info('Created users table');
              resolve();
            }
          }
        );
      });
    },
    down: async (db: Database) => {
      return new Promise((resolve, reject) => {
        db.run('DROP TABLE IF EXISTS users', (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    },
  },
  {
    id: 2,
    name: 'create_price_alerts_table',
    up: async (db: Database) => {
      return new Promise((resolve, reject) => {
        // Drop old table if it exists (with wrong schema)
        db.run('DROP TABLE IF EXISTS price_alerts', (dropErr) => {
          if (dropErr) {
            logger.warn('Error dropping old price_alerts table', { error: dropErr });
            // Continue anyway - table might not exist
          }
          
          // Create table with correct schema
          db.run(
            `CREATE TABLE IF NOT EXISTS price_alerts (
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
            )`,
            (err) => {
              if (err) reject(err);
              else {
                logger.info('Created price_alerts table');
                resolve();
              }
            }
          );
        });
      });
    },
    down: async (db: Database) => {
      return new Promise((resolve, reject) => {
        db.run('DROP TABLE IF EXISTS price_alerts', (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    },
  },
  {
    id: 3,
    name: 'create_indexes',
    up: async (db: Database) => {
      const indexes = [
        'CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)',
        'CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)',
        'CREATE INDEX IF NOT EXISTS idx_alerts_user ON price_alerts(user_id)',
        'CREATE INDEX IF NOT EXISTS idx_alerts_card ON price_alerts(card_id)',
        'CREATE INDEX IF NOT EXISTS idx_alerts_active ON price_alerts(is_active)',
      ];

      for (const indexSql of indexes) {
        await new Promise<void>((resolve, reject) => {
          db.run(indexSql, (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
      }

      logger.info('Created database indexes');
    },
    down: async (db: Database) => {
      const indexes = [
        'DROP INDEX IF EXISTS idx_users_email',
        'DROP INDEX IF EXISTS idx_users_username',
        'DROP INDEX IF EXISTS idx_alerts_user',
        'DROP INDEX IF EXISTS idx_alerts_card',
        'DROP INDEX IF EXISTS idx_alerts_active',
      ];

      for (const indexSql of indexes) {
        await new Promise<void>((resolve, reject) => {
          db.run(indexSql, (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
      }
    },
  },
  {
    id: 4,
    name: 'create_user_collections_table',
    up: async (db: Database) => {
      return new Promise((resolve, reject) => {
        db.run(
          `CREATE TABLE IF NOT EXISTS user_collections (
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
          )`,
          (err) => {
            if (err) reject(err);
            else {
              logger.info('Created user_collections table');
              resolve();
            }
          }
        );
      });
    },
    down: async (db: Database) => {
      return new Promise((resolve, reject) => {
        db.run('DROP TABLE IF EXISTS user_collections', (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    },
  },
  {
    id: 5,
    name: 'add_image_fields_to_card_mappings',
    up: async (db: Database) => {
      // Add image URL columns to card_mappings table (snake_case - will be fixed in migration 6)
      const columns = [
        'ALTER TABLE card_mappings ADD COLUMN image_small TEXT',
        'ALTER TABLE card_mappings ADD COLUMN image_large TEXT',
      ];

      for (const sql of columns) {
        await new Promise<void>((resolve, reject) => {
          db.run(sql, (err) => {
            if (err && !err.message.includes('duplicate column')) {
              reject(err);
            } else {
              resolve();
            }
          });
        });
      }

      logger.info('Added image fields to card_mappings table');
    },
    down: async (db: Database) => {
      logger.info('Skipping rollback of image columns (SQLite limitation)');
    },
  },
  {
    id: 6,
    name: 'fix_image_column_names_camelCase',
    up: async (db: Database) => {
      // Add properly named camelCase columns
      const columns = [
        'ALTER TABLE card_mappings ADD COLUMN imageSmall TEXT',
        'ALTER TABLE card_mappings ADD COLUMN imageLarge TEXT',
        'ALTER TABLE card_mappings ADD COLUMN imageSource TEXT',
        'ALTER TABLE card_mappings ADD COLUMN imageLastUpdated TEXT',
      ];

      for (const sql of columns) {
        await new Promise<void>((resolve, reject) => {
          db.run(sql, (err) => {
            if (err && !err.message.includes('duplicate column')) {
              reject(err);
            } else {
              resolve();
            }
          });
        });
      }

      // Copy data from old snake_case columns if they exist
      const existingColumns: string[] = await new Promise((resolve) => {
        db.all('PRAGMA table_info(card_mappings)', [], (err, rows: any[]) => {
          if (err || !rows) {
            resolve([]);
          } else {
            resolve(rows.map((r: any) => r.name));
          }
        });
      });

      if (existingColumns.includes('image_small')) {
        await new Promise<void>((resolve) => {
          db.run(
            `UPDATE card_mappings 
             SET imageSmall = image_small, 
                 imageLarge = image_large 
             WHERE image_small IS NOT NULL`,
            (err) => {
              if (err) {
                logger.warn('Could not copy data from old columns', { error: err });
              }
              resolve();
            }
          );
        });
        logger.info('Copied data from snake_case to camelCase columns');
      }

      logger.info('Fixed image column names to camelCase');
    },
    down: async (db: Database) => {
      logger.info('Skipping rollback (SQLite limitation)');
    },
  },
  {
    id: 7,
    name: 'add_variant_and_catalog_tables',
    up: async (db: Database) => {
      const alterStatements = [
        `ALTER TABLE card_mappings ADD COLUMN variantKey TEXT DEFAULT 'normal'`,
      ];

      for (const statement of alterStatements) {
        await new Promise<void>((resolve, reject) => {
          db.run(statement, (err) => {
            if (err && !err.message.includes('duplicate column')) {
              reject(err);
              return;
            }
            resolve();
          });
        });
      }

      await new Promise<void>((resolve, reject) => {
        db.run(
          `CREATE TABLE IF NOT EXISTS catalog_cards (
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
          )`,
          (err) => {
            if (err) {
              reject(err);
            } else {
              resolve();
            }
          }
        );
      });

      const indexes = [
        'CREATE INDEX IF NOT EXISTS idx_card_mappings_variant ON card_mappings(variantKey)',
        'CREATE INDEX IF NOT EXISTS idx_catalog_cards_name ON catalog_cards(cardName)',
        'CREATE INDEX IF NOT EXISTS idx_catalog_cards_set ON catalog_cards(setId, setName)',
        'CREATE INDEX IF NOT EXISTS idx_catalog_cards_tcgplayer_product ON catalog_cards(tcgplayerProductId)',
      ];

      for (const indexSql of indexes) {
        await new Promise<void>((resolve, reject) => {
          db.run(indexSql, (err) => {
            if (err) {
              reject(err);
            } else {
              resolve();
            }
          });
        });
      }

      logger.info('Added variant-aware mappings and catalog tables');
    },
    down: async (db: Database) => {
      await new Promise<void>((resolve, reject) => {
        db.run('DROP TABLE IF EXISTS catalog_cards', (err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      });
      logger.info('Rolled back catalog_cards table');
    },
  },
  {
    id: 8,
    name: 'standardize_unique_identifier_as_primary_key',
    up: async (db: Database) => {
      const run = (sql: string, params: any[] = []): Promise<void> => {
        return new Promise((resolve, reject) => {
          db.run(sql, params, (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
      };

      await run('DROP TABLE IF EXISTS price_history_v2');
      await run(`CREATE TABLE price_history_v2 (
        uniqueIdentifier TEXT NOT NULL DEFAULT '',
        date TEXT NOT NULL,
        source TEXT NOT NULL DEFAULT 'tcgcsv',
        productId INTEGER,
        price REAL,
        subTypeName TEXT,
        productName TEXT,
        groupName TEXT,
        lowPrice REAL,
        highPrice REAL,
        marketPrice REAL,
        volume INTEGER,
        PRIMARY KEY (uniqueIdentifier, date, source)
      )`);
      logger.info('Copying and deduplicating price_history data, this may take a moment...');
      await run(`INSERT INTO price_history_v2
        SELECT
          COALESCE(uniqueIdentifier, 'legacy|' || COALESCE(productId, '0') || '|' || COALESCE(subTypeName, 'normal')) as uid,
          date, source,
          MAX(productId), AVG(price), MAX(subTypeName),
          MAX(productName), MAX(groupName),
          AVG(lowPrice), AVG(highPrice), AVG(marketPrice), MAX(volume)
        FROM price_history
        GROUP BY uid, date, source`);
      await run('DROP TABLE price_history');
      await run('ALTER TABLE price_history_v2 RENAME TO price_history');
      await run('CREATE INDEX IF NOT EXISTS idx_price_history_date ON price_history(date)');
      await run('CREATE INDEX IF NOT EXISTS idx_price_history_product ON price_history(productId)');
      logger.info('Standardized price_history primary key to (uniqueIdentifier, date, source)');
    },
    down: async (db: Database) => {
      // Reverse: recreate table with original PK
      await new Promise<void>((resolve, reject) => {
        db.run(
          `CREATE TABLE IF NOT EXISTS price_history_old (
            productId INTEGER, date TEXT, price REAL, subTypeName TEXT,
            productName TEXT, groupName TEXT, source TEXT DEFAULT 'tcgcsv',
            lowPrice REAL, highPrice REAL, marketPrice REAL, volume INTEGER,
            uniqueIdentifier TEXT,
            PRIMARY KEY (productId, date, subTypeName, source)
          )`,
          (err) => {
            if (err) { reject(err); return; }
            db.run(
              `INSERT INTO price_history_old SELECT DISTINCT
                productId, date, price, subTypeName, productName, groupName,
                source, lowPrice, highPrice, marketPrice, volume, uniqueIdentifier
               FROM price_history`,
              (copyErr) => {
                if (copyErr) { reject(copyErr); return; }
                db.run('DROP TABLE price_history', (dropErr) => {
                  if (dropErr) { reject(dropErr); return; }
                  db.run('ALTER TABLE price_history_old RENAME TO price_history', (renameErr) => {
                    if (renameErr) { reject(renameErr); return; }
                    db.run('CREATE INDEX IF NOT EXISTS idx_price_history_date ON price_history(date)', () => {});
                    resolve();
                  });
                });
              }
            );
          }
        );
      });
    },
  },
  {
    id: 9,
    name: 'add_card_data_to_user_collections',
    up: async (db: Database) => {
      await new Promise<void>((resolve, reject) => {
        db.run('ALTER TABLE user_collections ADD COLUMN card_data TEXT', (err) => {
          if (err && !err.message.includes('duplicate column')) reject(err);
          else resolve();
        });
      });
      await new Promise<void>((resolve, reject) => {
        db.run('ALTER TABLE user_collections ADD COLUMN client_vault_id TEXT', (err) => {
          if (err && !err.message.includes('duplicate column')) reject(err);
          else resolve();
        });
      });
      logger.info('Added card_data and client_vault_id to user_collections');
    },
    down: async () => {
      logger.info('Skipping rollback of card_data columns (SQLite limitation)');
    },
  },
  {
    id: 10,
    name: 'add_set_id_aliases_and_catalog_set_id',
    up: async (db: Database) => {
      const run = (sql: string): Promise<void> =>
        new Promise((resolve, reject) => {
          db.run(sql, (err) => {
            if (err && !err.message.includes('duplicate column')) reject(err);
            else resolve();
          });
        });

      await run('ALTER TABLE card_mappings ADD COLUMN catalogSetId TEXT');

      await new Promise<void>((resolve, reject) => {
        db.run(
          `CREATE TABLE IF NOT EXISTS set_id_aliases (
            sourceSetId TEXT PRIMARY KEY,
            sourceSetName TEXT,
            catalogSetId TEXT NOT NULL,
            updatedAt TEXT DEFAULT (datetime('now'))
          )`,
          (err) => (err ? reject(err) : resolve())
        );
      });

      const indexes = [
        'CREATE INDEX IF NOT EXISTS idx_set_id_aliases_catalog ON set_id_aliases(catalogSetId)',
        'CREATE INDEX IF NOT EXISTS idx_card_mappings_catalog_set ON card_mappings(catalogSetId)',
        'CREATE INDEX IF NOT EXISTS idx_catalog_cards_name_set ON catalog_cards(cardName, setId)',
      ];

      for (const indexSql of indexes) {
        await run(indexSql);
      }

      logger.info('Added set_id_aliases table and catalogSetId column');
    },
    down: async () => {
      logger.info('Skipping rollback of set_id_aliases (SQLite limitation)');
    },
  },
  {
    id: 11,
    name: 'onepiece_catalog_variant_schema',
    up: async (db: Database) => {
      const run = (sql: string): Promise<void> =>
        new Promise((resolve, reject) => {
          db.run(sql, (err) => {
            if (err) reject(err);
            else resolve();
          });
        });

      await run('DROP TABLE IF EXISTS onepiece_price_history');
      await run('DROP TABLE IF EXISTS onepiece_catalog');

      await run(`CREATE TABLE onepiece_catalog (
        catalogId TEXT PRIMARY KEY,
        cardSetId TEXT NOT NULL,
        cardImageId TEXT NOT NULL,
        cardName TEXT NOT NULL,
        setId TEXT NOT NULL,
        setName TEXT NOT NULL,
        rarity TEXT,
        cardColor TEXT,
        cardType TEXT,
        cardCost TEXT,
        cardPower TEXT,
        counterAmount INTEGER,
        life TEXT,
        subTypes TEXT,
        attribute TEXT,
        cardText TEXT,
        imageUrl TEXT,
        marketPrice REAL,
        inventoryPrice REAL,
        syncedAt TEXT DEFAULT (datetime('now'))
      )`);

      await run(`CREATE TABLE onepiece_price_history (
        catalogId TEXT NOT NULL,
        date TEXT NOT NULL,
        marketPrice REAL,
        inventoryPrice REAL,
        source TEXT NOT NULL DEFAULT 'optcg',
        PRIMARY KEY (catalogId, date, source)
      )`);

      await run('CREATE INDEX IF NOT EXISTS idx_onepiece_catalog_name ON onepiece_catalog(cardName)');
      await run('CREATE INDEX IF NOT EXISTS idx_onepiece_catalog_set ON onepiece_catalog(setId, setName)');
      await run('CREATE INDEX IF NOT EXISTS idx_onepiece_catalog_card_set_id ON onepiece_catalog(cardSetId)');
      await run('CREATE INDEX IF NOT EXISTS idx_onepiece_price_history_card ON onepiece_price_history(catalogId)');
      await run('CREATE INDEX IF NOT EXISTS idx_onepiece_price_history_date ON onepiece_price_history(date)');

      logger.info('Rebuilt One Piece catalog tables with per-variant catalogId primary key');
    },
    down: async () => {
      logger.info('Skipping rollback of One Piece variant schema');
    },
  },
  {
    id: 13,
    name: 'rebuild_graded_prices_for_pricecharting',
    up: async (db: Database) => {
      const run = (sql: string): Promise<void> =>
        new Promise((resolve, reject) => {
          db.run(sql, (err) => {
            if (err) reject(err);
            else resolve();
          });
        });

      await run('DROP INDEX IF EXISTS idx_graded_prices_card_grader');
      await run('DROP INDEX IF EXISTS idx_graded_prices_grader');
      await run('DROP INDEX IF EXISTS idx_graded_prices_card');
      await run('DROP TABLE IF EXISTS graded_prices');

      await run(`CREATE TABLE graded_prices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cardId TEXT NOT NULL,
        cardName TEXT,
        setId TEXT,
        setName TEXT,
        grader TEXT NOT NULL,
        grade TEXT NOT NULL,
        price REAL,
        soldListings INTEGER DEFAULT 0,
        fetchedAt TEXT DEFAULT (datetime('now')),
        UNIQUE(cardId, grader, grade)
      )`);

      await run('CREATE INDEX IF NOT EXISTS idx_graded_prices_card ON graded_prices(cardId)');
      await run(
        'CREATE INDEX IF NOT EXISTS idx_graded_prices_grader ON graded_prices(grader, grade)'
      );

      logger.info('Rebuilt graded_prices table for PriceCharting slab pricing');
    },
    down: async () => {
      logger.info('Skipping rollback of graded_prices rebuild');
    },
  },
  {
    id: 14,
    name: 'add_backtest_metrics_columns',
    up: async (db: Database) => {
      const run = (sql: string): Promise<void> =>
        new Promise((resolve, reject) => {
          db.run(sql, (err) => {
            if (err) reject(err);
            else resolve();
          });
        });

      await run('ALTER TABLE backtest_runs ADD COLUMN sharpe_ratio REAL');
      await run('ALTER TABLE backtest_runs ADD COLUMN max_drawdown REAL');
      await run('ALTER TABLE backtest_runs ADD COLUMN win_rate REAL');
      await run('ALTER TABLE backtest_runs ADD COLUMN profit_factor REAL');

      logger.info('Added sharpe_ratio, max_drawdown, win_rate, profit_factor columns to backtest_runs');
    },
    down: async (db: Database) => {
      const run = (sql: string): Promise<void> =>
        new Promise((resolve, reject) => {
          db.run(sql, (err) => {
            if (err) reject(err);
            else resolve();
          });
        });

      await run('ALTER TABLE backtest_runs DROP COLUMN sharpe_ratio');
      await run('ALTER TABLE backtest_runs DROP COLUMN max_drawdown');
      await run('ALTER TABLE backtest_runs DROP COLUMN win_rate');
      await run('ALTER TABLE backtest_runs DROP COLUMN profit_factor');
    },
  },
  {
    id: 15,
    name: 'add_backtest_market_distribution_columns',
    up: async (db: Database) => {
      const run = (sql: string): Promise<void> =>
        new Promise((resolve, reject) => {
          db.run(sql, (err) => {
            if (err) reject(err);
            else resolve();
          });
        });

      await run('ALTER TABLE backtest_runs ADD COLUMN market_median_return REAL');
      await run('ALTER TABLE backtest_runs ADD COLUMN market_return_std_dev REAL');

      logger.info('Added market_median_return and market_return_std_dev columns to backtest_runs');
    },
    down: async (db: Database) => {
      const run = (sql: string): Promise<void> =>
        new Promise((resolve, reject) => {
          db.run(sql, (err) => {
            if (err) reject(err);
            else resolve();
          });
        });

      await run('ALTER TABLE backtest_runs DROP COLUMN market_median_return');
      await run('ALTER TABLE backtest_runs DROP COLUMN market_return_std_dev');
    },
  },
  {
    id: 16,
    name: 'backfill_card_mapping_rarity_from_catalog',
    up: async (db: Database) => {
      await new Promise<void>((resolve, reject) => {
        db.run(
          `UPDATE card_mappings
           SET rarity = (
             SELECT cc.rarity FROM catalog_cards cc
             WHERE cc.cardId = card_mappings.cardId
               AND cc.rarity IS NOT NULL AND TRIM(cc.rarity) <> ''
             LIMIT 1
           )
           WHERE (rarity IS NULL OR TRIM(rarity) = '')
             AND EXISTS (
               SELECT 1 FROM catalog_cards cc
               WHERE cc.cardId = card_mappings.cardId
                 AND cc.rarity IS NOT NULL AND TRIM(cc.rarity) <> ''
             )`,
          function (err) {
            if (err) {
              reject(err);
              return;
            }
            logger.info(`Backfilled rarity on ${this.changes} card_mappings rows from catalog_cards`);
            resolve();
          }
        );
      });
    },
    down: async (_db: Database) => {
      logger.info('Skipping rarity backfill rollback');
    },
  },
  {
    id: 17,
    name: 'add_long_term_prediction_columns',
    up: async (db: Database) => {
      const run = (sql: string): Promise<void> =>
        new Promise((resolve, reject) => {
          db.run(sql, (err) => {
            if (err && !err.message.includes('duplicate column')) reject(err);
            else resolve();
          });
        });

      const predictionColumns = [
        'ALTER TABLE card_predictions ADD COLUMN predicted_180d_low REAL',
        'ALTER TABLE card_predictions ADD COLUMN predicted_180d_mid REAL',
        'ALTER TABLE card_predictions ADD COLUMN predicted_180d_high REAL',
        'ALTER TABLE card_predictions ADD COLUMN predicted_365d_low REAL',
        'ALTER TABLE card_predictions ADD COLUMN predicted_365d_mid REAL',
        'ALTER TABLE card_predictions ADD COLUMN predicted_365d_high REAL',
        'ALTER TABLE card_predictions ADD COLUMN expected_180d_return REAL',
        'ALTER TABLE card_predictions ADD COLUMN expected_365d_return REAL',
      ];

      const resultColumns = [
        'ALTER TABLE prediction_results ADD COLUMN actual_180d_price REAL',
        'ALTER TABLE prediction_results ADD COLUMN actual_180d_return REAL',
        'ALTER TABLE prediction_results ADD COLUMN actual_365d_price REAL',
        'ALTER TABLE prediction_results ADD COLUMN actual_365d_return REAL',
        'ALTER TABLE prediction_results ADD COLUMN error_180d REAL',
        'ALTER TABLE prediction_results ADD COLUMN error_365d REAL',
        'ALTER TABLE prediction_results ADD COLUMN direction_correct_180d INTEGER DEFAULT 0',
        'ALTER TABLE prediction_results ADD COLUMN direction_correct_365d INTEGER DEFAULT 0',
      ];

      for (const sql of [...predictionColumns, ...resultColumns]) {
        await run(sql);
      }

      logger.info('Added 180d/365d prediction columns to card_predictions and prediction_results');
    },
    down: async (_db: Database) => {
      logger.info('Skipping rollback of long-term prediction columns (SQLite limitation)');
    },
  },
  {
    id: 18,
    name: 'add_external_signal_scraper_columns',
    up: async (db: Database) => {
      const run = (sql: string): Promise<void> =>
        new Promise((resolve, reject) => {
          db.run(sql, (err) => {
            if (err && !err.message.includes('duplicate column')) reject(err);
            else resolve();
          });
        });

      // Signals scraped from external sources often mention a card/set by name
      // before we can resolve a concrete card_id.
      await run('ALTER TABLE external_market_signals ADD COLUMN card_name TEXT');
      await run('ALTER TABLE external_market_signals ADD COLUMN set_name TEXT');

      await run(
        'CREATE INDEX IF NOT EXISTS idx_external_signals_card_source_created ON external_market_signals(card_id, source_type, created_at)'
      );
      await run(
        'CREATE INDEX IF NOT EXISTS idx_external_signals_card_name ON external_market_signals(card_name)'
      );
      await run(
        'CREATE INDEX IF NOT EXISTS idx_external_signals_expires ON external_market_signals(expires_at)'
      );

      logger.info('Added card_name/set_name columns and lookup indexes to external_market_signals');
    },
    down: async (db: Database) => {
      const run = (sql: string): Promise<void> =>
        new Promise((resolve, reject) => {
          db.run(sql, (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
      await run('DROP INDEX IF EXISTS idx_external_signals_card_source_created');
      await run('DROP INDEX IF EXISTS idx_external_signals_card_name');
      await run('DROP INDEX IF EXISTS idx_external_signals_expires');
      logger.info('Dropped external signal scraper indexes (columns retained — SQLite limitation)');
    },
  },
];

// Run pending migrations
export const runMigrations = async (db: Database): Promise<void> => {
  try {
    await createMigrationsTable(db);
    logger.info('Starting database migrations...');

    for (const migration of migrations) {
      const isExecuted = await isMigrationExecuted(db, migration.id);

      if (!isExecuted) {
        logger.info(`Running migration ${migration.id}: ${migration.name}`);
        await migration.up(db);
        await recordMigration(db, migration);
        logger.info(`Migration ${migration.id} completed`);
      } else {
        logger.debug(`Migration ${migration.id} already executed, skipping`);
      }
    }

    logger.info('All migrations completed successfully');
  } catch (error) {
    logger.error('Migration failed', { error });
    throw error;
  }
};

// Rollback last migration
export const rollbackLastMigration = async (db: Database): Promise<void> => {
  try {
    const lastMigration: { id: number; name: string } | undefined = await new Promise(
      (resolve, reject) => {
        db.get(
          'SELECT id, name FROM migrations ORDER BY id DESC LIMIT 1',
          (err, row: any) => {
            if (err) reject(err);
            else resolve(row);
          }
        );
      }
    );

    if (!lastMigration) {
      logger.info('No migrations to rollback');
      return;
    }

    const migration = migrations.find((m) => m.id === lastMigration.id);
    if (!migration) {
      throw new Error(`Migration ${lastMigration.id} not found`);
    }

    logger.info(`Rolling back migration ${migration.id}: ${migration.name}`);
    await migration.down(db);

    await new Promise<void>((resolve, reject) => {
      db.run('DELETE FROM migrations WHERE id = ?', [migration.id], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    logger.info(`Migration ${migration.id} rolled back successfully`);
  } catch (error) {
    logger.error('Rollback failed', { error });
    throw error;
  }
};

