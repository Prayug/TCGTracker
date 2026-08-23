import type { GameType } from '../../contexts/GameContext';

export interface TradeCardLine {
  id: string;
  cardId: string;
  uniqueIdentifier?: string;
  name: string;
  setId: string;
  setName: string;
  number?: string;
  imageSmall?: string;
  rarity?: string;
  quantity: number;
  unitPrice: number | null;
  priceOverride?: number | null;
  game: GameType;
}

export interface TradeDraft {
  id: string;
  title: string;
  game: GameType;
  give: TradeCardLine[];
  get: TradeCardLine[];
  cashGive: number;
  cashGet: number;
  updatedAt: string;
  shareToken?: string;
  remoteId?: string;
}

export type TradeSideKey = 'give' | 'get';
