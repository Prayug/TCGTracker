import { describe, expect, it } from 'vitest';
import type { StrategyReport, StrategySummary } from '../../types';
import { classifyStrategyReport, maxDrawdown, MIN_WINDOWS } from '../strategyState';

const strat = (over: Partial<StrategySummary> = {}): StrategySummary => ({
  strategyId: 's',
  label: 'S',
  description: '',
  market: 'raw',
  horizonWeeks: 8,
  topN: 20,
  minPrice: 20,
  formations: 0,
  firstFormation: null,
  lastFormation: null,
  beatRate: 0,
  meanExcess: 0,
  pickMeanNet: 0,
  pickMedianNet: 0,
  pickHitRate: 0,
  universeMeanNet: 0,
  universeMedianNet: 0,
  universeHitRate: 0,
  equity: [],
  ...over,
});

const report = (weeks: number, series: number, strategies: StrategySummary[]): StrategyReport => ({
  market: 'raw',
  generatedAt: '2026-10-01',
  horizonWeeks: 8,
  minPrice: 20,
  costs: { sellFeePct: 0.13, sellFixedFee: 0.3, sellShipping: 1, buyShipping: 1 },
  data: {
    firstDate: '2026-06-01',
    lastDate: '2026-10-01',
    weeks,
    series,
    frozenWeeks: 0,
    staleDays: 0,
    lowConfidenceSeries: 0,
  },
  notes: [],
  strategies,
  picks: [],
  spikes: [],
});

const ok = { loading: false, failed: false, horizon: 8 };

describe('classifyStrategyReport', () => {
  it('separates loading and API failure from an empty result', () => {
    expect(classifyStrategyReport(null, { ...ok, loading: true }).kind).toBe('loading');
    expect(classifyStrategyReport(null, ok).kind).toBe('error');
    expect(classifyStrategyReport(report(10, 5, []), { ...ok, failed: true }).kind).toBe('error');
  });

  it('reports no data when there is no price history at all', () => {
    expect(classifyStrategyReport(report(0, 0, [strat()]), ok).kind).toBe('no-data');
  });

  it('explains too little history for the chosen hold, and names a hold that fits', () => {
    const s = classifyStrategyReport(report(6, 400, [strat()]), ok);
    expect(s).toEqual({ kind: 'insufficient-history', weeks: 6, testableHorizon: 4 });
    const none = classifyStrategyReport(report(3, 400, [strat()]), ok);
    expect(none).toEqual({ kind: 'insufficient-history', weeks: 3, testableHorizon: null });
  });

  it('flags enough weeks but too few comparable cards', () => {
    expect(classifyStrategyReport(report(30, 12, [strat()]), ok).kind).toBe('no-universe');
  });

  it('labels a valid run by quality without hiding a poor result', () => {
    const small = classifyStrategyReport(
      report(30, 900, [strat({ formations: MIN_WINDOWS - 1, meanExcess: 0.05 })]),
      ok
    );
    expect(small).toMatchObject({ kind: 'results', quality: 'small-sample' });
    const poor = classifyStrategyReport(
      report(60, 900, [
        strat({ strategyId: 'a', formations: 40, meanExcess: -0.02 }),
        strat({ strategyId: 'b', formations: 40, meanExcess: -0.01 }),
      ]),
      ok
    );
    expect(poor).toMatchObject({ kind: 'results', quality: 'poor', windows: 40 });
    if (poor.kind === 'results') expect(poor.best.strategyId).toBe('b');
    const good = classifyStrategyReport(
      report(60, 900, [strat({ formations: 40, meanExcess: 0.03 })]),
      ok
    );
    expect(good).toMatchObject({ kind: 'results', quality: 'good' });
  });
});

it('never headlines a strategy with a small sample when others have a real one', () => {
  const s = classifyStrategyReport(
    report(60, 900, [
      strat({ strategyId: 'lucky', formations: 3, meanExcess: 0.2 }),
      strat({ strategyId: 'solid', formations: 40, meanExcess: 0.01 }),
    ]),
    ok
  );
  expect(s).toMatchObject({ kind: 'results', quality: 'good', windows: 40 });
  if (s.kind === 'results') expect(s.best.strategyId).toBe('solid');
});

describe('maxDrawdown', () => {
  it('finds the deepest fall from a running peak', () => {
    expect(maxDrawdown([1, 1.2, 0.9, 1.3, 1.1])).toBeCloseTo(-0.25, 6);
    expect(maxDrawdown([1, 1.1, 1.2])).toBe(0);
    expect(maxDrawdown([])).toBe(0);
  });
});
