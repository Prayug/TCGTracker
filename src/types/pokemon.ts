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

// Vault types - for storing owned cards (similar to Courtyard.io)
export interface VaultCard {
  id: string; // Unique vault entry ID
  card: PokemonCard; // The actual card data
  purchasePrice: number; // Price user paid
  purchaseDate: string; // ISO date string
  quantity: number; // Number of copies
  condition: CardCondition; // Card condition
  notes?: string; // Optional user notes
}

export type CardCondition = 'raw' | 'near-mint' | 'lightly-played' | 'moderately-played' | 'heavily-played' | 'damaged';

export interface VaultStats {
  totalCards: number;
  totalValue: number; // Sum of purchase prices
  currentValue: number; // Sum of current market prices
  profit: number; // Difference between current and purchase
  profitPercentage: number;
}

// Pack Opening / Ripping System (like GameStop Power Packs)
export type PackTier = 'starter' | 'bronze' | 'silver' | 'gold' | 'platinum';

export interface Pack {
  id: string;
  name: string;
  tier: PackTier;
  price: number; // Price to buy the pack
  averageValue: number; // Expected average value
  cardsPerPack: number; // Number of cards in pack
  imageUrl?: string;
  description?: string;
  valueRanges: ValueRange[]; // Probability distribution
}

export interface ValueRange {
  min: number;
  max: number;
  probability: number; // Percentage (e.g., 40.6)
  label: string;
}

export interface PackPull {
  pack: Pack;
  cards: PokemonCard[];
  totalValue: number;
  profit: number; // value - pack price
  openedAt: string;
}

// Rarity weights for pack opening simulation
export interface RarityWeights {
  common: number;
  uncommon: number;
  rare: number;
  'rare holo': number;
  'rare ultra': number;
  'rare secret': number;
  'rare rainbow': number;
  promo: number;
}

export interface PackOpeningHistory {
  pulls: PackPull[];
  totalSpent: number;
  totalValue: number;
  totalProfit: number;
  packsOpened: number;
}