import { PricePoint } from '../types/pokemon';

export function toIsoDate(value: string): string {
  return value.includes('T') ? value.split('T')[0] : value;
}

export type ChartPointKind = 'quote' | 'carried' | 'break';

export interface ChartPricePoint {
  date: string;
  price: number | null;
  /** Price from an actual TCGPlayer/market snapshot on this date */
  quotePrice: number | null;
  /** Prior price carried forward (weekend / 1–2 day feed gap only) */
  carryPrice: number | null;
  hasQuote: boolean;
  kind: ChartPointKind;
}

export interface PreparedChartSeries {
  points: ChartPricePoint[];
  quoteCount: number;
  carriedDayCount: number;
  missingSpanCount: number;
}

/** Days between two ISO dates (UTC calendar days). */
export function daysBetweenIso(start: string, end: string): number {
  const a = new Date(`${toIsoDate(start)}T00:00:00Z`).getTime();
  const b = new Date(`${toIsoDate(end)}T00:00:00Z`).getTime();
  return Math.round((b - a) / 86_400_000);
}

function addUtcDays(isoDate: string, days: number): string {
  const d = new Date(`${toIsoDate(isoDate)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * TCGdex / catalog_fallback often rewrite the same snapshot every night, then
 * cliff to a new value when the feed finally updates. That looks like a real
 * crash on charts. When a long exact plateau from those sources is followed by
 * a downward step that itself holds, rewrite the stale plateau to the
 * post-update quote. Upward moves are left alone (real pumps).
 */
export function repairStalePlateauCliffs(
  points: Array<PricePoint & { source?: string }>,
  options?: { minPlateauDays?: number; cliffPct?: number; minFollowDays?: number }
): PricePoint[] {
  const minPlateauDays = options?.minPlateauDays ?? 10;
  const cliffPct = options?.cliffPct ?? 8;
  const minFollowDays = options?.minFollowDays ?? 5;

  const sorted = [...points]
    .map((p) => ({
      date: toIsoDate(p.date),
      price: p.price,
      source: (p.source || '').toLowerCase(),
    }))
    .filter((p) => p.price > 0)
    .sort((a, b) => a.date.localeCompare(b.date));

  if (sorted.length < minPlateauDays + minFollowDays) return points;

  const byDate = new Map<string, { price: number; staleSource: boolean }>();
  for (const p of sorted) {
    const staleSource = p.source === 'tcgdex' || p.source === 'catalog_fallback' || !p.source;
    byDate.set(p.date, { price: p.price, staleSource });
  }
  const series = [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({ date, price: v.price, staleSource: v.staleSource }));

  type Run = { start: number; end: number; price: number; staleShare: number };
  const runs: Run[] = [];
  for (let i = 0; i < series.length; i++) {
    const last = runs[runs.length - 1];
    if (last && Math.abs(last.price - series[i].price) < 0.005) {
      last.end = i;
      last.staleShare += series[i].staleSource ? 1 : 0;
    } else {
      runs.push({
        start: i,
        end: i,
        price: series[i].price,
        staleShare: series[i].staleSource ? 1 : 0,
      });
    }
  }

  const corrected = series.map((p) => ({ ...p }));
  for (let r = 0; r < runs.length - 1; r++) {
    const cur = runs[r];
    const next = runs[r + 1];
    const plateauLen = cur.end - cur.start + 1;
    const followLen = next.end - next.start + 1;
    if (plateauLen < minPlateauDays || followLen < minFollowDays) continue;
    if (cur.price <= 0) continue;
    // Only correct stale-feed plateaus that cliff downward.
    if (next.price >= cur.price) continue;
    if (cur.staleShare / plateauLen < 0.7) continue;
    const stepPct = ((cur.price - next.price) / cur.price) * 100;
    if (stepPct < cliffPct) continue;

    for (let i = cur.start; i <= cur.end; i++) {
      corrected[i].price = next.price;
    }
  }

  const outMap = new Map(corrected.map((p) => [p.date, p.price]));
  return points.map((p) => {
    const key = toIsoDate(p.date);
    const next = outMap.get(key);
    return next == null ? p : { ...p, price: next };
  });
}

/**
 * Build chart series from raw market quotes.
 * - Only real quotes get dots and "market quote" tooltips.
 * - Short gaps (≤3 days, e.g. weekends) may carry the prior price.
 * - Longer gaps break the line so a flat "outage plateau" is not drawn.
 */
export function preparePriceChartSeries(
  points: PricePoint[],
  options?: { maxCarryGapDays?: number }
): PreparedChartSeries {
  const maxCarryGapDays = options?.maxCarryGapDays ?? 3;

  const repaired = repairStalePlateauCliffs(points);

  const byDate = new Map<string, number>();
  for (const point of repaired) {
    const key = toIsoDate(point.date);
    if (point.price > 0) {
      byDate.set(key, point.price);
    }
  }

  const sortedQuotes = Array.from(byDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, price]) => ({ date, price }));

  if (sortedQuotes.length === 0) {
    return { points: [], quoteCount: 0, carriedDayCount: 0, missingSpanCount: 0 };
  }

  const out: ChartPricePoint[] = [];
  let carriedDayCount = 0;
  let missingSpanCount = 0;

  const pushQuote = (date: string, price: number) => {
    out.push({
      date,
      price,
      quotePrice: price,
      carryPrice: null,
      hasQuote: true,
      kind: 'quote',
    });
  };

  const pushCarried = (date: string, price: number) => {
    out.push({
      date,
      price,
      quotePrice: null,
      carryPrice: price,
      hasQuote: false,
      kind: 'carried',
    });
    carriedDayCount += 1;
  };

  const pushBreak = (date: string) => {
    out.push({
      date,
      price: null,
      quotePrice: null,
      carryPrice: null,
      hasQuote: false,
      kind: 'break',
    });
  };

  pushQuote(sortedQuotes[0].date, sortedQuotes[0].price);

  for (let i = 1; i < sortedQuotes.length; i++) {
    const prev = sortedQuotes[i - 1];
    const current = sortedQuotes[i];
    const gapDays = daysBetweenIso(prev.date, current.date);

    if (gapDays > maxCarryGapDays) {
      missingSpanCount += 1;
      pushBreak(addUtcDays(prev.date, 1));
    } else if (gapDays > 1) {
      let cursor = addUtcDays(prev.date, 1);
      while (cursor < current.date) {
        pushCarried(cursor, prev.price);
        cursor = addUtcDays(cursor, 1);
      }
    }

    pushQuote(current.date, current.price);
  }

  return {
    points: out,
    quoteCount: sortedQuotes.length,
    carriedDayCount,
    missingSpanCount,
  };
}

/** @deprecated Use preparePriceChartSeries — old helper kept for any legacy callers */
export function fillPriceHistoryGaps(
  points: PricePoint[],
  options?: { maxGapDays?: number }
): { points: PricePoint[]; filledDayCount: number } {
  const prepared = preparePriceChartSeries(points, {
    maxCarryGapDays: Math.min(options?.maxGapDays ?? 3, 3),
  });
  return {
    points: prepared.points
      .filter((p) => p.kind !== 'break' && p.price !== null)
      .map((p) => ({ date: p.date, price: p.price as number })),
    filledDayCount: prepared.carriedDayCount,
  };
}
