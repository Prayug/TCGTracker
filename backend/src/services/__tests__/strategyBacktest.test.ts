import {
  COST_MODELS,
  Panel,
  breakEvenPrice,
  netReturn,
  runBacktest,
} from '../strategyBacktest/engine';
import { dropFrozenWeeks, pickWeeklyDates } from '../strategyBacktest/service';
import { fairEntry, momentum, noSpikes } from '../strategyBacktest/strategies';

const raw = COST_MODELS.raw;

const weeks = (n: number) =>
  Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(2026, 0, 5 + i * 7));
    return d.toISOString().slice(0, 10);
  });

describe('costs', () => {
  it('a flat round trip loses fees and shipping', () => {
    expect(netReturn(50, 50, raw)).toBeCloseTo((50 * 0.8675 - 1.3) / 51 - 1, 6);
  });

  it('break-even price nets back exactly what was paid', () => {
    const be = breakEvenPrice(50, raw);
    expect(netReturn(50, be, raw)).toBeCloseTo(0, 6);
    expect(be / 50 - 1).toBeGreaterThan(0.2);
  });
});

describe('runBacktest', () => {
  // 60 cards; the first 10 trend up 5%/week, the rest are flat.
  const dates = weeks(12);
  const panel: Panel = {
    market: 'raw',
    dates,
    series: Array.from({ length: 60 }, (_, i) => ({
      id: `c${i}`,
      prices: dates.map((_, t) => (i < 10 ? 100 * 1.05 ** t : 100)),
      lows: dates.map(() => (i < 10 ? null : 95)),
    })),
  };

  it('momentum picks the trending cards and beats the universe', () => {
    const res = runBacktest(panel, momentum, {
      horizonWeeks: 4,
      topN: 10,
      minPrice: 20,
      costs: raw,
    });
    expect(res.formations).toBe(4); // t = 4..7 have a 4w lookback (t=0..3 score null)
    expect(res.beatRate).toBe(1);
    expect(res.meanExcess).toBeGreaterThan(0);
    expect(res.equity.length).toBeGreaterThan(0);
  });

  it('screens buy every candidate and pay the ask when it is above market', () => {
    const lows = dates.map(() => 105);
    const p: Panel = {
      ...panel,
      series: [...panel.series, { id: 'ask', prices: dates.map(() => 100), lows }],
    };
    const atAsk = runBacktest(p, noSpikes, {
      horizonWeeks: 2,
      topN: 5,
      minPrice: 20,
      costs: raw,
      entryAtAsk: true,
    });
    const atMarket = runBacktest(p, noSpikes, {
      horizonWeeks: 2,
      topN: 5,
      minPrice: 20,
      costs: raw,
    });
    expect(atAsk.universeMeanNet).toBeLessThan(atMarket.universeMeanNet);
  });

  it('fair entry only takes $50+ cards with a listing just under market', () => {
    const res = runBacktest(panel, fairEntry, {
      horizonWeeks: 2,
      topN: 5,
      minPrice: 20,
      costs: raw,
      entryAtAsk: true,
    });
    // All 50 flat cards qualify (ask 95 / market 100); trending ones have no listing.
    expect(res.formations).toBeGreaterThan(0);
    expect(res.pickMeanNet).toBeCloseTo(netReturn(100, 100, raw), 6);
  });
});

describe('panel helpers', () => {
  it('snaps weekly targets to nearby available days', () => {
    expect(pickWeeklyDates(['2026-01-01', '2026-01-07', '2026-01-09', '2026-01-15'])).toEqual([
      '2026-01-01',
      '2026-01-07',
      '2026-01-15',
    ]);
  });

  it('drops weeks where nothing moved', () => {
    const series = Array.from({ length: 200 }, (_, i) => ({
      prices: [i + 1, i + 2, i + 2, i + 3],
    }));
    const res = dropFrozenWeeks(['a', 'b', 'c', 'd'], series);
    expect(res.frozen).toEqual(['c']);
    expect(res.keep).toEqual([0, 1, 3]);
  });
});
