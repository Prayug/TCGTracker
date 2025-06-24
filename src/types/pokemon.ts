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
  number: string;
  rarity?: string;
  types?: string[];
  artist?: string;
  marketPrice?: number;
  tcgplayer?: {
    url?: string;
    updatedAt?: string;
    productId?: string;
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
  // Enhanced data for investment tracking
  investmentData?: CardInvestmentData;
}

export interface CardInvestmentData {
  psaData: PSAData;
  priceHistory: PricePoint[];
  marketAnalysis: MarketAnalysis;
  investmentScore: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  recommendation: 'BUY' | 'HOLD' | 'SELL' | 'WATCH';
}

export interface PSAData {
  population: {
    grade10: number;
    grade9: number;
    grade8: number;
    grade7: number;
    total: number;
  };
  prices: {
    grade10: number;
    grade9: number;
    grade8: number;
    raw: number;
  };
  popReport: {
    lowPop: boolean;
    grade10Percentage: number;
    totalSubmissions: number;
  };
  returnRate: number; // Percentage of cards that grade 9+
}

export interface PricePoint {
  date: string;
  price: number;
}

export interface MarketAnalysis {
  trend: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  volatility: number;
  priceChange30d: number;
  priceChange90d: number;
  priceChange1y: number;
  isUndervalued: boolean;
  isOvervalued: boolean;
  fairValue: number;
  confidence: number;
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
  | 'rarity'
  | 'investment-score'
  | 'psa-pop-low'
  | 'psa-return-high'
  | 'undervalued'
  | 'trend-bullish';

export type FilterOption = 'all' | 'undervalued' | 'overvalued' | 'low-pop' | 'high-return' | 'bullish';

export interface RealData {
  psaData: PSAData | null;
  priceHistory: PricePoint[];
}