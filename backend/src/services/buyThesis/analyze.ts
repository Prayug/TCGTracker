/**
 * Pure buy-thesis analyzer — no DB I/O.
 * market data features → signals → scores → confidence → category → reasoning.
 */

import type { PricePoint } from '../marketAnalyzer';
import { extractFeatures } from './features';
import { buildSignals } from './signals';
import { computeScores } from './scoring';
import { computeConfidence } from './confidence';
import { determineBuyCategory, categoryLabel } from './recommendation';
import { formatReasoning } from './reasoning';
import { buildInvalidationConditions } from './invalidation';
import { analyzeComparables, type PeerCard } from './comparables';
import { normalizeWeights } from './weights';
import type {
  BuyThesisAnalysis,
  CardMeta,
  GradedContext,
  PredictionSignalInput,
  ScoreWeights,
} from './types';

export interface AnalyzeBuyThesisInput {
  meta: CardMeta;
  priceHistory: PricePoint[];
  graded?: GradedContext | null;
  alternateSourcePrices?: number[];
  prediction?: PredictionSignalInput | null;
  peers?: PeerCard[];
  weights?: Partial<ScoreWeights>;
  analyzedAt?: string;
}

export function analyzeBuyThesis(input: AnalyzeBuyThesisInput): BuyThesisAnalysis {
  const weights = normalizeWeights(input.weights);
  const features = extractFeatures({
    priceHistory: input.priceHistory,
    meta: input.meta,
    graded: input.graded,
    alternateSourcePrices: input.alternateSourcePrices,
  });

  const comparables =
    input.peers && input.peers.length > 0
      ? analyzeComparables(
          {
            currentPrice: features.currentPrice,
            change30d: features.priceChanges.change30d,
            rarity: input.meta.rarity,
            setId: input.meta.setId,
          },
          input.peers
        )
      : null;

  const { signals, flags } = buildSignals({
    features,
    prediction: input.prediction,
    comparables,
  });

  const scores = computeScores(signals, weights, flags);
  const confidence = computeConfidence({
    features,
    signals,
    flags,
    predictionConfidence: input.prediction?.confidence,
  });

  const category = determineBuyCategory({
    scores,
    confidenceTier: confidence.tier,
    confidenceScore: confidence.score,
    flags,
    historyLength: features.historyLength,
  });

  const fairValue =
    features.trimmedFairValue != null
      ? {
          low: features.p10Price ?? Math.round(features.trimmedFairValue * 0.9 * 100) / 100,
          mid: features.trimmedFairValue,
          high: features.p90Price ?? Math.round(features.trimmedFairValue * 1.1 * 100) / 100,
          method: 'trimmed_mean_90d_with_percentile_band',
        }
      : null;

  const reasoning = formatReasoning({
    category,
    scores,
    signals,
    flags,
    currentPrice: features.currentPrice,
    fairValue,
    confidenceTier: confidence.tier,
    confidenceReasons: confidence.reasons,
  });

  const invalidation = buildInvalidationConditions({ features, scores, category });

  const dataLimitations: string[] = [];
  if (features.historyLength < 14) {
    dataLimitations.push(
      'Fewer than 14 price points — trend and fair value are weakly identified.'
    );
  }
  if (features.avgVolume30d == null) {
    dataLimitations.push(
      'No volume series available — liquidity inferred from quote density only.'
    );
  }
  if (!input.graded?.psa10Price) {
    dataLimitations.push('No verified PSA10 sold-guide price — grading opportunity limited.');
  }
  if (!input.graded?.psa10Pop) {
    dataLimitations.push('No PSA population report cached for this card.');
  }
  if (!input.prediction) {
    dataLimitations.push('No stored forecast — prediction signal omitted.');
  }
  if (!comparables) {
    dataLimitations.push('Fewer than 5 comparable peers — peer relative value omitted.');
  }
  if (features.sourceSpreadPct != null && features.sourceSpreadPct > 15) {
    dataLimitations.push('Listing sources disagree on price.');
  }

  return {
    cardId: input.meta.cardId,
    cardName: input.meta.cardName,
    analyzedAt: input.analyzedAt ?? new Date().toISOString(),
    currentPrice: features.currentPrice,
    category,
    categoryLabel: categoryLabel(category),
    confidence,
    scores,
    weights,
    fairValue,
    signals,
    fakeOpportunityFlags: flags,
    invalidation,
    comparables,
    reasoning,
    predictionUsed: Boolean(input.prediction),
    dataLimitations,
  };
}
