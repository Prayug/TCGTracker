import { describe, expect, it } from 'vitest';
import { treemap } from '../portfolio';

describe('treemap', () => {
  it('fills the box exactly, with each tile proportional to its value', () => {
    const tiles = treemap(
      [6, 6, 4, 3, 2, 2, 1].map((v, i) => ({ item: i, value: v })),
      600,
      400
    );
    expect(tiles).toHaveLength(7);
    const area = tiles.reduce((s, t) => s + t.w * t.h, 0);
    expect(area).toBeCloseTo(600 * 400, 3);
    for (const t of tiles) {
      expect(t.w * t.h).toBeCloseTo((t.value / 24) * 600 * 400, 3);
      expect(t.x).toBeGreaterThanOrEqual(-1e-6);
      expect(t.y).toBeGreaterThanOrEqual(-1e-6);
      expect(t.x + t.w).toBeLessThanOrEqual(600 + 1e-6);
      expect(t.y + t.h).toBeLessThanOrEqual(400 + 1e-6);
    }
  });

  it('leaves out zero and missing values instead of drawing them', () => {
    expect(treemap([{ item: 'a', value: 0 }], 100, 100)).toEqual([]);
    expect(
      treemap(
        [
          { item: 'a', value: 5 },
          { item: 'b', value: 0 },
        ],
        100,
        100
      )
    ).toHaveLength(1);
  });
});
