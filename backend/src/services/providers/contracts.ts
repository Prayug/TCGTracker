export interface CatalogCardSummary {
  cardId: string;
  cardName: string;
  setId: string;
  setName: string;
  setReleaseDate?: string;
  cardNumber?: string;
  rarity?: string;
  artist?: string;
  types?: string[];
  imageSmall?: string;
  imageLarge?: string;
  tcgplayerProductId?: string;
  tcgplayerPrices?: Record<
    string,
    {
      low?: number;
      mid?: number;
      high?: number;
      market?: number;
    }
  >;
}

export interface CatalogSetSummary {
  id: string;
  name: string;
  releaseDate?: string;
}

export interface CatalogProvider {
  getSets(limit?: number): Promise<CatalogSetSummary[]>;
  getCardsForSet(setId: string): Promise<CatalogCardSummary[]>;
}

export interface MarketPricePoint {
  variantKey: string;
  productId: number;
  marketPrice: number;
  lowPrice?: number;
  highPrice?: number;
  volume?: number;
  rawVariantName?: string;
}

export interface MarketPriceSnapshot {
  cardId: string;
  cardName: string;
  setId: string;
  setName: string;
  cardNumber?: string;
  points: MarketPricePoint[];
}

export interface MarketPriceProvider {
  getSnapshotForCard(cardId: string): Promise<MarketPriceSnapshot | null>;
}
