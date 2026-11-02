import { describe, expect, it } from 'vitest';
import type { VaultCard } from '../../types/pokemon';
import { allocateBy, bySet, concentration, eraOfRelease, summarizePortfolio } from '../portfolio';
import { hasKnownCost, normalizePurchasePrice } from '../vaultCost';

function holding(p: {
  id: string;
  price?: number;
  market: number;
  qty?: number;
  costKnown?: boolean;
  set?: string;
}): VaultCard {
  return {
    id: p.id,
    purchasePrice: p.price ?? 0,
    costKnown: p.costKnown,
    purchaseDate: new Date().toISOString(),
    quantity: p.qty ?? 1,
    condition: 'raw',
    card: {
      id: `card-${p.id}`,
      name: p.id,
      images: { small: '', large: '' },
      set: { id: p.set ?? 's1', name: p.set ?? 'Set One', releaseDate: '2021/01/01', total: 100 },
      number: '1',
      marketPrice: p.market,
    },
  } as VaultCard;
}

describe('cost basis rules', () => {
  it('treats a blank cost as unknown instead of market', () => {
    expect(normalizePurchasePrice(null)).toEqual({ purchasePrice: 0, costKnown: false });
    expect(normalizePurchasePrice(Number.NaN)).toEqual({ purchasePrice: 0, costKnown: false });
  });

  it('keeps a deliberate zero cost as known', () => {
    expect(normalizePurchasePrice(0)).toEqual({ purchasePrice: 0, costKnown: true });
    expect(hasKnownCost(holding({ id: 'a', price: 0, market: 10, costKnown: true }))).toBe(true);
  });

  it('keeps legacy prices without the flag but does not count them as recorded', () => {
    // Older imports filled cost from market, so an unflagged price is unconfirmed.
    expect(hasKnownCost(holding({ id: 'a', price: 5, market: 10 }))).toBe(false);
    expect(hasKnownCost(holding({ id: 'a2', price: 5, market: 10, costKnown: true }))).toBe(true);
    expect(hasKnownCost(holding({ id: 'b', price: 0, market: 10 }))).toBe(false);
  });
});

describe('summarizePortfolio', () => {
  it('computes P/L only over holdings with a known cost', () => {
    const s = summarizePortfolio([
      holding({ id: 'known', price: 50, market: 80, costKnown: true }),
      holding({ id: 'unknown', market: 200, costKnown: false }),
    ]);
    expect(s.marketValue).toBe(280);
    expect(s.unrealized).toBe(30);
    expect(s.unrealizedPct).toBeCloseTo(60);
    expect(s.missingCostEntries).toBe(1);
    expect(s.costCoverage).toBeCloseTo(80 / 280);
  });

  it('returns null P/L when no holding has a known cost', () => {
    const s = summarizePortfolio([holding({ id: 'u', market: 20, costKnown: false })]);
    expect(s.unrealized).toBeNull();
    expect(s.unrealizedPct).toBeNull();
  });

  it('does not count unpriced holdings as $0 value', () => {
    const s = summarizePortfolio([
      holding({ id: 'p', price: 10, market: 0, costKnown: true }),
      holding({ id: 'q', price: 10, market: 15, costKnown: true, qty: 2 }),
    ]);
    expect(s.unpricedEntries).toBe(1);
    expect(s.marketValue).toBe(30);
    // The unpriced holding is excluded from P/L, not counted as a $10 loss.
    expect(s.unrealized).toBe(10);
    expect(s.copies).toBe(3);
  });
});

describe('allocation', () => {
  it('folds the long tail into one row and shares sum to 1', () => {
    const cards = Array.from({ length: 9 }, (_, i) =>
      holding({ id: `h${i}`, price: 1, market: 10 + i, costKnown: true, set: `Set ${i}` })
    );
    const slices = allocateBy(cards, bySet, 4);
    expect(slices).toHaveLength(5);
    expect(slices[4].key).toBe('__other');
    expect(slices.reduce((s, x) => s + x.share, 0)).toBeCloseTo(1);
  });

  it('measures top-N concentration', () => {
    const cards = [holding({ id: 'big', market: 90 }), holding({ id: 'small', market: 10 })];
    expect(concentration(cards, 1)).toBeCloseTo(0.9);
  });

  it('bands eras by release year', () => {
    expect(eraOfRelease('1999/01/09')).toBe('Vintage');
    expect(eraOfRelease('2012-05-01')).toBe('Mid-era');
    expect(eraOfRelease('2023/03/31')).toBe('Modern');
    expect(eraOfRelease('')).toBe('Unknown');
  });
});

describe('cost status', () => {
  const base = {
    id: 'x',
    purchaseDate: '2024-01-01',
    quantity: 1,
    condition: 'raw',
    card: {
      id: 'base1-4',
      name: 'Charizard',
      images: { small: '', large: '' },
      set: { id: 'base1', name: 'Base', releaseDate: '1999/01/09', total: 102 },
      number: '4',
      marketPrice: 420,
    },
  };
  it('treats a legacy cost without a flag as unverified, not as a $0 gain', async () => {
    const { costStatus, knownHoldingProfit } = await import('../vaultCost');
    const vc = { ...base, purchasePrice: 420 } as unknown as VaultCard;
    expect(costStatus(vc)).toBe('unverified');
    expect(knownHoldingProfit(vc)).toBeNull();
  });
  it('keeps a typed or confirmed cost recorded even when it equals market', async () => {
    const { costStatus } = await import('../vaultCost');
    expect(
      costStatus({ ...base, purchasePrice: 420, costKnown: true } as unknown as VaultCard)
    ).toBe('recorded');
    // A legacy price that differs from market is still unconfirmed: it may be a past market fill.
    expect(costStatus({ ...base, purchasePrice: 300 } as unknown as VaultCard)).toBe('unverified');
    expect(
      costStatus({ ...base, purchasePrice: 0, costKnown: false } as unknown as VaultCard)
    ).toBe('unknown');
  });
  it('leaves unverified costs out of the cost coverage of the summary', () => {
    const s = summarizePortfolio([
      { ...base, id: 'a', purchasePrice: 420 } as unknown as VaultCard,
      { ...base, id: 'b', purchasePrice: 100, costKnown: true } as unknown as VaultCard,
    ]);
    expect(s.costKnownCount).toBe(1);
  });
});
