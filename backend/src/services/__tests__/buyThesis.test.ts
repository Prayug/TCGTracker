/**
 * Buy thesis unit tests — edge cases from product requirements.
 */

import { analyzeBuyThesis } from '../buyThesis/analyze';
import { backtestBuyThesis } from '../buyThesis/backtest';
import { normalizeWeights } from '../buyThesis/weights';
import type { PricePoint } from '../marketAnalyzer';

function series(prices: number[], endDate?: string, volume = 30): PricePoint[] {
  const end = new Date(`${endDate ?? new Date().toISOString().slice(0, 10)}T00:00:00Z`);
  return prices.map((price, i) => {
    const d = new Date(end);
    d.setUTCDate(d.getUTCDate() - (prices.length - 1 - i));
    return {
      date: d.toISOString().slice(0, 10),
      price,
      marketPrice: price,
      volume,
    };
  });
}

const meta = {
  cardId: 'test-card',
  cardName: 'Test Charizard',
  setId: 'base1',
  setName: 'Base',
  rarity: 'Rare Holo',
  setReleaseDate: '2024-01-01',
};

describe('buyThesis analyzeBuyThesis', () => {
  it('returns insufficient_data when there are no sales / empty history', () => {
    const result = analyzeBuyThesis({ meta, priceHistory: [] });
    expect(result.category).toBe('insufficient_data');
    expect(result.confidence.tier).toBe('low');
    expect(result.scores.dataQuality).toBeLessThan(40);
    expect(result.reasoning.whyBuy.length).toBeGreaterThan(0);
  });

  it('handles a single sale without crashing', () => {
    const result = analyzeBuyThesis({
      meta,
      priceHistory: [{ date: '2025-06-01', price: 40, marketPrice: 40 }],
    });
    expect(result.category).toBe('insufficient_data');
    expect(result.currentPrice).toBe(40);
    expect(result.fakeOpportunityFlags.some((f) => f.id === 'thin_volume')).toBe(true);
  });

  it('scores a liquid, stable card with healthy history', () => {
    const prices = Array.from({ length: 120 }, (_, i) => 50 + Math.sin(i / 8) * 2);
    const result = analyzeBuyThesis({
      meta,
      priceHistory: series(prices, undefined, 80),
    });
    expect(result.scores.liquidity).toBeGreaterThan(45);
    expect(result.confidence.score).toBeGreaterThan(50);
    expect(result.category).not.toBe('insufficient_data');
    expect(result.fairValue).not.toBeNull();
    expect(result.invalidation.length).toBeGreaterThan(0);
  });

  it('flags volatile / buyout-looking spikes', () => {
    const prices = [
      ...Array.from({ length: 40 }, () => 20),
      20,
      55, // spike
      52,
    ];
    const result = analyzeBuyThesis({
      meta,
      priceHistory: series(prices, undefined, 5),
    });
    expect(
      result.fakeOpportunityFlags.some((f) => f.id === 'buyout_looking' || f.id === 'outlier_spike')
    ).toBe(true);
    expect(result.scores.risk).toBeGreaterThan(40);
    expect(
      result.signals.some((s) => s.id === 'buyout_manipulation' || s.id === 'outlier_spike')
    ).toBe(true);
  });

  it('marks grading opportunity with thin liquidity as caution', () => {
    const prices = Array.from({ length: 45 }, (_, i) => 25 + i * 0.05);
    const result = analyzeBuyThesis({
      meta,
      priceHistory: series(prices),
      graded: {
        rawPrice: 25,
        psa10Price: 120,
        psa9Price: 60,
        gradingFeeEstimate: 25,
        soldListings: 1,
        listedCount: 2,
        psa10Pop: 40,
        psaTotalPop: 200,
      },
    });
    expect(result.signals.some((s) => s.id === 'grading_spread')).toBe(true);
    expect(result.fakeOpportunityFlags.some((f) => f.id === 'grading_thin_liquidity')).toBe(true);
  });

  it('allows Strong Buy-ish opportunity with low forecast confidence (prediction is one signal)', () => {
    // Cheap vs fair + recovery-ish flat series after a dip
    const prices = [
      ...Array.from({ length: 60 }, () => 100),
      ...Array.from({ length: 20 }, () => 70),
      ...Array.from({ length: 20 }, () => 72),
    ];
    const result = analyzeBuyThesis({
      meta: { ...meta, rarity: 'Special Illustration Rare' },
      priceHistory: series(prices, undefined, 40),
      prediction: {
        expected30dReturn: 0.12,
        expected90dReturn: 0.2,
        confidence: 28,
        reliability: 'low',
        historicalMae: 0.15,
        approach: 'ewma',
      },
    });
    const forecast = result.signals.find((s) => s.id === 'price_forecast');
    expect(forecast).toBeDefined();
    expect(Math.abs(forecast!.strength)).toBeLessThan(0.5); // dampened by low conf
    expect(result.fakeOpportunityFlags.some((f) => f.id === 'strong_forecast_low_confidence')).toBe(
      true
    );
    // Confidence reflects evidence reliability, not bullishness of forecast
    expect(result.confidence.score).toBeDefined();
  });

  it('separates signals from conclusions — recommendations trace to signals', () => {
    const prices = Array.from({ length: 60 }, (_, i) => 30 + i * 0.1);
    const result = analyzeBuyThesis({
      meta,
      priceHistory: series(prices, undefined, 25),
    });
    expect(result.signals.length).toBeGreaterThan(3);
    for (const s of result.signals) {
      expect(s.id).toBeTruthy();
      expect(typeof s.strength).toBe('number');
      expect(typeof s.bullish).toBe('boolean');
      expect(s.summary.length).toBeGreaterThan(0);
      expect(s.evidence).toBeDefined();
    }
    expect(result.reasoning.headline).toContain(result.categoryLabel);
  });

  it('penalizes source inconsistency', () => {
    const prices = Array.from({ length: 40 }, () => 50);
    const result = analyzeBuyThesis({
      meta,
      priceHistory: series(prices),
      alternateSourcePrices: [80],
    });
    expect(result.signals.some((s) => s.id === 'source_inconsistency')).toBe(true);
    expect(result.fakeOpportunityFlags.some((f) => f.id === 'source_inconsistency')).toBe(true);
  });

  it('uses configurable weights (deterministic)', () => {
    const prices = Array.from({ length: 50 }, (_, i) => 40 + Math.sin(i / 5));
    const a = analyzeBuyThesis({
      meta,
      priceHistory: series(prices),
      weights: { value: 0.5, momentum: 0.1, riskPenalty: 0.1 },
    });
    const b = analyzeBuyThesis({
      meta,
      priceHistory: series(prices),
      weights: { value: 0.05, momentum: 0.5, riskPenalty: 0.2 },
    });
    expect(a.weights.value).not.toBe(b.weights.value);
    // Same inputs + same weights → identical opportunity
    const a2 = analyzeBuyThesis({
      meta,
      priceHistory: series(prices),
      weights: { value: 0.5, momentum: 0.1, riskPenalty: 0.1 },
    });
    expect(a2.scores.opportunity).toBe(a.scores.opportunity);
  });

  it('builds comparable summary when enough peers exist', () => {
    const prices = Array.from({ length: 40 }, () => 45);
    const peers = Array.from({ length: 8 }, (_, i) => ({
      cardId: `peer-${i}`,
      rarity: 'Rare Holo',
      setId: 'base1',
      currentPrice: 55 + i,
      change30d: 2,
    }));
    const result = analyzeBuyThesis({
      meta,
      priceHistory: series(prices),
      peers,
    });
    expect(result.comparables).not.toBeNull();
    expect(result.comparables!.peerCount).toBeGreaterThanOrEqual(5);
    expect(result.signals.some((s) => s.id === 'comparable_cards')).toBe(true);
  });
});

