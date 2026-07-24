import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';
import { env } from '../config/env';
import { logger } from '../utils/logger';

const DB_SOURCE = (() => {
  const resolvedPath = path.resolve(env.databasePath);
  const directory = path.dirname(resolvedPath);

  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true });
  }

  return resolvedPath;
})();

export const getDatabasePath = () => DB_SOURCE;

let db: sqlite3.Database;
let dbInitPromise: Promise<void> | null = null;

const runDb = (database: sqlite3.Database, sql: string, params: unknown[] = []): Promise<void> =>
  new Promise((resolve, reject) => {
    database.run(sql, params, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });

export const getDb = () => {
  if (!db) {
    db = new sqlite3.Database(DB_SOURCE, (err) => {
      if (err) {
        logger.error('Failed to open database', { error: err.message });
        throw err;
      }
    });
  }
  return db;
};

export const initializeDatabase = (): Promise<void> => {
  if (dbInitPromise) return dbInitPromise;

  dbInitPromise = (async () => {
    const database = getDb();

    await runDb(database, 'PRAGMA journal_mode = WAL');
    await runDb(database, 'PRAGMA foreign_keys = ON');
    await runDb(database, 'PRAGMA busy_timeout = 5000');

    const tables = [
      `CREATE TABLE IF NOT EXISTS card_mappings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cardId TEXT NOT NULL,
        productId INTEGER,
        cardName TEXT NOT NULL,
        setId TEXT NOT NULL,
        setName TEXT NOT NULL,
        cardNumber TEXT,
        rarity TEXT,
        variantKey TEXT DEFAULT 'normal',
        tcgplayerProductId TEXT,
        uniqueIdentifier TEXT NOT NULL UNIQUE,
        createdAt TEXT DEFAULT (datetime('now')),
        updatedAt TEXT DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE IF NOT EXISTS price_history (
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
      )`,
      `CREATE TABLE IF NOT EXISTS price_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT,
        totalCards INTEGER,
        avgPrice REAL,
        medianPrice REAL,
        totalVolume INTEGER,
        topGainers TEXT,
        topLosers TEXT,
        createdAt TEXT DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE IF NOT EXISTS pokemon_cache (
        cacheKey TEXT PRIMARY KEY,
        query TEXT,
        setId TEXT,
        pageSize INTEGER,
        fetchAll INTEGER,
        maxPages INTEGER,
        data TEXT NOT NULL,
        totalCount INTEGER,
        pagesFetched INTEGER,
        fetchedAt INTEGER
      )`,
      `CREATE TABLE IF NOT EXISTS sync_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        runType TEXT NOT NULL,
        runDate TEXT,
        status TEXT NOT NULL,
        totalPricesProcessed INTEGER DEFAULT 0,
        groupsProcessed INTEGER DEFAULT 0,
        groupsFailed INTEGER DEFAULT 0,
        message TEXT,
        startedAt TEXT DEFAULT (datetime('now')),
        completedAt TEXT
      )`,
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
      `CREATE TABLE IF NOT EXISTS population_cache (
        cacheKey TEXT PRIMARY KEY,
        payload TEXT NOT NULL,
        fetchedAt INTEGER NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS prediction_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        created_at TEXT DEFAULT (datetime('now')),
        model_version TEXT NOT NULL DEFAULT '1.0.0',
        notes TEXT
      )`,
      `CREATE TABLE IF NOT EXISTS card_predictions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id INTEGER NOT NULL,
        card_id TEXT NOT NULL,
        prediction_date TEXT NOT NULL,
        current_price REAL,
        predicted_7d_low REAL,
        predicted_7d_mid REAL,
        predicted_7d_high REAL,
        predicted_30d_low REAL,
        predicted_30d_mid REAL,
        predicted_30d_high REAL,
        predicted_90d_low REAL,
        predicted_90d_mid REAL,
        predicted_90d_high REAL,
        predicted_180d_low REAL,
        predicted_180d_mid REAL,
        predicted_180d_high REAL,
        predicted_365d_low REAL,
        predicted_365d_mid REAL,
        predicted_365d_high REAL,
        expected_7d_return REAL,
        expected_30d_return REAL,
        expected_90d_return REAL,
        expected_180d_return REAL,
        expected_365d_return REAL,
        confidence_score INTEGER DEFAULT 0,
        risk_score INTEGER DEFAULT 0,
        category TEXT,
        suggested_action TEXT,
        explanation TEXT,
        risk_factors TEXT,
        external_signals_json TEXT,
        model_version TEXT DEFAULT '1.0.0',
        UNIQUE(run_id, card_id),
        FOREIGN KEY (run_id) REFERENCES prediction_runs(id) ON DELETE CASCADE
      )`,
      `CREATE TABLE IF NOT EXISTS prediction_results (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        prediction_id INTEGER NOT NULL UNIQUE,
        actual_7d_price REAL,
        actual_30d_price REAL,
        actual_90d_price REAL,
        actual_180d_price REAL,
        actual_365d_price REAL,
        actual_7d_return REAL,
        actual_30d_return REAL,
        actual_90d_return REAL,
        actual_180d_return REAL,
        actual_365d_return REAL,
        error_7d REAL,
        error_30d REAL,
        error_90d REAL,
        error_180d REAL,
        error_365d REAL,
        direction_correct_7d INTEGER DEFAULT 0,
        direction_correct_30d INTEGER DEFAULT 0,
        direction_correct_90d INTEGER DEFAULT 0,
        direction_correct_180d INTEGER DEFAULT 0,
        direction_correct_365d INTEGER DEFAULT 0,
        status TEXT DEFAULT 'pending',
        FOREIGN KEY (prediction_id) REFERENCES card_predictions(id) ON DELETE CASCADE
      )`,
      `CREATE TABLE IF NOT EXISTS graded_prices (
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
      )`,
      `CREATE TABLE IF NOT EXISTS external_market_signals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        card_id TEXT,
        source_url TEXT,
        source_type TEXT,
        title TEXT,
        summary TEXT,
        sentiment_score INTEGER DEFAULT 0,
        relevance_score INTEGER DEFAULT 0,
        risk_type TEXT,
        card_name TEXT,
        set_name TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        expires_at TEXT
      )`,
      `CREATE TABLE IF NOT EXISTS backtest_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        backtest_date TEXT NOT NULL,
        window_days INTEGER DEFAULT 90,
        cards_tested INTEGER DEFAULT 0,
        directional_accuracy REAL,
        mape REAL,
        top10_avg_return REAL,
        market_avg_return REAL,
        strong_buy_false_positive_rate REAL,
        avoid_avg_return REAL,
        category_performance TEXT,
        sharpe_ratio REAL,
        max_drawdown REAL,
        win_rate REAL,
        profit_factor REAL,
        market_median_return REAL,
        market_return_std_dev REAL,
        created_at TEXT DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE IF NOT EXISTS binders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        name TEXT NOT NULL DEFAULT 'My Binder',
        game TEXT NOT NULL DEFAULT 'pokemon',
        pages INTEGER NOT NULL DEFAULT 1,
        slots_per_page INTEGER NOT NULL DEFAULT 9,
        theme_description TEXT,
        budget_cents INTEGER,
        constraints_json TEXT,
        total_cost_cents INTEGER,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )`,
      `CREATE TABLE IF NOT EXISTS binder_slots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        binder_id INTEGER NOT NULL,
        page_number INTEGER NOT NULL DEFAULT 1,
        slot_position INTEGER NOT NULL,
        card_id TEXT NOT NULL,
        card_snapshot TEXT,
        market_price_cents INTEGER,
        notes TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (binder_id) REFERENCES binders(id) ON DELETE CASCADE,
        UNIQUE(binder_id, page_number, slot_position)
      )`,
      `CREATE TABLE IF NOT EXISTS onepiece_catalog (
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
      )`,
      `CREATE TABLE IF NOT EXISTS onepiece_price_history (
        catalogId TEXT NOT NULL,
        date TEXT NOT NULL,
        marketPrice REAL,
        inventoryPrice REAL,
        source TEXT NOT NULL DEFAULT 'optcg',
        PRIMARY KEY (catalogId, date, source)
      )`,
    ];

    for (let i = 0; i < tables.length; i++) {
      await runDb(database, tables[i]);
      logger.info(`Database table ${i + 1} created successfully.`);
    }

    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_price_history_date ON price_history(date)',
      'CREATE INDEX IF NOT EXISTS idx_price_history_product ON price_history(productId)',
      'CREATE INDEX IF NOT EXISTS idx_price_history_identifier ON price_history(uniqueIdentifier)',
      'CREATE INDEX IF NOT EXISTS idx_card_mappings_identifier ON card_mappings(uniqueIdentifier)',
      'CREATE INDEX IF NOT EXISTS idx_card_mappings_card_id ON card_mappings(cardId)',
      'CREATE INDEX IF NOT EXISTS idx_card_mappings_card_set ON card_mappings(cardName, setId, cardNumber)',
      'CREATE INDEX IF NOT EXISTS idx_card_mappings_variant ON card_mappings(variantKey)',
      'CREATE INDEX IF NOT EXISTS idx_pokemon_cache_fetched_at ON pokemon_cache(fetchedAt)',
      'CREATE INDEX IF NOT EXISTS idx_catalog_cards_name ON catalog_cards(cardName)',
      'CREATE INDEX IF NOT EXISTS idx_catalog_cards_set ON catalog_cards(setId, setName)',
      'CREATE INDEX IF NOT EXISTS idx_catalog_cards_tcgplayer_product ON catalog_cards(tcgplayerProductId)',
      'CREATE INDEX IF NOT EXISTS idx_sync_runs_type_date ON sync_runs(runType, runDate)',
      'CREATE INDEX IF NOT EXISTS idx_sync_runs_status ON sync_runs(status)',
      'CREATE INDEX IF NOT EXISTS idx_population_cache_fetched_at ON population_cache(fetchedAt)',
      'CREATE INDEX IF NOT EXISTS idx_prediction_runs_date ON prediction_runs(created_at)',
      'CREATE INDEX IF NOT EXISTS idx_card_predictions_run ON card_predictions(run_id)',
      'CREATE INDEX IF NOT EXISTS idx_card_predictions_run_return ON card_predictions(run_id, expected_90d_return DESC)',
      'CREATE INDEX IF NOT EXISTS idx_card_predictions_card ON card_predictions(card_id)',
      'CREATE INDEX IF NOT EXISTS idx_card_predictions_category ON card_predictions(category)',
      'CREATE INDEX IF NOT EXISTS idx_prediction_results_status ON prediction_results(status)',
      'CREATE INDEX IF NOT EXISTS idx_prediction_results_prediction ON prediction_results(prediction_id)',
      'CREATE INDEX IF NOT EXISTS idx_external_signals_card ON external_market_signals(card_id)',
      'CREATE INDEX IF NOT EXISTS idx_external_signals_card_source_created ON external_market_signals(card_id, source_type, created_at)',
      'CREATE INDEX IF NOT EXISTS idx_external_signals_card_name ON external_market_signals(card_name)',
      'CREATE INDEX IF NOT EXISTS idx_external_signals_expires ON external_market_signals(expires_at)',
      'CREATE INDEX IF NOT EXISTS idx_backtest_runs_date ON backtest_runs(created_at)',
      'CREATE INDEX IF NOT EXISTS idx_onepiece_catalog_name ON onepiece_catalog(cardName)',
      'CREATE INDEX IF NOT EXISTS idx_onepiece_catalog_set ON onepiece_catalog(setId, setName)',
      'CREATE INDEX IF NOT EXISTS idx_onepiece_catalog_card_set_id ON onepiece_catalog(cardSetId)',
      'CREATE INDEX IF NOT EXISTS idx_onepiece_price_history_card ON onepiece_price_history(catalogId)',
      'CREATE INDEX IF NOT EXISTS idx_onepiece_price_history_date ON onepiece_price_history(date)',
      'CREATE INDEX IF NOT EXISTS idx_binders_user ON binders(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_binder_slots_binder ON binder_slots(binder_id)',
      'CREATE INDEX IF NOT EXISTS idx_binder_slots_card ON binder_slots(card_id)',
      'CREATE INDEX IF NOT EXISTS idx_graded_prices_card ON graded_prices(cardId)',
      'CREATE INDEX IF NOT EXISTS idx_graded_prices_grader ON graded_prices(grader, grade)',
    ];

    for (const indexSql of indexes) {
      await runDb(database, indexSql);
    }

    logger.info('All database tables and indexes ready.');
    logger.info(`Using database at ${DB_SOURCE}`);

    setTimeout(() => {
      database.run('PRAGMA auto_vacuum = INCREMENTAL', (vacuumErr) => {
        if (vacuumErr) {
          logger.error('Failed to set auto_vacuum mode:', { error: vacuumErr.message });
        } else {
          database.run('PRAGMA incremental_vacuum(100)', () => {});
        }
      });
    }, 10000);

    setInterval(() => {
      database.run('PRAGMA wal_checkpoint(TRUNCATE)', (err) => {
        if (err) {
          logger.warn('WAL checkpoint failed', { error: err.message });
        }
      });
    }, 30 * 60 * 1000);
  })();

  return dbInitPromise;
};
