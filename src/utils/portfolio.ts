import { classifySetEra } from '@tcgtracker/shared';
import { ptcgImagesForId } from './cardImage';
import type { VaultCard } from '../types/pokemon';
import { costStatus, holdingMarketValue } from './vaultCost';

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
  /** Entries without a recorded cost (unknown or unverified). */
  missingCostEntries: number;
  /** Entries whose stored cost equals market and has not been confirmed. */
  unverifiedCostEntries: number;
  /** Entries with a recorded cost. */
  costKnownCount: number;
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
  let unverifiedCostEntries = 0;
  const ids = new Set<string>();

  for (const vc of cards) {
    copies += vc.quantity;
    ids.add(vc.card.id);
    const mv = holdingMarketValue(vc);
    const priced = mv > 0;
    if (priced) marketValue += mv;
    else unpricedEntries += 1;
    const status = costStatus(vc);
    const known = status === 'recorded';
    if (!known) missingCostEntries += 1;
    if (status === 'unverified') unverifiedCostEntries += 1;
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
    unverifiedCostEntries,
    costKnownCount: knownEntries,
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
export type EraBand = 'Vintage' | 'Mid-era' | 'Modern' | 'Unknown';

export function eraOfRelease(releaseDate?: string | null): EraBand {
  const year = releaseDate ? Number(String(releaseDate).slice(0, 4)) : NaN;
  if (!Number.isFinite(year) || year < 1990) return 'Unknown';
  if (year <= 2003) return 'Vintage';
  if (year <= 2016) return 'Mid-era';
  return 'Modern';
}

/**
 * Series whose every set falls inside one band, so the series alone settles
 * the band. EX is left out on purpose: its first sets came out in 2003 and
 * the rest after, so it needs a real release date.
 */
const BAND_BY_SERIES: Record<string, EraBand> = {
  base: 'Vintage',
  gym: 'Vintage',
  neo: 'Vintage',
  ecard: 'Vintage',
  dp: 'Mid-era',
  hgss: 'Mid-era',
  col: 'Mid-era',
  bw: 'Mid-era',
  xy: 'Mid-era',
  sm: 'Modern',
  swsh: 'Modern',
  sv: 'Modern',
  mega: 'Modern',
};

/** How an era was decided, so the UI can say what is known and what is not. */
export type EraBasis = 'card' | 'catalog' | 'series' | 'none';

export interface EraResolution {
  era: EraBand;
  basis: EraBasis;
  setId: string | null;
}

/** The set id for a holding: the stored one, or the prefix of a Pokémon TCG card id. */
export function setIdOf(vc: VaultCard): string | null {
  if (vc.card.set?.id) return vc.card.set.id;
  return ptcgImagesForId(vc.card.id) ? vc.card.id.slice(0, vc.card.id.lastIndexOf('-')) : null;
}

/**
 * Era for a holding, from the most direct evidence available: the card's own
 * release date, then the set catalog's date for its set id, then the series
 * the set id belongs to when that series sits wholly in one band. Nothing is
 * guessed past that; the rest is Unknown and listed as needing metadata.
 */
export function resolveEra(vc: VaultCard, setDates?: ReadonlyMap<string, string>): EraResolution {
  const setId = setIdOf(vc);
  const own = eraOfRelease(vc.card.set?.releaseDate);
  if (own !== 'Unknown') return { era: own, basis: 'card', setId };
  const catalogDate = setId ? setDates?.get(setId) : undefined;
  const fromCatalog = eraOfRelease(catalogDate);
  if (fromCatalog !== 'Unknown') return { era: fromCatalog, basis: 'catalog', setId };
  if (setId) {
    const series = classifySetEra({
      id: setId,
      name: vc.card.set?.name ?? '',
      series: (vc.card.set as { series?: string } | undefined)?.series,
    });
    const band = BAND_BY_SERIES[series];
    if (band) return { era: band, basis: 'series', setId };
  }
  return { era: 'Unknown', basis: 'none', setId };
}

export const byEra = (vc: VaultCard) => {
  const era = eraOfRelease(vc.card.set?.releaseDate);
  return { key: era, label: era };
};

/** Era grouping that uses the set catalog; pass the map from set id to release date. */
export function byEraWith(setDates?: ReadonlyMap<string, string>) {
  return (vc: VaultCard) => {
    const { era } = resolveEra(vc, setDates);
    return { key: era, label: era };
  };
}

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

export interface EraCoverage {
  byBasis: Record<EraBasis, number>;
  /** Holdings no evidence could place in an era, most valuable first. */
  unknown: VaultCard[];
}

/** How each holding's era was decided, and which holdings still need set metadata. */
export function eraCoverage(
  cards: VaultCard[],
  setDates?: ReadonlyMap<string, string>
): EraCoverage {
  const byBasis: Record<EraBasis, number> = { card: 0, catalog: 0, series: 0, none: 0 };
  const unknown: VaultCard[] = [];
  for (const vc of cards) {
    const r = resolveEra(vc, setDates);
    byBasis[r.basis] += 1;
    if (r.era === 'Unknown') unknown.push(vc);
  }
  unknown.sort((a, b) => holdingMarketValue(b) - holdingMarketValue(a));
  return { byBasis, unknown };
}

export interface TreeTile<T> {
  item: T;
  value: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Squarified treemap of positive values into a w×h box (Bruls et al.):
 * rows are laid along the shorter side and grown while the worst aspect
 * ratio in the row improves. Items with no value are left out.
 */
export function treemap<T>(
  items: { item: T; value: number }[],
  w: number,
  h: number
): TreeTile<T>[] {
  const list = items.filter((i) => i.value > 0).sort((a, b) => b.value - a.value);
  const total = list.reduce((s, i) => s + i.value, 0);
  if (!list.length || w <= 0 || h <= 0) return [];
  const scale = (w * h) / total;
  const out: TreeTile<T>[] = [];
  let x = 0;
  let y = 0;
  let cw = w;
  let ch = h;
  let i = 0;
  const worst = (row: number[], side: number) => {
    const s = row.reduce((a, b) => a + b, 0);
    const max = Math.max(...row);
    const min = Math.min(...row);
    return Math.max((side * side * max) / (s * s), (s * s) / (side * side * min));
  };
  while (i < list.length) {
    const side = Math.min(cw, ch);
    const row: number[] = [list[i].value * scale];
    let j = i + 1;
    while (j < list.length) {
      const next = [...row, list[j].value * scale];
      if (worst(next, side) > worst(row, side)) break;
      row.push(list[j].value * scale);
      j += 1;
    }
    const area = row.reduce((a, b) => a + b, 0);
    const thick = area / side;
    let offset = 0;
    row.forEach((a, k) => {
      const len = a / thick;
      const item = list[i + k];
      if (cw >= ch)
        out.push({ item: item.item, value: item.value, x, y: y + offset, w: thick, h: len });
      else out.push({ item: item.item, value: item.value, x: x + offset, y, w: len, h: thick });
      offset += len;
    });
    if (cw >= ch) {
      x += thick;
      cw -= thick;
    } else {
      y += thick;
      ch -= thick;
    }
    i = j;
  }
  return out;
}
