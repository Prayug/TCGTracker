/**
 * Walk-forward recommendation backtest with no future leakage.
 * At each as-of date, analyze using only history ≤ as-of, then measure
 * forward 7/30/90d returns by category.
 */

import type { PricePoint } from '../marketAnalyzer';
import { getPriceAtDate } from '../marketAnalyzer';
import { analyzeBuyThesis } from './analyze';
import { median, round2 } from './stats';
import type { BuyCategory, CardMeta, ScoreWeights } from './types';

export interface BacktestHorizonStats {
  horizonDays: 7 | 30 | 90;
  sampleSize: number;
  hitRate: number | null;
  medianReturn: number | null;
  meanReturn: number | null;
  downsideMedian: number | null;
  /** Fraction of returns < 0 */
  lossRate: number | null;
}

export interface CategoryBacktestRow {
  category: BuyCategory;
  horizons: BacktestHorizonStats[];
}

export interface BuyThesisBacktestResult {
  cardId: string;
  sampleDates: number;
  byCategory: CategoryBacktestRow[];
  overall: BacktestHorizonStats[];
}

function forwardReturn(history: PricePoint[], asOf: string, horizonDays: number): number | null {
  const asOfDate = new Date(`${asOf}T00:00:00Z`);
  const start = getPriceAtDate(history, asOfDate);
  const endDate = new Date(asOfDate);
  endDate.setUTCDate(endDate.getUTCDate() + horizonDays);
  const end = getPriceAtDate(history, endDate);
  // Require the end quote to be at or after target (no look-ahead via earlier fills only)
  if (start == null || start <= 0 || end == null || end <= 0) return null;
  const endIso = endDate.toISOString().slice(0, 10);
  const hasFuture = history.some((p) => {
    const d = p.date.includes('T') ? p.date.split('T')[0] : p.date;
    return d >= asOf && d <= endIso;
  });
  if (!hasFuture) return null;
  // Ensure we actually have a quote on/after asOf+horizon within tolerance
  const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date));
  const endQuote = sorted.find((p) => {
    const d = p.date.includes('T') ? p.date.split('T')[0] : p.date;
    return d >= endIso;
  });
  if (!endQuote) return null;
  const endPrice = endQuote.marketPrice ?? endQuote.price;
  if (!(endPrice > 0)) return null;
  return (endPrice - start) / start;
}

function summarizeReturns(returns: number[], horizonDays: 7 | 30 | 90): BacktestHorizonStats {
  if (returns.length === 0) {
    return {
      horizonDays,
      sampleSize: 0,
      hitRate: null,
      medianReturn: null,
      meanReturn: null,
      downsideMedian: null,
      lossRate: null,
    };
  }
  const hits = returns.filter((r) => r > 0).length;
  const losses = returns.filter((r) => r < 0);
  return {
    horizonDays,
    sampleSize: returns.length,
    hitRate: round2(hits / returns.length),
    medianReturn: round2(median(returns) ?? 0),
    meanReturn: round2(returns.reduce((a, b) => a + b, 0) / returns.length),
    downsideMedian: losses.length ? round2(median(losses) ?? 0) : null,
    lossRate: round2(losses.length / returns.length),
  };
}

/**
 * Positive categories for hit-rate: strong_buy, buy (expect positive forward return).
 * Avoid/high_risk: hit = forward return negative (correctly avoiding).
 */
function isHit(category: BuyCategory, ret: number): boolean {
  if (category === 'strong_buy' || category === 'buy') return ret > 0;
  if (category === 'avoid' || category === 'high_risk') return ret < 0;
  return ret >= -0.02; // watch/hold: not a large loss
}

export function backtestBuyThesis(input: {
  meta: CardMeta;
  priceHistory: PricePoint[];
  weights?: Partial<ScoreWeights>;
  /** Step between evaluation dates */
  stepDays?: number;
  minHistoryPoints?: number;
}): BuyThesisBacktestResult {
  const stepDays = input.stepDays ?? 7;
  const minHistory = input.minHistoryPoints ?? 14;
  const sorted = [...input.priceHistory]
    .map((p) => ({
      ...p,
      date: p.date.includes('T') ? p.date.split('T')[0] : p.date,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const byCat = new Map<BuyCategory, { 7: number[]; 30: number[]; 90: number[] }>();
  const overall: { 7: number[]; 30: number[]; 90: number[] } = { 7: [], 30: [], 90: [] };
  let sampleDates = 0;

  const lastIdx = sorted.length - 1;
  for (let i = minHistory; i < lastIdx; i += 1) {
    const asOf = sorted[i].date;
    const asOfMs = new Date(`${asOf}T00:00:00Z`).getTime();
    const firstMs = new Date(`${sorted[minHistory].date}T00:00:00Z`).getTime();
    const daysFromStart = Math.round((asOfMs - firstMs) / 86_400_000);
    if (daysFromStart % stepDays !== 0) continue;

    const historySlice = sorted.slice(0, i + 1);
    if (historySlice.length < minHistory) continue;

    const analysis = analyzeBuyThesis({
      meta: input.meta,
      priceHistory: historySlice,
      weights: input.weights,
      analyzedAt: `${asOf}T00:00:00.000Z`,
    });

    sampleDates += 1;
    if (!byCat.has(analysis.category)) {
      byCat.set(analysis.category, { 7: [], 30: [], 90: [] });
    }
    const bucket = byCat.get(analysis.category)!;

    for (const h of [7, 30, 90] as const) {
      const ret = forwardReturn(sorted, asOf, h);
      if (ret == null) continue;
      bucket[h].push(ret);
      overall[h].push(ret);
    }
  }

  const byCategory: CategoryBacktestRow[] = [...byCat.entries()].map(([category, rets]) => {
    // Recompute hit rates per category
    const horizons = ([7, 30, 90] as const).map((h) => {
      const base = summarizeReturns(rets[h], h);
      if (rets[h].length === 0) return base;
      const hits = rets[h].filter((r) => isHit(category, r)).length;
      return { ...base, hitRate: round2(hits / rets[h].length) };
    });
    return { category, horizons };
  });

  return {
    cardId: input.meta.cardId,
    sampleDates,
    byCategory,
    overall: ([7, 30, 90] as const).map((h) => summarizeReturns(overall[h], h)),
  };
}
