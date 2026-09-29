/**
 * Programmatic invalidation conditions from the card's own history.
 * "What would change this rating?"
 */

import { percentile, round2 } from './stats';
import type { BuyThesisFeatures } from './features';
import type { BuyCategory, BuyThesisScores, InvalidationCondition } from './types';

export function buildInvalidationConditions(input: {
  features: BuyThesisFeatures;
  scores: BuyThesisScores;
  category: BuyCategory;
}): InvalidationCondition[] {
  const { features: f, scores, category } = input;
  const conditions: InvalidationCondition[] = [];
  const price = f.currentPrice;
  const prices = f.priceHistory.map((p) => p.marketPrice ?? p.price).filter((p) => p > 0);

  if (price != null && price > 0 && f.trimmedFairValue != null) {
    const upsideBreak = round2(f.trimmedFairValue * 1.08);
    const downsideBreak = round2(f.trimmedFairValue * 0.92);
    if (category === 'strong_buy' || category === 'buy' || category === 'watch') {
      conditions.push({
        id: 'price_above_fair_band',
        description: `Price rising above $${upsideBreak} (≈8% over trimmed fair) would weaken the value case`,
        metric: 'currentPrice',
        currentValue: price,
        threshold: upsideBreak,
        direction: 'above',
      });
    }
    if (category === 'avoid' || category === 'high_risk' || category === 'hold_fair_value') {
      conditions.push({
        id: 'price_below_fair_band',
        description: `Price falling below $${downsideBreak} (≈8% under trimmed fair) would improve value`,
        metric: 'currentPrice',
        currentValue: price,
        threshold: downsideBreak,
        direction: 'below',
      });
    }
  }

  // Volatility percentile of this card's own day-moves
  const moves: number[] = [];
  for (let i = 1; i < f.priceHistory.length; i++) {
    const prev = f.priceHistory[i - 1].marketPrice ?? f.priceHistory[i - 1].price;
    const curr = f.priceHistory[i].marketPrice ?? f.priceHistory[i].price;
    if (prev > 0 && curr > 0) moves.push(Math.abs(((curr - prev) / prev) * 100));
  }
  const p90Move = percentile(moves, 0.9);
  if (p90Move != null && (category === 'strong_buy' || category === 'buy')) {
    conditions.push({
      id: 'volatility_break',
      description: `A single-day move beyond ${p90Move.toFixed(1)}% (this card’s 90th pct) would raise risk`,
      metric: 'absDayMovePct',
      currentValue: f.maxSpike14d,
      threshold: round2(p90Move),
      direction: 'above',
    });
  }

  if (f.movingAverages.ma30 != null && price != null) {
    const ma30 = f.movingAverages.ma30;
    if (category === 'strong_buy' || category === 'buy' || category === 'watch') {
      conditions.push({
        id: 'lose_ma30',
        description: `Closing below 30d MA ($${ma30.toFixed(2)}) would weaken momentum`,
        metric: 'priceVsMa30',
        currentValue: price,
        threshold: round2(ma30),
        direction: 'below',
      });
    } else if (category === 'avoid' || category === 'high_risk') {
      conditions.push({
        id: 'reclaim_ma30',
        description: `Reclaiming 30d MA ($${ma30.toFixed(2)}) would reduce downtrend pressure`,
        metric: 'priceVsMa30',
        currentValue: price,
        threshold: round2(ma30),
        direction: 'above',
      });
    }
  }

  if (scores.liquidity < 45 && f.avgVolume30d != null) {
    const need = round2(Math.max(5, f.avgVolume30d * 2));
    conditions.push({
      id: 'liquidity_improve',
      description: `Sustained volume above ~${need} would improve liquidity confidence`,
      metric: 'avgVolume30d',
      currentValue: f.avgVolume30d,
      threshold: need,
      direction: 'above',
    });
  }

  if (prices.length >= 20) {
    const p10 = percentile(prices, 0.1);
    const p90 = percentile(prices, 0.9);
    if (p10 != null && p90 != null && price != null) {
      conditions.push({
        id: 'leave_history_band',
        description: `Leaving the historical $${p10.toFixed(2)}–$${p90.toFixed(2)} band (10th–90th) would re-rate the thesis`,
        metric: 'currentPrice',
        currentValue: price,
        threshold: price < (p10 + p90) / 2 ? p10 : p90,
        direction: 'outside',
      });
    }
  }

  return conditions.slice(0, 5);
}
