/**
 * Raw (ungraded) top movers — same uniqueIdentifier, same TCGPlayer feed,
 * price X days ago vs price today. Never mix TCGdex with catalog/csv.
 */

import { getDb } from '../db/database';
import {
  MOVER_FEED_SOURCES,
  calendarDaysBetween,
  cliffPctForPeriod,
  isGradualMove,
  isIsolatedEndpointSpike,
  isUsdMoverFinish,
  maxEndpointChangePctForPeriod,
  minPointsForPeriod,
  minSpanDaysForPeriod,
  pickLockedFeedSource,
} from './topMoversQuality';

export interface RawMoverEntry {
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
}

export interface RawTopMoversResult {
  date: string | null;
  days: number;
  gainers: RawMoverEntry[];
  losers: RawMoverEntry[];
}

const TOP_MOVERS_TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, { expiresAt: number; payload: RawTopMoversResult }>();

const MIN_PRICE = 1;
const MIN_ABS_DOLLAR = 1;
const CANDIDATE_POOL = 400;

const FEED_LIST = MOVER_FEED_SOURCES.map((s) => `'${s}'`).join(', ');

type PriceRow = {
  uniqueIdentifier: string;
  source: string;
  price: number;
  productId: number | null;
  productName: string | null;
  subTypeName: string | null;
  groupName: string | null;
};

type PrevRow = {
  uniqueIdentifier: string;
  source: string;
  prevDate: string;
  prevPrice: number;
};

