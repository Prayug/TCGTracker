/**
 * Quality helpers for /top-movers — keep gradual market moves, drop data cliffs.
 */

export type MarketSource = 'tcgdex' | 'catalog_fallback' | 'tcgcsv' | string;

/** Prefer live TCGdex snapshots over catalog fallback / legacy tcgcsv. */
export const SOURCE_PRIORITY: MarketSource[] = ['tcgdex', 'catalog_fallback', 'tcgcsv'];

export interface PricePointLite {
  date: string;
  price: number;
}

export interface GradualMoveOptions {
  /** Max allowed |%| between consecutive quotes (e.g. 50). */
  cliffPct: number;
  /** Minimum quotes in the window (inclusive of endpoints). */
  minPoints: number;
}

export function sourceRank(source: string): number {
  const idx = SOURCE_PRIORITY.indexOf(source);
  return idx === -1 ? SOURCE_PRIORITY.length : idx;
}

/** Pick the highest-priority source row from a set sharing the same key. */
export function pickPreferredSourceRow<T extends { source: string }>(rows: T[]): T | null {
  if (rows.length === 0) return null;
  return [...rows].sort((a, b) => sourceRank(a.source) - sourceRank(b.source))[0];
}

/**
 * True when the series looks like a gradual move (no single discontinuous cliff).
 * Points are sorted by date; same-date duplicates keep the last price.
 */
export function isGradualMove(
  points: PricePointLite[],
  { cliffPct, minPoints }: GradualMoveOptions
): boolean {
  if (!points.length) return false;

  const byDate = new Map<string, number>();
  for (const p of points) {
    if (p.price <= 0) continue;
    byDate.set(p.date, p.price);
  }

  const sorted = [...byDate.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, price]) => ({ date, price }));

  if (sorted.length < minPoints) return false;

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1].price;
    if (prev <= 0) return false;
    const stepPct = (Math.abs(sorted[i].price - prev) / prev) * 100;
    if (stepPct > cliffPct) return false;
  }

  return true;
}

export function cliffPctForPeriod(days: number): number {
  return days <= 1 ? 75 : 50;
}

export function minPointsForPeriod(days: number): number {
  return days <= 1 ? 2 : 3;
}
