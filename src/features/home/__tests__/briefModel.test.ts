import { describe, it, expect } from 'vitest';
import { moveOver, partOfDay } from '../briefModel';

const day = (n: number) => new Date(Date.UTC(2026, 10, n)).toISOString().slice(0, 10);

describe('moveOver', () => {
  it('measures from the last point at or before the window start', () => {
    const h = [
      { date: day(1), price: 80 },
      { date: day(10), price: 100 },
      { date: day(14), price: 105 },
      { date: day(17), price: 110 },
    ];
    const m = moveOver(h, 7)!;
    expect(m.then).toBe(100);
    expect(m.now).toBe(110);
    expect(m.pct).toBeCloseTo(10);
    expect(m.series).toEqual([100, 105, 110]);
  });
  it('returns null when history is too short or unpriced', () => {
    expect(
      moveOver(
        [
          { date: day(15), price: 10 },
          { date: day(17), price: 12 },
        ],
        7
      )
    ).toBeNull();
    expect(moveOver([{ date: day(1), price: 0 }], 7)).toBeNull();
  });
});

describe('partOfDay', () => {
  it('buckets hours', () => {
    expect(partOfDay(new Date(2026, 0, 1, 8))).toBe('morning');
    expect(partOfDay(new Date(2026, 0, 1, 13))).toBe('afternoon');
    expect(partOfDay(new Date(2026, 0, 1, 21))).toBe('evening');
  });
});
