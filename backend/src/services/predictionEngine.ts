import { getDb } from '../db/database';
import { logger } from '../utils/logger';
import {
  PricePoint,
  computeMovingAverages,
  computePriceChanges,
  computeVolatility,
  findSupportResistance,
  computeRecoveryMetrics,
  getLatestPrice,
} from './marketAnalyzer';
import { searchExternalSignals } from './externalSignalService';

export type PredictionCategory =
  | 'strong_buy'
  | 'watch_dip'
  | 'recovery'
  | 'momentum'
  | 'stagnant'
  | 'avoid'
  | 'downtrend';

export interface ScoringScores {
  trendScore: number;
  recoveryScore: number;
  demandScore: number;
  riskScore: number;
  externalSignalScore: number;
  liquidityScore: number;
  dataQualityScore: number;
}

export interface PriceRange {
  low: number;
  mid: number;
  high: number;
}

export interface CardPrediction {
  cardId: string;
  cardName: string;
  setName: string;
  setId: string;
  cardNumber?: string;
  rarity?: string;
  currentPrice: number;
  predicted7d: PriceRange;
  predicted30d: PriceRange;
  predicted90d: PriceRange;
  expected7dReturn: number;
  expected30dReturn: number;
  expected90dReturn: number;
  confidenceScore: number;
  riskScore: number;
  category: PredictionCategory;
  suggestedAction: string;
  explanation: string;
  riskFactors: string;
  externalSignals: string;
  modelVersion: string;
}

export interface CardPredictionRow {
  id: number;
  cardId: string;
  cardName: string;
  setId: string;
  setName: string;
  cardNumber: string;
  rarity: string;
  imageSmall?: string;
  imageLarge?: string;
  tcgplayerProductId?: string;
  currentPrice: number;
  predicted7dLow: number;
  predicted7dMid: number;
  predicted7dHigh: number;
  predicted30dLow: number;
  predicted30dMid: number;
  predicted30dHigh: number;
  predicted90dLow: number;
  predicted90dMid: number;
  predicted90dHigh: number;
  expected7dReturn: number;
  expected30dReturn: number;
  expected90dReturn: number;
  confidenceScore: number;
  riskScore: number;
  category: PredictionCategory;
  suggestedAction: string;
  explanation: string;
  riskFactors: string;
  externalSignals: string;
  modelVersion: string;
}

const MODEL_VERSION = '2.0.0';

export interface CardQualityFilter {
  minPrice: number;
  maxPrice: number;
  minDataPoints: number;
  minConfidence: number;
  rarities: string[];
  excludeStagnant: boolean;
}

export const DEFAULT_CARD_QUALITY_FILTER: CardQualityFilter = {
  minPrice: 2.0,
  maxPrice: 10000,
  minDataPoints: 14,
  minConfidence: 30,
  rarities: [
    'Rare Holo',
    'Rare Ultra',
    'Rare Secret',
    'Ultra Rare',
    'Secret Rare',
    'Double Rare',
    'Illustration Rare',
    'Special Illustration Rare',
    'Hyper Rare',
  ],
  excludeStagnant: true,
};

export interface PredictionQueryFilters {
  minPrice?: number;
  maxPrice?: number;
  rarities?: string[];
  minConfidence?: number;
}

const RARITY_SQL_PATTERNS: Record<string, string> = {
  'Rare Holo': '%Rare Holo%',
  'Rare Ultra': '%Rare Ultra%',
  'Rare Secret': '%Rare Secret%',
  'Ultra Rare': '%Ultra Rare%',
  'Secret Rare': '%Secret Rare%',
  'Double Rare': '%Double Rare%',
  'Illustration Rare': '%Illustration Rare%',
  'Special Illustration Rare': '%Special Illustration%',
  'Hyper Rare': '%Hyper Rare%',
};

function buildRarityWhereClause(
  column: string,
  rarities: string[]
): { clause: string; params: string[] } {
  if (rarities.length === 0) return { clause: '1=1', params: [] };

  const conditions: string[] = [];
  const params: string[] = [];

  for (const rarity of rarities) {
    const pattern = RARITY_SQL_PATTERNS[rarity] ?? `%${rarity}%`;
    conditions.push(`${column} LIKE ?`);
    params.push(pattern);
  }

  return { clause: `(${conditions.join(' OR ')})`, params };
}

