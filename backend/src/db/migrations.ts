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

