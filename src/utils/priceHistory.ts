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

  const byDate = new Map<string, number>();
  for (const point of points) {
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
