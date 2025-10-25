import { getDb } from '../db/database';
import { logger } from '../utils/logger';
import {
  PricePoint,
  computeMovingAverages,
  computePriceChanges,
  computeVolatility,
  computeRecoveryMetrics,
  getLatestPrice,
  getPriceAtDate,
} from './marketAnalyzer';
import {
  computeTrendScore,
  computeRecoveryScore,
  computeDemandScore,
  computeRiskScore,
  computeExternalSignalScore,
  computeExpectedReturns,
  computePriceRanges,
  computeLiquidityScore,
  computeDataQualityScore,
  isRarityInvestmentWorthy,
  hasMeaningfulPriceMovement,
  determineCategory,
  PredictionCategory,
  ScoringScores,
  CardQualityFilter,
  DEFAULT_CARD_QUALITY_FILTER,
} from './predictionEngine';

export interface BacktestCardResult {
  cardId: string;
  cardName: string;
  currentPrice: number;
  predicted90dReturn: number;
  actual90dReturn: number | null;
  error90d: number | null;
  directionCorrect: boolean | null;
  category: PredictionCategory;
  liquidityScore: number;
  dataQualityScore: number;
  riskScore: number;
}

export interface CategoryPerformance {
  category: PredictionCategory;
  count: number;
  avgReturn: number;
  avgPredictedReturn: number;
}

export interface BacktestResult {
  backtestDate: string;
  windowDays: number;
  cardsTested: number;
  directionalAccuracy: number | null;
  mape: number | null;
  top10AvgReturn: number | null;
  marketAvgReturn: number | null;
  strongBuyFalsePositiveRate: number | null;
  avoidAvgReturn: number | null;
  sharpeRatio: number | null;
  maxDrawdown: number | null;
  winRate: number | null;
  profitFactor: number | null;
  categoryPerformance: CategoryPerformance[];
  cardResults: BacktestCardResult[];
}

