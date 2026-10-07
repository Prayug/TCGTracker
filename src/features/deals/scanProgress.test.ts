import { describe, expect, it } from 'vitest';
import { formatScanPercent, scanProgressView } from './scanProgress';
import type { DealsMeta } from './types';

function meta(partial: Partial<DealsMeta> = {}): DealsMeta {
  return {
    ebayConfigured: true,
    cached: false,
    fetchedAt: '2026-10-04T00:00:00.000Z',
    cacheExpiresAt: null,
    error: null,
    candidateStrategy: 'test',
    listingsScanned: 0,
    listingsFetched: 0,
    ebayTotal: null,
    scanning: true,
    ...partial,
  };
}

describe('scanProgressView', () => {
  it('stays indeterminate until the search plan is known', () => {
    const view = scanProgressView(meta({ listingsScanned: 12 }));
    expect(view.searchIndex).toBeNull();
    expect(view.searchPercent).toBeNull();
    expect(view.overallPercent).toBeNull();
    expect(view.listingsChecked).toBe(12);
  });

  it('fills the current search without treating it as the whole crawl', () => {
    const view = scanProgressView(
      meta({
        queriesDone: 0,
        queriesTotal: 10,
        queryOffset: 200,
        queryReachable: 1000,
        queryLabel: 'Buy It Now · $10–$25',
        listingsScanned: 180,
      })
    );
    expect(view.searchIndex).toBe(1);
    expect(view.searchPercent).toBe(20);
    expect(view.overallPercent).toBe(2);
    expect(view.searchLabel).toBe('Buy It Now · $10–$25');
  });

  it('keeps overall progress from jumping backward when the next search starts', () => {
    const mid = scanProgressView(
      meta({
        queriesDone: 3,
        queriesTotal: 10,
        queryOffset: 900,
        queryReachable: 1000,
      })
    );
    const next = scanProgressView(
      meta({
        queriesDone: 4,
        queriesTotal: 10,
        queryOffset: 0,
        queryReachable: null,
      })
    );
    expect(mid.overallPercent).toBeCloseTo(39);
    expect(next.overallPercent).toBe(40);
    expect(next.searchIndex).toBe(5);
    expect(next.searchPercent).toBeNull();
  });
});

describe('formatScanPercent', () => {
  it('shows a tenth below 10% so slow crawls still move', () => {
    expect(formatScanPercent(0)).toBe('0%');
    expect(formatScanPercent(0.06)).toBe('0.1%');
    expect(formatScanPercent(2)).toBe('2%');
    expect(formatScanPercent(15.6)).toBe('16%');
    expect(formatScanPercent(null)).toBe('—');
  });
});
