/**
 * PSA direct trading-card fee estimate.
 * Keep in sync with backend `estimatePsaGradingFee` (Value tiers treated as paused).
 */
export const PSA_REGULAR_FLOOR = 79.99;

export function estimatePsaGradingFee(declaredValue: number): {
  fee: number;
  baseFee: number;
  insurance: number;
  tier: string;
} {
  const v = Math.max(0, Number(declaredValue) || 0);
  let baseFee: number;
  let tier: string;
  if (v <= 1499) {
    baseFee = PSA_REGULAR_FLOOR;
    tier = 'Regular';
  } else if (v <= 2999) {
    baseFee = 149;
    tier = 'Express';
  } else if (v <= 4999) {
    baseFee = 299;
    tier = 'Super Express';
  } else {
    baseFee = 599;
    tier = 'Walk-Through';
  }
  const insurance = v > 499 ? (v - 499) * 0.02 : 0;
  return {
    fee: Math.round((baseFee + insurance) * 100) / 100,
    baseFee,
    insurance: Math.round(insurance * 100) / 100,
    tier,
  };
}