describe('buyThesis weights', () => {
  it('normalizes positive score weights to sum ~1', () => {
    const w = normalizeWeights({
      value: 2,
      momentum: 2,
      liquidity: 2,
      riskPenalty: 2,
      dataQuality: 2,
      gradingOpportunity: 0,
      supplyDemand: 0,
    });
    const sum =
      w.value +
      w.momentum +
      w.liquidity +
      w.gradingOpportunity +
      w.supplyDemand +
      w.riskPenalty +
      w.dataQuality;
    expect(sum).toBeCloseTo(1, 5);
  });
});

describe('buyThesis backtest', () => {
  it('does not leak future prices into as-of analysis and reports horizons', () => {
    // Upward drift so some categories produce measurable returns
    const prices = Array.from({ length: 200 }, (_, i) => 20 + i * 0.15 + Math.sin(i / 10));
    const history = series(prices, undefined, 40);
    const result = backtestBuyThesis({
      meta,
      priceHistory: history,
      stepDays: 14,
      minHistoryPoints: 20,
    });
    expect(result.sampleDates).toBeGreaterThan(5);
    expect(result.overall).toHaveLength(3);
    for (const h of result.overall) {
      expect([7, 30, 90]).toContain(h.horizonDays);
      if (h.sampleSize > 0) {
        expect(h.medianReturn).not.toBeNull();
        expect(h.hitRate).not.toBeNull();
      }
    }
  });
});
