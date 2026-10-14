import {
  archiveRowPrice,
  archiveUrl,
  backfillDates,
  mappingKey,
  normalizeSubType,
  parseArchivePricesFile,
} from '../tcgcsvArchive';

describe('tcgcsvArchive', () => {
  it('builds archive URLs', () => {
    expect(archiveUrl('2024-05-01')).toBe(
      'https://tcgcsv.com/archive/tcgplayer/prices-2024-05-01.ppmd.7z'
    );
  });

  it('normalizes finish names across sync and archive spellings', () => {
    expect(normalizeSubType('Reverse Holofoil')).toBe('reverseholofoil');
    expect(normalizeSubType('reverseHolofoil')).toBe('reverseholofoil');
    expect(mappingKey(42, '1st Edition Holofoil')).toBe(mappingKey(42, '1stEditionHolofoil'));
  });

  it('steps dates and clamps to the first archive', () => {
    expect(backfillDates('2024-01-01', '2024-02-22', 7)).toEqual([
      '2024-02-08',
      '2024-02-15',
      '2024-02-22',
    ]);
    expect(backfillDates('2024-03-01', '2024-03-03', 1)).toHaveLength(3);
  });

  it('parses price files and prefers market over mid', () => {
    const rows = parseArchivePricesFile(
      JSON.stringify({
        success: true,
        results: [
          { productId: 1, subTypeName: 'Holofoil', marketPrice: 10.5, midPrice: 12, lowPrice: 9 },
          { productId: 2, subTypeName: 'Normal', marketPrice: null, midPrice: 3 },
          { productId: 3, subTypeName: 'Normal', marketPrice: null, midPrice: null },
          { productId: 'x', subTypeName: 'Normal', marketPrice: 1 },
        ],
      })
    );
    expect(rows).toHaveLength(3);
    expect(rows.map(archiveRowPrice)).toEqual([10.5, 3, null]);
    expect(parseArchivePricesFile('not json')).toEqual([]);
  });
});
