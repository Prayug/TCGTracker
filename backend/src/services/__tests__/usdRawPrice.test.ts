import { pickUsdRawPrice, type RawCandidate } from '../usdRawPrice';
import { dedupeSlabRowsByCard } from '../gradedSpreadService';
import { pickPreferredSourceRow } from '../topMoversQuality';

const now = new Date('2026-11-03T06:00:00Z');
const row = (over: Partial<RawCandidate>): RawCandidate => ({
  uniqueIdentifier: 'x|1|card|normal',
  variantKey: 'normal',
  date: '2026-11-02',
  price: 10,
  lowPrice: null,
  source: 'tcgdex',
  ...over,
});

describe('pickUsdRawPrice', () => {
  it('ignores Cardmarket finishes and falls back to PriceCharting ungraded for Rayquaza ★', () => {
    const picked = pickUsdRawPrice(
      [
        row({ uniqueIdentifier: 'ex8|107|rayquaza|normal', price: 17.7, lowPrice: 0.86 }),
        row({
          uniqueIdentifier: 'ex8|107|rayquaza|holofoil',
          variantKey: 'holofoil',
          price: 56.3,
          lowPrice: 9.71,
        }),
        row({
          uniqueIdentifier: 'ex8|107|rayquaza|cardmarketholo',
          variantKey: 'cardmarketholo',
          price: 65.1,
        }),
        row({
          uniqueIdentifier: 'ex8|107|rayquaza|cardmarket',
          variantKey: 'cardmarket',
          price: 28.43,
        }),
      ],
      [{ variantKey: 'normal', price: 9394.74, fetchedAt: '2026-11-01 07:33:00' }],
      { now }
    );
    expect(picked).toMatchObject({
      price: 9394.74,
      source: 'pricecharting',
      replacedByPriceCharting: true,
    });
  });

  it('drops a market far under its own low and keeps the TCGCSV quote for Pikachu ★', () => {
    const picked = pickUsdRawPrice(
      [
        row({ uniqueIdentifier: 'ex13|104|pikachu|normal', price: 6.12, lowPrice: 0.54 }),
        row({
          uniqueIdentifier: 'ex13|104|pikachu|holofoil',
          variantKey: 'holofoil',
          price: 3200,
          lowPrice: 5500,
          source: 'tcgcsv',
        }),
      ],
      [{ variantKey: 'normal', price: 4052.63, fetchedAt: '2026-11-01 07:36:00' }],
      { now }
    );
    expect(picked).toMatchObject({ price: 3200, source: 'tcgcsv', replacedByPriceCharting: false });
  });

  it('keeps our price when it is in line with PriceCharting', () => {
    const picked = pickUsdRawPrice(
      [row({ price: 120 })],
      [{ variantKey: 'normal', price: 100, fetchedAt: '2026-11-02 00:00:00' }],
      { now }
    );
    expect(picked?.price).toBe(120);
  });

  it('ignores stale PriceCharting quotes and other print families', () => {
    const picked = pickUsdRawPrice(
      [
        row({ price: 5 }),
        row({
          uniqueIdentifier: 'x|1|card|reverseholofoil',
          variantKey: 'reverseholofoil',
          price: 500,
        }),
      ],
      [
        { variantKey: 'normal', price: 1000, fetchedAt: '2026-08-01 00:00:00' },
        { variantKey: 'reverseholofoil', price: 1000, fetchedAt: '2026-11-02 00:00:00' },
      ],
      { now }
    );
    expect(picked).toMatchObject({ price: 5, replacedByPriceCharting: false });
  });
});

describe('dedupeSlabRowsByCard', () => {
  it('keeps one PSA 10 row per card and print family', () => {
    const base = { verified: 1, fetchedAt: '2026-11-02 08:47:00' };
    const rows = [
      { cardId: 'ex8-107', variantKey: 'holofoil', ...base },
      { cardId: 'ex8-107', variantKey: 'normal', ...base },
      { cardId: 'ex8-107', variantKey: 'cardmarket', ...base },
      { cardId: 'ex8-107', variantKey: 'cardmarketholo', ...base },
      { cardId: 'ex13-79', variantKey: 'normal', ...base },
      { cardId: 'ex13-79', variantKey: 'reverseholofoil', ...base },
    ];
    const kept = dedupeSlabRowsByCard(rows);
    expect(kept.map((r) => `${r.cardId}:${r.variantKey}`)).toEqual([
      'ex8-107:normal',
      'ex13-79:normal',
      'ex13-79:reverseholofoil',
    ]);
  });

  it('prefers the verified and freshest copy', () => {
    const kept = dedupeSlabRowsByCard([
      { cardId: 'a', variantKey: 'normal', verified: 0, fetchedAt: '2026-11-02 00:00:00' },
      { cardId: 'a', variantKey: 'holofoil', verified: 1, fetchedAt: '2026-10-01 00:00:00' },
      { cardId: 'a', variantKey: 'unlimited', verified: 1, fetchedAt: '2026-11-01 00:00:00' },
    ]);
    expect(kept).toHaveLength(1);
    expect(kept[0].variantKey).toBe('unlimited');
  });
});

describe('pickPreferredSourceRow', () => {
  it('lets a self-consistent feed beat a higher-priority quote that contradicts its own low', () => {
    const best = pickPreferredSourceRow([
      { source: 'tcgdex', marketPrice: 207.71, lowPrice: 6997.84 },
      { source: 'tcgcsv', marketPrice: 3200, lowPrice: 5500 },
    ]);
    expect(best?.source).toBe('tcgcsv');
  });
  it('still uses source priority when both are consistent', () => {
    const best = pickPreferredSourceRow([
      { source: 'tcgcsv', marketPrice: 10, lowPrice: 9 },
      { source: 'tcgdex', marketPrice: 11, lowPrice: 9 },
    ]);
    expect(best?.source).toBe('tcgdex');
  });
});

import { blendSlabMarketMark } from '../slabMarketMark';

describe('blendSlabMarketMark last-sale check', () => {
  const now = new Date('2026-11-03T00:00:00Z');
  it('uses the last sale when the guide is more than double it', () => {
    const m = blendSlabMarketMark({
      soldGuide: 365750,
      lastSoldPrice: 49000,
      lastSoldDate: '2026-02-17',
      now,
    });
    expect(m).toMatchObject({ mark: 49000, reason: 'guide_above_last_sale' });
  });
  it('keeps the guide when it is close to the last sale', () => {
    const m = blendSlabMarketMark({
      soldGuide: 6989,
      lastSoldPrice: 4800,
      lastSoldDate: '2026-05-25',
      now,
    });
    expect(m.mark).toBe(6989);
  });
  it('keeps the guide when the last sale is over two years old', () => {
    const m = blendSlabMarketMark({
      soldGuide: 6989,
      lastSoldPrice: 750,
      lastSoldDate: '2023-01-01',
      now,
    });
    expect(m.mark).toBe(6989);
  });
});
