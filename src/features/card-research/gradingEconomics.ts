/**
 * Grading economics: pure arithmetic, no invented probabilities.
 *
 * All money in USD. `sellerFeePct` is a fraction (0.1325 = 13.25%).
 */
export interface GradingAssumptions {
  /** What the raw copy cost you (or would cost to buy). */
  acquisition: number;
  gradingFee: number;
  /** Round-trip shipping + insurance to the grader. */
  shipping: number;
  /** Marketplace + payment fees on the eventual sale. */
  sellerFeePct: number;
}

export interface ScenarioOutcome {
  label: string;
  salePrice: number;
  netProceeds: number;
  profit: number;
  /** Return on total outlay, or null when outlay is zero. */
  roi: number | null;
}

export function totalOutlay(a: GradingAssumptions): number {
  return Math.max(0, a.acquisition) + Math.max(0, a.gradingFee) + Math.max(0, a.shipping);
}

export function netAfterFees(salePrice: number, sellerFeePct: number): number {
  const pct = Math.min(Math.max(sellerFeePct, 0), 0.95);
  return Math.max(0, salePrice) * (1 - pct);
}

/** Sale price at which grading-and-selling returns exactly the outlay. */
export function breakEvenSalePrice(a: GradingAssumptions): number {
  const pct = Math.min(Math.max(a.sellerFeePct, 0), 0.95);
  return totalOutlay(a) / (1 - pct);
}

export function scenario(label: string, salePrice: number, a: GradingAssumptions): ScenarioOutcome {
  const outlay = totalOutlay(a);
  const netProceeds = netAfterFees(salePrice, a.sellerFeePct);
  const profit = netProceeds - outlay;
  return { label, salePrice, netProceeds, profit, roi: outlay > 0 ? profit / outlay : null };
}

/**
 * Selling raw instead: no grading fee or grader shipping, same seller fees.
 * This is the baseline a grading decision has to beat.
 */
export function rawBaseline(rawSale: number, a: GradingAssumptions): ScenarioOutcome {
  return scenario('Sell raw', rawSale, { ...a, gradingFee: 0, shipping: 0 });
}

/**
 * Expected value across grade outcomes, only when the caller supplies
 * probabilities that sum to ~1. Returns null otherwise — we never fill in
 * probabilities ourselves.
 */
export function expectedProfit(
  outcomes: Array<{ probability: number; outcome: ScenarioOutcome }>
): number | null {
  const total = outcomes.reduce((s, o) => s + o.probability, 0);
  if (outcomes.length === 0 || Math.abs(total - 1) > 0.02) return null;
  return outcomes.reduce((s, o) => s + o.probability * o.outcome.profit, 0);
}
