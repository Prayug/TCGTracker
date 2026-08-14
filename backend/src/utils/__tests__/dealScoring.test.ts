import {
  calculateAllInCost,
  calculateDealEconomics,
  calculateMaxBid,
  computeDealScore,
  gradesAreCompatible,
  isEligibleDeal,
  isPlaceholderMarketPrice,
  isReliableMarketQuote,
  isUnusuallyLowPrice,
  matchConfidenceTier,
  pickBestDealPerCard,
  rotateSlice,
  DEAL_THRESHOLDS,
} from '../dealScoring';

describe('calculateAllInCost', () => {
  it('includes shipping', () => {
    expect(calculateAllInCost(80, 5)).toBe(85);
  });

  it('treats missing or negative shipping as zero', () => {
    expect(calculateAllInCost(80, 0)).toBe(80);
    expect(calculateAllInCost(80, NaN)).toBe(80);
  });
});

describe('calculateDealEconomics', () => {
  it('computes 15% discount for $100 market, $80 + $5 shipping', () => {
    const result = calculateDealEconomics(80, 5, 100);
    expect(result).toEqual({
      listingPrice: 80,
      shipping: 5,
      allInCost: 85,
      marketValue: 100,
      discountAmount: 15,
      discountPercent: 15,
    });
  });

  it('returns null when market value is missing', () => {
    expect(calculateDealEconomics(80, 5, 0)).toBeNull();
  });
});

describe('minimum thresholds', () => {
  it('accepts a raw card that clears $10 / 12% / $5', () => {
    const eco = calculateDealEconomics(80, 5, 100)!;
    expect(isEligibleDeal(eco, 'raw')).toBe(true);
  });

  it('rejects raw bulk that is under the market floor', () => {
    const eco = calculateDealEconomics(0.2, 0, 1)!;
    expect(isEligibleDeal(eco, 'raw')).toBe(false);
    expect(eco.marketValue).toBeLessThan(DEAL_THRESHOLDS.raw.minMarketValue);
  });

  it('rejects raw cards with a large % but tiny dollar save', () => {
    const eco = calculateDealEconomics(8, 0, 10)!;
    expect(eco.discountPercent).toBe(20);
    expect(isEligibleDeal(eco, 'raw')).toBe(false);
  });

  it('uses stricter dollar/market floors for graded cards', () => {
    const eco = calculateDealEconomics(25, 0, 28)!;
    expect(isEligibleDeal(eco, 'graded')).toBe(false);
    const ok = calculateDealEconomics(90, 2, 120)!;
    expect(isEligibleDeal(ok, 'graded')).toBe(true);
  });
});

describe('deal ranking', () => {
  it('ranks a real $100 save above a 75% bulk common', () => {
    const bulk = computeDealScore({
      discountPercent: 75,
      discountAmount: 0.8,
      marketValue: 1,
      matchConfidence: 0.95,
      liquidityScore: 10,
      listingAgeHours: 1,
      listingType: 'bin',
      hoursRemaining: null,
    });
    const real = computeDealScore({
      discountPercent: 21.5,
      discountAmount: 113,
      marketValue: 525,
      matchConfidence: 0.94,
      liquidityScore: 70,
      listingAgeHours: 4,
      listingType: 'bin',
      hoursRemaining: null,
    });
    expect(real.dealScore).toBeGreaterThan(bulk.dealScore);
  });
});

describe('grade compatibility', () => {
  it('rejects comparing a PSA 9 listing to a PSA 10 market', () => {
    expect(gradesAreCompatible('psa', '9', 'psa', '10', true)).toBe(false);
  });

  it('rejects comparing a raw listing to a graded market', () => {
    expect(gradesAreCompatible(null, null, 'psa', '10', false)).toBe(false);
  });

  it('accepts the same company and grade', () => {
    expect(gradesAreCompatible('psa', '10', 'psa', '10', true)).toBe(true);
  });
});

