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
  GAINERS_MIN_RETURN: 0.03,
  DOWNTREND_MAX_RETURN: -0.03,
} as const;

export type PredictionWindow = '7d' | '30d' | '90d' | '180d' | '365d';

export const PREDICTION_WINDOWS: PredictionWindow[] = ['7d', '30d', '90d', '180d', '365d'];

export const PREDICTION_WINDOW_LABELS: Record<PredictionWindow, string> = {
  '7d': '7d',
  '30d': '30d',
  '90d': '90d',
  '180d': '6mo',
  '365d': '1yr',
};

/** Expected return for the given window; long windows fall back to 90d for old prediction runs. */
export function expectedReturnForWindow(prediction: CardPrediction, window: PredictionWindow): number {
  switch (window) {
    case '7d': return prediction.expected7dReturn;
    case '30d': return prediction.expected30dReturn;
    case '90d': return prediction.expected90dReturn;
    case '180d': return prediction.expected180dReturn ?? prediction.expected90dReturn;
    case '365d': return prediction.expected365dReturn ?? prediction.expected90dReturn;
  }
}

export interface PredictionFilters {
  minPrice?: number;
  maxPrice?: number;
  rarities?: string[];
  minConfidence?: number;
  eras?: string[];
  releaseDateFrom?: string;
  releaseDateTo?: string;
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
  'Rare Holo GX',
  'Rare Holo EX',
  'Rare Holo V',
  'Rare Holo VMAX',
  'Rare Holo VSTAR',
] as const;

/** One Piece catalog rarity codes (investment-leaning defaults exclude C/UC/PR). */
export const AVAILABLE_OP_RARITIES = [
  'R',
  'L',
  'SR',
  'SEC',
  'TR',
  'DON!!',
] as const;

/** Keep in sync with backend/src/utils/setEra.ts ERA_GROUPS (minus promo/other noise). */
export const AVAILABLE_ERAS = [
  { id: 'mega', label: 'Mega Evolution' },
  { id: 'sv', label: 'Scarlet & Violet' },
  { id: 'swsh', label: 'Sword & Shield' },
  { id: 'sm', label: 'Sun & Moon' },
  { id: 'xy', label: 'XY' },
  { id: 'bw', label: 'Black & White' },
  { id: 'hgss', label: 'HeartGold & SoulSilver' },
  { id: 'dp', label: 'Diamond & Pearl' },
  { id: 'ex', label: 'EX Series' },
  { id: 'neo', label: 'Neo' },
  { id: 'base', label: 'Base' },
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
  /** Mapping UID that was scored (finish-aware). */
  uniqueIdentifier?: string;
  /** Finish key for price history (e.g. holofoil). */
  variantKey?: string;
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
  predicted180dLow?: number | null;
  predicted180dMid?: number | null;
  predicted180dHigh?: number | null;
  predicted365dLow?: number | null;
  predicted365dMid?: number | null;
  predicted365dHigh?: number | null;
  expected7dReturn: number;
  expected30dReturn: number;
  expected90dReturn: number;
  expected180dReturn?: number | null;
  expected365dReturn?: number | null;
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
  /** 0–100 AI grading / slab premium signal from prediction engine. */
  gradingScore?: number;
  /** Estimated grading premium uplift vs raw (0–1+). */
  gradingPremiumPotential?: number;
  /** Raw composite signal (~[-1, 1]) used for calibration. */
  signalScore?: number;
}

