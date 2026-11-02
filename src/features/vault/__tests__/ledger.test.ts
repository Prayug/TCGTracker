import { describe, expect, it } from 'vitest';
import type { VaultCard } from '../../../types/pokemon';
import {
  EMPTY_FILTER,
  costUpdate,
  filterHoldings,
  parseCostInput,
  rollupBySet,
  sortHoldings,
} from '../ledger';

function holding(id: string, over: Partial<VaultCard> & { price?: number; set?: string } = {}) {
  const { price = 10, set = 'Base Set', ...rest } = over;
  return {
    id,
    card: {
      id: `c-${id}`,
      name: `Card ${id}`,
      images: { small: '', large: '' },
      set: {
        id: set.toLowerCase().replace(/\s/g, '-'),
        name: set,
        releaseDate: '1999-01-09',
        total: 1,
      },
      number: '1',
      marketPrice: price,
    },
    purchasePrice: 0,
    costKnown: false,
    purchaseDate: '2026-01-01T00:00:00.000Z',
    quantity: 1,
    condition: 'raw',
    ...rest,
  } as VaultCard;
}

describe('parseCostInput', () => {
  it('treats blank as unknown and zero as a real cost', () => {
    expect(parseCostInput('')).toBeNull();
    expect(parseCostInput('  ')).toBeNull();
    expect(parseCostInput('0')).toBe(0);
    expect(parseCostInput('$1,250.5')).toBe(1250.5);
    expect(parseCostInput('-3')).toBeUndefined();
    expect(parseCostInput('abc')).toBeUndefined();
  });

  it('never stores an unknown cost as a number the app will trust', () => {
    expect(costUpdate(null)).toEqual({ purchasePrice: 0, costKnown: false });
    expect(costUpdate(0)).toEqual({ purchasePrice: 0, costKnown: true });
  });
});

describe('filterHoldings', () => {
  const cards = [
    holding('a', { costKnown: true, purchasePrice: 4 }),
    holding('b', { set: 'Jungle' }),
    holding('c', { condition: 'near-mint', costKnown: true, purchasePrice: 2 }),
  ];
  it('finds holdings without a recorded cost', () => {
    expect(filterHoldings(cards, { ...EMPTY_FILTER, missingCost: true }).map((c) => c.id)).toEqual([
      'b',
    ]);
  });
  it('filters by set key and condition', () => {
    expect(filterHoldings(cards, { ...EMPTY_FILTER, set: 'jungle' }).map((c) => c.id)).toEqual([
      'b',
    ]);
    expect(
      filterHoldings(cards, { ...EMPTY_FILTER, condition: 'near-mint' }).map((c) => c.id)
    ).toEqual(['c']);
  });
});

describe('sortHoldings', () => {
  const cards = [
    holding('known-up', { costKnown: true, purchasePrice: 5, price: 20 }),
    holding('unknown', { price: 50 }),
    holding('known-down', { costKnown: true, purchasePrice: 30, price: 10 }),
    holding('unpriced', { price: 0 }),
  ];
  it('puts unknown P/L last in both directions', () => {
    expect(
      sortHoldings(cards, 'pl', 'desc')
        .map((c) => c.id)
        .slice(0, 2)
    ).toEqual(['known-up', 'known-down']);
    expect(
      sortHoldings(cards, 'pl', 'asc')
        .map((c) => c.id)
        .slice(0, 2)
    ).toEqual(['known-down', 'known-up']);
  });
  it('puts unpriced holdings last when sorting by value', () => {
    expect(sortHoldings(cards, 'value', 'asc').at(-1)?.id).toBe('unpriced');
    expect(sortHoldings(cards, 'value', 'desc')[0].id).toBe('unknown');
  });
});

describe('rollupBySet', () => {
  it('only counts known cost toward set P/L and counts the gaps', () => {
    const [row] = rollupBySet([
      holding('a', { costKnown: true, purchasePrice: 4, price: 10 }),
      holding('b', { price: 100 }),
    ]);
    expect(row.value).toBe(110);
    expect(row.knownCost).toBe(4);
    expect(row.knownMarket).toBe(10);
    expect(row.missingCost).toBe(1);
  });
});
