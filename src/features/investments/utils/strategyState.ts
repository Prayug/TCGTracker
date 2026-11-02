import type { StrategyReport, StrategySummary } from '../types';

/** Fewer test windows than this and results are shown as a small sample. */
export const MIN_WINDOWS = 8;

export type StrategyState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'no-data' }
  | {
      kind: 'insufficient-history';
      weeks: number;
      /** The longest hold the current history can test at all, or null if none. */
      testableHorizon: number | null;
    }
  | { kind: 'no-universe'; weeks: number; series: number }
  | {
      kind: 'results';
      quality: 'small-sample' | 'poor' | 'good';
      windows: number;
      best: StrategySummary;
    };

const HORIZONS = [4, 8, 12];

/**
 * Why the strategy view looks the way it does, from what the backtest
 * returned. Each state has its own screen, so an empty run is never shown
 * as a table of dashes.
 *
 * A window is a week where a strategy could buy and, `horizon` weeks later,
 * sell. That needs more than `horizon` weeks of prices, and enough cards
 * priced at both ends to compare against.
 */
export function classifyStrategyReport(
  report: StrategyReport | null,
  opts: { loading: boolean; failed: boolean; horizon: number }
): StrategyState {
  if (opts.loading) return { kind: 'loading' };
  if (opts.failed || !report) return { kind: 'error' };
  const { weeks = 0, series = 0 } = report.data ?? {};
  if (!weeks || !series) return { kind: 'no-data' };
  const tested = report.strategies.filter((s) => s.formations > 0);
  if (tested.length === 0) {
    if (weeks <= opts.horizon) {
      const fits = HORIZONS.filter((h) => h < weeks);
      return {
        kind: 'insufficient-history',
        weeks,
        testableHorizon: fits.length ? fits[fits.length - 1] : null,
      };
    }
    return { kind: 'no-universe', weeks, series };
  }
  const windows = Math.max(...tested.map((s) => s.formations));
  // Lead with a strategy that has a real sample when one exists, so a lucky
  // handful of windows never headlines the result.
  const ample = tested.filter((s) => s.formations >= MIN_WINDOWS);
  const best = [...(ample.length ? ample : tested)].sort((a, b) => b.meanExcess - a.meanExcess)[0];
  const quality = windows < MIN_WINDOWS ? 'small-sample' : best.meanExcess <= 0 ? 'poor' : 'good';
  return { kind: 'results', quality, windows, best };
}

/** Largest peak-to-trough fall of a growth-of-$1 series, as a negative fraction. */
export function maxDrawdown(values: number[]): number {
  let peak = -Infinity;
  let worst = 0;
  for (const v of values) {
    if (!Number.isFinite(v)) continue;
    peak = Math.max(peak, v);
    if (peak > 0) worst = Math.min(worst, v / peak - 1);
  }
  return worst;
}
