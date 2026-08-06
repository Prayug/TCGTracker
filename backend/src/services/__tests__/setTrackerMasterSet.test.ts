import {
  isReverseFinish,
  extractReversePriceFromVariants,
  computeSetSummary,
  type SetCardDto,
} from '../setTrackerService';

describe('isReverseFinish', () => {
  it('detects common reverse key forms', () => {
    expect(isReverseFinish('reverseHolofoil', 'normal')).toBe(true);
    expect(isReverseFinish('Reverse Holofoil', 'normal')).toBe(true);
    expect(isReverseFinish('normal', 'reverseholofoil')).toBe(true);
    expect(isReverseFinish('holofoil', 'holofoil')).toBe(false);
    expect(isReverseFinish('normal', 'normal')).toBe(false);
  });
});

describe('extractReversePriceFromVariants', () => {
  it('reads reverseHolofoil market from catalog JSON', () => {
    const price = extractReversePriceFromVariants({
      normal: { market: 0.14, low: 0.01, mid: 0.17, high: 1 },
      reverseHolofoil: { market: 0.26, low: 0.03, mid: 0.26, high: 1 },
    });
    expect(price).toBe(0.26);
  });

  it('returns null when no reverse listing exists', () => {
    expect(
      extractReversePriceFromVariants({
        normal: { market: 0.14 },
        holofoil: { market: 1.2 },
      })
    ).toBeNull();
  });
});

const card = (partial: Partial<SetCardDto> & Pick<SetCardDto, 'id' | 'marketPrice'>): SetCardDto => ({
  name: partial.name || partial.id,
  number: partial.number || '1',
  reverseMarketPrice: partial.reverseMarketPrice ?? 0,
  hasPriceData: (partial.marketPrice ?? 0) > 0,
  priceSource: partial.priceSource ?? 'market_sync',
  priceDate: partial.priceDate ?? '2026-08-04',
  images: { small: '', large: '' },
  set: {
    id: 'sv8',
    name: 'Surging Sparks',
    releaseDate: '2024-11-08',
    total: 2,
  },
  ...partial,
});

describe('computeSetSummary master set', () => {
  it('adds reverse holos on top of the checklist total', () => {
    const summary = computeSetSummary(
      [
        card({ id: 'sv8-1', marketPrice: 0.14, reverseMarketPrice: 0.26 }),
        card({ id: 'sv8-2', marketPrice: 10, reverseMarketPrice: 0 }),
      ],
      new Set(['sv8-1']),
      new Set()
    );

    expect(summary.checklistValue).toBeCloseTo(10.14);
    expect(summary.reverseHoloValue).toBeCloseTo(0.26);
    expect(summary.reverseHoloCount).toBe(1);
    expect(summary.masterSetValue).toBeCloseTo(10.4);
    expect(summary.ownedValue).toBeCloseTo(0.14);
    expect(summary.costToComplete).toBeCloseTo(10);
    expect(summary.missingReverseValue).toBe(0);
  });

  it('includes missing reverse finishes in master-set cost-to-complete', () => {
    const summary = computeSetSummary(
      [
        card({ id: 'sv8-1', marketPrice: 0.14, reverseMarketPrice: 0.26 }),
        card({ id: 'sv8-2', marketPrice: 10, reverseMarketPrice: 2 }),
      ],
      new Set(['sv8-1']),
      new Set(),
      { ownedReverseIds: new Set(['sv8-1']), includeReverseInCost: true }
    );

    // Missing primary: sv8-2 ($10). Missing reverse: sv8-2 ($2). Owned reverse counted in ownedValue.
    expect(summary.ownedValue).toBeCloseTo(0.14 + 0.26);
    expect(summary.ownedReverseCount).toBe(1);
    expect(summary.missingReverseValue).toBeCloseTo(2);
    expect(summary.costToComplete).toBeCloseTo(12);
  });
});
