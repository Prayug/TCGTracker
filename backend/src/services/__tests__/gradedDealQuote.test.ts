import { pickFreshestGradedQuote } from '../gradedDealQuote';

describe('pickFreshestGradedQuote', () => {
  it('prefers the newer holofoil scrape over the older normal row', () => {
    const picked = pickFreshestGradedQuote(
      [
        { variantKey: 'normal', fetchedAt: '2026-09-25 05:32:33', price: 4125 },
        { variantKey: 'holofoil', fetchedAt: '2026-10-13 06:32:20', price: 3885.35 },
        { variantKey: 'reverseholofoil', fetchedAt: '2026-10-14 00:00:00', price: 100 },
      ],
      'holofoil'
    );
    expect(picked?.price).toBe(3885.35);
    expect(picked?.variantKey).toBe('holofoil');
  });

  it('keeps a reverse quote off the standard rows', () => {
    const picked = pickFreshestGradedQuote(
      [
        { variantKey: 'normal', fetchedAt: '2026-10-13 06:32:51', price: 132265.74 },
        { variantKey: 'reverseholofoil', fetchedAt: '2026-10-09 09:05:12', price: 16100 },
      ],
      'reverseholofoil'
    );
    expect(picked?.price).toBe(16100);
  });
});
