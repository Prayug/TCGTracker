import { describe, expect, it } from 'vitest';
import { getBrowsePriceMove } from '../cardPrice';
import type { PokemonCard } from '../../types/pokemon';

function card(overrides: Partial<PokemonCard> = {}): PokemonCard {
  return {
    id: 'xy6-98',
    name: 'M Rayquaza-EX',
    images: { small: '', large: '' },
    set: { id: 'xy6', name: 'Roaring Skies', releaseDate: '2015-05-06', total: 108 },
    number: '98',
    types: ['Dragon'],
    ...overrides,
  };
}

describe('getBrowsePriceMove', () => {
  it('prefers 30d cardmarket movement', () => {
    const move = getBrowsePriceMove(
      card({
        cardmarket: { prices: { trendPrice: 450, avg30: 323, avg7: 400 } },
      })
    );
    expect(move?.window).toBe('30D');
    expect(move?.percent).toBeCloseTo(((450 - 323) / 323) * 100, 1);
  });

  it('falls back to 7d when 30d is missing', () => {
    const move = getBrowsePriceMove(
      card({
        cardmarket: { prices: { trendPrice: 110, avg7: 100 } },
      })
    );
    expect(move).toEqual({ percent: 10, window: '7D' });
  });

  it('returns null without usable averages', () => {
    expect(getBrowsePriceMove(card())).toBeNull();
  });
});
