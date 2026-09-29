/**
 * DB-backed buy thesis service — loads market data, graded/pop, prediction,
 * peers; runs pure analyzer; optionally persists backtest summaries.
 */

import { getDb } from '../../db/database';
import { PREDICTION_SOURCES_SQL, predictionSourceRank } from '../predictionSources';
import type { PricePoint } from '../marketAnalyzer';
import { analyzeBuyThesis } from './analyze';
import { backtestBuyThesis, type BuyThesisBacktestResult } from './backtest';
import { weightsFromEnv } from './weights';
import type { BuyThesisAnalysis, CardMeta, GradedContext, PredictionSignalInput } from './types';
import type { PeerCard } from './comparables';

const all = <T>(sql: string, params: unknown[] = []): Promise<T[]> =>
  new Promise((resolve, reject) => {
    getDb().all(sql, params, (err: Error | null, rows: T[]) => {
      if (err) reject(err);
      else resolve((rows || []) as T[]);
    });
  });

const get = <T>(sql: string, params: unknown[] = []): Promise<T | null> =>
  new Promise((resolve, reject) => {
    getDb().get(sql, params, (err: Error | null, row: T) => {
      if (err) reject(err);
      else resolve((row as T) || null);
    });
  });

interface MappingRow {
  cardId: string;
  cardName: string;
  setId: string | null;
  setName: string | null;
  cardNumber: string | null;
  rarity: string | null;
  uniqueIdentifier: string | null;
  setReleaseDate: string | null;
}

