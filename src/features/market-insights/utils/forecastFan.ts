import type { CardPrediction } from '../types';

export interface FanPoint {
  day: number;
  label: string;
  low: number;
  mid: number;
  high: number;
}

/** The model's own ranges per horizon, starting from today's price. Horizons it did not score are left out. */
export function fanPoints(p: CardPrediction): FanPoint[] {
  const pts: FanPoint[] = [
    { day: 0, label: 'Today', low: p.currentPrice, mid: p.currentPrice, high: p.currentPrice },
    { day: 7, label: '7d', low: p.predicted7dLow, mid: p.predicted7dMid, high: p.predicted7dHigh },
    {
      day: 30,
      label: '30d',
      low: p.predicted30dLow,
      mid: p.predicted30dMid,
      high: p.predicted30dHigh,
    },
    {
      day: 90,
      label: '90d',
      low: p.predicted90dLow,
      mid: p.predicted90dMid,
      high: p.predicted90dHigh,
    },
  ];
  if (p.predicted180dMid != null && p.predicted180dLow != null && p.predicted180dHigh != null) {
    pts.push({
      day: 180,
      label: '6m',
      low: p.predicted180dLow,
      mid: p.predicted180dMid,
      high: p.predicted180dHigh,
    });
  }
  if (p.predicted365dMid != null && p.predicted365dLow != null && p.predicted365dHigh != null) {
    pts.push({
      day: 365,
      label: '1y',
      low: p.predicted365dLow,
      mid: p.predicted365dMid,
      high: p.predicted365dHigh,
    });
  }
  return pts.filter((x) => [x.low, x.mid, x.high].every((v) => Number.isFinite(v) && v > 0));
}
