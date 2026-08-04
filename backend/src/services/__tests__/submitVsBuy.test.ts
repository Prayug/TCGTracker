import { describe, expect, it } from 'vitest';
import { estimatePsaGradingFee } from '../gradeWorthinessService';

/**
 * Mirrors submit-vs-buy EV math used in slabInsightsService (unit-level, no DB).
 */
function submitVsBuyEV(input: {
  raw: number;
  psa10: number;
  psa9: number;
  gemRatePct: number;
}) {
  const fee = estimatePsaGradingFee(input.psa10).fee;
  const buyCost = input.psa10;
  const submitCost = input.raw + fee;
  const pGem = input.gemRatePct / 100;
  const submitExpectedValue = pGem * input.psa10 + (1 - pGem) * input.psa9;
  const submitEV = submitExpectedValue - submitCost;
  const expectedCostPerGem = pGem > 0.02 ? submitCost / pGem : null;
  return { fee, buyCost, submitCost, submitEV, expectedCostPerGem };
}

describe('submit vs buy economics', () => {
  it('favors submit when gem rate is high and premium is fat', () => {
    const r = submitVsBuyEV({ raw: 50, psa10: 350, psa9: 120, gemRatePct: 55 });
    expect(r.submitEV).toBeGreaterThan(0);
    expect(r.expectedCostPerGem!).toBeLessThan(r.buyCost);
  });

  it('makes cheap raw / modest PSA 10 unattractive after Regular floor fee', () => {
    const r = submitVsBuyEV({ raw: 8, psa10: 70, psa9: 25, gemRatePct: 20 });
    expect(r.submitEV).toBeLessThan(0);
    expect(r.fee).toBeGreaterThanOrEqual(79.99);
  });
});
