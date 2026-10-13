export type LiquidityTier = 'strong' | 'ok' | 'thin' | 'illiquid';

export type MoverDirection = 'up' | 'down';

export interface SlabMover {
  cardId: string;
  cardName: string | null;
  setId: string | null;
  setName: string | null;
  imageSmall: string | null;
  currentPrice: number;
  prevPrice: number;
  changePct: number;
  changeAbs: number;
  days: number;
  soldListings: number;
  liquidityScore: number;
  liquidityTier: LiquidityTier;
  verified: boolean;
  stale: boolean;
  direction: MoverDirection;
}

export interface SlabMoversResult {
  rows: SlabMover[];
  count: number;
  days: number;
}

export type CompClass = 'alt_grade' | 'set_mate' | 'character_mate';

export interface SimilarSlabComp {
  compClass: CompClass;
  cardId: string;
  cardName: string | null;
  setId: string | null;
  setName: string | null;
  imageSmall: string | null;
  grader: string;
  grade: string;
  currentPrice: number;
  change7dPct: number | null;
  change30dPct: number | null;
  premiumPct: number | null;
  correlation: number | null;
  avgMovePer5Pct: number | null;
  liquidityScore: number;
  liquidityTier: LiquidityTier;
  verified: boolean;
}

export interface SimilarSlabGroup {
  anchor: {
    cardId: string;
    cardName: string | null;
    setId: string | null;
    setName: string | null;
    imageSmall: string | null;
    rarity: string | null;
    psa10Price: number | null;
  };
  altGrades: SimilarSlabComp[];
  setMates: SimilarSlabComp[];
  characterMates: SimilarSlabComp[];
}

export interface SimilarSlabsResult {
  groups: SimilarSlabGroup[];
  count: number;
  days: number;
}

export type BuyoutPhase = 'early' | 'active' | 'late';

export interface BuyoutRipple {
  cardId: string;
  cardName: string | null;
  setName: string | null;
  imageSmall: string | null;
  currentPrice: number;
  changePct: number;
}

export interface BuyoutCandidate {
  cardId: string;
  cardName: string | null;
  setId: string | null;
  setName: string | null;
  imageSmall: string | null;
  currentPrice: number;
  prevPrice: number;
  changePct: number;
  days: number;
  listedCount: number | null;
  /** Recorded listing count at the window start (null until history accrues). */
  listedCountPrev: number | null;
  listedLow: number | null;
  soldListings: number;
  velocityRatio: number | null;
  premiumPctDelta: number | null;
  popDelta: number | null;
  liquidityScore: number;
  liquidityTier: LiquidityTier;
  buyoutScore: number;
  phase: BuyoutPhase;
  signals: string[];
  why: string;
  ripples: BuyoutRipple[];
  supplyNote: string;
}

export interface BuyoutScanResult {
  rows: BuyoutCandidate[];
  count: number;
  days: number;
  note: string;
}

export type OpportunityGrade = 'strong_buy' | 'buy' | 'watch' | 'pass';

export interface Opportunity {
  cardId: string;
  cardName: string | null;
  setId: string | null;
  setName: string | null;
  imageSmall: string | null;
  currentPrice: number | null;
  score: number;
  grade: OpportunityGrade;
  predictedReturn90d: number | null;
  confidence: number | null;
  momentumPct: number | null;
  momentumDays: number;
  buyoutScore: number;
  netSentiment: number | null;
  compMomentumPct: number | null;
  riskScore: number | null;
  why: string;
  keySignals: string[];
}

export interface OpportunitiesResult {
  rows: Opportunity[];
  count: number;
}

export type SignalDirection = 'bullish' | 'bearish' | 'neutral' | 'watch' | 'high_risk';

export type SignalCategory =
  | 'set_release'
  | 'buyout'
  | 'tournament'
  | 'reddit'
  | 'youtube'
  | 'news'
  | 'supply'
  | 'price_movement'
  | 'reprint'
  | 'rotation'
  | 'grading'
  | 'ban_list';

export type SignalSort = 'score' | 'confidence' | 'newest' | 'price_impact' | 'volume';

export interface SignalMetrics {
  price7dPct: number | null;
  price30dPct: number | null;
  volumeChangePct: number | null;
  liquidityTier: LiquidityTier | null;
  liquidityLabel: string | null;
}

export interface SignalDriver {
  key: string;
  label: string;
  level: 'up' | 'down' | 'flat' | 'up_strong';
}

export interface TopAffectedCard {
  cardId: string;
  cardName: string;
  imageSmall: string | null;
  change7dPct: number | null;
  changeAbs: number | null;
}

export interface SignalEvidence {
  totalSources: number;
  byType: Record<string, number>;
  sources: SignalSourceItem[];
}

export interface SignalSourceItem {
  id: number | null;
  url: string;
  title: string;
  type: string;
  typeLabel: string;
  thumbnailUrl: string | null;
  summary: string | null;
  publishedAt: string | null;
}

