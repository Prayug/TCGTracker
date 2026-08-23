import type { GameType } from '../../contexts/GameContext';
import type { PokemonCard } from '../../types/pokemon';
import { getCardPrice } from '../../utils/cardPrice';
import { effectiveUnitPrice } from './fairness';
import type { TradeCardLine } from './types';

export function cardToLine(card: PokemonCard, game: GameType): TradeCardLine {
  const market = getCardPrice(card);
  return {
    id: crypto.randomUUID(),
    cardId: card.id,
    uniqueIdentifier: card.uniqueIdentifier,
    name: card.name,
    setId: card.set?.id || '',
    setName: card.set?.name || '',
    number: card.number,
    imageSmall: card.images?.small || card.images?.large,
    rarity: card.rarity,
    quantity: 1,
    unitPrice: effectiveUnitPrice(market),
    game,
  };
}

export function lineUnitValue(line: TradeCardLine): number | null {
  return effectiveUnitPrice(line.unitPrice, line.priceOverride);
}
