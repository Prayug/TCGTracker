/**
 * PSA 10 slab top movers — same idea as raw /top-movers, against graded_price_history.
 * Rank on history first, then attach names/images only for the winners.
 */

import { getDb } from '../db/database';
import {
  calendarDaysBetween,
  cliffPctForPeriod,
  isGradualMove,
  isLoudMover,
  maxEndpointChangePctForPeriod,
  minPointsForPeriod,
  minSpanDaysForPeriod,
} from './topMoversQuality';

export { calendarDaysBetween, minSpanDaysForPeriod } from './topMoversQuality';

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

export interface QualifiedSlabMoversOptions {
  minPrice?: number;
  minAbsDollar?: number;
  candidatePool?: number | 'all';
  cacheNamespace?: string;
  pathFilter?: 'all' | 'loud';
  loudAbsDollar?: number;
  loudAbsPct?: number;
  /** Collapse PSA 10 variants of the same card before path/enrich. */
  collapseByCardId?: boolean;
}

export interface QualifiedSlabMoversResult {
  date: string | null;
  days: number;
  movers: SlabMoverEntry[];
}

const universeCache = new Map<string, { expiresAt: number; payload: QualifiedSlabMoversResult }>();

const SQLITE_IN_CHUNK = 400;

function chunkIds<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Full qualified PSA 10 mover universe (same gates as /top-slab-movers).
 */
export async function listQualifiedSlabMovers(
  days: number,
  options: QualifiedSlabMoversOptions = {}
): Promise<QualifiedSlabMoversResult> {
  const minPrice = options.minPrice ?? MIN_PRICE;
  const minAbsDollar = options.minAbsDollar ?? MIN_ABS_DOLLAR;
  const candidatePool = options.candidatePool ?? CANDIDATE_POOL;
  const pathFilter = options.pathFilter ?? 'all';
  const loudAbsDollar = options.loudAbsDollar ?? 20;
  const loudAbsPct = options.loudAbsPct ?? 20;
  const collapseByCardId = options.collapseByCardId ?? false;
  const cacheKey = `universe:v5:${options.cacheNamespace || 'default'}:${days}:${minPrice}:${minAbsDollar}:${candidatePool}:${pathFilter}:${loudAbsDollar}:${loudAbsPct}:${collapseByCardId}`;
  const cached = universeCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.payload;
  }

  const empty = (date: string | null): QualifiedSlabMoversResult => ({
    date,
    days,
    movers: [],
  });

  const latestRow = await dbGet<{ maxDate: string }>(
    `SELECT date AS maxDate FROM graded_price_history
     WHERE grader = 'psa' AND grade = '10' AND price > 0
     ORDER BY date DESC LIMIT 1`
  );
  const latestDate = latestRow?.maxDate;
  if (!latestDate) {
    const payload = empty(null);
    universeCache.set(cacheKey, { expiresAt: Date.now() + TOP_MOVERS_TTL_MS, payload });
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
      [latestDate, minPrice]
    ),
    dbGet<{ prevDate: string }>(
      `SELECT MAX(date) AS prevDate
       FROM graded_price_history
       WHERE grader = 'psa'
         AND grade = '10'
         AND price >= ?
         AND date <= date(?, ?)
         AND date >= date(?, ?)`,
      [minPrice, latestDate, `-${days} days`, latestDate, `-${baselineSlackDays} days`]
    ),
  ]);

  if (currentRows.length === 0) {
    const payload = empty(latestDate);
    universeCache.set(cacheKey, { expiresAt: Date.now() + TOP_MOVERS_TTL_MS, payload });
    return payload;
  }

  const prevDate = prevDateRow?.prevDate;
  if (!prevDate || calendarDaysBetween(prevDate, latestDate) < minSpan) {
    const payload = empty(latestDate);
    universeCache.set(cacheKey, { expiresAt: Date.now() + TOP_MOVERS_TTL_MS, payload });
    return payload;
  }

  const prevRows = await dbAll<PrevRow>(
    `SELECT cardId, COALESCE(variantKey, 'normal') AS variantKey, date AS prevDate, price AS prevPrice, productId
     FROM graded_price_history
     WHERE date = ?
       AND grader = 'psa'
       AND grade = '10'
       AND price >= ?`,
    [prevDate, minPrice]
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
    if (!(prev != null && prev.price >= minPrice)) continue;
    if (!productIdsMatch(current.productId, prev.productId)) continue;
    const absDollar = Math.abs(current.price - prev.price);
    if (minAbsDollar > 0 && absDollar < minAbsDollar) continue;
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
  let collapsed = ranked;
  if (collapseByCardId) {
    const best = new Map<string, (typeof ranked)[number]>();
    for (const row of ranked) {
      const prev = best.get(row.cardId);
      const abs = Math.abs(row.currentPrice - row.previousPrice);
      const prevAbs = prev ? Math.abs(prev.currentPrice - prev.previousPrice) : -1;
      if (!prev || abs > prevAbs) best.set(row.cardId, row);
    }
    collapsed = [...best.values()];
  }
  const candidates =
    candidatePool === 'all'
      ? collapsed
      : [
          ...collapsed.filter((e) => e.changePercent > 0).slice(0, candidatePool),
          ...collapsed.filter((e) => e.changePercent < 0).slice(0, candidatePool),
        ];

  if (candidates.length === 0) {
    const payload = empty(latestDate);
    universeCache.set(cacheKey, { expiresAt: Date.now() + TOP_MOVERS_TTL_MS, payload });
    return payload;
  }

  const loudOpts = { absDollar: loudAbsDollar, absPct: loudAbsPct };
  const toPathCheck =
    pathFilter === 'loud'
      ? candidates.filter((c) =>
          isLoudMover(c.currentPrice, c.previousPrice, c.changePercent, loudOpts)
        )
      : candidates;
  const quietSurvivors =
    pathFilter === 'loud'
      ? candidates.filter(
          (c) => !isLoudMover(c.currentPrice, c.previousPrice, c.changePercent, loudOpts)
        )
      : [];

  const ids = [...new Set(toPathCheck.map((c) => c.cardId))];
  const earliestPrev = toPathCheck.reduce(
    (min, c) => (!min || c.prevDate < min ? c.prevDate : min),
    '' as string
  );
  const pathRows: {
    cardId: string;
    variantKey: string;
    date: string;
    price: number;
    productId: string | null;
  }[] = [];
  for (const batch of chunkIds(ids, SQLITE_IN_CHUNK)) {
    const placeholders = batch.map(() => '?').join(',');
    const part = await dbAll<{
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
      [...batch, earliestPrev, latestDate, minPrice]
    );
    pathRows.push(...part);
  }

  const series = new Map<string, { date: string; price: number; productId: string | null }[]>();
  for (const pr of pathRows) {
    const key = seriesKey(pr.cardId, pr.variantKey);
    const list = series.get(key) || [];
    list.push({ date: pr.date, price: pr.price, productId: pr.productId ?? null });
    series.set(key, list);
  }

  const loudSurvivors = toPathCheck.filter((c) => {
    const points = (series.get(seriesKey(c.cardId, c.variantKey)) || []).filter(
      (p) => p.date >= c.prevDate && p.date <= latestDate
    );
    if (!seriesHasSingleProduct(points)) return false;
    return isGradualMove(points, { cliffPct, minPoints });
  });
  const survivors = [...quietSurvivors, ...loudSurvivors];

  survivors.sort((a, b) => b.changePercent - a.changePercent);
  const movers = await enrichMovers(survivors);
  const payload: QualifiedSlabMoversResult = { date: latestDate, days, movers };
  universeCache.set(cacheKey, { expiresAt: Date.now() + TOP_MOVERS_TTL_MS, payload });
  return payload;
}

