import { getDb } from '../db/database';
import { logger } from '../utils/logger';
import { classifySetEra } from '../utils/setEra';
import { getGradedHorizonSupportStatus, getGradedPriceHistorySpanDays } from './horizonSupport';
import {
  CardPredictionRow,
  CardQualityFilter,
  PredictionQueryFilters,
  PredictionWindow,
  SourcedPricePoint,
  isPredictionWindow,
  predictSingleCard,
} from './predictionEngine';
import { getCalibrationModels } from './returnCalibration';

export const SLAB_MODEL_VERSION = '4.0.0-slab';
export const SLAB_GRADER = 'psa';
export const SLAB_GRADE = '10';
/** Nightly snapshots are ~1 point/day; 5 points is enough once span clears. */
export const SLAB_MIN_DATA_POINTS = 5;
/**
 * Graded history is our own snapshots, not years of TCGPlayer prints.
 * Requiring 14 days emptied the universe while PSA 10 series only spanned ~8d.
 */
export const SLAB_MIN_SPAN_DAYS = 3;

export const SLAB_QUALITY_FILTER: CardQualityFilter = {
  minPrice: 10,
  maxPrice: 100000,
  minDataPoints: SLAB_MIN_DATA_POINTS,
  minConfidence: 10,
  rarities: [],
  excludeStagnant: false,
};

const WINDOW_RETURN_COLUMNS: Record<PredictionWindow, string> = {
  '7d': 'expected_7d_return',
  '30d': 'expected_30d_return',
  '90d': 'expected_90d_return',
  '180d': 'expected_180d_return',
  '365d': 'expected_365d_return',
};

export { isPredictionWindow };

function all<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  return new Promise((resolve, reject) => {
    getDb().all(sql, params, (err, rows) => (err ? reject(err) : resolve((rows || []) as T[])));
  });
}

function get<T>(sql: string, params: unknown[] = []): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    getDb().get(sql, params, (err, row) => (err ? reject(err) : resolve(row as T | undefined)));
  });
}

function run(sql: string, params: unknown[] = []): Promise<number> {
  return new Promise((resolve, reject) => {
    getDb().run(sql, params, function (this: { lastID: number }, err) {
      if (err) reject(err);
      else resolve(this.lastID);
    });
  });
}

export function slabUid(cardId: string): string {
  return `slab:psa10:${cardId}`;
}

export function preferCatalogOverTcgcsv<T extends { cardId: string; productId?: string | null }>(
  rows: T[]
): T[] {
  const byProduct = new Map<string, T[]>();
  const unique: T[] = [];
  for (const row of rows) {
    const pid = row.productId;
    if (!pid) {
      unique.push(row);
      continue;
    }
    const group = byProduct.get(pid) ?? [];
    group.push(row);
    byProduct.set(pid, group);
  }
  for (const group of byProduct.values()) {
    if (group.length === 1) {
      unique.push(group[0]);
      continue;
    }
    unique.push(group.find((g) => !g.cardId.startsWith('tcgcsv-')) ?? group[0]);
  }
  return unique;
}

export interface SlabUniverseCard {
  cardId: string;
  cardName: string;
  setId: string;
  setName: string;
  cardNumber?: string;
  rarity?: string;
  productId?: string | null;
  uniqueIdentifier: string;
  variantKey: string;
  setReleaseDate?: string | null;
  latestPrice: number;
  dataPointCount: number;
  imageSmall?: string | null;
  imageLarge?: string | null;
}

export async function fetchPsa10History(cardId: string): Promise<SourcedPricePoint[]> {
  const rows = await all<{ date: string; price: number; source?: string }>(
    `SELECT date, price, source
     FROM graded_price_history
     WHERE cardId = ?
       AND LOWER(grader) = ?
       AND grade = ?
       AND price > 0
     ORDER BY date ASC`,
    [cardId, SLAB_GRADER, SLAB_GRADE]
  );
  return rows.map((r) => ({
    date: r.date,
    price: r.price,
    marketPrice: r.price,
    source: r.source || 'pricecharting',
  }));
}

