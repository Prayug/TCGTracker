/**
 * Statistical price forecasting for TCG series.
 *
 * Approaches are evaluated on each card's own history via walk-forward
 * validation (no future leakage). The winner must beat simple baselines
 * (flat / SMA) on MAE; otherwise we fall back to flat + wide uncertainty.
 */

export type ForecastApproach =
  | 'baseline_flat'
  | 'baseline_sma'
  | 'ewma_momentum'
  | 'mean_reversion'
  | 'hybrid';

export type ReliabilityTier = 'high' | 'medium' | 'low' | 'insufficient';

export interface SeriesPoint {
  date: string;
  price: number;
  volume?: number | null;
}

export interface HorizonForecast {
  days: number;
  expectedReturn: number;
  predictedMid: number;
  low: number;
  high: number;
}

export interface ForecastResult {
  approach: ForecastApproach;
  currentPrice: number;
  horizons: Record<number, HorizonForecast>;
  reliability: ReliabilityTier;
  reliabilityReason: string;
  historyPoints: number;
  historySpanDays: number;
  lastHistoryDate: string | null;
  volumeScore: number;
  volatility: number;
  /** Local walk-forward MAE of the chosen approach (return units). */
  localMae: number | null;
  /** Local walk-forward MAE of flat baseline. */
  baselineMae: number | null;
  beatsBaseline: boolean;
  /** Spike / manipulation risk flags. */
  flags: string[];
}

export interface ApproachBacktestSummary {
  approach: ForecastApproach;
  samples: number;
  mae: number | null;
  smape: number | null;
  directionalAccuracy: number | null;
  beatsFlat: boolean;
  beatsSma: boolean;
}

const APPROACHES: ForecastApproach[] = [
  'baseline_flat',
  'baseline_sma',
  'ewma_momentum',
  'mean_reversion',
  'hybrid',
];

const DEFAULT_HORIZONS = [7, 30, 90] as const;

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function median(values: number[]): number {
  if (values.length === 0) return NaN;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}

function mean(values: number[]): number {
  if (values.length === 0) return NaN;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function stdev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  return Math.sqrt(values.reduce((s, v) => s + (v - m) ** 2, 0) / (values.length - 1));
}

function daysBetween(a: string, b: string): number {
  const ms = Date.parse(b) - Date.parse(a);
  return Math.max(0, Math.round(ms / 86400000));
}

/** Drop non-positive prices, sort, and winsorize single-day spikes. */
export function cleanPriceSeries(points: SeriesPoint[]): SeriesPoint[] {
  const sorted = [...points]
    .filter((p) => Number.isFinite(p.price) && p.price > 0 && Boolean(p.date))
    .sort((a, b) => a.date.localeCompare(b.date));

  if (sorted.length < 3) return sorted;

  const cleaned: SeriesPoint[] = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const prev = cleaned[cleaned.length - 1];
    const cur = sorted[i];
    const ratio = cur.price / prev.price;
    // Collapse same-day duplicates by keeping the later value later in loop.
    if (cur.date === prev.date) {
      cleaned[cleaned.length - 1] = cur;
      continue;
    }
    // Winsorize absolute cliffs > 70% in one step (likely bad match / outlier).
    if (ratio > 1.7 || ratio < 1 / 1.7) {
      const capped = ratio > 1 ? prev.price * 1.7 : prev.price / 1.7;
      cleaned.push({ ...cur, price: capped });
    } else {
      cleaned.push(cur);
    }
  }
  return cleaned;
}

function logReturns(series: SeriesPoint[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < series.length; i++) {
    const span = Math.max(1, daysBetween(series[i - 1].date, series[i].date));
    const lr = Math.log(series[i].price / series[i - 1].price);
    // Normalize to ~daily log-return for irregular sampling.
    out.push(lr / span);
  }
  return out;
}

function ewma(values: number[], alpha: number): number {
  if (values.length === 0) return 0;
  let e = values[0];
  for (let i = 1; i < values.length; i++) {
    e = alpha * values[i] + (1 - alpha) * e;
  }
  return e;
}

function smaReturn(series: SeriesPoint[], lookbackDays: number): number {
  if (series.length < 2) return 0;
  const last = series[series.length - 1];
  const target = Date.parse(last.date) - lookbackDays * 86400000;
  let anchor = series[0];
  for (const p of series) {
    if (Date.parse(p.date) <= target) anchor = p;
    else break;
  }
  if (anchor.price <= 0) return 0;
  const span = Math.max(1, daysBetween(anchor.date, last.date));
  const total = last.price / anchor.price - 1;
  // Scale observed move to the requested lookback (conservative).
  return total * (lookbackDays / span);
}