export async function getSlabTopMovers(days: number, limit: number): Promise<SlabTopMoversResult> {
  const cacheKey = `v2:${days}:${limit}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.payload;
  }

  const universe = await listQualifiedSlabMovers(days);
  const gainers = universe.movers.filter((e) => e.changePercent > 0).slice(0, limit);
  const losers = universe.movers
    .filter((e) => e.changePercent < 0)
    .sort((a, b) => a.changePercent - b.changePercent)
    .slice(0, limit);

  const payload: SlabTopMoversResult = {
    date: universe.date,
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
  const catalog: CatalogRow[] = [];
  const mapped: { cardId: string; imageSmall: string | null; imageLarge: string | null }[] = [];
  for (const batch of chunkIds(ids, SQLITE_IN_CHUNK)) {
    const placeholders = batch.map(() => '?').join(',');
    const [catPart, mapPart] = await Promise.all([
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
        batch
      ),
      dbAll<{ cardId: string; imageSmall: string | null; imageLarge: string | null }>(
        `SELECT cardId, MAX(imageSmall) AS imageSmall, MAX(imageLarge) AS imageLarge
         FROM card_mappings
         WHERE cardId IN (${placeholders})
           AND (imageSmall IS NOT NULL OR imageLarge IS NOT NULL)
         GROUP BY cardId`,
        batch
      ),
    ]);
    catalog.push(...catPart);
    mapped.push(...mapPart);
  }

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
