/**
 * Buy thesis types — structured investment analysis for a trading card.
 * Pipeline: features → signals → scores → confidence → recommendation → reasoning.
 */

export type BuyCategory =
  | 'strong_buy'
  | 'buy'
  | 'watch'
  | 'hold_fair_value'
  | 'avoid'
  | 'high_risk'
  | 'insufficient_data';

export type ConfidenceTier = 'high' | 'medium' | 'low';

export type SignalId =
  | 'value_vs_fair'
  | 'momentum'
  | 'mean_reversion'
  | 'liquidity'
  | 'grading_spread'
  | 'population_scarcity'
  | 'supply_demand'
  | 'volatility_risk'
  | 'buyout_manipulation'
  | 'stale_data'
  | 'thin_market'
  | 'source_inconsistency'
  | 'outlier_spike'
  | 'set_age_rotation'
  | 'rarity_status'
  | 'comparable_cards'
  | 'price_forecast'
  | 'data_quality';

export interface BuyThesisSignal {
  id: SignalId;
  label: string;
  /** -1..+1 strength; sign indicates direction when bullish is true/false */
  strength: number;
  /** true = supports buying / bullish; false = bearish / caution */
  bullish: boolean;
  /** Human-readable summary with real numbers */
  summary: string;
  /** Evidence payload for tooltips / expand */
  evidence: Record<string, number | string | boolean | null>;
  /** How much weight this signal contributed to its score dimension(s) */
  weightHint?: number;
}

export interface BuyThesisScores {
  value: number;
  momentum: number;
  liquidity: number;
  gradingOpportunity: number;
  supplyDemand: number;
  /** Higher = more risk (hurts overall) */
  risk: number;
  dataQuality: number;
  /** Overall opportunity 0–100 after risk penalty */
  opportunity: number;
}

export interface ScoreWeights {
  value: number;
  momentum: number;
  liquidity: number;
  gradingOpportunity: number;
  supplyDemand: number;
  /** Multiplier applied as (100 - risk) contribution */
  riskPenalty: number;
  dataQuality: number;
  /** How much the forecast signal can nudge opportunity (0–1 of max nudge points) */
  forecastNudge: number;
}

export interface FairValueRange {
  low: number;
  mid: number;
  high: number;
  method: string;
}

export interface InvalidationCondition {
  id: string;
  description: string;
  /** Metric currently watched */
  metric: string;
  currentValue: number | null;
  threshold: number | null;
  direction: 'above' | 'below' | 'outside';
}

export interface ComparableSummary {
  peerCount: number;
  peerMedianChange30d: number | null;
  peerMedianPrice: number | null;
  relativeValuePct: number | null;
  summary: string;
}

export interface FakeOpportunityFlag {
  id: string;
  severity: 'info' | 'warn' | 'critical';
  message: string;
  evidence: Record<string, number | string | boolean | null>;
}

export interface BuyThesisReasoning {
  whyBuy: string[];
  whyNot: string[];
  headline: string;
  disclaimer: string;
}

export interface PredictionSignalInput {
  expected30dReturn: number | null;
  expected90dReturn: number | null;
  confidence: number | null;
  reliability?: ConfidenceTier | 'insufficient' | null;
  historicalMae?: number | null;
  approach?: string | null;
}

export interface GradedContext {
  rawPrice: number | null;
  psa10Price: number | null;
  psa9Price: number | null;
  gradingFeeEstimate: number | null;
  soldListings: number | null;
  listedCount: number | null;
  psa10Pop: number | null;
  psaTotalPop: number | null;
}

export interface CardMeta {
  cardId: string;
  cardName: string;
  setId?: string | null;
  setName?: string | null;
  rarity?: string | null;
  cardNumber?: string | null;
  setReleaseDate?: string | null;
  game?: 'pokemon' | 'onepiece';
}

export interface BuyThesisAnalysis {
  cardId: string;
  cardName: string;
  analyzedAt: string;
  currentPrice: number | null;
  category: BuyCategory;
  categoryLabel: string;
  confidence: {
    tier: ConfidenceTier;
    score: number;
    reasons: string[];
  };
  scores: BuyThesisScores;
  weights: ScoreWeights;
  fairValue: FairValueRange | null;
  signals: BuyThesisSignal[];
  fakeOpportunityFlags: FakeOpportunityFlag[];
  invalidation: InvalidationCondition[];
  comparables: ComparableSummary | null;
  reasoning: BuyThesisReasoning;
  predictionUsed: boolean;
  dataLimitations: string[];
}

export const BUY_CATEGORY_LABELS: Record<BuyCategory, string> = {
  strong_buy: 'Strong Buy',
  buy: 'Buy',
  watch: 'Watch',
  hold_fair_value: 'Hold · Fair Value',
  avoid: 'Avoid',
  high_risk: 'High Risk',
  insufficient_data: 'Insufficient Data',
};

export const DEFAULT_SCORE_WEIGHTS: ScoreWeights = {
  value: 0.22,
  momentum: 0.16,
  liquidity: 0.12,
  gradingOpportunity: 0.1,
  supplyDemand: 0.12,
  riskPenalty: 0.18,
  dataQuality: 0.1,
  forecastNudge: 8,
};
