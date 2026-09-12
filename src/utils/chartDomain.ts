/**
 * Compute a Y-axis domain around the series min/max (not from $0).
 * Meaningful % moves stay visible; tiny absolute noise on high-value
 * series still gets a modest minimum span so the chart isn't pure noise.
 */
export function computePriceChartDomain(prices: number[]): [number, number] {
  const valid = prices.filter((p) => p > 0 && Number.isFinite(p));
  if (valid.length === 0) return [0, 1];

  const dataMin = Math.min(...valid);
  const dataMax = Math.max(...valid);
  const dataRange = dataMax - dataMin;
  const baseline = valid.reduce((sum, p) => sum + p, 0) / valid.length;

  // Floor only for very small moves — a ~8–12% swing should fill most of the plot.
  const minSpanRatio = baseline < 10 ? 0.12 : baseline < 100 ? 0.1 : 0.08;
  const minSpan = Math.max(baseline * minSpanRatio, baseline < 5 ? 0.5 : baseline < 25 ? 2 : 0);

  const span = Math.max(dataRange, minSpan);
  const center = (dataMin + dataMax) / 2;
  const pad = Math.max(span * 0.06, baseline * 0.01);

  let yMin = center - span / 2 - pad;
  let yMax = center + span / 2 + pad;

  if (yMin < 0) {
    yMin = 0;
    yMax = Math.max(yMax, dataMax + pad);
  }

  return [yMin, yMax];
}

/** Same min-span logic for inline sparklines (returns min/max for scaling). */
export function computeSparklineRange(data: number[]): { min: number; max: number } {
  const valid = data.filter((p) => Number.isFinite(p));
  if (valid.length === 0) return { min: 0, max: 1 };

  const dataMin = Math.min(...valid);
  const dataMax = Math.max(...valid);
  const dataRange = dataMax - dataMin;
  const baseline = valid.reduce((s, p) => s + p, 0) / valid.length;

  const minSpanRatio = baseline < 10 ? 0.12 : baseline < 100 ? 0.1 : 0.08;
  const minSpan = Math.max(baseline * minSpanRatio, baseline < 5 ? 0.5 : baseline < 25 ? 2 : 0);

  const span = Math.max(dataRange, minSpan);
  const center = (dataMin + dataMax) / 2;

  return {
    min: center - span / 2,
    max: center + span / 2,
  };
}

export function formatPriceChange(
  first: number,
  last: number
): { delta: number; percent: number; label: string } {
  const delta = last - first;
  const percent = first > 0 ? (delta / first) * 100 : 0;
  const money = `${delta >= 0 ? '+' : '−'}$${Math.abs(delta).toFixed(2)}`;
  const pct = `(${percent >= 0 ? '+' : ''}${percent.toFixed(1)}%)`;
  return { delta, percent, label: `${money} ${pct}` };
}

export const PRICE_RANGES = ['1M', '3M', '6M', '1Y', 'ALL'] as const;
export type PriceRangeKey = (typeof PRICE_RANGES)[number];

const RANGE_DAYS: Record<PriceRangeKey, number | null> = {
  '1M': 30,
  '3M': 90,
  '6M': 180,
  '1Y': 365,
  ALL: null,
};

/** Keep the last point before the window so the line doesn't jump from empty. */
export function slicePriceHistory<T extends { date: string }>(
  history: T[],
  range: PriceRangeKey
): T[] {
  if (range === 'ALL' || history.length === 0) return history;
  const days = RANGE_DAYS[range];
  if (days == null) return history;

  const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date));
  const lastMs = Date.parse(sorted[sorted.length - 1].date);
  if (!Number.isFinite(lastMs)) return sorted;

  const cutoff = lastMs - days * 86_400_000;
  const inRange = sorted.filter((p) => Date.parse(p.date) >= cutoff);
  const before = [...sorted].reverse().find((p) => Date.parse(p.date) < cutoff);
  if (before && inRange[0] !== before) {
    return [before, ...inRange];
  }
  return inRange.length > 0 ? inRange : sorted.slice(-2);
}

/**
 * Tight Y-domain around visible values so a $355k–$370k series
 * is not plotted against $0–$500k.
 */
export function computeTightChartDomain(
  values: number[],
  options?: { includeZero?: boolean }
): [number, number] {
  const valid = values.filter((v) => Number.isFinite(v));
  if (valid.length === 0) return options?.includeZero ? [-1, 1] : [0, 1];

  let dataMin = Math.min(...valid);
  let dataMax = Math.max(...valid);
  if (options?.includeZero) {
    dataMin = Math.min(dataMin, 0);
    dataMax = Math.max(dataMax, 0);
  }

  const dataRange = dataMax - dataMin;
  const magnitude = Math.max(Math.abs(dataMin), Math.abs(dataMax), 1);
  const minSpan = magnitude * 0.02;
  const span = Math.max(dataRange, minSpan);
  const pad = Math.max(span * 0.12, magnitude * 0.006);

  let yMin = dataMin - pad;
  let yMax = dataMax + pad;

  if (!options?.includeZero && yMin < 0 && dataMin >= 0) {
    yMin = Math.max(0, dataMin * 0.98);
  }
  if (yMax <= yMin) yMax = yMin + minSpan;
  return [yMin, yMax];
}

export function formatCompactAxisPrice(price: number): string {
  const abs = Math.abs(price);
  const sign = price < 0 ? '−' : '';
  if (abs >= 1_000_000) {
    const millions = abs / 1_000_000;
    const body = millions >= 10 ? millions.toFixed(0) : millions.toFixed(1).replace(/\.0$/, '');
    return `${sign}$${body}M`;
  }
  if (abs >= 10_000) {
    return `${sign}$${Math.round(abs / 1000)}k`;
  }
  if (abs >= 100) return `${sign}$${abs.toFixed(0)}`;
  if (abs >= 10) return `${sign}$${abs.toFixed(1)}`;
  return `${sign}$${abs.toFixed(2)}`;
}

export function formatAxisPercent(value: number): string {
  const abs = Math.abs(value).toFixed(1);
  if (value > 0) return `+${abs}%`;
  if (value < 0) return `−${abs}%`;
  return '0%';
}