export interface BacktestResult {
  id: number;
  backtestDate: string;
  windowDays: number;
  cardsTested: number;
  directionalAccuracy: number | null;
  mape: number | null;
  top10AvgReturn: number | null;
  marketAvgReturn: number | null;
  strongBuyFalsePositiveRate: number | null;
  avoidAvgReturn: number | null;
  sharpeRatio: number | null;
  maxDrawdown: number | null;
  winRate: number | null;
  profitFactor: number | null;
  categoryPerformance: CategoryPerformance[];
  /** Spearman rank correlation between predicted and actual returns. */
  rankIC: number | null;
  /** Median signed bias (predicted - actual); positive = overprediction. */
  meanBias: number | null;
  /** Skill-relative hit rate (direction correct + error < 0.5x actual move). */
  hitRate: number | null;
  /** Average realized return of every tested card (buy-and-hold baseline). */
  baselineAvgReturn: number | null;
  /** top10AvgReturn - baselineAvgReturn. */
  modelAlpha: number | null;
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

export interface WindowAccuracy {
  pending: number;
  hit: number;
  missed: number;
  accuracy: number | null;
  /** Spearman rank correlation between predicted and actual returns. */
  rankIC: number | null;
  /** Median signed bias (predicted - actual); positive = overprediction. */
  meanBias: number | null;
  /** Skill-relative hit rate (direction correct + error < 0.5x actual move). */
  hitRate: number | null;
}

export interface ForwardTestStatus {
  totalPredictions: number;
  pending: number;
  hit: number;
  missed: number;
  partiallyCorrect: number;
  overallAccuracy: number | null;
  latestRunId?: number | null;
  latestRunDate?: string | null;
  matureEnoughFor7d?: number;
  byWindow: {
    _7d: WindowAccuracy;
    _30d: WindowAccuracy;
    _90d: WindowAccuracy;
    _180d?: WindowAccuracy;
    _365d?: WindowAccuracy;
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
    uniqueIdentifier?: string;
    variantKey?: string;
    currentPrice: number;
    predicted7d: PriceRange;
    predicted30d: PriceRange;
    predicted90d: PriceRange;
    predicted180d?: PriceRange | null;
    predicted365d?: PriceRange | null;
    expected7dReturn: number;
    expected30dReturn: number;
    expected90dReturn: number;
    expected180dReturn?: number | null;
    expected365dReturn?: number | null;
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
    actual180dPrice?: number | null;
    actual365dPrice?: number | null;
    status: string;
  } | null;
}

export interface ExternalSignal {
  sourceUrl: string;
  sourceType: string;
  title: string;
  summary: string;
  sentiment: number;
  relevance: number;
  type: string;
  createdAt?: string;
  expiresAt?: string | null;
}

export interface MarketOverview {
  totalPredictions: number;
  avgConfidence: number;
  avgRisk: number;
  avgExpectedReturn90d: number;
  avgExpectedReturn30d?: number;
  marketDirection: 'bullish' | 'bearish' | 'neutral';
  categoryBreakdown: Record<string, number>;
  topGainers: TopMover[];
  topLosers: TopMover[];
  confidenceBuckets: { bucket: string; count: number }[];
  /** Realized market median return (from calibration). */
  marketBenchmark90d?: number | null;
  marketBenchmark30d?: number | null;
}

export interface TopMover {
  cardId: string;
  cardName: string;
  currentPrice: number;
  expectedReturn: number;
  confidence: number;
  category: string;
}

export interface PredictionsResponse {
  data: CardPrediction[];
  count: number;
  window: string;
  requestedWindow?: string;
  horizonSupport?: HorizonSupportStatus;
  experimental?: boolean;
  modelVersion: string;
}

export interface OverviewResponse extends MarketOverview {}

export type HorizonDays = 7 | 30 | 90 | 180 | 365;

export interface HorizonSupportStatus {
  historyDays: number;
  historyMinDate: string | null;
  historyMaxDate: string | null;
  supported: HorizonDays[];
  experimental: HorizonDays[];
  unsupported: HorizonDays[];
  requirements: Record<HorizonDays, number>;
}

export interface CalibrationHorizonStatus {
  horizon: number;
  sampleCount: number;
  bias: number | null;
  marketMedianReturn: number | null;
  builtAt: string | null;
}

export interface DataQualityCheckResult {
  checkName: string;
  severity: 'info' | 'warn' | 'error';
  status: 'pass' | 'fail' | 'warn';
  metricValue: number;
  threshold: number | null;
  details: Record<string, unknown>;
}

export interface DataQualityStatusResponse {
  data: DataQualityCheckResult[];
  runAt: string | null;
  passed: number;
  warned: number;
  failed: number;
}

export type SortField = 'return' | 'confidence' | 'price' | 'name' | 'risk';
export type SortDirection = 'asc' | 'desc';

export interface InsightsTabType {
  id: 'overview' | 'cards' | 'backtest' | 'forward' | 'health';
  label: string;
}
