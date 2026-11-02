/** A rectangle in the unit space the treemap lays out into. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Squarified treemap layout (Bruls, Huizing, van Wijk). Returns one rect per
 * input value, in input order, filling `bounds` exactly. Zero and negative
 * values get an empty rect so the caller can skip them.
 */
export function squarify(values: number[], bounds: Rect): Rect[] {
  const out: Rect[] = values.map(() => ({ x: bounds.x, y: bounds.y, w: 0, h: 0 }));
  const total = values.reduce((s, v) => s + Math.max(0, v), 0);
  if (total <= 0 || bounds.w <= 0 || bounds.h <= 0) return out;
  const scale = (bounds.w * bounds.h) / total;
  const items = values
    .map((v, i) => ({ i, a: Math.max(0, v) * scale }))
    .filter((d) => d.a > 0)
    .sort((a, b) => b.a - a.a);

  let free = { ...bounds };
  let row: typeof items = [];

  const worst = (r: typeof items, side: number) => {
    const s = r.reduce((t, d) => t + d.a, 0);
    let max = 0;
    let min = Infinity;
    for (const d of r) {
      max = Math.max(max, d.a);
      min = Math.min(min, d.a);
    }
    return Math.max((side * side * max) / (s * s), (s * s) / (side * side * min));
  };

  const layoutRow = (r: typeof items) => {
    const s = r.reduce((t, d) => t + d.a, 0);
    const horizontal = free.w >= free.h; // lay the row along the short side
    if (horizontal) {
      const w = s / free.h;
      let y = free.y;
      for (const d of r) {
        const h = d.a / w;
        out[d.i] = { x: free.x, y, w, h };
        y += h;
      }
      free = { x: free.x + w, y: free.y, w: free.w - w, h: free.h };
    } else {
      const h = s / free.w;
      let x = free.x;
      for (const d of r) {
        const w = d.a / h;
        out[d.i] = { x, y: free.y, w, h };
        x += w;
      }
      free = { x: free.x, y: free.y + h, w: free.w, h: free.h - h };
    }
  };

  for (const d of items) {
    const side = Math.min(free.w, free.h);
    if (row.length === 0 || worst([...row, d], side) <= worst(row, side)) {
      row.push(d);
    } else {
      layoutRow(row);
      row = [d];
    }
  }
  if (row.length) layoutRow(row);
  return out;
}
