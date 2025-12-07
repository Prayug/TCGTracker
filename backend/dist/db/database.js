"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initializeDatabase = exports.getDb = void 0;
const sqlite3_1 = __importDefault(require("sqlite3"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const env_1 = require("../config/env");
const DB_SOURCE = (() => {
    const resolvedPath = path_1.default.resolve(env_1.env.databasePath);
    const directory = path_1.default.dirname(resolvedPath);
    if (!fs_1.default.existsSync(directory)) {
        fs_1.default.mkdirSync(directory, { recursive: true });
    }
    return resolvedPath;
})();
let db;
const getDb = () => {
    if (!db) {
        db = new sqlite3_1.default.Database(DB_SOURCE, (err) => {
            if (err) {
                console.error(err.message);
                throw err;
            }
        });
    }
    return db;
};
exports.getDb = getDb;
const initializeDatabase = () => {
    const db = (0, exports.getDb)();
    // NOTE: No longer dropping tables to preserve collected data
    // Tables will be created only if they don't exist
    // Card mappings table for proper identification
    const createCardMappingsTable = `
    CREATE TABLE IF NOT EXISTS card_mappings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cardId TEXT NOT NULL,
      productId INTEGER,
      cardName TEXT NOT NULL,
      setId TEXT NOT NULL,
      setName TEXT NOT NULL,
      cardNumber TEXT,
      rarity TEXT,
      tcgplayerProductId TEXT,
      uniqueIdentifier TEXT NOT NULL UNIQUE,
      createdAt TEXT DEFAULT (datetime('now')),
      updatedAt TEXT DEFAULT (datetime('now'))
    )
  `;
    // TCGCSV price history table (ONLY SOURCE OF DATA)
    const createPriceHistoryTable = `
    CREATE TABLE IF NOT EXISTS price_history (
      productId INTEGER,
      date TEXT,
      price REAL,
      subTypeName TEXT,
      productName TEXT,
      groupName TEXT,
      source TEXT DEFAULT 'tcgcsv',
      lowPrice REAL,
      highPrice REAL,
      marketPrice REAL,
      volume INTEGER,
      uniqueIdentifier TEXT,
      PRIMARY KEY (productId, date, subTypeName, source)
    )
  `;
    // Historical snapshots for analytics
    const createSnapshotsTable = `
    CREATE TABLE IF NOT EXISTS price_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT,
      totalCards INTEGER,
      avgPrice REAL,
      medianPrice REAL,
      totalVolume INTEGER,
      topGainers TEXT, -- JSON array
      topLosers TEXT,  -- JSON array
      createdAt TEXT DEFAULT (datetime('now'))
    )
  `;
    const createPokemonCacheTable = `
    CREATE TABLE IF NOT EXISTS pokemon_cache (
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
    )
  `;
    // Set mappings are now loaded dynamically from Pokemon TCG API (no database table needed)
    const tables = [
        createCardMappingsTable,
        createPriceHistoryTable,
        createSnapshotsTable,
        createPokemonCacheTable
    ];
    // Create tables sequentially to avoid conflicts
    let tableIndex = 0;
    const createNext = () => {
        if (tableIndex >= tables.length) {
            console.log('All database tables created successfully.');
            createIndexes();
            return;
        }
        const sql = tables[tableIndex];
        db.run(sql, (err) => {
            if (err) {
                console.error(`Error creating table ${tableIndex + 1}:`, err);
            }
            else {
                console.log(`Database table ${tableIndex + 1} created successfully.`);
            }
            tableIndex++;
            createNext();
        });
    };
    // Start creating tables
    createNext(); // No delay needed since we're not dropping tables
    console.log(`Using database at ${DB_SOURCE}`);
    function createIndexes() {
        // Create indexes for better query performance
        const indexes = [
            'CREATE INDEX IF NOT EXISTS idx_price_history_date ON price_history(date)',
            'CREATE INDEX IF NOT EXISTS idx_price_history_product ON price_history(productId)',
            'CREATE INDEX IF NOT EXISTS idx_price_history_identifier ON price_history(uniqueIdentifier)',
            'CREATE INDEX IF NOT EXISTS idx_card_mappings_identifier ON card_mappings(uniqueIdentifier)',
            'CREATE INDEX IF NOT EXISTS idx_card_mappings_card_set ON card_mappings(cardName, setId, cardNumber)',
            'CREATE INDEX IF NOT EXISTS idx_pokemon_cache_fetched_at ON pokemon_cache(fetchedAt)'
        ];
        indexes.forEach((indexSql, index) => {
            db.run(indexSql, (err) => {
                if (err) {
                    console.error(`Error creating index ${index + 1}:`, err);
                }
                else {
                    console.log(`Database index ${index + 1} created successfully.`);
                }
            });
        });
    }
};
exports.initializeDatabase = initializeDatabase;