export function isRarityInvestmentWorthy(rarity?: string): boolean {
  if (!rarity) return false;

  const lower = rarity.toLowerCase().trim();
  if (lower === 'common' || lower === 'uncommon') return false;

  const worthyPatterns = [
    'rare holo',
    'rare ultra',
    'rare secret',
    'ultra rare',
    'secret rare',
    'double rare',
    'illustration rare',
    'special illustration',
    'hyper rare',
    'rainbow rare',
    'gold rare',
  ];

  if (worthyPatterns.some(p => lower.includes(p))) return true;

  if (lower === 'rare') return false;

  return lower.includes('vmax') || lower.includes('vstar') ||
    (lower.includes('holo') && lower.includes('rare'));
}

export function hasMeaningfulPriceMovement(priceHistory: PricePoint[]): boolean {
  if (priceHistory.length < 2) return false;

  const prices = priceHistory.map(p => p.price ?? p.marketPrice ?? 0).filter(p => p > 0);
  if (prices.length < 2) return false;

  const min = Math.min(...prices);
  const max = Math.max(...prices);
  if (min <= 0) return false;

  const rangePct = ((max - min) / min) * 100;
  return rangePct >= 5;
}

export function isCardInvestmentWorthy(
  card: { rarity?: string },
  priceHistory: PricePoint[],
  currentPrice: number | null,
  filter: CardQualityFilter = DEFAULT_CARD_QUALITY_FILTER
): boolean {
  if (!currentPrice || currentPrice < filter.minPrice || currentPrice > filter.maxPrice) {
    return false;
  }

  if (!isRarityInvestmentWorthy(card.rarity)) return false;

  if (priceHistory.length < filter.minDataPoints) return false;

  if (filter.excludeStagnant && !hasMeaningfulPriceMovement(priceHistory)) {
    return false;
  }

  return true;
}

export function computeLiquidityScore(
  priceHistory: PricePoint[],
  currentPrice: number,
  volatility: { dailyVolatility: number; monthlyVolatility: number }
): number {
  const dataPointScore = Math.min(100, (priceHistory.length / 90) * 100);

  const stabilityScore = Math.max(0, 100 - volatility.monthlyVolatility * 200);

  const priceLevelScore =
    currentPrice >= 100 ? 100 :
    currentPrice >= 50 ? 85 :
    currentPrice >= 20 ? 70 :
    currentPrice >= 10 ? 55 :
    currentPrice >= 5 ? 40 :
    currentPrice >= 2 ? 25 : 10;

  const lastDate = priceHistory[priceHistory.length - 1]?.date;
  let recencyScore = 50;
  if (lastDate) {
    const daysSince = (Date.now() - new Date(lastDate).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSince <= 3) recencyScore = 100;
    else if (daysSince <= 7) recencyScore = 85;
    else if (daysSince <= 14) recencyScore = 65;
    else if (daysSince <= 30) recencyScore = 40;
    else recencyScore = 20;
  }

  const score =
    0.30 * dataPointScore +
    0.25 * stabilityScore +
    0.25 * priceLevelScore +
    0.20 * recencyScore;

  return Math.round(Math.max(0, Math.min(100, score)));
}

export function computeDataQualityScore(priceHistory: PricePoint[]): number {
  if (priceHistory.length < 2) return 0;

  let score = 100;

  const gaps: number[] = [];
  for (let i = 1; i < priceHistory.length; i++) {
    const d1 = new Date(priceHistory[i - 1].date).getTime();
    const d2 = new Date(priceHistory[i].date).getTime();
    gaps.push((d2 - d1) / (1000 * 60 * 60 * 24));
  }

  const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  const maxGap = Math.max(...gaps);
  if (avgGap > 7) score -= 20;
  else if (avgGap > 4) score -= 10;
  if (maxGap > 30) score -= 15;
  else if (maxGap > 14) score -= 8;

  const prices = priceHistory.map(p => p.price ?? p.marketPrice ?? 0).filter(p => p > 0);
  if (prices.length >= 3) {
    const mean = prices.reduce((a, b) => a + b, 0) / prices.length;
    const variance = prices.reduce((a, p) => a + (p - mean) ** 2, 0) / prices.length;
    const stdDev = Math.sqrt(variance);
    if (stdDev > 0) {
      const outlierCount = prices.filter(p => Math.abs(p - mean) > 3 * stdDev).length;
      score -= Math.min(25, outlierCount * 5);
    }
  }

  for (let i = 1; i < priceHistory.length - 1; i++) {
    const prev = priceHistory[i - 1].price ?? priceHistory[i - 1].marketPrice ?? 0;
    const curr = priceHistory[i].price ?? priceHistory[i].marketPrice ?? 0;
    const next = priceHistory[i + 1].price ?? priceHistory[i + 1].marketPrice ?? 0;
    if (prev > 0 && curr > 0 && next > 0) {
      const spikeUp = (curr - prev) / prev;
      const revert = (curr - next) / curr;
      if (spikeUp > 0.5 && revert > 0.3) score -= 15;

      const spikeDown = (prev - curr) / prev;
      const recover = (next - curr) / curr;
      if (spikeDown > 0.5 && recover > 0.3) score -= 10;
    }
  }

  return Math.max(0, Math.min(100, score));
}

