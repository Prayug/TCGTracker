import { getDb } from '../db/database';
import { logger } from '../utils/logger';
import { resolveProduct, ResolverInput } from './priceChartingResolver';
import { savePopulationScrape } from './populationService';
import { saveGradedScrape } from './gradedPriceService';
import { isOnePieceCatalogId, parseOnePieceCatalogId } from './onePieceCatalogId';

/** Once per calendar-ish day — shorter TTLs re-scrape the head and starve the long tail. */
const REFRESH_TTL_MS = 1000 * 60 * 60 * 24;

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
  language?: string | null;
  matchName?: string | null;
  variantKey?: string | null;
}

/** Record that a user looked at graded/pop data for this card (fire-and-forget). */
export const recordGradedRequest = async (entry: {
  cardId: string;
  cardName: string;
  setId?: string;
  setName?: string;
  cardNumber?: string;
  language?: string;
  matchName?: string;
  variant?: string;
}): Promise<void> => {
  if (!entry.cardId || !entry.cardName) return;
  const variantKey = (entry.variant || 'normal').toLowerCase().replace(/[^a-z0-9]/g, '') || 'normal';
  try {
    await run(
      `INSERT INTO graded_refresh_queue (cardId, variantKey, cardName, setId, setName, cardNumber, lastRequestedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(cardId, variantKey) DO UPDATE SET
         lastRequestedAt = excluded.lastRequestedAt,
         cardName = excluded.cardName,
         setId = COALESCE(excluded.setId, graded_refresh_queue.setId),
         setName = COALESCE(excluded.setName, graded_refresh_queue.setName),
         cardNumber = COALESCE(excluded.cardNumber, graded_refresh_queue.cardNumber)`,
      [
        entry.cardId,
        variantKey,
        entry.matchName || entry.cardName,
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
  const variantKey =
    (entry.variantKey || 'normal').toLowerCase().replace(/[^a-z0-9]/g, '') || 'normal';
  await run(
    `INSERT INTO graded_refresh_queue (cardId, variantKey, cardName, setId, setName, cardNumber, lastRequestedAt, lastRefreshedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(cardId, variantKey) DO UPDATE SET
       lastRefreshedAt = excluded.lastRefreshedAt,
       cardName = excluded.cardName,
       setId = COALESCE(excluded.setId, graded_refresh_queue.setId),
       setName = COALESCE(excluded.setName, graded_refresh_queue.setName),
       cardNumber = COALESCE(excluded.cardNumber, graded_refresh_queue.cardNumber)`,
    [
      entry.cardId,
      variantKey,
      entry.cardName,
      entry.setId || null,
      entry.setName || null,
      entry.cardNumber || null,
      entry.lastRequestedAt || 0,
      Date.now(),
    ]
  );
};

const toInput = (entry: GradedQueueEntry): ResolverInput => {
  const parsedOp = parseOnePieceCatalogId(entry.cardId);
  const game = isOnePieceCatalogId(entry.cardId) ? 'onepiece' : 'pokemon';
  return {
    cardName: entry.matchName || entry.cardName,
    setId: entry.setId || parsedOp?.setId || undefined,
    setName: entry.setName || undefined,
    cardNumber: entry.cardNumber || undefined,
    language: entry.language || 'en',
    matchName: entry.matchName || undefined,
    variant: entry.variantKey || 'normal',
    game,
    cardImageId: parsedOp?.cardImageId,
  };
};

/**
 * One card: resolve product, persist slab prices + population from a single
 * product page fetch. Never throws — failures are reported in the result.
 */
const processCard = async (
  entry: GradedQueueEntry,
  result: GradedRefreshResult,
  delayMs: number,
  fetchListings = false
): Promise<void> => {
  const input = toInput(entry);
  try {
    const resolved = await resolveProduct(input, delayMs);
    if (!resolved) {
      result.notFound += 1;
      result.cards.push({ cardId: entry.cardId, cardName: entry.cardName, status: 'not-found' });
      // Don't burn the full TTL on misses — retry on the next nightly window.
      await markQueueEntryRefreshed({
        ...entry,
        lastRefreshedAt: Date.now() - (REFRESH_TTL_MS - 1000 * 60 * 60 * 6),
      });
      return;
    }

    if (!resolved.pageData.gradedPrices.length) {
      result.notFound += 1;
      result.cards.push({ cardId: entry.cardId, cardName: entry.cardName, status: 'empty-prices' });
      await markQueueEntryRefreshed({
        ...entry,
        lastRefreshedAt: Date.now() - (REFRESH_TTL_MS - 1000 * 60 * 60 * 6),
      });
      return;
    }

    await Promise.all([
      saveGradedScrape(entry.cardId, input, resolved.match, resolved.pageData, {
        fetchListings,
        variantKey: entry.variantKey || 'normal',
      }),
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

const CARD_REFRESH_BUDGET_MS = 45_000;

const processCardWithBudget = async (
  entry: GradedQueueEntry,
  result: GradedRefreshResult,
  delayMs: number,
  fetchListings = false
): Promise<void> => {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      processCard(entry, result, delayMs, fetchListings),
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error('card refresh timeout')), CARD_REFRESH_BUDGET_MS);
      }),
    ]);
  } catch (error) {
    if ((error as Error).message === 'card refresh timeout') {
      result.failed += 1;
      result.cards.push({
        cardId: entry.cardId,
        cardName: entry.cardName,
        status: 'failed: card refresh timeout',
      });
      logger.warn('Graded refresh timed out for card', {
        cardId: entry.cardId,
        cardName: entry.cardName,
      });
    }
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
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
    `SELECT q.cardId,
            COALESCE(q.variantKey, cm.variantKey, 'normal') AS variantKey,
            COALESCE(cm.matchName, q.cardName) AS cardName,
            COALESCE(q.setId, cm.setId) AS setId,
            COALESCE(q.setName, cm.setName) AS setName,
            COALESCE(q.cardNumber, cm.cardNumber) AS cardNumber,
            q.lastRequestedAt, q.lastRefreshedAt,
            COALESCE(cm.language, 'en') AS language,
            cm.matchName AS matchName
     FROM graded_refresh_queue q
     LEFT JOIN card_mappings cm
       ON cm.cardId = q.cardId
      AND REPLACE(LOWER(COALESCE(cm.variantKey, 'normal')), ' ', '')
        = REPLACE(LOWER(COALESCE(q.variantKey, 'normal')), ' ', '')
     WHERE q.lastRefreshedAt IS NULL OR q.lastRefreshedAt < ?
     GROUP BY q.cardId, q.variantKey
     ORDER BY q.lastRequestedAt DESC
     LIMIT ?`,
    [Date.now() - REFRESH_TTL_MS, limit]
  );

  // Seed the queue with the most valuable recently-traded cards so the nightly
  // rebuild covers the cards users actually care about even before anyone
  // opens a card detail view.
  if (due.length < limit) {
    const seed = await queryAll<GradedQueueEntry>(
      `SELECT
         cm.cardId,
         COALESCE(cm.variantKey, 'normal') AS variantKey,
         COALESCE(cm.matchName, cm.cardName) AS cardName,
         cm.setId, cm.setName, cm.cardNumber,
         0 AS lastRequestedAt, NULL AS lastRefreshedAt,
         COALESCE(cm.language, 'en') AS language,
         cm.matchName AS matchName
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
       LEFT JOIN graded_refresh_queue q
         ON q.cardId = cm.cardId
        AND q.variantKey = COALESCE(cm.variantKey, 'normal')
       WHERE q.cardId IS NULL
       LIMIT ?`,
      [Math.max(limit * 3, 300), Math.max(limit - due.length, 0)]
    );

    for (const s of seed) {
      await run(
        `INSERT OR IGNORE INTO graded_refresh_queue (cardId, variantKey, cardName, setId, setName, cardNumber, lastRequestedAt, lastRefreshedAt)
         VALUES (?, ?, ?, ?, ?, ?, 0, NULL)`,
        [s.cardId, s.variantKey || 'normal', s.cardName, s.setId, s.setName, s.cardNumber]
      );
    }
  }

  const result = newResult();
  result.attempted = due.length;
  for (const entry of due) {
    await processCardWithBudget(entry, result, 1500, true);
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
  // ~750ms/card ≈ 4.8k cards/hour; a long nightly window can cover most of the catalog.
  const { limit = 0, maxDurationMs = 0, delayMs = 750 } = options;
  const start = Date.now();
  const { clause, params } = buildExclusionSql();

  const rows = await queryAll<GradedQueueEntry>(
    `SELECT cm.cardId,
            COALESCE(cm.variantKey, 'normal') AS variantKey,
            COALESCE(cm.matchName, cm.cardName) AS cardName,
            cm.setId, cm.setName, cm.cardNumber,
            q.lastRequestedAt, q.lastRefreshedAt,
            COALESCE(cm.language, 'en') AS language,
            cm.matchName AS matchName
     FROM card_mappings cm
     LEFT JOIN graded_refresh_queue q
       ON q.cardId = cm.cardId
      AND q.variantKey = COALESCE(cm.variantKey, 'normal')
     WHERE ${clause}
       AND (q.lastRefreshedAt IS NULL OR q.lastRefreshedAt < ?)
     ORDER BY
       (q.lastRefreshedAt IS NULL) DESC,
       (q.lastRequestedAt IS NOT NULL) DESC,
       q.lastRequestedAt DESC,
       cm.cardId
     LIMIT ?`,
    [...params, Date.now() - REFRESH_TTL_MS, limit > 0 ? limit : 10_000_000]
  );

  const cards = rows.filter((row) => row.cardId && row.cardName);

  const result = newResult();
  result.attempted = cards.length;

  let processed = 0;
  for (const entry of cards) {
    if (maxDurationMs > 0 && Date.now() - start >= maxDurationMs) {
      result.skipped = cards.length - processed;
      break;
    }
    await processCardWithBudget(entry, result, delayMs);
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
