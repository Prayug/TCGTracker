/**
 * Repair catalog snapshot days that stored a TCGplayer ask instead of the market price
 * (see services/askWallSnapshotRepair.ts), then rebuild canonical prices for those days.
 *
 *   npm run repair:ask-wall                     # dry run: counts and a sample, writes nothing
 *   npm run repair:ask-wall -- --apply          # write the repairs
 *   npm run repair:ask-wall -- --from 2026-01-01
 *
 * Every changed row's old price is kept in price_repair_log, so a repair can be undone.
 */
import { initializeDatabase, getDb } from '../db/database';
import { runMigrations } from '../db/migrations';
import { findAskWallRepairs, SnapshotRow } from '../services/askWallSnapshotRepair';
import { materializeCanonicalPrices } from '../services/canonicalPriceService';
import { logger } from '../utils/logger';

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const flag = (name: string) => process.argv.includes(`--${name}`);

const all = <T>(sql: string, params: unknown[] = []): Promise<T[]> =>
  new Promise((resolve, reject) =>
    getDb().all(sql, params, (err, rows) => (err ? reject(err) : resolve((rows || []) as T[])))
  );
const run = (sql: string, params: unknown[] = []): Promise<void> =>
  new Promise((resolve, reject) =>
    getDb().run(sql, params, (err) => (err ? reject(err) : resolve()))
  );

const SOURCE = 'catalog_fallback';

async function main() {
  const from = arg('from') ?? '2026-01-01';
  const apply = flag('apply');

  await initializeDatabase();
  await runMigrations(getDb());

  const rows = await all<SnapshotRow & { uniqueIdentifier: string }>(
    `SELECT uniqueIdentifier, date, price, lowPrice
       FROM price_history
      WHERE source = ? AND date >= ?
      ORDER BY uniqueIdentifier, date`,
    [SOURCE, from]
  );

  const plan: Array<{ uid: string; date: string; from: number; to: number }> = [];
  let start = 0;
  for (let i = 1; i <= rows.length; i++) {
    if (i < rows.length && rows[i].uniqueIdentifier === rows[start].uniqueIdentifier) continue;
    const uid = rows[start].uniqueIdentifier;
    for (const r of findAskWallRepairs(rows.slice(start, i))) plan.push({ uid, ...r });
    start = i;
  }

  const cards = new Set(plan.map((p) => p.uid)).size;
  logger.info('Ask-wall snapshot repair plan', {
    from,
    rowsScanned: rows.length,
    repairs: plan.length,
    cards,
  });
  logger.info('Sample repairs', { sample: plan.slice(0, 20) });

  if (!apply || plan.length === 0) {
    logger.info(apply ? 'Nothing to repair.' : 'Dry run. Re-run with --apply to write.');
    return;
  }

  await run(`CREATE TABLE IF NOT EXISTS price_repair_log (
    uniqueIdentifier TEXT NOT NULL,
    date TEXT NOT NULL,
    source TEXT NOT NULL,
    oldPrice REAL,
    oldMarketPrice REAL,
    newPrice REAL NOT NULL,
    reason TEXT NOT NULL,
    repairedAt TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (uniqueIdentifier, date, source, reason)
  )`);

  await run('BEGIN TRANSACTION');
  try {
    for (const p of plan) {
      await run(
        `INSERT OR IGNORE INTO price_repair_log
           (uniqueIdentifier, date, source, oldPrice, oldMarketPrice, newPrice, reason)
         SELECT uniqueIdentifier, date, source, price, marketPrice, ?, 'ask_wall'
           FROM price_history WHERE uniqueIdentifier = ? AND date = ? AND source = ?`,
        [p.to, p.uid, p.date, SOURCE]
      );
      await run(
        `UPDATE price_history SET price = ?, marketPrice = ?
          WHERE uniqueIdentifier = ? AND date = ? AND source = ?`,
        [p.to, p.to, p.uid, p.date, SOURCE]
      );
    }
    await run('COMMIT');
  } catch (err) {
    await run('ROLLBACK');
    throw err;
  }

  const firstDate = plan.reduce((min, p) => (p.date < min ? p.date : min), plan[0].date);
  const result = await materializeCanonicalPrices({ sinceDate: firstDate });
  logger.info('Ask-wall snapshot repair applied', {
    repairs: plan.length,
    cards,
    canonicalRebuiltFrom: firstDate,
    canonicalRows: result.upserted,
  });
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    logger.error('Ask-wall snapshot repair failed', err);
    process.exit(1);
  });
