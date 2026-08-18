import {
  generateUniqueIdentifier,
  selectPriceHistoryForVariant,
  siblingIdentifierPrefix,
  siblingIdentifiersForLookup,
} from '../cardIdentifier';

describe('generateUniqueIdentifier', () => {
  it('normalizes set ID by removing special characters and lowercasing', () => {
    const id = generateUniqueIdentifier('SWORD & SHIELD', '1', 'Pikachu', 'normal');
    expect(id).toContain('sword');
    expect(id).not.toContain('&');
  });

  it('includes variant key in the identifier', () => {
    const normal = generateUniqueIdentifier('set1', '1', 'Pikachu', 'normal');
    const holo = generateUniqueIdentifier('set1', '1', 'Pikachu', 'holofoil');
    expect(normal).not.toBe(holo);
  });

  it('produces consistent output for same inputs', () => {
    const a = generateUniqueIdentifier('base1', '4', 'Charizard', 'holofoil');
    const b = generateUniqueIdentifier('base1', '4', 'Charizard', 'holofoil');
    expect(a).toBe(b);
  });

  it('handles missing card number', () => {
    const id = generateUniqueIdentifier('swsh1', undefined, 'Energy', 'normal');
    expect(id).toMatch(/swsh1\|\|energy\|normal/);
  });

  it('defaults variant to normal when empty', () => {
    const id = generateUniqueIdentifier('set1', '1', 'Card', '');
    expect(id).toContain('normal');
  });

  it('uses matchName for Japanese cards and prefixes ja|', () => {
    const id = generateUniqueIdentifier('sv2a', '201', 'リザードンex', 'normal', {
      language: 'ja',
      matchName: 'Charizard EX',
    });
    expect(id).toBe('ja|sv2a|201|charizardex|normal');
  });

  it('does not strip EN identity when language is en', () => {
    const id = generateUniqueIdentifier('sv3pt5', '199', 'Charizard ex', 'normal', {
      language: 'en',
    });
    expect(id).toBe('sv3pt5|199|charizardex|normal');
    expect(id.startsWith('ja|')).toBe(false);
  });
});

describe('siblingIdentifierPrefix', () => {
  it('drops the finish segment so Cardmarket UIDs share a series', () => {
    expect(siblingIdentifierPrefix('g1|rc30|gardevoirex|holofoil')).toBe('g1|rc30|gardevoirex|');
    expect(siblingIdentifierPrefix('ja|sv2a|201|charizardex|normal')).toBe(
      'ja|sv2a|201|charizardex|'
    );
  });
});

describe('siblingIdentifiersForLookup', () => {
  it('lists exact finish UIDs without a LIKE scan', () => {
    const ids = siblingIdentifiersForLookup('g1|rc30|gardevoirex|holofoil');
    expect(ids).toContain('g1|rc30|gardevoirex|holofoil');
    expect(ids).toContain('g1|rc30|gardevoirex|normal');
    expect(ids.every((id) => !id.includes('cardmarket'))).toBe(true);
  });
});

describe('selectPriceHistoryForVariant', () => {
  const rows = [
    { date: '2026-03-01', subTypeName: 'Reverse Holofoil', marketPrice: 341, price: 341 },
    { date: '2026-03-15', subTypeName: 'Reverse Holofoil', marketPrice: 448, price: 448 },
    { date: '2026-05-27', subTypeName: 'Holofoil', marketPrice: 556.25, price: 556.25 },
    { date: '2026-07-09', subTypeName: 'Holofoil', marketPrice: 465, price: 465 },
  ];

  it('keeps only holofoil rows when holofoil is preferred', () => {
    const selected = selectPriceHistoryForVariant(rows, 'holofoil');
    expect(selected).toHaveLength(2);
    expect(selected.every((r) => r.subTypeName === 'Holofoil')).toBe(true);
  });

  it('treats cardmarket-holo as holofoil', () => {
    const mixed = [
      ...rows,
      { date: '2026-08-22', subTypeName: 'cardmarket-holo', marketPrice: 99.7, price: 99.7 },
    ];
    const selected = selectPriceHistoryForVariant(mixed, 'holofoil');
    expect(selected.map((r) => r.date)).toContain('2026-08-22');
  });

  it('does not fall back to reverse when holofoil history is sparse', () => {
    const sparse = [
      { date: '2026-03-01', subTypeName: 'Reverse Holofoil', marketPrice: 341, price: 341 },
      { date: '2026-08-01', subTypeName: 'Holofoil', marketPrice: 465, price: 465 },
    ];
    const selected = selectPriceHistoryForVariant(sparse, 'holofoil');
    expect(selected).toHaveLength(1);
    expect(selected[0].marketPrice).toBe(465);
  });

  it('prefers tcgdex over catalog fallback on the same date', () => {
    const tied = [
      { date: '2026-09-08', subTypeName: 'reverseHolofoil', marketPrice: 24.11, price: 24.11, source: 'catalog_fallback' },
      { date: '2026-09-08', subTypeName: 'reverseholofoil', marketPrice: 38.9, price: 38.9, source: 'tcgdex' },
    ];
    const selected = selectPriceHistoryForVariant(tied, 'reverseHolofoil');
    expect(selected).toHaveLength(1);
    expect(selected[0].source).toBe('tcgdex');
    expect(selected[0].price).toBe(38.9);
  });
});