function annualizedVolFromDaily(dailyLogVol: number): number {
  return dailyLogVol * Math.sqrt(365);
}

/**
 * Predict a simple expected return for `horizonDays` using one approach.
 * Uses only points at or before the series end (caller must truncate).
 */
export function predictReturn(
  series: SeriesPoint[],
  horizonDays: number,
  approach: ForecastApproach
): number {
  if (series.length < 2) return 0;
  const rets = logReturns(series);
  const dailyVol = stdev(rets);
  const lastPrice = series[series.length - 1].price;

  switch (approach) {
    case 'baseline_flat':
      return 0;
    case 'baseline_sma': {
      const sma = smaReturn(series, Math.min(horizonDays, 30));
      // Cap SMA baseline so it cannot explode on short windows.
      return clamp(sma * (horizonDays / Math.min(horizonDays, 30)), -0.5, 0.5);
    }
    case 'ewma_momentum': {
      const drift = ewma(rets, 0.15);
      // Shrink toward 0 when vol is high (noise).
      const shrink = 1 / (1 + dailyVol * 40);
      const raw = Math.expm1(drift * horizonDays) * shrink;
      return clamp(raw, -0.45, 0.45);
    }
    case 'mean_reversion': {
      const window = series.slice(-Math.min(series.length, 24));
      const m = mean(window.map((p) => p.price));
      if (!Number.isFinite(m) || m <= 0) return 0;
      const gap = (m - lastPrice) / lastPrice;
      // Half-life ~45 days.
      const speed = 1 - Math.exp(-Math.log(2) * (horizonDays / 45));
      return clamp(gap * speed * 0.65, -0.4, 0.4);
    }
    case 'hybrid': {
      const mom = predictReturn(series, horizonDays, 'ewma_momentum');
      const mr = predictReturn(series, horizonDays, 'mean_reversion');
      // Prefer mean-reversion when recent move is large vs vol (likely overshoot).
      const recent = smaReturn(series, 14);
      const wMom = Math.abs(recent) > dailyVol * 20 ? 0.35 : 0.6;
      return clamp(wMom * mom + (1 - wMom) * mr, -0.45, 0.45);
    }
    default:
      return 0;
  }
}

export function computeSmape(predicted: number[], actual: number[]): number | null {
  if (predicted.length === 0 || predicted.length !== actual.length) return null;
  let sum = 0;
  let n = 0;
  for (let i = 0; i < predicted.length; i++) {
    const denom = Math.abs(predicted[i]) + Math.abs(actual[i]);
    if (denom === 0) continue;
    sum += (2 * Math.abs(predicted[i] - actual[i])) / denom;
    n++;
  }
  return n === 0 ? null : sum / n;
}

/**
 * Walk-forward evaluation of an approach on a single series.
 * At each cutoff with enough lookback, forecast `horizonDays` ahead and
 * compare to the realized return using only past data.
 */
export function walkForwardApproach(
  series: SeriesPoint[],
  approach: ForecastApproach,
  horizonDays: number,
  minTrainPoints = 8
): { predicted: number[]; actual: number[] } {
  const predicted: number[] = [];
  const actual: number[] = [];
  if (series.length < minTrainPoints + 2) return { predicted, actual };

  for (let i = minTrainPoints; i < series.length; i++) {
    const cutoff = series[i];
    const train = series.slice(0, i + 1);
    const targetMs = Date.parse(cutoff.date) + horizonDays * 86400000;
    // Find first point at/after target (no leakage: train ends at cutoff).
    let future: SeriesPoint | null = null;
    for (let j = i + 1; j < series.length; j++) {
      if (Date.parse(series[j].date) >= targetMs) {
        future = series[j];
        break;
      }
    }
    if (!future) continue;
    const pred = predictReturn(train, horizonDays, approach);
    const act = future.price / cutoff.price - 1;
    if (!Number.isFinite(pred) || !Number.isFinite(act)) continue;
    predicted.push(pred);
    actual.push(act);
  }
  return { predicted, actual };
}

