import { getDb } from '../db/database';
import { logger } from '../utils/logger';
import {
  PricePoint,
  computeMovingAverages,
  computePriceChanges,
  computeVolatility,
  computeRecoveryMetrics,
  getLatestPrice,
  computeMarketBenchmark,
} from './marketAnalyzer';
import { computeValidationMetrics } from './validationMetrics';
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
  dedupePriceHistoryByDate,
  PredictionCategory,
  ScoringScores,
  CardQualityFilter,
  DEFAULT_CARD_QUALITY_FILTER,
} from './predictionEngine';
import { CalibrationModel, strongBuyThresholdForHorizon } from './returnCalibration';

export interface BacktestCardResult {
  cardId: string;
  cardName: string;
  currentPrice: number;
  /** Expected return for the backtest window (7/30/90/180/365 days). */
  predictedReturn: number;
  actualReturn: number | null;
  error: number | null;
  directionCorrect: boolean | null;
  category: PredictionCategory;
  liquidityScore: number;
  dataQualityScore: number;
  riskScore: number;
  /** Raw composite signal used for calibration (~[-1, 1]). */
  signalScore?: number;
}

export const SUPPORTED_BACKTEST_WINDOWS = [7, 30, 90, 180, 365] as const;

/** Picks the expected return matching a backtest window from the engine output. */
export function expectedReturnForWindow(
  returns: {
    expected7dReturn: number;
    expected30dReturn: number;
    expected90dReturn: number;
    expected180dReturn: number;
    expected365dReturn: number;
  },
  windowDays: number
): number {
  if (windowDays <= 7) return returns.expected7dReturn;
  if (windowDays <= 30) return returns.expected30dReturn;
  if (windowDays <= 90) return returns.expected90dReturn;
  if (windowDays <= 180) return returns.expected180dReturn;
  return returns.expected365dReturn;
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
  marketMedianReturn: number | null;
  marketReturnStdDev: number | null;
  strongBuyFalsePositiveRate: number | null;
  avoidAvgReturn: number | null;
  sharpeRatio: number | null;
  maxDrawdown: number | null;
  winRate: number | null;
  profitFactor: number | null;
  categoryPerformance: CategoryPerformance[];
  cardResults: BacktestCardResult[];
  /** Spearman rank correlation between predicted and actual returns. */
  rankIC: number | null;
  /** Median signed bias (predicted - actual); positive = overprediction. */
  meanBias: number | null;
  /** Skill-relative hit rate (direction correct + error < 0.5x actual move). */
  hitRate: number | null;
  /** Average realized return of every tested card (buy-and-hold baseline). */
  baselineAvgReturn: number | null;
  /** top10AvgReturn - baselineAvgReturn: does picking the model's top picks add value? */
  modelAlpha: number | null;
}

