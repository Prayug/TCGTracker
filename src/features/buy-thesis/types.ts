/**
 * Buy thesis types (mirrors backend structured analysis).
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

export interface BuyThesisSignal {
  id: string;
  label: string;
  strength: number;
  bullish: boolean;
  summary: string;
  evidence: Record<string, number | string | boolean | null>;
}

export interface BuyThesisScores {
  value: number;
  momentum: number;
  liquidity: number;
  gradingOpportunity: number;
  supplyDemand: number;
  risk: number;
  dataQuality: number;
  opportunity: number;
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
  fairValue: {
    low: number;
    mid: number;
    high: number;
    method: string;
  } | null;
  signals: BuyThesisSignal[];
  fakeOpportunityFlags: Array<{
    id: string;
    severity: 'info' | 'warn' | 'critical';
    message: string;
  }>;
  invalidation: Array<{
    id: string;
    description: string;
    metric: string;
    currentValue: number | null;
    threshold: number | null;
    direction: string;
  }>;
  comparables: {
    peerCount: number;
    summary: string;
    relativeValuePct: number | null;
  } | null;
  reasoning: {
    whyBuy: string[];
    whyNot: string[];
    headline: string;
    disclaimer: string;
  };
  predictionUsed: boolean;
  dataLimitations: string[];
}

export const BUY_CATEGORY_COLORS: Record<BuyCategory, string> = {
  strong_buy: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  buy: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20',
  watch: 'bg-amber-500/10 text-amber-300 border-amber-500/25',
  hold_fair_value: 'bg-surface-hover text-ink-secondary border-border-default',
  avoid: 'bg-red-500/10 text-red-300 border-red-500/25',
  high_risk: 'bg-orange-500/15 text-orange-300 border-orange-500/30',
  insufficient_data: 'bg-surface-inset text-ink-muted border-border-subtle',
};
