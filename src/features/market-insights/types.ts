export type PredictionCategory =
  | 'strong_buy'
  | 'watch_dip'
  | 'recovery'
  | 'momentum'
  | 'stagnant'
  | 'avoid'
  | 'downtrend';

export const CATEGORY_LABELS: Record<PredictionCategory, string> = {
  strong_buy: 'Strong Buy Candidate',
  watch_dip: 'Watch / Buy on Dip',
  recovery: 'Recovery Play',
  momentum: 'Momentum Card',
  stagnant: 'Stagnant / Low Priority',
  avoid: 'Avoid / Overheated',
  downtrend: 'Downtrend / Sell Risk',
};

export const CATEGORY_COLORS: Record<PredictionCategory, string> = {
  strong_buy: 'text-green-400 border-green-500/30 bg-green-500/10',
  watch_dip: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10',
  recovery: 'text-blue-400 border-blue-500/30 bg-blue-500/10',
  momentum: 'text-purple-400 border-purple-500/30 bg-purple-500/10',
  stagnant: 'text-ink-muted border-slate-500/30 bg-slate-500/10',
  avoid: 'text-red-400 border-red-500/30 bg-red-500/10',
  downtrend: 'text-orange-400 border-orange-500/30 bg-orange-500/10',
};

export const PREDICTION_THRESHOLDS = {
  GAINERS_MIN_RETURN: 0.05,
  DOWNTREND_MAX_RETURN: -0.05,
} as const;

export interface PredictionFilters {
  minPrice?: number;
  maxPrice?: number;
  rarities?: string[];
  minConfidence?: number;
}

export const AVAILABLE_RARITIES = [
  'Rare Holo',
  'Rare Ultra',
  'Rare Secret',
  'Ultra Rare',
  'Secret Rare',
  'Double Rare',
  'Illustration Rare',
  'Special Illustration Rare',
  'Hyper Rare',
] as const;

export interface PriceRange {
  low: number;
  mid: number;
  high: number;
}

export interface CardPrediction {
  id: number;
  cardId: string;
  cardName: string;
  setId: string;
  setName: string;
  cardNumber: string;
  rarity: string;
  imageSmall?: string;
  imageLarge?: string;
  tcgplayerProductId?: string;
  currentPrice: number;
  predicted7dLow: number;
  predicted7dMid: number;
  predicted7dHigh: number;
  predicted30dLow: number;
  predicted30dMid: number;
  predicted30dHigh: number;
  predicted90dLow: number;
  predicted90dMid: number;
  predicted90dHigh: number;
  expected7dReturn: number;
  expected30dReturn: number;
  expected90dReturn: number;
  confidenceScore: number;
  riskScore: number;
  liquidityScore?: number;
  dataQualityScore?: number;
  category: PredictionCategory;
  suggestedAction: string;
  explanation: string;
  riskFactors: string;
  externalSignals: string;
  modelVersion: string;
}

export interface BacktestResult {
  id: number;
  backtest_date: string;
  window_days: number;
  cards_tested: number;
  directional_accuracy: number | null;
  mape: number | null;
  top10_avg_return: number | null;
  market_avg_return: number | null;
  strong_buy_false_positive_rate: number | null;
  avoid_avg_return: number | null;
  sharpe_ratio: number | null;
  max_drawdown: number | null;
  win_rate: number | null;
  profit_factor: number | null;
  category_performance: CategoryPerformance[];
  created_at: string;
}

export interface CategoryPerformance {
  category: PredictionCategory;
  count: number;
  avgReturn: number;
  avgPredictedReturn: number;
}

export interface CategoryAccuracy {
  category: string;
  total: number;
  hit: number;
  missed: number;
  partiallyCorrect: number;
  accuracy: number | null;
  avgError: number | null;
}

export interface ForwardTestStatus {
  totalPredictions: number;
  pending: number;
  hit: number;
  missed: number;
  partiallyCorrect: number;
  overallAccuracy: number | null;
  byWindow: {
    _7d: { pending: number; hit: number; missed: number; accuracy: number | null };
    _30d: { pending: number; hit: number; missed: number; accuracy: number | null };
    _90d: { pending: number; hit: number; missed: number; accuracy: number | null };
  };
  byCategory: CategoryAccuracy[];
  byPriceRange: {
    under5: { total: number; hit: number; accuracy: number | null };
    fiveToFifty: { total: number; hit: number; accuracy: number | null };
    overFifty: { total: number; hit: number; accuracy: number | null };
  };
}

export interface CardPredictionDetail {
  prediction: {
    id: number;
    cardId: string;
    cardName: string;
    setId: string;
    setName: string;
    cardNumber: string;
    rarity: string;
    imageSmall?: string;
    imageLarge?: string;
    tcgplayerProductId?: string;
    currentPrice: number;
    predicted7d: PriceRange;
    predicted30d: PriceRange;
    predicted90d: PriceRange;
    expected7dReturn: number;
    expected30dReturn: number;
    expected90dReturn: number;
    confidenceScore: number;
    riskScore: number;
    category: PredictionCategory;
    suggestedAction: string;
    explanation: string;
    riskFactors: string;
    externalSignals: string;
  };
  result: {
    actual7dPrice: number | null;
    actual30dPrice: number | null;
    actual90dPrice: number | null;
    status: string;
  } | null;
}
