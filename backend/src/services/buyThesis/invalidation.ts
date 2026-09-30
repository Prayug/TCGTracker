/**
 * Programmatic invalidation — collector-facing "what would change my mind?"
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
        description: `If it runs past about $${upsideBreak}, it's less of a deal — I'd wait for a dip.`,
        metric: 'currentPrice',
        currentValue: price,
        threshold: upsideBreak,
        direction: 'above',
      });
    }
    if (category === 'avoid' || category === 'high_risk' || category === 'hold_fair_value') {
      conditions.push({
        id: 'price_below_fair_band',
        description: `If it comes down under about $${downsideBreak}, I'd look again.`,
        metric: 'currentPrice',
        currentValue: price,
        threshold: downsideBreak,
        direction: 'below',
      });
    }
  }

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
      description: `A single wild day beyond ~${p90Move.toFixed(0)}% would make me treat this as a chase.`,
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
        description: `If it slips under about $${ma30.toFixed(2)} (recent month average), I'd stop adding.`,
        metric: 'priceVsMa30',
        currentValue: price,
        threshold: round2(ma30),
        direction: 'below',
      });
    } else if (category === 'avoid' || category === 'high_risk') {
      conditions.push({
        id: 'reclaim_ma30',
        description: `If it climbs back over about $${ma30.toFixed(2)}, the chart starts looking healthier.`,
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
      description: `More regular sales (busier than ~${need} lately) would make the market easier to trust.`,
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
        description: `Leaving its usual $${p10.toFixed(2)}–$${p90.toFixed(2)} neighborhood would change this advice.`,
        metric: 'currentPrice',
        currentValue: price,
        threshold: price < (p10 + p90) / 2 ? p10 : p90,
        direction: 'outside',
      });
    }
  }

  return conditions.slice(0, 5);
}
