/**
 * Map scores + confidence + flags → buy category.
 * No absolute financial claims — labels are relative opportunity tiers.
 */

import type { BuyCategory, BuyThesisScores, ConfidenceTier, FakeOpportunityFlag } from './types';
import { BUY_CATEGORY_LABELS } from './types';

export function determineBuyCategory(input: {
  scores: BuyThesisScores;
  confidenceTier: ConfidenceTier;
  confidenceScore: number;
  flags: FakeOpportunityFlag[];
  historyLength: number;
}): BuyCategory {
  const { scores, confidenceTier, confidenceScore, flags, historyLength } = input;

  if (historyLength < 2 || scores.dataQuality < 20 || confidenceScore < 18) {
    return 'insufficient_data';
  }

  const critical = flags.some((f) => f.severity === 'critical');
  if (scores.risk >= 78 || (critical && scores.risk >= 65)) {
    return 'high_risk';
  }

  // Strong opportunity requires decent liquidity and not-low confidence floor
  if (
    scores.opportunity >= 72 &&
    scores.risk < 55 &&
    scores.liquidity >= 40 &&
    confidenceScore >= 40
  ) {
    return 'strong_buy';
  }

  if (scores.opportunity >= 62 && scores.risk < 65 && scores.liquidity >= 30) {
    return 'buy';
  }

  if (scores.opportunity <= 35 && scores.risk >= 55) {
    return 'avoid';
  }

  if (scores.opportunity <= 38) {
    return 'avoid';
  }

  // Near fair value band
  if (
    scores.opportunity >= 45 &&
    scores.opportunity <= 58 &&
    Math.abs(scores.value - 50) < 12 &&
    scores.risk < 60
  ) {
    return 'hold_fair_value';
  }

  // Low confidence with middling scores → watch
  if (confidenceTier === 'low' && scores.opportunity >= 50) {
    return 'watch';
  }

  if (scores.opportunity >= 55) {
    return 'watch';
  }

  return 'hold_fair_value';
}

export function categoryLabel(category: BuyCategory): string {
  return BUY_CATEGORY_LABELS[category];
}
