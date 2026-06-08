/**
 * Compute a Y-axis domain that doesn't exaggerate small absolute moves.
 * Recharts `auto` fits tightly to min/max, so a $50 move on a $3800 set
 * fills the entire chart. We enforce a minimum span as a % of typical value.
 */
export function computePriceChartDomain(prices: number[]): [number, number] {
  const valid = prices.filter((p) => p > 0 && Number.isFinite(p));
  if (valid.length === 0) return [0, 1];

  const dataMin = Math.min(...valid);
  const dataMax = Math.max(...valid);
  const dataRange = dataMax - dataMin;
  const baseline = valid.reduce((sum, p) => sum + p, 0) / valid.length;

  const minSpanRatio = baseline < 10 ? 0.12 : baseline < 100 ? 0.1 : 0.08;
  const minSpan = Math.max(
    baseline * minSpanRatio,
    baseline < 5 ? 0.5 : baseline < 25 ? 2 : 0
  );

  const span = Math.max(dataRange, minSpan);
  const center = (dataMin + dataMax) / 2;
  const pad = span * 0.04;

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
  const minSpan = Math.max(
    baseline * minSpanRatio,
    baseline < 5 ? 0.5 : baseline < 25 ? 2 : 0
  );

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
