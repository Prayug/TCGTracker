import {
  applyBulkAndEconomicScoring,
  baseBulkPenaltyByPrice,
  buildBulkAwareWhy,
} from '../opportunityBulkScoring';

describe('opportunityBulkScoring', () => {
  it('applies stronger base penalty under $0.50', () => {
    expect(baseBulkPenaltyByPrice(0.25)).toBe(38);
    expect(baseBulkPenaltyByPrice(1)).toBe(24);
    expect(baseBulkPenaltyByPrice(3)).toBe(14);
    expect(baseBulkPenaltyByPrice(20)).toBe(0);
  });

  it('heavily penalizes large % with trivial absolute gain', () => {
    const noisy = applyBulkAndEconomicScoring({
      marketPrice: 0.2,
      changeAbs: 0.17,
      changePct: 170,
      momentumDays: 7,
      soldListings: 2,
      liquidityTier: 'thin',
      buyoutScore: 0,
      velocityRatio: null,
      listedCount: null,
      listedCountPrev: null,
      netSentiment: null,
      hasCatalyst: false,
      compMomentumPct: null,
    });
    const meaningful = applyBulkAndEconomicScoring({
      marketPrice: 24,
      changeAbs: 8,
      changePct: 33,
      momentumDays: 30,
      soldListings: 12,
      liquidityTier: 'ok',
      buyoutScore: 20,
      velocityRatio: 1.2,
      listedCount: null,
      listedCountPrev: null,
      netSentiment: 0.2,
      hasCatalyst: false,
      compMomentumPct: 6,
    });
    expect(noisy.penalty).toBeGreaterThan(meaningful.penalty);
    expect(noisy.economicBoost).toBeLessThan(meaningful.economicBoost);
    expect(noisy.flags).toContain('trivial_abs_gain');
  });

  it('allows cheap cards to override bulk penalty with strong evidence', () => {
    const result = applyBulkAndEconomicScoring({
      marketPrice: 1.4,
      changeAbs: 2.1,
      changePct: 45,
      momentumDays: 21,
      soldListings: 11,
      liquidityTier: 'ok',
      buyoutScore: 55,
      velocityRatio: 2.4,
      listedCount: 4,
      listedCountPrev: 12,
      netSentiment: 0.45,
      hasCatalyst: true,
      compMomentumPct: 14,
    });
    expect(result.overrideActive).toBe(true);
    expect(result.overrideReasons.length).toBeGreaterThanOrEqual(2);
    expect(result.penalty).toBeLessThan(15);
  });

  it('explains bulk override in why text for cheap cards', () => {
    const why = buildBulkAwareWhy({
      marketPrice: 1.4,
      bulk: {
        penalty: 5,
        economicBoost: 6,
        overrideActive: true,
        overrideReasons: ['2.4× sales velocity', 'listings down 67%'],
        flags: [],
      },
      baseWhy: 'Model expects 12% over 90d at 70% confidence.',
    });
    expect(why).toMatch(/Despite its \$1\.4 price/i);
    expect(why).toMatch(/demand-driven/i);
    expect(why).toMatch(/2\.4× sales velocity/);
  });

  it('downranks cheap noise without override evidence', () => {
    const why = buildBulkAwareWhy({
      marketPrice: 0.8,
      bulk: {
        penalty: 30,
        economicBoost: 0,
        overrideActive: false,
        overrideReasons: [],
        flags: ['trivial_abs_gain'],
      },
      baseWhy: 'Slab up 120% in 7d.',
    });
    expect(why).toMatch(/minimal dollar gain|Low absolute upside/i);
  });
});
