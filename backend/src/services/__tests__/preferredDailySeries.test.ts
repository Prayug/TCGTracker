import {
  collapsePreferredDailyQuotes,
  pickPreferredSnapshotPrices,
} from '../cardEnrichment';

describe('preferred daily price series', () => {
  it('keeps the catalog quote when a frozen tcgcsv carry-forward shares the day', () => {
    const series = collapsePreferredDailyQuotes([
      {
        date: '2026-09-24',
        source: 'tcgcsv',
        price: 824.51,
        marketPrice: 824.51,
        lowPrice: 855.09,
        highPrice: 10000,
      },
      {
        date: '2026-09-24',
        source: 'catalog_fallback',
        price: 685.09,
        marketPrice: 685.09,
        lowPrice: 649,
        highPrice: 10000,
      },
      {
        date: '2026-06-26',
        source: 'catalog_fallback',
        price: 885.54,
        marketPrice: 885.54,
        lowPrice: 795.66,
        highPrice: 10000,
      },
    ]);

    expect(series).toEqual([
      { date: '2026-06-26', price: 885.54, marketPrice: 885.54 },
      { date: '2026-09-24', price: 685.09, marketPrice: 685.09 },
    ]);
  });

  it('does not let the stale higher quote win the browse price', () => {
    const prices = pickPreferredSnapshotPrices([
      {
        cardId: 'me2-125',
        uniqueIdentifier: 'me2|125|megacharizardxex|holofoil',
        date: '2026-09-24',
        source: 'tcgcsv',
        price: 824.51,
        marketPrice: 824.51,
        lowPrice: 855.09,
        highPrice: 10000,
      },
      {
        cardId: 'me2-125',
        uniqueIdentifier: 'me2|125|megacharizardxex|holofoil',
        date: '2026-09-24',
        source: 'catalog_fallback',
        price: 685.09,
        marketPrice: 685.09,
        lowPrice: 649,
        highPrice: 10000,
      },
    ]);

    expect(prices.get('me2-125')).toBe(685.09);
  });
});
