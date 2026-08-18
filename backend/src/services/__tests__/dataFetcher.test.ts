import {
  normalizeVariantKey,
  deterministicProductId,
  listPriceCatchUpDates,
  shiftIsoDate,
} from '../dataFetcher';

describe('normalizeVariantKey', () => {
  it('lowercases and strips non-alphanumeric characters', () => {
    expect(normalizeVariantKey('Reverse Holofoil')).toBe('reverseholofoil');
    expect(normalizeVariantKey('Holofoil')).toBe('holofoil');
    expect(normalizeVariantKey('1st Edition Normal')).toBe('1steditionnormal');
  });

  it('returns "normal" for empty input', () => {
    expect(normalizeVariantKey('')).toBe('normal');
    expect(normalizeVariantKey(undefined)).toBe('normal');
    expect(normalizeVariantKey('   ')).toBe('normal');
  });

  it('handles special characters', () => {
    expect(normalizeVariantKey('Holo-Foil ★')).toBe('holofoil');
    expect(normalizeVariantKey('Normal (Holo)')).toBe('normalholo');
  });

  it('returns "normal" when normalization produces empty string', () => {
    expect(normalizeVariantKey('!!!')).toBe('normal');
  });
});

describe('deterministicProductId', () => {
  it('produces consistent IDs for same inputs', () => {
    const a = deterministicProductId('swsh1-4', 'holofoil');
    const b = deterministicProductId('swsh1-4', 'holofoil');
    expect(a).toBe(b);
  });

  it('produces different IDs for different card+variant combos', () => {
    const a = deterministicProductId('base1-4', 'holofoil');
    const b = deterministicProductId('base1-4', 'reverseholofoil');
    expect(a).not.toBe(b);
  });

  it('produces IDs within a valid range', () => {
    const id = deterministicProductId('swsh1-1', 'normal');
    expect(id).toBeGreaterThan(0);
    expect(id).toBeLessThan(100000001);
  });
});

describe('listPriceCatchUpDates', () => {
  it('fills every gap in the lookback window, not just yesterday', () => {
    const completed = new Set(['2026-09-04']);
    const dates = listPriceCatchUpDates('2026-09-07', completed, {
      easternHour: 4,
      lookbackDays: 5,
    });
    expect(dates).toEqual(['2026-09-02', '2026-09-03', '2026-09-05', '2026-09-06', '2026-09-07']);
  });

  it('does not enqueue today before the 2:00 ET snapshot hour', () => {
    const completed = new Set(['2026-09-06']);
    const dates = listPriceCatchUpDates('2026-09-07', completed, {
      easternHour: 1,
      lookbackDays: 2,
    });
    expect(dates).toEqual(['2026-09-05']);
  });

  it('returns nothing when the window is fully complete', () => {
    const completed = new Set(['2026-09-05', '2026-09-06', '2026-09-07']);
    const dates = listPriceCatchUpDates('2026-09-07', completed, {
      easternHour: 10,
      lookbackDays: 2,
    });
    expect(dates).toEqual([]);
  });
});

describe('shiftIsoDate', () => {
  it('crosses month boundaries with UTC calendar math', () => {
    expect(shiftIsoDate('2026-09-01', -1)).toBe('2026-08-31');
    expect(shiftIsoDate('2026-08-31', 1)).toBe('2026-09-01');
  });
});
