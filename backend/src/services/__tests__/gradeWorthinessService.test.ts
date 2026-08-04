import { describe, expect, it } from 'vitest';
import { estimatePsaGradingFee, scoreCard } from '../gradeWorthinessService';

describe('PSA grading fee estimate', () => {
  it('uses Regular (~$80) as the floor while Value tiers are paused', () => {
    const low = estimatePsaGradingFee(80);
    expect(low.tier).toBe('Regular');
    expect(low.baseFee).toBe(79.99);
    expect(low.fee).toBe(79.99);
  });

  it('adds insurance above $499 declared', () => {
    const mid = estimatePsaGradingFee(1000);
    expect(mid.tier).toBe('Regular');
    expect(mid.insurance).toBeCloseTo((1000 - 499) * 0.02, 2);
    expect(mid.fee).toBeCloseTo(79.99 + mid.insurance, 2);
  });

  it('steps up tiers for higher declared values', () => {
    expect(estimatePsaGradingFee(2000).tier).toBe('Express');
    expect(estimatePsaGradingFee(4000).tier).toBe('Super Express');
    expect(estimatePsaGradingFee(8000).tier).toBe('Walk-Through');
  });

  it('makes a $5 raw / $80 PSA 10 submission unprofitable after fees', () => {
    const fee = estimatePsaGradingFee(80).fee;
    const net = 80 - 5 - fee;
    expect(net).toBeLessThan(0);
  });
});

describe('grade worthiness scoring', () => {
  it('ranks high-net-ROI easy-gem above high-net-ROI hard-gem', () => {
    const easy = scoreCard({ netRoiPct: 200, gemRatePct: 40, psa10Pop: 2000 });
    const hard = scoreCard({ netRoiPct: 200, gemRatePct: 3, psa10Pop: 40 });
    expect(easy.score).toBeGreaterThan(hard.score);
    expect(easy.gemEaseScore).toBeGreaterThan(hard.gemEaseScore);
  });

  it('ranks fat after-fee ROI above thin ROI at same gem rate', () => {
    const fat = scoreCard({ netRoiPct: 300, gemRatePct: 20, psa10Pop: 500 });
    const thin = scoreCard({ netRoiPct: 40, gemRatePct: 20, psa10Pop: 500 });
    expect(fat.score).toBeGreaterThan(thin.score);
    expect(fat.upliftScore).toBeGreaterThan(thin.upliftScore);
  });

  it('does not pin every high-ROI card at 100', () => {
    const a = scoreCard({ netRoiPct: 400, gemRatePct: 30, psa10Pop: 1000 });
    const b = scoreCard({ netRoiPct: 800, gemRatePct: 30, psa10Pop: 1000 });
    expect(b.score).toBeGreaterThan(a.score);
    expect(a.score).toBeLessThan(100);
  });
});
