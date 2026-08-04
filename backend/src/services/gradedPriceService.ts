import { getDb } from '../db/database';
import { logger } from '../utils/logger';
import { dbGet, dbAll } from '../db/promisified';
import { resolveProduct } from './priceChartingResolver';
import { ProductMatchInput } from './priceChartingClient';

const CACHE_TTL_MS = 1000 * 60 * 60 * 12;
const HISTORY_TIMEZONE = 'America/New_York';

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

interface CachedRow {
  cardId: string;
  cardName: string;
  setId: string;
  setName: string;
  prices: string;
  fetchedAt: string;
  verified: number;
  productId: string | null;
  matchScore: number | null;
}

const parseCachedPrices = (prices: string): GradedPrice[] =>
  prices.split('||').map((part) => {
    const [grader, grade, price, soldListings] = part.split('::');
    return {
      grader,
      grade,
      price: price ? parseFloat(price) : null,
      soldListings: parseInt(soldListings, 10) || 0,
    };
  });

const resultFromCache = (cached: CachedRow, stale: boolean): GradedPriceResult => {
  const fetchedMs = new Date(cached.fetchedAt + 'Z').getTime();
  const age = Date.now() - fetchedMs;
  return {
    cardId: cached.cardId,
    cardName: cached.cardName,
    setName: cached.setName,
    prices: parseCachedPrices(cached.prices),
    fetchedAt: cached.fetchedAt,
    cached: true,
    verified: cached.verified === 1,
    productId: cached.productId || null,
    matchScore: cached.matchScore != null ? Number(cached.matchScore) : null,
    stale,
    ageHours: Number.isFinite(age) ? Math.max(0, Math.round(age / 3600000)) : null,
  };
};

const serveCachedGradedPrices = (cached: CachedRow, stale: boolean): GradedPriceResult => {
  const result = resultFromCache(cached, stale);
  try {
    snapshotHistoryFromPrices(result.cardId, result.prices, {
      productId: result.productId,
      verified: result.verified,
    });
  } catch (error) {
    logger.warn('Failed to snapshot graded price history from cache', {
      cardId: result.cardId,
      error: (error as Error).message,
    });
  }
  return result;
};

/** Ensure today's history point exists from the live cache (idempotent upsert). */
const snapshotHistoryFromPrices = (
  cardId: string,
  prices: GradedPrice[],
  meta: { productId: string | null; verified: boolean; sourceUrl?: string | null }
): void => {
  const db = getDb();
  const runDate = getHistoryDate();
  const stmt = db.prepare(
    `INSERT INTO graded_price_history
      (cardId, date, grader, grade, price, soldListings, productId, verified, sourceUrl, source)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pricecharting')
     ON CONFLICT(cardId, date, grader, grade) DO UPDATE SET
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
  }
): Promise<void> => {
  const db = getDb();
  const verified = pageData.productId === match.productId;
  const stmt = db.prepare(
    `INSERT OR REPLACE INTO graded_prices
      (cardId, cardName, setId, setName, grader, grade, price, soldListings, fetchedAt, productId, matchScore, verified, sourceUrl)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?, ?, ?, ?)`
  );
  for (const p of pageData.gradedPrices) {
    stmt.run([
      cardId,
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
    ]);
  }
  stmt.finalize();
  snapshotHistoryFromPrices(cardId, pageData.gradedPrices, {
    productId: match.productId,
    verified,
    sourceUrl: match.url,
  });
};

export const getGradedPriceHistory = async (
  cardId: string,
  grader: string,
  grade: string,
  days = 365
): Promise<GradedPriceHistoryResult> => {
  const clampedDays = Math.min(Math.max(days, 1), 2000);
  const rows = await dbAll<{ date: string; price: number; soldListings: number }>(
    `SELECT date, price, COALESCE(soldListings, 0) AS soldListings
     FROM graded_price_history
     WHERE cardId = ?
       AND grader = ?
       AND grade = ?
       AND price IS NOT NULL
       AND price > 0
       AND date >= date('now', ?)
     ORDER BY date ASC`,
    [cardId, grader, grade, `-${clampedDays} days`]
  );

  return {
    cardId,
    grader,
    grade,
    points: rows.map((r) => ({
      date: r.date,
      price: Number(r.price),
      soldListings: Number(r.soldListings) || 0,
    })),
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
  days = 365
): Promise<AllGradedPriceHistoryResult> => {
  const clampedDays = Math.min(Math.max(days, 1), 2000);
  const rows = await dbAll<{
    date: string;
    grader: string;
    grade: string;
    price: number;
    soldListings: number;
  }>(
    `SELECT date, grader, grade, price, COALESCE(soldListings, 0) AS soldListings
     FROM graded_price_history
     WHERE cardId = ?
       AND grader != 'ungraded'
       AND price IS NOT NULL
       AND price > 0
       AND date >= date('now', ?)
     ORDER BY grader ASC, grade ASC, date ASC`,
    [cardId, `-${clampedDays} days`]
  );

  const byKey = new Map<string, GradedPriceHistorySeries>();
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
    }
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
  options?: { allowLiveScrape?: boolean }
): Promise<GradedPriceResult> => {
  const allowLiveScrape = options?.allowLiveScrape !== false;

  const cached = await dbGet<CachedRow>(
    `SELECT cardId, cardName, setId, setName,
            GROUP_CONCAT(grader || '::' || grade || '::' || COALESCE(price, '') || '::' || soldListings, '||') as prices,
            MAX(fetchedAt) as fetchedAt,
            MAX(COALESCE(verified, 0)) as verified,
            MAX(productId) as productId,
            MAX(matchScore) as matchScore
     FROM graded_prices WHERE cardId = ? AND COALESCE(verified, 0) = 1 GROUP BY cardId`,
    [cardId]
  );

  // Stale-while-revalidate: always paint cached slabs immediately.
  // Live PriceCharting scrapes are slow and should never block the modal.
  if (cached?.prices) {
    const fetchedMs = new Date(cached.fetchedAt + 'Z').getTime();
    const age = Date.now() - fetchedMs;
    const fresh = Number.isFinite(age) && age < CACHE_TTL_MS;
    if (fresh || !allowLiveScrape) {
      return serveCachedGradedPrices(cached, !fresh);
    }

    // Kick a background refresh but return cache now.
    void (async () => {
      try {
        const resolved = await resolveProduct(
          { cardName, setId, setName, cardNumber },
          1500
        );
        if (resolved && resolved.pageData.gradedPrices.length > 0) {
          await saveGradedScrape(
            cardId,
            { cardName, setName, cardNumber },
            resolved.match,
            resolved.pageData
          );
        }
      } catch (error) {
        logger.warn('Background graded price refresh failed', {
          cardId,
          error: (error as Error).message,
        });
      }
    })();

    return serveCachedGradedPrices(cached, true);
  }

  const input: ProductMatchInput = {
    cardName,
    setName,
    cardNumber,
  };

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
    const resolved = await resolveProduct({ cardName, setId, setName, cardNumber }, 1500);

    if (!resolved || resolved.pageData.gradedPrices.length === 0) {
      return empty({
        productId: resolved?.pageData.productId ?? null,
        matchScore: resolved?.match.matchScore ?? null,
      });
    }

    const { match, pageData } = resolved;
    const verified = pageData.productId === match.productId;

    await saveGradedScrape(cardId, input, match, pageData);

    return {
      cardId,
      cardName,
      setName: setName || '',
      prices: pageData.gradedPrices,
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
