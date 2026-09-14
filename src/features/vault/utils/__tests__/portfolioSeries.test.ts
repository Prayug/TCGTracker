import { describe, expect, it } from 'vitest';
import { periodChangeExcludingInflows } from '../portfolioSeries';
import type { VaultCard } from '../../../../types/pokemon';

function vaultCard(partial: {
  id: string;
  purchaseDate: string;
  purchasePrice: number;
  market: number;
  quantity?: number;
}): VaultCard {
  return {
    id: partial.id,
    quantity: partial.quantity ?? 1,
    purchaseDate: partial.purchaseDate,
    purchasePrice: partial.purchasePrice,
    addedDate: partial.purchaseDate,
    card: {
      id: partial.id,
      name: partial.id,
      number: '1',
      rarity: 'Rare',
      set: { id: 'base1', name: 'Base', series: 'Base', releaseDate: '1999/01/01' },
      images: { small: '', large: '' },
      tcgplayer: {
        url: '',
        updatedAt: '',
        prices: { normal: { market: partial.market } },
      },
    },
  } as VaultCard;
}

describe('periodChangeExcludingInflows', () => {
  it('does not treat a newly funded vault as a full portfolio market gain', () => {
    const today = new Date();
    const recent = new Date(today);
    recent.setDate(recent.getDate() - 3);
    const cards = [
      vaultCard({
        id: 'new-1',
        purchaseDate: recent.toISOString(),
        purchasePrice: 100,
        market: 150,
      }),
    ];
    const result = periodChangeExcludingInflows(cards, '30d');
    expect(result.sinceAddedOnly).toBe(true);
    expect(result.dollar).toBeCloseTo(50);
    expect(result.percent).toBeCloseTo(50);
  });

  it('excludes aged holdings from invented 30d moves when history is unavailable', () => {
    const today = new Date();
    const old = new Date(today);
    old.setDate(old.getDate() - 120);
    const recent = new Date(today);
    recent.setDate(recent.getDate() - 2);
    const cards = [
      vaultCard({
        id: 'old-1',
        purchaseDate: old.toISOString(),
        purchasePrice: 40,
        market: 200,
      }),
      vaultCard({
        id: 'new-1',
        purchaseDate: recent.toISOString(),
        purchasePrice: 50,
        market: 60,
      }),
    ];
    const result = periodChangeExcludingInflows(cards, '30d');
    expect(result.sinceAddedOnly).toBe(false);
    // Old card contributes $0 estimated period move; new card +$10
    expect(result.dollar).toBeCloseTo(10);
    // start = aged market ($200) + new cost ($50)
    expect(result.percent).toBeCloseTo((10 / 250) * 100);
  });
});
