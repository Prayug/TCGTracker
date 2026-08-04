import { getDb } from '../db/database';
import { logger } from '../utils/logger';
import { SOURCE_PRIORITY, sourceRank } from './topMoversQuality';

/**
 * Materializes one preferred price per (uniqueIdentifier, date) using
 * SOURCE_PRIORITY so movers, predictions, and portfolio P&L share one series.
 */

export interface CanonicalPriceRow {
  uniqueIdentifier: string;
  date: string;
  price: number;
  marketPrice: number | null;
  lowPrice: number | null;
  highPrice: number | null;
  volume: number | null;
  source: string;
  productName: string | null;
  groupName: string | null;
}

const run = (sql: string, params: unknown[] = []): Promise<void> =>
  new Promise((resolve, reject) => {
    getDb().run(sql, params, (err) => (err ? reject(err) : resolve()));
  });

const get = <T>(sql: string, params: unknown[] = []): Promise<T | undefined> =>
  new Promise((resolve, reject) => {
    getDb().get(sql, params, (err, row) => (err ? reject(err) : resolve(row as T | undefined)));
  });

/** Ensure table exists (also created by migration 24). */
export async function ensureCanonicalPriceTable(): Promise<void> {
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
  await run(
    'CREATE INDEX IF NOT EXISTS idx_canonical_price_date ON canonical_price_history(date)'
  );
  await run(
    'CREATE INDEX IF NOT EXISTS idx_canonical_price_source ON canonical_price_history(source)'
  );
}

/**
 * Rebuilds canonical prices for recent days (default: last 14) or a full rebuild.
 * Uses CASE source-rank ordering matching SOURCE_PRIORITY.
 */
export async function materializeCanonicalPrices(options?: {
  sinceDate?: string;
  fullRebuild?: boolean;
}): Promise<{ upserted: number; sinceDate: string | null }> {
  await ensureCanonicalPriceTable();
  const db = getDb();

  let sinceDate = options?.sinceDate ?? null;
  if (!options?.fullRebuild && !sinceDate) {
    const row = await get<{ d: string }>(
      `SELECT date(MAX(date), '-13 days') AS d FROM price_history`
    );
    sinceDate = row?.d ?? null;
  }

  const sourceCase = SOURCE_PRIORITY.map(
    (s, i) => `WHEN '${s}' THEN ${i}`
  ).join(' ');

  const whereClause = sinceDate
    ? `WHERE ph.date >= ? AND ph.source IN ('tcgcsv', 'tcgdex', 'catalog_fallback')`
    : `WHERE ph.source IN ('tcgcsv', 'tcgdex', 'catalog_fallback')`;
  const params = sinceDate ? [sinceDate] : [];

  if (sinceDate) {
    await run(`DELETE FROM canonical_price_history WHERE date >= ?`, [sinceDate]);
  } else if (options?.fullRebuild) {
    await run(`DELETE FROM canonical_price_history`);
  }

  await new Promise<void>((resolve, reject) => {
    db.run(
      `INSERT OR REPLACE INTO canonical_price_history
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
                  ORDER BY CASE ph.source ${sourceCase} ELSE ${SOURCE_PRIORITY.length} END
                ) AS rn
         FROM price_history ph
         ${whereClause}
       )
       WHERE rn = 1 AND COALESCE(marketPrice, price, 0) > 0`,
      params,
      (err) => (err ? reject(err) : resolve())
    );
  });

  const countRow = await get<{ n: number }>(
    sinceDate
      ? `SELECT COUNT(*) AS n FROM canonical_price_history WHERE date >= ?`
      : `SELECT COUNT(*) AS n FROM canonical_price_history`,
    sinceDate ? [sinceDate] : []
  );

  const upserted = countRow?.n ?? 0;
  logger.info('Canonical prices materialized', { upserted, sinceDate, fullRebuild: !!options?.fullRebuild });
  return { upserted, sinceDate };
}

/** Latest canonical price for a UID. */
export async function getLatestCanonicalPrice(
  uniqueIdentifier: string
): Promise<CanonicalPriceRow | null> {
  await ensureCanonicalPriceTable();
  const row = await get<CanonicalPriceRow>(
    `SELECT * FROM canonical_price_history
     WHERE uniqueIdentifier = ?
     ORDER BY date DESC LIMIT 1`,
    [uniqueIdentifier]
  );
  return row ?? null;
}

/** Latest canonical price by Pokemon cardId (prefers any mapped UID). */
export async function getLatestCanonicalPriceByCardId(
  cardId: string
): Promise<{ price: number; uniqueIdentifier: string; date: string; source: string } | null> {
  await ensureCanonicalPriceTable();
  const row = await get<{
    price: number;
    uniqueIdentifier: string;
    date: string;
    source: string;
  }>(
    `SELECT c.price, c.uniqueIdentifier, c.date, c.source
     FROM canonical_price_history c
     INNER JOIN card_mappings cm ON cm.uniqueIdentifier = c.uniqueIdentifier
     WHERE cm.cardId = ?
     ORDER BY c.date DESC,
              CASE c.source ${SOURCE_PRIORITY.map((s, i) => `WHEN '${s}' THEN ${i}`).join(' ')} ELSE ${SOURCE_PRIORITY.length} END
     LIMIT 1`,
    [cardId]
  );
  return row ?? null;
}

export { sourceRank };
