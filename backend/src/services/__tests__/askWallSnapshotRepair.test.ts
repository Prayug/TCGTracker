import { findAskWallRepairs } from '../askWallSnapshotRepair';

describe('findAskWallRepairs', () => {
  it('restores the Lugia-EX market on days that stored the ask', () => {
    const repairs = findAskWallRepairs([
      { date: '2026-10-08', price: 1344.25, lowPrice: 1499.99 },
      { date: '2026-10-09', price: 4950, lowPrice: 2900 },
      { date: '2026-10-10', price: 4950, lowPrice: 2900 },
      { date: '2026-10-11', price: 1344.25, lowPrice: 2000 },
      { date: '2026-10-15', price: 3999.99, lowPrice: 2900 },
      { date: '2026-10-16', price: 3999.99, lowPrice: 2900 },
    ]);
    expect(repairs).toEqual([
      { date: '2026-10-09', from: 4950, to: 1344.25 },
      { date: '2026-10-10', from: 4950, to: 1344.25 },
      { date: '2026-10-15', from: 3999.99, to: 1344.25 },
      { date: '2026-10-16', from: 3999.99, to: 1344.25 },
    ]);
  });

  it('keeps a real rise where the old market already sat near the floor', () => {
    expect(
      findAskWallRepairs([
        { date: '2026-09-01', price: 90, lowPrice: 100 },
        { date: '2026-09-02', price: 250, lowPrice: 120 },
      ])
    ).toEqual([]);
  });

  it('leaves a broken market far under the floor alone', () => {
    // Shining Charizard style: $19.99 against a $6,165 floor was never a trusted price.
    expect(
      findAskWallRepairs([
        { date: '2026-09-01', price: 19.99, lowPrice: 6165.99 },
        { date: '2026-09-02', price: 7583, lowPrice: 6165.99 },
      ])
    ).toEqual([]);
  });

  it('does nothing on the first row or rows without a low', () => {
    expect(
      findAskWallRepairs([
        { date: '2026-09-01', price: 4000, lowPrice: 2900 },
        { date: '2026-09-02', price: 9000, lowPrice: null },
      ])
    ).toEqual([]);
  });
});
