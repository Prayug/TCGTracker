/**
 * PSA 10 slab top movers — same idea as raw /top-movers, against graded_price_history.
 * Rank on history first, then attach names/images only for the winners.
 */

import { getDb } from '../db/database';
import {
  cliffPctForPeriod,
  isGradualMove,
  maxEndpointChangePctForPeriod,
  minPointsForPeriod,
} from './topMoversQuality';

export interface SlabMoverEntry {
  productName: string;
  currentPrice: number;
  previousPrice: number;
  changePercent: number;
  uniqueIdentifier: string | null;
  subTypeName: string | null;
  groupName: string | null;
  imageSmall: string | null;
  imageLarge: string | null;
  cardId: string | null;
  setId: string | null;
  setName: string | null;
  cardNumber: string | null;
  rarity: string | null;
  tcgplayerProductId: string | null;
  tcgplayerPrices: string | null;
  productId: number;
  grader: 'PSA';
  grade: '10';
}

export interface SlabTopMoversResult {
  date: string | null;
  days: number;
  grader: 'PSA';
  grade: '10';
  gainers: SlabMoverEntry[];
  losers: SlabMoverEntry[];
}

const TOP_MOVERS_TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, { expiresAt: number; payload: SlabTopMoversResult }>();

const MIN_PRICE = 10;
const MIN_ABS_DOLLAR = 2;
const CANDIDATE_POOL = 400;

type PriceRow = { cardId: string; variantKey: string; price: number; productId: string | null };
type PrevRow = {
  cardId: string;
  variantKey: string;
  prevDate: string;
  prevPrice: number;
  productId: string | null;
};

type CatalogRow = {
  cardId: string;
  variantKey: string;
  cardName: string | null;
  setId: string | null;
  setName: string | null;
  imageSmall: string | null;
  imageLarge: string | null;
  cardNumber: string | null;
  rarity: string | null;
  tcgplayerProductId: string | null;
  tcgplayerPrices: string | null;
};

const dbGet = <T>(sql: string, params: unknown[] = []): Promise<T | undefined> =>
  new Promise((resolve, reject) => {
    getDb().get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row as T | undefined);
    });
  });

const dbAll = <T>(sql: string, params: unknown[] = []): Promise<T[]> =>
  new Promise((resolve, reject) => {
    getDb().all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve((rows || []) as T[]);
    });
  });

