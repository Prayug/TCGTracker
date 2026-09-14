import { getDb } from '../db/database';
import { logger } from '../utils/logger';
import { dbGet, dbAll, dbRun } from '../db/promisified';
import { normalizeVariantKey } from '../utils/normalizeVariantKey';
import { resolveProduct } from './priceChartingResolver';
import {
  ProductMatchInput,
  expectedPcFinishFamily,
  detectPcFinishFamily,
  inferVariantKeyFromPc,
} from './priceChartingClient';
import {
  detectOpPrintFamily,
  expectedOpPrintFamily,
  opPrintFamiliesMatch,
} from './onePiecePriceCharting';
import { blendSlabMarketMark } from './slabMarketMark';
import {
  fetchPsa10ListingQuote,
  isEbayBrowseConfigured,
  Psa10ListingQuote,
} from './ebayBrowseClient';
import { isOnePieceCatalogId, parseOnePieceCatalogId } from './onePieceCatalogId';

const CACHE_TTL_MS = 1000 * 60 * 60 * 12;
const LISTED_TTL_MS = 1000 * 60 * 60 * 12;
const HISTORY_TIMEZONE = 'America/New_York';

const variantKeyOf = (variant?: string | null): string => normalizeVariantKey(variant ?? undefined);

/**
 * PriceCharting only splits reverse / 1st-edition products. Holofoil, normal,
 * unlimited, etc. all map to the same PC page — historical scrapes were stored
 * under `normal`. Keep graded history on that canonical key so Holofoil charts
 * don't look "wiped" after a finish-aware scrape.
 */
export const canonicalGradedHistoryVariantKey = (variant?: string | null): string => {
  const key = variantKeyOf(variant);
  const family = expectedPcFinishFamily(key);
  if (family === 'reverse') return 'reverseholofoil';
  if (family === '1steditionreverse')
    return key.includes('holo') ? '1steditionholofoil' : '1stedition';
  if (family === '1stedition') return '1stedition';
  return 'normal';
};

/** Calendar date in ET — same convention as raw price_history run dates. */
const getHistoryDate = (): string =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: HISTORY_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

export interface GradedPrice {
  grader: string;
  grade: string;
  price: number | null;
  soldListings: number;
  lastSoldDate?: string | null;
  lastSoldPrice?: number | null;
  listedLow?: number | null;
  listedAvg?: number | null;
  listedCount?: number | null;
  listedFetchedAt?: string | null;
  /** Blended sold + ask mark used for ROI when asks diverge from stale comps. */
  marketMark?: number | null;
  marketMarkReason?: string | null;
  staleSold?: boolean;
  lastSoldAgeDays?: number | null;
  listedPremiumPct?: number | null;
}

export interface GradedPriceResult {
  cardId: string;
  cardName: string;
  setName: string;
  prices: GradedPrice[];
  fetchedAt: string;
  cached: boolean;
  verified: boolean;
  productId: string | null;
  matchScore: number | null;
  stale: boolean;
  ageHours: number | null;
}

export interface GradedPriceHistoryPoint {
  date: string;
  price: number;
  soldListings: number;
}

export interface GradedPriceHistoryResult {
  cardId: string;
  grader: string;
  grade: string;
  points: GradedPriceHistoryPoint[];
}

interface CachedPriceRow {
  cardId: string;
  cardName: string;
  setId: string | null;
  setName: string;
  grader: string;
  grade: string;
  price: number | null;
  soldListings: number | null;
  fetchedAt: string;
  verified: number | null;
  productId: string | null;
  matchScore: number | null;
  lastSoldDate: string | null;
  lastSoldPrice: number | null;
  listedLow: number | null;
  listedAvg: number | null;
  listedCount: number | null;
  listedFetchedAt: string | null;
  sourceUrl: string | null;
}

export const enrichGradedPrice = (p: GradedPrice): GradedPrice => {
  if (p.price == null || !Number.isFinite(p.price) || p.price <= 0) return p;
  const blended = blendSlabMarketMark({
    soldGuide: p.price,
    lastSoldDate: p.lastSoldDate,
    lastSoldPrice: p.lastSoldPrice,
    listedLow: p.listedLow,
    listedAvg: p.listedAvg,
    listedCount: p.listedCount,
  });
  return {
    ...p,
    marketMark: blended.mark,
    marketMarkReason: blended.reason,
    staleSold: blended.staleSold,
    lastSoldAgeDays: blended.lastSoldAgeDays,
    listedPremiumPct: blended.listedPremiumPct,
  };
};

