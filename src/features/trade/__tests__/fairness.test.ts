import { describe, expect, it } from 'vitest';
import { effectiveUnitPrice, evaluateTrade, evenOut, FAIR_PCT, unpricedCount } from '../fairness';

describe('effectiveUnitPrice', () => {
  it('prefers a positive override over market', () => {
    expect(effectiveUnitPrice(12, 20)).toBe(20);
  });

  it('falls back to market and ignores junk', () => {
    expect(effectiveUnitPrice(12, 0)).toBe(12);
    expect(effectiveUnitPrice(0, null)).toBeNull();
    expect(effectiveUnitPrice(null, undefined)).toBeNull();
  });
});

describe('evaluateTrade', () => {
  it('marks an empty board', () => {
    const result = evaluateTrade({ give: [], get: [] });
    expect(result.kind).toBe('empty');
    expect(result.delta).toBe(0);
  });

  it('treats even sides as fair', () => {
    const result = evaluateTrade({
      give: [{ unitPrice: 100, quantity: 1 }],
      get: [{ unitPrice: 98, quantity: 1 }],
    });
    expect(result.kind).toBe('fair');
    expect(result.favors).toBe('even');
    expect(Math.abs(result.imbalancePct)).toBeLessThanOrEqual(FAIR_PCT);
  });

  it('flags a slight lean toward you', () => {
    const result = evaluateTrade({
      give: [{ unitPrice: 100, quantity: 1 }],
      get: [{ unitPrice: 110, quantity: 1 }],
    });
    expect(result.kind).toBe('slight_you');
    expect(result.favors).toBe('you');
  });

  it('flags an unbalanced give', () => {
    const result = evaluateTrade({
      give: [{ unitPrice: 200, quantity: 1 }],
      get: [{ unitPrice: 50, quantity: 1 }],
    });
    expect(result.kind).toBe('leans_them');
    expect(result.delta).toBe(-150);
  });

  it('adds cash to the side totals', () => {
    const result = evaluateTrade({
      give: [{ unitPrice: 100, quantity: 1 }],
      get: [{ unitPrice: 80, quantity: 1 }],
      cashGet: 20,
    });
    expect(result.get.value).toBe(100);
    expect(result.kind).toBe('fair');
  });

  it('counts qty and skips missing prices', () => {
    const result = evaluateTrade({
      give: [
        { unitPrice: 10, quantity: 2 },
        { unitPrice: null, quantity: 1 },
      ],
      get: [{ unitPrice: 20, quantity: 1 }],
    });
    expect(result.give.value).toBe(20);
    expect(result.give.missing).toBe(1);
    expect(result.kind).toBe('fair');
  });

  it('is incomplete when every card lacks a price', () => {
    const result = evaluateTrade({
      give: [{ unitPrice: null, quantity: 1 }],
      get: [{ unitPrice: 0, quantity: 1 }],
    });
    expect(result.kind).toBe('incomplete');
  });
});

describe('evenOut', () => {
  it('asks the side receiving more to add the difference', () => {
    const e = evaluateTrade({
      give: [{ quantity: 1, unitPrice: 100 }],
      get: [{ quantity: 1, unitPrice: 130 }],
    });
    expect(evenOut(e)).toEqual({ payer: 'you', amount: 30 });
    const f = evaluateTrade({
      give: [{ quantity: 1, unitPrice: 130 }],
      get: [{ quantity: 1, unitPrice: 100 }],
    });
    expect(evenOut(f)).toEqual({ payer: 'them', amount: 30 });
  });
  it('suggests nothing when level or when nothing is priced', () => {
    expect(
      evenOut(
        evaluateTrade({
          give: [{ quantity: 1, unitPrice: 10 }],
          get: [{ quantity: 1, unitPrice: 10 }],
        })
      )
    ).toBeNull();
    expect(
      evenOut(evaluateTrade({ give: [{ quantity: 1, unitPrice: null }], get: [] }))
    ).toBeNull();
    expect(evenOut(evaluateTrade({ give: [], get: [] }))).toBeNull();
  });
  it('counts unpriced cards on both sides', () => {
    const e = evaluateTrade({
      give: [
        { quantity: 1, unitPrice: null },
        { quantity: 1, unitPrice: 5 },
      ],
      get: [{ quantity: 2, unitPrice: null }],
    });
    expect(unpricedCount(e)).toBe(2);
  });
});