export function calendarDaysBetween(fromIso: string, toIso: string): number {
  const a = Date.parse(`${fromIso.slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${toIso.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.round((b - a) / 86_400_000);
}

/** Require a real lookback so 30d is not just an 8-day window relabeled. */
export function minSpanDaysForPeriod(days: number): number {
  if (days <= 1) return 1;
  if (days <= 7) return 3;
  return Math.max(14, Math.floor(days * 0.5));
}

export function seriesKey(cardId: string, variantKey: string): string {
  return `${cardId}::${variantKey || 'normal'}`;
}

/** Unknown product ids are compatible; two known ids must match. */
export function productIdsMatch(a?: string | number | null, b?: string | number | null): boolean {
  if (a == null || b == null || a === '' || b === '') return true;
  return String(a) === String(b);
}

export function seriesHasSingleProduct(
  points: Array<{ productId?: string | number | null }>
): boolean {
  const ids = new Set(
    points
      .map((p) => p.productId)
      .filter((id) => id != null && id !== '')
      .map(String)
  );
  return ids.size <= 1;
}

export async function getSlabTopMovers(days: number, limit: number): Promise<SlabTopMoversResult> {
  const cacheKey = `v2:${days}:${limit}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.payload;
  }

  const empty = (date: string | null): SlabTopMoversResult => ({
    date,
    days,
    grader: 'PSA',
    grade: '10',
    gainers: [],
    losers: [],
  });

  const latestRow = await dbGet<{ maxDate: string }>(
    `SELECT date AS maxDate FROM graded_price_history
     WHERE grader = 'psa' AND grade = '10' AND price > 0
     ORDER BY date DESC LIMIT 1`
  );
  const latestDate = latestRow?.maxDate;
  if (!latestDate) {
    const payload = empty(null);
    cache.set(cacheKey, { expiresAt: Date.now() + TOP_MOVERS_TTL_MS, payload });
    return payload;
  }

  const baselineSlackDays = Math.max(days * 2, days + 3);
  const minSpan = minSpanDaysForPeriod(days);
  const maxEndpointPct = maxEndpointChangePctForPeriod(days);
  const cliffPct = cliffPctForPeriod(days);
  const minPoints = minPointsForPeriod(days);

  const [currentRows, prevDateRow] = await Promise.all([
    dbAll<PriceRow>(
      `SELECT cardId, COALESCE(variantKey, 'normal') AS variantKey, price, productId
       FROM graded_price_history
       WHERE date = ?
         AND grader = 'psa'
         AND grade = '10'
         AND price >= ?
         AND COALESCE(verified, 0) = 1`,
      [latestDate, MIN_PRICE]
    ),
    dbGet<{ prevDate: string }>(
      `SELECT MAX(date) AS prevDate
       FROM graded_price_history
       WHERE grader = 'psa'
         AND grade = '10'
         AND price >= ?
         AND date <= date(?, ?)
         AND date >= date(?, ?)`,
      [MIN_PRICE, latestDate, `-${days} days`, latestDate, `-${baselineSlackDays} days`]
    ),
  ]);

  if (currentRows.length === 0) {
    const payload = empty(latestDate);
    cache.set(cacheKey, { expiresAt: Date.now() + TOP_MOVERS_TTL_MS, payload });
    return payload;
  }

  const prevDate = prevDateRow?.prevDate;
  if (!prevDate || calendarDaysBetween(prevDate, latestDate) < minSpan) {
    const payload = empty(latestDate);
    cache.set(cacheKey, { expiresAt: Date.now() + TOP_MOVERS_TTL_MS, payload });
    return payload;
  }

  const prevRows = await dbAll<PrevRow>(
    `SELECT cardId, COALESCE(variantKey, 'normal') AS variantKey, date AS prevDate, price AS prevPrice, productId
     FROM graded_price_history
     WHERE date = ?
       AND grader = 'psa'
       AND grade = '10'
       AND price >= ?`,
    [prevDate, MIN_PRICE]
  );

  const prevByCard = new Map<string, { price: number; productId: string | null }>();
  for (const prev of prevRows) {
    const key = seriesKey(prev.cardId, prev.variantKey);
    if (!prevByCard.has(key)) {
      prevByCard.set(key, { price: prev.prevPrice, productId: prev.productId ?? null });
    }
  }

  type Ranked = {
    cardId: string;
    variantKey: string;
    currentPrice: number;
    previousPrice: number;
    changePercent: number;
    prevDate: string;
    productId: string | null;
    prevProductId: string | null;
  };
  const ranked: Ranked[] = [];
  for (const current of currentRows) {
    const key = seriesKey(current.cardId, current.variantKey);
    const prev = prevByCard.get(key);
    if (!(prev != null && prev.price >= MIN_PRICE)) continue;
    if (!productIdsMatch(current.productId, prev.productId)) continue;
    const absDollar = Math.abs(current.price - prev.price);
    if (absDollar < MIN_ABS_DOLLAR) continue;
    const changePct = ((current.price - prev.price) / prev.price) * 100;
    if (!Number.isFinite(changePct) || Math.abs(changePct) > maxEndpointPct) continue;
    ranked.push({
      cardId: current.cardId,
      variantKey: current.variantKey || 'normal',
      currentPrice: current.price,
      previousPrice: prev.price,
      changePercent: Math.round(changePct * 100) / 100,
      prevDate,
      productId: current.productId ?? null,
      prevProductId: prev.productId,
    });
  }

  ranked.sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent));
  const candidates = [
    ...ranked.filter((e) => e.changePercent > 0).slice(0, CANDIDATE_POOL),
    ...ranked.filter((e) => e.changePercent < 0).slice(0, CANDIDATE_POOL),
  ];

  if (candidates.length === 0) {
    const payload = empty(latestDate);
    cache.set(cacheKey, { expiresAt: Date.now() + TOP_MOVERS_TTL_MS, payload });
    return payload;
  }

  const ids = [...new Set(candidates.map((c) => c.cardId))];
  const earliestPrev = candidates.reduce(
    (min, c) => (!min || c.prevDate < min ? c.prevDate : min),
    '' as string
  );
  const placeholders = ids.map(() => '?').join(',');
  const pathRows = await dbAll<{
    cardId: string;
    variantKey: string;
    date: string;
    price: number;
    productId: string | null;
  }>(
    `SELECT cardId, COALESCE(variantKey, 'normal') AS variantKey, date, price, productId
     FROM graded_price_history
     WHERE cardId IN (${placeholders})
       AND grader = 'psa'
       AND grade = '10'
       AND date >= ?
       AND date <= ?
       AND price >= ?`,
    [...ids, earliestPrev, latestDate, MIN_PRICE]
  );

  const series = new Map<string, { date: string; price: number; productId: string | null }[]>();
  for (const pr of pathRows) {
    const key = seriesKey(pr.cardId, pr.variantKey);
    const list = series.get(key) || [];
    list.push({ date: pr.date, price: pr.price, productId: pr.productId ?? null });
    series.set(key, list);
  }

  const survivors = candidates.filter((c) => {
    const points = (series.get(seriesKey(c.cardId, c.variantKey)) || []).filter(
      (p) => p.date >= c.prevDate && p.date <= latestDate
    );
    if (!seriesHasSingleProduct(points)) return false;
    return isGradualMove(points, { cliffPct, minPoints });
  });

  survivors.sort((a, b) => b.changePercent - a.changePercent);
  const gainerRank = survivors.filter((e) => e.changePercent > 0).slice(0, limit);
  const loserRank = survivors
    .filter((e) => e.changePercent < 0)
    .sort((a, b) => a.changePercent - b.changePercent)
    .slice(0, limit);

  const [gainers, losers] = await Promise.all([enrichMovers(gainerRank), enrichMovers(loserRank)]);

  const payload: SlabTopMoversResult = {
    date: latestDate,
    days,
    grader: 'PSA',
    grade: '10',
    gainers,
    losers,
  };
  cache.set(cacheKey, { expiresAt: Date.now() + TOP_MOVERS_TTL_MS, payload });
  return payload;
}