const priceFromRow = (row: CachedPriceRow): GradedPrice =>
  enrichGradedPrice({
    grader: row.grader,
    grade: row.grade,
    price: row.price != null ? Number(row.price) : null,
    soldListings: Number(row.soldListings) || 0,
    lastSoldDate: row.lastSoldDate || null,
    lastSoldPrice: row.lastSoldPrice != null ? Number(row.lastSoldPrice) : null,
    listedLow: row.listedLow != null ? Number(row.listedLow) : null,
    listedAvg: row.listedAvg != null ? Number(row.listedAvg) : null,
    listedCount: row.listedCount != null ? Number(row.listedCount) : null,
    listedFetchedAt: row.listedFetchedAt || null,
  });

const resultFromRows = (rows: CachedPriceRow[], stale: boolean): GradedPriceResult => {
  const first = rows[0];
  const fetchedAt = rows.reduce(
    (latest, r) => (r.fetchedAt > latest ? r.fetchedAt : latest),
    first.fetchedAt
  );
  const fetchedMs = new Date(fetchedAt + 'Z').getTime();
  const age = Date.now() - fetchedMs;
  const verified = rows.some((r) => Number(r.verified) === 1);
  return {
    cardId: first.cardId,
    cardName: first.cardName,
    setName: first.setName,
    prices: rows.map(priceFromRow),
    fetchedAt,
    cached: true,
    verified,
    productId: rows.find((r) => r.productId)?.productId || null,
    matchScore: rows.find((r) => r.matchScore != null)?.matchScore ?? null,
    stale,
    ageHours: Number.isFinite(age) ? Math.max(0, Math.round(age / 3600000)) : null,
  };
};

const serveCachedGradedPrices = (
  rows: CachedPriceRow[],
  stale: boolean,
  variantKey: string
): GradedPriceResult => {
  const result = resultFromRows(rows, stale);
  try {
    snapshotHistoryFromPrices(result.cardId, variantKey, result.prices, {
      productId: result.productId,
      verified: result.verified,
    });
  } catch (error) {
    logger.warn('Failed to snapshot graded price history from cache', {
      cardId: result.cardId,
      variantKey,
      error: (error as Error).message,
    });
  }
  return result;
};

const listedIsFresh = (rows: CachedPriceRow[]): boolean => {
  const psa10 = rows.find((r) => r.grader === 'psa' && r.grade === '10');
  if (!psa10?.listedFetchedAt) return false;
  const ms = new Date(psa10.listedFetchedAt + 'Z').getTime();
  return Number.isFinite(ms) && Date.now() - ms < LISTED_TTL_MS;
};

export const refreshListedQuotes = async (
  cardId: string,
  input: ProductMatchInput,
  variantKey: string = 'normal'
): Promise<Psa10ListingQuote | null> => {
  if (!isEbayBrowseConfigured()) return null;
  try {
    const quote = await fetchPsa10ListingQuote(input);
    if (!quote) return null;
    await dbRun(
      `UPDATE graded_prices
       SET listedLow = ?, listedAvg = ?, listedCount = ?, listedFetchedAt = datetime('now')
       WHERE cardId = ? AND variantKey = ? AND grader = 'psa' AND grade = '10'`,
      [quote.listedLow, quote.listedAvg, quote.listedCount, cardId, variantKey]
    );
    // Stamp the observation onto today's history row so listing-count history
    // accrues alongside price history (used by buyout supply-drain detection).
    await dbRun(
      `UPDATE graded_price_history
       SET listedCount = ?
       WHERE cardId = ? AND variantKey = ? AND UPPER(grader) = 'PSA' AND grade = '10' AND date = ?`,
      [quote.listedCount, cardId, variantKey, getHistoryDate()]
    );
    return quote;
  } catch (error) {
    logger.warn('Listed-quote refresh failed', {
      cardId,
      variantKey,
      error: (error as Error).message,
    });
    return null;
  }
};

