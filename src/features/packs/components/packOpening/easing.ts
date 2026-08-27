export function easeOutCubic(t: number) {
  return 1 - Math.pow(1 - t, 3);
}

export function easeOutBack(t: number) {
  const c1 = 1.35; const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

export function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export function clamp01(t: number) {
  return Math.min(1, Math.max(0, t));
}

export function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}
