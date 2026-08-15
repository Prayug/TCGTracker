import {
  preferCatalogOverTcgcsv,
  slabUid,
  SLAB_MIN_DATA_POINTS,
  SLAB_MIN_SPAN_DAYS,
} from '../slabPredictionEngine';

describe('preferCatalogOverTcgcsv', () => {
  it('keeps the catalog id when a tcgcsv SKU shares the same product', () => {
    const rows = [
      { cardId: 'tcgcsv-197651', productId: '964029' },
      { cardId: 'sm115-9', productId: '964029' },
      { cardId: 'sv3-199', productId: '111' },
    ];
    const unique = preferCatalogOverTcgcsv(rows);
    expect(unique).toHaveLength(2);
    expect(unique.find((r) => r.productId === '964029')?.cardId).toBe('sm115-9');
    expect(unique.find((r) => r.productId === '111')?.cardId).toBe('sv3-199');
  });

  it('keeps rows without a product id', () => {
    const rows = [
      { cardId: 'a', productId: null },
      { cardId: 'b', productId: undefined },
    ];
    expect(preferCatalogOverTcgcsv(rows)).toHaveLength(2);
  });
});

describe('slabUid', () => {
  it('namespaces PSA 10 series by card id', () => {
    expect(slabUid('sm115-9')).toBe('slab:psa10:sm115-9');
  });
});

describe('slab universe gates', () => {
  it('does not require more calendar span than a week of nightly snapshots', () => {
    expect(SLAB_MIN_DATA_POINTS).toBeGreaterThanOrEqual(3);
    expect(SLAB_MIN_SPAN_DAYS).toBeLessThanOrEqual(7);
  });
});