function fetchPriceHistoryUpToDate(uniqueIdentifier: string, cutoffDate: string): Promise<PricePoint[]> {
  const db = getDb();
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT date, price, marketPrice, volume FROM price_history
       WHERE uniqueIdentifier = ? AND source IN ('tcgcsv', 'tcgdex', 'catalog_fallback')
       AND date <= ?
       ORDER BY date ASC`,
      [uniqueIdentifier, cutoffDate],
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

function fetchFuturePrice(uniqueIdentifier: string, startDate: string, daysAhead: number): Promise<number | null> {
  const db = getDb();
  return new Promise((resolve, reject) => {
    const targetDate = new Date(startDate);
    targetDate.setDate(targetDate.getDate() + daysAhead);
    const targetStr = targetDate.toISOString().split('T')[0];

    db.all(
      `SELECT date, marketPrice, price FROM price_history
       WHERE uniqueIdentifier = ? AND source IN ('tcgcsv', 'tcgdex', 'catalog_fallback')
       AND date >= ? AND date <= ?
       ORDER BY date ASC`,
      [uniqueIdentifier, startDate, targetStr],
      (err, rows: any[]) => {
        if (err) return reject(err);
        if (!rows || rows.length === 0) return resolve(null);

        const closest = rows[rows.length - 1];
        resolve(closest.marketPrice ?? closest.price);
      }
    );
  });
}

export async function runBacktest(
  backtestDate: string,
  windowDays: number = 90,
  cardIdFilter?: string[],
  filter: CardQualityFilter = DEFAULT_CARD_QUALITY_FILTER
): Promise<BacktestResult> {
  const db = getDb();

  let cards: any[] = await new Promise((resolve, reject) => {
    let sql = `SELECT cm.cardId, cm.cardName, cm.setId, cm.setName, cm.cardNumber, cm.rarity, cm.uniqueIdentifier
               FROM card_mappings cm WHERE cm.cardName IS NOT NULL`;
    const params: any[] = [];

    if (cardIdFilter && cardIdFilter.length > 0) {
      sql += ` AND cm.cardId IN (${cardIdFilter.map(() => '?').join(',')})`;
      params.push(...cardIdFilter);
    }

    sql += ` ORDER BY cm.cardName ASC`;

    db.all(sql, params, (err, rows: any[]) => {
      if (err) return reject(err);
      resolve(rows || []);
    });
  });

  const cardResults: BacktestCardResult[] = [];
  let totalDirectionalCorrect = 0;
  let totalDirectionalTests = 0;
  let totalMape = 0;
  let totalMapeCount = 0;
  const returns: number[] = [];

  for (const card of cards) {
    try {
      const uid = card.uniqueIdentifier;
      if (!uid) continue;

      const priceHistory = await fetchPriceHistoryUpToDate(uid, backtestDate);
      if (priceHistory.length < filter.minDataPoints) continue;

      const currentPrice = getLatestPrice(priceHistory);
      if (!currentPrice || currentPrice <= 0) continue;

      if (currentPrice < filter.minPrice || currentPrice > filter.maxPrice) continue;

      if (!isRarityInvestmentWorthy(card.rarity)) continue;

      if (filter.excludeStagnant && !hasMeaningfulPriceMovement(priceHistory)) continue;

      const movingAverages = computeMovingAverages(priceHistory);
      const priceChanges = computePriceChanges(priceHistory);
      const volatility = computeVolatility(priceHistory);
      const recoveryMetrics = computeRecoveryMetrics(priceHistory);

      const liquidityScore = computeLiquidityScore(priceHistory, currentPrice, volatility);
      const dataQualityScore = computeDataQualityScore(priceHistory);

      const trendScore = computeTrendScore(priceChanges, movingAverages, currentPrice);
      const recoveryScore = computeRecoveryScore(recoveryMetrics, priceChanges);
      const demandScore = computeDemandScore(card.rarity, card.cardNumber);
      const riskScore = computeRiskScore(volatility, priceChanges, movingAverages, 0);

      const scores: ScoringScores = {
        trendScore, recoveryScore, demandScore, riskScore,
        externalSignalScore: 0,
        liquidityScore,
        dataQualityScore,
      };

      const expectedReturns = computeExpectedReturns(scores);

      const futurePrice = await fetchFuturePrice(uid, backtestDate, windowDays);
      let actual90dReturn: number | null = null;
      let error90d: number | null = null;
      let directionCorrect: boolean | null = null;

      if (futurePrice && futurePrice > 0) {
        actual90dReturn = (futurePrice - currentPrice) / currentPrice;

        if (expectedReturns.expected90dReturn !== 0 && actual90dReturn !== 0) {
          const predictedDir = expectedReturns.expected90dReturn > 0;
          const actualDir = actual90dReturn > 0;
          directionCorrect = predictedDir === actualDir;
          if (directionCorrect) totalDirectionalCorrect++;
          totalDirectionalTests++;
        }

        error90d = Math.abs(expectedReturns.expected90dReturn - actual90dReturn);
        totalMape += Math.abs(error90d);
        totalMapeCount++;
        returns.push(actual90dReturn);
      }

      const category = determineCategory(scores, expectedReturns.expected90dReturn, priceChanges, recoveryMetrics);

      cardResults.push({
        cardId: card.cardId,
        cardName: card.cardName,
        currentPrice,
        predicted90dReturn: expectedReturns.expected90dReturn,
        actual90dReturn,
        error90d,
        directionCorrect,
        category,
        liquidityScore,
        dataQualityScore,
        riskScore,
      });
    } catch (err) {
      logger.warn(`Backtest failed for ${card.cardName}:`, err);
    }
  }

  const cardsTested = cardResults.length;
  const directionalAccuracy = totalDirectionalTests > 0 ? totalDirectionalCorrect / totalDirectionalTests : null;
  const mape = totalMapeCount > 0 ? totalMape / totalMapeCount : null;

  const top10 = [...cardResults]
    .filter(r => r.predicted90dReturn !== null)
    .sort((a, b) => b.predicted90dReturn - a.predicted90dReturn)
    .slice(0, 10);
  const top10AvgReturn = top10.length > 0
    ? top10.reduce((s, r) => s + (r.actual90dReturn ?? 0), 0) / top10.length
    : null;

  const withActualReturns = cardResults.filter(r => r.actual90dReturn !== null);
  const marketAvgReturn = withActualReturns.length > 0
    ? withActualReturns.reduce((s, r) => s + (r.actual90dReturn ?? 0), 0) / withActualReturns.length
    : null;

  const strongBuyCards = cardResults.filter(r => r.category === 'strong_buy');
  const strongBuyFalsePositive = strongBuyCards.filter(r => r.actual90dReturn !== null && r.actual90dReturn < 0);
  const strongBuyFalsePositiveRate = strongBuyCards.length > 0
    ? strongBuyFalsePositive.length / strongBuyCards.length
    : null;

  const avoidCards = cardResults.filter(r => r.category === 'avoid' && r.actual90dReturn !== null);
  const avoidAvgReturn = avoidCards.length > 0
    ? avoidCards.reduce((s, r) => s + (r.actual90dReturn ?? 0), 0) / avoidCards.length
    : null;

  const winRate = returns.length > 0 ? returns.filter(r => r > 0).length / returns.length : null;

  const gains = returns.filter(r => r > 0);
  const losses = returns.filter(r => r < 0).map(r => Math.abs(r));
  const avgGain = gains.length > 0 ? gains.reduce((a, b) => a + b, 0) / gains.length : 0;
  const avgLoss = losses.length > 0 ? losses.reduce((a, b) => a + b, 0) / losses.length : 0;
  const profitFactor = avgLoss > 0 ? avgGain / avgLoss : null;

  let sharpeRatio: number | null = null;
  let maxDrawdown: number | null = null;
  if (returns.length > 1) {
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((a, r) => a + (r - mean) ** 2, 0) / returns.length;
    const stdDev = Math.sqrt(variance);
    sharpeRatio = stdDev > 0 ? (mean / stdDev) * Math.sqrt(252) : null;

    let peak = 0;
    let maxDd = 0;
    let cumulative = 0;
    for (const r of returns) {
      cumulative += r;
      if (cumulative > peak) peak = cumulative;
      const drawdown = peak - cumulative;
      if (drawdown > maxDd) maxDd = drawdown;
    }
    maxDrawdown = maxDd;
  }

  const categories: PredictionCategory[] = ['strong_buy', 'watch_dip', 'recovery', 'momentum', 'stagnant', 'avoid', 'downtrend'];
  const categoryPerformance: CategoryPerformance[] = categories.map(cat => {
    const catCards = cardResults.filter(r => r.category === cat && r.actual90dReturn !== null);
    const count = catCards.length;
    const avgReturn = count > 0 ? catCards.reduce((s, r) => s + (r.actual90dReturn ?? 0), 0) / count : 0;
    const avgPredictedReturn = count > 0
      ? catCards.filter(r => r.predicted90dReturn !== null).reduce((s, r) => s + r.predicted90dReturn, 0) / count
      : 0;
    return { category: cat, count, avgReturn, avgPredictedReturn };
  });

  const result: BacktestResult = {
    backtestDate,
    windowDays,
    cardsTested,
    directionalAccuracy,
    mape,
    top10AvgReturn,
    marketAvgReturn,
    strongBuyFalsePositiveRate,
    avoidAvgReturn,
    sharpeRatio,
    maxDrawdown,
    winRate,
    profitFactor,
    categoryPerformance,
    cardResults,
  };

  await saveBacktestResult(result);

  return result;
}

async function saveBacktestResult(result: BacktestResult): Promise<void> {
  const db = getDb();
  await new Promise<void>((resolve, reject) => {
    db.run(
      `INSERT INTO backtest_runs
       (backtest_date, window_days, cards_tested, directional_accuracy, mape,
        top10_avg_return, market_avg_return, strong_buy_false_positive_rate,
        avoid_avg_return, sharpe_ratio, max_drawdown, win_rate, profit_factor,
        category_performance)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        result.backtestDate,
        result.windowDays,
        result.cardsTested,
        result.directionalAccuracy,
        result.mape,
        result.top10AvgReturn,
        result.marketAvgReturn,
        result.strongBuyFalsePositiveRate,
        result.avoidAvgReturn,
        result.sharpeRatio,
        result.maxDrawdown,
        result.winRate,
        result.profitFactor,
        JSON.stringify(result.categoryPerformance),
      ],
      function (err) {
        if (err) reject(err);
        else resolve();
      }
    );
  });
}

export async function getBacktestResults(): Promise<any[]> {
  const db = getDb();
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT * FROM backtest_runs ORDER BY created_at DESC LIMIT 20`,
      [],
      (err, rows: any[]) => {
        if (err) return reject(err);
        resolve(rows.map(r => ({
          ...r,
          category_performance: (() => {
            try {
              return r.category_performance ? JSON.parse(r.category_performance) : [];
            } catch {
              return [];
            }
          })(),
        })));
      }
    );
  });
}
