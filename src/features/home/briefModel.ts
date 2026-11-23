export interface PricePoint {
  date: string;
  price: number;
}

export interface Move {
  /** Latest priced point. */
  now: number;
  /** Price at (or just before) the start of the window. */
  then: number;
  pct: number;
  /** Prices inside the window, oldest first, for a sparkline. */
  series: number[];
  asOf: string;
}

/**
 * Change over the last `days` days of a price history. Uses the last priced
 * point as "now" and the latest point on or before (now − days) as "then";
 * returns null when the history does not reach back that far.
 */
export function moveOver(history: PricePoint[], days: number): Move | null {
  const pts = history
    .filter((p) => p.price > 0 && !Number.isNaN(Date.parse(p.date)))
    .sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  if (pts.length < 2) return null;
  const last = pts[pts.length - 1];
  const cutoff = Date.parse(last.date) - days * 86_400_000;
  let start: PricePoint | null = null;
  for (const p of pts) {
    if (Date.parse(p.date) <= cutoff) start = p;
    else break;
  }
  if (!start) return null;
  const series = pts
    .filter((p) => Date.parse(p.date) >= Date.parse(start!.date))
    .map((p) => p.price);
  return {
    now: last.price,
    then: start.price,
    pct: ((last.price - start.price) / start.price) * 100,
    series,
    asOf: last.date,
  };
}

/** Morning, afternoon or evening, for the brief's title. */
export function partOfDay(d: Date): 'morning' | 'afternoon' | 'evening' {
  const h = d.getHours();
  return h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'evening';
}
