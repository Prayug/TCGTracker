import { describe, expect, it } from 'vitest';
import type { PokemonCard } from '../../../types/pokemon';
import {
  DEFAULT_CATALOG_STATE,
  activeFacetCount,
  applyCatalogFilters,
  facetOptions,
  inPriceBand,
  matchesQuick,
  parseCatalogState,
  writeCatalogState,
} from '../catalogFilters';
import { sortCards } from '../../../utils/sorting';

function card(id: string, over: Partial<PokemonCard> = {}): PokemonCard {
  return {
    id,
    name: `Card ${id}`,
    images: { small: '', large: '' },
    set: { id: 's1', name: 'Base Set', releaseDate: '1999-01-09', total: 102 },
    number: '1',
    rarity: 'Rare Holo',
    types: ['Fire'],
    tcgplayer: { url: '', updatedAt: '', prices: {} },
    ...over,
  } as PokemonCard;
}

describe('catalog URL state', () => {
  it('round-trips and omits defaults', () => {
    const params = writeCatalogState(new URLSearchParams(), {
      q: 'charizard',
      sort: 'price-high',
      view: 'list',
      price: '10-50',
      set: '',
    });
    expect(params.toString()).toBe('q=charizard&view=list&price=10-50');
    expect(parseCatalogState(params)).toEqual({
      ...DEFAULT_CATALOG_STATE,
      q: 'charizard',
      view: 'list',
      price: '10-50',
    });
  });

  it('ignores unknown values instead of trusting them', () => {
    const s = parseCatalogState(new URLSearchParams('sort=hack&quick=low-pop&price=free'));
    expect(s.sort).toBe('price-high');
    expect(s.quick).toBe('all');
    expect(s.price).toBe('all');
  });
});

describe('price bands', () => {
  it('never puts an unpriced card in the cheapest band', () => {
    expect(inPriceBand(null, 'under-10')).toBe(false);
    expect(inPriceBand(null, 'all')).toBe(true);
    expect(inPriceBand(9.99, 'under-10')).toBe(true);
    expect(inPriceBand(10, '10-50')).toBe(true);
  });

  it('filters by band using the known market price', () => {
    const cards = [card('a', { marketPrice: 5 }), card('b'), card('c', { marketPrice: 200 })];
    const out = applyCatalogFilters(cards, { ...DEFAULT_CATALOG_STATE, price: 'under-10' });
    expect(out.map((c) => c.id)).toEqual(['a']);
  });
});

describe('quick filters', () => {
  const withTrend = (trend: number, avg7: number, avg30: number) =>
    card('t', {
      cardmarket: {
        url: '',
        updatedAt: '',
        prices: { trendPrice: trend, avg7, avg30 },
      },
    } as Partial<PokemonCard>);

  it('rising and falling use the observed 7-day comparison', () => {
    expect(matchesQuick(withTrend(110, 100, 100), 'rising')).toBe(true);
    expect(matchesQuick(withTrend(94, 100, 100), 'falling')).toBe(true);
    expect(matchesQuick(withTrend(101, 100, 100), 'rising')).toBe(false);
  });

  it('cards without movement data never match a movement filter', () => {
    expect(matchesQuick(card('x', { marketPrice: 20 }), 'rising')).toBe(false);
    expect(matchesQuick(card('x', { marketPrice: 20 }), 'below-avg')).toBe(false);
    expect(matchesQuick(card('x', { marketPrice: 20 }), 'priced')).toBe(true);
    expect(matchesQuick(card('x'), 'priced')).toBe(false);
  });
});

describe('facets', () => {
  it('counts options from the result set, most common first', () => {
    const f = facetOptions([
      card('a', { rarity: 'Common' }),
      card('b', { rarity: 'Common' }),
      card('c', { rarity: 'Rare' }),
    ]);
    expect(f.rarities).toEqual([
      { value: 'Common', count: 2 },
      { value: 'Rare', count: 1 },
    ]);
    expect(activeFacetCount({ ...DEFAULT_CATALOG_STATE, set: 'x', price: '10-50' })).toBe(2);
  });
});

describe('price sorting', () => {
  it('keeps unpriced cards last in both directions', () => {
    const cards = [
      card('none'),
      card('cheap', { marketPrice: 2 }),
      card('dear', { marketPrice: 90 }),
    ];
    expect(sortCards(cards, 'price-low').map((c) => c.id)).toEqual(['cheap', 'dear', 'none']);
    expect(sortCards(cards, 'price-high').map((c) => c.id)).toEqual(['dear', 'cheap', 'none']);
  });
});