/** Ensure today's history point exists from the live cache (idempotent upsert). */
const snapshotHistoryFromPrices = (
  cardId: string,
  variantKey: string,
  prices: GradedPrice[],
  meta: { productId: string | null; verified: boolean; sourceUrl?: string | null }
): void => {
  const db = getDb();
  const runDate = getHistoryDate();
  // Prefer the PC product's finish for history. Reverse/1st requests that were
  // aliased onto an untagged PC page must write under `normal` so charts reuse
  // the existing series (Southern Islands, etc.).
  const historyVariantKey = meta.sourceUrl
    ? canonicalGradedHistoryVariantKey(inferVariantKeyFromPc(null, meta.sourceUrl))
    : canonicalGradedHistoryVariantKey(variantKey);
  const stmt = db.prepare(
    `INSERT INTO graded_price_history
      (cardId, variantKey, date, grader, grade, price, soldListings, productId, verified, sourceUrl, source)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pricecharting')
     ON CONFLICT(cardId, variantKey, date, grader, grade) DO UPDATE SET
       price = excluded.price,
       soldListings = excluded.soldListings,
       productId = excluded.productId,
       verified = excluded.verified,
       sourceUrl = excluded.sourceUrl`
  );
  for (const p of prices) {
    // Skip PriceCharting "ungraded" — raw belongs on the TCGPlayer chart, not slabs.
    if (p.grader === 'ungraded') continue;
    if (p.price == null || !Number.isFinite(p.price) || p.price <= 0) continue;
    stmt.run([
      cardId,
      historyVariantKey,
      runDate,
      p.grader,
      p.grade,
      p.price,
      p.soldListings,
      meta.productId,
      meta.verified ? 1 : 0,
      meta.sourceUrl ?? null,
    ]);
  }
  stmt.finalize();
};

/**
 * Snapshot EVERY live slab quote into today's graded_price_history.
 * Scrape coverage is time-budgeted; this makes history densify like raw prices
 * for all cards we already have quotes for — no PriceCharting request needed.
 */
export const snapshotAllGradedPricesToHistory = async (
  date = getHistoryDate()
): Promise<{ upserted: number; cards: number; date: string }> => {
  const db = getDb();
  const result = await new Promise<{ changes: number }>((resolve, reject) => {
    db.run(
      `INSERT INTO graded_price_history
         (cardId, variantKey, date, grader, grade, price, soldListings, listedCount, productId, verified, sourceUrl, source)
       SELECT
         cardId,
         CASE
           WHEN REPLACE(LOWER(COALESCE(variantKey, '')), ' ', '') LIKE '%reverse%'
             THEN CASE
               WHEN REPLACE(LOWER(COALESCE(variantKey, '')), ' ', '') LIKE '%1stedition%'
                 OR REPLACE(LOWER(COALESCE(variantKey, '')), ' ', '') LIKE '%firstedition%'
               THEN COALESCE(NULLIF(variantKey, ''), '1steditionholofoil')
               ELSE 'reverseholofoil'
             END
           WHEN REPLACE(LOWER(COALESCE(variantKey, '')), ' ', '') LIKE '%1stedition%'
             OR REPLACE(LOWER(COALESCE(variantKey, '')), ' ', '') LIKE '%firstedition%'
             THEN '1stedition'
           ELSE 'normal'
         END,
         ?,
         grader,
         grade,
         price,
         COALESCE(soldListings, 0),
         CASE WHEN date(listedFetchedAt) = ? THEN listedCount ELSE NULL END,
         productId,
         COALESCE(verified, 0),
         sourceUrl,
         'pricecharting'
       FROM graded_prices
       WHERE grader != 'ungraded'
         AND price IS NOT NULL
         AND price > 0
       ON CONFLICT(cardId, variantKey, date, grader, grade) DO UPDATE SET
         price = excluded.price,
         soldListings = excluded.soldListings,
         listedCount = COALESCE(excluded.listedCount, graded_price_history.listedCount),
         productId = COALESCE(excluded.productId, graded_price_history.productId),
         verified = excluded.verified,
         sourceUrl = COALESCE(excluded.sourceUrl, graded_price_history.sourceUrl)`,
      [date, date],
      function onDone(err) {
        if (err) reject(err);
        else resolve({ changes: this.changes ?? 0 });
      }
    );
  });

  const cards = await dbGet<{ n: number }>(
    `SELECT COUNT(DISTINCT cardId) AS n FROM graded_price_history WHERE date = ? AND grader != 'ungraded'`,
    [date]
  );

  logger.info('Snapshotted graded_prices into history', {
    date,
    upserted: result.changes,
    cards: cards?.n ?? 0,
  });

  return { upserted: result.changes, cards: cards?.n ?? 0, date };
};