export async function fetchPsa10HistoryUpTo(cardId: string, cutoffDate: string): Promise<SourcedPricePoint[]> {
  const rows = await all<{ date: string; price: number; source?: string }>(
    `SELECT date, price, source
     FROM graded_price_history
     WHERE cardId = ?
       AND LOWER(grader) = ?
       AND grade = ?
       AND price > 0
       AND date <= ?
     ORDER BY date ASC`,
    [cardId, SLAB_GRADER, SLAB_GRADE, cutoffDate]
  );
  return rows.map((r) => ({
    date: r.date,
    price: r.price,
    marketPrice: r.price,
    source: r.source || 'pricecharting',
  }));
}

export async function fetchPsa10PriceNear(
  cardId: string,
  fromDate: string,
  toDate: string
): Promise<number | null> {
  const row = await get<{ price: number }>(
    `SELECT price
     FROM graded_price_history
     WHERE cardId = ?
       AND LOWER(grader) = ?
       AND grade = ?
       AND price > 0
       AND date >= ?
       AND date <= ?
     ORDER BY date DESC
     LIMIT 1`,
    [cardId, SLAB_GRADER, SLAB_GRADE, fromDate, toDate]
  );
  return row?.price ?? null;
}

export async function fetchSlabUniverse(
  filter: CardQualityFilter = SLAB_QUALITY_FILTER
): Promise<SlabUniverseCard[]> {
  const rows = await all<{
    cardId: string;
    cardName: string;
    setId: string | null;
    setName: string | null;
    cardNumber: string | null;
    rarity: string | null;
    productId: string | null;
    latestPrice: number;
    dataPointCount: number;
    setReleaseDate: string | null;
    imageSmall: string | null;
    imageLarge: string | null;
  }>(
    `SELECT
       gp.cardId,
       COALESCE(NULLIF(TRIM(cm.cardName), ''), gp.cardName) AS cardName,
       COALESCE(cm.setId, gp.setId) AS setId,
       COALESCE(cm.setName, gp.setName) AS setName,
       cm.cardNumber,
       COALESCE(NULLIF(TRIM(cm.rarity), ''), cc.rarity) AS rarity,
       gp.productId,
       gp.price AS latestPrice,
       hist.data_point_count AS dataPointCount,
       cc.setReleaseDate,
       MIN(NULLIF(cm.imageSmall, '')) AS imageSmall,
       MIN(NULLIF(cm.imageLarge, '')) AS imageLarge
     FROM graded_prices gp
     LEFT JOIN card_mappings cm ON cm.cardId = gp.cardId
     LEFT JOIN catalog_cards cc ON cc.cardId = gp.cardId
     INNER JOIN (
       SELECT cardId,
              COUNT(*) AS data_point_count,
              MIN(date) AS min_date,
              MAX(date) AS max_date
       FROM graded_price_history
       WHERE LOWER(grader) = 'psa' AND grade = '10' AND price > 0
       GROUP BY cardId
       HAVING data_point_count >= ?
         AND julianday(max_date) - julianday(min_date) >= ?
     ) hist ON hist.cardId = gp.cardId
     WHERE LOWER(gp.grader) = 'psa'
       AND gp.grade = '10'
       AND gp.price >= ?
       AND gp.price <= ?
       AND COALESCE(gp.verified, 0) = 1
       AND COALESCE(NULLIF(TRIM(cm.cardName), ''), gp.cardName) IS NOT NULL
     GROUP BY gp.cardId
     ORDER BY gp.price DESC`,
    [filter.minDataPoints, SLAB_MIN_SPAN_DAYS, filter.minPrice, filter.maxPrice]
  );

  return preferCatalogOverTcgcsv(rows).map((r) => ({
    cardId: r.cardId,
    cardName: r.cardName,
    setId: r.setId || '',
    setName: r.setName || '',
    cardNumber: r.cardNumber || undefined,
    rarity: r.rarity || undefined,
    productId: r.productId,
    uniqueIdentifier: slabUid(r.cardId),
    variantKey: 'psa10',
    setReleaseDate: r.setReleaseDate,
    latestPrice: r.latestPrice,
    dataPointCount: r.dataPointCount,
    imageSmall: r.imageSmall,
    imageLarge: r.imageLarge,
  }));
}