/** One mapping row per cardId — images are persisted on card_mappings by the backfill pipeline. */
const CARD_METADATA_JOIN = `
  LEFT JOIN (
    SELECT
      cm.cardId,
      MIN(cm.cardName) AS cardName,
      MIN(cm.setName) AS setName,
      MIN(cm.setId) AS setId,
      MIN(cm.cardNumber) AS cardNumber,
      MIN(cm.rarity) AS rarity,
      MIN(COALESCE(NULLIF(cm.imageLarge, ''), NULLIF(cm.image_large, ''))) AS imageLarge,
      MIN(COALESCE(NULLIF(cm.imageSmall, ''), NULLIF(cm.image_small, ''))) AS imageSmall,
      MIN(COALESCE(cm.tcgplayerProductId, CAST(cm.productId AS TEXT))) AS tcgplayerProductId
    FROM card_mappings cm
    GROUP BY cm.cardId
  ) cm ON cm.cardId = cp.card_id
`;

export function computeTrendScore(
  priceChanges: { change30d: number | null; change90d: number | null },
  movingAverages: { ma7: number | null; ma30: number | null; ma90: number | null },
  currentPrice: number | null
): number {
  if (!currentPrice || currentPrice <= 0) return 0;

  let score = 50;

  if (priceChanges.change30d !== null) {
    if (priceChanges.change30d > 20) score += 25;
    else if (priceChanges.change30d > 10) score += 15;
    else if (priceChanges.change30d > 5) score += 8;
    else if (priceChanges.change30d > 0) score += 3;
    else if (priceChanges.change30d < -20) score -= 25;
    else if (priceChanges.change30d < -10) score -= 15;
    else if (priceChanges.change30d < -5) score -= 8;
    else score -= 3;
  }

  if (priceChanges.change90d !== null) {
    if (priceChanges.change90d > 30) score += 20;
    else if (priceChanges.change90d > 15) score += 12;
    else if (priceChanges.change90d > 5) score += 5;
    else if (priceChanges.change90d < -30) score -= 20;
    else if (priceChanges.change90d < -15) score -= 12;
    else if (priceChanges.change90d < -5) score -= 5;
  }

  if (movingAverages.ma7 !== null && movingAverages.ma30 !== null && movingAverages.ma30 > 0) {
    const maRatio = movingAverages.ma7 / movingAverages.ma30;
    if (maRatio > 1.05) score += 15;
    else if (maRatio > 1.02) score += 8;
    else if (maRatio < 0.95) score -= 15;
    else if (maRatio < 0.98) score -= 8;
  }

  if (movingAverages.ma30 !== null && movingAverages.ma90 !== null && movingAverages.ma90 > 0) {
    const maRatio = movingAverages.ma30 / movingAverages.ma90;
    if (maRatio > 1.05) score += 10;
    else if (maRatio < 0.95) score -= 10;
  }

  return Math.max(0, Math.min(100, score));
}

export function computeRecoveryScore(
  recoveryMetrics: {
    recentDrop: number | null;
    hasStabilized: boolean;
    daysSinceBottom: number | null;
    priorRecoveryPattern: boolean;
  },
  priceChanges: { change7d: number | null }
): number {
  let score = 50;

  if (recoveryMetrics.recentDrop !== null && recoveryMetrics.recentDrop < -15) {
    score += 20;

    if (recoveryMetrics.hasStabilized) {
      score += 20;
    }

    if (recoveryMetrics.daysSinceBottom !== null && recoveryMetrics.daysSinceBottom > 0) {
      if (recoveryMetrics.daysSinceBottom <= 7) score += 10;
      else if (recoveryMetrics.daysSinceBottom <= 14) score += 5;
    }

    if (recoveryMetrics.priorRecoveryPattern) {
      score += 15;
    }

    if (priceChanges.change7d !== null && priceChanges.change7d > 0) {
      score += 10;
    }
  } else if (recoveryMetrics.recentDrop !== null && recoveryMetrics.recentDrop < -5) {
    score += 10;
    if (recoveryMetrics.hasStabilized) score += 10;
  }

  return Math.max(0, Math.min(100, score));
}

