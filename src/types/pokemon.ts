export interface PokemonCard {
  id: string;
  name: string;
  images: {
    small: string;
    large: string;
  };
  set: {
    id: string;
    name: string;
    releaseDate: string;
    total: number;
  };
  rarity?: string;
  types?: string[];
  artist?: string;
  tcgplayer?: {
    prices?: {
      [key: string]: {
        low?: number;
        mid?: number;
        high?: number;
        market?: number;
        directLow?: number;
      };
    };
  };
  cardmarket?: {
    prices?: {
      averageSellPrice?: number;
      lowPrice?: number;
      trendPrice?: number;
    };
  };
}

export interface PokemonSet {
  id: string;
  name: string;
  releaseDate: string;
  total: number;
  images: {
    symbol: string;
    logo: string;
  };
}

export interface ApiResponse<T> {
  data: T[];
  page?: number;
  pageSize?: number;
  count?: number;
  totalCount?: number;
}

export type SortOption = 
  | 'price-high'
  | 'price-low'
  | 'name-asc'
  | 'name-desc'
  | 'set-asc'
  | 'set-desc'
  | 'date-new'
  | 'date-old'
  | 'rarity';