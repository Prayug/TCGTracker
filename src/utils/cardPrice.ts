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
