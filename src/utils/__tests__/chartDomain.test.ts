import { describe, expect, it } from 'vitest';
import {
  computePriceChartDomain,
  computeTightChartDomain,
  formatCompactAxisPrice,
  formatPriceChange,
  slicePriceHistory,
} from '../chartDomain';

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

  it('keeps a ~16% card move visually large (not anchored at $0)', () => {
    const prices = [380, 360, 345, 330, 326];
    const [min, max] = computePriceChartDomain(prices);
    expect(min).toBeGreaterThan(250);
    expect(max).toBeLessThan(450);
    // Data range should dominate the domain (tight around the move).
    expect(max - min).toBeLessThan(380 * 0.35);
  });
});

describe('formatPriceChange', () => {
  it('formats dollar and percent change', () => {
    expect(formatPriceChange(3813, 3860.72).label).toBe('+$47.72 (+1.3%)');
  });
});

describe('computeTightChartDomain', () => {
  it('fits a high-value series without anchoring at $0', () => {
    const [min, max] = computeTightChartDomain([355_000, 360_000, 365_000, 370_000]);
    expect(min).toBeGreaterThan(330_000);
    expect(max).toBeLessThan(390_000);
    expect(min).toBeLessThan(355_000);
    expect(max).toBeGreaterThan(370_000);
  });

  it('includes zero for performance series', () => {
    const [min, max] = computeTightChartDomain([0, 2.4, 5.1], { includeZero: true });
    expect(min).toBeLessThanOrEqual(0);
    expect(max).toBeGreaterThan(5.1);
  });
});

describe('formatCompactAxisPrice', () => {
  it('uses k/M suffixes for large values', () => {
    expect(formatCompactAxisPrice(365_750)).toBe('$366k');
    expect(formatCompactAxisPrice(1_200_000)).toBe('$1.2M');
  });
});

describe('slicePriceHistory', () => {
  it('keeps ALL history unchanged', () => {
    const history = [
      { date: '2025-01-01', price: 100 },
      { date: '2026-08-01', price: 140 },
    ];
    expect(slicePriceHistory(history, 'ALL')).toEqual(history);
  });

  it('includes the last point before the window', () => {
    const history = [
      { date: '2026-01-01', price: 100 },
      { date: '2026-06-01', price: 110 },
      { date: '2026-08-01', price: 140 },
    ];
    const sliced = slicePriceHistory(history, '1M');
    expect(sliced[0].date).toBe('2026-06-01');
    expect(sliced[sliced.length - 1].date).toBe('2026-08-01');
  });
});
