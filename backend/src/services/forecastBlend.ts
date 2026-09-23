/**
 * Blend feature-score expected returns with statistical series forecasts.
 * Statistical forecast wins when it beats the flat baseline on local WFV
 * and reliability is medium/high; otherwise we shrink toward conservative.
 */

import {
  ForecastResult,
  ReliabilityTier,
  forecastFromHistory,
  type SeriesPoint,
} from './statisticalForecaster';

export interface FeatureReturns {
  expected7dReturn: number;
  expected30dReturn: number;
  expected90dReturn: number;
  expected180dReturn: number;
  expected365dReturn: number;
  rawSignal: number;
  residualStd30d: number | null;
}

export interface BlendedForecast {
  expected7dReturn: number;
  expected30dReturn: number;
  expected90dReturn: number;
  expected180dReturn: number;
  expected365dReturn: number;
  /** Weight given to the statistical model in [0, 1]. */
  statisticalWeight: number;
  forecast: ForecastResult;
  residualStd30d: number | null;
}

function weightFor(tier: ReliabilityTier, beatsBaseline: boolean, approach: string): number {
  // When the series does not support beating flat, trust flat/statistical exclusively —
  // mixing in feature scores only injects bias and inflates MAE.
  if (tier === 'insufficient') return 1;
  if (!beatsBaseline || approach === 'baseline_flat') return 1;
  if (tier === 'high') return 0.85;
  if (tier === 'medium') return 0.75;
  return 0.6;
}

function mix(stat: number | undefined, feature: number, w: number): number {
  if (stat == null || !Number.isFinite(stat)) return feature;
  return w * stat + (1 - w) * feature;
}

export function blendFeatureAndStatisticalForecast(
  points: SeriesPoint[],
  feature: FeatureReturns
): BlendedForecast {
  const forecast = forecastFromHistory(points, [7, 30, 90, 180, 365]);
  const w = weightFor(forecast.reliability, forecast.beatsBaseline, forecast.approach);

  const h = forecast.horizons;
  // Only treat local MAE as residual when the model actually beat flat;
  // otherwise the MAE is irreducible market noise and should not nuke confidence.
  const residualStd30d =
    forecast.beatsBaseline && forecast.localMae != null
      ? forecast.localMae
      : feature.residualStd30d;

  return {
    expected7dReturn: mix(h[7]?.expectedReturn, feature.expected7dReturn, w),
    expected30dReturn: mix(h[30]?.expectedReturn, feature.expected30dReturn, w),
    expected90dReturn: mix(h[90]?.expectedReturn, feature.expected90dReturn, w),
    expected180dReturn: mix(h[180]?.expectedReturn, feature.expected180dReturn, w),
    expected365dReturn: mix(h[365]?.expectedReturn, feature.expected365dReturn, w),
    statisticalWeight: w,
    forecast,
    residualStd30d,
  };
}