async function enrichMovers(
  ranked: Array<{
    cardId: string;
    variantKey?: string;
    currentPrice: number;
    previousPrice: number;
    changePercent: number;
    productId?: string | null;
  }>
): Promise<SlabMoverEntry[]> {
  if (ranked.length === 0) return [];
  const ids = [...new Set(ranked.map((r) => r.cardId))];
  const placeholders = ids.map(() => '?').join(',');

  const [catalog, mapped] = await Promise.all([
    dbAll<CatalogRow>(
      `SELECT
         COALESCE(cc.cardId, gp.cardId) AS cardId,
         COALESCE(gp.variantKey, 'normal') AS variantKey,
         COALESCE(gp.cardName, cc.cardName) AS cardName,
         COALESCE(gp.setId, cc.setId) AS setId,
         COALESCE(gp.setName, cc.setName) AS setName,
         cc.imageSmall,
         cc.imageLarge,
         cc.cardNumber,
         cc.rarity,
         cc.tcgplayerProductId,
         cc.tcgplayerPrices
       FROM graded_prices gp
       LEFT JOIN catalog_cards cc ON cc.cardId = gp.cardId
       WHERE gp.cardId IN (${placeholders})
         AND gp.grader = 'psa'
         AND gp.grade = '10'`,
      ids
    ),
    dbAll<{ cardId: string; imageSmall: string | null; imageLarge: string | null }>(
      `SELECT cardId, MAX(imageSmall) AS imageSmall, MAX(imageLarge) AS imageLarge
       FROM card_mappings
       WHERE cardId IN (${placeholders})
         AND (imageSmall IS NOT NULL OR imageLarge IS NOT NULL)
       GROUP BY cardId`,
      ids
    ),
  ]);

  const catByKey = new Map(catalog.map((r) => [seriesKey(r.cardId, r.variantKey), r]));
  const catById = new Map(catalog.map((r) => [r.cardId, r]));
  const mapById = new Map(mapped.map((r) => [r.cardId, r]));

  return ranked.map((r) => {
    const variantKey = r.variantKey || 'normal';
    const cat = catByKey.get(seriesKey(r.cardId, variantKey)) || catById.get(r.cardId);
    const imgs = mapById.get(r.cardId);
    const imageSmall =
      cat?.imageSmall || imgs?.imageSmall || cat?.imageLarge || imgs?.imageLarge || null;
    const imageLarge = cat?.imageLarge || imgs?.imageLarge || imageSmall;
    const productIdNum = Number.parseInt(String(r.productId || ''), 10);
    return {
      productName: cat?.cardName || r.cardId,
      currentPrice: r.currentPrice,
      previousPrice: r.previousPrice,
      changePercent: r.changePercent,
      uniqueIdentifier: seriesKey(r.cardId, variantKey),
      subTypeName: variantKey,
      groupName: cat?.setName || null,
      imageSmall,
      imageLarge,
      cardId: r.cardId,
      setId: cat?.setId || null,
      setName: cat?.setName || null,
      cardNumber: cat?.cardNumber ?? null,
      rarity: cat?.rarity ?? null,
      tcgplayerProductId: cat?.tcgplayerProductId ?? null,
      tcgplayerPrices: cat?.tcgplayerPrices ?? null,
      productId: Number.isFinite(productIdNum) ? productIdNum : 0,
      grader: 'PSA',
      grade: '10',
    };
  });
}
