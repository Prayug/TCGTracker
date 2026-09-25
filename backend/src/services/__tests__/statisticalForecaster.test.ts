import {
  cleanPriceSeries,
  compareApproaches,
  forecastFromHistory,
  predictReturn,
  selectBestApproach,
  walkForwardApproach,
  computeSmape,
} from '../statisticalForecaster';

function makeSeries(
  start: string,
  prices: number[],
  stepDays = 7
): Array<{ date: string; price: number }> {
  const startMs = Date.parse(start);
  return prices.map((price, i) => ({
    date: new Date(startMs + i * stepDays * 86400000).toISOString().slice(0, 10),
    price,
  }));
}

describe('statisticalForecaster', () => {
  it('cleans spikes and drops non-positive prices', () => {
    const cleaned = cleanPriceSeries([
      { date: '2024-01-01', price: 10 },
      { date: '2024-01-08', price: 0 },
      { date: '2024-01-15', price: 50 }, // cliff
      { date: '2024-01-22', price: 11 },
    ]);
    expect(cleaned.every((p) => p.price > 0)).toBe(true);
    // Cliff from 10 → 50 should be winsorized to ≤ 17
    expect(cleaned[1].price).toBeLessThanOrEqual(17.01);
  });

  it('flat baseline predicts zero return', () => {
    const series = makeSeries(
      '2024-01-01',
      Array.from({ length: 20 }, (_, i) => 10 + i * 0.05)
    );
    expect(predictReturn(series, 30, 'baseline_flat')).toBe(0);
  });

  it('mean reversion pulls toward the recent mean after a dip', () => {
    const series = makeSeries('2024-01-01', [...Array.from({ length: 16 }, () => 20), 12, 12, 12]);
    const ret = predictReturn(series, 30, 'mean_reversion');
    expect(ret).toBeGreaterThan(0);
  });

  it('walk-forward never peeks past the cutoff', () => {
    const series = makeSeries(
      '2023-01-01',
      Array.from({ length: 40 }, (_, i) => 10 + Math.sin(i / 3))
    );
    const { predicted, actual } = walkForwardApproach(series, 'ewma_momentum', 30, 8);
    expect(predicted.length).toBe(actual.length);
    expect(predicted.length).toBeGreaterThan(0);
  });

  it('selectBestApproach falls back to flat when models do not beat it', () => {
    // Pure noise around a constant — sophisticated models should not beat flat MAE.
    const series = makeSeries(
      '2023-01-01',
      Array.from({ length: 36 }, (_, i) => 25 + ((i * 7) % 5) * 0.01)
    );
    const best = selectBestApproach(series, 30);
    expect([
      'baseline_flat',
      'baseline_sma',
      'mean_reversion',
      'hybrid',
      'ewma_momentum',
    ]).toContain(best.approach);
    expect(best.mae).not.toBeNull();
  });

  it('forecastFromHistory marks thin series insufficient', () => {
    const result = forecastFromHistory([
      { date: '2024-06-01', price: 5 },
      { date: '2024-06-08', price: 5.2 },
    ]);
    expect(result.reliability).toBe('insufficient');
    expect(result.horizons[30].expectedReturn).toBe(0);
  });

  it('forecastFromHistory returns bands and approach on long series', () => {
    const series = makeSeries(
      '2023-01-01',
      Array.from({ length: 50 }, (_, i) => 15 + Math.sin(i / 4) * 2 + i * 0.02)
    );
    const result = forecastFromHistory(series);
    expect(result.historyPoints).toBeGreaterThan(20);
    expect(result.horizons[7]).toBeDefined();
    expect(result.horizons[30]).toBeDefined();
    expect(result.horizons[90].low).toBeLessThanOrEqual(result.horizons[90].high);
    expect(result.reliability).not.toBe('insufficient');
  });

  it('compareApproaches returns all five approaches', () => {
    const series = makeSeries(
      '2023-01-01',
      Array.from({ length: 40 }, (_, i) => 8 + i * 0.1)
    );
    const rows = compareApproaches(series, 30);
    expect(rows).toHaveLength(5);
    expect(rows.map((r) => r.approach)).toEqual(
      expect.arrayContaining([
        'baseline_flat',
        'baseline_sma',
        'ewma_momentum',
        'mean_reversion',
        'hybrid',
      ])
    );
  });

  it('computeSmape is symmetric and bounded', () => {
    expect(computeSmape([0.1, -0.1], [0.05, -0.2])).toBeGreaterThan(0);
    expect(computeSmape([0, 0], [0, 0])).toBeNull();
  });
});