function fetchPriceHistoryUpToDate(uniqueIdentifier: string, cutoffDate: string): Promise<PricePoint[]> {
  const db = getDb();
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT date, price, marketPrice, volume, source FROM price_history
       WHERE uniqueIdentifier = ? AND source IN ('tcgcsv', 'tcgdex', 'catalog_fallback')
       AND date <= ?
       ORDER BY date ASC`,
      [uniqueIdentifier, cutoffDate],
      (err, rows: any[]) => {
        if (err) return reject(err);
        // Prefer live TCGdex quotes over catalog/legacy dumps on duplicate days.
        resolve(dedupePriceHistoryByDate(rows.map(r => ({
          date: r.date,
          price: r.price ?? 0,
          marketPrice: r.marketPrice ?? r.price,
          volume: r.volume,
          source: r.source,
        }))));
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
      `SELECT date, marketPrice, price, source FROM price_history
       WHERE uniqueIdentifier = ? AND source IN ('tcgcsv', 'tcgdex', 'catalog_fallback')
       AND date >= ? AND date <= ?
       ORDER BY date ASC`,
      [uniqueIdentifier, startDate, targetStr],
      (err, rows: any[]) => {
        if (err) return reject(err);
        if (!rows || rows.length === 0) return resolve(null);

        // Require a quote within the window, preferring the highest-priority
        // source for the final day so legacy dumps don't override live quotes.
        const byDate = new Map<string, { price: number; rank: number }>();
        const sourceRank: Record<string, number> = { tcgdex: 0, catalog_fallback: 1, tcgcsv: 2 };
        for (const r of rows) {
          const price = r.marketPrice ?? r.price;
          if (!price || price <= 0) continue;
          const date = r.date.includes('T') ? r.date.split('T')[0] : r.date;
          const rank = sourceRank[r.source] ?? 9;
          const existing = byDate.get(date);
          if (!existing || rank < existing.rank) {
            byDate.set(date, { price, rank });
          }
        }
        const sortedDays = [...byDate.entries()].sort((a, b) => a[0].localeCompare(b[0]));
        if (sortedDays.length === 0) return resolve(null);
        resolve(sortedDays[sortedDays.length - 1][1].price);
      }
    );
  });
}

export async function runBacktest(
  backtestDate: string,
  windowDays: number = 90,
  cardIdFilter?: string[],
  filter: CardQualityFilter = DEFAULT_CARD_QUALITY_FILTER,
  sampleSize?: number,
  calibrationModels?: Record<number, CalibrationModel | null>
): Promise<BacktestResult> {
  const db = getDb();

  let cards: any[] = await new Promise((resolve, reject) => {
    // Rarity falls back to catalog_cards — card_mappings often has blank rarity,
    // and without a resolved rarity isRarityInvestmentWorthy() rejects every card.
    let sql = `SELECT cm.cardId, cm.cardName, cm.setId, cm.setName, cm.cardNumber,
                      COALESCE(NULLIF(TRIM(cm.rarity), ''), cc.rarity) AS rarity,
                      cm.uniqueIdentifier
               FROM card_mappings cm
               LEFT JOIN catalog_cards cc ON cc.cardId = cm.cardId
               WHERE cm.cardName IS NOT NULL`;
    const params: any[] = [];

    if (cardIdFilter && cardIdFilter.length > 0) {
      sql += ` AND cm.cardId IN (${cardIdFilter.map(() => '?').join(',')})`;
      params.push(...cardIdFilter);
    }

    if (sampleSize && sampleSize > 0 && (!cardIdFilter || cardIdFilter.length === 0)) {
      // Random subset keeps calibration harvests bounded. Restrict to rows that
      // actually have price history so random draws aren't 84% wasted on
      // catalog-only cards that fail minDataPoints immediately.
      sql += ` AND cm.cardId IN (
        SELECT cm2.cardId FROM card_mappings cm2
        WHERE cm2.cardName IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM price_history ph
            WHERE ph.uniqueIdentifier = cm2.uniqueIdentifier
              AND ph.source IN ('tcgcsv', 'tcgdex', 'catalog_fallback')
          )
        ORDER BY RANDOM() LIMIT ?
      )`;
      params.push(sampleSize);
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

      const expectedReturns = computeExpectedReturns(scores, 0, calibrationModels);
      const predictedReturn = expectedReturnForWindow(expectedReturns, windowDays);

      const futurePrice = await fetchFuturePrice(uid, backtestDate, windowDays);
      let actualReturn: number | null = null;
      let error: number | null = null;
      let directionCorrect: boolean | null = null;

      if (futurePrice && futurePrice > 0) {
        actualReturn = (futurePrice - currentPrice) / currentPrice;

        if (predictedReturn !== 0 && actualReturn !== 0) {
          const predictedDir = predictedReturn > 0;
          const actualDir = actualReturn > 0;
          directionCorrect = predictedDir === actualDir;
          if (directionCorrect) totalDirectionalCorrect++;
          totalDirectionalTests++;
        }

        error = Math.abs(predictedReturn - actualReturn);
        totalMape += error;
        totalMapeCount++;
        returns.push(actualReturn);
      }

      const category = determineCategory(
        scores,
        expectedReturns.expected90dReturn,
        priceChanges,
        recoveryMetrics,
        strongBuyThresholdForHorizon(90, calibrationModels)
      );

      cardResults.push({
        cardId: card.cardId,
        cardName: card.cardName,
        currentPrice,
        predictedReturn,
        actualReturn,
        error,
        directionCorrect,
        category,
        liquidityScore,
        dataQualityScore,
        riskScore,
        signalScore: expectedReturns.rawSignal,
      });
    } catch (err) {
      logger.warn(`Backtest failed for ${card.cardName}:`, err);
    }
  }

  const cardsTested = cardResults.length;
  const directionalAccuracy = totalDirectionalTests > 0 ? totalDirectionalCorrect / totalDirectionalTests : null;
  const mape = totalMapeCount > 0 ? totalMape / totalMapeCount : null;

  const top10 = [...cardResults]
    .filter(r => r.predictedReturn !== null && r.actualReturn !== null)
    .sort((a, b) => b.predictedReturn - a.predictedReturn)
    .slice(0, 10);
  const top10AvgReturn = top10.length > 0
    ? top10.reduce((s, r) => s + (r.actualReturn as number), 0) / top10.length
    : null;

  const withActualReturns = cardResults.filter(r => r.actualReturn !== null);
  const marketAvgReturn = withActualReturns.length > 0
    ? withActualReturns.reduce((s, r) => s + (r.actualReturn as number), 0) / withActualReturns.length
    : null;

  // Compute market benchmark from all tested cards' price histories
  const allHistories: PricePoint[][] = [];
  for (const card of cards) {
    try {
      const uid = card.uniqueIdentifier;
      if (!uid) continue;
      const history = await fetchPriceHistoryUpToDate(uid, backtestDate);
      if (history.length >= windowDays + 1) {
        allHistories.push(history);
      }
    } catch {
      // skip failed fetches
    }
  }
  const benchmark = computeMarketBenchmark(allHistories, windowDays);

  const strongBuyCards = cardResults.filter(r => r.category === 'strong_buy');
  const strongBuyFalsePositive = strongBuyCards.filter(r => r.actualReturn !== null && r.actualReturn < 0);
  const strongBuyFalsePositiveRate = strongBuyCards.length > 0
    ? strongBuyFalsePositive.length / strongBuyCards.length
    : null;

  const avoidCards = cardResults.filter(r => r.category === 'avoid' && r.actualReturn !== null);
  const avoidAvgReturn = avoidCards.length > 0
    ? avoidCards.reduce((s, r) => s + (r.actualReturn ?? 0), 0) / avoidCards.length
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
    // Annualize based on the actual window period (default 90 days)
    const annualizationFactor = Math.sqrt(365 / windowDays);
    sharpeRatio = stdDev > 0 ? (mean / stdDev) * annualizationFactor : null;

    // Compounded equal-weight portfolio drawdown.
    let peak = 1;
    let value = 1;
    let maxDd = 0;
    for (const r of returns) {
      value = value * (1 + r);
      if (value > peak) peak = value;
      const drawdown = (peak - value) / peak;
      if (drawdown > maxDd) maxDd = drawdown;
    }
    maxDrawdown = maxDd;
  }

  // Skill metrics: do the model's rankings correlate with outcomes?
  const validationSamples = withActualReturns.map(r => ({
    predicted: r.predictedReturn,
    actual: r.actualReturn as number,
  }));
  const metrics = computeValidationMetrics(validationSamples);

  const baselineAvgReturn = marketAvgReturn;
  const modelAlpha = top10AvgReturn !== null && baselineAvgReturn !== null
    ? top10AvgReturn - baselineAvgReturn
    : null;

  const categories: PredictionCategory[] = ['strong_buy', 'watch_dip', 'recovery', 'momentum', 'stagnant', 'avoid', 'downtrend'];
  const categoryPerformance: CategoryPerformance[] = categories.map(cat => {
    const catCards = cardResults.filter(r => r.category === cat && r.actualReturn !== null);
    const count = catCards.length;
    const avgReturn = count > 0 ? catCards.reduce((s, r) => s + (r.actualReturn ?? 0), 0) / count : 0;
    const predictedCards = catCards.filter(r => r.predictedReturn !== null);
    const avgPredictedReturn = predictedCards.length > 0
      ? predictedCards.reduce((s, r) => s + r.predictedReturn, 0) / predictedCards.length
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
    marketMedianReturn: benchmark.medianReturn,
    marketReturnStdDev: benchmark.returnStdDev,
    strongBuyFalsePositiveRate,
    avoidAvgReturn,
    sharpeRatio,
    maxDrawdown,
    winRate,
    profitFactor,
    categoryPerformance,
    cardResults,
    rankIC: metrics.rankIC,
    meanBias: metrics.meanBias,
    hitRate: metrics.hitRate,
    baselineAvgReturn,
    modelAlpha,
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
        category_performance, market_median_return, market_return_std_dev,
        rank_ic, mean_bias, baseline_avg_return, hit_rate)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        result.marketMedianReturn,
        result.marketReturnStdDev,
        result.rankIC,
        result.meanBias,
        result.baselineAvgReturn,
        result.hitRate,
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
          id: r.id,
          backtestDate: r.backtest_date,
          windowDays: r.window_days,
          cardsTested: r.cards_tested,
          directionalAccuracy: r.directional_accuracy,
          mape: r.mape,
          top10AvgReturn: r.top10_avg_return,
          marketAvgReturn: r.market_avg_return,
          marketMedianReturn: r.market_median_return,
          marketReturnStdDev: r.market_return_std_dev,
          strongBuyFalsePositiveRate: r.strong_buy_false_positive_rate,
          avoidAvgReturn: r.avoid_avg_return,
          sharpeRatio: r.sharpe_ratio,
          maxDrawdown: r.max_drawdown,
        winRate: r.win_rate,
        profitFactor: r.profit_factor,
        rankIC: r.rank_ic ?? null,
        meanBias: r.mean_bias ?? null,
        hitRate: r.hit_rate ?? null,
        baselineAvgReturn: r.baseline_avg_return ?? null,
        modelAlpha: r.baseline_avg_return != null && r.top_10_avg_return != null
          ? r.top_10_avg_return - r.baseline_avg_return
          : null,
        categoryPerformance: (() => {
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

export interface WalkForwardResult {
  windows: Array<{
    cutoffDate: string;
    directionalAccuracy: number | null;
    mape: number | null;
    top10AvgReturn: number | null;
    marketAvgReturn: number | null;
    cardsTested: number;
  }>;
  aggregateMetrics: {
    avgDirectionalAccuracy: number | null;
    avgMape: number | null;
    avgTop10Return: number | null;
    consistencyScore: number | null; // % of windows with positive directional accuracy
  };
}

/**
 * Walk-forward validation: runs backtests at multiple historical cutoff dates
 * to measure model consistency across different market regimes.
 * Returns rolling metrics for each window and aggregate statistics.
 */
export async function runWalkForwardValidation(
  windowDays: number = 90,
  numWindows: number = 6,
  windowSpacingDays: number = 30,
  filter: CardQualityFilter = DEFAULT_CARD_QUALITY_FILTER
): Promise<WalkForwardResult> {
  const db = getDb();

  // Determine date range from available data
  const dateRange: { minDate: string; maxDate: string } = await new Promise((resolve, reject) => {
    db.get(
      `SELECT MIN(date) as minDate, MAX(date) as maxDate FROM price_history
       WHERE source IN ('tcgcsv', 'tcgdex', 'catalog_fallback')`,
      [],
      (err, row: any) => {
        if (err) return reject(err);
        resolve({ minDate: row?.minDate || '2023-01-01', maxDate: row?.maxDate || new Date().toISOString().split('T')[0] });
      }
    );
  });

  const maxCutoff = new Date(dateRange.maxDate);
  const cutoffDates: string[] = [];

  for (let i = 0; i < numWindows; i++) {
    const cutoff = new Date(maxCutoff);
    cutoff.setDate(cutoff.getDate() - i * windowSpacingDays);
    // Ensure we have enough history before the cutoff
    const minRequired = new Date(dateRange.minDate);
    minRequired.setDate(minRequired.getDate() + windowDays + 30);
    if (cutoff < minRequired) break;
    cutoffDates.push(cutoff.toISOString().split('T')[0]);
  }

  const windows: WalkForwardResult['windows'] = [];

  for (const cutoffDate of cutoffDates) {
    try {
      const backtestResult = await runBacktest(cutoffDate, windowDays, undefined, filter);
      windows.push({
        cutoffDate,
        directionalAccuracy: backtestResult.directionalAccuracy,
        mape: backtestResult.mape,
        top10AvgReturn: backtestResult.top10AvgReturn,
        marketAvgReturn: backtestResult.marketAvgReturn,
        cardsTested: backtestResult.cardsTested,
      });
    } catch (err) {
      logger.warn(`Walk-forward window ${cutoffDate} failed:`, err);
      windows.push({
        cutoffDate,
        directionalAccuracy: null,
        mape: null,
        top10AvgReturn: null,
        marketAvgReturn: null,
        cardsTested: 0,
      });
    }
  }

  // Compute aggregate metrics
  const validWindows = windows.filter(w => w.directionalAccuracy !== null);
  const avgDirectionalAccuracy = validWindows.length > 0
    ? validWindows.reduce((s, w) => s + w.directionalAccuracy!, 0) / validWindows.length
    : null;

  const windowsWithMape = windows.filter(w => w.mape !== null);
  const avgMape = windowsWithMape.length > 0
    ? windowsWithMape.reduce((s, w) => s + w.mape!, 0) / windowsWithMape.length
    : null;

  const windowsWithTop10 = windows.filter(w => w.top10AvgReturn !== null);
  const avgTop10Return = windowsWithTop10.length > 0
    ? windowsWithTop10.reduce((s, w) => s + w.top10AvgReturn!, 0) / windowsWithTop10.length
    : null;

  const consistencyScore = validWindows.length > 0
    ? validWindows.filter(w => w.directionalAccuracy! > 0.5).length / validWindows.length
    : null;

  return {
    windows,
    aggregateMetrics: {
      avgDirectionalAccuracy,
      avgMape,
      avgTop10Return,
      consistencyScore,
    },
  };
}
