import { VaultCard } from '../../../types/pokemon';
import {
  effectiveCostBasis,
  holdingMarketValue,
  isAssumedCost,
} from '../../../utils/vaultCost';

export type PerformancePeriod = '7d' | '30d' | 'ytd' | 'all';

export interface HoldingPerf {
  id: string;
  name: string;
  setName: string;
  quantity: number;
  costBasis: number;
  currentValue: number;
  profit: number;
  profitPct: number;
  assumedCost: boolean;
}

export function buildHoldings(vaultCards: VaultCard[]): HoldingPerf[] {
  return vaultCards.map((vc) => {
    const costBasis = effectiveCostBasis(vc);
    const currentValue = holdingMarketValue(vc);
    const profit = currentValue - costBasis;
    return {
      id: vc.id,
      name: vc.card.name,
      setName: vc.card.set?.name ?? '',
      quantity: vc.quantity,
      costBasis,
      currentValue,
      profit,
      profitPct: costBasis > 0 ? (profit / costBasis) * 100 : 0,
      assumedCost: isAssumedCost(vc),
    };
  });
}

export function periodStart(period: PerformancePeriod): Date | null {
  const now = new Date();
  if (period === 'all') return null;
  if (period === '7d') {
    const d = new Date(now);
    d.setDate(d.getDate() - 7);
    return d;
  }
  if (period === '30d') {
    const d = new Date(now);
    d.setDate(d.getDate() - 30);
    return d;
  }
  return new Date(now.getFullYear(), 0, 1);
}

/** Synthetic portfolio value series (cost → market interpolation). */
export function buildValueSeries(
  vaultCards: VaultCard[],
  period: PerformancePeriod
): { date: string; price: number }[] {
  const start = periodStart(period);
  const holdings = buildHoldings(vaultCards);
  const totalCost = holdings.reduce((s, h) => s + h.costBasis, 0);
  const totalCurrent = holdings.reduce((s, h) => s + h.currentValue, 0);

  const points: { date: string; price: number }[] = [];
  const end = new Date();
  const begin =
    start ??
    (() => {
      const dates = vaultCards
        .map((c) => new Date(c.purchaseDate).getTime())
        .filter((t) => !Number.isNaN(t));
      return new Date(dates.length ? Math.min(...dates) : end.getTime() - 90 * 86400000);
    })();

  const days = Math.max(1, Math.ceil((end.getTime() - begin.getTime()) / 86400000));
  const steps = Math.min(days, period === '7d' ? 7 : period === '30d' ? 30 : 60);

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const d = new Date(begin.getTime() + t * (end.getTime() - begin.getTime()));
    const value = totalCost + (totalCurrent - totalCost) * t;
    const purchasedCost = vaultCards
      .filter((vc) => new Date(vc.purchaseDate) <= d)
      .reduce((s, vc) => s + effectiveCostBasis(vc), 0);
    const purchasedCurrent = vaultCards
      .filter((vc) => new Date(vc.purchaseDate) <= d)
      .reduce((s, vc) => {
        const entryCost = effectiveCostBasis(vc);
        const entryCurrent = holdingMarketValue(vc);
        return s + entryCost + (entryCurrent - entryCost) * t;
      }, 0);
    points.push({
      date: d.toISOString().slice(0, 10),
      price: Math.max(purchasedCurrent || value * (purchasedCost / (totalCost || 1)), 0),
    });
  }

  return points;
}

export function seriesDelta(series: { price: number }[]): {
  dollar: number;
  percent: number;
} {
  if (series.length < 2) return { dollar: 0, percent: 0 };
  const first = series[0].price;
  const last = series[series.length - 1].price;
  const dollar = last - first;
  return {
    dollar,
    percent: first > 0 ? (dollar / first) * 100 : 0,
  };
}