/**
 * One-shot / catch-up: for every live slab quote, ensure a history row exists on
 * date(fetchedAt). Fills gaps for cards scraped before history was written.
 */
export const backfillGradedHistoryFromCache = async (): Promise<{
  upserted: number;
  cards: number;
}> => {
  const db = getDb();
  const result = await new Promise<{ changes: number }>((resolve, reject) => {
    db.run(
      `INSERT INTO graded_price_history
         (cardId, variantKey, date, grader, grade, price, soldListings, listedCount, productId, verified, sourceUrl, source)
       SELECT
         cardId,
         COALESCE(NULLIF(variantKey, ''), 'normal'),
         date(fetchedAt),
         grader,
         grade,
         price,
         COALESCE(soldListings, 0),
         CASE WHEN date(listedFetchedAt) = date(fetchedAt) THEN listedCount ELSE NULL END,
         productId,
         COALESCE(verified, 0),
         sourceUrl,
         'pricecharting'
       FROM graded_prices
       WHERE grader != 'ungraded'
         AND price IS NOT NULL
         AND price > 0
         AND fetchedAt IS NOT NULL
         AND date(fetchedAt) IS NOT NULL
       ON CONFLICT(cardId, variantKey, date, grader, grade) DO UPDATE SET
         price = excluded.price,
         soldListings = excluded.soldListings,
         listedCount = COALESCE(excluded.listedCount, graded_price_history.listedCount),
         productId = COALESCE(excluded.productId, graded_price_history.productId),
         verified = excluded.verified,
         sourceUrl = COALESCE(excluded.sourceUrl, graded_price_history.sourceUrl)`,
      [],
      function onDone(err) {
        if (err) reject(err);
        else resolve({ changes: this.changes ?? 0 });
      }
    );
  });

  const cards = await dbGet<{ n: number }>(
    `SELECT COUNT(DISTINCT cardId) AS n FROM graded_price_history WHERE grader != 'ungraded'`
  );

  logger.info('Backfilled graded history from graded_prices cache', {
    upserted: result.changes,
    cards: cards?.n ?? 0,
  });

  return { upserted: result.changes, cards: cards?.n ?? 0 };
};

/**
 * Persist slab prices parsed from a shared product-page scrape (nightly refresh).
 * Also appends a daily history row so graded series can be graphed like raw prices.
 */
