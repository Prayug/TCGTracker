/**
 * Slab liquidity / comps thinness score (0–100).
 * High premium % with thin comps is a dangerous signal — soft-filter with this.
 */

export interface LiquidityInputs {
  soldListings?: number | null;
  verified?: boolean | null;
  stale?: boolean | null;
  ageHours?: number | null;
  matchScore?: number | null;
  /** Distinct graded_price_history dates for this grader/grade (optional). */
  historyPoints?: number | null;
}

export type LiquidityTier = 'strong' | 'ok' | 'thin' | 'illiquid';

export interface LiquidityResult {
  score: number;
  tier: LiquidityTier;
  label: string;
}

export function scoreLiquidity(input: LiquidityInputs): LiquidityResult {
  const comps = Math.max(0, Number(input.soldListings) || 0);
  const historyPoints = Math.max(0, Number(input.historyPoints) || 0);
  const matchScore =
    input.matchScore != null && Number.isFinite(input.matchScore)
      ? Math.max(0, Math.min(1, Number(input.matchScore)))
      : null;

  // Comps density (0–45)
  let compsPts = 0;
  if (comps >= 50) compsPts = 45;
  else if (comps >= 20) compsPts = 35;
  else if (comps >= 8) compsPts = 25;
  else if (comps >= 3) compsPts = 15;
  else if (comps >= 1) compsPts = 8;

  // History density (0–25)
  let histPts = 0;
  if (historyPoints >= 60) histPts = 25;
  else if (historyPoints >= 30) histPts = 20;
  else if (historyPoints >= 14) histPts = 14;
  else if (historyPoints >= 7) histPts = 8;
  else if (historyPoints >= 2) histPts = 4;

  // Match / verification (0–20)
  let trustPts = 0;
  if (input.verified === true) trustPts += 12;
  else if (input.verified === false) trustPts += 2;
  else trustPts += 6;
  if (matchScore != null) trustPts += Math.round(matchScore * 8);

  // Freshness (0–10)
  let freshPts = 10;
  if (input.stale === true) freshPts = 2;
  else if (input.ageHours != null && input.ageHours >= 6) freshPts = 6;

  const score = Math.max(0, Math.min(100, Math.round(compsPts + histPts + trustPts + freshPts)));
  let tier: LiquidityTier;
  if (score >= 70) tier = 'strong';
  else if (score >= 45) tier = 'ok';
  else if (score >= 25) tier = 'thin';
  else tier = 'illiquid';

  const label =
    tier === 'strong'
      ? 'Liquid'
      : tier === 'ok'
        ? 'Tradeable'
        : tier === 'thin'
          ? 'Thin comps'
          : 'Illiquid';

  return { score, tier, label };
}

/** Soft-filter helper: keep rows that meet minimum liquidity unless none qualify. */
export function filterByMinLiquidity<T extends { liquidityScore?: number | null }>(
  rows: T[],
  minScore: number
): T[] {
  const kept = rows.filter((r) => (r.liquidityScore ?? 0) >= minScore);
  return kept.length > 0 ? kept : rows;
}
