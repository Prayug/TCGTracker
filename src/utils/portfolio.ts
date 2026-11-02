import type { VaultCard } from '../types/pokemon';
import { hasKnownCost, holdingMarketValue } from './vaultCost';

/**
 * Honest portfolio summary. Every figure says what it covers:
 * - market value only counts holdings that have a market price;
 * - P/L only counts holdings with BOTH a known cost and a market price;
 * - coverage tells the reader how much of the collection those figures describe.
 */
export interface PortfolioSummary {
  /** Number of physical copies. */
  copies: number;
  /** Number of ledger entries. */
  entries: number;
  uniqueCards: number;
  /** Sum of market value over priced holdings. */
  marketValue: number;
  /** Entries with no market price at all. */
  unpricedEntries: number;
  /** Cost basis of holdings whose cost is known (and that are priced). */
  knownCost: number;
  /** Market value of those same holdings. */
  knownCostMarket: number;
  /** Unrealised P/L over known-cost holdings, or null when none qualify. */
  unrealized: number | null;
  unrealizedPct: number | null;
  /** Entries missing a purchase price. */
  missingCostEntries: number;
  /** Share of priced market value that has a known cost (0–1). */
  costCoverage: number;
}

export function summarizePortfolio(cards: VaultCard[]): PortfolioSummary {
  let copies = 0;
  let marketValue = 0;
  let unpricedEntries = 0;
  let knownCost = 0;
  let knownCostMarket = 0;
  let knownEntries = 0;
  let missingCostEntries = 0;
  const ids = new Set<string>();

  for (const vc of cards) {
    copies += vc.quantity;
    ids.add(vc.card.id);
    const mv = holdingMarketValue(vc);
    const priced = mv > 0;
    if (priced) marketValue += mv;
    else unpricedEntries += 1;
    const known = hasKnownCost(vc);
    if (!known) missingCostEntries += 1;
    if (known && priced) {
      knownCost += vc.purchasePrice * vc.quantity;
      knownCostMarket += mv;
      knownEntries += 1;
    }
  }

  const unrealized = knownEntries > 0 ? knownCostMarket - knownCost : null;
  const unrealizedPct = unrealized != null && knownCost > 0 ? (unrealized / knownCost) * 100 : null;

  return {
    copies,
    entries: cards.length,
    uniqueCards: ids.size,
    marketValue,
    unpricedEntries,
    knownCost,
    knownCostMarket,
    unrealized,
    unrealizedPct,
    missingCostEntries,
    costCoverage: marketValue > 0 ? knownCostMarket / marketValue : 0,
  };
}

export interface AllocationSlice {
  key: string;
  label: string;
  value: number;
  share: number;
  copies: number;
}

/**
 * Group priced market value by a key. Small groups beyond `limit` are folded
 * into "Other" so the figure stays readable.
 */
export function allocateBy(
  cards: VaultCard[],
  keyOf: (vc: VaultCard) => { key: string; label: string },
  limit = 6
): AllocationSlice[] {
  const map = new Map<string, AllocationSlice>();
  let total = 0;
  for (const vc of cards) {
    const value = holdingMarketValue(vc);
    if (!(value > 0)) continue;
    total += value;
    const { key, label } = keyOf(vc);
    const slot = map.get(key) ?? { key, label, value: 0, share: 0, copies: 0 };
    slot.value += value;
    slot.copies += vc.quantity;
    map.set(key, slot);
  }
  const sorted = [...map.values()].sort((a, b) => b.value - a.value);
  const head = sorted.slice(0, limit);
  const tail = sorted.slice(limit);
  if (tail.length > 0) {
    head.push({
      key: '__other',
      label: `${tail.length} other${tail.length === 1 ? '' : 's'}`,
      value: tail.reduce((s, t) => s + t.value, 0),
      share: 0,
      copies: tail.reduce((s, t) => s + t.copies, 0),
    });
  }
  return head.map((s) => ({ ...s, share: total > 0 ? s.value / total : 0 }));
}

export const bySet = (vc: VaultCard) => ({
  key: vc.card.set?.id || vc.card.set?.name || 'unknown',
  label: vc.card.set?.name || 'Unknown set',
});

/**
 * Collector era bands by release year. Coarse on purpose: Vintage (WotC,
 * ≤2003), Mid-era (2004–2016), Modern (2017+). Unknown dates stay unknown.
 */
export function eraOfRelease(
  releaseDate?: string | null
): 'Vintage' | 'Mid-era' | 'Modern' | 'Unknown' {
  const year = releaseDate ? Number(String(releaseDate).slice(0, 4)) : NaN;
  if (!Number.isFinite(year) || year < 1990) return 'Unknown';
  if (year <= 2003) return 'Vintage';
  if (year <= 2016) return 'Mid-era';
  return 'Modern';
}

export const byEra = (vc: VaultCard) => {
  const era = eraOfRelease(vc.card.set?.releaseDate);
  return { key: era, label: era };
};

/** Highest-value holdings (by priced market value). */
export function topHoldings(cards: VaultCard[], n = 5): VaultCard[] {
  return [...cards]
    .filter((vc) => holdingMarketValue(vc) > 0)
    .sort((a, b) => holdingMarketValue(b) - holdingMarketValue(a))
    .slice(0, n);
}

/** Share of priced value held by the top N holdings (concentration). */
export function concentration(cards: VaultCard[], n = 5): number {
  const total = cards.reduce((s, vc) => s + Math.max(0, holdingMarketValue(vc)), 0);
  if (total <= 0) return 0;
  const top = topHoldings(cards, n).reduce((s, vc) => s + holdingMarketValue(vc), 0);
  return top / total;
}
