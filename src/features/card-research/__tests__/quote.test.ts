import { describe, expect, it } from 'vitest';
import { figuresDisagree, resolveQuote } from '../quote';

const now = new Date('2026-11-01T12:00:00Z');

describe('resolveQuote', () => {
  it('prefers the latest dated observation for the finish', () => {
    const q = resolveQuote({
      history: [
        { date: '2026-10-20', price: 10 },
        { date: '2026-10-30', price: 12 },
      ],
      finishMarket: 11,
      catalogPrice: 40,
      finishLabel: 'Holofoil',
      isOnePiece: false,
      now,
    });
    expect(q.value).toBe(12);
    expect(q.asOf).toBe('2026-10-30');
    expect(q.stale).toBe(false);
    expect(q.detail).toContain('Holofoil');
  });

  it('falls back to the finish market price when the series is stale', () => {
    const q = resolveQuote({
      history: [{ date: '2026-06-01', price: 10 }],
      finishMarket: 15,
      catalogPrice: null,
      finishLabel: 'Normal',
      isOnePiece: false,
      now,
    });
    expect(q.value).toBe(15);
  });

  it('labels a stale series as stale when nothing fresher exists', () => {
    const q = resolveQuote({
      history: [{ date: '2026-06-01', price: 10 }],
      finishMarket: null,
      catalogPrice: null,
      finishLabel: 'Normal',
      isOnePiece: false,
      now,
    });
    expect(q.value).toBe(10);
    expect(q.stale).toBe(true);
  });

  it('marks a catalog-only price as finish-unspecified', () => {
    const q = resolveQuote({
      history: [],
      finishMarket: null,
      catalogPrice: 27500,
      finishLabel: 'Holofoil',
      isOnePiece: false,
      now,
    });
    expect(q.source).toBe('Catalog snapshot');
    expect(q.detail).toBe('finish not specified');
  });

  it('returns null rather than zero when no price exists', () => {
    const q = resolveQuote({
      history: [],
      finishMarket: null,
      catalogPrice: 0,
      finishLabel: 'Normal',
      isOnePiece: false,
      now,
    });
    expect(q.value).toBeNull();
  });
});

describe('figuresDisagree', () => {
  it('flags the $27,500 vs ~$4,000 case', () => {
    expect(figuresDisagree(27500, 4000)).toBe(true);
  });
  it('accepts figures within tolerance', () => {
    expect(figuresDisagree(110, 100)).toBe(false);
  });
  it('ignores missing figures', () => {
    expect(figuresDisagree(null, 100)).toBe(false);
  });
});
