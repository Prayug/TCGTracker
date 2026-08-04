import { describe, expect, it } from 'vitest';
import { scoreLiquidity, filterByMinLiquidity } from '../liquidityScore';

describe('scoreLiquidity', () => {
  it('scores verified liquid comps as strong', () => {
    const r = scoreLiquidity({
      soldListings: 60,
      verified: true,
      stale: false,
      ageHours: 1,
      matchScore: 0.95,
      historyPoints: 90,
    });
    expect(r.score).toBeGreaterThanOrEqual(70);
    expect(r.tier).toBe('strong');
  });

  it('flags thin / illiquid quotes', () => {
    const r = scoreLiquidity({
      soldListings: 0,
      verified: false,
      stale: true,
      ageHours: 48,
      historyPoints: 0,
    });
    expect(r.score).toBeLessThan(25);
    expect(r.tier).toBe('illiquid');
  });

  it('filterByMinLiquidity falls back when none qualify', () => {
    const rows = [
      { id: 'a', liquidityScore: 10 },
      { id: 'b', liquidityScore: 20 },
    ];
    expect(filterByMinLiquidity(rows, 45)).toEqual(rows);
    expect(filterByMinLiquidity([{ id: 'c', liquidityScore: 80 }, ...rows], 45)).toEqual([
      { id: 'c', liquidityScore: 80 },
    ]);
  });
});
