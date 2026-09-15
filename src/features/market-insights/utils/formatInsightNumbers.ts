/** Format 0–100 insight scores (confidence, risk, liquidity) for display. */
export function formatInsightScore(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

/** Round a score for bar widths / numeric comparisons after display formatting. */
export function insightScoreValue(value: number | null | undefined): number {
  if (value == null || !Number.isFinite(value)) return 0;
  return Math.round(value * 10) / 10;
}
