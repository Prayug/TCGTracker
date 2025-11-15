import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';
import { env } from '../config/env';

const DB_SOURCE = (() => {
  const resolvedPath = path.resolve(env.databasePath);
  const directory = path.dirname(resolvedPath);

  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true });
  }

  return resolvedPath;
})();

let db: sqlite3.Database;

export const getDb = () => {
  if (!db) {
    db = new sqlite3.Database(DB_SOURCE, (err) => {
      if (err) {
        console.error(err.message);
        throw err;
      }
    });
  }
  return db;
};

export const initializeDatabase = () => {
  const db = getDb();
  
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
      } else {
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
        } else {
          console.log(`Database index ${index + 1} created successfully.`);
        }
      });
    });
  }
};
