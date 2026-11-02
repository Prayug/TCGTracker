import { describe, expect, it } from 'vitest';
import { squarify } from '../squarify';

describe('squarify', () => {
  it('fills the bounds with areas proportional to the values', () => {
    const rects = squarify([6, 6, 4, 3, 2, 2, 1], { x: 0, y: 0, w: 6, h: 4 });
    const areas = rects.map((r) => r.w * r.h);
    expect(areas.reduce((a, b) => a + b, 0)).toBeCloseTo(24);
    expect(areas[0]).toBeCloseTo(6);
    expect(areas[6]).toBeCloseTo(1);
    for (const r of rects) {
      expect(r.x).toBeGreaterThanOrEqual(-1e-9);
      expect(r.y).toBeGreaterThanOrEqual(-1e-9);
      expect(r.x + r.w).toBeLessThanOrEqual(6 + 1e-9);
      expect(r.y + r.h).toBeLessThanOrEqual(4 + 1e-9);
    }
  });

  it('gives empty rects to zero values and keeps input order', () => {
    const rects = squarify([0, 5, 5], { x: 0, y: 0, w: 10, h: 1 });
    expect(rects[0].w * rects[0].h).toBe(0);
    expect(rects[1].w * rects[1].h).toBeCloseTo(5);
  });
});