export function summarizeApproach(
  series: SeriesPoint[],
  approach: ForecastApproach,
  horizonDays: number
): ApproachBacktestSummary {
  const { predicted, actual } = walkForwardApproach(series, approach, horizonDays);
  const samples = predicted.length;
  if (samples === 0) {
    return {
      approach,
      samples: 0,
      mae: null,
      smape: null,
      directionalAccuracy: null,
      beatsFlat: false,
      beatsSma: false,
    };
  }
  const mae = mean(predicted.map((p, i) => Math.abs(p - actual[i])));
  const smape = computeSmape(predicted, actual);
  const dirPairs = predicted
    .map((p, i) => ({ p, a: actual[i] }))
    .filter((x) => x.p !== 0 && x.a !== 0);
  const directionalAccuracy =
    dirPairs.length === 0
      ? null
      : dirPairs.filter((x) => x.p > 0 === x.a > 0).length / dirPairs.length;

  const flat = walkForwardApproach(series, 'baseline_flat', horizonDays);
  const sma = walkForwardApproach(series, 'baseline_sma', horizonDays);
  const flatMae =
    flat.predicted.length > 0
      ? mean(flat.predicted.map((p, i) => Math.abs(p - flat.actual[i])))
      : Infinity;
  const smaMae =
    sma.predicted.length > 0
      ? mean(sma.predicted.map((p, i) => Math.abs(p - sma.actual[i])))
      : Infinity;

  return {
    approach,
    samples,
    mae,
    smape,
    directionalAccuracy,
    beatsFlat: mae < flatMae - 1e-6,
    beatsSma: mae < smaMae - 1e-6,
  };
}

export function selectBestApproach(
  series: SeriesPoint[],
  horizonDays: number
): ApproachBacktestSummary {
  const summaries = APPROACHES.map((a) => summarizeApproach(series, a, horizonDays));
  const ranked = [...summaries].filter((s) => s.mae != null).sort((a, b) => a.mae! - b.mae!);
  if (ranked.length === 0) {
    return summarizeApproach(series, 'baseline_flat', horizonDays);
  }
  // Prefer the lowest MAE; if a sophisticated model does not beat flat, use flat.
  const best = ranked[0];
  if (best.approach !== 'baseline_flat' && !best.beatsFlat) {
    return summaries.find((s) => s.approach === 'baseline_flat')!;
  }
  return best;
}

function volumeScore(series: SeriesPoint[]): number {
  const vols = series.map((p) => p.volume).filter((v): v is number => v != null && v > 0);
  if (vols.length === 0) return 40; // unknown volume — middling
  const recent = vols.slice(-8);
  const avg = mean(recent);
  // Rough: 0 listings → 10, 5+ → 70, 20+ → 90
  return clamp(10 + Math.log1p(avg) * 25, 5, 95);
}

function detectFlags(series: SeriesPoint[], dailyVol: number): string[] {
  const flags: string[] = [];
  if (series.length < 8) flags.push('thin_history');
  if (dailyVol > 0.08) flags.push('high_volatility');
  const last3 = series.slice(-3);
  if (last3.length === 3) {
    const move = Math.abs(last3[2].price / last3[0].price - 1);
    if (move > 0.35) flags.push('recent_spike');
  }
  const vols = series.map((p) => p.volume).filter((v): v is number => v != null);
  if (vols.length >= 3 && mean(vols.slice(-3)) < 2) flags.push('low_volume');
  const span = daysBetween(series[0].date, series[series.length - 1].date);
  const ageDays = daysBetween(
    series[series.length - 1].date,
    new Date().toISOString().slice(0, 10)
  );
  if (ageDays > 14) flags.push('stale_quote');
  if (span < 45) flags.push('short_span');
  return flags;
}

function reliabilityFrom(params: {
  points: number;
  spanDays: number;
  beatsBaseline: boolean;
  localMae: number | null;
  flags: string[];
  volScore: number;
}): { tier: ReliabilityTier; reason: string } {
  const { points, spanDays, beatsBaseline, localMae, flags, volScore } = params;
  if (points < 5 || spanDays < 14) {
    return { tier: 'insufficient', reason: 'Fewer than 5 points or under 14 days of history' };
  }
  if (flags.includes('stale_quote')) {
    return { tier: 'low', reason: 'Last market quote is older than 14 days' };
  }
  // Monthly sold-guide series often has 20–70 points over years — treat as medium/high
  // even when flat wins (that itself is an honest finding).
  if (points >= 24 && spanDays >= 120 && (localMae ?? 1) < 0.2 && volScore >= 30) {
    if (beatsBaseline) {
      return {
        tier: 'high',
        reason: 'Long history; model beats flat baseline on local walk-forward',
      };
    }
    return {
      tier: 'medium',
      reason: 'Long history; flat baseline is best — forecast stays conservative',
    };
  }
  if (points >= 10 && spanDays >= 45 && !flags.includes('recent_spike')) {
    return {
      tier: 'medium',
      reason: beatsBaseline
        ? 'Adequate history; approach beats flat baseline'
        : 'Adequate history; using conservative flat forecast',
    };
  }
  return { tier: 'low', reason: 'Thin or noisy history — treat forecast as directional only' };
}

