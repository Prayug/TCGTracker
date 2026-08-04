import { getDb } from '../db/database';
import { logger } from '../utils/logger';
import { resolveProduct, ResolverInput } from './priceChartingResolver';
import { savePopulationScrape } from './populationService';
import { saveGradedScrape } from './gradedPriceService';

const REFRESH_TTL_MS = 1000 * 60 * 60 * 12;

/** Sets that are actually TCGPlayer product categories — never price on PriceCharting. */
const EXCLUDED_SET_NAMES = [
  'World Championship Decks',
  'Miscellaneous Cards & Products',
  'Prize Pack Series Cards',
  'Deck Exclusives',
  'League & Championship Cards',
  'Jumbo Cards',
  'Blister Exclusives',
  'McDonald%',
  'Burger King Promos',
  'Countdown Calendar Promos',
  'Professor Program Promos',
  'Best of Promos',
  'Pikachu World Collection Promos',
  'ME01: Mega Evolution',
  'ME: Mega Evolution Promo',
  'MEE: Mega Evolution Energies',
  'SVE: Scarlet & Violet Energies',
];
const EXCLUDED_SET_IDS = [
  'worldchampionshipdecks',
  'miscellaneouscardsproducts',
  'prizepackseriescards',
  'deckexclusives',
  'leaguechampionshipcards',
  'jumbocards',
  'blisterexclusives',
];

const buildExclusionSql = (): { clause: string; params: string[] } => {
  const clauses: string[] = [];
  const params: string[] = [];
  for (const setName of EXCLUDED_SET_NAMES) {
    clauses.push(setName.includes('%') ? 'cm.setName NOT LIKE ?' : 'cm.setName != ?');
    params.push(setName);
  }
  for (const setId of EXCLUDED_SET_IDS) {
    clauses.push('cm.setId != ?');
    params.push(setId);
  }
  clauses.push(
    `cm.setName NOT LIKE '%promo%' AND cm.setName NOT LIKE '%Promo%' AND cm.setId NOT LIKE '%promo%' AND cm.setId NOT LIKE '%Promo%'`
  );
  return { clause: clauses.join(' AND '), params };
};

export interface GradedRefreshResult {
  attempted: number;
  saved: number;
  notFound: number;
  failed: number;
  skipped: number;
  directHits: number;
  cards: Array<{ cardId: string; cardName: string; status: string }>;
}

const queryAll = <T = any>(sql: string, params: unknown[] = []): Promise<T[]> =>
  new Promise((resolve, reject) => {
    getDb().all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve((rows || []) as T[]);
    });
  });

