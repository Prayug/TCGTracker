import { PokemonCard } from '../types/pokemon';
import { OnePieceCard } from '../types/onepiece';
import { pokemonApi } from '../services/pokemonApi';
import { onePieceApi } from '../services/onepieceApi';

export type AnyCard = PokemonCard | OnePieceCard;

export function isPokemonCard(card: AnyCard): card is PokemonCard {
  return 'tcgplayer' in card || 'types' in card;
}

export function isOnePieceCard(card: AnyCard): card is OnePieceCard {
  return 'cardColor' in card || ('cardType' in card && !('types' in card));
}

export function getCardPrice(card: AnyCard): number {
  if (isPokemonCard(card)) {
    return card.marketPrice ?? pokemonApi.extractCardPrice(card);
  }
  return onePieceApi.extractCardPrice(card as OnePieceCard);
}

export function getCardName(card: AnyCard): string {
  return card.name;
}

export function getCardImage(card: AnyCard): string {
  return card.images?.small || card.images?.large || '';
}

export function getCardSet(card: AnyCard): { id: string; name: string } {
  return card.set;
}

export function getCardRarity(card: AnyCard): string | undefined {
  return card.rarity;
}

export function getCardId(card: AnyCard): string {
  return card.id;
}

export function getCardDedupeKey(card: AnyCard): string {
  if (card.uniqueIdentifier) return card.uniqueIdentifier;
  return `${card.id}:${card.set?.id ?? ''}:${card.number ?? ''}`;
}

export function getCardReactKey(card: AnyCard, index: number): string {
  return getCardDedupeKey(card) || `${card.id}:${index}`;
}

export function dedupeCards<T extends AnyCard>(cards: T[]): T[] {
  const seen = new Set<string>();
  return cards.filter((card) => {
    const key = getCardDedupeKey(card);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
