import { describe, expect, it } from 'vitest';
import { fanPoints } from '../ForecastFan';
import type { CardPrediction } from '../../../types';

const base = {
  currentPrice: 100,
  predicted7dLow: 95,
  predicted7dMid: 101,
  predicted7dHigh: 106,
  predicted30dLow: 90,
  predicted30dMid: 104,
  predicted30dHigh: 118,
  predicted90dLow: 80,
  predicted90dMid: 108,
  predicted90dHigh: 135,
} as unknown as CardPrediction;

describe('fanPoints', () => {
  it('starts at today and keeps only the horizons the model scored', () => {
    const pts = fanPoints(base);
    expect(pts.map((p) => p.label)).toEqual(['Today', '7d', '30d', '90d']);
    expect(pts[0]).toMatchObject({ low: 100, mid: 100, high: 100 });
  });

  it('adds longer horizons only when all three values exist', () => {
    const pts = fanPoints({
      ...base,
      predicted180dMid: 112,
      predicted180dLow: 70,
      predicted180dHigh: null,
    } as CardPrediction);
    expect(pts.map((p) => p.label)).not.toContain('6m');
  });
});