const run = (sql: string, params: unknown[] = []): Promise<void> =>
  new Promise((resolve, reject) => {
    getDb().run(sql, params, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });

export interface GradedQueueEntry {
  cardId: string;
  cardName: string;
  setId: string | null;
  setName: string | null;
  cardNumber: string | null;
  lastRequestedAt: number;
  lastRefreshedAt: number | null;
}

/** Record that a user looked at graded/pop data for this card (fire-and-forget). */
export const recordGradedRequest = async (entry: {
  cardId: string;
  cardName: string;
  setId?: string;
  setName?: string;
  cardNumber?: string;
}): Promise<void> => {
  if (!entry.cardId || !entry.cardName) return;
  try {
    await run(
      `INSERT INTO graded_refresh_queue (cardId, cardName, setId, setName, cardNumber, lastRequestedAt)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(cardId) DO UPDATE SET
         lastRequestedAt = excluded.lastRequestedAt,
         cardName = excluded.cardName,
         setId = COALESCE(excluded.setId, graded_refresh_queue.setId),
         setName = COALESCE(excluded.setName, graded_refresh_queue.setName),
         cardNumber = COALESCE(excluded.cardNumber, graded_refresh_queue.cardNumber)`,
      [
        entry.cardId,
        entry.cardName,
        entry.setId || null,
        entry.setName || null,
        entry.cardNumber || null,
        Date.now(),
      ]
    );
  } catch (error) {
    logger.warn('Failed to record graded request', { error: (error as Error).message });
  }
};

/**
 * Record that a card was refreshed. Upserts a queue row so even cards never
 * viewed by a user get a lastRefreshedAt marker — that's what makes the
 * full-catalog sweep idempotent across nightly runs.
 */
const markQueueEntryRefreshed = async (entry: GradedQueueEntry): Promise<void> => {
  await run(
    `INSERT INTO graded_refresh_queue (cardId, cardName, setId, setName, cardNumber, lastRequestedAt, lastRefreshedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(cardId) DO UPDATE SET
       lastRefreshedAt = excluded.lastRefreshedAt,
       cardName = excluded.cardName,
       setId = COALESCE(excluded.setId, graded_refresh_queue.setId),
       setName = COALESCE(excluded.setName, graded_refresh_queue.setName),
       cardNumber = COALESCE(excluded.cardNumber, graded_refresh_queue.cardNumber)`,
    [
      entry.cardId,
      entry.cardName,
      entry.setId || null,
      entry.setName || null,
      entry.cardNumber || null,
      entry.lastRequestedAt || 0,
      Date.now(),
    ]
  );
};

const toInput = (entry: GradedQueueEntry): ResolverInput => ({
  cardName: entry.cardName,
  setId: entry.setId || undefined,
  setName: entry.setName || undefined,
  cardNumber: entry.cardNumber || undefined,
});

/**
 * One card: resolve product, persist slab prices + population from a single
 * product page fetch. Never throws — failures are reported in the result.
 */
const processCard = async (
  entry: GradedQueueEntry,
  result: GradedRefreshResult,
  delayMs: number
): Promise<void> => {
  const input = toInput(entry);
  try {
    const resolved = await resolveProduct(input, delayMs);
    if (!resolved) {
      result.notFound += 1;
      result.cards.push({ cardId: entry.cardId, cardName: entry.cardName, status: 'not-found' });
      await markQueueEntryRefreshed(entry);
      return;
    }

    await Promise.all([
      saveGradedScrape(entry.cardId, input, resolved.match, resolved.pageData),
      savePopulationScrape(entry.cardId, input, resolved.match, resolved.pageData),
    ]);

    result.saved += 1;
    if (resolved.direct) result.directHits += 1;
    result.cards.push({ cardId: entry.cardId, cardName: entry.cardName, status: 'saved' });
    await markQueueEntryRefreshed(entry);
  } catch (error) {
    result.failed += 1;
    result.cards.push({
      cardId: entry.cardId,
      cardName: entry.cardName,
      status: `failed: ${(error as Error).message}`,
    });
    logger.warn('Graded refresh failed for card', {
      cardId: entry.cardId,
      cardName: entry.cardName,
      error: (error as Error).message,
    });
  }
};

const newResult = (): GradedRefreshResult => ({
  attempted: 0,
  saved: 0,
  notFound: 0,
  failed: 0,
  skipped: 0,
  directHits: 0,
  cards: [],
});

/**
 * Nightly refresh: one hardened request per card serves both slab prices and
 * population census. Prioritizes cards users actually viewed, then valuable
 * recently-traded cards as a seed. Never blocks on a failed card — it just
 * retries on the next run.
 */
export const runGradedRefresh = async (limit = 100): Promise<GradedRefreshResult> => {
  const due: GradedQueueEntry[] = await queryAll<GradedQueueEntry>(
    `SELECT cardId, cardName, setId, setName, cardNumber, lastRequestedAt, lastRefreshedAt
     FROM graded_refresh_queue
     WHERE lastRefreshedAt IS NULL OR lastRefreshedAt < ?
     ORDER BY lastRequestedAt DESC
     LIMIT ?`,
    [Date.now() - REFRESH_TTL_MS, limit]
  );

  // Seed the queue with the most valuable recently-traded cards so the nightly
  // rebuild covers the cards users actually care about even before anyone
  // opens a card detail view.
  if (due.length < limit) {
    const seed = await queryAll<GradedQueueEntry>(
      `SELECT
         cm.cardId, cm.cardName, cm.setId, cm.setName, cm.cardNumber,
         0 AS lastRequestedAt, NULL AS lastRefreshedAt
       FROM (
         SELECT uniqueIdentifier, MAX(date) AS latestDate, MAX(price) AS price
         FROM canonical_price_history
         WHERE price IS NOT NULL AND price > 0
         GROUP BY uniqueIdentifier
         HAVING latestDate >= date('now', '-14 days')
         ORDER BY price DESC
         LIMIT ?
       ) top
       JOIN card_mappings cm ON cm.uniqueIdentifier = top.uniqueIdentifier
       LEFT JOIN graded_refresh_queue q ON q.cardId = cm.cardId
       WHERE q.cardId IS NULL
       LIMIT ?`,
      [Math.max(limit * 3, 300), Math.max(limit - due.length, 0)]
    );

    for (const s of seed) {
      await run(
        `INSERT OR IGNORE INTO graded_refresh_queue (cardId, cardName, setId, setName, cardNumber, lastRequestedAt, lastRefreshedAt)
         VALUES (?, ?, ?, ?, ?, 0, NULL)`,
        [s.cardId, s.cardName, s.setId, s.setName, s.cardNumber]
      );
    }
  }

  const result = newResult();
  result.attempted = due.length;
  for (const entry of due) {
    await processCard(entry, result, 1500);
  }
  return result;
};

/**
 * Full-coverage sweep: walks EVERY card in the catalog (real sets only), so
 * every card eventually gets slab prices + population, not just viewed ones.
 * - Idempotent: skips cards refreshed within the TTL (re-runs are cheap).
 * - Resumable: no cursor needed — the TTL skip + lastRefreshedAt marker do it.
 * - Time-budgeted: the nightly cron gives it a max wall-clock duration; the
 *   rest of the catalog waits for the next run.
 * - Fast path: once a set's console name is learned, product pages are fetched
 *   directly (1 request/card) instead of search + page (2 requests/card).
 */
export const runAllCardsRefresh = async (options: {
  limit?: number;
  maxDurationMs?: number;
  delayMs?: number;
  logEvery?: number;
} = {}): Promise<GradedRefreshResult> => {
  const { limit = 0, maxDurationMs = 0, delayMs = 1000 } = options;
  const start = Date.now();
  const { clause, params } = buildExclusionSql();

  const rows = await queryAll<GradedQueueEntry & { variantKey: string | null }>(
    `SELECT cm.cardId, cm.cardName, cm.setId, cm.setName, cm.cardNumber,
            cm.variantKey, q.lastRequestedAt, q.lastRefreshedAt
     FROM card_mappings cm
     LEFT JOIN graded_refresh_queue q ON q.cardId = cm.cardId
     WHERE ${clause}
       AND (q.lastRefreshedAt IS NULL OR q.lastRefreshedAt < ?)
     ORDER BY (q.lastRequestedAt IS NOT NULL) DESC, q.lastRequestedAt DESC, cm.cardId
     LIMIT ?`,
    [...params, Date.now() - REFRESH_TTL_MS, limit > 0 ? limit * 4 : 10_000_000]
  );

  // Prefer the premium printing when a card has multiple variant mappings.
  const variantRank = (variantKey?: string | null): number => {
    const key = (variantKey || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    if (key.includes('1steditionholofoil')) return 100;
    if (key.includes('1stedition')) return 90;
    if (key === 'holofoil') return 80;
    if (key.includes('unlimitedholofoil')) return 70;
    if (key.includes('reverse')) return 60;
    if (key === 'normal' || key === 'unlimited') return 40;
    return 10;
  };
  const best = new Map<string, GradedQueueEntry & { variantKey: string | null }>();
  for (const row of rows) {
    if (!row.cardId || !row.cardName) continue;
    const existing = best.get(row.cardId);
    if (!existing || variantRank(row.variantKey) > variantRank(existing.variantKey)) {
      best.set(row.cardId, row);
    }
  }
  const cards = [...best.values()];

  const result = newResult();
  result.attempted = cards.length;

  let processed = 0;
  for (const entry of cards) {
    if (maxDurationMs > 0 && Date.now() - start >= maxDurationMs) {
      result.skipped = cards.length - processed;
      break;
    }
    await processCard(entry, result, delayMs);
    processed += 1;
    if (options.logEvery && processed % options.logEvery === 0) {
      logger.info('Graded refresh sweep progress', {
        processed,
        saved: result.saved,
        notFound: result.notFound,
        failed: result.failed,
        directHits: result.directHits,
        elapsedSec: Math.round((Date.now() - start) / 1000),
      });
    }
  }

  return result;
};
