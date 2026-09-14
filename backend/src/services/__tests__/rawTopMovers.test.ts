import {
  cliffPctForPeriod,
  isGradualMove,
  isUsdMoverFinish,
  minPointsForPeriod,
  pickLockedFeedSource,
} from '../topMoversQuality';

describe('locked mover feeds', () => {
  it('never compares TCGdex today against catalog last month', () => {
    const locked = pickLockedFeedSource(
      ['tcgdex', 'catalog_fallback', 'tcgcsv'],
      ['catalog_fallback']
    );
    expect(locked).toBe('catalog_fallback');
  });

  it('skips a card that only has TCGdex now and catalog then', () => {
    expect(pickLockedFeedSource(['tcgdex'], ['catalog_fallback'])).toBeNull();
  });

  it('prefers catalog over tcgcsv when both ends exist', () => {
    expect(
      pickLockedFeedSource(['catalog_fallback', 'tcgcsv'], ['catalog_fallback', 'tcgcsv'])
    ).toBe('catalog_fallback');
  });

  it('falls back to tcgcsv when catalog is missing an endpoint', () => {
    expect(pickLockedFeedSource(['tcgcsv', 'tcgdex'], ['tcgcsv'])).toBe('tcgcsv');
  });

  it('uses tcgdex only when TCGPlayer feeds lack an endpoint', () => {
    expect(pickLockedFeedSource(['tcgdex'], ['tcgdex'])).toBe('tcgdex');
    expect(pickLockedFeedSource(['tcgdex', 'catalog_fallback'], ['catalog_fallback'])).toBe(
      'catalog_fallback'
    );
  });

  it('drops Cardmarket EUR finishes', () => {
    expect(isUsdMoverFinish('cardmarket', 'ex8|107|rayquaza|cardmarket')).toBe(false);
    expect(isUsdMoverFinish('normal', 'ex8|107|rayquaza|normal')).toBe(true);
  });
});

describe('Rayquaza Gold Star / Venusaur-EX style series', () => {
  it('rejects the catalog $5999 → $2500.99 data cliff', () => {
    const points = [
      { date: '2026-08-10', price: 5999 },
      { date: '2026-08-13', price: 5999 },
      { date: '2026-08-14', price: 2500.99 },
      { date: '2026-09-09', price: 2500.99 },
    ];
    expect(
      isGradualMove(points, { cliffPct: cliffPctForPeriod(30), minPoints: minPointsForPeriod(30) })
    ).toBe(false);
  });

  it('keeps Venusaur-EX catalog +9% over 30d', () => {
    const points = [
      { date: '2026-08-10', price: 232.7 },
      { date: '2026-08-18', price: 242.88 },
      { date: '2026-08-29', price: 247.64 },
      { date: '2026-09-09', price: 254.39 },
    ];
    expect(
      isGradualMove(points, { cliffPct: cliffPctForPeriod(30), minPoints: minPointsForPeriod(30) })
    ).toBe(true);
    const changePct = ((254.39 - 232.7) / 232.7) * 100;
    expect(changePct).toBeGreaterThan(0);
    expect(changePct).toBeLessThan(15);
  });

  it('would have ranked Rayquaza -99% only by mixing TCGdex $18 with catalog $5999', () => {
    const fakeCrossSource = ((18.81 - 5999) / 5999) * 100;
    expect(fakeCrossSource).toBeLessThan(-99);
    expect(pickLockedFeedSource(['tcgdex'], ['catalog_fallback'])).toBeNull();
  });
});
