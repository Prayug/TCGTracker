export interface OnePieceCard {
  id: string;
  name: string;
  images: {
    small: string;
    large: string;
  };
  set: {
    id: string;
    name: string;
  };
  /** Original card number e.g. OP01-120 — may be shared across variants */
  number: string;
  rarity?: string;
  cardColor?: string;
  cardType?: string;
  cardCost?: string;
  cardPower?: string;
  counterAmount?: number;
  life?: string;
  subTypes?: string;
  attribute?: string;
  cardText?: string;
  marketPrice?: number;
  inventoryPrice?: number;
  priceSource?: 'tcgplayer' | 'optcg';
  tcgplayerProductId?: number;
  cardImageId?: string;
}

export interface OnePieceSet {
  id: string;
  name: string;
  total?: number;
}

export type OnePieceSortOption =
  | 'price-high'
  | 'price-low'
  | 'name-asc'
  | 'name-desc'
  | 'set-asc'
  | 'set-desc'
  | 'rarity';

export type OnePieceFilterOption = 'all';

export type OnePieceColor = 'Red' | 'Blue' | 'Green' | 'Purple' | 'Yellow' | 'Black';

export const ONE_PIECE_COLORS: OnePieceColor[] = ['Red', 'Blue', 'Green', 'Purple', 'Yellow', 'Black'];

export const ONE_PIECE_RARITIES = [
  'C',
  'UC',
  'R',
  'SR',
  'SEC',
  'L',
  'SP',
  'P',
  'AAA',
  'AA',
  'SA',
  'TR',
] as const;

export const ONE_PIECE_CARD_TYPES = ['Leader', 'Character', 'Event', 'Stage'] as const;
