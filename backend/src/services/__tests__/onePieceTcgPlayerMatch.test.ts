import { describe, it, expect } from '@jest/globals';
import {
  pickBestListing,
  MIN_TCG_LISTING_SCORE,
  TcgPlayerListing,
} from '../providers/onePieceTcgPlayerProvider';

function listing(
  partial: Omit<TcgPlayerListing, 'cardNumber'> & { cardNumber?: string }
): TcgPlayerListing {
  return {
    cardNumber: partial.cardNumber ?? 'OP13-120',
    productId: partial.productId,
    name: partial.name,
    marketPrice: partial.marketPrice,
    lowPrice: partial.lowPrice,
  };
}

describe('onePiece TCGPlayer variant matching', () => {
  it('does not match Sabo (SP) to Red Super Alternate Art', () => {
    const best = pickBestListing(
      [
        listing({
          productId: 657411,
          name: 'Sabo (120) (Red Super Alternate Art)',
          marketPrice: 4800,
          lowPrice: 4300,
        }),
      ],
      'Sabo (120) (SP)',
      'OP13-120'
    );
    expect(best).toBeNull();
  });

  it('matches Red Super Alt Art to the red listing', () => {
    const best = pickBestListing(
      [
        listing({
          productId: 657412,
          name: 'Sabo (120) (Super Alternate Art)',
          marketPrice: 750,
          lowPrice: 700,
        }),
        listing({
          productId: 657411,
          name: 'Sabo (120) (Red Super Alternate Art)',
          marketPrice: 4800,
          lowPrice: 4300,
        }),
      ],
      'Sabo (120) (Red Super Alternate Art)',
      'OP13-120_p3'
    );
    expect(best?.productId).toBe(657411);
    expect(best?.marketPrice).toBe(4800);
  });

  it('does not jackpot on highest price when variants are absent', () => {
    const best = pickBestListing(
      [
        listing({
          productId: 1,
          name: 'Sabo (120) (Red Super Alternate Art)',
          marketPrice: 4800,
          lowPrice: null,
        }),
        listing({
          productId: 2,
          name: 'Sabo (120)',
          marketPrice: 30,
          lowPrice: null,
        }),
      ],
      'Sabo (120)',
      'OP13-120'
    );
    expect(best?.productId).toBe(2);
  });

  it('exposes a minimum acceptance score', () => {
    expect(MIN_TCG_LISTING_SCORE).toBeGreaterThan(0);
  });
});
