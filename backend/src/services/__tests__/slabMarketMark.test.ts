import { blendSlabMarketMark } from '../slabMarketMark';
import { isPsa10ActiveListingTitle, summarizeListingPrices } from '../ebayBrowseClient';

describe('blendSlabMarketMark', () => {
  const now = new Date('2026-08-18T00:00:00Z');

  it('uses sold guide when there are no asks', () => {
    const mark = blendSlabMarketMark({
      soldGuide: 500,
      lastSoldDate: '2025-09-12',
      lastSoldPrice: 500,
      now,
    });
    expect(mark.mark).toBe(500);
    expect(mark.askWeight).toBe(0);
    expect(mark.staleSold).toBe(true);
    expect(mark.reason).toBe('sold_only_stale');
    expect(mark.lastSoldAgeDays).toBe(340);
  });

  it('keeps PriceCharting as the mark when listed is far above sold', () => {
    const mark = blendSlabMarketMark({
      soldGuide: 500,
      lastSoldDate: '2025-09-12',
      lastSoldPrice: 500,
      listedLow: 4500,
      listedAvg: 4500,
      listedCount: 4,
      now,
    });
    expect(mark.staleSold).toBe(true);
    expect(mark.askWeight).toBe(0);
    expect(mark.mark).toBe(500);
    expect(mark.listedPremiumPct).toBe(800);
    expect(mark.reason).toBe('sold_with_asks_stale');
  });

  it('does not mix a single moon ask into the quote', () => {
    const mark = blendSlabMarketMark({
      soldGuide: 500,
      lastSoldDate: '2025-09-12',
      listedLow: 4500,
      listedAvg: 4500,
      listedCount: 1,
      now,
    });
    expect(mark.askWeight).toBe(0);
    expect(mark.mark).toBe(500);
    expect(mark.reason).toBe('sold_with_asks_stale');
  });

  it('still quotes PriceCharting when asks agree', () => {
    const mark = blendSlabMarketMark({
      soldGuide: 105,
      lastSoldDate: '2026-08-18',
      listedLow: 110,
      listedAvg: 118,
      listedCount: 8,
      now,
    });
    expect(mark.reason).toBe('sold_with_asks');
    expect(mark.mark).toBe(105);
    expect(mark.askWeight).toBe(0);
    expect(mark.staleSold).toBe(false);
  });
});

describe('listing title filter', () => {
  const card = { cardName: 'Charizard GX', setName: 'Hidden Fates', cardNumber: '9' };

  it('accepts a PSA 10 BIN of the same card', () => {
    expect(
      isPsa10ActiveListingTitle(
        '2019 Pokemon Hidden Fates Charizard GX #9/68 PSA 10 GEM MINT',
        card
      )
    ).toBe(true);
  });

  it('rejects lots, proxies, and the wrong number', () => {
    expect(isPsa10ActiveListingTitle('Charizard GX Hidden Fates PSA 10 lot of 3', card)).toBe(
      false
    );
    expect(isPsa10ActiveListingTitle('Charizard GX #9 Hidden Fates PSA 10 proxy', card)).toBe(
      false
    );
    expect(
      isPsa10ActiveListingTitle('Charizard GX SV49 Hidden Fates Shiny Vault PSA 10', card)
    ).toBe(false);
  });

  it('rejects a PSA 10 of the same name/number from a different set', () => {
    expect(isPsa10ActiveListingTitle('PSA 10 Charizard GX Burning Shadows #9/147 Holo', card)).toBe(
      false
    );
  });
});

describe('summarizeListingPrices', () => {
  it('returns lowest and average of inliers', () => {
    const quote = summarizeListingPrices([4500, 4600, 4700, 4800, 20000]);
    expect(quote).not.toBeNull();
    expect(quote!.listedLow).toBe(4500);
    expect(quote!.listedCount).toBe(4);
    expect(quote!.listedAvg).toBeCloseTo(4650, 0);
  });
});
