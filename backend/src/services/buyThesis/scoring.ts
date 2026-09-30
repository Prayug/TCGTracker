/**
 * Deterministic explainable scoring from typed signals.
 * Higher riskScore hurts overall. Avoids double-counting by mapping
 * each signal family to one primary dimension.
 */

import { clamp, round2 } from './stats';
import type {
  BuyThesisScores,
  BuyThesisSignal,
  FakeOpportunityFlag,
  ScoreWeights,
  SignalId,
} from './types';

const VALUE_IDS: SignalId[] = ['value_vs_fair', 'comparable_cards'];
const MOMENTUM_IDS: SignalId[] = ['momentum', 'mean_reversion'];
const LIQUIDITY_IDS: SignalId[] = ['liquidity', 'thin_market'];
const GRADING_IDS: SignalId[] = ['grading_spread', 'population_scarcity'];
const SUPPLY_IDS: SignalId[] = ['supply_demand', 'rarity_status', 'set_age_rotation'];
const RISK_IDS: SignalId[] = [
  'volatility_risk',
  'buyout_manipulation',
  'stale_data',
  'source_inconsistency',
  'outlier_spike',
];
const DQ_IDS: SignalId[] = ['data_quality'];

function avgStrength(signals: BuyThesisSignal[], ids: SignalId[]): number | null {
  const matched = signals.filter((s) => ids.includes(s.id));
  if (matched.length === 0) return null;
  return matched.reduce((a, s) => a + s.strength, 0) / matched.length;
}

/** Map average strength (-1..1) to 0–100 centered at 50. */
function strengthToScore(avg: number | null, fallback = 50): number {
  if (avg == null) return fallback;
  return round2(clamp(50 + avg * 50, 0, 100));
}

/** Risk dimension: higher when bearish risk signals are strong. */
function riskFromSignals(signals: BuyThesisSignal[]): number {
  const matched = signals.filter((s) => RISK_IDS.includes(s.id));
  if (matched.length === 0) return 35;
  // Convert negative strengths (bearish risk) into higher risk score
  const riskyness = matched.reduce((a, s) => a + Math.max(0, -s.strength), 0) / matched.length;
  const base = 30 + riskyness * 70;
  return round2(clamp(base, 0, 100));
}

export function computeScores(
  signals: BuyThesisSignal[],
  weights: ScoreWeights,
  flags: FakeOpportunityFlag[]
): BuyThesisScores {
  const value = strengthToScore(avgStrength(signals, VALUE_IDS), 50);
  const momentum = strengthToScore(avgStrength(signals, MOMENTUM_IDS), 50);
  const liquidity = strengthToScore(avgStrength(signals, LIQUIDITY_IDS), 45);
  const gradingOpportunity = strengthToScore(avgStrength(signals, GRADING_IDS), 45);
  const supplyDemand = strengthToScore(avgStrength(signals, SUPPLY_IDS), 50);
  let risk = riskFromSignals(signals);
  const dataQuality = strengthToScore(avgStrength(signals, DQ_IDS), 40);

  // Critical fake-opportunity flags raise risk / lower data quality
  for (const flag of flags) {
    if (flag.severity === 'critical') {
      risk = clamp(risk + 12, 0, 100);
    } else if (flag.severity === 'warn') {
      risk = clamp(risk + 5, 0, 100);
    }
  }

  const opportunityBase =
    weights.value * value +
    weights.momentum * momentum +
    weights.liquidity * liquidity +
    weights.gradingOpportunity * gradingOpportunity +
    weights.supplyDemand * supplyDemand +
    weights.riskPenalty * (100 - risk) +
    weights.dataQuality * dataQuality;

  // Forecast is a nudge only (already partially in signals via price_forecast,
  // but we apply explicit capped nudge from that signal to avoid double-count
  // by NOT including price_forecast in dimension averages above).
  const forecast = signals.find((s) => s.id === 'price_forecast');
  let opportunity = opportunityBase;
  if (forecast) {
    const confScale = forecast.weightHint ?? Math.abs(forecast.strength);
    opportunity += forecast.strength * weights.forecastNudge * clamp(confScale, 0.2, 1);
  }

  return {
    value: round2(value),
    momentum: round2(momentum),
    liquidity: round2(liquidity),
    gradingOpportunity: round2(gradingOpportunity),
    supplyDemand: round2(supplyDemand),
    risk: round2(risk),
    dataQuality: round2(dataQuality),
    opportunity: round2(clamp(opportunity, 0, 100)),
  };
}
