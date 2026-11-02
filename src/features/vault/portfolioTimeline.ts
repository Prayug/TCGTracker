import type { VaultCard } from '../../types/pokemon';
import { hasKnownCost, holdingMarketValue } from '../../utils/vaultCost';

/**
 * How the collection was built, from the user's own records: for each day a
 * card was acquired, the running total of recorded cost and the running total
 * of today's market value for the cards held by then. This is not a price
 * history; it never claims what the collection was worth on a past date.
 */
export interface BuildPoint {
  date: string; // YYYY-MM-DD
  /** Running recorded cost, only holdings with a known cost. */
  cost: number;
  /** Running market value at today's prices, every priced holding acquired by this date. */
  marketToday: number;
  /** Holdings acquired on this date. */
  added: { id: string; name: string; value: number; cost: number | null }[];
}

export function buildTimeline(cards: VaultCard[]): BuildPoint[] {
  const dated = cards
    .map((vc) => ({ vc, day: (vc.purchaseDate || '').slice(0, 10) }))
    .filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x.day))
    .sort((a, b) => a.day.localeCompare(b.day));
  const out: BuildPoint[] = [];
  let cost = 0;
  let market = 0;
  for (const { vc, day } of dated) {
    const value = holdingMarketValue(vc);
    const known = hasKnownCost(vc) ? vc.purchasePrice * vc.quantity : null;
    cost += known ?? 0;
    market += Number.isFinite(value) && value > 0 ? value : 0;
    const last = out[out.length - 1];
    const entry = { id: vc.id, name: vc.card.name, value, cost: known };
    if (last && last.date === day) {
      last.cost = cost;
      last.marketToday = market;
      last.added.push(entry);
    } else {
      out.push({ date: day, cost, marketToday: market, added: [entry] });
    }
  }
  return out;
}

export type TimelineRange = '3m' | '6m' | '1y' | 'all';

/** Points from the start of the range; the running totals carry in, so the first point is not zero. */
export function sliceRange(
  points: BuildPoint[],
  range: TimelineRange,
  now = Date.now()
): BuildPoint[] {
  if (range === 'all' || points.length === 0) return points;
  const days = range === '3m' ? 91 : range === '6m' ? 182 : 365;
  const from = new Date(now - days * 864e5).toISOString().slice(0, 10);
  const inside = points.filter((p) => p.date >= from);
  const before = points.filter((p) => p.date < from).pop();
  return before ? [{ ...before, date: from, added: [] }, ...inside] : inside;
}

/** Cards that have no usable purchase date and so are not on the timeline. */
export function undatedCount(cards: VaultCard[]): number {
  return cards.filter((vc) => !/^\d{4}-\d{2}-\d{2}/.test(vc.purchaseDate || '')).length;
}