function dedupeByDate(
  rows: Array<{
    date: string;
    price: number;
    marketPrice?: number | null;
    volume?: number | null;
    source?: string;
  }>
): PricePoint[] {
  const byDate = new Map<
    string,
    { date: string; price: number; marketPrice?: number; volume?: number; rank: number }
  >();
  for (const r of rows) {
    const date = r.date.includes('T') ? r.date.split('T')[0] : r.date;
    const price = r.marketPrice ?? r.price;
    if (!(price > 0)) continue;
    const rank = predictionSourceRank(r.source);
    const prev = byDate.get(date);
    if (!prev || rank < prev.rank) {
      byDate.set(date, {
        date,
        price,
        marketPrice: price,
        volume: r.volume ?? undefined,
        rank,
      });
    }
  }
  return [...byDate.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(({ date, price, marketPrice, volume }) => ({ date, price, marketPrice, volume }));
}

async function resolveMapping(cardId: string): Promise<MappingRow | null> {
  return get<MappingRow>(
    `SELECT cm.cardId, cm.cardName, cm.setId, cm.setName, cm.cardNumber,
            COALESCE(NULLIF(TRIM(cm.rarity), ''), cc.rarity) AS rarity,
            cm.uniqueIdentifier, cc.setReleaseDate
     FROM card_mappings cm
     LEFT JOIN catalog_cards cc ON cc.cardId = cm.cardId
     WHERE cm.cardId = ?
     LIMIT 1`,
    [cardId]
  );
}

async function loadPriceHistory(
  uniqueIdentifier: string | null,
  cardId: string
): Promise<{
  points: PricePoint[];
  alternateSourcePrices: number[];
}> {
  if (!uniqueIdentifier) {
    return { points: [], alternateSourcePrices: [] };
  }
  const rows = await all<{
    date: string;
    price: number;
    marketPrice: number | null;
    volume: number | null;
    source: string;
  }>(
    `SELECT date, price, marketPrice, volume, source FROM price_history
     WHERE uniqueIdentifier = ? AND source IN (${PREDICTION_SOURCES_SQL})
     ORDER BY date ASC`,
    [uniqueIdentifier]
  );

  const points = dedupeByDate(rows);

  // Same-day alternate sources for inconsistency check (latest date)
  const alternateSourcePrices: number[] = [];
  if (points.length > 0) {
    const lastDate = points[points.length - 1].date;
    const sameDay = rows.filter((r) => {
      const d = r.date.includes('T') ? r.date.split('T')[0] : r.date;
      return d === lastDate;
    });
    const preferred = points[points.length - 1].price;
    for (const r of sameDay) {
      const p = r.marketPrice ?? r.price;
      if (p > 0 && Math.abs(p - preferred) > 0.001) alternateSourcePrices.push(p);
    }
  }

  // Fallback: try cardId-based history via mappings if empty
  if (points.length === 0) {
    const viaCard = await all<{
      date: string;
      price: number;
      marketPrice: number | null;
      volume: number | null;
      source: string;
    }>(
      `SELECT ph.date, ph.price, ph.marketPrice, ph.volume, ph.source
       FROM price_history ph
       INNER JOIN card_mappings cm ON cm.uniqueIdentifier = ph.uniqueIdentifier
       WHERE cm.cardId = ? AND ph.source IN (${PREDICTION_SOURCES_SQL})
       ORDER BY ph.date ASC`,
      [cardId]
    );
    return { points: dedupeByDate(viaCard), alternateSourcePrices };
  }

  return { points, alternateSourcePrices };
}

async function loadGradedContext(cardId: string): Promise<GradedContext | null> {
  const prices = await all<{
    grader: string;
    grade: string;
    price: number;
    soldListings: number | null;
    listedCount: number | null;
  }>(
    `SELECT grader, grade, price, soldListings, listedCount
     FROM graded_prices
     WHERE cardId = ? AND verified = 1 AND price IS NOT NULL AND price > 0`,
    [cardId]
  );
  if (prices.length === 0) {
    // Still try population alone
  }

  let rawPrice: number | null = null;
  let psa10Price: number | null = null;
  let psa9Price: number | null = null;
  let soldListings: number | null = null;
  let listedCount: number | null = null;

  for (const row of prices) {
    if (row.grader === 'ungraded') rawPrice = row.price;
    if (row.grader === 'psa' && row.grade === '10') {
      psa10Price = row.price;
      soldListings = row.soldListings;
      listedCount = row.listedCount;
    }
    if (row.grader === 'psa' && row.grade === '9') psa9Price = row.price;
  }

  let psa10Pop: number | null = null;
  let psaTotalPop: number | null = null;
  const popRow = await get<{ payload: string }>(
    `SELECT payload FROM population_cache WHERE cardId = ? ORDER BY fetchedAt DESC LIMIT 1`,
    [cardId]
  );
  if (popRow?.payload) {
    try {
      const parsed = JSON.parse(popRow.payload);
      const psa = parsed?.companies?.psa;
      if (psa) {
        if (Array.isArray(psa.pop) && psa.pop.length >= 10) {
          psa10Pop = Number(psa.pop[9]) || null;
        } else if (psa.grade10 != null) {
          psa10Pop = Number(psa.grade10) || null;
        }
        if (typeof psa.total === 'number') psaTotalPop = psa.total;
      }
    } catch {
      // ignore
    }
  }

  if (rawPrice == null && psa10Price == null && psa9Price == null && psa10Pop == null) {
    return null;
  }

  return {
    rawPrice,
    psa10Price,
    psa9Price,
    gradingFeeEstimate: rawPrice != null ? Math.max(20, rawPrice * 0.15) : 25,
    soldListings,
    listedCount,
    psa10Pop,
    psaTotalPop,
  };
}

async function loadPrediction(cardId: string): Promise<PredictionSignalInput | null> {
  const row = await get<{
    expected_30d_return: number | null;
    expected_90d_return: number | null;
    confidence_score: number | null;
    reliability: string | null;
    forecast_approach: string | null;
    forecast_meta_json: string | null;
  }>(
    `SELECT expected_30d_return, expected_90d_return, confidence_score,
            reliability, forecast_approach, forecast_meta_json
     FROM card_predictions
     WHERE card_id = ? AND run_id = (SELECT MAX(id) FROM prediction_runs)
     LIMIT 1`,
    [cardId]
  );
  if (!row) return null;

  let historicalMae: number | null = null;
  if (row.forecast_meta_json) {
    try {
      const meta = JSON.parse(row.forecast_meta_json);
      if (typeof meta?.mae === 'number') historicalMae = meta.mae;
      else if (typeof meta?.modelMae === 'number') historicalMae = meta.modelMae;
    } catch {
      // ignore
    }
  }

  return {
    expected30dReturn: row.expected_30d_return,
    expected90dReturn: row.expected_90d_return,
    confidence: row.confidence_score,
    reliability: (row.reliability as PredictionSignalInput['reliability']) ?? null,
    historicalMae,
    approach: row.forecast_approach,
  };
}

async function loadPeers(meta: CardMeta, limit = 40): Promise<PeerCard[]> {
  if (!meta.rarity && !meta.setId) return [];
  const rows = await all<{
    cardId: string;
    rarity: string | null;
    setId: string | null;
    current_price: number | null;
    expected_30d_return: number | null;
  }>(
    `SELECT cp.card_id AS cardId,
            COALESCE(NULLIF(TRIM(cm.rarity), ''), cc.rarity) AS rarity,
            cm.setId,
            cp.current_price,
            cp.expected_30d_return
     FROM card_predictions cp
     LEFT JOIN card_mappings cm ON cm.cardId = cp.card_id
     LEFT JOIN catalog_cards cc ON cc.cardId = cp.card_id
     WHERE cp.run_id = (SELECT MAX(id) FROM prediction_runs)
       AND cp.card_id != ?
       AND (cm.setId = ? OR COALESCE(NULLIF(TRIM(cm.rarity), ''), cc.rarity) = ?)
     LIMIT ?`,
    [meta.cardId, meta.setId ?? '', meta.rarity ?? '', limit]
  );

  return rows.map((r) => ({
    cardId: r.cardId,
    rarity: r.rarity,
    setId: r.setId,
    currentPrice: r.current_price,
    // Use prediction expected return as peer momentum proxy when true 30d change unavailable
    change30d: r.expected_30d_return != null ? roundPct(r.expected_30d_return * 100) : null,
  }));
}

function roundPct(n: number): number {
  return Math.round(n * 10) / 10;
}

export async function getBuyThesisForCard(cardId: string): Promise<BuyThesisAnalysis | null> {
  const mapping = await resolveMapping(cardId);
  if (!mapping) {
    // Allow analysis with minimal meta if predictions exist
    const predOnly = await get<{ card_id: string }>(
      `SELECT card_id FROM card_predictions WHERE card_id = ? LIMIT 1`,
      [cardId]
    );
    if (!predOnly) return null;
  }

  const meta: CardMeta = {
    cardId,
    cardName: mapping?.cardName || cardId,
    setId: mapping?.setId,
    setName: mapping?.setName,
    rarity: mapping?.rarity,
    cardNumber: mapping?.cardNumber,
    setReleaseDate: mapping?.setReleaseDate,
    game: 'pokemon',
  };

  const { points, alternateSourcePrices } = await loadPriceHistory(
    mapping?.uniqueIdentifier ?? null,
    cardId
  );
  const graded = await loadGradedContext(cardId);
  const prediction = await loadPrediction(cardId);
  const peers = await loadPeers(meta);

  return analyzeBuyThesis({
    meta,
    priceHistory: points,
    graded,
    alternateSourcePrices,
    prediction,
    peers,
    weights: weightsFromEnv(),
  });
}

export async function runBuyThesisBacktestForCard(
  cardId: string
): Promise<BuyThesisBacktestResult | null> {
  const mapping = await resolveMapping(cardId);
  if (!mapping?.uniqueIdentifier) return null;
  const { points } = await loadPriceHistory(mapping.uniqueIdentifier, cardId);
  if (points.length < 30) return null;

  const meta: CardMeta = {
    cardId,
    cardName: mapping.cardName,
    setId: mapping.setId,
    setName: mapping.setName,
    rarity: mapping.rarity,
    cardNumber: mapping.cardNumber,
    setReleaseDate: mapping.setReleaseDate,
  };

  const result = backtestBuyThesis({
    meta,
    priceHistory: points,
    weights: weightsFromEnv(),
    stepDays: 7,
    minHistoryPoints: 14,
  });

  await persistBacktestSummary(result);
  return result;
}

async function persistBacktestSummary(result: BuyThesisBacktestResult): Promise<void> {
  try {
    await new Promise<void>((resolve, reject) => {
      getDb().run(
        `INSERT INTO buy_thesis_backtests (card_id, sample_dates, payload_json, created_at)
         VALUES (?, ?, ?, datetime('now'))`,
        [result.cardId, result.sampleDates, JSON.stringify(result)],
        (err: Error | null) => (err ? reject(err) : resolve())
      );
    });
  } catch {
    // Table may not exist yet in older DBs mid-migration; non-fatal
  }
}

export async function getLatestBuyThesisBacktest(
  cardId: string
): Promise<BuyThesisBacktestResult | null> {
  const row = await get<{ payload_json: string }>(
    `SELECT payload_json FROM buy_thesis_backtests
     WHERE card_id = ? ORDER BY id DESC LIMIT 1`,
    [cardId]
  );
  if (!row?.payload_json) return null;
  try {
    return JSON.parse(row.payload_json) as BuyThesisBacktestResult;
  } catch {
    return null;
  }
}
