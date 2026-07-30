import { VaultCard, PokemonCard } from '../types/pokemon';
import { getCardPrice } from './cardPrice';

/** True when the user never set a real paid price. */
export function isAssumedCost(vaultCard: VaultCard): boolean {
  return !(vaultCard.purchasePrice > 0);
}

export function marketUnitPrice(card: PokemonCard | VaultCard['card']): number {
  return getCardPrice(card);
}

/**
 * Effective purchase price per card.
 * Unset / zero → 100% of current market (flat P/L until user edits).
 */
export function effectivePurchasePrice(vaultCard: VaultCard): number {
  if (vaultCard.purchasePrice > 0) return vaultCard.purchasePrice;
  return marketUnitPrice(vaultCard.card);
}

export function effectiveCostBasis(vaultCard: VaultCard): number {
  return effectivePurchasePrice(vaultCard) * vaultCard.quantity;
}

export function holdingMarketValue(vaultCard: VaultCard): number {
  return marketUnitPrice(vaultCard.card) * vaultCard.quantity;
}

export function holdingProfit(vaultCard: VaultCard): { profit: number; profitPct: number } {
  const cost = effectiveCostBasis(vaultCard);
  const market = holdingMarketValue(vaultCard);
  const profit = market - cost;
  return {
    profit,
    profitPct: cost > 0 ? (profit / cost) * 100 : 0,
  };
}

/** Normalize blank/zero purchase price to current market. */
export function resolvePurchasePrice(card: PokemonCard, purchasePrice: number): number {
  if (Number.isFinite(purchasePrice) && purchasePrice > 0) return purchasePrice;
  return marketUnitPrice(card);
}