type CatalogRow = {
  uniqueIdentifier: string;
  cardId: string | null;
  cardName: string | null;
  setId: string | null;
  setName: string | null;
  cardNumber: string | null;
  rarity: string | null;
  imageSmall: string | null;
  imageLarge: string | null;
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

export async function getRawTopMovers(days: number, limit: number): Promise<RawTopMoversResult> {
  const cacheKey = `v5:${days}:${limit}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.payload;
  }

  const empty = (date: string | null): RawTopMoversResult => ({
    date,
    days,
    gainers: [],
    losers: [],
  });

  const latestRow = await dbGet<{ maxDate: string }>(
    `SELECT date AS maxDate FROM price_history
     WHERE source IN (${FEED_LIST}) AND COALESCE(marketPrice, price, 0) > 0
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

  const currentRows = await dbAll<PriceRow>(
    `SELECT uniqueIdentifier, source, COALESCE(marketPrice, price, 0) AS price,
            productId, productName, subTypeName, groupName
     FROM price_history
     WHERE date = ?
       AND source IN (${FEED_LIST})
       AND COALESCE(marketPrice, price, 0) >= ?
       AND uniqueIdentifier IS NOT NULL
       AND TRIM(uniqueIdentifier) <> ''`,
    [latestDate, MIN_PRICE]
  );

  if (currentRows.length === 0) {
    const payload = empty(latestDate);
    cache.set(cacheKey, { expiresAt: Date.now() + TOP_MOVERS_TTL_MS, payload });
    return payload;
  }

  const currentByUid = new Map<string, PriceRow[]>();
  for (const row of currentRows) {
    if (!isUsdMoverFinish(row.subTypeName, row.uniqueIdentifier)) continue;
    const list = currentByUid.get(row.uniqueIdentifier) || [];
    list.push(row);
    currentByUid.set(row.uniqueIdentifier, list);
  }

  const prevRows = await dbAll<PrevRow>(
    `SELECT p.uniqueIdentifier, p.source, p.date AS prevDate,
            COALESCE(p.marketPrice, p.price, 0) AS prevPrice
     FROM price_history p
     JOIN (
       SELECT uniqueIdentifier, source, MAX(date) AS maxDate
       FROM price_history
       WHERE source IN (${FEED_LIST})
         AND COALESCE(marketPrice, price, 0) >= ?
         AND date <= date(?, ?)
         AND date >= date(?, ?)
         AND uniqueIdentifier IS NOT NULL
         AND TRIM(uniqueIdentifier) <> ''
       GROUP BY uniqueIdentifier, source
     ) m ON p.uniqueIdentifier = m.uniqueIdentifier
       AND p.source = m.source
       AND p.date = m.maxDate
     WHERE COALESCE(p.marketPrice, p.price, 0) >= ?`,
    [MIN_PRICE, latestDate, `-${days} days`, latestDate, `-${baselineSlackDays} days`, MIN_PRICE]
  );

  const prevByUidSource = new Map<string, Map<string, { prevPrice: number; prevDate: string }>>();
  for (const prev of prevRows) {
    let bySource = prevByUidSource.get(prev.uniqueIdentifier);
    if (!bySource) {
      bySource = new Map();
      prevByUidSource.set(prev.uniqueIdentifier, bySource);
    }
    if (!bySource.has(prev.source)) {
      bySource.set(prev.source, { prevPrice: prev.prevPrice, prevDate: prev.prevDate });
    }
  }

  type Ranked = {
    uniqueIdentifier: string;
    source: string;
    currentPrice: number;
    previousPrice: number;
    changePercent: number;
    prevDate: string;
    productId: number;
    productName: string;
    subTypeName: string | null;
    groupName: string | null;
  };

  const ranked: Ranked[] = [];
  for (const [uid, currents] of currentByUid) {
    const prevBySource = prevByUidSource.get(uid);
    if (!prevBySource || prevBySource.size === 0) continue;

    const locked = pickLockedFeedSource(
      currents.map((c) => c.source),
      prevBySource.keys()
    );
    if (!locked) continue;

    const current = currents.find((c) => c.source === locked);
    const baseline = prevBySource.get(locked);
    if (!current || !baseline) continue;
    if (calendarDaysBetween(baseline.prevDate, latestDate) < minSpan) continue;
    if (baseline.prevPrice < MIN_PRICE) continue;

    const absDollar = Math.abs(current.price - baseline.prevPrice);
    if (absDollar < MIN_ABS_DOLLAR) continue;
    const changePct = ((current.price - baseline.prevPrice) / baseline.prevPrice) * 100;
    if (!Number.isFinite(changePct) || Math.abs(changePct) > maxEndpointPct) continue;

    ranked.push({
      uniqueIdentifier: uid,
      source: locked,
      currentPrice: current.price,
      previousPrice: baseline.prevPrice,
      changePercent: Math.round(changePct * 100) / 100,
      prevDate: baseline.prevDate,
      productId: current.productId ?? 0,
      productName: current.productName || uid,
      subTypeName: current.subTypeName ?? null,
      groupName: current.groupName ?? null,
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

  const uids = [...new Set(candidates.map((c) => c.uniqueIdentifier))];
  const earliestPrev = candidates.reduce(
    (min, c) => (!min || c.prevDate < min ? c.prevDate : min),
    '' as string
  );
  const placeholders = uids.map(() => '?').join(',');
  const pathRows = await dbAll<{
    uniqueIdentifier: string;
    source: string;
    date: string;
    price: number;
  }>(
    `SELECT uniqueIdentifier, source, date, COALESCE(marketPrice, price, 0) AS price
     FROM price_history
     WHERE uniqueIdentifier IN (${placeholders})
       AND source IN (${FEED_LIST})
       AND date >= ?
       AND date <= ?
       AND COALESCE(marketPrice, price, 0) >= ?`,
    [...uids, earliestPrev, latestDate, MIN_PRICE]
  );

  const series = new Map<string, { date: string; price: number }[]>();
  for (const pr of pathRows) {
    const key = `${pr.uniqueIdentifier}||${pr.source}`;
    const list = series.get(key) || [];
    list.push({ date: pr.date, price: pr.price });
    series.set(key, list);
  }

  const gradualOpts = { cliffPct, minPoints };
  const survivors = candidates.filter((c) => {
    const points = (series.get(`${c.uniqueIdentifier}||${c.source}`) || []).filter(
      (p) => p.date >= c.prevDate && p.date <= latestDate
    );
    if (isIsolatedEndpointSpike(points)) return false;
    return isGradualMove(points, gradualOpts);
  });

  survivors.sort((a, b) => b.changePercent - a.changePercent);
  const gainerRank = survivors.filter((e) => e.changePercent > 0).slice(0, limit);
  const loserRank = survivors
    .filter((e) => e.changePercent < 0)
    .sort((a, b) => a.changePercent - b.changePercent)
    .slice(0, limit);

  const [gainers, losers] = await Promise.all([enrichMovers(gainerRank), enrichMovers(loserRank)]);

  const payload: RawTopMoversResult = { date: latestDate, days, gainers, losers };
  cache.set(cacheKey, { expiresAt: Date.now() + TOP_MOVERS_TTL_MS, payload });
  return payload;
}

async function enrichMovers(
  ranked: Array<{
    uniqueIdentifier: string;
    currentPrice: number;
    previousPrice: number;
    changePercent: number;
    productId: number;
    productName: string;
    subTypeName: string | null;
    groupName: string | null;
  }>
): Promise<RawMoverEntry[]> {
  if (ranked.length === 0) return [];
  const uids = [...new Set(ranked.map((r) => r.uniqueIdentifier))];
  const placeholders = uids.map(() => '?').join(',');

  const mapped = await dbAll<CatalogRow>(
    `SELECT
       cm.uniqueIdentifier,
       cm.cardId,
       cm.cardName,
       cm.setId,
       cm.setName,
       cm.cardNumber,
       COALESCE(NULLIF(TRIM(cm.rarity), ''), cc.rarity) AS rarity,
       COALESCE(NULLIF(cc.imageSmall, ''), NULLIF(cm.imageSmall, '')) AS imageSmall,
       COALESCE(NULLIF(cc.imageLarge, ''), NULLIF(cm.imageLarge, '')) AS imageLarge,
       COALESCE(cm.tcgplayerProductId, CAST(cm.productId AS TEXT), cc.tcgplayerProductId) AS tcgplayerProductId,
       cc.tcgplayerPrices
     FROM card_mappings cm
     LEFT JOIN catalog_cards cc ON cc.cardId = cm.cardId
     WHERE cm.uniqueIdentifier IN (${placeholders})`,
    uids
  );

  const byUid = new Map(mapped.map((r) => [r.uniqueIdentifier, r]));

  return ranked.map((r) => {
    const cat = byUid.get(r.uniqueIdentifier);
    return {
      productName: cat?.cardName || r.productName,
      currentPrice: r.currentPrice,
      previousPrice: r.previousPrice,
      changePercent: r.changePercent,
      uniqueIdentifier: r.uniqueIdentifier,
      subTypeName: r.subTypeName,
      groupName: cat?.setName || r.groupName,
      imageSmall: cat?.imageSmall || cat?.imageLarge || null,
      imageLarge: cat?.imageLarge || cat?.imageSmall || null,
      cardId: cat?.cardId ?? null,
      setId: cat?.setId ?? null,
      setName: cat?.setName || r.groupName,
      cardNumber: cat?.cardNumber ?? null,
      rarity: cat?.rarity ?? null,
      tcgplayerProductId: cat?.tcgplayerProductId ?? null,
      tcgplayerPrices: cat?.tcgplayerPrices ?? null,
      productId: r.productId,
    };
  });
}
