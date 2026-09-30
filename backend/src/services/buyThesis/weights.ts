/**
 * Configurable scoring weights for buy thesis.
 * Override via BUY_THESIS_WEIGHTS_JSON env or pass into analyzeBuyThesis.
 */

import { DEFAULT_SCORE_WEIGHTS, type ScoreWeights } from './types';

export function normalizeWeights(partial?: Partial<ScoreWeights>): ScoreWeights {
  const merged: ScoreWeights = { ...DEFAULT_SCORE_WEIGHTS, ...partial };
  const positiveKeys: (keyof ScoreWeights)[] = [
    'value',
    'momentum',
    'liquidity',
    'gradingOpportunity',
    'supplyDemand',
    'riskPenalty',
    'dataQuality',
  ];
  const sum = positiveKeys.reduce((a, k) => a + Math.max(0, merged[k]), 0);
  if (sum <= 0) return { ...DEFAULT_SCORE_WEIGHTS };
  const out = { ...merged };
  for (const k of positiveKeys) {
    out[k] = Math.max(0, merged[k]) / sum;
  }
  out.forecastNudge = Math.max(0, Math.min(20, merged.forecastNudge));
  return out;
}

export function weightsFromEnv(): ScoreWeights {
  const raw = process.env.BUY_THESIS_WEIGHTS_JSON;
  if (!raw) return normalizeWeights();
  try {
    const parsed = JSON.parse(raw) as Partial<ScoreWeights>;
    return normalizeWeights(parsed);
  } catch {
    return normalizeWeights();
  }
}
