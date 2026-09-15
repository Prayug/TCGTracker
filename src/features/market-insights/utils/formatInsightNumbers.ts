/** Format 0–100 insight scores (confidence, risk, liquidity) as whole numbers. */
export function formatInsightScore(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return String(Math.round(value));
}

/** Round a score for bar widths / numeric comparisons after display formatting. */
export function insightScoreValue(value: number | null | undefined): number {
  if (value == null || !Number.isFinite(value)) return 0;
  return Math.round(value);
}
