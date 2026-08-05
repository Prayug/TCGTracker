import {
  getPriceAtDate,
  computeMovingAverages,
  computeVolatility,
  PricePoint,
} from '../marketAnalyzer';

const point = (date: string, price: number): PricePoint => ({
  date,
  marketPrice: price,
  price,
});

describe('getPriceAtDate', () => {
  it('returns the price on or before the target date', () => {
    const points = [point('2026-07-10', 10), point('2026-07-15', 12), point('2026-07-20', 14)];
    expect(getPriceAtDate(points, new Date('2026-07-18T00:00:00Z'))).toBe(12);
  });

  it('handles T-timestamps in the input series', () => {
    const points = [
      { ...point('2026-07-10', 10), date: '2026-07-10T09:00:00.000Z' },
      point('2026-07-20', 14),
    ];
    expect(getPriceAtDate(points, new Date('2026-07-12T00:00:00Z'))).toBe(10);
  });

  it('returns null when no quote predates the target', () => {
    expect(getPriceAtDate([point('2026-07-10', 10)], new Date('2026-07-01T00:00:00Z'))).toBeNull();
  });
});

describe('computeMovingAverages (calendar windows)', () => {
  const pts: PricePoint[] = [
    point('2026-06-20', 100),
    point('2026-06-27', 100),
    point('2026-07-01', 90),
    point('2026-07-10', 110),
    point('2026-07-11', 100),
    point('2026-07-17', 110),
  ];

  it('ma7 averages only quotes within the trailing 7 calendar days', () => {
    const { ma7 } = computeMovingAverages(pts);
    // trailing 7 days from 2026-07-17: 07-11 .. 07-17 -> [100, 110]
    expect(ma7).toBeCloseTo(105);
  });

  it('ma30 spans the full trailing month including sparse quotes', () => {
    const { ma30 } = computeMovingAverages(pts);
    // 2026-06-18 .. 07-17 -> [100, 100, 90, 110, 100, 110]
    expect(ma30).toBeCloseTo(610 / 6);
  });

  it('ma90 covers the whole series', () => {
    const { ma90 } = computeMovingAverages(pts);
    expect(ma90).toBeCloseTo((100 + 100 + 90 + 110 + 100 + 110) / 6);
  });

  it('returns nulls for empty series', () => {
    expect(computeMovingAverages([])).toEqual({ ma7: null, ma30: null, ma90: null });
  });
});

describe('computeVolatility (gap-normalized)', () => {
  it('volatility is dampened when the series has multi-day gaps', () => {
    const weekly: PricePoint[] = [];
    for (let i = 0; i < 30; i++) {
      const d = new Date('2026-06-01T00:00:00Z');
      d.setDate(d.getDate() + i);
      weekly.push(point(d.toISOString().split('T')[0], 100 * (i % 2 === 0 ? 1 : 1.1)));
    }
    const sparse: PricePoint[] = [];
    for (let i = 0; i < 15; i++) {
      const d = new Date('2026-06-01T00:00:00Z');
      d.setDate(d.getDate() + i * 2);
      sparse.push(point(d.toISOString().split('T')[0], 100 * (i % 2 === 0 ? 1 : 1.1)));
    }
    const denseVol = computeVolatility(weekly).dailyVolatility;
    const sparseVol = computeVolatility(sparse).dailyVolatility;
    // Same alternation pattern, but sparse observations are normalized per-day:
    // the sparse series must not report wildly higher daily volatility.
    expect(sparseVol).toBeLessThan(denseVol * 1.5);
  });

  it('raises uncertainty defaults for sparse data (< 7 points)', () => {
    const vol = computeVolatility([point('2026-07-01', 100), point('2026-07-05', 105)]);
    expect(vol.dailyVolatility).toBeGreaterThan(0.05);
    expect(vol.monthlyVolatility).toBeGreaterThan(0.25);
  });

  it('returns default uncertainty for empty series', () => {
    const vol = computeVolatility([]);
    expect(vol.dailyVolatility).toBeCloseTo(0.05);
    expect(vol.monthlyVolatility).toBeCloseTo(0.25);
  });
});
