import { getDb } from '../db/database';
import { logger } from '../utils/logger';
import {
  computePriceChanges as computePriceChangesFromHistory,
  computeVolatility as computeVolatilityFromHistory,
  getLatestPrice,
} from './marketAnalyzer';

interface EnrichedCard {
  investmentData?: {
    psaData: {
      population: { grade10: number; grade9: number; grade8: number; grade7: number; total: number };
      prices: { grade10: number; grade9: number; grade8: number; raw: number };
      popReport: { lowPop: boolean; grade10Percentage: number; totalSubmissions: number };
      returnRate: number;
    };
    priceHistory: Array<{ date: string; price: number }>;
    marketAnalysis: {
      trend: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
      volatility: number;
      priceChange30d: number;
      priceChange90d: number;
      priceChange1y: number;
      isUndervalued: boolean;
      isOvervalued: boolean;
      fairValue: number;
      confidence: number;
    };
    investmentScore: number;
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
    recommendation: 'BUY' | 'HOLD' | 'SELL' | 'WATCH';
  };
}

interface PredictionRow {
  card_id: string;
  current_price: number;
  expected_30d_return: number;
  expected_90d_return: number;
  confidence_score: number;
  risk_score: number;
  category: string;
  suggested_action: string;
}

interface PriceHistoryRow {
  date: string;
  price: number;
  marketPrice: number | null;
}

interface CardMappingRow {
  cardId: string;
  uniqueIdentifier: string;
}

function mapCategoryToFlags(category: string): { isUndervalued: boolean; isOvervalued: boolean } {
  switch (category) {
    case 'strong_buy':
    case 'recovery':
      return { isUndervalued: true, isOvervalued: false };
    case 'avoid':
    case 'downtrend':
      return { isUndervalued: false, isOvervalued: true };
    default:
      return { isUndervalued: false, isOvervalued: false };
  }
}

function mapReturnToTrend(expected30dReturn: number): 'BULLISH' | 'BEARISH' | 'NEUTRAL' {
  if (expected30dReturn > 10) return 'BULLISH';
  if (expected30dReturn < -10) return 'BEARISH';
  return 'NEUTRAL';
}

function mapRiskScoreToLevel(riskScore: number): 'LOW' | 'MEDIUM' | 'HIGH' {
  if (riskScore < 40) return 'LOW';
  if (riskScore <= 70) return 'MEDIUM';
  return 'HIGH';
}

function mapSuggestedAction(action: string): 'BUY' | 'HOLD' | 'SELL' | 'WATCH' {
  const upper = action?.toUpperCase() || '';
  if (upper === 'BUY' || upper === 'STRONG BUY') return 'BUY';
  if (upper === 'SELL' || upper === 'AVOID') return 'SELL';
  if (upper === 'HOLD') return 'HOLD';
  return 'WATCH';
}

function computePriceChangesLocal(prices: number[]): { change30d: number; change90d: number; change1y: number } {
  if (prices.length === 0) return { change30d: 0, change90d: 0, change1y: 0 };
  const current = prices[prices.length - 1];
  if (!current || current <= 0) return { change30d: 0, change90d: 0, change1y: 0 };

  const getChange = (daysBack: number): number => {
    const idx = Math.max(0, prices.length - 1 - daysBack);
    const past = prices[idx];
    if (!past || past <= 0) return 0;
    return ((current - past) / past) * 100;
  };

  return {
    change30d: getChange(30),
    change90d: getChange(90),
    change1y: getChange(365),
  };
}

function computeVolatilityLocal(prices: number[]): number {
  if (prices.length < 7) return 0.1;
  const logReturns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    if (prices[i - 1] > 0 && prices[i] > 0) {
      logReturns.push(Math.log(prices[i] / prices[i - 1]));
    }
  }
  if (logReturns.length === 0) return 0.1;
  const mean = logReturns.reduce((a, b) => a + b, 0) / logReturns.length;
  const variance = logReturns.reduce((a, b) => a + (b - mean) ** 2, 0) / logReturns.length;
  return Math.sqrt(variance) * Math.sqrt(30);
}

function computeFairValue(prices: number[]): number {
  if (prices.length === 0) return 0;
  const recent = prices.slice(-30);
  return recent.reduce((a, b) => a + b, 0) / recent.length;
}

/**
 * Fetches card_mappings rows for the given card IDs, returning a map of cardId -> uniqueIdentifier.
 */
async function fetchCardMappings(cardIds: string[]): Promise<Map<string, string>> {
  const db = getDb();
  const map = new Map<string, string>();

  if (cardIds.length === 0) return map;

  // Query in batches to avoid SQLITE_MAX_VARIABLE_NUMBER
  const BATCH_SIZE = 50;
  for (let i = 0; i < cardIds.length; i += BATCH_SIZE) {
    const batch = cardIds.slice(i, i + BATCH_SIZE);
    const placeholders = batch.map(() => '?').join(',');

    const rows: CardMappingRow[] = await new Promise((resolve, reject) => {
      db.all(
        `SELECT cardId, uniqueIdentifier FROM card_mappings
         WHERE cardId IN (${placeholders})
         GROUP BY cardId`,
        batch,
        (err, rows: any[]) => {
          if (err) return reject(err);
          resolve(rows || []);
        }
      );
    });

    for (const row of rows) {
      if (row.cardId && row.uniqueIdentifier) {
        map.set(row.cardId, row.uniqueIdentifier);
      }
    }
  }

  return map;
}

/**
 * Fetches latest predictions for the given card IDs from the most recent prediction run.
 */
