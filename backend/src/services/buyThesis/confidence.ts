/**
 * Confidence = evidence reliability, NOT bullishness.
 * Strong Buy + Low Confidence is a valid combination.
 */

import { clamp, round2 } from './stats';
import type { BuyThesisFeatures } from './features';
import type { BuyThesisSignal, ConfidenceTier, FakeOpportunityFlag } from './types';

export function computeConfidence(input: {
  features: BuyThesisFeatures;
  signals: BuyThesisSignal[];
  flags: FakeOpportunityFlag[];
  predictionConfidence?: number | null;
}): { tier: ConfidenceTier; score: number; reasons: string[] } {
  const { features: f, flags } = input;
  const reasons: string[] = [];
  let score = 45;

  if (f.historyLength >= 90) {
    score += 18;
    reasons.push(`${f.historyLength} price points`);
  } else if (f.historyLength >= 30) {
    score += 12;
    reasons.push(`${f.historyLength} price points`);
  } else if (f.historyLength >= 14) {
    score += 5;
    reasons.push(`sparse history (${f.historyLength} points)`);
  } else if (f.historyLength >= 2) {
    score -= 15;
    reasons.push(`very sparse history (${f.historyLength} points)`);
  } else {
    score -= 35;
    reasons.push('insufficient price history');
  }

  if (f.spanDays >= 180) {
    score += 8;
  } else if (f.spanDays < 30 && f.historyLength > 0) {
    score -= 10;
    reasons.push(`short span (${f.spanDays}d)`);
  }

  if (f.daysSinceLastQuote != null) {
    if (f.daysSinceLastQuote <= 3) score += 8;
    else if (f.daysSinceLastQuote <= 7) score += 4;
    else if (f.daysSinceLastQuote > 30) {
      score -= 25;
      reasons.push('stale quotes');
    } else if (f.daysSinceLastQuote > 14) {
      score -= 12;
      reasons.push('aging quotes');
    }
  }

  if (f.avgVolume30d != null && f.avgVolume30d >= 20) {
    score += 6;
  } else if (f.avgVolume30d != null && f.avgVolume30d < 3) {
    score -= 10;
    reasons.push('thin volume');
  }

  if (f.sourceSpreadPct != null && f.sourceSpreadPct > 20) {
    score -= 12;
    reasons.push('source disagreement');
  }

  const dq = input.signals.find((s) => s.id === 'data_quality');
  if (dq && dq.evidence.dataQualityProxy != null) {
    const proxy = Number(dq.evidence.dataQualityProxy);
    score += clamp((proxy - 50) / 5, -10, 10);
  }

  // Prediction confidence informs reliability of the forecast signal only —
  // it should not inflate overall confidence when other evidence is weak.
  if (input.predictionConfidence != null) {
    const blend = clamp((input.predictionConfidence - 50) / 10, -5, 5);
    score += blend * 0.5;
  }

  for (const flag of flags) {
    if (flag.severity === 'critical') {
      score -= 15;
      reasons.push(flag.id);
    } else if (flag.severity === 'warn') {
      score -= 6;
    }
  }

  score = round2(clamp(score, 5, 95));
  const tier: ConfidenceTier = score >= 70 ? 'high' : score >= 45 ? 'medium' : 'low';

  if (reasons.length === 0) {
    reasons.push(tier === 'high' ? 'dense recent market data' : 'limited corroborating evidence');
  }

  return { tier, score, reasons: reasons.slice(0, 6) };
}