export const saveGradedScrape = async (
  cardId: string,
  input: ProductMatchInput,
  match: { productId: string; matchScore: number; url: string },
  pageData: {
    productId: string | null;
    gradedPrices: GradedPrice[];
  },
  options?: {
    fetchListings?: boolean;
    variantKey?: string;
    /** Set when PC has no reverse/1st SKU and we intentionally used the untagged product. */
    allowStandardFinishAlias?: boolean;
  }
): Promise<Psa10ListingQuote | null> => {
  const variantKey = variantKeyOf(options?.variantKey || input.variant);
  const wantFinish = expectedPcFinishFamily(variantKey);
  const gotFinish = detectPcFinishFamily(undefined, match.url);
  const finishOk =
    gotFinish === wantFinish ||
    Boolean(
      options?.allowStandardFinishAlias && wantFinish !== 'standard' && gotFinish === 'standard'
    );
  if (!finishOk) {
    logger.warn('Refusing to save slab scrape with mismatched finish', {
      cardId,
      variantKey,
      wantFinish,
      gotFinish,
      url: match.url,
    });
    return null;
  }
  if (input.game === 'onepiece') {
    const wantFamily = expectedOpPrintFamily(input);
    const gotFamily = detectOpPrintFamily(undefined, match.url);
    if (!opPrintFamiliesMatch(wantFamily, gotFamily)) {
      logger.warn('Refusing to save slab scrape with mismatched One Piece print family', {
        cardId,
        variantKey,
        wantFamily,
        gotFamily,
        url: match.url,
      });
      return null;
    }
  }

  const db = getDb();
  const verified = pageData.productId === match.productId;
  const stmt = db.prepare(
    `INSERT INTO graded_prices
      (cardId, variantKey, cardName, setId, setName, grader, grade, price, soldListings,
       fetchedAt, productId, matchScore, verified, sourceUrl, lastSoldDate, lastSoldPrice)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?, ?, ?, ?, ?, ?)
     ON CONFLICT(cardId, variantKey, grader, grade) DO UPDATE SET
       cardName = excluded.cardName,
       setName = COALESCE(excluded.setName, graded_prices.setName),
       price = excluded.price,
       soldListings = excluded.soldListings,
       fetchedAt = excluded.fetchedAt,
       productId = excluded.productId,
       matchScore = excluded.matchScore,
       verified = excluded.verified,
       sourceUrl = excluded.sourceUrl,
       lastSoldDate = excluded.lastSoldDate,
       lastSoldPrice = excluded.lastSoldPrice`
  );
  for (const p of pageData.gradedPrices) {
    stmt.run([
      cardId,
      variantKey,
      input.cardName,
      null,
      input.setName || null,
      p.grader,
      p.grade,
      p.price,
      p.soldListings,
      match.productId,
      match.matchScore,
      verified ? 1 : 0,
      match.url,
      p.lastSoldDate ?? null,
      p.lastSoldPrice ?? null,
    ]);
  }
  stmt.finalize();
  snapshotHistoryFromPrices(cardId, variantKey, pageData.gradedPrices, {
    productId: match.productId,
    verified,
    sourceUrl: match.url,
  });

  if (options?.fetchListings) {
    return refreshListedQuotes(cardId, input, variantKey);
  }
  return null;
};

/** When reverse/1st is backed by an untagged PC product, reuse `normal` history. */
const historyVariantKeysForRead = async (cardId: string, variantKey: string): Promise<string[]> => {
  const historyKey = canonicalGradedHistoryVariantKey(variantKey);
  const keys = new Set<string>([variantKey, historyKey]);
  if (expectedPcFinishFamily(variantKey) === 'standard') {
    return [...keys];
  }
  const row = await dbGet<{ sourceUrl: string | null }>(
    `SELECT sourceUrl FROM graded_prices
     WHERE cardId = ? AND variantKey = ? AND sourceUrl IS NOT NULL
     LIMIT 1`,
    [cardId, variantKey]
  );
  const url = row?.sourceUrl;
  if (!url || detectPcFinishFamily(undefined, url) === 'standard') {
    keys.add('normal');
  }
  return [...keys];
};

export const getGradedPriceHistory = async (
  cardId: string,
  grader: string,
  grade: string,
  days = 365,
  variant?: string
): Promise<GradedPriceHistoryResult> => {
  const variantKey = variantKeyOf(variant);
  const historyKeys = await historyVariantKeysForRead(cardId, variantKey);
  const clampedDays = Math.min(Math.max(days, 1), 2000);
  const placeholders = historyKeys.map(() => '?').join(', ');
  // Prefer the requested finish when both exist for a date; fall back to the
  // canonical / aliased series that holds the real history.
  const rows = await dbAll<{
    date: string;
    price: number;
    soldListings: number;
    variantKey: string;
  }>(
    `SELECT date, price, COALESCE(soldListings, 0) AS soldListings, variantKey
     FROM graded_price_history
     WHERE cardId = ?
       AND variantKey IN (${placeholders})
       AND grader = ?
       AND grade = ?
       AND price IS NOT NULL
       AND price > 0
       AND date >= date('now', ?)
     ORDER BY date ASC,
       CASE WHEN variantKey = ? THEN 0 ELSE 1 END`,
    [cardId, ...historyKeys, grader, grade, `-${clampedDays} days`, variantKey]
  );

  const byDate = new Map<string, { date: string; price: number; soldListings: number }>();
  for (const r of rows) {
    if (byDate.has(r.date)) continue;
    byDate.set(r.date, {
      date: r.date,
      price: Number(r.price),
      soldListings: Number(r.soldListings) || 0,
    });
  }

  return {
    cardId,
    grader,
    grade,
    points: [...byDate.values()],
  };
};