export async function fetchAllPsa10HistoryByCard(): Promise<Map<string, SourcedPricePoint[]>> {
  const rows = await all<{ cardId: string; date: string; price: number; source?: string }>(
    `SELECT cardId, date, price, source
     FROM graded_price_history
     WHERE LOWER(grader) = ? AND grade = ? AND price > 0
     ORDER BY cardId ASC, date ASC`,
    [SLAB_GRADER, SLAB_GRADE]
  );
  const byCard = new Map<string, SourcedPricePoint[]>();
  for (const r of rows) {
    const list = byCard.get(r.cardId) ?? [];
    list.push({
      date: r.date,
      price: r.price,
      marketPrice: r.price,
      source: r.source || 'pricecharting',
    });
    byCard.set(r.cardId, list);
  }
  return byCard;
}

type SlabRunResult = {
  runId: number;
  total: number;
  succeeded: number;
  failed: number;
  historyDays: number;
  historyMinDate: string | null;
  historyMaxDate: string | null;
};

let slabRunLock: Promise<SlabRunResult> | null = null;
let slabRunMeta: { running: boolean; startedAt: string | null; last: SlabRunResult | null } = {
  running: false,
  startedAt: null,
  last: null,
};

export function getSlabPredictionRunStatus(): {
  running: boolean;
  startedAt: string | null;
  last: SlabRunResult | null;
} {
  return { ...slabRunMeta };
}

/** Fire-and-forget so the HTTP request isn't killed by the 30s axios timeout. */
export function startSlabPredictionsInBackground(): { started: boolean; alreadyRunning: boolean } {
  if (slabRunLock) {
    return { started: false, alreadyRunning: true };
  }
  slabRunMeta = { running: true, startedAt: new Date().toISOString(), last: slabRunMeta.last };
  slabRunLock = runSlabPredictions()
    .then((last) => {
      slabRunMeta = { running: false, startedAt: null, last };
      return last;
    })
    .catch((err) => {
      logger.error('Background slab prediction run failed', { error: (err as Error).message });
      slabRunMeta = { running: false, startedAt: null, last: slabRunMeta.last };
      return {
        runId: 0,
        total: 0,
        succeeded: 0,
        failed: 0,
        historyDays: 0,
        historyMinDate: null,
        historyMaxDate: null,
      };
    })
    .finally(() => {
      slabRunLock = null;
    });
  return { started: true, alreadyRunning: false };
}

