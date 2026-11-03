/**
 * Move Cardmarket (EUR) prices that were saved as TCGplayer USD prices out of
 * the price series.
 *
 * When TCGdex has no TCGplayer price for an English card, it falls back to
 * Cardmarket. Until the fix in dataFetcher, that fallback was saved under the
 * TCGplayer finish (`…|normal`, `…|holofoil`) with source `tcgdex`. Rayquaza ★
 * Deoxys read $56.30 against a ~$9,400 card.
 *
 * A `tcgdex` row is treated as Cardmarket data when its productId is the
 * Cardmarket idProduct that the same card's `|cardmarket` / `|cardmarketholo`
 * rows carry. Matching rows are relabelled `cardmarket_eur`, a source no price
 * read uses, so nothing is deleted. Every change is logged in
 * price_source_repair_log, so it can be undone.
 *
 *   npm run repair:cardmarket-tcgdex             # dry run: counts and a sample
 *   npm run repair:cardmarket-tcgdex -- --apply  # relabel, then rebuild canonical prices
 */
import { initializeDatabase, getDb } from '../db/database';
import { runMigrations } from '../db/migrations';
import { materializeCanonicalPrices } from '../services/canonicalPriceService';
import { logger } from '../utils/logger';

const flag = (name: string) => process.argv.includes(`--${name}`);

const all = <T>(sql: string, params: unknown[] = []): Promise<T[]> =>
  new Promise((resolve, reject) =>
    getDb().all(sql, params, (err, rows) => (err ? reject(err) : resolve((rows || []) as T[])))
  );
const run = (sql: string, params: unknown[] = []): Promise<void> =>
  new Promise((resolve, reject) =>
    getDb().run(sql, params, (err) => (err ? reject(err) : resolve()))
  );

const NEW_SOURCE = 'cardmarket_eur';

async function main() {
  const apply = flag('apply');
  await initializeDatabase();
  await runMigrations(getDb());

  // Cardmarket idProducts per English card, from its Cardmarket-keyed finishes.
  await run('DROP TABLE IF EXISTS temp.cm_products');
  await run(
    `CREATE TEMP TABLE cm_products AS
     SELECT DISTINCT m.cardId, ph.productId
       FROM card_mappings m
       JOIN price_history ph ON ph.uniqueIdentifier = m.uniqueIdentifier
      WHERE COALESCE(m.language, 'en') = 'en'
        AND (m.uniqueIdentifier LIKE '%|cardmarket' OR m.uniqueIdentifier LIKE '%|cardmarketholo')
        AND ph.productId IS NOT NULL AND ph.productId > 0`
  );
  await run('CREATE INDEX temp.idx_cm_products ON cm_products(cardId, productId)');

  await run('DROP TABLE IF EXISTS temp.cm_repairs');
  await run(
    `CREATE TEMP TABLE cm_repairs AS
     SELECT ph.uniqueIdentifier, ph.date, ph.price, ph.marketPrice, m.cardId
       FROM price_history ph
       JOIN card_mappings m ON m.uniqueIdentifier = ph.uniqueIdentifier
       JOIN cm_products cp ON cp.cardId = m.cardId AND cp.productId = ph.productId
      WHERE ph.source = 'tcgdex'
        AND COALESCE(m.language, 'en') = 'en'
        AND ph.uniqueIdentifier NOT LIKE '%|cardmarket'
        AND ph.uniqueIdentifier NOT LIKE '%|cardmarketholo'`
  );

  const [summary] = await all<{ n: number; uids: number; cards: number; firstDate: string | null }>(
    `SELECT COUNT(*) AS n, COUNT(DISTINCT uniqueIdentifier) AS uids,
            COUNT(DISTINCT cardId) AS cards, MIN(date) AS firstDate
       FROM cm_repairs`
  );
  const sample = await all(
    `SELECT cardId, uniqueIdentifier, date, price FROM cm_repairs
      WHERE date = (SELECT MAX(date) FROM cm_repairs)
      ORDER BY price DESC LIMIT 20`
  );
  logger.info('Cardmarket-as-TCGplayer repair plan', summary);
  logger.info('Sample (latest day, highest price first)', { sample });

  if (!apply || !summary || summary.n === 0) {
    logger.info(apply ? 'Nothing to repair.' : 'Dry run. Re-run with --apply to write.');
    return;
  }

  await run(`CREATE TABLE IF NOT EXISTS price_source_repair_log (
    uniqueIdentifier TEXT NOT NULL,
    date TEXT NOT NULL,
    oldSource TEXT NOT NULL,
    newSource TEXT NOT NULL,
    reason TEXT NOT NULL,
    repairedAt TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (uniqueIdentifier, date, oldSource, reason)
  )`);

  await run('BEGIN TRANSACTION');
  try {
    await run(
      `INSERT OR IGNORE INTO price_source_repair_log
         (uniqueIdentifier, date, oldSource, newSource, reason)
       SELECT uniqueIdentifier, date, 'tcgdex', ?, 'cardmarket_saved_as_tcgplayer' FROM cm_repairs`,
      [NEW_SOURCE]
    );
    await run(
      `UPDATE OR IGNORE price_history SET source = ?
        WHERE source = 'tcgdex'
          AND EXISTS (SELECT 1 FROM cm_repairs r
                       WHERE r.uniqueIdentifier = price_history.uniqueIdentifier
                         AND r.date = price_history.date)`,
      [NEW_SOURCE]
    );
    await run('COMMIT');
  } catch (err) {
    await run('ROLLBACK');
    throw err;
  }

  const result = await materializeCanonicalPrices({ sinceDate: summary.firstDate as string });
  logger.info('Cardmarket-as-TCGplayer repair applied', {
    rows: summary.n,
    cards: summary.cards,
    canonicalRebuiltFrom: summary.firstDate,
    canonicalRows: result.upserted,
  });
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    logger.error('Cardmarket-as-TCGplayer repair failed', err);
    process.exit(1);
  });