describe('auction max bid', () => {
  it('computes max bid for a 15% margin including shipping', () => {
    expect(calculateMaxBid(500, 10, 15)).toBe(415);
  });

  it('returns null when shipping would exceed the target all-in', () => {
    expect(calculateMaxBid(20, 25, 15)).toBeNull();
  });
});

describe('confidence and unusual discount', () => {
  it('maps confidence bands', () => {
    expect(matchConfidenceTier(0.94)).toBe('high');
    expect(matchConfidenceTier(0.75)).toBe('medium');
    expect(matchConfidenceTier(0.5)).toBe('low');
    expect(matchConfidenceTier(0.2)).toBe('unresolved');
  });

  it('flags unusually low graded discounts', () => {
    expect(isUnusuallyLowPrice(51, 'graded')).toBe(true);
    expect(isUnusuallyLowPrice(20, 'graded')).toBe(false);
  });
});

describe('reliable market quotes', () => {
  it('rejects catalog_fallback placeholders', () => {
    expect(
      isReliableMarketQuote({
        source: 'catalog_fallback',
        volume: 10,
        quoteAgeDays: 0,
        plateauDays: 0,
      })
    ).toBe(false);
  });

  it('rejects a frozen TCGCSV mark with no volume (Rosa $82.59 copied from April)', () => {
    expect(
      isReliableMarketQuote({
        source: 'tcgcsv',
        volume: null,
        quoteAgeDays: 0,
        plateauDays: 133,
      })
    ).toBe(false);
  });

  it('rejects a no-volume $50 tcgdex placeholder (Golbat reverse)', () => {
    expect(isPlaceholderMarketPrice(50, null)).toBe(true);
    expect(isPlaceholderMarketPrice(49.99, 0)).toBe(true);
    expect(
      isReliableMarketQuote({
        source: 'tcgdex',
        volume: null,
        quoteAgeDays: 1,
        plateauDays: 5,
        price: 50,
      })
    ).toBe(false);
    expect(
      isReliableMarketQuote({
        source: 'tcgdex',
        volume: 0,
        quoteAgeDays: 5,
        plateauDays: 5,
        price: 49.99,
      })
    ).toBe(false);
  });

  it('keeps one listing per card so the feed is not the same Golbat four times', () => {
    const picked = pickBestDealPerCard([
      { cardId: 'ex11-43', dealCondition: 'raw', gradeLabel: 'Raw', dealScore: 40 },
      { cardId: 'ex11-43', dealCondition: 'raw', gradeLabel: 'Raw', dealScore: 70 },
      { cardId: 'ex11-43', dealCondition: 'raw', gradeLabel: 'Raw', dealScore: 55 },
      { cardId: 'ex6-14', dealCondition: 'raw', gradeLabel: 'Raw', dealScore: 60 },
    ]);
    expect(picked).toHaveLength(2);
    expect(picked.find((d) => d.cardId === 'ex11-43')?.dealScore).toBe(70);
  });

  it('accepts a recently changed quote even without volume', () => {
    expect(
      isReliableMarketQuote({
        source: 'tcgcsv',
        volume: null,
        quoteAgeDays: 1,
        plateauDays: 10,
      })
    ).toBe(true);
  });

  it('accepts a stable card that still has sales volume', () => {
    expect(
      isReliableMarketQuote({
        source: 'tcgdex',
        volume: 12,
        quoteAgeDays: 1,
        plateauDays: 30,
      })
    ).toBe(true);
  });
});

describe('rotateSlice', () => {
  it('walks through the pool without repeating the same window', () => {
    const pool = ['a', 'b', 'c', 'd', 'e', 'f'];
    expect(rotateSlice(pool, 3, 0)).toEqual(['a', 'b', 'c']);
    expect(rotateSlice(pool, 3, 1)).toEqual(['d', 'e', 'f']);
    expect(rotateSlice(pool, 3, 2)).toEqual(['a', 'b', 'c']);
  });
});