async function fetchLatestPredictions(cardIds: string[]): Promise<Map<string, PredictionRow>> {
  const db = getDb();
  const map = new Map<string, PredictionRow>();

  if (cardIds.length === 0) return map;

  const BATCH_SIZE = 50;
  for (let i = 0; i < cardIds.length; i += BATCH_SIZE) {
    const batch = cardIds.slice(i, i + BATCH_SIZE);
    const placeholders = batch.map(() => '?').join(',');

    const rows: PredictionRow[] = await new Promise((resolve, reject) => {
      db.all(
        `SELECT card_id, current_price, expected_30d_return, expected_90d_return,
                confidence_score, risk_score, category, suggested_action
         FROM card_predictions
         WHERE card_id IN (${placeholders})
           AND run_id = (SELECT MAX(id) FROM prediction_runs)`,
        batch,
        (err, rows: any[]) => {
          if (err) return reject(err);
          resolve(rows || []);
        }
      );
    });

    for (const row of rows) {
      map.set(row.card_id, row);
    }
  }

  return map;
}

/**
 * Fetches price history for a batch of uniqueIdentifiers.
 */
async function fetchPriceHistories(
  identifiers: string[]
): Promise<Map<string, PriceHistoryRow[]>> {
  const db = getDb();
  const map = new Map<string, PriceHistoryRow[]>();

  if (identifiers.length === 0) return map;

  const BATCH_SIZE = 50;
  for (let i = 0; i < identifiers.length; i += BATCH_SIZE) {
    const batch = identifiers.slice(i, i + BATCH_SIZE);
    const placeholders = batch.map(() => '?').join(',');

    const rows: Array<{ uniqueIdentifier: string; date: string; price: number; marketPrice: number | null }> =
      await new Promise((resolve, reject) => {
        db.all(
          `SELECT uniqueIdentifier, date, price, marketPrice
           FROM price_history
           WHERE uniqueIdentifier IN (${placeholders})
             AND source IN ('tcgcsv', 'tcgdex', 'catalog_fallback')
           ORDER BY date ASC`,
          batch,
          (err, rows: any[]) => {
            if (err) return reject(err);
            resolve(rows || []);
          }
        );
      });

    for (const row of rows) {
      const existing = map.get(row.uniqueIdentifier) || [];
      existing.push({
        date: row.date,
        price: row.marketPrice ?? row.price ?? 0,
        marketPrice: row.marketPrice,
      });
      map.set(row.uniqueIdentifier, existing);
    }
  }

  return map;
}

/**
 * Enriches an array of PokemonCard objects with investmentData from the backend database.
 * Cards that don't have a matching prediction or price history will not be enriched.
 */
export async function enrichCardsWithInvestmentData<T extends { id?: string; cardId?: string }>(
  cards: T[]
): Promise<(T & { investmentData?: EnrichedCard['investmentData'] })[]> {
  if (cards.length === 0) return cards;

  // Extract card IDs (PokemonCard uses `id`, local DB cards use `cardId`)
  const cardIds = cards
    .map(c => (c as any).id || (c as any).cardId)
    .filter(Boolean) as string[];

  if (cardIds.length === 0) return cards;

  try {
    // 1. Fetch card mappings to get uniqueIdentifiers
    const mappings = await fetchCardMappings(cardIds);

    // 2. Fetch latest predictions
    const predictions = await fetchLatestPredictions(cardIds);

    // 3. Fetch price histories for cards that have mappings
    const uniqueIdentifiers = [...new Set(mappings.values())];
    const priceHistories = await fetchPriceHistories(uniqueIdentifiers);

    // 4. Enrich each card
    return cards.map(card => {
      const cardId = (card as any).id || (card as any).cardId;
      if (!cardId) return card;

      const prediction = predictions.get(cardId);
      const uniqueId = mappings.get(cardId);
      const priceHistory = uniqueId ? priceHistories.get(uniqueId) || [] : [];

      // If no prediction and no price history, skip enrichment
      if (!prediction && priceHistory.length === 0) return card;

      // Build marketAnalysis from prediction + price data
      const prices = priceHistory.map(p => p.price).filter(p => p > 0);
      const { change30d, change90d, change1y } = computePriceChangesLocal(prices);
      const volatility = computeVolatilityLocal(prices);
      const fairValue = computeFairValue(prices);

      const category = prediction?.category || '';
      const expected30dReturn = prediction?.expected_30d_return || 0;
      const { isUndervalued, isOvervalued } = mapCategoryToFlags(category);

      const investmentData: EnrichedCard['investmentData'] = {
        psaData: {
          population: { grade10: 0, grade9: 0, grade8: 0, grade7: 0, total: 0 },
          prices: { grade10: 0, grade9: 0, grade8: 0, raw: prediction?.current_price || 0 },
          popReport: {
            lowPop: false,
            grade10Percentage: 0,
            totalSubmissions: 0,
          },
          returnRate: 0,
        },
        priceHistory: priceHistory.map(p => ({ date: p.date, price: p.price })),
        marketAnalysis: {
          trend: mapReturnToTrend(expected30dReturn),
          volatility,
          priceChange30d: change30d,
          priceChange90d: change90d,
          priceChange1y: change1y,
          isUndervalued,
          isOvervalued,
          fairValue,
          confidence: prediction?.confidence_score || 50,
        },
        investmentScore: prediction?.confidence_score || 50,
        riskLevel: mapRiskScoreToLevel(prediction?.risk_score || 50),
        recommendation: mapSuggestedAction(prediction?.suggested_action || 'WATCH'),
      };

      return { ...card, investmentData };
    });
  } catch (error) {
    logger.error('Error enriching cards with investment data:', error);
    // Return cards without enrichment on error
    return cards;
  }
}
