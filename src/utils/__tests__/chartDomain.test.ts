import { describe, expect, it } from 'vitest';
import { computePriceChartDomain, formatPriceChange } from '../chartDomain';

describe('computePriceChartDomain', () => {
  it('uses a wide span for small moves on high values', () => {
    const prices = [3813, 3813, 3840, 3840, 3860.72];
    const [min, max] = computePriceChartDomain(prices);
    expect(max - min).toBeGreaterThan(200);
  });

  it('still shows variation for low-price cards', () => {
    const prices = [4.5, 4.8, 5.1];
    const [min, max] = computePriceChartDomain(prices);
    expect(min).toBeLessThan(4.5);
    expect(max).toBeGreaterThan(5.1);
  });
});

describe('formatPriceChange', () => {
  it('formats dollar and percent change', () => {
    expect(formatPriceChange(3813, 3860.72).label).toBe('+$47.72 (+1.3%)');
  });
});
