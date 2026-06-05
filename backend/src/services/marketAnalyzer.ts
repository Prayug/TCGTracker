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

export function computeMovingAverages(points: PricePoint[]): MovingAverages {
  const sorted = [...points].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const prices = sorted.map(p => p.marketPrice ?? p.price).filter(p => p > 0);
  if (prices.length === 0) return { ma7: null, ma30: null, ma90: null };

  const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);

  const ma7 = prices.length >= 7 ? sum(prices.slice(-7)) / 7 : null;
  const ma30 = prices.length >= 30 ? sum(prices.slice(-30)) / 30 : null;
  const ma90 = prices.length >= 90 ? sum(prices.slice(-90)) / 90 : null;

  return { ma7, ma30, ma90 };
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
  const sorted = [...points].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const recent = sorted.slice(-Math.max(days, 30));
  const prices = recent.map(p => p.marketPrice ?? p.price).filter(p => p > 0);
  if (prices.length < 7) {
    return { dailyVolatility: 0.02, weeklyVolatility: 0.05, monthlyVolatility: 0.10 };
  }
  const logReturns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    logReturns.push(Math.log(prices[i] / prices[i - 1]));
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
  const peak90 = Math.max(...prices.slice(-90));
  const recentDrop = peak90 > 0 ? ((currentPrice - peak90) / peak90) * 100 : null;

  const recent30 = prices.slice(-30);
  const recent10 = prices.slice(-10);
  const avg10 = recent10.reduce((a, b) => a + b, 0) / recent10.length;
  const avg30 = recent30.reduce((a, b) => a + b, 0) / recent30.length;
  const hasStabilized = Math.abs(recent10[recent10.length - 1] - recent10[0]) / recent10[0] < 0.05;

  const minIdx = prices.lastIndexOf(Math.min(...prices.slice(-90)));
  const daysSinceBottom = prices.length - 1 - minIdx;

  const priorDrops: number[] = [];
  for (let i = 0; i < prices.length - 60; i += 30) {
    const segment = prices.slice(i, i + 60);
    const segPeak = Math.max(...segment);
    const segTrough = Math.min(...segment);
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
