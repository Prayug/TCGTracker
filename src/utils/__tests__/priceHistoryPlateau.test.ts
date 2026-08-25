import { repairStalePlateauCliffs } from '../priceHistory';

describe('repairStalePlateauCliffs', () => {
  it('rewrites a long stale tcgdex plateau that cliffs downward', () => {
    const points = [
      ...Array.from({ length: 20 }, (_, i) => ({
        date: `2026-06-${String(i + 1).padStart(2, '0')}`,
        price: 556.25,
        source: 'tcgdex',
      })),
      ...Array.from({ length: 10 }, (_, i) => ({
        date: `2026-07-${String(i + 1).padStart(2, '0')}`,
        price: 465,
        source: 'tcgdex',
      })),
    ];

    const repaired = repairStalePlateauCliffs(points);
    expect(repaired.every((p) => p.price === 465)).toBe(true);
  });

  it('does not rewrite real upward moves', () => {
    const points = [
      ...Array.from({ length: 20 }, (_, i) => ({
        date: `2026-06-${String(i + 1).padStart(2, '0')}`,
        price: 2100,
        source: 'tcgcsv',
      })),
      ...Array.from({ length: 10 }, (_, i) => ({
        date: `2026-07-${String(i + 1).padStart(2, '0')}`,
        price: 5250,
        source: 'tcgcsv',
      })),
    ];

    const repaired = repairStalePlateauCliffs(points);
    expect(repaired.filter((p) => p.price === 2100).length).toBe(20);
    expect(repaired.filter((p) => p.price === 5250).length).toBe(10);
  });
});
