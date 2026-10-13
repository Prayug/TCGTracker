import { cleanDailySeries } from '../strategyBacktest/cleanSeries';

const series = (prices: number[], start = '2026-08-01') =>
  prices.map((price, i) => {
    const d = new Date(`${start}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i);
    return { date: d.toISOString().slice(0, 10), price };
  });

describe('cleanDailySeries', () => {
  it('suppresses a one-off print that reverts', () => {
    const res = cleanDailySeries(series([100, 100, 100, 220, 100, 100]));
    expect(res.points.map((p) => p.price)).toEqual([100, 100, 100, 100, 100, 100]);
    expect(res.rejected).toBe(1);
    expect(res.lowConfidence).toBe(false);
  });

  it('accepts a new level once it holds for the confirmation window', () => {
    const res = cleanDailySeries(series([100, 100, 100, 150, 150, 150, 150, 150, 150, 150]));
    const out = res.points.map((p) => p.price);
    expect(out[3]).toBe(100); // not yet confirmed
    expect(out[out.length - 1]).toBe(150);
    expect(res.confirmedMoves).toEqual([{ date: '2026-08-09', direction: 1 }]);
  });

  it('flags a series that confirms moves in both directions within 30 days', () => {
    const up = Array(8).fill(200);
    const down = Array(8).fill(100);
    const res = cleanDailySeries(series([100, 100, 100, ...up, ...down]));
    expect(res.confirmedMoves.map((m) => m.direction)).toEqual([1, -1]);
    expect(res.lowConfidence).toBe(true);
  });

  it('passes small moves straight through', () => {
    const res = cleanDailySeries(series([100, 104, 108, 112]));
    expect(res.rejected).toBe(0);
    expect(res.points[3].price).toBeCloseTo(106, 0);
  });
});