export interface GradedPriceHistorySeries extends GradedPriceHistoryResult {
  latestPrice: number | null;
}

export interface AllGradedPriceHistoryResult {
  cardId: string;
  series: GradedPriceHistorySeries[];
}

/** All grader/grade series for one card — for Collectr-style multi-line charts. */
export const getAllGradedPriceHistory = async (
  cardId: string,
  days = 365,
  variant?: string
): Promise<AllGradedPriceHistoryResult> => {
  const variantKey = variantKeyOf(variant);
  const historyKeys = await historyVariantKeysForRead(cardId, variantKey);
  const clampedDays = Math.min(Math.max(days, 1), 2000);
  const placeholders = historyKeys.map(() => '?').join(', ');
  const rows = await dbAll<{
    date: string;
    grader: string;
    grade: string;
    price: number;
    soldListings: number;
    variantKey: string;
  }>(
    `SELECT date, grader, grade, price, COALESCE(soldListings, 0) AS soldListings, variantKey
     FROM graded_price_history
     WHERE cardId = ?
       AND variantKey IN (${placeholders})
       AND grader != 'ungraded'
       AND price IS NOT NULL
       AND price > 0
       AND date >= date('now', ?)
     ORDER BY grader ASC, grade ASC, date ASC,
       CASE WHEN variantKey = ? THEN 0 ELSE 1 END`,
    [cardId, ...historyKeys, `-${clampedDays} days`, variantKey]
  );

  const byKey = new Map<string, GradedPriceHistorySeries>();
  const seenDates = new Map<string, Set<string>>();
  for (const r of rows) {
    const key = `${r.grader}::${r.grade}`;
    let series = byKey.get(key);
    if (!series) {
      series = {
        cardId,
        grader: r.grader,
        grade: r.grade,
        points: [],
        latestPrice: null,
      };
      byKey.set(key, series);
      seenDates.set(key, new Set());
    }
    const dates = seenDates.get(key)!;
    if (dates.has(r.date)) continue;
    dates.add(r.date);
    const price = Number(r.price);
    series.points.push({
      date: r.date,
      price,
      soldListings: Number(r.soldListings) || 0,
    });
    series.latestPrice = price;
  }

  return { cardId, series: [...byKey.values()] };
};

