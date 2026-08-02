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
  {
    id: 19,
    name: 'create_grading_results_table',
    up: async (db: Database) => {
      const run = (sql: string): Promise<void> =>
        new Promise((resolve, reject) => {
          db.run(sql, (err) => {
            if (err) reject(err);
            else resolve();
          });
        });

      await run(`
        CREATE TABLE IF NOT EXISTS grading_results (
          id TEXT PRIMARY KEY,
          user_id TEXT,
          card_id TEXT,
          card_name TEXT NOT NULL,
          game TEXT NOT NULL DEFAULT 'pokemon',
          centering_score INTEGER NOT NULL,
          corners_score INTEGER NOT NULL,
          edges_score INTEGER NOT NULL,
          surface_score INTEGER NOT NULL,
          total_score INTEGER NOT NULL,
          grade REAL NOT NULL,
          grade_label TEXT NOT NULL,
          defects TEXT,
          image_url TEXT,
          estimated_value REAL,
          centering_details TEXT,
          corners_details TEXT,
          edges_details TEXT,
          surface_details TEXT,
          deviations TEXT,
          suggested_condition TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
      `);
      await run('CREATE INDEX IF NOT EXISTS idx_grading_results_card ON grading_results(card_id)');
      await run('CREATE INDEX IF NOT EXISTS idx_grading_results_user ON grading_results(user_id)');
      await run('CREATE INDEX IF NOT EXISTS idx_grading_results_created ON grading_results(created_at)');
      logger.info('Created grading_results table');
    },
    down: async (db: Database) => {
      return new Promise((resolve, reject) => {
        db.run('DROP TABLE IF EXISTS grading_results', (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    },
  },
  {
    id: 20,
    name: 'add_defect_regions_to_grading',
    up: async (db: Database) => {
      const run = (sql: string): Promise<void> =>
        new Promise((resolve, reject) => {
          db.run(sql, (err) => {
            if (err) reject(err);
            else resolve();
          });
        });

      // Add defect_regions column if it doesn't exist
      await run(`
        ALTER TABLE grading_results ADD COLUMN defect_regions TEXT
      `).catch(() => {
        // Column may already exist
      });
      logger.info('Added defect_regions column to grading_results');
    },
    down: async (db: Database) => {
      // SQLite doesn't support DROP COLUMN before 3.35.0, so we skip rollback
      logger.info('Skipping defect_regions rollback (SQLite limitation)');
    },
  },
  {
    id: 21,
    name: 'add_full_result_and_back_image_to_grading',
    up: async (db: Database) => {
      const run = (sql: string): Promise<void> =>
        new Promise((resolve, reject) => {
          db.run(sql, (err) => {
            if (err) reject(err);
            else resolve();
          });
        });

      await run(`ALTER TABLE grading_results ADD COLUMN full_result TEXT`).catch(() => {});
      await run(`ALTER TABLE grading_results ADD COLUMN back_image_url TEXT`).catch(() => {});
      logger.info('Added full_result and back_image_url columns to grading_results');
    },
    down: async (db: Database) => {
      logger.info('Skipping full_result/back_image_url rollback (SQLite limitation)');
    },
  },
  {
    id: 23,
    name: 'add_calibration_tables_and_backtest_metrics',
    up: async (db: Database) => {
      const run = (sql: string): Promise<void> =>
        new Promise((resolve, reject) => {
          db.run(sql, (err) => {
            if (err && !err.message.includes('duplicate column')) reject(err);
            else resolve();
          });
        });

      await run(`CREATE TABLE IF NOT EXISTS calibration_samples (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        horizon INTEGER NOT NULL,
        card_id TEXT NOT NULL,
        run_id INTEGER,
        signal_score REAL NOT NULL,
        predicted_return REAL NOT NULL,
        actual_return REAL NOT NULL,
        source TEXT NOT NULL DEFAULT 'forward_test',
        prediction_date TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      )`);
      await run(
        'CREATE INDEX IF NOT EXISTS idx_calibration_samples_horizon ON calibration_samples(horizon)'
      );
      await run(
        'CREATE UNIQUE INDEX IF NOT EXISTS uq_calibration_samples ON calibration_samples(horizon, card_id, source, prediction_date)'
      );
      await run(
        'CREATE INDEX IF NOT EXISTS idx_calibration_samples_prediction_date ON calibration_samples(prediction_date)'
      );

      await run(`CREATE TABLE IF NOT EXISTS calibration_model (
        horizon INTEGER PRIMARY KEY,
        model_json TEXT NOT NULL,
        sample_count INTEGER NOT NULL DEFAULT 0,
        built_at TEXT NOT NULL
      )`);

      const backtestColumns = [
        'ALTER TABLE backtest_runs ADD COLUMN rank_ic REAL',
        'ALTER TABLE backtest_runs ADD COLUMN mean_bias REAL',
        'ALTER TABLE backtest_runs ADD COLUMN baseline_avg_return REAL',
        'ALTER TABLE backtest_runs ADD COLUMN hit_rate REAL',
        'ALTER TABLE card_predictions ADD COLUMN signal_score REAL',
      ];
      for (const sql of backtestColumns) {
        await run(sql);
      }

      logger.info('Created calibration_samples/calibration_model tables and added backtest metrics columns');
    },
    down: async (_db: Database) => {
      logger.info('Skipping calibration table rollback (SQLite limitation)');
    },
  },
  {
    id: 22,
    name: 'add_prediction_variant_identity',
    up: async (db: Database) => {
      const run = (sql: string): Promise<void> =>
        new Promise((resolve, reject) => {
          db.run(sql, (err) => {
            if (err && !err.message.includes('duplicate column')) reject(err);
            else resolve();
          });
        });

      // Persist which finish/UID was scored so insights UI opens the tracked
      // series instead of MIN(productId) → sparse "normal" fallbacks.
      await run('ALTER TABLE card_predictions ADD COLUMN unique_identifier TEXT');
      await run('ALTER TABLE card_predictions ADD COLUMN variant_key TEXT');
      await run(
        'CREATE INDEX IF NOT EXISTS idx_card_predictions_uid ON card_predictions(unique_identifier)'
      );

      logger.info('Added unique_identifier/variant_key to card_predictions');
    },
    down: async (_db: Database) => {
      logger.info('Skipping prediction variant identity rollback (SQLite limitation)');
    },
  },
  {
    id: 24,
    name: 'data_integrity_and_platform_features',
    up: async (db: Database) => {
      const run = (sql: string, params: unknown[] = []): Promise<void> =>
        new Promise((resolve, reject) => {
          db.run(sql, params, (err) => {
            if (err && !String(err.message).includes('duplicate column')) reject(err);
            else resolve();
          });
        });

      const get = <T>(sql: string, params: unknown[] = []): Promise<T | undefined> =>
        new Promise((resolve, reject) => {
          db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row as T | undefined)));
        });

      const columnExists = async (table: string, column: string): Promise<boolean> => {
        const row = await get<{ name: string }>(
          `SELECT name FROM pragma_table_info('${table}') WHERE name = ?`,
          [column]
        );
        return !!row;
      };

      const indexExists = async (name: string): Promise<boolean> => {
        const row = await get<{ name: string }>(
          `SELECT name FROM sqlite_master WHERE type='index' AND name = ?`,
          [name]
        );
        return !!row;
      };

      // --- 1. signal_score on card_predictions (migration 23 may have been skipped on live) ---
      if (!(await columnExists('card_predictions', 'signal_score'))) {
        await run('ALTER TABLE card_predictions ADD COLUMN signal_score REAL');
        logger.info('Added signal_score to card_predictions');
      }

      // --- 2. Deduplicate calibration_samples then enforce unique index ---
      const calCount = await get<{ n: number }>('SELECT COUNT(*) AS n FROM calibration_samples');
      const calDistinct = await get<{ n: number }>(
        `SELECT COUNT(*) AS n FROM (
           SELECT 1 FROM calibration_samples
           GROUP BY horizon, card_id, source, COALESCE(prediction_date, '')
         )`
      );
      if ((calCount?.n ?? 0) > (calDistinct?.n ?? 0)) {
        logger.info('Deduplicating calibration_samples', {
          before: calCount?.n,
          distinct: calDistinct?.n,
        });
        await run(`CREATE TABLE calibration_samples_deduped (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          horizon INTEGER NOT NULL,
          card_id TEXT NOT NULL,
          run_id INTEGER,
          signal_score REAL NOT NULL,
          predicted_return REAL NOT NULL,
          actual_return REAL NOT NULL,
          source TEXT NOT NULL DEFAULT 'forward_test',
          prediction_date TEXT,
          created_at TEXT DEFAULT (datetime('now'))
        )`);
        await run(`INSERT INTO calibration_samples_deduped
          (horizon, card_id, run_id, signal_score, predicted_return, actual_return, source, prediction_date, created_at)
          SELECT horizon, card_id, MAX(run_id), AVG(signal_score), AVG(predicted_return), AVG(actual_return),
                 source, prediction_date, MIN(created_at)
          FROM calibration_samples
          GROUP BY horizon, card_id, source, COALESCE(prediction_date, '')`);
        await run('DROP TABLE calibration_samples');
        await run('ALTER TABLE calibration_samples_deduped RENAME TO calibration_samples');
        await run(
          'CREATE INDEX IF NOT EXISTS idx_calibration_samples_horizon ON calibration_samples(horizon)'
        );
        await run(
          'CREATE INDEX IF NOT EXISTS idx_calibration_samples_prediction_date ON calibration_samples(prediction_date)'
        );
        const after = await get<{ n: number }>('SELECT COUNT(*) AS n FROM calibration_samples');
        logger.info('calibration_samples deduped', { after: after?.n });
      }

      if (!(await indexExists('uq_calibration_samples'))) {
        await run(
          'CREATE UNIQUE INDEX IF NOT EXISTS uq_calibration_samples ON calibration_samples(horizon, card_id, source, prediction_date)'
        );
        logger.info('Created uq_calibration_samples');
      }

      // --- 3. Backfill prediction identity from card_mappings ---
      await run(`UPDATE card_predictions
        SET unique_identifier = (
          SELECT cm.uniqueIdentifier FROM card_mappings cm
          WHERE cm.cardId = card_predictions.card_id
          ORDER BY CASE
            WHEN cm.variantKey IS NULL OR cm.variantKey IN ('normal', 'Normal', '') THEN 0
            ELSE 1
          END, cm.uniqueIdentifier
          LIMIT 1
        )
        WHERE unique_identifier IS NULL OR unique_identifier = ''`);

      await run(`UPDATE card_predictions
        SET variant_key = (
          SELECT cm.variantKey FROM card_mappings cm
          WHERE cm.uniqueIdentifier = card_predictions.unique_identifier
          LIMIT 1
        )
        WHERE (variant_key IS NULL OR variant_key = '')
          AND unique_identifier IS NOT NULL AND unique_identifier <> ''`);

      // Normalize remaining nulls so UNIQUE works (SQLite allows multiple NULLs).
      await run(
        `UPDATE card_predictions SET unique_identifier = '' WHERE unique_identifier IS NULL`
      );

      // --- 4. Deduplicate card_predictions per (run_id, card_id, unique_identifier) ---
      await run(`DELETE FROM prediction_results
        WHERE prediction_id IN (
          SELECT cp.id FROM card_predictions cp
          WHERE cp.id NOT IN (
            SELECT MAX(id) FROM card_predictions
            GROUP BY run_id, card_id, COALESCE(unique_identifier, '')
          )
        )`);
      await run(`DELETE FROM card_predictions
        WHERE id NOT IN (
          SELECT MAX(id) FROM card_predictions
          GROUP BY run_id, card_id, COALESCE(unique_identifier, '')
        )`);

      if (!(await indexExists('uq_card_predictions_run_card_uid'))) {
        await run(
          `CREATE UNIQUE INDEX IF NOT EXISTS uq_card_predictions_run_card_uid
           ON card_predictions(run_id, card_id, unique_identifier)`
        );
      }

      // --- 5. Drop unused snake_case image columns if present ---
      if (await columnExists('card_mappings', 'image_small')) {
        try {
          await run('ALTER TABLE card_mappings DROP COLUMN image_small');
          await run('ALTER TABLE card_mappings DROP COLUMN image_large');
          logger.info('Dropped unused image_small/image_large columns');
        } catch (err) {
          logger.warn('Could not drop legacy image columns (SQLite version?)', { error: err });
        }
      }

      // --- 6. Canonical price series ---
      await run(`CREATE TABLE IF NOT EXISTS canonical_price_history (
        uniqueIdentifier TEXT NOT NULL,
        date TEXT NOT NULL,
        price REAL NOT NULL,
        marketPrice REAL,
        lowPrice REAL,
        highPrice REAL,
        volume INTEGER,
        source TEXT NOT NULL,
        productName TEXT,
        groupName TEXT,
        updatedAt TEXT DEFAULT (datetime('now')),
        PRIMARY KEY (uniqueIdentifier, date)
      )`);
      await run(
        'CREATE INDEX IF NOT EXISTS idx_canonical_price_date ON canonical_price_history(date)'
      );

      // --- 7. Data quality checks ---
      await run(`CREATE TABLE IF NOT EXISTS data_quality_checks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        check_name TEXT NOT NULL,
        severity TEXT NOT NULL,
        status TEXT NOT NULL,
        metric_value REAL,
        threshold REAL,
        details_json TEXT,
        checked_at TEXT DEFAULT (datetime('now'))
      )`);
      await run(
        'CREATE INDEX IF NOT EXISTS idx_data_quality_checked ON data_quality_checks(checked_at)'
      );

      // --- 8. Server watchlists / wishlist / tracked ---
      await run(`CREATE TABLE IF NOT EXISTS user_watchlists (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        card_id TEXT NOT NULL,
        card_name TEXT NOT NULL,
        game TEXT NOT NULL DEFAULT 'pokemon',
        list_type TEXT NOT NULL CHECK(list_type IN ('watchlist', 'wishlist', 'tracked')),
        priority TEXT,
        target_price REAL,
        notes TEXT,
        card_data TEXT,
        client_id TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, card_id, list_type, game),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )`);
      await run(
        'CREATE INDEX IF NOT EXISTS idx_user_watchlists_user ON user_watchlists(user_id)'
      );

      // --- 9. Portfolio lots for P&L ---
      await run(`CREATE TABLE IF NOT EXISTS portfolio_lots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        collection_id INTEGER,
        card_id TEXT NOT NULL,
        card_name TEXT NOT NULL,
        quantity INTEGER NOT NULL DEFAULT 1,
        cost_basis REAL NOT NULL DEFAULT 0,
        acquired_at TEXT,
        sold_at TEXT,
        sale_price REAL,
        realized_pnl REAL,
        condition TEXT,
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (collection_id) REFERENCES user_collections(id) ON DELETE SET NULL
      )`);
      await run(
        'CREATE INDEX IF NOT EXISTS idx_portfolio_lots_user ON portfolio_lots(user_id)'
      );

      // --- 10. Richer alerts ---
      if (!(await columnExists('price_alerts', 'alert_type'))) {
        await run(
          `ALTER TABLE price_alerts ADD COLUMN alert_type TEXT NOT NULL DEFAULT 'price_threshold'`
        );
      }
      if (!(await columnExists('price_alerts', 'threshold_pct'))) {
        await run('ALTER TABLE price_alerts ADD COLUMN threshold_pct REAL');
      }
      if (!(await columnExists('price_alerts', 'baseline_price'))) {
        await run('ALTER TABLE price_alerts ADD COLUMN baseline_price REAL');
      }
      if (!(await columnExists('price_alerts', 'metadata_json'))) {
        await run('ALTER TABLE price_alerts ADD COLUMN metadata_json TEXT');
      }
      // Relax target_price requirement for non-price alerts (keep column nullable-ish via 0 default usage)

      // --- 11. Helpful indexes ---
      await run(
        'CREATE INDEX IF NOT EXISTS idx_prediction_results_status_pred ON prediction_results(status, prediction_id)'
      );
      await run(
        'CREATE INDEX IF NOT EXISTS idx_user_collections_user ON user_collections(user_id)'
      );

      logger.info('Migration 24: data integrity and platform features complete');
    },
    down: async (_db: Database) => {
      logger.info('Skipping migration 24 rollback (destructive / SQLite limitation)');
    },
  },
  {
    id: 25,
    name: 'email_verification',
    up: async (db: Database) => {
      const run = (sql: string, params: unknown[] = []): Promise<void> =>
        new Promise((resolve, reject) => {
          db.run(sql, params, (err) => (err ? reject(err) : resolve()));
        });
      const columnExists = (table: string, column: string): Promise<boolean> =>
        new Promise((resolve, reject) => {
          db.all(`PRAGMA table_info(${table})`, [], (err, rows: Array<{ name: string }>) => {
            if (err) return reject(err);
            resolve((rows || []).some((r) => r.name === column));
          });
        });

      if (!(await columnExists('users', 'email_verified'))) {
        await run('ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0');
        // Existing accounts stay usable
        await run('UPDATE users SET email_verified = 1');
      }
      if (!(await columnExists('users', 'email_verification_token'))) {
        await run('ALTER TABLE users ADD COLUMN email_verification_token TEXT');
      }
      if (!(await columnExists('users', 'email_verification_expires'))) {
        await run('ALTER TABLE users ADD COLUMN email_verification_expires TEXT');
      }
      await run(
        'CREATE INDEX IF NOT EXISTS idx_users_verification_token ON users(email_verification_token)'
      );
      logger.info('Migration 25: email verification columns added');
    },
    down: async (_db: Database) => {
      logger.info('Skipping migration 25 rollback (SQLite limitation)');
    },
  },
  {
    id: 26,
    name: 'graded_data_verification_and_refresh',
    up: async (db: Database) => {
      const run = (sql: string, params: unknown[] = []): Promise<void> =>
        new Promise((resolve, reject) => {
          db.run(sql, params, (err) => (err ? reject(err) : resolve()));
        });
      const columnExists = (table: string, column: string): Promise<boolean> =>
        new Promise((resolve, reject) => {
          db.all(`PRAGMA table_info(${table})`, [], (err, rows: Array<{ name: string }>) => {
            if (err) return reject(err);
            resolve((rows || []).some((r) => r.name === column));
          });
        });

      // Track where each graded price came from and whether the product was verified.
      if (!(await columnExists('graded_prices', 'productId'))) {
        await run('ALTER TABLE graded_prices ADD COLUMN productId TEXT');
      }
      if (!(await columnExists('graded_prices', 'matchScore'))) {
        await run('ALTER TABLE graded_prices ADD COLUMN matchScore REAL');
      }
      if (!(await columnExists('graded_prices', 'verified'))) {
        await run('ALTER TABLE graded_prices ADD COLUMN verified INTEGER DEFAULT 0');
      }
      if (!(await columnExists('graded_prices', 'sourceUrl'))) {
        await run('ALTER TABLE graded_prices ADD COLUMN sourceUrl TEXT');
      }
      await run('CREATE INDEX IF NOT EXISTS idx_graded_prices_verified ON graded_prices(verified)');

      // population_cache gets a cardId column so scarcity scoring can look up by card.
      if (!(await columnExists('population_cache', 'cardId'))) {
        await run('ALTER TABLE population_cache ADD COLUMN cardId TEXT');
      }
      await run('CREATE INDEX IF NOT EXISTS idx_population_cache_cardId ON population_cache(cardId)');

      // Nightly refresh queue: which cards users actually looked at.
      await run(`CREATE TABLE IF NOT EXISTS graded_refresh_queue (
        cardId TEXT PRIMARY KEY,
        cardName TEXT NOT NULL,
        setId TEXT,
        setName TEXT,
        cardNumber TEXT,
        lastRequestedAt INTEGER NOT NULL,
        lastRefreshedAt INTEGER
      )`);

      // Purge + rebuild: generic "Grade N" rows are a condition legend, not real
      // company slab prices; legacy Apify population payloads were fabricated.
      await run(`DELETE FROM graded_prices WHERE grader = 'generic'`);
      await run(`DELETE FROM graded_prices WHERE fetchedAt < datetime('now', '-12 hours')`);
      await run('DELETE FROM population_cache');

      logger.info('Migration 26: graded data verification columns + purge complete');
    },
    down: async (_db: Database) => {
      logger.info('Skipping migration 26 rollback (SQLite limitation)');
    },
  },
  {
    id: 27,
    name: 'pc_set_mappings',
    up: async (db: Database) => {
      const run = (sql: string, params: unknown[] = []): Promise<void> =>
        new Promise((resolve, reject) => {
          db.run(sql, params, (err) => (err ? reject(err) : resolve()));
        });

      // Our setName -> PriceCharting console name, learned from verified matches.
      // Lets the bulk sweep hit product pages directly instead of searching.
      await run(`CREATE TABLE IF NOT EXISTS pc_set_mappings (
        ourSetName TEXT PRIMARY KEY,
        consoleName TEXT NOT NULL,
        learnedAt INTEGER NOT NULL
      )`);

      logger.info('Migration 27: pc_set_mappings table created');
    },
    down: async (_db: Database) => {
      logger.info('Skipping migration 27 rollback (SQLite limitation)');
    },
  },
  {
    id: 28,
    name: 'graded_price_history',
    up: async (db: Database) => {
      const run = (sql: string, params: unknown[] = []): Promise<void> =>
        new Promise((resolve, reject) => {
          db.run(sql, params, (err) => (err ? reject(err) : resolve()));
        });

      // Daily slab price series (mirrors price_history for raw). Live cache stays
      // in graded_prices; this table appends one row per card/grader/grade/day.
      await run(`CREATE TABLE IF NOT EXISTS graded_price_history (
        cardId TEXT NOT NULL,
        date TEXT NOT NULL,
        grader TEXT NOT NULL,
        grade TEXT NOT NULL,
        price REAL,
        soldListings INTEGER DEFAULT 0,
        productId TEXT,
        verified INTEGER DEFAULT 0,
        sourceUrl TEXT,
        source TEXT NOT NULL DEFAULT 'pricecharting',
        PRIMARY KEY (cardId, date, grader, grade)
      )`);
      await run(
        'CREATE INDEX IF NOT EXISTS idx_graded_price_history_card_date ON graded_price_history(cardId, date)'
      );
      await run(
        'CREATE INDEX IF NOT EXISTS idx_graded_price_history_lookup ON graded_price_history(cardId, grader, grade, date)'
      );

      // Seed today's series from the current cache so charts aren't empty on day one.
      await run(`INSERT OR IGNORE INTO graded_price_history
        (cardId, date, grader, grade, price, soldListings, productId, verified, sourceUrl, source)
        SELECT cardId,
               COALESCE(date(fetchedAt), date('now')),
               grader,
               grade,
               price,
               COALESCE(soldListings, 0),
               productId,
               COALESCE(verified, 0),
               sourceUrl,
               'pricecharting'
        FROM graded_prices
        WHERE price IS NOT NULL AND price > 0`);

      logger.info('Migration 28: graded_price_history table created + seeded');
    },
    down: async (db: Database) => {
      const run = (sql: string): Promise<void> =>
        new Promise((resolve, reject) => {
          db.run(sql, (err) => (err ? reject(err) : resolve()));
        });
      await run('DROP TABLE IF EXISTS graded_price_history');
    },
  },
  {
    id: 29,
    name: 'population_history_and_slab_insights',
    up: async (db: Database) => {
      const run = (sql: string, params: unknown[] = []): Promise<void> =>
        new Promise((resolve, reject) => {
          db.run(sql, params, (err) => (err ? reject(err) : resolve()));
        });

      // Daily population snapshots for pop-regime / supply-shock detection.
      await run(`CREATE TABLE IF NOT EXISTS population_history (
        cardId TEXT NOT NULL,
        date TEXT NOT NULL,
        psaTotal INTEGER,
        psa10 INTEGER,
        psa9 INTEGER,
        cgcTotal INTEGER,
        cgc10 INTEGER,
        verified INTEGER DEFAULT 0,
        productId TEXT,
        PRIMARY KEY (cardId, date)
      )`);
      await run(
        'CREATE INDEX IF NOT EXISTS idx_population_history_date ON population_history(date)'
      );
      await run(
        'CREATE INDEX IF NOT EXISTS idx_population_history_psa10 ON population_history(cardId, psa10)'
      );

      // Seed today from latest population_cache payloads so radar isn't empty.
      await run(`INSERT OR IGNORE INTO population_history
        (cardId, date, psaTotal, psa10, psa9, cgcTotal, cgc10, verified, productId)
        SELECT
          cardId,
          date('now'),
          CAST(json_extract(payload, '$.companies.psa.total') AS INTEGER),
          CAST(json_extract(payload, '$.companies.psa.grade10') AS INTEGER),
          CAST(json_extract(payload, '$.companies.psa.grade9') AS INTEGER),
          CAST(json_extract(payload, '$.companies.cgc.total') AS INTEGER),
          CAST(json_extract(payload, '$.companies.cgc.grade10') AS INTEGER),
          COALESCE(CAST(json_extract(payload, '$.verified') AS INTEGER), 0),
          json_extract(payload, '$.productId')
        FROM population_cache
        WHERE cardId IS NOT NULL AND cardId != ''
          AND json_extract(payload, '$.companies.psa.total') IS NOT NULL`);

      logger.info('Migration 29: population_history created + seeded');
    },
    down: async (db: Database) => {
      const run = (sql: string): Promise<void> =>
        new Promise((resolve, reject) => {
          db.run(sql, (err) => (err ? reject(err) : resolve()));
        });
      await run('DROP TABLE IF EXISTS population_history');
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

