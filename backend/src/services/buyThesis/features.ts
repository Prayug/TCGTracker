/**
 * Feature extraction from price history + graded/pop context.
 * Only measurable fields — no invented popularity metrics.
 */

import {
  computeMovingAverages,
  computePriceChanges,
  computeVolatility,
  computeRecoveryMetrics,
  findSupportResistance,
  getLatestPrice,
  type PricePoint,
  type MovingAverages,
  type PriceChanges,
  type VolatilityMetrics,
  type RecoveryMetrics,
  type SupportResistance,
} from '../marketAnalyzer';
import { median, percentile, trimmedMean, robustZ, daysBetween, round2 } from './stats';
import type { GradedContext, CardMeta } from './types';

export interface BuyThesisFeatures {
  priceHistory: PricePoint[];
  currentPrice: number | null;
  historyLength: number;
  spanDays: number;
  lastDate: string | null;
  daysSinceLastQuote: number | null;
  movingAverages: MovingAverages;
  priceChanges: PriceChanges;
  volatility: VolatilityMetrics;
  recovery: RecoveryMetrics;
  supportResistance: SupportResistance;
  /** Trimmed-mean fair value proxy from recent prices */
  trimmedFairValue: number | null;
  medianPrice90d: number | null;
  p10Price: number | null;
  p90Price: number | null;
  avgVolume30d: number | null;
  volumeSpikeRatio: number | null;
  /** Max single-day % move in last 14 calendar points */
  maxSpike14d: number | null;
  robustSpikeZ: number | null;
  sourceCount: number;
  sourceSpreadPct: number | null;
  setAgeDays: number | null;
  graded: GradedContext | null;
  meta: CardMeta;
}

function extractPrices(points: PricePoint[]): number[] {
  return points.map((p) => p.marketPrice ?? p.price).filter((p) => p > 0);
}

function computeSetAgeDays(releaseDate: string | null | undefined): number | null {
  if (!releaseDate) return null;
  const normalized = releaseDate.replace(/\//g, '-');
  const t = new Date(`${normalized}T00:00:00Z`).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.round((Date.now() - t) / 86_400_000));
}

export function extractFeatures(input: {
  priceHistory: PricePoint[];
  meta: CardMeta;
  graded?: GradedContext | null;
  /** Same-day quotes from alternate sources for inconsistency check */
  alternateSourcePrices?: number[];
}): BuyThesisFeatures {
  const sorted = [...input.priceHistory]
    .map((p) => ({
      ...p,
      date: p.date.includes('T') ? p.date.split('T')[0] : p.date,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const currentPrice = getLatestPrice(sorted);
  const lastDate = sorted.length > 0 ? sorted[sorted.length - 1].date : null;
  const firstDate = sorted.length > 0 ? sorted[0].date : null;
  const spanDays = firstDate && lastDate ? daysBetween(firstDate, lastDate) : 0;
  const daysSinceLastQuote =
    lastDate != null
      ? Math.max(0, daysBetween(lastDate, new Date().toISOString().slice(0, 10)))
      : null;

  const recent90 = sorted.slice(-Math.min(90, sorted.length));
  const recentPrices = extractPrices(recent90);
  const trimmedFairValue = trimmedMean(recentPrices, 0.1);
  const medianPrice90d = median(recentPrices);
  const p10Price = percentile(recentPrices, 0.1);
  const p90Price = percentile(recentPrices, 0.9);

  const recent30 = sorted.slice(-30);
  const volumes = recent30.map((p) => p.volume ?? 0).filter((v) => v > 0);
  const avgVolume30d =
    volumes.length > 0 ? volumes.reduce((a, b) => a + b, 0) / volumes.length : null;
  const lastVol = sorted[sorted.length - 1]?.volume ?? null;
  const volumeSpikeRatio =
    avgVolume30d != null && avgVolume30d > 0 && lastVol != null && lastVol > 0
      ? lastVol / avgVolume30d
      : null;

  const last14 = sorted.slice(-14);
  const dayMoves: number[] = [];
  for (let i = 1; i < last14.length; i++) {
    const prev = last14[i - 1].marketPrice ?? last14[i - 1].price;
    const curr = last14[i].marketPrice ?? last14[i].price;
    if (prev > 0 && curr > 0) dayMoves.push(((curr - prev) / prev) * 100);
  }
  const maxSpike14d = dayMoves.length > 0 ? Math.max(...dayMoves.map((m) => Math.abs(m))) : null;

  const allMoves: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1].marketPrice ?? sorted[i - 1].price;
    const curr = sorted[i].marketPrice ?? sorted[i].price;
    if (prev > 0 && curr > 0) allMoves.push(((curr - prev) / prev) * 100);
  }
  const lastMove = dayMoves.length > 0 ? dayMoves[dayMoves.length - 1] : null;
  const robustSpikeZ =
    lastMove != null && allMoves.length >= 10 ? robustZ(lastMove, allMoves) : null;

  const alts = (input.alternateSourcePrices ?? []).filter((p) => p > 0);
  let sourceSpreadPct: number | null = null;
  if (currentPrice != null && currentPrice > 0 && alts.length > 0) {
    const all = [currentPrice, ...alts];
    const lo = Math.min(...all);
    const hi = Math.max(...all);
    sourceSpreadPct = hi > 0 ? ((hi - lo) / hi) * 100 : null;
  }

  return {
    priceHistory: sorted,
    currentPrice,
    historyLength: sorted.length,
    spanDays,
    lastDate,
    daysSinceLastQuote,
    movingAverages: computeMovingAverages(sorted),
    priceChanges: computePriceChanges(sorted),
    volatility: computeVolatility(sorted, 30),
    recovery: computeRecoveryMetrics(sorted),
    supportResistance: findSupportResistance(sorted),
    trimmedFairValue: trimmedFairValue != null ? round2(trimmedFairValue) : null,
    medianPrice90d: medianPrice90d != null ? round2(medianPrice90d) : null,
    p10Price: p10Price != null ? round2(p10Price) : null,
    p90Price: p90Price != null ? round2(p90Price) : null,
    avgVolume30d: avgVolume30d != null ? round2(avgVolume30d) : null,
    volumeSpikeRatio: volumeSpikeRatio != null ? round2(volumeSpikeRatio) : null,
    maxSpike14d: maxSpike14d != null ? round2(maxSpike14d) : null,
    robustSpikeZ: robustSpikeZ != null ? round2(robustSpikeZ) : null,
    sourceCount: 1 + alts.length,
    sourceSpreadPct: sourceSpreadPct != null ? round2(sourceSpreadPct) : null,
    setAgeDays: computeSetAgeDays(input.meta.setReleaseDate),
    graded: input.graded ?? null,
    meta: input.meta,
  };
}