export const getGradedPrices = async (
  cardId: string,
  cardName: string,
  setId?: string,
  setName?: string,
  cardNumber?: string,
  options?: {
    allowLiveScrape?: boolean;
    language?: string;
    matchName?: string;
    variant?: string;
    game?: 'pokemon' | 'onepiece';
    cardImageId?: string;
  }
): Promise<GradedPriceResult> => {
  const allowLiveScrape = options?.allowLiveScrape !== false;
  const matchName = options?.matchName || cardName;
  const language = options?.language || 'en';
  const parsedOp = parseOnePieceCatalogId(cardId);
  const game = options?.game || (isOnePieceCatalogId(cardId) ? 'onepiece' : 'pokemon');
  const cardImageId = options?.cardImageId || parsedOp?.cardImageId;
  const variantKey = variantKeyOf(options?.variant);
  const input: ProductMatchInput = {
    cardName: matchName,
    setName,
    cardNumber,
    variant: variantKey,
    game,
    cardImageId,
  };
  const resolverInput = {
    cardName,
    matchName,
    setId,
    setName,
    cardNumber,
    language,
    variant: variantKey,
    game,
    cardImageId,
  };

  const cachedRows = await dbAll<CachedPriceRow>(
    `SELECT cardId, cardName, setId, setName, grader, grade, price, soldListings,
            fetchedAt, verified, productId, matchScore,
            lastSoldDate, lastSoldPrice, listedLow, listedAvg, listedCount, listedFetchedAt,
            sourceUrl
     FROM graded_prices
     WHERE cardId = ? AND variantKey = ? AND COALESCE(verified, 0) = 1`,
    [cardId, variantKey]
  );

  let usableCache = cachedRows;
  if (game === 'onepiece' && cachedRows.length > 0) {
    const wantFamily = expectedOpPrintFamily(input);
    const cachedUrl = cachedRows.find((r) => r.sourceUrl)?.sourceUrl || '';
    const cachedFamily = detectOpPrintFamily(undefined, cachedUrl);
    if (!opPrintFamiliesMatch(wantFamily, cachedFamily)) {
      logger.info('Discarding graded cache with wrong One Piece print family', {
        cardId,
        variantKey,
        wantFamily,
        cachedFamily,
        sourceUrl: cachedUrl || null,
      });
      await dbRun('DELETE FROM graded_prices WHERE cardId = ? AND variantKey = ?', [
        cardId,
        variantKey,
      ]);
      await dbRun('DELETE FROM graded_price_history WHERE cardId = ? AND variantKey = ?', [
        cardId,
        variantKey,
      ]);
      usableCache = [];
    }
  }

  const applyListed = (prices: GradedPrice[], quote: Psa10ListingQuote | null): GradedPrice[] =>
    prices.map((p) => {
      if (p.grader !== 'psa' || p.grade !== '10' || !quote) return enrichGradedPrice(p);
      return enrichGradedPrice({
        ...p,
        listedLow: quote.listedLow,
        listedAvg: quote.listedAvg,
        listedCount: quote.listedCount,
        listedFetchedAt: new Date().toISOString(),
      });
    });

  // Stale-while-revalidate: always paint cached slabs immediately.
  // Live PriceCharting scrapes are slow and should never block the modal.
  if (usableCache.length > 0) {
    const fetchedAt = usableCache.reduce(
      (latest, r) => (r.fetchedAt > latest ? r.fetchedAt : latest),
      usableCache[0].fetchedAt
    );
    const fetchedMs = new Date(fetchedAt + 'Z').getTime();
    const age = Date.now() - fetchedMs;
    const fresh = Number.isFinite(age) && age < CACHE_TTL_MS;

    if (!listedIsFresh(usableCache) && isEbayBrowseConfigured()) {
      void refreshListedQuotes(cardId, input, variantKey);
    }

    if (fresh || !allowLiveScrape) {
      return serveCachedGradedPrices(usableCache, !fresh, variantKey);
    }

    void (async () => {
      try {
        const resolved = await resolveProduct(resolverInput, 1500);
        if (resolved && resolved.pageData.gradedPrices.length > 0) {
          await saveGradedScrape(cardId, input, resolved.match, resolved.pageData, {
            fetchListings: true,
            variantKey,
            allowStandardFinishAlias: Boolean(resolved.finishAliasedToStandard),
          });
        }
      } catch (error) {
        logger.warn('Background graded price refresh failed', {
          cardId,
          variantKey,
          error: (error as Error).message,
        });
      }
    })();

    return serveCachedGradedPrices(usableCache, true, variantKey);
  }

  const empty = (extra: Partial<GradedPriceResult> = {}): GradedPriceResult => ({
    cardId,
    cardName,
    setName: setName || '',
    prices: [],
    fetchedAt: new Date().toISOString(),
    cached: false,
    verified: false,
    productId: null,
    matchScore: null,
    stale: false,
    ageHours: null,
    ...extra,
  });

  if (!allowLiveScrape) {
    return empty({ stale: true });
  }

  try {
    const resolved = await resolveProduct(resolverInput, 1500);

    if (!resolved || resolved.pageData.gradedPrices.length === 0) {
      return empty({
        productId: resolved?.pageData.productId ?? null,
        matchScore: resolved?.match.matchScore ?? null,
      });
    }

    const { match, pageData } = resolved;
    const verified = pageData.productId === match.productId;
    const listed = await saveGradedScrape(cardId, input, match, pageData, {
      fetchListings: true,
      variantKey,
      allowStandardFinishAlias: Boolean(resolved.finishAliasedToStandard),
    });

    return {
      cardId,
      cardName,
      setName: setName || '',
      prices: applyListed(pageData.gradedPrices, listed),
      fetchedAt: new Date().toISOString(),
      cached: false,
      verified,
      productId: match.productId,
      matchScore: match.matchScore,
      stale: false,
      ageHours: 0,
    };
  } catch (error) {
    logger.warn('Graded price scrape failed', {
      cardId,
      cardName,
      error: (error as Error).message,
    });
    return empty();
  }
};