export function computeDemandScore(
  rarity?: string,
  cardNumber?: string
): number {
  let score = 50;

  if (rarity) {
    const lowerRarity = rarity.toLowerCase();
    if (lowerRarity.includes('secret') || lowerRarity.includes('rainbow') || lowerRarity.includes('gold')) {
      score += 20;
    } else if (lowerRarity.includes('ultra') || lowerRarity.includes('alt')) {
      score += 15;
    } else if (lowerRarity.includes('holo') || lowerRarity.includes('vmax') || lowerRarity.includes('vstar')) {
      score += 10;
    } else if (lowerRarity.includes('rare')) {
      score += 5;
    }
  }

  if (cardNumber) {
    if (cardNumber.toUpperCase().startsWith('TG')) score += 10;
    const num = parseInt(cardNumber, 10);
    if (!isNaN(num) && num > 200) score += 5;
  }

  return Math.max(0, Math.min(100, score));
}

export function computeRiskScore(
  volatility: { dailyVolatility: number; weeklyVolatility: number; monthlyVolatility: number },
  priceChanges: { change7d: number | null; change30d: number | null },
  movingAverages: { ma7: number | null; ma30: number | null },
  externalSignalScore: number
): number {
  let score = 30;

  if (volatility.monthlyVolatility > 0.3) score += 25;
  else if (volatility.monthlyVolatility > 0.2) score += 15;
  else if (volatility.monthlyVolatility > 0.1) score += 8;
  else score -= 5;

  if (priceChanges.change7d !== null && priceChanges.change7d > 30) {
    score += 20;
  } else if (priceChanges.change7d !== null && priceChanges.change7d > 15) {
    score += 10;
  }

  if (priceChanges.change30d !== null && priceChanges.change30d > 50) {
    score += 15;
  } else if (priceChanges.change30d !== null && priceChanges.change30d > 30) {
    score += 8;
  }

  if (movingAverages.ma7 !== null && movingAverages.ma30 !== null && movingAverages.ma30 > 0) {
    const spread = Math.abs(movingAverages.ma7 - movingAverages.ma30) / movingAverages.ma30;
    if (spread > 0.15) score += 10;
  }

  if (externalSignalScore < 0) {
    score += Math.abs(externalSignalScore);
  }

  return Math.max(0, Math.min(100, score));
}

export function computeExternalSignalScore(
  signals: Array<{ sentiment: number; type: string }>
): number {
  if (signals.length === 0) return 0;

  let totalScore = 0;

  for (const signal of signals) {
    if (signal.type === 'reprint') totalScore -= 15;
    else if (signal.type === 'upcoming_set') totalScore += 8;
    else if (signal.type === 'tournament_meta') totalScore += 10;
    else if (signal.type === 'character_hype') totalScore += 10;
    else if (signal.type === 'influencer') totalScore -= 5;
    else if (signal.type === 'manipulation') totalScore -= 20;
    else if (signal.type === 'buyout') totalScore -= 10;
    else if (signal.type === 'announcement') totalScore += 5;
    else if (signal.type === 'leak') totalScore += 3;

    totalScore += signal.sentiment * 5;
  }

  return Math.max(-30, Math.min(20, totalScore));
}

export function computeExpectedReturns(
  scores: ScoringScores
): { expected7dReturn: number; expected30dReturn: number; expected90dReturn: number } {
  const trendN = scores.trendScore / 100;
  const recoveryN = scores.recoveryScore / 100;
  const demandN = scores.demandScore / 100;
  const riskN = scores.riskScore / 100;
  const liquidityN = scores.liquidityScore / 100;
  const dataQualityN = scores.dataQualityScore / 100;

  const raw30d =
    0.30 * trendN +
    0.25 * recoveryN +
    0.20 * demandN -
    0.10 * riskN +
    0.10 * liquidityN +
    0.05 * dataQualityN;

  const expected30dReturn = (raw30d - 0.40) * 0.4;
  const expected7dReturn = expected30dReturn * 0.35;
  const expected90dReturn = expected30dReturn * 1.8;

  return { expected7dReturn, expected30dReturn, expected90dReturn };
}

