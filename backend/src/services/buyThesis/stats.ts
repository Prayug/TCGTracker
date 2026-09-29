/**
 * Robust statistics helpers for buy thesis (medians, trimmed means, percentiles).
 */

export function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}

export function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const idx = clamp(p, 0, 1) * (s.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return s[lo];
  return s[lo] + (s[hi] - s[lo]) * (idx - lo);
}

/** Trim fraction from each tail (e.g. 0.1 = 10% each side). */
export function trimmedMean(values: number[], trimFraction = 0.1): number | null {
  if (values.length === 0) return null;
  if (values.length < 5) {
    return values.reduce((a, b) => a + b, 0) / values.length;
  }
  const s = [...values].sort((a, b) => a - b);
  const drop = Math.floor(s.length * clamp(trimFraction, 0, 0.4));
  const slice = s.slice(drop, s.length - drop || undefined);
  if (slice.length === 0) return median(values);
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

export function mad(values: number[]): number | null {
  const med = median(values);
  if (med == null) return null;
  const deviations = values.map((v) => Math.abs(v - med));
  return median(deviations);
}

/** Robust z-score using median absolute deviation. */
export function robustZ(value: number, values: number[]): number | null {
  const med = median(values);
  const m = mad(values);
  if (med == null || m == null || m === 0) return null;
  return (value - med) / (1.4826 * m);
}

export function daysBetween(a: string, b: string): number {
  const da = new Date(a.includes('T') ? a : `${a}T00:00:00Z`).getTime();
  const db = new Date(b.includes('T') ? b : `${b}T00:00:00Z`).getTime();
  return Math.round((db - da) / 86_400_000);
}