export type SignalEntityType = 'set' | 'card' | 'sealed' | 'theme';
export type SignalTier = 'actionable' | 'emerging' | 'monitor';

export interface InvestmentSignal {
  id: number;
  signalTitle: string;
  entityLabel: string;
  entityType: SignalEntityType;
  sourceTitle: string | null;
  signalTier: SignalTier;
  hasMarketConfirmation: boolean;
  whyItMatters: string[];
  sourceSummary: string;
  eventTitle: string;
  eventDetail: string;
  category: SignalCategory;
  categoryLabel: string;
  observedEffect: string;
  interpretation: string;
  opportunity: string;
  explanation: string;
  direction: SignalDirection;
  directionLabel: string;
  opportunityScore: number;
  confidence: number;
  horizon: string;
  metrics: SignalMetrics;
  sparkline: number[];
  cardId: string | null;
  cardName: string | null;
  setName: string | null;
  topAffectedCard: TopAffectedCard | null;
  sourceUrl: string | null;
  createdAt: string | null;
  sources: SignalSourceItem[];
  evidence: SignalEvidence;
  drivers: SignalDriver[];
}

export interface MarketPulse {
  bullish: number;
  bearish: number;
  watch: number;
  neutral: number;
  highRisk: number;
  total: number;
  analyzedLast24h: number;
  bullishInsight: string | null;
  watchInsight: string | null;
  highRiskInsight: string | null;
  strongestSignal: {
    signalTitle: string;
    entityLabel: string;
    detail: string;
    score: number;
    confidence: number;
    sourceCount: number;
  } | null;
  highestRisk: {
    signalTitle: string;
    entityLabel: string;
    detail: string;
    score: number;
  } | null;
}

export interface InvestmentSignalsResult {
  rows: InvestmentSignal[];
  actionable: InvestmentSignal[];
  emerging: InvestmentSignal[];
  count: number;
  byCategory: Record<string, number>;
  pulse: MarketPulse;
  lastUpdated?: string;
}

/** @deprecated Use InvestmentSignalsResult */
export type ExternalFactorsResult = InvestmentSignalsResult;

export type InvestmentsTab =
  | 'strategy'
  | 'opportunities'
  | 'movers'
  | 'buyouts'
  | 'similar'
  | 'signals';

// --- Backtested strategy report (/api/investments/strategy) -----------------

export type StrategyMarket = 'raw' | 'psa10';

export interface StrategySummary {
  strategyId: string;
  label: string;
  description: string;
  market: StrategyMarket;
  horizonWeeks: number;
  topN: number;
  minPrice: number;
  formations: number;
  firstFormation: string | null;
  lastFormation: string | null;
  beatRate: number;
  meanExcess: number;
  pickMeanNet: number;
  pickMedianNet: number;
  pickHitRate: number;
  universeMeanNet: number;
  universeMedianNet: number;
  universeHitRate: number;
  equity: { date: string; strategy: number; universe: number }[];
}

export interface StrategyPick {
  id: string;
  cardId: string | null;
  name: string | null;
  setName: string | null;
  imageSmall: string | null;
  price: number;
  lowestListing: number | null;
  entryPrice: number;
  breakEvenPrice: number;
  breakEvenPct: number;
  change4w: number | null;
  change12w: number | null;
}

export interface StrategyReport {
  market: StrategyMarket;
  generatedAt: string;
  horizonWeeks: number;
  minPrice: number;
  costs: { sellFeePct: number; sellFixedFee: number; sellShipping: number; buyShipping: number };
  data: {
    firstDate: string | null;
    lastDate: string | null;
    weeks: number;
    series: number;
    frozenWeeks: number;
    staleDays: number;
    lowConfidenceSeries: number;
  };
  notes: string[];
  strategies: StrategySummary[];
  picks: StrategyPick[];
  spikes: StrategyPick[];
}

// --- Per-card check (/api/investments/card-check) ----------------------------

export interface BaseRate {
  label: string;
  minPrice: number;
  maxPrice: number | null;
  horizonWeeks: number;
  samples: number;
  medianNet: number;
  p25Net: number;
  p75Net: number;
  hitRate: number;
}

export interface PositionCheck {
  market: StrategyMarket;
  asOf: string | null;
  staleDays: number;
  price: number;
  lowestListing: number | null;
  entryPrice: number;
  breakEvenPrice: number;
  breakEvenPct: number;
  change4w: number | null;
  change12w: number | null;
  weeklyVolatility: number | null;
  spike: boolean;
  fairEntry: boolean;
  askRatio: number | null;
  baseRate: BaseRate | null;
  costs: StrategyReport['costs'];
}

export interface CardCheck {
  cardId: string;
  horizonWeeks: number;
  raw: PositionCheck | null;
  psa10: PositionCheck | null;
}