export function computePriceRanges(
  currentPrice: number,
  expectedReturn: number,
  volatility: number,
  days: number,
  confidence: number
): PriceRange {
  const mid = currentPrice * (1 + expectedReturn);
  const confidenceFactor = (100 - confidence + 50) / 100;
  const volAdjustment = volatility * Math.sqrt(days / 365) * 1.96 * confidenceFactor;
  const low = mid * (1 - volAdjustment);
  const high = mid * (1 + volAdjustment);

  return {
    low: Math.round(low * 100) / 100,
    mid: Math.round(mid * 100) / 100,
    high: Math.round(high * 100) / 100,
  };
}

export function determineCategory(
  scores: ScoringScores,
  expected90dReturn: number,
  priceChanges: { change30d: number | null; change90d: number | null },
  recoveryMetrics: { recentDrop: number | null; hasStabilized: boolean }
): PredictionCategory {
  const liquidityPenalty = scores.liquidityScore < 30 ? 10 : scores.liquidityScore < 50 ? 5 : 0;
  const qualityBonus = scores.dataQualityScore > 70 ? -5 : 0;

  if (expected90dReturn >= 0.15 && scores.riskScore < 70 && scores.liquidityScore >= 40) {
    return 'strong_buy';
  }

  if (expected90dReturn >= 0.08 && expected90dReturn < 0.15 && scores.riskScore < 75 && scores.liquidityScore >= 35) {
    return 'watch_dip';
  }

  if (recoveryMetrics.recentDrop !== null && recoveryMetrics.recentDrop <= -15 && recoveryMetrics.hasStabilized && scores.liquidityScore >= 30) {
    return 'recovery';
  }

  if (priceChanges.change30d !== null && priceChanges.change30d >= 8 && scores.liquidityScore >= 35) {
    return 'momentum';
  }

  if (scores.riskScore > 75 + qualityBonus) {
    return 'avoid';
  }

  if (priceChanges.change90d !== null && priceChanges.change90d <= -15) {
    return 'downtrend';
  }

  const changeMagnitude = Math.abs(priceChanges.change90d ?? 0);
  if (changeMagnitude < 3 && scores.liquidityScore < 50) {
    return 'stagnant';
  }

  return expected90dReturn > 0 ? 'watch_dip' : 'stagnant';
}

export function generateSuggestedAction(category: PredictionCategory, scores: ScoringScores): string {
  switch (category) {
    case 'strong_buy':
      return 'Buy at current levels';
    case 'watch_dip':
      return 'Watch / Buy on dips';
    case 'recovery':
      return 'Buy near support levels';
    case 'momentum':
      return 'Hold / Take partial profits';
    case 'stagnant':
      return 'Hold no position / Look elsewhere';
    case 'avoid':
      return 'Avoid / Reduce position';
    case 'downtrend':
      return 'Sell / Avoid';
    default:
      return 'No recommendation available';
  }
}

export function generateExplanation(
  category: PredictionCategory,
  scores: ScoringScores,
  priceChanges: { change7d: number | null; change30d: number | null; change90d: number | null },
  recoveryMetrics: { recentDrop: number | null; hasStabilized: boolean; priorRecoveryPattern: boolean },
  movingAverages: { ma7: number | null; ma30: number | null; ma90: number | null },
  currentPrice: number | null,
  externalSignals: string
): string {
  const parts: string[] = [];
  const hasExternal = externalSignals && externalSignals !== '[]' && !externalSignals.includes('unavailable');

  if (scores.trendScore > 60) {
    if (priceChanges.change90d !== null && priceChanges.change90d > 0) {
      parts.push(`Up ${priceChanges.change90d.toFixed(0)}% over 90 days`);
    }
    if (movingAverages.ma7 !== null && movingAverages.ma30 !== null && movingAverages.ma30 > 0) {
      const maRatio = ((movingAverages.ma7 - movingAverages.ma30) / movingAverages.ma30 * 100);
      if (Math.abs(maRatio) > 2) {
        parts.push(`price is ${maRatio > 0 ? 'above' : 'below'} its 30-day moving average by ${Math.abs(maRatio).toFixed(1)}%`);
      }
    }
  }

  if (category === 'recovery' && recoveryMetrics.recentDrop !== null) {
    parts.push(`dropped ${Math.abs(recoveryMetrics.recentDrop).toFixed(0)}% recently`);
    if (recoveryMetrics.hasStabilized) parts.push('price has stabilized');
    if (recoveryMetrics.priorRecoveryPattern) parts.push('similar past drops recovered strongly');
  }

  if (category === 'momentum' && priceChanges.change30d !== null && priceChanges.change30d > 10) {
    parts.push(`strong ${priceChanges.change30d.toFixed(0)}% gain over 30 days`);
  }

  if (category === 'avoid' && scores.riskScore > 75) {
    parts.push('high volatility and risk score');
  }

  if (category === 'downtrend') {
    if (movingAverages.ma30 !== null && movingAverages.ma90 !== null && movingAverages.ma90 > 0) {
      if (movingAverages.ma30 < movingAverages.ma90) {
        parts.push('price below both 30-day and 90-day moving averages');
      }
    }
    if (priceChanges.change90d !== null) {
      parts.push(`down ${Math.abs(priceChanges.change90d).toFixed(0)}% over 90 days`);
    }
  }

  if (category === 'stagnant') {
    parts.push('minimal price movement with no clear trend');
  }

  if (hasExternal) {
    parts.push('external signals analyzed');
  }

  if (parts.length === 0) {
    return 'No clear signals detected. Prediction is based on available historical price data.';
  }

  return parts.join('. ') + '.';
}

