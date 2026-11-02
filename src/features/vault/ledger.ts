import type { CardCondition, VaultCard } from '../../types/pokemon';
import {
  hasKnownCost,
  holdingMarketValue,
  knownCostBasis,
  knownHoldingProfit,
} from '../../utils/vaultCost';

export type HoldingSort = 'value' | 'pl' | 'plPct' | 'cost' | 'name' | 'set' | 'qty' | 'date';
export type SortDir = 'asc' | 'desc';

export interface HoldingFilter {
  q: string;
  set: string;
  condition: '' | CardCondition;
  missingCost: boolean;
}

export const EMPTY_FILTER: HoldingFilter = { q: '', set: '', condition: '', missingCost: false };

export const CONDITION_LABEL: Record<CardCondition, string> = {
  raw: 'Raw',
  'near-mint': 'Near Mint',
  'lightly-played': 'Lightly Played',
  'moderately-played': 'Moderately Played',
  'heavily-played': 'Heavily Played',
  damaged: 'Damaged',
};

export const CONDITION_SHORT: Record<CardCondition, string> = {
  raw: 'Raw',
  'near-mint': 'NM',
  'lightly-played': 'LP',
  'moderately-played': 'MP',
  'heavily-played': 'HP',
  damaged: 'DMG',
};

export function setKey(vc: VaultCard): string {
  return vc.card.set?.id || vc.card.set?.name || 'unknown';
}

export function filterHoldings(cards: VaultCard[], f: HoldingFilter): VaultCard[] {
  const q = f.q.trim().toLowerCase();
  return cards.filter((vc) => {
    if (q) {
      const hay =
        `${vc.card.name} ${vc.card.set?.name ?? ''} ${vc.card.number ?? ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (f.set && setKey(vc) !== f.set) return false;
    if (f.condition && vc.condition !== f.condition) return false;
    if (f.missingCost && hasKnownCost(vc)) return false;
    return true;
  });
}

/** Numeric sort value, or null when the figure is unknown for this holding. */
function metric(vc: VaultCard, key: HoldingSort): number | string | null {
  switch (key) {
    case 'value': {
      const v = holdingMarketValue(vc);
      return v > 0 ? v : null;
    }
    case 'cost':
      return knownCostBasis(vc);
    case 'pl':
      return knownHoldingProfit(vc)?.profit ?? null;
    case 'plPct':
      return knownHoldingProfit(vc)?.profitPct ?? null;
    case 'qty':
      return vc.quantity;
    case 'date': {
      const t = new Date(vc.purchaseDate).getTime();
      return Number.isFinite(t) ? t : null;
    }
    case 'name':
      return vc.card.name.toLowerCase();
    case 'set':
      return (vc.card.set?.name ?? '').toLowerCase();
  }
}

/**
 * Sort holdings. Unknown figures (no price, no cost) always go last, in
 * either direction, so a missing cost never masquerades as the smallest.
 */
export function sortHoldings(cards: VaultCard[], key: HoldingSort, dir: SortDir): VaultCard[] {
  const sign = dir === 'asc' ? 1 : -1;
  return [...cards].sort((a, b) => {
    const ma = metric(a, key);
    const mb = metric(b, key);
    if (ma == null && mb == null) return 0;
    if (ma == null) return 1;
    if (mb == null) return -1;
    if (typeof ma === 'string' || typeof mb === 'string') {
      return String(ma).localeCompare(String(mb)) * sign;
    }
    return (ma - mb) * sign;
  });
}

/** Default direction when a column header is first clicked. */
export function defaultDir(key: HoldingSort): SortDir {
  return key === 'name' || key === 'set' ? 'asc' : 'desc';
}

/**
 * Parse a typed cost. Blank means "unknown" (null), 0 is a real cost (gift,
 * pull), anything negative or non-numeric is invalid (undefined).
 */
export function parseCostInput(raw: string): number | null | undefined {
  const t = raw.trim().replace(/^\$/, '').replace(/,/g, '');
  if (t === '') return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return Math.round(n * 100) / 100;
}

/** Updates to store a typed cost (per copy) without ever inventing one. */
export function costUpdate(value: number | null): { purchasePrice: number; costKnown: boolean } {
  return value == null
    ? { purchasePrice: 0, costKnown: false }
    : { purchasePrice: value, costKnown: true };
}

export interface SetRollup {
  key: string;
  name: string;
  releaseDate?: string;
  entries: number;
  copies: number;
  value: number;
  knownCost: number;
  knownMarket: number;
  missingCost: number;
}

export function rollupBySet(cards: VaultCard[]): SetRollup[] {
  const map = new Map<string, SetRollup>();
  for (const vc of cards) {
    const key = setKey(vc);
    const row =
      map.get(key) ??
      ({
        key,
        name: vc.card.set?.name || 'Unknown set',
        releaseDate: vc.card.set?.releaseDate,
        entries: 0,
        copies: 0,
        value: 0,
        knownCost: 0,
        knownMarket: 0,
        missingCost: 0,
      } as SetRollup);
    row.entries += 1;
    row.copies += vc.quantity;
    const mv = holdingMarketValue(vc);
    if (mv > 0) row.value += mv;
    const cost = knownCostBasis(vc);
    if (cost == null) row.missingCost += 1;
    else if (mv > 0) {
      row.knownCost += cost;
      row.knownMarket += mv;
    }
    map.set(key, row);
  }
  return [...map.values()].sort((a, b) => b.value - a.value);
}
