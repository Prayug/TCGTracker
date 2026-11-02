import type { WishlistItem, WishlistPriority } from '../../services/cardWishlistService';

/** Where a wishlist price came from. */
export type PriceBasis = 'live' | 'saved';

/** A price we looked up for a wished card. `price: null` means no price exists. */
export interface LivePrice {
  price: number | null;
  asOf?: string;
}

export type WishStatus = 'at-target' | 'above' | 'no-target' | 'no-price';

export interface WishRow {
  item: WishlistItem;
  /** Best known market price, or null when no price exists. Never 0 as a stand-in. */
  market: number | null;
  basis: PriceBasis;
  asOf?: string;
  status: WishStatus;
  /** Market minus target. Negative or zero means at target. Null when either side is unknown. */
  gap: number | null;
}

export const PRIORITY_RANK: Record<WishlistPriority, number> = { high: 0, medium: 1, low: 2 };
export const PRIORITY_LABEL: Record<WishlistPriority, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

export function knownPrice(n: number | null | undefined): number | null {
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : null;
}

export function wishStatus(market: number | null, target: number | null | undefined): WishStatus {
  const t = knownPrice(target);
  if (t == null) return 'no-target';
  if (market == null) return 'no-price';
  return market <= t ? 'at-target' : 'above';
}

/**
 * Combine stored items with looked-up prices. A live price wins when the
 * lookup succeeded (even if it found no price); otherwise fall back to the
 * price saved with the card when it was added, labelled as such.
 */
export function buildRows(
  items: WishlistItem[],
  live: Map<string, LivePrice>,
  savedPrice: (item: WishlistItem) => number | null
): WishRow[] {
  return items.map((item) => {
    const hit = live.get(item.card.id);
    const market = hit ? knownPrice(hit.price) : savedPrice(item);
    const basis: PriceBasis = hit ? 'live' : 'saved';
    const asOf = hit ? hit.asOf : item.addedAt;
    const target = knownPrice(item.targetPrice);
    return {
      item,
      market,
      basis,
      asOf,
      status: wishStatus(market, target),
      gap: market != null && target != null ? market - target : null,
    };
  });
}

export type WishSort = 'priority' | 'gap' | 'price' | 'added' | 'name';
export type WishShow = 'all' | 'at-target' | 'no-target' | 'high';

export const WISH_SORTS: { id: WishSort; label: string }[] = [
  { id: 'priority', label: 'Priority' },
  { id: 'gap', label: 'Closest to target' },
  { id: 'price', label: 'Price, high to low' },
  { id: 'added', label: 'Recently added' },
  { id: 'name', label: 'Name' },
];

export function filterRows(rows: WishRow[], show: WishShow, q = ''): WishRow[] {
  const needle = q.trim().toLowerCase();
  return rows.filter((r) => {
    if (show === 'at-target' && r.status !== 'at-target') return false;
    if (show === 'no-target' && r.status !== 'no-target') return false;
    if (show === 'high' && r.item.priority !== 'high') return false;
    if (needle) {
      const hay = `${r.item.card.name} ${r.item.card.set?.name ?? ''}`.toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  });
}

/** Sort rows. Unknown values (no price, no target) always sort last. */
export function sortRows(rows: WishRow[], sort: WishSort): WishRow[] {
  const byName = (a: WishRow, b: WishRow) => a.item.card.name.localeCompare(b.item.card.name);
  const unknownLast = (a: number | null, b: number | null, dir: 1 | -1) => {
    if (a == null && b == null) return 0;
    if (a == null) return 1;
    if (b == null) return -1;
    return (a - b) * dir;
  };
  const out = [...rows];
  out.sort((a, b) => {
    switch (sort) {
      case 'gap':
        return unknownLast(a.gap, b.gap, 1) || byName(a, b);
      case 'price':
        return unknownLast(a.market, b.market, -1) || byName(a, b);
      case 'added':
        return b.item.addedAt.localeCompare(a.item.addedAt) || byName(a, b);
      case 'name':
        return byName(a, b);
      default:
        return (
          PRIORITY_RANK[a.item.priority] - PRIORITY_RANK[b.item.priority] ||
          unknownLast(a.gap, b.gap, 1) ||
          byName(a, b)
        );
    }
  });
  return out;
}

export interface WishSummary {
  total: number;
  priced: number;
  /** Sum of known market prices. Unpriced cards are not counted. */
  costAll: number;
  withTarget: number;
  atTarget: number;
  /** Sum of known market prices of cards already at target. */
  costAtTarget: number;
}

export function summarize(rows: WishRow[]): WishSummary {
  let priced = 0;
  let costAll = 0;
  let withTarget = 0;
  let atTarget = 0;
  let costAtTarget = 0;
  for (const r of rows) {
    if (r.market != null) {
      priced += 1;
      costAll += r.market;
    }
    if (r.status !== 'no-target') withTarget += 1;
    if (r.status === 'at-target') {
      atTarget += 1;
      costAtTarget += r.market ?? 0;
    }
  }
  return { total: rows.length, priced, costAll, withTarget, atTarget, costAtTarget };
}

/** Parse a target typed by the user. Blank clears it; non-positive or garbage is rejected. */
export function parseTargetInput(raw: string): number | null | undefined {
  const s = raw.replace(/[$,\s]/g, '');
  if (s === '') return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return Math.round(n * 100) / 100;
}
