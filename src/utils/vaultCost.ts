import { VaultCard, PokemonCard } from '../types/pokemon';
import { getCardPrice } from './cardPrice';

/**
 * Cost-basis rules (Collector's Exchange data audit):
 * - A cost the user typed or confirmed is recorded, including a deliberate $0
 *   (gift, pull).
 * - A blank cost is unknown. It is stored as purchasePrice 0 + costKnown false
 *   and is never replaced with the market price, because that manufactures a
 *   $0 profit that looks real.
 * - Legacy entries (no costKnown flag) with a price are unverified. Older
 *   imports filled the cost in from the market price of the day, and nothing
 *   on the record says which legacy prices were really paid. Comparing with
 *   today's market cannot tell either: once prices move, a filled-in cost
 *   would start to show a gain that never happened. So the price is kept as
 *   it is, labelled unverified, and left out of P/L until the user confirms
 *   or corrects it (one click, or all at once).
 */
export type CostStatus = 'recorded' | 'unverified' | 'unknown';

export function costStatus(vaultCard: VaultCard): CostStatus {
  if (vaultCard.costKnown === false) return 'unknown';
  if (vaultCard.costKnown === true) return 'recorded';
  return vaultCard.purchasePrice > 0 ? 'unverified' : 'unknown';
}

export function hasKnownCost(vaultCard: VaultCard): boolean {
  return costStatus(vaultCard) === 'recorded';
}

/** True when the user never set a real paid price. */
export function isAssumedCost(vaultCard: VaultCard): boolean {
  return !hasKnownCost(vaultCard);
}

export function marketUnitPrice(card: PokemonCard | VaultCard['card']): number {
  return getCardPrice(card);
}

/**
 * Effective purchase price per card, for legacy views that still need a
 * number for every row. Unknown → current market (flat P/L). New code should
 * use knownCostBasis() and treat unknown cost as unknown.
 */
export function effectivePurchasePrice(vaultCard: VaultCard): number {
  if (hasKnownCost(vaultCard)) return vaultCard.purchasePrice;
  return marketUnitPrice(vaultCard.card);
}

export function effectiveCostBasis(vaultCard: VaultCard): number {
  return effectivePurchasePrice(vaultCard) * vaultCard.quantity;
}

/** Cost basis when known, otherwise null. */
export function knownCostBasis(vaultCard: VaultCard): number | null {
  return hasKnownCost(vaultCard) ? vaultCard.purchasePrice * vaultCard.quantity : null;
}

export function holdingMarketValue(vaultCard: VaultCard): number {
  return marketUnitPrice(vaultCard.card) * vaultCard.quantity;
}

/** P/L for one holding; null when cost or market price is unknown. */
export function holdingProfit(vaultCard: VaultCard): { profit: number; profitPct: number } {
  const cost = effectiveCostBasis(vaultCard);
  const market = holdingMarketValue(vaultCard);
  const profit = market - cost;
  return {
    profit,
    profitPct: cost > 0 ? (profit / cost) * 100 : 0,
  };
}

export function knownHoldingProfit(
  vaultCard: VaultCard
): { profit: number; profitPct: number | null } | null {
  const cost = knownCostBasis(vaultCard);
  const market = holdingMarketValue(vaultCard);
  if (cost == null || !(market > 0)) return null;
  const profit = market - cost;
  return { profit, profitPct: cost > 0 ? (profit / cost) * 100 : null };
}

/**
 * Normalise a purchase price for storage. Returns the price and whether it
 * is known. Blank / NaN / negative → unknown (0, false). Never market.
 */
export function normalizePurchasePrice(purchasePrice: number | null | undefined): {
  purchasePrice: number;
  costKnown: boolean;
} {
  if (purchasePrice != null && Number.isFinite(purchasePrice) && purchasePrice >= 0) {
    return { purchasePrice, costKnown: true };
  }
  return { purchasePrice: 0, costKnown: false };
}

/** @deprecated kept for import compatibility; no longer substitutes market price. */
export function resolvePurchasePrice(_card: PokemonCard, purchasePrice: number): number {
  return normalizePurchasePrice(purchasePrice).purchasePrice;
}
