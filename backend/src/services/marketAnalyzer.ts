export interface PricePoint {
  date: string;
  price: number;
  marketPrice?: number;
  volume?: number;
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export interface MovingAverages {
  ma7: number | null;
  ma30: number | null;
  ma90: number | null;
}

export interface VolatilityMetrics {
  dailyVolatility: number;
  weeklyVolatility: number;
  monthlyVolatility: number;
}

export interface SupportResistance {
  support: number | null;
  resistance: number | null;
}

export interface RecoveryMetrics {
  recentDrop: number | null;
  hasStabilized: boolean;
  daysSinceBottom: number | null;
  priorRecoveryPattern: boolean;
}

export interface PriceChanges {
  change7d: number | null;
  change30d: number | null;
  change90d: number | null;
  change180d: number | null;
  change1y: number | null;
}

export function getLatestPrice(points: PricePoint[]): number | null {
  if (points.length === 0) return null;
  const sorted = [...points].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  return sorted[0].marketPrice ?? sorted[0].price;
}

export function getPriceAtDate(points: PricePoint[], targetDate: Date): number | null {
  const target = formatDate(targetDate);
  const sorted = [...points].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const match = sorted.find(p => p.date <= target);
  if (match) return match.marketPrice ?? match.price;
  return null;
}

/**
 * Calendar-window moving averages: averages the prices observed within the
 * trailing N calendar days (measured from the latest quote), not the last N
 * rows. Sparse series therefore get honest, date-correct averages.
 */
export function computeMovingAverages(points: PricePoint[]): MovingAverages {
  const sorted = [...points]
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .map(p => ({ date: p.date.includes('T') ? p.date.split('T')[0] : p.date, price: p.marketPrice ?? p.price }))
    .filter(p => p.price > 0);
  if (sorted.length === 0) return { ma7: null, ma30: null, ma90: null };

  const lastDateMs = new Date(`${sorted[sorted.length - 1].date}T00:00:00Z`).getTime();
  const DAY_MS = 86_400_000;

  const maOverDays = (days: number): number | null => {
    const cutoffMs = lastDateMs - (days - 1) * DAY_MS;
    const window = sorted.filter(p => new Date(`${p.date}T00:00:00Z`).getTime() >= cutoffMs);
    if (window.length === 0) return null;
    return window.reduce((a, b) => a + b.price, 0) / window.length;
  };

  return { ma7: maOverDays(7), ma30: maOverDays(30), ma90: maOverDays(90) };
}

export function computePriceChanges(points: PricePoint[]): PriceChanges {
  const sorted = [...points].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const getChange = (days: number): number | null => {
    const now = sorted[sorted.length - 1];
    if (!now) return null;
    const currentPrice = now.marketPrice ?? now.price;
    if (!currentPrice || currentPrice <= 0) return null;
    const targetDate = new Date(now.date);
    targetDate.setDate(targetDate.getDate() - days);
    const target = getPriceAtDate(sorted, targetDate);
    if (!target || target <= 0) return null;
    return ((currentPrice - target) / target) * 100;
  };

  return {
    change7d: getChange(7),
    change30d: getChange(30),
    change90d: getChange(90),
    change180d: getChange(180),
    change1y: getChange(365),
  };
}

export function computeVolatility(points: PricePoint[], days: number = 30): VolatilityMetrics {
  const sorted = [...points]
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .map(p => ({
      date: p.date.includes('T') ? p.date.split('T')[0] : p.date,
      price: p.marketPrice ?? p.price,
    }))
    .filter(p => p.price > 0);
  if (sorted.length === 0) {
    return { dailyVolatility: 0.05, weeklyVolatility: 0.12, monthlyVolatility: 0.25 };
  }

  const lastDateMs = new Date(`${sorted[sorted.length - 1].date}T00:00:00Z`).getTime();
  const DAY_MS = 86_400_000;
  const cutoffMs = lastDateMs - (Math.max(days, 30) - 1) * DAY_MS;
  const recent = sorted.filter(p => new Date(`${p.date}T00:00:00Z`).getTime() >= cutoffMs);

  if (recent.length < 7) {
    // Return elevated uncertainty values instead of arbitrary defaults
    // This naturally penalizes sparse-data cards through risk scoring
    const dataRatio = recent.length / 7;
    const uncertaintyScale = 1 + (1 - dataRatio) * 2; // 1x-3x multiplier
    return {
      dailyVolatility: 0.05 * uncertaintyScale,
      weeklyVolatility: 0.12 * uncertaintyScale,
      monthlyVolatility: 0.25 * uncertaintyScale,
    };
  }

  // Day-over-day log returns, skipping gaps so sparse series don't get
  // inflated variance from multi-day moves.
  const logReturns: number[] = [];
  for (let i = 1; i < recent.length; i++) {
    const prev = recent[i - 1];
    const curr = recent[i];
    const gapDays = Math.max(1, Math.round(
      (new Date(`${curr.date}T00:00:00Z`).getTime() - new Date(`${prev.date}T00:00:00Z`).getTime()) / DAY_MS
    ));
    if (gapDays > 1) {
      // Normalize multi-day moves to an approximate per-day return.
      logReturns.push(Math.log(curr.price / prev.price) / Math.sqrt(gapDays));
    } else {
      logReturns.push(Math.log(curr.price / prev.price));
    }
  }
  const mean = logReturns.reduce((a, b) => a + b, 0) / logReturns.length;
  const variance = logReturns.reduce((a, b) => a + (b - mean) ** 2, 0) / logReturns.length;
  const dailyVol = Math.sqrt(variance);
  return {
    dailyVolatility: dailyVol,
    weeklyVolatility: dailyVol * Math.sqrt(7),
    monthlyVolatility: dailyVol * Math.sqrt(30),
  };
}

export function findSupportResistance(points: PricePoint[]): SupportResistance {
  const sorted = [...points].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const prices = sorted.map(p => p.marketPrice ?? p.price).filter(p => p > 0);
  if (prices.length < 20) return { support: null, resistance: null };

  const sortedPrices = [...prices].sort((a, b) => a - b);
  const supportIdx = Math.floor(sortedPrices.length * 0.1);
  const resistanceIdx = Math.floor(sortedPrices.length * 0.9);

  return {
    support: sortedPrices[supportIdx],
    resistance: sortedPrices[resistanceIdx],
  };
}

export function computeRecoveryMetrics(points: PricePoint[]): RecoveryMetrics {
  const sorted = [...points].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const prices = sorted.map(p => p.marketPrice ?? p.price).filter(p => p > 0);
  if (prices.length < 14) {
    return { recentDrop: null, hasStabilized: false, daysSinceBottom: null, priorRecoveryPattern: false };
  }

  const currentPrice = prices[prices.length - 1];
  const recent90 = prices.slice(-Math.min(90, prices.length));
  let peak90 = recent90[0];
  for (const p of recent90) {
    if (p > peak90) peak90 = p;
  }
  const recentDrop = peak90 > 0 ? ((currentPrice - peak90) / peak90) * 100 : null;

  const recent30 = prices.slice(-30);
  const recent10 = prices.slice(-10);
  const avg10 = recent10.reduce((a, b) => a + b, 0) / recent10.length;
  const avg30 = recent30.reduce((a, b) => a + b, 0) / recent30.length;
  const hasStabilized = Math.abs(recent10[recent10.length - 1] - recent10[0]) / recent10[0] < 0.05;

  let minIdx = 0;
  let minVal = prices[0];
  const startIdx = Math.max(0, prices.length - 90);
  for (let i = startIdx; i < prices.length; i++) {
    if (prices[i] < minVal) {
      minVal = prices[i];
      minIdx = i;
    }
  }
  const daysSinceBottom = prices.length - 1 - minIdx;

  const priorDrops: number[] = [];
  for (let i = 0; i < prices.length - 60; i += 30) {
    const segment = prices.slice(i, i + 60);
    let segPeak = segment[0];
    let segTrough = segment[0];
    for (const p of segment) {
      if (p > segPeak) segPeak = p;
      if (p < segTrough) segTrough = p;
    }
    if (segPeak > 0) {
      const drop = ((segTrough - segPeak) / segPeak) * 100;
      if (drop < -10 && i + 60 <= prices.length) {
        const recoverEnd = prices[Math.min(i + 60, prices.length - 1)];
        const recoveryPct = ((recoverEnd - segTrough) / segTrough) * 100;
        priorDrops.push(recoveryPct);
      }
    }
  }

  const priorRecoveryPattern = priorDrops.length > 0 && priorDrops.some(r => r > 10);

  return { recentDrop, hasStabilized, daysSinceBottom, priorRecoveryPattern };
}

export function analyzeSimilarCards(
  cardName: string,
  rarity: string,
  allCards: Array<{ name: string; rarity: string; avgReturn90d: number }>
): { similarAvgReturn: number | null; sampleSize: number } {
  const rarityMap: Record<string, string[]> = {
    'Rare Secret': ['Rare Secret', ' Rare Secret'],
    'Rare Ultra': ['Rare Ultra', ' Rare Ultra'],
    'Rare Holo': ['Rare Holo', ' Rare Holo', 'Rare Holo V', 'Rare Holo VMAX', 'Rare Holo VSTAR'],
    'Rare': ['Rare'],
    'Uncommon': ['Uncommon'],
    'Common': ['Common'],
    'Promo': ['Promo'],
  };

  const matchingRarities = rarityMap[rarity] || [rarity];
  const similar = allCards.filter(
    c => matchingRarities.includes(c.rarity) && c.avgReturn90d !== null
  );

  if (similar.length === 0) return { similarAvgReturn: null, sampleSize: 0 };

  const avgReturn = similar.reduce((a, b) => a + b.avgReturn90d, 0) / similar.length;
  return { similarAvgReturn: avgReturn, sampleSize: similar.length };
}

/**
 * Computes the market-wide average return over a given number of days.
 * This serves as a benchmark for comparing individual card predictions.
 * Returns are measured from the quote at (latest date - days) to the latest
 * quote, so sparse series contribute correct calendar-window returns.
 */
export function computeMarketBenchmark(
  allPriceHistories: PricePoint[][],
  days: number = 90
): { avgReturn: number; medianReturn: number; returnStdDev: number; sampleSize: number } {
  const returns: number[] = [];

  for (const history of allPriceHistories) {
    const sorted = [...history].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const prices = sorted.map(p => p.marketPrice ?? p.price).filter(p => p > 0);
    if (prices.length < 2) continue;

    const currentPrice = prices[prices.length - 1];
    const currentDate = sorted[sorted.length - 1].date;
    const targetDate = new Date(currentDate);
    targetDate.setDate(targetDate.getDate() - days);
    const pastPrice = getPriceAtDate(sorted, targetDate);

    if (pastPrice && pastPrice > 0 && currentPrice > 0) {
      returns.push((currentPrice - pastPrice) / pastPrice);
    }
  }

  if (returns.length === 0) {
    return { avgReturn: 0, medianReturn: 0, returnStdDev: 0, sampleSize: 0 };
  }

  const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
  const sortedReturns = [...returns].sort((a, b) => a - b);
  const medianReturn = sortedReturns[Math.floor(sortedReturns.length / 2)];
  const variance = returns.reduce((a, r) => a + (r - avgReturn) ** 2, 0) / returns.length;
  const returnStdDev = Math.sqrt(variance);

  return { avgReturn, medianReturn, returnStdDev, sampleSize: returns.length };
}

/**
 * Computes excess return: how much a card's predicted return exceeds
 * the market benchmark. Positive = outperforming, negative = underperforming.
 */
export function computeExcessReturn(
  predictedReturn: number,
  marketAvgReturn: number
): number {
  return predictedReturn - marketAvgReturn;
}