export function generateRiskFactors(
  scores: ScoringScores,
  volatility: { monthlyVolatility: number },
  priceChanges: { change7d: number | null },
  externalSignals: string
): string {
  const risks: string[] = [];

  if (scores.riskScore > 70) risks.push('high overall risk');
  if (volatility.monthlyVolatility > 0.2) risks.push('high price volatility');
  if (priceChanges.change7d !== null && priceChanges.change7d > 20) {
    risks.push('recent pump may be unsustainable');
  }

  const hasExternal = externalSignals && externalSignals !== '[]' && !externalSignals.includes('unavailable');
  if (hasExternal && externalSignals.includes('reprint')) {
    risks.push('possible reprint risk');
  }

  if (risks.length === 0) {
    return 'Low identifiable risk factors.';
  }

  return risks.join('; ') + '.';
}

function fetchCardPriceHistory(uniqueIdentifier: string): Promise<PricePoint[]> {
  const db = getDb();
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT date, price, marketPrice, volume FROM price_history
       WHERE uniqueIdentifier = ? AND source IN ('tcgcsv', 'tcgdex', 'catalog_fallback')
       ORDER BY date ASC`,
      [uniqueIdentifier],
      (err, rows: any[]) => {
        if (err) return reject(err);
        resolve(rows.map(r => ({
          date: r.date,
          price: r.price ?? 0,
          marketPrice: r.marketPrice ?? r.price,
          volume: r.volume,
        })));
      }
    );
  });
}

function fetchAllCards(filter: CardQualityFilter = DEFAULT_CARD_QUALITY_FILTER): Promise<any[]> {
  const db = getDb();
  const { clause: rarityClause, params: rarityParams } = buildRarityWhereClause('cm.rarity', filter.rarities);

  return new Promise((resolve, reject) => {
    db.all(
      `SELECT cm.cardId, cm.cardName, cm.setId, cm.setName, cm.cardNumber, cm.rarity,
              cm.uniqueIdentifier, ph_stats.latest_price, ph_stats.data_point_count
       FROM card_mappings cm
       INNER JOIN (
         SELECT
           ph.uniqueIdentifier,
           COUNT(DISTINCT ph.date) AS data_point_count,
           (
             SELECT COALESCE(ph2.marketPrice, ph2.price)
             FROM price_history ph2
             WHERE ph2.uniqueIdentifier = ph.uniqueIdentifier
               AND ph2.source IN ('tcgcsv', 'tcgdex', 'catalog_fallback')
             ORDER BY ph2.date DESC
             LIMIT 1
           ) AS latest_price
         FROM price_history ph
         WHERE ph.source IN ('tcgcsv', 'tcgdex', 'catalog_fallback')
         GROUP BY ph.uniqueIdentifier
         HAVING data_point_count >= ?
           AND latest_price >= ?
           AND latest_price <= ?
       ) ph_stats ON ph_stats.uniqueIdentifier = cm.uniqueIdentifier
       WHERE cm.cardName IS NOT NULL AND TRIM(cm.cardName) <> ''
         AND ${rarityClause}
       ORDER BY cm.cardName ASC`,
      [filter.minDataPoints, filter.minPrice, filter.maxPrice, ...rarityParams],
      (err, rows: any[]) => {
        if (err) return reject(err);
        resolve(rows || []);
      }
    );
  });
}

export async function predictSingleCard(
  card: { cardId: string; cardName: string; setId: string; setName: string; cardNumber?: string; rarity?: string; uniqueIdentifier?: string },
  allCardReturns?: Array<{ name: string; rarity: string; avgReturn90d: number }>,
  filter: CardQualityFilter = DEFAULT_CARD_QUALITY_FILTER
): Promise<CardPrediction | null> {
  try {
    const uid = card.uniqueIdentifier;
    if (!uid) return null;

    const priceHistory = await fetchCardPriceHistory(uid);
    if (priceHistory.length < filter.minDataPoints) return null;

    const currentPrice = getLatestPrice(priceHistory);
    if (!currentPrice || currentPrice <= 0) return null;

    if (!isCardInvestmentWorthy(card, priceHistory, currentPrice, filter)) {
      return null;
    }

    const movingAverages = computeMovingAverages(priceHistory);
    const priceChanges = computePriceChanges(priceHistory);
    const volatility = computeVolatility(priceHistory);
    const supportResistance = findSupportResistance(priceHistory);
    const recoveryMetrics = computeRecoveryMetrics(priceHistory);

    const liquidityScore = computeLiquidityScore(priceHistory, currentPrice, volatility);
    const dataQualityScore = computeDataQualityScore(priceHistory);

    const externalSignals = await searchExternalSignals(card.cardName, card.setName);
    const externalSignalScore = computeExternalSignalScore(externalSignals);

    const trendScore = computeTrendScore(priceChanges, movingAverages, currentPrice);
    const recoveryScore = computeRecoveryScore(recoveryMetrics, priceChanges);
    const demandScore = computeDemandScore(card.rarity, card.cardNumber);

    const riskScore = computeRiskScore(volatility, priceChanges, movingAverages, externalSignalScore);

    const scores: ScoringScores = {
      trendScore,
      recoveryScore,
      demandScore,
      riskScore,
      externalSignalScore,
      liquidityScore,
      dataQualityScore,
    };

    const expectedReturns = computeExpectedReturns(scores);

    const baseConfidence = Math.max(20, Math.min(95,
      50
      + (trendScore > 60 ? 10 : trendScore > 40 ? 5 : 0)
      + (priceHistory.length > 90 ? 15 : priceHistory.length > 30 ? 8 : priceHistory.length > 14 ? 3 : 0)
      + (demandScore > 60 ? 10 : 0)
      + (liquidityScore > 60 ? 8 : liquidityScore > 40 ? 4 : 0)
      + (dataQualityScore > 70 ? 5 : dataQualityScore > 50 ? 2 : 0)
      - (riskScore > 70 ? 10 : riskScore > 50 ? 5 : 0)
      - (priceHistory.length < 14 ? 15 : priceHistory.length < 30 ? 5 : 0)
      - (dataQualityScore < 40 ? 10 : dataQualityScore < 60 ? 5 : 0)
    ));

    const volatilityAdjust = volatility.monthlyVolatility;
    let confidenceScore = Math.max(10, Math.min(95, Math.round(baseConfidence * (1 - volatilityAdjust * 0.5))));

    if (confidenceScore < filter.minConfidence) return null;

    const category = determineCategory(scores, expectedReturns.expected90dReturn, priceChanges, recoveryMetrics);

    const predicted7d = computePriceRanges(currentPrice, expectedReturns.expected7dReturn, volatility.dailyVolatility, 7, confidenceScore);
    const predicted30d = computePriceRanges(currentPrice, expectedReturns.expected30dReturn, volatility.dailyVolatility, 30, confidenceScore);
    const predicted90d = computePriceRanges(currentPrice, expectedReturns.expected90dReturn, volatility.dailyVolatility, 90, confidenceScore);

    const externalSignalsJson = JSON.stringify(externalSignals);

    const explanation = generateExplanation(
      category, scores, priceChanges, recoveryMetrics, movingAverages, currentPrice, externalSignalsJson
    );

    const riskFactors = generateRiskFactors(scores, volatility, priceChanges, externalSignalsJson);

    const suggestedAction = generateSuggestedAction(category, scores);

    return {
      cardId: card.cardId,
      cardName: card.cardName,
      setName: card.setName,
      setId: card.setId,
      cardNumber: card.cardNumber,
      rarity: card.rarity,
      currentPrice,
      predicted7d,
      predicted30d,
      predicted90d,
      expected7dReturn: expectedReturns.expected7dReturn,
      expected30dReturn: expectedReturns.expected30dReturn,
      expected90dReturn: expectedReturns.expected90dReturn,
      confidenceScore,
      riskScore,
      category,
      suggestedAction,
      explanation,
      riskFactors,
      externalSignals: externalSignalsJson,
      modelVersion: MODEL_VERSION,
    };
  } catch (err) {
    logger.error(`Prediction failed for card ${card.cardId}:`, err);
    return null;
  }
}

export async function runPredictions(): Promise<{ runId: number; total: number; succeeded: number; failed: number }> {
  const db = getDb();
  const runId: number = await new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO prediction_runs (model_version, notes) VALUES (?, ?)`,
      [MODEL_VERSION, 'Scheduled prediction run'],
      function (err) {
        if (err) reject(err);
        else resolve(this.lastID);
      }
    );
  });

  const cards = await fetchAllCards();
  let succeeded = 0;
  let failed = 0;

  const insertStmt = `INSERT INTO card_predictions (
    run_id, card_id, prediction_date, current_price,
    predicted_7d_low, predicted_7d_mid, predicted_7d_high,
    predicted_30d_low, predicted_30d_mid, predicted_30d_high,
    predicted_90d_low, predicted_90d_mid, predicted_90d_high,
    expected_7d_return, expected_30d_return, expected_90d_return,
    confidence_score, risk_score, category, suggested_action,
    explanation, risk_factors, external_signals_json, model_version
  ) VALUES (?, ?, date('now'), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

  for (const card of cards) {
    try {
      const prediction = await predictSingleCard(card);
      if (!prediction) {
        failed++;
        continue;
      }

      await new Promise<void>((resolve, reject) => {
        db.run(insertStmt, [
          runId, prediction.cardId, prediction.currentPrice,
          prediction.predicted7d.low, prediction.predicted7d.mid, prediction.predicted7d.high,
          prediction.predicted30d.low, prediction.predicted30d.mid, prediction.predicted30d.high,
          prediction.predicted90d.low, prediction.predicted90d.mid, prediction.predicted90d.high,
          prediction.expected7dReturn, prediction.expected30dReturn, prediction.expected90dReturn,
          prediction.confidenceScore, prediction.riskScore, prediction.category, prediction.suggestedAction,
          prediction.explanation, prediction.riskFactors, prediction.externalSignals, prediction.modelVersion,
        ], function (err) {
          if (err) reject(err);
          else resolve();
        });
      });

      succeeded++;
    } catch (err) {
      logger.warn(`Prediction failed for ${card.cardName}:`, err);
      failed++;
    }
  }

  logger.info(`Prediction run ${runId} complete: ${succeeded} succeeded, ${failed} failed`);
  return { runId, total: cards.length, succeeded, failed };
}

export async function getLatestPredictions(
  limit: number = 100,
  category?: string,
  filters?: PredictionQueryFilters
): Promise<CardPredictionRow[]> {
  const db = getDb();
  let sql = `
    SELECT cp.*, cm.cardName, cm.setName, cm.setId, cm.cardNumber, cm.rarity,
           cm.imageSmall, cm.imageLarge, cm.tcgplayerProductId
    FROM card_predictions cp
    ${CARD_METADATA_JOIN}
    WHERE cp.run_id = (SELECT MAX(id) FROM prediction_runs)
  `;
  const params: any[] = [];

  if (category) {
    sql += ' AND cp.category = ?';
    params.push(category);
  }

  if (filters?.minPrice !== undefined) {
    sql += ' AND cp.current_price >= ?';
    params.push(filters.minPrice);
  }

  if (filters?.maxPrice !== undefined) {
    sql += ' AND cp.current_price <= ?';
    params.push(filters.maxPrice);
  }

  if (filters?.minConfidence !== undefined) {
    sql += ' AND cp.confidence_score >= ?';
    params.push(filters.minConfidence);
  }

  if (filters?.rarities && filters.rarities.length > 0) {
    const { clause, params: rarityParams } = buildRarityWhereClause('cm.rarity', filters.rarities);
    sql += ` AND ${clause}`;
    params.push(...rarityParams);
  }

  sql += ' ORDER BY cp.expected_90d_return DESC LIMIT ?';
  params.push(limit);

  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows: any[]) => {
      if (err) return reject(err);
      resolve(rows.map(r => ({
        id: r.id,
        cardId: r.card_id,
        cardName: r.cardName || '',
        setId: r.setId || '',
        setName: r.setName || '',
        cardNumber: r.cardNumber || '',
        rarity: r.rarity || '',
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
        expected7dReturn: r.expected_7d_return,
        expected30dReturn: r.expected_30d_return,
        expected90dReturn: r.expected_90d_return,
        confidenceScore: r.confidence_score,
        riskScore: r.risk_score,
        category: r.category as PredictionCategory,
        suggestedAction: r.suggested_action,
        explanation: r.explanation,
        riskFactors: r.risk_factors,
        externalSignals: r.external_signals_json,
        modelVersion: r.model_version,
      })));
    });
  });
}
