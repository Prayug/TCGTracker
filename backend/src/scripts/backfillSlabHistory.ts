/**
 * Backfill multi-year monthly PSA 9 / PSA 10 history from PriceCharting's
 * product charts for the most liquid slabs. The nightly graded sweep only
 * started in Aug 2026, so without this slab backtests have ~2 months of data.
 *
 *   npm run backfill:slabs                     # top 800 PSA 10s by price × sold count
 *   npm run backfill:slabs -- --limit 2000 --min-sold 5 --min-price 40
 *   npm run backfill:slabs -- --delay 2500     # slower, gentler on PriceCharting
 *
 * Reuses the product URL the nightly sweep already verified, so there is no
 * search step. Also repairs monthly rows written by the old importer, which
 * stored PriceCharting's Grade 9 series as PSA 10.
 */
import { initializeDatabase, getDb } from '../db/database';
import { runMigrations } from '../db/migrations';
import { canonicalGradedHistoryVariantKey } from '../services/gradedPriceService';
import { fetchPriceChartingHtml, inferVariantKeyFromPc } from '../services/priceChartingClient';
import { parseSoldGuideSeries, upsertGradedHistory } from '../services/soldGuideHistory';
import { logger } from '../utils/logger';

const arg = (name: string, fallback: number): number => {
  const i = process.argv.indexOf(`--${name}`);
  const n = i >= 0 ? Number(process.argv[i + 1]) : NaN;
  return Number.isFinite(n) ? n : fallback;
};

const all = <T>(sql: string, params: unknown[] = []): Promise<T[]> =>
  new Promise((resolve, reject) =>
    getDb().all(sql, params, (err, rows) => (err ? reject(err) : resolve((rows || []) as T[])))
  );
const run = (sql: string, params: unknown[] = []): Promise<number> =>
  new Promise((resolve, reject) =>
    getDb().run(sql, params, function (this: { changes: number }, err) {
      if (err) reject(err);
      else resolve(this.changes);
    })
  );

const main = async () => {
  await initializeDatabase();
  await runMigrations(getDb());

  const limit = arg('limit', 800);
  const minSold = arg('min-sold', 3);
  const minPrice = arg('min-price', 25);
  const delayMs = arg('delay', 1500);

  const targets = await all<{
    cardId: string;
    sourceUrl: string;
    productId: string | null;
    price: number;
  }>(
    `SELECT cardId, sourceUrl, productId, MAX(price) AS price
     FROM graded_prices
     WHERE grader = 'psa' AND grade = '10' AND COALESCE(verified, 0) = 1
       AND sourceUrl LIKE 'https://www.pricecharting.com/%'
       AND price >= ? AND COALESCE(soldListings, 0) >= ?
     GROUP BY cardId
     ORDER BY price * MIN(COALESCE(soldListings, 0), 30) DESC
     LIMIT ?`,
    [minPrice, minSold, limit]
  );
  logger.info('Slab history backfill', { targets: targets.length, minSold, minPrice, delayMs });

  let ok = 0;
  let failed = 0;
  let consecutiveFailures = 0;
  for (const [i, t] of targets.entries()) {
    try {
      const html = await fetchPriceChartingHtml(t.sourceUrl, delayMs);
      const parsed = parseSoldGuideSeries(html);
      const variantKey = canonicalGradedHistoryVariantKey(inferVariantKeyFromPc(null, t.sourceUrl));
      const productId = parsed.productId ?? t.productId;

      // Old importer rows: monthly (1st of month), no source URL, Grade 9 labelled PSA 10.
      const repaired = await run(
        `DELETE FROM graded_price_history
         WHERE cardId = ? AND grader = 'psa' AND grade = '10' AND source = 'pricecharting'
           AND sourceUrl IS NULL AND substr(date, 9, 2) = '01'`,
        [t.cardId]
      );
      const psa9 = await upsertGradedHistory(t.cardId, variantKey, '9', parsed.psa9, productId);
      const psa10 = await upsertGradedHistory(t.cardId, variantKey, '10', parsed.psa10, productId);
      ok++;
      consecutiveFailures = 0;
      if ((i + 1) % 25 === 0 || repaired > 0) {
        logger.info(`Slab history ${i + 1}/${targets.length}`, {
          cardId: t.cardId,
          psa9,
          psa10,
          repaired,
        });
      }
    } catch (err) {
      failed++;
      consecutiveFailures++;
      logger.warn('Slab history fetch failed', { cardId: t.cardId, error: (err as Error).message });
      // A run of challenges/429s means we're being throttled; stop rather than hammer.
      if (consecutiveFailures >= 8) {
        logger.error('Stopping: PriceCharting is refusing requests. Re-run later.');
        break;
      }
    }
  }

  logger.info('Slab history backfill finished', { ok, failed, targets: targets.length });
  process.exit(0);
};

main().catch((error) => {
  logger.error('Slab history backfill failed', { error: (error as Error).message });
  process.exit(1);
});
