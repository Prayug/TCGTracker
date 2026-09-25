/**
 * Quality helpers for /top-movers — keep gradual market moves, drop data cliffs.
 */

export type MarketSource =
  | 'tcgdex'
  | 'tcgdex_ja'
  | 'cardmarket'
  | 'pricecharting_raw'
  | 'catalog_fallback'
  | 'tcgcsv'
  | string;

/** Prefer live TCGdex snapshots over catalog fallback / legacy tcgcsv. */
export const SOURCE_PRIORITY: MarketSource[] = [
  'tcgdex',
  'tcgdex_ja',
  'cardmarket',
  'pricecharting_raw',
  'catalog_fallback',
  'tcgcsv',
];

/** SQL fragment: lower rank is the preferred feed. Column must be a trusted identifier. */
export function sqlSourceRankCase(column: string): string {
  const whens = SOURCE_PRIORITY.map((source, index) => `WHEN '${source}' THEN ${index}`).join(' ');
  return `CASE ${column} ${whens} ELSE ${SOURCE_PRIORITY.length} END`;
}

export const DISPLAY_PRICE_SOURCE_SQL = SOURCE_PRIORITY.map((source) => `'${source}'`).join(', ');

/**
 * Feeds used to rank raw top movers, in preference order.
 * Both endpoints of a window must come from the SAME feed — never TCGdex-today
 * vs catalog-last-month (that is the Rayquaza -99% bug). TCGdex is last-resort
 * so 24h still has quotes when TCGPlayer catalog/csv did not move.
 */
export const MOVER_FEED_SOURCES = ['catalog_fallback', 'tcgcsv', 'tcgdex'] as const;
export type MoverFeedSource = (typeof MOVER_FEED_SOURCES)[number];

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

/**
 * True when the last print is a one-day spike off a flat baseline.
 * 24h movers only have two endpoints, so a 61% TCGdex glitch looks "gradual"
 * under cliffPct=75 even though the chart (stable catalog/prior tcgdex) is flat.
 */
export function isIsolatedEndpointSpike(
  points: PricePointLite[],
  options?: { lookback?: number; stablePct?: number; spikePct?: number }
): boolean {
  const lookback = options?.lookback ?? 6;
  const stablePct = options?.stablePct ?? 20;
  const spikePct = options?.spikePct ?? 40;

  const byDate = new Map<string, number>();
  for (const p of points) {
    if (p.price > 0) byDate.set(p.date, p.price);
  }
  const sorted = [...byDate.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  if (sorted.length < 3) return false;

  const last = sorted[sorted.length - 1][1];
  const prev = sorted[sorted.length - 2][1];
  if (prev <= 0) return false;
  const endPct = (Math.abs(last - prev) / prev) * 100;
  if (endPct < spikePct) return false;

  const baseline = sorted.slice(Math.max(0, sorted.length - 1 - lookback), sorted.length - 1);
  if (baseline.length < 2) return false;
  for (let i = 1; i < baseline.length; i++) {
    const from = baseline[i - 1][1];
    const to = baseline[i][1];
    if (from <= 0) return false;
    if ((Math.abs(to - from) / from) * 100 > stablePct) return false;
  }
  return true;
}

/**
 * Soft ceiling on endpoint-to-endpoint |%| before path filtering.
 * Without this, the candidate pool fills with data-error cliffs (e.g. +100000%)
 * and gradual filtering rejects every gainer for 7d/30d windows.
 */
export function maxEndpointChangePctForPeriod(days: number): number {
  if (days <= 1) return 200;
  // Compound headroom under cliffPct with ~daily steps, hard-capped for sanity.
  const cliff = cliffPctForPeriod(days);
  const steps = Math.min(Math.max(days, minPointsForPeriod(days) - 1), 10);
  const compounded = (Math.pow(1 + cliff / 100, steps) - 1) * 100;
  return Math.min(compounded, 400);
}

export function calendarDaysBetween(fromIso: string, toIso: string): number {
  const a = Date.parse(`${fromIso.slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${toIso.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.round((b - a) / 86_400_000);
}

/** Require a real lookback so 30d is not just an 8-day window relabeled. */
export function minSpanDaysForPeriod(days: number): number {
  if (days <= 1) return 1;
  if (days <= 7) return 3;
  return Math.max(14, Math.floor(days * 0.5));
}

/** First feed that has a quote at both ends of the window. */
export function pickLockedFeedSource(
  currentSources: Iterable<string>,
  prevSources: Iterable<string>
): MoverFeedSource | null {
  const current = new Set(currentSources);
  const prev = new Set(prevSources);
  for (const source of MOVER_FEED_SOURCES) {
    if (current.has(source) && prev.has(source)) return source;
  }
  return null;
}

/** Cardmarket EUR finishes are a different series, not TCGPlayer USD. */
export function isUsdMoverFinish(
  subTypeName?: string | null,
  uniqueIdentifier?: string | null
): boolean {
  const subtype = (subTypeName || '').toLowerCase();
  if (subtype.includes('cardmarket')) return false;
  const uid = (uniqueIdentifier || '').toLowerCase();
  if (uid.endsWith('|cardmarket') || uid.endsWith('|cardmarketholo')) return false;
  return true;
}
