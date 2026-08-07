"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sourceRank = void 0;
exports.ensureCanonicalPriceTable = ensureCanonicalPriceTable;
exports.materializeCanonicalPrices = materializeCanonicalPrices;
exports.getLatestCanonicalPrice = getLatestCanonicalPrice;
exports.getLatestCanonicalPriceByCardId = getLatestCanonicalPriceByCardId;
const database_1 = require("../db/database");
const logger_1 = require("../utils/logger");
const topMoversQuality_1 = require("./topMoversQuality");
Object.defineProperty(exports, "sourceRank", { enumerable: true, get: function () { return topMoversQuality_1.sourceRank; } });
const run = (sql, params = []) => new Promise((resolve, reject) => {
    (0, database_1.getDb)().run(sql, params, (err) => (err ? reject(err) : resolve()));
});
const get = (sql, params = []) => new Promise((resolve, reject) => {
    (0, database_1.getDb)().get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
});
/** Ensure table exists (also created by migration 24). */
async function ensureCanonicalPriceTable() {
    await run(`
    CREATE TABLE IF NOT EXISTS canonical_price_history (
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
    )
  `);
    await run('CREATE INDEX IF NOT EXISTS idx_canonical_price_date ON canonical_price_history(date)');
    await run('CREATE INDEX IF NOT EXISTS idx_canonical_price_source ON canonical_price_history(source)');
}
/**
 * Rebuilds canonical prices for recent days (default: last 14) or a full rebuild.
 * Uses CASE source-rank ordering matching SOURCE_PRIORITY.
 */
async function materializeCanonicalPrices(options) {
    var _a, _b, _c;
    await ensureCanonicalPriceTable();
    const db = (0, database_1.getDb)();
    let sinceDate = (_a = options === null || options === void 0 ? void 0 : options.sinceDate) !== null && _a !== void 0 ? _a : null;
    if (!(options === null || options === void 0 ? void 0 : options.fullRebuild) && !sinceDate) {
        const row = await get(`SELECT date(MAX(date), '-13 days') AS d FROM price_history`);
        sinceDate = (_b = row === null || row === void 0 ? void 0 : row.d) !== null && _b !== void 0 ? _b : null;
    }
    const sourceCase = topMoversQuality_1.SOURCE_PRIORITY.map((s, i) => `WHEN '${s}' THEN ${i}`).join(' ');
    const whereClause = sinceDate
        ? `WHERE ph.date >= ? AND ph.source IN ('tcgcsv', 'tcgdex', 'catalog_fallback')`
        : `WHERE ph.source IN ('tcgcsv', 'tcgdex', 'catalog_fallback')`;
    const params = sinceDate ? [sinceDate] : [];
    if (sinceDate) {
        await run(`DELETE FROM canonical_price_history WHERE date >= ?`, [sinceDate]);
    }
    else if (options === null || options === void 0 ? void 0 : options.fullRebuild) {
        await run(`DELETE FROM canonical_price_history`);
    }
    await new Promise((resolve, reject) => {
        db.run(`INSERT OR REPLACE INTO canonical_price_history
         (uniqueIdentifier, date, price, marketPrice, lowPrice, highPrice, volume, source, productName, groupName, updatedAt)
       SELECT
         uniqueIdentifier,
         date,
         COALESCE(marketPrice, price, 0),
         marketPrice,
         lowPrice,
         highPrice,
         volume,
         source,
         productName,
         groupName,
         datetime('now')
       FROM (
         SELECT ph.*,
                ROW_NUMBER() OVER (
                  PARTITION BY ph.uniqueIdentifier, ph.date
                  ORDER BY CASE ph.source ${sourceCase} ELSE ${topMoversQuality_1.SOURCE_PRIORITY.length} END
                ) AS rn
         FROM price_history ph
         ${whereClause}
       )
       WHERE rn = 1 AND COALESCE(marketPrice, price, 0) > 0`, params, (err) => (err ? reject(err) : resolve()));
    });
    const countRow = await get(sinceDate
        ? `SELECT COUNT(*) AS n FROM canonical_price_history WHERE date >= ?`
        : `SELECT COUNT(*) AS n FROM canonical_price_history`, sinceDate ? [sinceDate] : []);
    const upserted = (_c = countRow === null || countRow === void 0 ? void 0 : countRow.n) !== null && _c !== void 0 ? _c : 0;
    logger_1.logger.info('Canonical prices materialized', { upserted, sinceDate, fullRebuild: !!(options === null || options === void 0 ? void 0 : options.fullRebuild) });
    return { upserted, sinceDate };
}
/** Latest canonical price for a UID. */
async function getLatestCanonicalPrice(uniqueIdentifier) {
    await ensureCanonicalPriceTable();
    const row = await get(`SELECT * FROM canonical_price_history
     WHERE uniqueIdentifier = ?
     ORDER BY date DESC LIMIT 1`, [uniqueIdentifier]);
    return row !== null && row !== void 0 ? row : null;
}
/** Latest canonical price by Pokemon cardId (prefers any mapped UID). */
async function getLatestCanonicalPriceByCardId(cardId) {
    await ensureCanonicalPriceTable();
    const row = await get(`SELECT c.price, c.uniqueIdentifier, c.date, c.source
     FROM canonical_price_history c
     INNER JOIN card_mappings cm ON cm.uniqueIdentifier = c.uniqueIdentifier
     WHERE cm.cardId = ?
     ORDER BY c.date DESC,
              CASE c.source ${topMoversQuality_1.SOURCE_PRIORITY.map((s, i) => `WHEN '${s}' THEN ${i}`).join(' ')} ELSE ${topMoversQuality_1.SOURCE_PRIORITY.length} END
     LIMIT 1`, [cardId]);
    return row !== null && row !== void 0 ? row : null;
}
