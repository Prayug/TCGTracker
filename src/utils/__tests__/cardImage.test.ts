import { describe, expect, it } from 'vitest';
import { cardImageCandidates, ptcgImagesForId } from '../cardImage';

describe('ptcgImagesForId', () => {
  it('derives the exact image path from a Pokémon TCG id', () => {
    expect(ptcgImagesForId('swsh7-215')).toEqual({
      small: 'https://images.pokemontcg.io/swsh7/215.png',
      large: 'https://images.pokemontcg.io/swsh7/215_hires.png',
    });
    expect(ptcgImagesForId('swsh12pt5gg-GG44')?.small).toBe(
      'https://images.pokemontcg.io/swsh12pt5gg/GG44.png'
    );
    expect(ptcgImagesForId('sv3pt5-199')?.small).toBe(
      'https://images.pokemontcg.io/sv3pt5/199.png'
    );
  });

  it('refuses ids that are not Pokémon TCG ids', () => {
    expect(ptcgImagesForId('OP01-001')).toBeNull();
    expect(ptcgImagesForId('12345')).toBeNull();
    expect(ptcgImagesForId('Charizard')).toBeNull();
    expect(ptcgImagesForId('')).toBeNull();
  });
});

describe('cardImageCandidates', () => {
  it('tries the card’s own art first, proxied then direct, then the id-derived path', () => {
    const c = cardImageCandidates({
      id: 'base1-4',
      images: { small: 'https://images.pokemontcg.io/base1/4.png' },
    });
    expect(c[0]).toBe('/images/pokemontcg/base1/4.png');
    expect(c[1]).toBe('https://images.pokemontcg.io/base1/4.png');
    expect(c).toContain('/images/pokemontcg/base1/4_hires.png');
    expect(new Set(c).size).toBe(c.length);
  });

  it('prefers the large image for large frames', () => {
    const c = cardImageCandidates(
      { id: 'base1-4', images: { small: 'https://x/s.png', large: 'https://x/l.png' } },
      'large'
    );
    expect(c[0]).toBe('https://x/l.png');
  });

  it('never invents art for a card with no images and a non-PTCG id', () => {
    expect(cardImageCandidates({ id: 'OP01-001', images: null })).toEqual([]);
  });

  it('skips card backs', () => {
    const c = cardImageCandidates({ images: { small: 'https://x/cardback.png' } }, 'small', (u) =>
      /cardback/.test(u)
    );
    expect(c).toEqual([]);
  });

  it('adds the TCGplayer product image for product-backed cards', () => {
    const c = cardImageCandidates({ id: 'tcgcsv-512345', images: {} });
    expect(c[0]).toBe('https://product-images.tcgplayer.com/fit-in/437x437/512345.jpg');
    expect(c).toHaveLength(2);
  });
});
