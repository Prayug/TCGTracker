import { describe, expect, it } from 'vitest';
import type { VaultCard } from '../../types/pokemon';
import { allocateBy, byEraWith, resolveEra, setIdOf } from '../portfolio';

function h(
  cardId: string,
  set: Partial<{ id: string; name: string; releaseDate: string }> | null,
  market = 10
): VaultCard {
  return {
    id: cardId,
    purchasePrice: 0,
    purchaseDate: '2024-01-01',
    quantity: 1,
    condition: 'raw',
    card: {
      id: cardId,
      name: cardId,
      images: { small: '', large: '' },
      set: set
        ? ({ id: '', name: '', releaseDate: '', total: 0, ...set } as VaultCard['card']['set'])
        : (undefined as unknown as VaultCard['card']['set']),
      number: '1',
      marketPrice: market,
    },
  } as VaultCard;
}

describe('resolveEra', () => {
  it('uses the card’s own release date first', () => {
    expect(resolveEra(h('swsh7-215', { id: 'swsh7', releaseDate: '2021/08/27' }))).toMatchObject({
      era: 'Modern',
      basis: 'card',
    });
  });

  it('falls back to the set catalog date for the set id', () => {
    const dates = new Map([['ex1', '2003/06/18']]);
    expect(resolveEra(h('ex1-5', { id: 'ex1' }), dates)).toMatchObject({
      era: 'Vintage',
      basis: 'catalog',
    });
  });

  it('uses the series only where the whole series sits in one band', () => {
    expect(resolveEra(h('base1-4', { id: 'base1' }))).toMatchObject({
      era: 'Vintage',
      basis: 'series',
    });
    expect(resolveEra(h('sv3pt5-199', { id: 'sv3pt5' }))).toMatchObject({
      era: 'Modern',
      basis: 'series',
    });
    expect(resolveEra(h('xy12-1', { id: 'xy12' }))).toMatchObject({
      era: 'Mid-era',
      basis: 'series',
    });
  });

  it('keeps EX unknown without a real date, since EX spans 2003 and later', () => {
    expect(resolveEra(h('ex1-5', { id: 'ex1' }))).toMatchObject({ era: 'Unknown', basis: 'none' });
  });

  it('derives the set id from a Pokémon TCG card id when the set is missing', () => {
    expect(setIdOf(h('neo1-9', null))).toBe('neo1');
    expect(resolveEra(h('neo1-9', null)).era).toBe('Vintage');
  });

  it('leaves genuinely unidentifiable holdings unknown', () => {
    expect(resolveEra(h('custom-thing', { name: 'My binder' }))).toMatchObject({
      era: 'Unknown',
      basis: 'none',
    });
  });
});

describe('byEraWith allocation', () => {
  it('turns a mostly-Unknown vault into real era shares', () => {
    const cards = [
      h('base1-4', { id: 'base1' }, 400),
      h('swsh7-215', { id: 'swsh7' }, 1600),
      h('xy1-1', { id: 'xy1' }, 50),
    ];
    const slices = allocateBy(cards, byEraWith(new Map()), 6);
    expect(slices.find((s) => s.key === 'Unknown')).toBeUndefined();
    expect(slices.map((s) => s.key)).toEqual(['Modern', 'Vintage', 'Mid-era']);
  });
});

describe('eraCoverage', () => {
  it('counts how each era was decided and lists the holdings still unknown', async () => {
    const { eraCoverage } = await import('../portfolio');
    const mk = (id: string, set: Record<string, unknown> | undefined, market = 10) =>
      ({
        id,
        card: { id, name: id, set, tcgplayer: { prices: { normal: { market } } } },
        quantity: 1,
        purchasePrice: 0,
        condition: 'raw',
        purchaseDate: '2024-01-01',
      }) as unknown as import('../../types/pokemon').VaultCard;
    const cov = eraCoverage(
      [
        mk('base1-4', { id: 'base1', releaseDate: '1999/01/09' }),
        mk('sv3-1', { id: 'sv3' }),
        mk('ex5-1', { id: 'ex5' }),
        mk('mystery', { name: 'Promo binder' }, 50),
        mk('mystery2', undefined, 5),
      ],
      new Map([['sv3', '2023/08/11']])
    );
    expect(cov.byBasis).toEqual({ card: 1, catalog: 1, series: 0, none: 3 });
    expect(cov.unknown.map((v) => v.id)).toEqual(['mystery', 'ex5-1', 'mystery2']);
  });
});