function bandFor(
  current: number,
  expectedReturn: number,
  dailyVol: number,
  horizonDays: number,
  residualScale: number
): { low: number; mid: number; high: number } {
  const mid = current * (1 + expectedReturn);
  const sigma = dailyVol * Math.sqrt(horizonDays) * residualScale;
  // ~80% band via 1.28 sigma on log-price, floored to avoid zero-width.
  const width = Math.max(0.03, sigma * 1.28);
  const low = current * Math.exp(Math.log(1 + expectedReturn) - width);
  const high = current * Math.exp(Math.log(Math.max(1e-6, 1 + expectedReturn)) + width);
  return {
    low: Math.round(Math.max(0.01, low) * 100) / 100,
    mid: Math.round(mid * 100) / 100,
    high: Math.round(Math.max(mid, high) * 100) / 100,
  };
}

/**
 * Produce multi-horizon forecasts for a cleaned (or raw) price series.
 * Primary selection horizon is 30d; 7d/90d reuse the same approach family.
 */
export function forecastFromHistory(
  rawPoints: SeriesPoint[],
  horizons: readonly number[] = DEFAULT_HORIZONS
): ForecastResult {
  const series = cleanPriceSeries(rawPoints);
  const emptyHorizons: Record<number, HorizonForecast> = {};
  for (const d of horizons) {
    emptyHorizons[d] = {
      days: d,
      expectedReturn: 0,
      predictedMid: series.length ? series[series.length - 1].price : 0,
      low: series.length ? series[series.length - 1].price : 0,
      high: series.length ? series[series.length - 1].price : 0,
    };
  }

  if (series.length < 2) {
    return {
      approach: 'baseline_flat',
      currentPrice: series[0]?.price ?? 0,
      horizons: emptyHorizons,
      reliability: 'insufficient',
      reliabilityReason: 'Need at least 2 price points',
      historyPoints: series.length,
      historySpanDays: 0,
      lastHistoryDate: series[0]?.date ?? null,
      volumeScore: 0,
      volatility: 0,
      localMae: null,
      baselineMae: null,
      beatsBaseline: false,
      flags: ['thin_history'],
    };
  }

  const currentPrice = series[series.length - 1].price;
  const spanDays = daysBetween(series[0].date, series[series.length - 1].date);
  const rets = logReturns(series);
  const dailyVol = stdev(rets);
  const flags = detectFlags(series, dailyVol);
  const volScore = volumeScore(series);

  const selectionHorizon = horizons.includes(30) ? 30 : horizons[0];
  const best = selectBestApproach(series, selectionHorizon);
  const flat = summarizeApproach(series, 'baseline_flat', selectionHorizon);

  const approach = best.approach;
  const beatsBaseline = best.beatsFlat;
  const { tier, reason } = reliabilityFrom({
    points: series.length,
    spanDays,
    beatsBaseline,
    localMae: best.mae,
    flags,
    volScore,
  });

  const residualScale = 1 + (best.mae ?? 0.1) * 2;
  const outHorizons: Record<number, HorizonForecast> = {};
  for (const days of horizons) {
    let expectedReturn = tier === 'insufficient' ? 0 : predictReturn(series, days, approach);
    // Extra dampening for speculative flags.
    if (flags.includes('recent_spike') || flags.includes('low_volume')) {
      expectedReturn *= 0.5;
    }
    if (flags.includes('stale_quote')) {
      expectedReturn *= 0.35;
    }
    expectedReturn = clamp(expectedReturn, -0.5, 0.5);
    const band = bandFor(currentPrice, expectedReturn, dailyVol || 0.02, days, residualScale);
    outHorizons[days] = {
      days,
      expectedReturn,
      predictedMid: band.mid,
      low: band.low,
      high: band.high,
    };
  }

  return {
    approach,
    currentPrice,
    horizons: outHorizons,
    reliability: tier,
    reliabilityReason: reason,
    historyPoints: series.length,
    historySpanDays: spanDays,
    lastHistoryDate: series[series.length - 1].date,
    volumeScore: volScore,
    volatility: annualizedVolFromDaily(dailyVol),
    localMae: best.mae,
    baselineMae: flat.mae,
    beatsBaseline,
    flags,
  };
}

/** Compare all approaches on a series (for evaluation scripts / API). */
export function compareApproaches(
  rawPoints: SeriesPoint[],
  horizonDays = 30
): ApproachBacktestSummary[] {
  const series = cleanPriceSeries(rawPoints);
  return APPROACHES.map((a) => summarizeApproach(series, a, horizonDays));
}

export { annualizedVolFromDaily, mean, median, stdev, daysBetween };