export async function runSlabPredictions(): Promise<SlabRunResult> {
  const horizonSupport = await getGradedHorizonSupportStatus(true);
  const span = await getGradedPriceHistorySpanDays();
  const runId = await run(
    `INSERT INTO slab_prediction_runs (model_version, notes) VALUES (?, ?)`,
    [
      SLAB_MODEL_VERSION,
      `PSA 10 slab run; historyDays=${horizonSupport.historyDays}; experimental=[${horizonSupport.experimental.join(',')}]`,
    ]
  );

  const cards = await fetchSlabUniverse();
  const historyByCard = await fetchAllPsa10HistoryByCard();
  let succeeded = 0;
  let failed = 0;
  const calibrationModels = await getCalibrationModels();

  const insertStmt = `INSERT OR IGNORE INTO slab_predictions (
    run_id, card_id, prediction_date, current_price,
    predicted_7d_low, predicted_7d_mid, predicted_7d_high,
    predicted_30d_low, predicted_30d_mid, predicted_30d_high,
    predicted_90d_low, predicted_90d_mid, predicted_90d_high,
    predicted_180d_low, predicted_180d_mid, predicted_180d_high,
    predicted_365d_low, predicted_365d_mid, predicted_365d_high,
    expected_7d_return, expected_30d_return, expected_90d_return,
    expected_180d_return, expected_365d_return,
    confidence_score, risk_score, category, suggested_action,
    explanation, risk_factors, external_signals_json, model_version,
    unique_identifier, variant_key, signal_score, grader, grade
  ) VALUES (?, ?, date('now'), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

  for (const card of cards) {
    try {
      const history = historyByCard.get(card.cardId) ?? [];
      const prediction = await predictSingleCard(
        card,
        undefined,
        SLAB_QUALITY_FILTER,
        calibrationModels,
        {
          priceHistory: history,
          skipInvestmentFilter: true,
          skipAuxiliaryLookups: true,
          minDataPoints: SLAB_MIN_DATA_POINTS,
          horizonSupport,
        }
      );
      if (!prediction) {
        failed++;
        continue;
      }

      await run(insertStmt, [
        runId,
        prediction.cardId,
        prediction.currentPrice,
        prediction.predicted7d.low, prediction.predicted7d.mid, prediction.predicted7d.high,
        prediction.predicted30d.low, prediction.predicted30d.mid, prediction.predicted30d.high,
        prediction.predicted90d.low, prediction.predicted90d.mid, prediction.predicted90d.high,
        prediction.predicted180d.low, prediction.predicted180d.mid, prediction.predicted180d.high,
        prediction.predicted365d.low, prediction.predicted365d.mid, prediction.predicted365d.high,
        prediction.expected7dReturn, prediction.expected30dReturn, prediction.expected90dReturn,
        prediction.expected180dReturn, prediction.expected365dReturn,
        prediction.confidenceScore, prediction.riskScore, prediction.category, prediction.suggestedAction,
        prediction.explanation, prediction.riskFactors, prediction.externalSignals, SLAB_MODEL_VERSION,
        prediction.uniqueIdentifier || slabUid(card.cardId), prediction.variantKey || 'psa10',
        prediction.signalScore ?? null, SLAB_GRADER, SLAB_GRADE,
      ]);
      succeeded++;
    } catch (err) {
      logger.warn(`Slab prediction failed for ${card.cardName}:`, err);
      failed++;
    }
  }

  logger.info(`Slab prediction run ${runId} complete: ${succeeded} succeeded, ${failed} failed`, {
    historyDays: horizonSupport.historyDays,
    universe: cards.length,
  });
  if (cards.length === 0) {
    logger.warn('Slab prediction universe was empty', {
      minDataPoints: SLAB_MIN_DATA_POINTS,
      minSpanDays: SLAB_MIN_SPAN_DAYS,
      historyDays: span.days,
      historyMinDate: span.minDate,
      historyMaxDate: span.maxDate,
    });
  }
  try {
    const { updateSlabActualResults } = await import('./slabForwardTest');
    const ft = await updateSlabActualResults();
    logger.info(`Slab forward-test update after prediction run: ${ft.updated} rows`);
  } catch (err) {
    logger.warn('Slab forward-test update after prediction run failed:', err);
  }
  return {
    runId,
    total: cards.length,
    succeeded,
    failed,
    historyDays: span.days,
    historyMinDate: span.minDate,
    historyMaxDate: span.maxDate,
  };
}

async function resolveEraToSetIds(eras: string[]): Promise<string[]> {
  const rows = await all<{ setId: string; setName: string }>(
    `SELECT DISTINCT setId, setName FROM catalog_cards`
  );
  return rows
    .filter((row) => eras.includes(classifySetEra({ id: row.setId, name: row.setName })))
    .map((row) => row.setId);
}

const SLAB_METADATA_JOIN = `
  LEFT JOIN (
    SELECT
      cm.cardId,
      MIN(cm.cardName) AS cardName,
      MIN(cm.setName) AS setName,
      MIN(cm.setId) AS setId,
      MIN(cm.cardNumber) AS cardNumber,
      MIN(COALESCE(NULLIF(TRIM(cm.rarity), ''), NULLIF(TRIM(cc.rarity), ''))) AS rarity,
      MIN(NULLIF(cm.imageLarge, '')) AS imageLarge,
      MIN(NULLIF(cm.imageSmall, '')) AS imageSmall,
      MIN(COALESCE(cm.tcgplayerProductId, CAST(cm.productId AS TEXT))) AS tcgplayerProductId
    FROM card_mappings cm
    LEFT JOIN catalog_cards cc ON cc.cardId = cm.cardId
    GROUP BY cm.cardId
  ) cm ON cm.cardId = sp.card_id
`;

const SLAB_METADATA_SELECT = `
  COALESCE(cm.cardName, sp.card_id) AS cardName,
  COALESCE(cm.setName, '') AS setName,
  COALESCE(cm.setId, '') AS setId,
  COALESCE(cm.cardNumber, '') AS cardNumber,
  COALESCE(cm.rarity, '') AS rarity,
  cm.imageLarge AS imageLarge,
  cm.imageSmall AS imageSmall,
  cm.tcgplayerProductId AS tcgplayerProductId
`;

export async function getLatestSlabPredictions(
  limit: number = 100,
  category?: string,
  filters?: PredictionQueryFilters,
  window: PredictionWindow = '90d'
): Promise<CardPredictionRow[]> {
  let eraSetIds: string[] | null = null;
  if (filters?.eras && filters.eras.length > 0) {
    eraSetIds = await resolveEraToSetIds(filters.eras);
    if (eraSetIds.length === 0) return [];
  }

  let effectiveSetIds = filters?.setIds ?? null;
  if (eraSetIds && effectiveSetIds) {
    effectiveSetIds = effectiveSetIds.filter((id) => eraSetIds!.includes(id));
    if (effectiveSetIds.length === 0) return [];
  } else if (eraSetIds) {
    effectiveSetIds = eraSetIds;
  }

  let sql = `
    SELECT sp.*,
           ${SLAB_METADATA_SELECT}
    FROM slab_predictions sp
    ${SLAB_METADATA_JOIN}
    WHERE sp.run_id = (SELECT MAX(id) FROM slab_prediction_runs)
  `;
  const params: unknown[] = [];

  if (category) {
    sql += ' AND sp.category = ?';
    params.push(category);
  }
  if (filters?.minPrice !== undefined) {
    sql += ' AND sp.current_price >= ?';
    params.push(filters.minPrice);
  }
  if (filters?.maxPrice !== undefined) {
    sql += ' AND sp.current_price <= ?';
    params.push(filters.maxPrice);
  }
  if (filters?.minConfidence !== undefined) {
    sql += ' AND sp.confidence_score >= ?';
    params.push(filters.minConfidence);
  }
  if (effectiveSetIds && effectiveSetIds.length > 0) {
    const placeholders = effectiveSetIds.map(() => '?').join(',');
    sql += ` AND COALESCE(cm.setId, '') IN (${placeholders})`;
    params.push(...effectiveSetIds);
  }
  if (filters?.releaseDateFrom || filters?.releaseDateTo) {
    sql += ` LEFT JOIN (
      SELECT cardId, setReleaseDate FROM catalog_cards GROUP BY cardId
    ) cc_dates ON cc_dates.cardId = sp.card_id`;
    if (filters.releaseDateFrom) {
      sql += ' AND cc_dates.setReleaseDate >= ?';
      params.push(filters.releaseDateFrom);
    }
    if (filters.releaseDateTo) {
      sql += ' AND cc_dates.setReleaseDate <= ?';
      params.push(filters.releaseDateTo);
    }
  }
  if (filters?.search) {
    sql += ' AND cm.cardName LIKE ?';
    params.push(`%${filters.search}%`);
  }

  const sortColumn = (() => {
    switch (filters?.sortBy) {
      case 'confidence': return 'sp.confidence_score';
      case 'price': return 'sp.current_price';
      case 'name': return 'cm.cardName';
      case 'risk': return 'sp.risk_score';
      default: {
        const col = WINDOW_RETURN_COLUMNS[window] ?? WINDOW_RETURN_COLUMNS['90d'];
        return `COALESCE(sp.${col}, sp.expected_90d_return)`;
      }
    }
  })();
  const sortDir = filters?.sortOrder === 'asc' ? 'ASC' : 'DESC';
  sql += ` ORDER BY ${sortColumn} ${sortDir} LIMIT ?`;
  params.push(Math.min(Math.max(limit, 1), 500));

  const rows = await all<any>(sql, params);
  return rows.map((r) => ({
    id: r.id,
    cardId: r.card_id,
    cardName: r.cardName || '',
    setId: r.setId || '',
    setName: r.setName || '',
    cardNumber: r.cardNumber || '',
    rarity: r.rarity || '',
    uniqueIdentifier: r.unique_identifier || slabUid(r.card_id),
    variantKey: r.variant_key || 'psa10',
    imageSmall: r.imageSmall || undefined,
    imageLarge: r.imageLarge || undefined,
    tcgplayerProductId: r.tcgplayerProductId || undefined,
    currentPrice: r.current_price,
    predicted7dLow: r.predicted_7d_low,
    predicted7dMid: r.predicted_7d_mid,
    predicted7dHigh: r.predicted_7d_high,
    predicted30dLow: r.predicted_30d_low,
    predicted30dMid: r.predicted_30d_mid,
    predicted30dHigh: r.predicted_30d_high,
    predicted90dLow: r.predicted_90d_low,
    predicted90dMid: r.predicted_90d_mid,
    predicted90dHigh: r.predicted_90d_high,
    predicted180dLow: r.predicted_180d_low ?? null,
    predicted180dMid: r.predicted_180d_mid ?? null,
    predicted180dHigh: r.predicted_180d_high ?? null,
    predicted365dLow: r.predicted_365d_low ?? null,
    predicted365dMid: r.predicted_365d_mid ?? null,
    predicted365dHigh: r.predicted_365d_high ?? null,
    expected7dReturn: r.expected_7d_return,
    expected30dReturn: r.expected_30d_return,
    expected90dReturn: r.expected_90d_return,
    expected180dReturn: r.expected_180d_return ?? null,
    expected365dReturn: r.expected_365d_return ?? null,
    confidenceScore: r.confidence_score,
    riskScore: r.risk_score,
    category: r.category,
    suggestedAction: r.suggested_action,
    explanation: r.explanation,
    riskFactors: r.risk_factors,
    externalSignals: r.external_signals_json,
    modelVersion: r.model_version,
    signalScore: r.signal_score ?? undefined,
  }));
}

export async function getSlabOverview(): Promise<{
  totalPredictions: number;
  avgConfidence: number;
  avgRisk: number;
  avgExpectedReturn90d: number;
  avgExpectedReturn30d: number;
  marketDirection: 'bullish' | 'bearish' | 'neutral';
  categoryBreakdown: Record<string, number>;
  topGainers: Array<{
    cardId: string;
    cardName: string;
    currentPrice: number;
    expectedReturn: number;
    confidence: number;
    category: string;
  }>;
  topLosers: Array<{
    cardId: string;
    cardName: string;
    currentPrice: number;
    expectedReturn: number;
    confidence: number;
    category: string;
  }>;
  confidenceBuckets: Array<{ bucket: string; count: number }>;
  marketBenchmark90d: number | null;
  marketBenchmark30d: number | null;
}> {
  const latestRun = `(SELECT MAX(id) FROM slab_prediction_runs)`;
  const statsRow = await get<any>(
    `SELECT
      COUNT(*) AS totalPredictions,
      ROUND(AVG(confidence_score), 1) AS avgConfidence,
      ROUND(AVG(risk_score), 1) AS avgRisk,
      ROUND(AVG(expected_90d_return), 4) AS avgExpectedReturn90d,
      ROUND(AVG(expected_30d_return), 4) AS avgExpectedReturn30d,
      SUM(CASE WHEN expected_90d_return > 0.01 THEN 1 ELSE 0 END) AS bullishCount,
      SUM(CASE WHEN expected_90d_return < -0.01 THEN 1 ELSE 0 END) AS bearishCount
     FROM slab_predictions
     WHERE run_id = ${latestRun}`
  );

  const categoryRows = await all<{ category: string; count: number }>(
    `SELECT category, COUNT(*) AS count
     FROM slab_predictions
     WHERE run_id = ${latestRun}
     GROUP BY category
     ORDER BY count DESC`
  );

  const topGainers = await all<any>(
    `SELECT sp.card_id, cm.cardName, sp.current_price, sp.expected_90d_return,
            sp.confidence_score, sp.category
     FROM slab_predictions sp
     LEFT JOIN (
       SELECT cardId, MIN(cardName) AS cardName FROM card_mappings GROUP BY cardId
     ) cm ON cm.cardId = sp.card_id
     WHERE sp.run_id = ${latestRun}
       AND sp.expected_90d_return IS NOT NULL
       AND sp.confidence_score >= 40
     ORDER BY sp.expected_90d_return DESC
     LIMIT 5`
  );

  const topLosers = await all<any>(
    `SELECT sp.card_id, cm.cardName, sp.current_price, sp.expected_90d_return,
            sp.confidence_score, sp.category
     FROM slab_predictions sp
     LEFT JOIN (
       SELECT cardId, MIN(cardName) AS cardName FROM card_mappings GROUP BY cardId
     ) cm ON cm.cardId = sp.card_id
     WHERE sp.run_id = ${latestRun}
       AND sp.expected_90d_return IS NOT NULL
       AND sp.confidence_score >= 40
     ORDER BY sp.expected_90d_return ASC
     LIMIT 5`
  );

  const confidenceBuckets = await all<{ bucket: string; count: number }>(
    `SELECT
        CASE
          WHEN confidence_score >= 80 THEN '80-100'
          WHEN confidence_score >= 60 THEN '60-79'
          WHEN confidence_score >= 40 THEN '40-59'
          WHEN confidence_score >= 20 THEN '20-39'
          ELSE '0-19'
        END AS bucket,
        COUNT(*) AS count
     FROM slab_predictions
     WHERE run_id = ${latestRun}
     GROUP BY bucket
     ORDER BY bucket DESC`
  );

  const bullishCount = statsRow?.bullishCount || 0;
  const bearishCount = statsRow?.bearishCount || 0;
  const totalDirectional = bullishCount + bearishCount;
  let marketDirection: 'bullish' | 'bearish' | 'neutral' = 'neutral';
  if (totalDirectional > 0) {
    const bullishShare = bullishCount / totalDirectional;
    if (bullishShare > 0.55) marketDirection = 'bullish';
    else if (bullishShare < 0.45) marketDirection = 'bearish';
  }

  const calibrationModels = await getCalibrationModels();

  const mapMover = (r: any) => ({
    cardId: r.card_id,
    cardName: r.cardName || r.card_id,
    currentPrice: r.current_price,
    expectedReturn: r.expected_90d_return,
    confidence: r.confidence_score,
    category: r.category,
  });

  return {
    totalPredictions: statsRow?.totalPredictions || 0,
    avgConfidence: statsRow?.avgConfidence || 0,
    avgRisk: statsRow?.avgRisk || 0,
    avgExpectedReturn90d: statsRow?.avgExpectedReturn90d || 0,
    avgExpectedReturn30d: statsRow?.avgExpectedReturn30d || 0,
    marketDirection,
    categoryBreakdown: categoryRows.reduce((acc, row) => {
      acc[row.category] = row.count;
      return acc;
    }, {} as Record<string, number>),
    topGainers: topGainers.map(mapMover),
    topLosers: topLosers.map(mapMover),
    confidenceBuckets,
    marketBenchmark90d: calibrationModels[90]?.marketMedianReturn ?? null,
    marketBenchmark30d: calibrationModels[30]?.marketMedianReturn ?? null,
  };
}

export async function getSlabCardPrediction(cardId: string): Promise<any | null> {
  return get<any>(
    `SELECT sp.*,
            cm.cardName, cm.setName, cm.setId, cm.cardNumber,
            COALESCE(NULLIF(TRIM(cm.rarity), ''), cc.rarity) AS rarity,
            cm.imageSmall, cm.imageLarge, cm.tcgplayerProductId
     FROM slab_predictions sp
     LEFT JOIN (
       SELECT cardId, MIN(cardName) AS cardName, MIN(setName) AS setName, MIN(setId) AS setId,
              MIN(cardNumber) AS cardNumber, MIN(rarity) AS rarity,
              MIN(NULLIF(imageLarge, '')) AS imageLarge,
              MIN(NULLIF(imageSmall, '')) AS imageSmall,
              MIN(COALESCE(tcgplayerProductId, CAST(productId AS TEXT))) AS tcgplayerProductId
       FROM card_mappings
       GROUP BY cardId
     ) cm ON cm.cardId = sp.card_id
     LEFT JOIN catalog_cards cc ON cc.cardId = sp.card_id
     WHERE sp.card_id = ? AND sp.run_id = (SELECT MAX(id) FROM slab_prediction_runs)
     LIMIT 1`,
    [cardId]
  );
}

export async function getSlabPredictionResult(predictionId: number): Promise<any | null> {
  return get<any>(`SELECT * FROM slab_prediction_results WHERE prediction_id = ?`, [predictionId]);
}

export async function updateSlabExplanation(predictionId: number, explanation: string): Promise<void> {
  await run(`UPDATE slab_predictions SET explanation = ? WHERE id = ?`, [explanation, predictionId]);
}
